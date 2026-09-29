use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::fd::{AsRawFd, FromRawFd, IntoRawFd, OwnedFd};
use std::os::unix::ffi::OsStringExt;
use std::thread;
use std::time::Duration;

use nix::errno::Errno;
use nix::pty::openpty;
use nix::sys::signal::{kill, Signal};
use nix::sys::wait::{waitpid, WaitPidFlag};
use nix::unistd::{dup2, execv, fork, read, setsid, ForkResult, Pid};
use serde::Deserialize;

const INDEX: &str = include_str!("../assets/index.html");
const XTERM_JS: &[u8] = include_bytes!("../assets/xterm.js");
const XTERM_CSS: &[u8] = include_bytes!("../assets/xterm.css");
const FIT_JS: &[u8] = include_bytes!("../assets/addon-fit.js");
const IMAGE_JS: &[u8] = include_bytes!("../assets/addon-image.js");

pub fn serve() -> std::io::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:7681")?;
    eprintln!("nlc-web listening on 0.0.0.0:7681");
    for conn in listener.incoming() {
        let stream = conn?;
        thread::spawn(move || {
            if let Err(err) = handle(stream) {
                eprintln!("nlc-web: {err}");
            }
        });
    }
    Ok(())
}

fn handle(mut stream: TcpStream) -> Result<(), String> {
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut peek = [0u8; 4096];
    let n = stream.peek(&mut peek).map_err(|e| e.to_string())?;
    let head = String::from_utf8_lossy(&peek[..n]).to_ascii_lowercase();
    if head.contains("upgrade: websocket") {
        let mut ws = tungstenite::accept(stream).map_err(|e| e.to_string())?;
        return attach_tui(&mut ws);
    }
    let req = read_headers(&mut stream)?;
    let path = request_path(&req);
    if path == "/media" {
        let id = query_param(&request_target(&req), "id").unwrap_or_default();
        let range = header_value(&req, "range");
        return proxy_media(&mut stream, &id, range.as_deref());
    }
    let (ctype, body) = match path.as_str() {
        "/" | "/index.html" => ("text/html; charset=utf-8", INDEX.as_bytes()),
        "/xterm.js" => ("text/javascript; charset=utf-8", XTERM_JS),
        "/xterm.css" => ("text/css; charset=utf-8", XTERM_CSS),
        "/addon-fit.js" => ("text/javascript; charset=utf-8", FIT_JS),
        "/addon-image.js" => ("text/javascript; charset=utf-8", IMAGE_JS),
        _ => {
            let msg = b"not found";
            write_raw(&mut stream, 404, "text/plain", msg)?;
            return Ok(());
        }
    };
    write_raw(&mut stream, 200, ctype, body)
}

fn request_target(req: &str) -> String {
    let line = req.lines().next().unwrap_or("");
    line.split_whitespace().nth(1).unwrap_or("/").to_string()
}

fn request_path(req: &str) -> String {
    request_target(req)
        .split('?')
        .next()
        .unwrap_or("/")
        .to_string()
}

fn query_param(target: &str, name: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name {
            return urlencoding::decode(value).ok().map(|s| s.into_owned());
        }
    }
    None
}

fn header_value(req: &str, name: &str) -> Option<String> {
    req.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name).then(|| value.trim().to_string())
    })
}

