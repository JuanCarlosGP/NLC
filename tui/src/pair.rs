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
}

const PHONE_BRIDGE_PORT: u16 = 7421;

pub fn listen_for_pair(offer: PairOffer) -> Result<Receiver<Session>, String> {
    let server = Server::http(("0.0.0.0", offer.port)).map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let token = offer.token.clone();
    let lan_ip = offer.ip.clone();
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
        loop {
            if claimed.load(Ordering::SeqCst) {
                break;
            }
            if let Some(session) = scan_subnet(&lan_ip, &token) {
                eprintln!("nlc-tui pair found phone at {}:{}", session.phone_host, session.bridge_port);
                if claimed.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                    let _ = tx.send(session);
                }
                break;
            }
            thread::sleep(Duration::from_millis(400));
        }
    });

    Ok(rx)
}

fn subnet_hosts(lan_ip: &str) -> Vec<String> {
    let parts: Vec<&str> = lan_ip.split('.').collect();
    if parts.len() != 4 {
        return Vec::new();
    }
    let prefix = format!("{}.{}.{}", parts[0], parts[1], parts[2]);
    let self_oct: u8 = parts[3].parse().unwrap_or(0);
    (1u8..=254)
        .filter(|&octet| octet != self_oct)
        .map(|octet| format!("{prefix}.{octet}"))
        .collect()
}

fn probe_phone(host: &str, port: u16, token: &str) -> bool {
    let Ok(ip) = host.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    let addr = SocketAddr::from((ip, port));
    if TcpStream::connect_timeout(&addr, Duration::from_millis(180)).is_err() {
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

fn scan_subnet(lan_ip: &str, token: &str) -> Option<Session> {
    let hosts = subnet_hosts(lan_ip);
    for chunk in hosts.chunks(48) {
        let hit = std::sync::Mutex::new(None::<String>);
        thread::scope(|scope| {
            for host in chunk {
                scope.spawn(|| {
                    if probe_phone(host, PHONE_BRIDGE_PORT, token) {
                        *hit.lock().unwrap() = Some(host.clone());
                    }
                });
            }
        });
        if let Some(phone_host) = hit.into_inner().ok().flatten() {
            return Some(Session {
                token: token.to_string(),
                phone_host,
                bridge_port: PHONE_BRIDGE_PORT,
                device_id: "phone".into(),
            });
        }
    }
    None
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
