use std::io::Cursor;
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;

use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::session::Session;

pub struct PairOffer {
    pub token: Arc<RwLock<String>>,
    pub port: u16,
    pub ip: String,
    pub url: String,
    pub last_host: Arc<RwLock<Option<String>>>,
}

pub struct PairWait {
    pub session: Receiver<Session>,
    pub session_tx: Sender<Session>,
    pub status: Receiver<String>,
    pub unlink: Receiver<()>,
    pub stop: Arc<AtomicBool>,
    #[allow(dead_code)]
    pub last_host: Arc<RwLock<Option<String>>>,
}

const PHONE_BRIDGE_PORT: u16 = 7421;

pub fn listen_for_pair(offer: PairOffer) -> Result<PairWait, String> {
    let server = Server::http(("0.0.0.0", offer.port)).map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let (status_tx, status_rx) = mpsc::channel();
    let (unlink_tx, unlink_rx) = mpsc::channel();
    let token = offer.token.clone();
    let lan_ip = offer.ip.clone();
    let last_host = offer.last_host.clone();
    let _ = offer.url;
    let claimed = Arc::new(AtomicBool::new(false));

    let http_tx = tx.clone();
    let http_token = token.clone();
    let http_claimed = claimed.clone();
    let http_status = status_tx.clone();
    let http_unlink = unlink_tx.clone();
    let http_last_host = last_host.clone();
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let current_token = http_token.read().map(|t| t.clone()).unwrap_or_default();
            let auth = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.as_str().to_string())
                .unwrap_or_default();
            let expected = format!("Bearer {current_token}");

            if *request.method() == Method::Post && request.url().starts_with("/unlink") {
                if !auth.trim().is_empty() && auth.trim() != expected {
                    let _ = request.respond(Response::from_string("unauthorized").with_status_code(StatusCode(401)));
                    continue;
                }
                let payload = serde_json::json!({ "ok": true }).to_string();
                let cursor = Cursor::new(payload.clone().into_bytes());
                let response = Response::new(
                    StatusCode(200),
                    vec![Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()],
                    cursor,
                    Some(payload.len()),
                    None,
                );
                let _ = request.respond(response);
                http_claimed.store(true, Ordering::SeqCst);
                let _ = http_unlink.send(());
                let _ = http_status.send("Unlink requested by phone. Ready to pair again.".to_string());
                continue;
            }

            let ok_method = *request.method() == Method::Post && request.url().starts_with("/pair");
            if !ok_method || auth.trim() != expected {
                let _ = request.respond(Response::from_string("unauthorized").with_status_code(StatusCode(401)));
                continue;
            }
            let mut body = String::new();
            if request.as_reader().read_to_string(&mut body).is_err() {
                let _ = request.respond(Response::from_string("bad body").with_status_code(StatusCode(400)));
                continue;
            }
            let parsed: serde_json::Value = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(_) => {
                    let _ = request.respond(Response::from_string("json").with_status_code(StatusCode(400)));
                    continue;
                }
            };
            let phone_host = parsed
                .get("phoneLanIp")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let bridge_port = parsed
                .get("bridgePort")
                .and_then(|v| v.as_u64())
                .unwrap_or(PHONE_BRIDGE_PORT as u64) as u16;
            let device_id = parsed
                .get("deviceId")
                .and_then(|v| v.as_str())
                .unwrap_or("phone")
                .to_string();
            if phone_host.is_empty() || phone_host == "0.0.0.0" {
                let _ = request.respond(
                    Response::from_string(r#"{"error":"no_lan_ip"}"#).with_status_code(StatusCode(400)),
                );
                continue;
            }
            let _ = http_status.send(format!(
                "QR/Settings pair from {phone_host}:{bridge_port} ({device_id}). Accepting…"
            ));
            if let Ok(mut lock) = http_last_host.write() {
                *lock = Some(phone_host.clone());
            }
            let session = Session {
                token: current_token,
                phone_host,
                bridge_port,
                device_id,
            };
            let payload = serde_json::json!({ "ok": true }).to_string();
            let cursor = Cursor::new(payload.clone().into_bytes());
            let response = Response::new(
                StatusCode(200),
                vec![Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()],
                cursor,
                Some(payload.len()),
                None,
            );
            let _ = request.respond(response);
            http_claimed.store(true, Ordering::SeqCst);
            let _ = http_tx.send(session);
        }
    });

    let scan_claimed = claimed.clone();
    let scan_token = token.clone();
    let scan_last_host = last_host.clone();
    let scan_tx = tx.clone();
    thread::spawn(move || {
        let prefix = subnet_prefix(&lan_ip).unwrap_or_else(|| lan_ip.clone());
        let _ = status_tx.send(format!("Listening for QR on 0.0.0.0:7420. Scanning {prefix}.0/24…"));
        let mut last_seen_host = String::new();
        loop {
            if scan_claimed.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(500));
                continue;
            }
            let cur_token = scan_token.read().map(|t| t.clone()).unwrap_or_default();
            let cur_host = scan_last_host.read().ok().and_then(|h| h.clone());
            match try_link(&lan_ip, &cur_token, cur_host.as_deref()) {
                ScanHit::Linked(session) => {
                    let _ = status_tx.send(format!("Linked to {}:{}. Pausing LAN scan.", session.phone_host, session.bridge_port));
                    scan_claimed.store(true, Ordering::SeqCst);
                    if let Ok(mut lock) = scan_last_host.write() {
                        *lock = Some(session.phone_host.clone());
                    }
                    let _ = scan_tx.send(session);
                }
                ScanHit::Seen(host) => {
                    if host != last_seen_host {
                        let _ = status_tx.send(format!(
                            "Phone at {host}:7421 open. Scanning QR or tap 'Puente TUI' in app."
                        ));
                        last_seen_host = host;
                    }
                }
                ScanHit::None => {}
            }
            thread::sleep(Duration::from_millis(1_400));
        }
    });

    Ok(PairWait {
        session: rx,
        session_tx: tx,
        status: status_rx,
        unlink: unlink_rx,
        stop: claimed,
        last_host,
    })
}

