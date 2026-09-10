use serde::Deserialize;

use crate::session::Session;

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct Artist {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub name: String,
    pub artist_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub album_name: String,
    pub artist_name: String,
    #[serde(default)]
    pub duration_ms: u64,
    /// Seconds, when the bridge sends `duration` instead of `durationMs`.
    #[serde(default)]
    duration: Option<f64>,
}

impl Track {
    pub fn normalize(&mut self) {
        if self.duration_ms > 0 {
            return;
        }
        let Some(raw) = self.duration else {
            return;
        };
        if raw <= 0.0 {
            return;
        }
        self.duration_ms = if raw >= 10_000.0 {
            raw.round() as u64
        } else {
            (raw * 1000.0).round() as u64
        };
    }
}

#[derive(Debug, Deserialize)]
struct AlbumsBody {
    albums: Vec<Album>,
}

#[derive(Debug, Deserialize)]
struct AlbumBody {
    album: AlbumDetail,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AlbumDetail {
    pub id: String,
    pub name: String,
    pub artist_name: String,
    #[serde(default)]
    pub tracks: Vec<Track>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SearchBody {
    #[serde(default)]
    pub artists: Vec<Artist>,
    #[serde(default)]
    pub albums: Vec<Album>,
    #[serde(default)]
    pub tracks: Vec<Track>,
}

#[derive(Clone)]
pub struct BridgeClient {
    base: String,
    token: String,
}

impl BridgeClient {
    pub fn new(session: &Session) -> Self {
        Self {
            base: format!("http://{}:{}", session.phone_host, session.bridge_port),
            token: session.token.clone(),
        }
    }

    pub fn stream_url(&self, track_id: &str) -> String {
        format!(
            "{}/v1/stream?id={}",
            self.base,
            urlencoding::encode(track_id)
        )
    }

    pub fn auth_header(&self) -> String {
        format!("Authorization: Bearer {}", self.token)
    }

    fn get_with_timeout(&self, path: &str, timeout: std::time::Duration) -> Result<ureq::Response, String> {
        let res = ureq::get(&format!("{}{path}", self.base))
            .set("Authorization", &format!("Bearer {}", self.token))
            .timeout(timeout)
            .call()
            .map_err(|e| explain_bridge_err(&e.to_string()))?;
        if res.status() == 504 || res.status() >= 500 {
            return Err(explain_bridge_err("timeout"));
        }
        if res.status() >= 400 {
            return Err(format!("phone HTTP {}", res.status()));
        }
        Ok(res)
    }

    fn get(&self, path: &str) -> Result<ureq::Response, String> {
        let timeout = if path.starts_with("/v1/album") {
            std::time::Duration::from_secs(60)
        } else {
            std::time::Duration::from_secs(45)
        };
        match self.get_with_timeout(path, timeout) {
            Ok(res) => Ok(res),
            Err(err) if is_reset(&err) || err.to_ascii_lowercase().contains("time") => {
                self.get_with_timeout(path, timeout)
            }
            Err(err) => Err(err),
        }
    }

    pub fn hello(&self) -> Result<(), String> {
        let res = self.get_with_timeout("/v1/hello", std::time::Duration::from_secs(2))?;
        if res.status() >= 300 {
            return Err(format!("hello {}", res.status()));
        }
        Ok(())
    }

    pub fn bye(&self) {
        let _ = self.get_with_timeout("/v1/bye", std::time::Duration::from_secs(3));
    }

    pub fn albums(&self) -> Result<Vec<Album>, String> {
        let body: AlbumsBody = self.get("/v1/albums")?.into_json().map_err(|e| explain_bridge_err(&e.to_string()))?;
        Ok(body.albums)
    }

    pub fn playlists(&self) -> Result<Vec<Album>, String> {
        let body: AlbumsBody = self.get("/v1/playlists")?.into_json().map_err(|e| explain_bridge_err(&e.to_string()))?;
        Ok(body.albums)
    }

    pub fn tracks(&self) -> Result<Vec<Track>, String> {
        let mut body: SearchBody = self.get("/v1/tracks")?.into_json().map_err(|e| explain_bridge_err(&e.to_string()))?;
        for track in &mut body.tracks {
            track.normalize();
        }
        Ok(body.tracks)
    }

    pub fn album(&self, id: &str) -> Result<AlbumDetail, String> {
        let path = format!("/v1/album?id={}", urlencoding::encode(id));
        let mut body: AlbumBody = self.get(&path)?.into_json().map_err(|e| explain_bridge_err(&e.to_string()))?;
        for track in &mut body.album.tracks {
            track.normalize();
        }
        Ok(body.album)
    }

    pub fn search(&self, q: &str) -> Result<SearchBody, String> {
        let path = format!("/v1/search?q={}", urlencoding::encode(q));
        let mut body: SearchBody = self.get(&path)?.into_json().map_err(|e| explain_bridge_err(&e.to_string()))?;
        for track in &mut body.tracks {
            track.normalize();
        }
        Ok(body)
    }
}

fn is_reset(err: &str) -> bool {
    let err = err.to_ascii_lowercase();
    err.contains("os error 104")
        || err.contains("connection reset")
        || err.contains("broken pipe")
        || err.contains("os error 32")
        || err.contains("phone closed the link")
}

fn explain_bridge_err(err: &str) -> String {
    let lower = err.to_ascii_lowercase();
    if is_reset(err) {
        return "Phone closed the link (unlinked or NLC went away). Open NLC and press r.".into();
    }
    if lower.contains("connection refused") || lower.contains("os error 111") {
        return "No NLC bridge on the phone. Open NLC on this Wi-Fi.".into();
    }
    if lower.contains("js_timeout") || lower.contains("504") {
        return "NLC is busy. Keep the app open on the phone and try again.".into();
    }
    if lower.contains("timed out") || lower.contains("timeout") {
        return "The phone did not answer in time. Keep NLC open in the foreground.".into();
    }
    err.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;
    use std::thread;
    use tiny_http::{Header, Response, Server, StatusCode};

    #[test]
    fn client_lists_albums_from_bridge() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        thread::spawn(move || {
            for request in server.incoming_requests() {
                let body = if request.url().starts_with("/v1/hello") {
                    r#"{"ok":true}"#.to_string()
                } else {
                    r#"{"albums":[{"id":"a1","name":"In Rainbows","artistName":"Radiohead"}]}"#.to_string()
                };
                let len = body.len();
                let _ = request.respond(Response::new(
                    StatusCode(200),
                    vec![Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()],
                    std::io::Cursor::new(body.into_bytes()),
                    Some(len),
                    None,
                ));
            }
        });
        let client = BridgeClient::new(&Session {
            token: "t".into(),
            phone_host: "127.0.0.1".into(),
            bridge_port: port,
            device_id: "d".into(),
        });
        client.hello().unwrap();
        let albums = client.albums().unwrap();
        assert_eq!(albums[0].name, "In Rainbows");
        assert!(client.stream_url("/Music/x.mp3").contains("id="));
    }

    #[test]
    fn reset_errors_are_readable() {
        let msg = explain_bridge_err(
            "http://192.168.1.8:7421/v1/ping: Connection reset by peer (os error 104)",
        );
        assert!(!msg.contains("104"));
        assert!(msg.to_ascii_lowercase().contains("phone"));
    }

    #[test]
    fn track_reads_duration_ms_and_seconds() {
        let ms: Track = serde_json::from_str(
            r#"{"id":"1","title":"A","albumName":"B","artistName":"C","durationMs":185000}"#,
        )
        .unwrap();
        assert_eq!(ms.duration_ms, 185_000);

        let mut secs: Track = serde_json::from_str(
            r#"{"id":"1","title":"A","albumName":"B","artistName":"C","duration":245}"#,
        )
        .unwrap();
        secs.normalize();
        assert_eq!(secs.duration_ms, 245_000);
    }
}

