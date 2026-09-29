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
    pub fn spawn(
        url: &str,
        auth_header: &str,
        volume: u8,
        video: bool,
        title: Option<&str>,
    ) -> Result<Self, String> {
        let sock = std::env::temp_dir().join(format!("nlc-tui-mpv-{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&sock);
        let mut cmd = Command::new("mpv");
        cmd.args([
            "--really-quiet",
            "--idle=no",
            &format!("--volume={volume}"),
            &format!("--input-ipc-server={}", sock.display()),
            &format!("--http-header-fields={auth_header}"),
        ]);

        let has_display =
            std::env::var_os("DISPLAY").is_some() || std::env::var_os("WAYLAND_DISPLAY").is_some();
        if video && has_display {
            let win_title = title
                .map(|t| format!("NLC: {t}"))
                .unwrap_or_else(|| "NLC Video".into());
            cmd.args([
                "--force-window=immediate",
                "--autofit=60%x60%",
                &format!("--title={win_title}"),
            ]);
        } else {
            cmd.args(["--no-video", "--force-window=no"]);
        }

        cmd.arg(url);

        let child = cmd
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

pub enum Playback {
    Mpv(MpvSession),
    Phone(PhonePlayer),
    Web(WebPlayer),
}

/// Playback inside the browser. The phone only supplies the stream.
pub struct WebPlayer {
    id: String,
    file: PathBuf,
}

impl WebPlayer {
    pub fn start(
        client: &crate::client::BridgeClient,
        track_id: &str,
        title: &str,
        volume: u8,
        video: bool,
    ) -> Result<Self, String> {
        let _ = client.device("op=stop");
        let file = PathBuf::from(std::env::var("NLC_MEDIA_FILE").unwrap_or_default());
        if file.as_os_str().is_empty() {
            return Err("browser player is unavailable".into());
        }
        let player = Self {
            id: track_id.to_string(),
            file,
        };
        player.write_state(0.0, 0.0, false, false);
        emit_web(&json!({
            "op": "play",
            "id": track_id,
            "title": title,
            "volume": volume,
            "video": video,
        }));
        Ok(player)
    }

    pub fn set_volume(&self, volume: u8) {
        emit_web(&json!({ "op": "volume", "v": volume }));
    }

    pub fn set_pause(&self, paused: bool) {
        emit_web(&json!({ "op": "pause", "paused": paused }));
    }

    pub fn stop(&self) {
        emit_web(&json!({ "op": "stop" }));
    }

    fn state(&self) -> (f64, f64, bool) {
        let raw = std::fs::read_to_string(&self.file).unwrap_or_default();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or(json!({}));
        if value.get("id").and_then(|v| v.as_str()) != Some(self.id.as_str()) {
            return (0.0, 0.0, false);
        }
        let pos = value.get("pos").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let dur = value.get("dur").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ended = value.get("ended").and_then(|v| v.as_bool()).unwrap_or(false);
        (pos, dur, ended)
    }

    fn write_state(&self, pos: f64, dur: f64, paused: bool, ended: bool) {
        let body = json!({
            "id": self.id,
            "pos": pos,
            "dur": dur,
            "paused": paused,
            "ended": ended,
        });
        let _ = std::fs::write(&self.file, body.to_string());
    }
}

fn emit_web(command: &serde_json::Value) {
    print!("\u{1b}]777;{command}\u{7}");
    let _ = std::io::stdout().flush();
}

pub struct PhonePlayer {
    client: crate::client::BridgeClient,
    ended: bool,
    last_pos: f64,
    last_dur: f64,
    last_at: std::time::Instant,
}

impl PhonePlayer {
    pub fn start(client: crate::client::BridgeClient, track_id: &str, volume: u8) -> Result<Self, String> {
        let query = format!(
            "op=play&id={}&volume={volume}",
            urlencoding::encode(track_id)
        );
        let body = client.device(&query)?;
        if body.get("ok").and_then(|v| v.as_bool()) != Some(true) {
            let err = body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("phone player");
            return Err(err.to_string());
        }
        Ok(Self {
            client,
            ended: false,
            last_pos: 0.0,
            last_dur: 0.0,
            last_at: std::time::Instant::now() - Duration::from_secs(5),
        })
    }

    fn refresh(&mut self) {
        if self.last_at.elapsed() < Duration::from_millis(250) {
            return;
        }
        self.last_at = std::time::Instant::now();
        let Ok(body) = self.client.device("op=status") else {
            return;
        };
        self.last_pos = body.get("pos").and_then(|v| v.as_f64()).unwrap_or(0.0);
        self.last_dur = body.get("dur").and_then(|v| v.as_f64()).unwrap_or(0.0);
        self.ended = body.get("ended").and_then(|v| v.as_bool()).unwrap_or(false);
    }
}

impl Playback {
    pub fn start(
        client: &crate::client::BridgeClient,
        track_id: &str,
        title: &str,
        volume: u8,
        video: bool,
        stream_url: &str,
        auth_header: &str,
    ) -> Result<Self, String> {
        if std::env::var("NLC_WEB").ok().as_deref() == Some("1") {
            return WebPlayer::start(client, track_id, title, volume, video).map(Self::Web);
        }
        if std::env::var("NLC_ON_PHONE").ok().as_deref() == Some("1") {
            return PhonePlayer::start(client.clone(), track_id, volume).map(Self::Phone);
        }
        MpvSession::spawn(stream_url, auth_header, volume, video, Some(title)).map(Self::Mpv)
    }

    pub fn set_volume(&self, volume: u8) {
        match self {
            Self::Mpv(player) => player.set_volume(volume),
            Self::Phone(player) => {
                let _ = player.client.device(&format!("op=volume&v={volume}"));
            }
            Self::Web(player) => player.set_volume(volume),
        }
    }

    pub fn set_pause(&self, paused: bool) {
        match self {
            Self::Mpv(player) => player.set_pause(paused),
            Self::Phone(player) => {
                let flag = if paused { "1" } else { "0" };
                let _ = player.client.device(&format!("op=pause&paused={flag}"));
            }
            Self::Web(player) => player.set_pause(paused),
        }
    }

    pub fn percent(&mut self) -> Option<f64> {
        match self {
            Self::Mpv(player) => player.percent(),
            Self::Phone(player) => {
                player.refresh();
                if player.last_dur <= 0.0 {
                    return None;
                }
                Some((player.last_pos / player.last_dur) * 100.0)
            }
            Self::Web(player) => {
                let (pos, dur, _) = player.state();
                if dur <= 0.0 {
                    return None;
                }
                Some((pos / dur) * 100.0)
            }
        }
    }

    pub fn playback_times(&mut self) -> Option<(f64, f64)> {
        match self {
            Self::Mpv(player) => player.playback_times(),
            Self::Phone(player) => {
                player.refresh();
                Some((player.last_pos, player.last_dur))
            }
            Self::Web(player) => {
                let (pos, dur, _) = player.state();
                Some((pos, dur))
            }
        }
    }

    pub fn try_wait(&mut self) -> Result<Option<std::process::ExitStatus>, std::io::Error> {
        match self {
            Self::Mpv(player) => player.try_wait(),
            Self::Phone(player) => {
                player.refresh();
                if !player.ended {
                    return Ok(None);
                }
                Ok(Some(std::os::unix::process::ExitStatusExt::from_raw(0)))
            }
            Self::Web(player) => {
                let (_, _, ended) = player.state();
                if !ended {
                    return Ok(None);
                }
                Ok(Some(std::os::unix::process::ExitStatusExt::from_raw(0)))
            }
        }
    }

    pub fn stop(&mut self) {
        match self {
            Self::Mpv(player) => player.stop(),
            Self::Phone(player) => {
                let _ = player.client.device("op=stop");
            }
            Self::Web(player) => player.stop(),
        }
    }
}

pub fn is_video_file(path_or_id_or_title: &str) -> bool {
    let lower = path_or_id_or_title.to_lowercase();
    if lower.starts_with("video:") {
        return true;
    }
    const VIDEO_EXTS: &[&str] = &[
        ".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".flv", ".wmv", ".ts", ".m2ts",
    ];
    VIDEO_EXTS.iter().any(|ext| lower.ends_with(ext))
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

    #[test]
    fn detects_video_files() {
        assert!(super::is_video_file("video:/volume1/video/movie.mkv"));
        assert!(super::is_video_file("episode_01.mp4"));
        assert!(super::is_video_file("video:custom-identifier"));
        assert!(super::is_video_file("show.S01E02.WEBRip.mkv"));
        assert!(!super::is_video_file("song.mp3"));
        assert!(!super::is_video_file("track.flac"));
        assert!(!super::is_video_file("podcast.m4a"));
    }
}