fn subnet_prefix(lan_ip: &str) -> Option<String> {
    let parts: Vec<&str> = lan_ip.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    Some(format!("{}.{}.{}", parts[0], parts[1], parts[2]))
}

fn subnet_hosts(lan_ip: &str) -> Vec<String> {
    let Some(prefix) = subnet_prefix(lan_ip) else {
        return Vec::new();
    };
    let parts: Vec<&str> = lan_ip.split('.').collect();
    let self_oct: u8 = parts.get(3).and_then(|p| p.parse().ok()).unwrap_or(0);
    (1u8..=254)
        .filter(|&octet| octet != self_oct)
        .map(|octet| format!("{prefix}.{octet}"))
        .collect()
}

fn tcp_open(host: &str, port: u16, wait_ms: u64) -> bool {
    let Ok(ip) = host.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    let addr = SocketAddr::from((ip, port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(wait_ms)).is_ok()
}

fn discover_nlc(host: &str, port: u16) -> bool {
    if !tcp_open(host, port, 80) {
        return false;
    }
    let url = format!("http://{host}:{port}/v1/discover");
    match ureq::get(&url).timeout(Duration::from_millis(500)).call() {
        Ok(res) if (200..300).contains(&res.status()) => {
            res.into_string().ok().is_some_and(|body| body.contains("nlc"))
        }
        _ => false,
    }
}

fn claim_phone(host: &str, port: u16, token: &str, desktop: &str) -> bool {
    let url = format!("http://{host}:{port}/v1/claim");
    let body = serde_json::json!({ "token": token, "desktopHost": desktop }).to_string();
    match ureq::post(&url)
        .set("Content-Type", "application/json")
        .timeout(Duration::from_secs(8))
        .send_string(&body)
    {
        Ok(res) if (200..300).contains(&res.status()) => true,
        _ => false,
    }
}

fn probe_phone(host: &str, port: u16, token: &str) -> bool {
    if !tcp_open(host, port, 80) {
        return false;
    }
    for path in ["/v1/hello", "/v1/ping"] {
        let url = format!("http://{host}:{port}{path}");
        match ureq::get(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .timeout(Duration::from_secs(3))
            .call()
        {
            Ok(res) if (200..300).contains(&res.status()) => return true,
            _ => {}
        }
    }
    false
}

enum ScanHit {
    Linked(Session),
    Seen(String),
    None,
}

fn try_link(lan_ip: &str, token: &str, last_host: Option<&str>) -> ScanHit {
    if let Some(host) = last_host {
        if tcp_open(host, PHONE_BRIDGE_PORT, 200) {
            if let Some(session) = link_host(host, token, lan_ip) {
                return ScanHit::Linked(session);
            }
            return ScanHit::Seen(host.to_string());
        }
    }
    scan_subnet(lan_ip, token)
}

pub fn link_host(host: &str, token: &str, desktop: &str) -> Option<Session> {
    if claim_phone(host, PHONE_BRIDGE_PORT, token, desktop) {
        return Some(Session {
            token: token.to_string(),
            phone_host: host.to_string(),
            bridge_port: PHONE_BRIDGE_PORT,
            device_id: "phone".into(),
        });
    }
    if probe_phone(host, PHONE_BRIDGE_PORT, token) {
        return Some(Session {
            token: token.to_string(),
            phone_host: host.to_string(),
            bridge_port: PHONE_BRIDGE_PORT,
            device_id: "phone".into(),
        });
    }
    None
}

fn scan_subnet(lan_ip: &str, token: &str) -> ScanHit {
    let hosts = subnet_hosts(lan_ip);
    let mut seen = None;
    for chunk in hosts.chunks(48) {
        let hit = std::sync::Mutex::new(None::<String>);
        let open = std::sync::Mutex::new(None::<String>);
        thread::scope(|scope| {
            for host in chunk {
                scope.spawn(|| {
                    if discover_nlc(host, PHONE_BRIDGE_PORT) {
                        *hit.lock().unwrap() = Some(host.clone());
                    } else if tcp_open(host, PHONE_BRIDGE_PORT, 80) {
                        *open.lock().unwrap() = Some(host.clone());
                    }
                });
            }
        });
        if let Some(phone_host) = hit.into_inner().ok().flatten() {
            if let Some(session) = link_host(&phone_host, token, lan_ip) {
                return ScanHit::Linked(session);
            }
            seen = Some(phone_host);
        } else if seen.is_none() {
            seen = open.into_inner().ok().flatten();
        }
    }
    match seen {
        Some(host) => ScanHit::Seen(host),
        None => ScanHit::None,
    }
}

#[cfg(test)]
mod tests {
    use super::subnet_hosts;

    #[test]
    fn subnet_skips_self() {
        let hosts = subnet_hosts("192.168.1.66");
        assert_eq!(hosts.len(), 253);
        assert!(!hosts.iter().any(|h| h == "192.168.1.66"));
        assert!(hosts.contains(&"192.168.1.45".into()));
    }

    #[test]
    fn unlink_post_triggers_unlink_channel() {
        let token = std::sync::Arc::new(std::sync::RwLock::new("test_token_123".to_string()));
        let wait = super::listen_for_pair(super::PairOffer {
            token: token.clone(),
            port: 17425,
            ip: "127.0.0.1".into(),
            url: "http://127.0.0.1:17425/pair?token=test_token_123".into(),
            last_host: std::sync::Arc::new(std::sync::RwLock::new(None)),
        }).expect("listen");

        let bad_res = ureq::post("http://127.0.0.1:17425/unlink")
            .set("Authorization", "Bearer wrong_token")
            .call();
        assert!(bad_res.is_err());

        let ok_res = ureq::post("http://127.0.0.1:17425/unlink")
            .set("Authorization", "Bearer test_token_123")
            .call()
            .expect("unlink call");
        assert_eq!(ok_res.status(), 200);

        assert!(wait.unlink.recv_timeout(std::time::Duration::from_millis(500)).is_ok());
        assert!(wait.stop.load(std::sync::atomic::Ordering::SeqCst));
    }
}
