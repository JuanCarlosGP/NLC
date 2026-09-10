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
        self.prop_f64("percent-pos")
    }

    pub fn playback_times(&self) -> Option<(f64, f64)> {
        let pos = self.prop_f64("time-pos").or_else(|| self.prop_f64("playback-time"))?;
        let dur = self.prop_f64("duration").unwrap_or(0.0);
        Some((pos, dur))
    }

    fn prop_f64(&self, name: &str) -> Option<f64> {
        let reply = self.cmd(json!(["get_property", name]))?;
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

pub fn format_track_time(ms: u64) -> String {
    if ms == 0 {
        "—".into()
    } else {
        format_ms(ms)
    }
}

pub fn probe_stream_duration(url: &str, auth_header: &str) -> Option<u64> {
    probe_ffprobe(url, auth_header)
        .and_then(|raw| parse_seconds(&raw))
        .or_else(|| probe_mpv(url, auth_header).and_then(|raw| parse_seconds(&raw)))
}

fn parse_seconds(raw: &str) -> Option<u64> {
    let line = raw.lines().find_map(|line| {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        line.split(|c: char| c.is_whitespace() || c == ',')
            .find_map(|part| part.parse::<f64>().ok().filter(|n| *n > 0.0 && *n < 86_400.0))
    })?;
    Some((line * 1000.0).round() as u64)
}

fn run_limited(mut cmd: Command, wait_ms: u64) -> Option<String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = cmd.spawn().ok()?;
    let slices = (wait_ms / 50).max(1);
    for _ in 0..slices {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                return None;
            }
        }
    }
    let _ = child.kill();
    let out = child.wait_with_output().ok()?;
    String::from_utf8(out.stdout).ok()
}

fn probe_ffprobe(url: &str, auth_header: &str) -> Option<String> {
    let mut cmd = Command::new("ffprobe");
    cmd.args([
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        "-headers",
        &format!("{auth_header}\r\n"),
        url,
    ]);
    run_limited(cmd, 8_000)
}

fn probe_mpv(url: &str, auth_header: &str) -> Option<String> {
    let mut cmd = Command::new("mpv");
    cmd.args([
        "--no-config",
        "--vo=null",
        "--ao=null",
        "--quiet",
        "--no-audio-display",
        "--frames=1",
        "--term-playing-msg=${=duration}",
        &format!("--http-header-fields={auth_header}"),
        url,
    ]);
    run_limited(cmd, 8_000)
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
        assert_eq!(super::format_track_time(0), "—");
        assert_eq!(super::format_track_time(125_000), "2:05");
        assert_eq!(super::parse_seconds("245.0\n"), Some(245_000));
        assert_eq!(super::parse_seconds("0\n"), None);
    }
}
