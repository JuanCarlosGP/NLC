use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

use serde_json::json;

pub struct MpvSession {
    child: Child,
    sock: PathBuf,
}

impl MpvSession {
    pub fn spawn(url: &str, auth_header: &str, volume: u8) -> Result<Self, String> {
        let sock = std::env::temp_dir().join(format!("nlc-tui-mpv-{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&sock);
        let child = Command::new("mpv")
            .args([
                "--no-video",
                "--really-quiet",
                "--force-window=no",
                "--idle=no",
                &format!("--volume={volume}"),
                &format!("--input-ipc-server={}", sock.display()),
                &format!("--http-header-fields={auth_header}"),
                url,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    "mpv is not installed".into()
                } else {
                    e.to_string()
                }
            })?;
        for _ in 0..40 {
            if sock.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(25));
        }
        Ok(Self { child, sock })
    }

    pub fn set_volume(&self, volume: u8) {
        let _ = self.cmd(json!(["set_property", "volume", volume]));
    }

    pub fn set_pause(&self, paused: bool) {
        let _ = self.cmd(json!(["set_property", "pause", paused]));
    }

    pub fn percent(&self) -> Option<f64> {
        let reply = self.cmd(json!(["get_property", "percent-pos"]))?;
        reply.get("data").and_then(|v| v.as_f64())
    }

    pub fn try_wait(&mut self) -> Result<Option<std::process::ExitStatus>, std::io::Error> {
        self.child.try_wait()
    }

    pub fn stop(&mut self) {
        let _ = self.cmd(json!(["quit"]));
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.sock);
    }

    fn cmd(&self, command: serde_json::Value) -> Option<serde_json::Value> {
        let mut stream = UnixStream::connect(&self.sock).ok()?;
        let _ = stream.set_read_timeout(Some(Duration::from_millis(120)));
        let _ = stream.set_write_timeout(Some(Duration::from_millis(120)));
        let payload = json!({ "command": command });
        stream.write_all(format!("{payload}\n").as_bytes()).ok()?;
        stream.flush().ok()?;
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).ok()?;
        serde_json::from_str(&line).ok()
    }
}

impl Drop for MpvSession {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn clamp_volume(volume: i32) -> u8 {
    volume.clamp(0, 100) as u8
}

pub fn format_ms(ms: u64) -> String {
    let total = ms / 1000;
    format!("{}:{:02}", total / 60, total % 60)
}

#[cfg(test)]
mod tests {
    use super::{clamp_volume, format_ms};

    #[test]
    fn volume_stays_in_range() {
        assert_eq!(clamp_volume(-4), 0);
        assert_eq!(clamp_volume(40), 40);
        assert_eq!(clamp_volume(140), 100);
    }

    #[test]
    fn duration_is_mm_ss() {
        assert_eq!(format_ms(0), "0:00");
        assert_eq!(format_ms(125_000), "2:05");
    }
}
