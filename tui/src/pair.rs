use std::io::Cursor;
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::session::Session;

pub struct PairOffer {
    pub token: String,
    pub port: u16,
    pub ip: String,
    pub url: String,
    pub last_host: Option<String>,
}

pub struct PairWait {
    pub session: Receiver<Session>,
    pub status: Receiver<String>,
}

const PHONE_BRIDGE_PORT: u16 = 7421;

pub fn listen_for_pair(offer: PairOffer) -> Result<PairWait, String> {
    let server = Server::http(("0.0.0.0", offer.port)).map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let (status_tx, status_rx) = mpsc::channel();
    let token = offer.token.clone();
    let lan_ip = offer.ip.clone();
    let last_host = offer.last_host.clone();
    let _ = offer.url;
    let claimed = Arc::new(AtomicBool::new(false));

    let http_tx = tx.clone();
    let http_token = token.clone();
    let http_claimed = claimed.clone();
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            if http_claimed.load(Ordering::SeqCst) {
                break;
            }
            eprintln!(
                "nlc-tui pair {} {} from {:?}",
                request.method(),
                request.url(),
                request.remote_addr()
            );
            let ok_method = *request.method() == Method::Post && request.url().starts_with("/pair");
            let auth = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.as_str().to_string())
                .unwrap_or_default();
            let expected = format!("Bearer {http_token}");
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
            let session = Session {
                token: http_token.clone(),
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
            if http_claimed.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                let _ = http_tx.send(session);
            }
            thread::sleep(Duration::from_millis(50));
            break;
        }
    });

    thread::spawn(move || {
        let prefix = subnet_prefix(&lan_ip).unwrap_or_else(|| lan_ip.clone());
        let _ = status_tx.send(format!("Looking for NLC on {prefix}.0/24…"));
        let mut last_note = String::new();
        loop {
            if claimed.load(Ordering::SeqCst) {
                break;
            }
            match try_link(&lan_ip, &token, last_host.as_deref()) {
                ScanHit::Linked(session) => {
                    let _ = status_tx.send(format!("Found NLC at {}", session.phone_host));
                    eprintln!("nlc-tui pair found phone at {}:{}", session.phone_host, session.bridge_port);
                    if claimed.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                        let _ = tx.send(session);
                    }
                    break;
                }
                ScanHit::Seen(host) => {
                    let note = format!("Found a phone at {host}. Keep NLC open, or scan the QR.");
                    if note != last_note {
                        let _ = status_tx.send(note.clone());
                        last_note = note;
                    }
                }
                ScanHit::None => {}
            }
            thread::sleep(Duration::from_millis(800));
        }
    });

    Ok(PairWait {
        session: rx,
        status: status_rx,
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
        .timeout(Duration::from_secs(2))
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
            .timeout(Duration::from_millis(1_200))
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
        if let Some(session) = link_host(host, token, lan_ip) {
            return ScanHit::Linked(session);
        }
        if tcp_open(host, PHONE_BRIDGE_PORT, 80) {
            return ScanHit::Seen(host.to_string());
        }
    }
    scan_subnet(lan_ip, token)
}

fn link_host(host: &str, token: &str, desktop: &str) -> Option<Session> {
    if claim_phone(host, PHONE_BRIDGE_PORT, token, desktop) || probe_phone(host, PHONE_BRIDGE_PORT, token) {
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
}
