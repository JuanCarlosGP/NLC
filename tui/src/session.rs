use std::collections::HashMap;
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

fn durations_path() -> Option<PathBuf> {
    let mut dir = dirs::config_dir()?;
    dir.push("nlc-tui");
    Some(dir.join("durations.json"))
}

pub fn load_durations() -> HashMap<String, u64> {
    let Some(path) = durations_path() else {
        return HashMap::new();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_durations(map: &HashMap<String, u64>) -> Result<(), String> {
    let path = durations_path().ok_or_else(|| "no config dir".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_string(map).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn remember_duration(id: &str, ms: u64) {
    if ms == 0 {
        return;
    }
    let mut map = load_durations();
    if map.get(id) == Some(&ms) {
        return;
    }
    map.insert(id.to_string(), ms);
    let _ = save_durations(&map);
}

pub fn apply_cached_durations(tracks: &mut [crate::client::Track]) {
    let cache = load_durations();
    if cache.is_empty() {
        return;
    }
    for track in tracks {
        if track.duration_ms == 0 {
            if let Some(&ms) = cache.get(&track.id) {
                track.duration_ms = ms;
            }
        }
    }
}

pub fn pair_url(ip: &str, port: u16, token: &str) -> String {
    format!("nlc://{ip}:{port}/pair?token={token}")
}
