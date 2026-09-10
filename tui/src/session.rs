use std::fs;
use std::path::PathBuf;

use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub phone_host: String,
    pub bridge_port: u16,
    pub device_id: String,
}

fn session_path() -> Option<PathBuf> {
    let mut dir = dirs::config_dir()?;
    dir.push("nlc-tui");
    Some(dir.join("session.json"))
}

pub fn load_session() -> Option<Session> {
    let path = session_path()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn save_session(session: &Session) -> Result<(), String> {
    let path = session_path().ok_or_else(|| "no config dir".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_string_pretty(session).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn clear_session() {
    if let Some(path) = session_path() {
        let _ = fs::remove_file(path);
    }
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn lan_ip() -> String {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok();
    if let Some(socket) = socket {
        if socket.connect("1.1.1.1:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".into()
}

pub fn pair_url(ip: &str, port: u16, token: &str) -> String {
    format!("nlc://{ip}:{port}/pair?token={token}")
}
