use std::io::Cursor;
use std::sync::mpsc::{self, Receiver};
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

pub fn listen_for_pair(offer: PairOffer) -> Result<Receiver<Session>, String> {
    let server = Server::http(("0.0.0.0", offer.port)).map_err(|e| e.to_string())?;
    let (tx, rx) = mpsc::channel();
    let token = offer.token.clone();
    let _ = (offer.ip, offer.url);
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let ok_method = *request.method() == Method::Post && request.url().starts_with("/pair");
            let auth = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.as_str().to_string())
                .unwrap_or_default();
            let expected = format!("Bearer {token}");
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
                .unwrap_or(7421) as u16;
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
                token: token.clone(),
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
            let _ = tx.send(session);
            thread::sleep(Duration::from_millis(50));
            break;
        }
    });
    Ok(rx)
}
