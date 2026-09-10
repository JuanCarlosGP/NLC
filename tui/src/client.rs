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
        ureq::get(&format!("{}{path}", self.base))
            .set("Authorization", &format!("Bearer {}", self.token))
            .timeout(timeout)
            .call()
            .map_err(|e| e.to_string())
    }

    fn get(&self, path: &str) -> Result<ureq::Response, String> {
        self.get_with_timeout(path, std::time::Duration::from_secs(25))
    }

    pub fn hello(&self) -> Result<(), String> {
        let res = self.get_with_timeout("/v1/hello", std::time::Duration::from_millis(400))?;
        if res.status() >= 300 {
            return Err(format!("hello {}", res.status()));
        }
        Ok(())
    }

    pub fn bye(&self) {
        let _ = self.get_with_timeout("/v1/bye", std::time::Duration::from_secs(3));
    }

    pub fn ping(&self) -> Result<(), String> {
        let res = self.get("/v1/ping")?;
        if res.status() >= 300 {
            return Err(format!("ping {}", res.status()));
        }
        Ok(())
    }

    pub fn albums(&self) -> Result<Vec<Album>, String> {
        let body: AlbumsBody = self.get("/v1/albums")?.into_json().map_err(|e| e.to_string())?;
        Ok(body.albums)
    }

    pub fn album(&self, id: &str) -> Result<AlbumDetail, String> {
        let path = format!("/v1/album?id={}", urlencoding::encode(id));
        let body: AlbumBody = self.get(&path)?.into_json().map_err(|e| e.to_string())?;
        Ok(body.album)
    }

    pub fn search(&self, q: &str) -> Result<SearchBody, String> {
        let path = format!("/v1/search?q={}", urlencoding::encode(q));
        self.get(&path)?.into_json().map_err(|e| e.to_string())
    }
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
                let body = if request.url().starts_with("/v1/ping") {
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
        client.ping().unwrap();
        let albums = client.albums().unwrap();
        assert_eq!(albums[0].name, "In Rainbows");
        assert!(client.stream_url("/Music/x.mp3").contains("id="));
    }
}