fn proxy_media(client: &mut TcpStream, id: &str, range: Option<&str>) -> Result<(), String> {
    if id.is_empty() {
        return write_raw(client, 400, "text/plain", b"missing id");
    }
    let host = std::env::var("NLC_BRIDGE_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("NLC_BRIDGE_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(7421);
    let token = std::env::var("NLC_BRIDGE_TOKEN").unwrap_or_default();
    let mut upstream = TcpStream::connect((host.as_str(), port)).map_err(|e| e.to_string())?;
    let mut req = format!(
        "GET /v1/stream?id={} HTTP/1.1\r\nHost: {host}:{port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n",
        urlencoding::encode(id)
    );
    if let Some(range) = range {
        req.push_str(&format!("Range: {range}\r\n"));
    }
    req.push_str("\r\n");
    upstream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    std::io::copy(&mut upstream, client).map_err(|e| e.to_string())?;
    Ok(())
}

fn read_headers(stream: &mut TcpStream) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    loop {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 16_384 {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

fn write_raw(stream: &mut TcpStream, status: u16, ctype: &str, body: &[u8]) -> Result<(), String> {
    let reason = if status == 200 { "OK" } else { "Not Found" };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(body).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
struct Resize {
    cols: Option<u16>,
    rows: Option<u16>,
    media: Option<MediaState>,
}

#[derive(Deserialize)]
struct MediaState {
    id: String,
    pos: f64,
    dur: f64,
    paused: bool,
    ended: bool,
}

struct PtyChild {
    master: OwnedFd,
    child: Pid,
}

impl Drop for PtyChild {
    fn drop(&mut self) {
        let _ = kill(self.child, Signal::SIGHUP);
        let _ = waitpid(self.child, Some(WaitPidFlag::WNOHANG));
    }
}

fn attach_tui(ws: &mut tungstenite::WebSocket<TcpStream>) -> Result<(), String> {
    let (pty, media_file) = spawn_tui_pty()?;
    let _ = ws.get_ref().set_nonblocking(true);
    let mut buf = [0u8; 8192];
    let mut pending = Vec::new();
    loop {
        match read(pty.master.as_raw_fd(), &mut buf) {
            Ok(0) => break,
            Ok(n) => {
                pending.extend_from_slice(&buf[..n]);
                let (term_bytes, cmds, keep) = split_media_osc(&pending);
                pending = keep;
                if !term_bytes.is_empty() {
                    ws.send(tungstenite::Message::Binary(term_bytes.into()))
                        .map_err(|e| e.to_string())?;
                }
                for cmd in cmds {
                    ws.send(tungstenite::Message::Text(cmd.into()))
                        .map_err(|e| e.to_string())?;
                }
            }
            Err(Errno::EAGAIN) => {}
            Err(err) => return Err(err.to_string()),
        }
        match ws.read() {
            Ok(tungstenite::Message::Binary(data)) => {
                let _ = write_all_fd(pty.master.as_raw_fd(), &data);
            }
            Ok(tungstenite::Message::Text(text)) => {
                if let Ok(msg) = serde_json::from_str::<Resize>(&text) {
                    if let Some(media) = msg.media {
                        let _ = std::fs::write(
                            &media_file,
                            serde_json::json!({
                                "id": media.id,
                                "pos": media.pos,
                                "dur": media.dur,
                                "paused": media.paused,
                                "ended": media.ended,
                            })
                            .to_string(),
                        );
                    } else if msg.cols.unwrap_or(0) >= 2 && msg.rows.unwrap_or(0) >= 1 {
                        resize_pty(pty.master.as_raw_fd(), msg.cols.unwrap_or(0), msg.rows.unwrap_or(0));
                    }
                } else {
                    let _ = write_all_fd(pty.master.as_raw_fd(), text.as_bytes());
                }
            }
            Ok(tungstenite::Message::Close(_)) => break,
            Ok(tungstenite::Message::Ping(_)) | Ok(tungstenite::Message::Pong(_)) => {}
            Ok(_) => {}
            Err(tungstenite::Error::Io(err)) if err.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break,
        }
        thread::sleep(Duration::from_millis(8));
    }
    Ok(())
}

fn write_all_fd(fd: i32, mut data: &[u8]) -> Result<(), Errno> {
    while !data.is_empty() {
        let n = unsafe { libc::write(fd, data.as_ptr() as *const libc::c_void, data.len()) };
        if n > 0 {
            data = &data[n as usize..];
            continue;
        }
        if n == 0 {
            return Err(Errno::EIO);
        }
        let err = Errno::last();
        if err == Errno::EAGAIN {
            thread::sleep(Duration::from_millis(2));
            continue;
        }
        return Err(err);
    }
    Ok(())
}

fn resize_pty(fd: i32, cols: u16, rows: u16) {
    let size = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    unsafe {
        libc::ioctl(fd, libc::TIOCSWINSZ, &size);
    }
}

fn split_media_osc(input: &[u8]) -> (Vec<u8>, Vec<String>, Vec<u8>) {
    let marker = b"\x1b]777;";
    let mut term = Vec::new();
    let mut cmds = Vec::new();
    let mut i = 0;
    while i < input.len() {
        if input[i] == 0x1b {
            let rest = &input[i..];
            if rest.len() < marker.len() {
                return (term, cmds, rest.to_vec());
            }
            if rest.starts_with(marker) {
                if let Some(rel) = rest[marker.len()..].iter().position(|byte| *byte == 0x07) {
                    let json = String::from_utf8_lossy(&rest[marker.len()..marker.len() + rel]).into_owned();
                    cmds.push(json);
                    i += marker.len() + rel + 1;
                    continue;
                }
                return (term, cmds, rest.to_vec());
            }
        }
        term.push(input[i]);
        i += 1;
    }
    (term, cmds, Vec::new())
}

fn spawn_tui_pty() -> Result<(PtyChild, std::path::PathBuf), String> {
    let pair = openpty(None, None).map_err(|e| e.to_string())?;
    let master_fd = pair.master.into_raw_fd();
    let slave_fd = pair.slave.into_raw_fd();
    let exe = std::ffi::CString::new(
        std::env::current_exe()
            .map_err(|e| e.to_string())?
            .into_os_string()
            .into_vec(),
    )
    .map_err(|e| e.to_string())?;
    let media_file = std::env::temp_dir().join(format!(
        "nlc-media-{}-{}.json",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let _ = std::fs::write(&media_file, b"{}");
    let media_arg = std::ffi::CString::new(format!("--media-file={}", media_file.display()))
        .map_err(|e| e.to_string())?;
    let child = match unsafe { fork() }.map_err(|e| e.to_string())? {
        ForkResult::Child => {
            unsafe { libc::close(master_fd) };
            let _ = setsid();
            let _ = dup2(slave_fd, 0);
            let _ = dup2(slave_fd, 1);
            let _ = dup2(slave_fd, 2);
            if slave_fd > 2 {
                unsafe { libc::close(slave_fd) };
            }
            unsafe { libc::ioctl(0, libc::TIOCSCTTY, 0) };
            let _ = execv(&exe, &[&exe, &media_arg]);
            unsafe { libc::_exit(127) };
        }
        ForkResult::Parent { child } => child,
    };
    unsafe { libc::close(slave_fd) };
    let flags = unsafe { libc::fcntl(master_fd, libc::F_GETFL) };
    if flags >= 0 {
        unsafe { libc::fcntl(master_fd, libc::F_SETFL, flags | libc::O_NONBLOCK) };
    }
    Ok((
        PtyChild {
            master: unsafe { OwnedFd::from_raw_fd(master_fd) },
            child,
        },
        media_file,
    ))
}
