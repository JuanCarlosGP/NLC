use std::collections::HashSet;
use std::io::{self, stdout};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::thread;
use std::time::{Duration, Instant};

use crossterm::event::{
    self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers,
    MouseEvent, MouseEventKind,
};
use crossterm::execute;
use qrcode::QrCode;
use qrcode::render::unicode::Dense1x2;
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Position, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Cell, Clear, Gauge, List, ListItem, ListState, Padding, Paragraph, Row, Table, TableState, Wrap};
use ratatui::{DefaultTerminal, Frame};

use crate::client::{Album, BridgeClient, Track};
use crate::library::{is_podcast_track, is_imported_playlist};
use crate::pair::{listen_for_pair, PairOffer};
use crate::player::{clamp_volume, format_ms, format_track_time, probe_stream_duration, MpvSession};
use crate::session::{
    apply_cached_durations, lan_ip, load_session, pair_url, random_token, remember_duration, save_session, Session,
};
use crate::theme;

const PAIR_PORT: u16 = 7420;
const VOLUME_STEP: i32 = 5;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Pair,
    Library,
    Tracks,
    Search,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Focus {
    Playlists,
    Tracks,
}

struct App {
    screen: Screen,
    status: String,
    error: Option<String>,
    qr: String,
    pair_url: String,
    session: Option<Session>,
    client: Option<BridgeClient>,
    albums: Vec<Album>,
    loose_tracks: Vec<Track>,
    tracks: Vec<Track>,
    focus: Focus,
    search_input: String,
    searching: bool,
    help: bool,
    list: ListState,
    table: TableState,
    queue: Vec<Track>,
    queue_index: usize,
    player: Option<MpvSession>,
    now_playing: Option<Track>,
    volume: u8,
    muted: Option<u8>,
    paused: bool,
    progress: f64,
    play_pos_ms: u64,
    play_dur_ms: u64,
    context: String,
    hit_playlists: Rect,
    hit_tracks: Rect,
    hit_list: Rect,
    hit_playback: Rect,
    duration_tx: Option<Sender<(String, u64)>>,
    probe_ids: HashSet<String>,
    pair_log: Vec<String>,
    pair_pc: String,
    pair_started: Instant,
}

impl App {
    fn new() -> Self {
        let token = random_token();
        let ip = lan_ip();
        let url = pair_url(&ip, PAIR_PORT, &token);
        let qr = render_qr(&url);
        Self {
            screen: Screen::Pair,
            status: "Looking for NLC on this Wi-Fi…".into(),
            error: None,
            qr,
            pair_url: url,
            session: None,
            client: None,
            albums: Vec::new(),
            loose_tracks: Vec::new(),
            tracks: Vec::new(),
            focus: Focus::Playlists,
            search_input: String::new(),
            searching: false,
            help: false,
            list: ListState::default().with_selected(Some(0)),
            table: TableState::default().with_selected(Some(0)),
            queue: Vec::new(),
            queue_index: 0,
            player: None,
            now_playing: None,
            volume: 70,
            muted: None,
            paused: false,
            progress: 0.0,
            play_pos_ms: 0,
            play_dur_ms: 0,
            context: "Library".into(),
            hit_playlists: Rect::default(),
            hit_tracks: Rect::default(),
            hit_list: Rect::default(),
            hit_playback: Rect::default(),
            duration_tx: None,
            probe_ids: HashSet::new(),
            pair_log: Vec::new(),
            pair_pc: ip,
            pair_started: Instant::now(),
        }
    }

    fn select_zero(&mut self) {
        match self.screen {
            Screen::Library => {
                self.list.select(if self.albums.is_empty() { None } else { Some(0) });
                self.table.select(if self.loose_tracks.is_empty() { None } else { Some(0) });
            }
            Screen::Tracks | Screen::Search => {
                self.table.select(if self.tracks.is_empty() { None } else { Some(0) });
            }
            Screen::Pair => {}
        }
    }

    fn len(&self) -> usize {
        match self.screen {
            Screen::Pair => 0,
            Screen::Library => match self.focus {
                Focus::Playlists => self.albums.len(),
                Focus::Tracks => self.loose_tracks.len(),
            },
            Screen::Tracks | Screen::Search => self.tracks.len(),
        }
    }

    fn move_sel(&mut self, delta: i32) {
        let len = self.len();
        if len == 0 {
            if self.screen == Screen::Library && self.focus == Focus::Playlists {
                self.list.select(None);
            } else {
                self.table.select(None);
            }
            return;
        }
        let cur = if self.screen == Screen::Library && self.focus == Focus::Playlists {
            self.list.selected().unwrap_or(0)
        } else {
            self.table.selected().unwrap_or(0)
        } as i32;
        let next = (cur + delta).clamp(0, len as i32 - 1) as usize;
        if self.screen == Screen::Library && self.focus == Focus::Playlists {
            self.list.select(Some(next));
        } else {
            self.table.select(Some(next));
        }
    }

    fn jump_sel(&mut self, index: usize) {
        let len = self.len();
        if len == 0 {
            return;
        }
        let next = index.min(len - 1);
        if self.screen == Screen::Library && self.focus == Focus::Playlists {
            self.list.select(Some(next));
        } else {
            self.table.select(Some(next));
        }
    }

    fn toggle_focus(&mut self) {
        if self.screen != Screen::Library {
            return;
        }
        self.focus = match self.focus {
            Focus::Playlists => Focus::Tracks,
            Focus::Tracks => Focus::Playlists,
        };
        self.status = match self.focus {
            Focus::Playlists => format!("{} playlists", self.albums.len()),
            Focus::Tracks => format!("{} tracks", self.loose_tracks.len()),
        };
    }

    fn push_pair_note(&mut self, note: impl Into<String>) {
        let note = note.into();
        self.status = note.clone();
        if self.pair_log.last() == Some(&note) {
            return;
        }
        self.pair_log.push(note);
        if self.pair_log.len() > 16 {
            self.pair_log.remove(0);
        }
    }

    fn stop_player(&mut self) {
        if let Some(mut player) = self.player.take() {
            player.stop();
        }
        self.now_playing = None;
        self.paused = false;
        self.progress = 0.0;
        self.play_pos_ms = 0;
        self.play_dur_ms = 0;
    }

    fn play_current_queue(&mut self) {
        self.stop_player();
        let Some(client) = self.client.as_ref() else { return };
        let Some(track) = self.queue.get(self.queue_index).cloned() else { return };
        match MpvSession::spawn(&client.stream_url(&track.id), &client.auth_header(), self.volume) {
            Ok(player) => {
                self.status = format!("Playing  {}", track.title);
                self.error = None;
                self.paused = false;
                self.progress = 0.0;
                self.play_pos_ms = 0;
                self.play_dur_ms = track.duration_ms;
                self.now_playing = Some(track);
                self.player = Some(player);
            }
            Err(err) => self.error = Some(err),
        }
    }

    fn play_from_tracks(&mut self, start: usize) {
        self.queue = self.tracks.clone();
        self.queue_index = start.min(self.queue.len().saturating_sub(1));
        self.play_current_queue();
    }

    fn toggle_pause(&mut self) {
        let Some(player) = self.player.as_ref() else { return };
        self.paused = !self.paused;
        player.set_pause(self.paused);
        self.status = if self.paused { "Paused".into() } else { "Playing".into() };
    }

    fn bump_volume(&mut self, delta: i32) {
        self.muted = None;
        self.volume = clamp_volume(self.volume as i32 + delta);
        if let Some(player) = self.player.as_ref() {
            player.set_volume(self.volume);
        }
    }

    fn toggle_mute(&mut self) {
        if let Some(prev) = self.muted.take() {
            self.volume = prev;
        } else {
            self.muted = Some(self.volume);
            self.volume = 0;
        }
        if let Some(player) = self.player.as_ref() {
            player.set_volume(self.volume);
        }
    }

    fn stamp_duration(&mut self, id: &str, ms: u64) {
        if ms == 0 {
            return;
        }
        let mut learned = false;
        if let Some(track) = self.now_playing.as_mut() {
            if track.id == id {
                if track.duration_ms == 0 {
                    learned = true;
                }
                track.duration_ms = track.duration_ms.max(ms);
            }
        }
        for track in self
            .loose_tracks
            .iter_mut()
            .chain(self.tracks.iter_mut())
            .chain(self.queue.iter_mut())
        {
            if track.id == id {
                if track.duration_ms == 0 {
                    learned = true;
                }
                track.duration_ms = track.duration_ms.max(ms);
            }
        }
        if learned {
            remember_duration(id, ms);
        }
    }

    fn kick_duration_probe(&mut self) {
        let Some(tx) = self.duration_tx.clone() else { return };
        let Some(client) = self.client.clone() else { return };
        let mut batch = Vec::new();
        for track in self.loose_tracks.iter().chain(self.tracks.iter()) {
            if track.duration_ms == 0 && self.probe_ids.insert(track.id.clone()) {
                batch.push(track.clone());
            }
        }
        if batch.is_empty() {
            return;
        }
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(4));
            let mut cache = crate::session::load_durations();
            for track in batch {
                if let Some(&ms) = cache.get(&track.id) {
                    let _ = tx.send((track.id, ms));
                    continue;
                }
                thread::sleep(Duration::from_millis(1_200));
                let Some(ms) = probe_stream_duration(&client.stream_url(&track.id), &client.auth_header()) else {
                    continue;
                };
                cache.insert(track.id.clone(), ms);
                if tx.send((track.id, ms)).is_err() {
                    break;
                }
            }
            let _ = crate::session::save_durations(&cache);
        });
    }

    fn poll_progress(&mut self) {
        let Some(player) = self.player.as_ref() else { return };
        if let Some((pos, dur)) = player.playback_times() {
            self.play_pos_ms = (pos * 1000.0).max(0.0) as u64;
            if dur > 0.0 {
                self.play_dur_ms = (dur * 1000.0) as u64;
                self.progress = (pos / dur).clamp(0.0, 1.0);
                if let Some(id) = self.now_playing.as_ref().map(|track| track.id.clone()) {
                    self.stamp_duration(&id, self.play_dur_ms);
                }
            } else if let Some(pct) = player.percent() {
                self.progress = (pct / 100.0).clamp(0.0, 1.0);
            }
        } else if !self.paused {
            if let Some(pct) = player.percent() {
                self.progress = (pct / 100.0).clamp(0.0, 1.0);
            }
        }
    }

    fn apply_library(&mut self, listed: Vec<Album>, mut loose_tracks: Vec<Track>) {
        apply_cached_durations(&mut loose_tracks);
        self.status = format!("{} playlists  ·  {} tracks", listed.len(), loose_tracks.len());
        self.albums = listed;
        self.loose_tracks = loose_tracks;
        self.focus = if self.albums.is_empty() {
            Focus::Tracks
        } else {
            Focus::Playlists
        };
        self.screen = Screen::Library;
        self.context = "Library".into();
        self.select_zero();
        self.kick_duration_probe();
    }

    fn load_library(&mut self) -> Result<(), String> {
        let client = self.client.clone().ok_or("no client")?;
        let (listed, loose_tracks) = fetch_library(&client)?;
        self.apply_library(listed, loose_tracks);
        Ok(())
    }

    fn open_album(&mut self, album: Album) {
        let Some(client) = self.client.as_ref() else { return };
        match client.album(&album.id) {
            Ok(mut detail) => {
                apply_cached_durations(&mut detail.tracks);
                self.tracks = detail.tracks;
                self.screen = Screen::Tracks;
                self.context = format!("{}  ·  {}", detail.artist_name, detail.name);
                self.select_zero();
                self.status = detail.name;
                self.kick_duration_probe();
            }
            Err(err) => self.error = Some(err),
        }
    }

    fn open_selected(&mut self) {
        match self.screen {
            Screen::Pair => {}
            Screen::Library => match self.focus {
                Focus::Playlists => {
                    let Some(idx) = self.list.selected() else { return };
                    let Some(album) = self.albums.get(idx).cloned() else { return };
                    self.open_album(album);
                }
                Focus::Tracks => {
                    let Some(idx) = self.table.selected() else { return };
                    self.tracks = self.loose_tracks.clone();
                    self.play_from_tracks(idx);
                }
            },
            Screen::Tracks | Screen::Search => {
                let Some(idx) = self.table.selected().or(self.list.selected()) else { return };
                self.play_from_tracks(idx);
            }
        }
    }

    fn back(&mut self) {
        match self.screen {
            Screen::Pair | Screen::Library => {}
            Screen::Tracks | Screen::Search => {
                self.searching = false;
                self.screen = Screen::Library;
                self.context = "Library".into();
                self.select_zero();
            }
        }
    }
}

impl Drop for App {
    fn drop(&mut self) {
        self.stop_player();
    }
}

fn render_qr(url: &str) -> String {
    match QrCode::new(url.as_bytes()) {
        Ok(code) => code.render::<Dense1x2>().quiet_zone(false).build(),
        Err(err) => err.to_string(),
    }
}

pub fn run() -> io::Result<()> {
    let mut terminal = ratatui::init();
    let _ = execute!(stdout(), EnableMouseCapture);
    let keys = spawn_input();
    let result = run_app(&mut terminal, &keys);
    drop(keys);
    let _ = execute!(stdout(), DisableMouseCapture);
    ratatui::restore();
    result
}

fn spawn_input() -> Receiver<Event> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        while let Ok(ev) = event::read() {
            if tx.send(ev).is_err() {
                break;
            }
        }
    });
    rx
}

fn fetch_library(client: &BridgeClient) -> Result<(Vec<Album>, Vec<Track>), String> {
    let albums = client.albums().unwrap_or_default();
    let listed = match client.playlists() {
        Ok(playlists) => playlists,
        Err(_) => albums
            .iter()
            .filter(|album| is_imported_playlist(album))
            .cloned()
            .collect(),
    };
    let mut tracks = client.tracks().unwrap_or_default();
    if tracks.is_empty() {
        for album in albums.iter().filter(|album| {
            !crate::library::is_podcast_album(album) && !is_imported_playlist(album)
        }) {
            if let Ok(mut detail) = client.album(&album.id) {
                apply_cached_durations(&mut detail.tracks);
                tracks.extend(detail.tracks);
            }
        }
    }
    tracks.retain(|track| !is_podcast_track(track));
    apply_cached_durations(&mut tracks);
    Ok((listed, tracks))
}

fn spawn_hello(session: Session) -> Receiver<Result<Session, String>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let client = BridgeClient::new(&session);
        let result = if client.hello().is_ok() {
            Ok(session)
        } else {
            Err("unreachable".into())
        };
        let _ = tx.send(result);
    });
    rx
}

fn spawn_library(client: BridgeClient) -> Receiver<Result<(Vec<Album>, Vec<Track>), String>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut last = "library".to_string();
        for attempt in 0..4 {
            match fetch_library(&client) {
                Ok(data) => {
                    let _ = tx.send(Ok(data));
                    return;
                }
                Err(err) => {
                    last = err;
                    if attempt + 1 < 4 {
                        thread::sleep(Duration::from_secs(2));
                    }
                }
            }
        }
        let _ = tx.send(Err(last));
    });
    rx
}

fn run_app(terminal: &mut DefaultTerminal, keys: &Receiver<Event>) -> io::Result<()> {
    let mut app = App::new();
    terminal.draw(|frame| draw(frame, &mut app))?;

    let mut pair_rx = None;
    let mut pair_status = None;
    let mut pair_stop = None;
    let mut hello_rx = None;
    let mut library_rx = None;
    let (duration_tx, duration_rx) = mpsc::channel();
    app.duration_tx = Some(duration_tx);
    let mut last_key: Option<(KeyCode, KeyModifiers, Instant)> = None;
    let mut last_hello = Instant::now() - Duration::from_secs(4);
    let saved = load_session();

    if let Some(session) = saved.clone() {
        app.push_pair_note(format!(
            "Saved link: {}:{}. Saying hello…",
            session.phone_host, session.bridge_port
        ));
        hello_rx = Some(spawn_hello(session));
    } else {
        app.push_pair_note("No saved phone. Scanning this Wi-Fi and waiting for a QR.");
    }

    let token = saved
        .as_ref()
        .map(|session| session.token.clone())
        .unwrap_or_else(random_token);
    let ip = lan_ip();
    let url = pair_url(&ip, PAIR_PORT, &token);
    app.qr = render_qr(&url);
    app.pair_url = url.clone();
    app.pair_pc = ip.clone();
    app.push_pair_note(format!("This PC is {ip}. Pair port {PAIR_PORT}. Phone bridge 7421."));
    match listen_for_pair(PairOffer {
        token,
        port: PAIR_PORT,
        ip,
        url,
        last_host: saved.as_ref().map(|session| session.phone_host.clone()),
    }) {
            Ok(wait) => {
                pair_rx = Some(wait.session);
                pair_status = Some(wait.status);
                pair_stop = Some(wait.stop);
                app.push_pair_note("LAN scan started. NLC must stay open on the phone.");
            }
            Err(err) => {
                app.error = Some(err.clone());
                app.push_pair_note(format!("Could not listen on :{PAIR_PORT}: {err}"));
            }
    }

    'main: loop {
        while let Ok(ev) = keys.try_recv() {
            if handle_event(&mut app, ev, &mut last_key) {
                break 'main;
            }
        }
        while let Ok((id, ms)) = duration_rx.try_recv() {
            app.stamp_duration(&id, ms);
        }

        if let Some(rx) = hello_rx.as_ref() {
            match rx.try_recv() {
                Ok(Ok(session)) => {
                    hello_rx = None;
                    if app.client.is_none() {
                        if let Err(err) = save_session(&session) {
                            app.error = Some(err);
                        }
                        let host = session.phone_host.clone();
                        let port = session.bridge_port;
                        let client = BridgeClient::new(&session);
                        app.session = Some(session);
                        app.client = Some(client.clone());
                        if let Some(stop) = pair_stop.as_ref() {
                            stop.store(true, std::sync::atomic::Ordering::SeqCst);
                        }
                        app.push_pair_note(format!("Hello ok from {host}:{port}. Loading the library…"));
                        library_rx = Some(spawn_library(client));
                    }
                }
                Ok(Err(_)) => {
                    hello_rx = None;
                    app.push_pair_note("Saved phone did not answer. Scanning the LAN and waiting for a QR.");
                }
                Err(TryRecvError::Disconnected) => hello_rx = None,
                Err(TryRecvError::Empty) => {}
            }
        }

        if let Some(rx) = pair_status.as_ref() {
            loop {
                match rx.try_recv() {
                    Ok(note) => app.push_pair_note(note),
                    Err(TryRecvError::Disconnected) => {
                        pair_status = None;
                        break;
                    }
                    Err(TryRecvError::Empty) => break,
                }
            }
        }

        if let Some(rx) = pair_rx.as_ref() {
            match rx.try_recv() {
                Ok(session) => {
                    pair_rx = None;
                    if app.client.is_none() {
                        if let Err(err) = save_session(&session) {
                            app.error = Some(err);
                        }
                        let host = session.phone_host.clone();
                        let port = session.bridge_port;
                        let client = BridgeClient::new(&session);
                        app.session = Some(session);
                        app.client = Some(client.clone());
                        if let Some(stop) = pair_stop.as_ref() {
                            stop.store(true, std::sync::atomic::Ordering::SeqCst);
                        }
                        app.push_pair_note(format!("Paired with {host}:{port}. Loading the library… keep NLC open."));
                        library_rx = Some(spawn_library(client));
                    }
                }
                Err(TryRecvError::Disconnected) => pair_rx = None,
                Err(TryRecvError::Empty) => {}
            }
        }

        if let Some(rx) = library_rx.as_ref() {
            match rx.try_recv() {
                Ok(Ok((listed, loose_tracks))) => {
                    library_rx = None;
                    app.error = None;
                    app.push_pair_note(format!(
                        "Library ready: {} playlists, {} tracks.",
                        listed.len(),
                        loose_tracks.len()
                    ));
                    app.apply_library(listed, loose_tracks);
                }
                Ok(Err(err)) => {
                    library_rx = None;
                    app.error = Some(err.clone());
                    app.push_pair_note(format!("Library failed: {err}"));
                    app.push_pair_note("Keep NLC in the foreground, then press r to retry.");
                }
                Err(TryRecvError::Disconnected) => library_rx = None,
                Err(TryRecvError::Empty) => {}
            }
        }

        if let Some(player) = app.player.as_mut() {
            if let Ok(Some(_)) = player.try_wait() {
                app.player = None;
                app.paused = false;
                app.progress = 0.0;
                if app.queue_index + 1 < app.queue.len() {
                    app.queue_index += 1;
                    app.play_current_queue();
                } else {
                    app.now_playing = None;
                    app.progress = 0.0;
                    app.play_pos_ms = 0;
                    app.play_dur_ms = 0;
                    app.status = "Queue finished".into();
                }
            }
        }
        app.poll_progress();

        if app.screen != Screen::Pair {
            if let Some(client) = app.client.clone() {
                if last_hello.elapsed() >= Duration::from_secs(4) {
                    last_hello = Instant::now();
                    thread::spawn(move || {
                        let _ = client.hello();
                    });
                }
            }
        }

        terminal.draw(|frame| draw(frame, &mut app))?;

        match keys.recv_timeout(Duration::from_millis(80)) {
            Ok(ev) => {
                if handle_event(&mut app, ev, &mut last_key) {
                    break 'main;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    if let Some(client) = app.client.as_ref() {
        client.bye();
    }
    Ok(())
}

fn handle_event(
    app: &mut App,
    ev: Event,
    last_key: &mut Option<(KeyCode, KeyModifiers, Instant)>,
) -> bool {
    match ev {
        Event::Key(key) if should_dispatch_key(key, last_key) => dispatch_key(app, key),
        Event::Mouse(mouse) => {
            handle_mouse(app, mouse);
            false
        }
        Event::Paste(text) => {
            if let Some(ch) = text.chars().next() {
                let key = KeyEvent::new(KeyCode::Char(ch), KeyModifiers::NONE);
                dispatch_key(app, key)
            } else {
                false
            }
        }
        _ => false,
    }
}

fn mouse_pos(mouse: MouseEvent) -> Position {
    Position::new(mouse.column, mouse.row)
}

fn handle_mouse(app: &mut App, mouse: MouseEvent) {
    if app.help || app.searching || app.screen == Screen::Pair {
        return;
    }
    let pos = mouse_pos(mouse);
    match mouse.kind {
        MouseEventKind::Down(_) => {
            focus_under_mouse(app, pos);
        }
        MouseEventKind::ScrollUp | MouseEventKind::ScrollDown => {
            let down = matches!(mouse.kind, MouseEventKind::ScrollDown);
            if app.hit_playback.contains(pos) {
                app.bump_volume(if down { -VOLUME_STEP } else { VOLUME_STEP });
                return;
            }
            focus_under_mouse(app, pos);
            let over_list = app.hit_playlists.contains(pos)
                || app.hit_tracks.contains(pos)
                || app.hit_list.contains(pos);
            if over_list {
                app.move_sel(if down { 1 } else { -1 });
            }
        }
        _ => {}
    }
}

fn focus_under_mouse(app: &mut App, pos: Position) {
    if app.screen != Screen::Library {
        return;
    }
    if app.hit_playlists.contains(pos) {
        app.focus = Focus::Playlists;
        app.status = format!("{} playlists", app.albums.len());
    } else if app.hit_tracks.contains(pos) {
        app.focus = Focus::Tracks;
        app.status = format!("{} tracks", app.loose_tracks.len());
    }
}

fn should_dispatch_key(
    key: KeyEvent,
    last: &mut Option<(KeyCode, KeyModifiers, Instant)>,
) -> bool {
    match key.kind {
        KeyEventKind::Repeat => matches!(
            key.code,
            KeyCode::Up
                | KeyCode::Down
                | KeyCode::Left
                | KeyCode::Right
                | KeyCode::PageUp
                | KeyCode::PageDown
                | KeyCode::Char('j' | 'k' | 'J' | 'K')
        ),
        KeyEventKind::Press | KeyEventKind::Release => {
            let now = Instant::now();
            if let Some((code, mods, at)) = *last {
                if code == key.code
                    && mods == key.modifiers
                    && now.saturating_duration_since(at) < Duration::from_millis(40)
                {
                    return false;
                }
            }
            *last = Some((key.code, key.modifiers, now));
            true
        }
    }
}

fn letter(key: KeyEvent) -> Option<char> {
    match key.code {
        KeyCode::Char(c) if !key.modifiers.intersects(KeyModifiers::CONTROL | KeyModifiers::ALT) => {
            Some(c.to_ascii_lowercase())
        }
        _ => None,
    }
}

/// Returns true when the TUI should quit.
fn dispatch_key(app: &mut App, key: KeyEvent) -> bool {
    if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
        return true;
    }
    if app.help {
        if matches!(key.code, KeyCode::Esc) || matches!(letter(key), Some('q' | '?')) {
            app.help = false;
        }
        return false;
    }
    if app.searching {
        match key.code {
            KeyCode::Esc => {
                app.searching = false;
                app.screen = Screen::Library;
            }
            KeyCode::Enter => {
                app.searching = false;
                if let Some(client) = app.client.as_ref() {
                    match client.search(&app.search_input) {
                        Ok(mut found) => {
                            apply_cached_durations(&mut found.tracks);
                            app.tracks = found.tracks;
                            app.screen = Screen::Search;
                            app.context = format!("Search  {}", app.search_input);
                            app.select_zero();
                            app.status = format!("{} tracks", app.tracks.len());
                            app.kick_duration_probe();
                        }
                        Err(err) => app.error = Some(err),
                    }
                }
            }
            KeyCode::Backspace => {
                app.search_input.pop();
            }
            KeyCode::Char(c) => app.search_input.push(c),
            _ => {}
        }
        return false;
    }
    if matches!(letter(key), Some('q')) {
        return true;
    }
    if key.code == KeyCode::Esc && app.screen == Screen::Pair {
        return true;
    }
    match (key.code, letter(key)) {
        (_, Some('?')) => app.help = true,
        (_, Some('/')) => {
            if app.client.is_some() {
                app.searching = true;
                app.search_input.clear();
                app.status = "Search".into();
            }
        }
        (_, Some('r')) => {
            if let Err(err) = app.load_library() {
                app.error = Some(err);
            }
        }
        (KeyCode::Tab | KeyCode::BackTab, _) => app.toggle_focus(),
        (KeyCode::Esc | KeyCode::Backspace, _) => app.back(),
        (KeyCode::Down, _) | (_, Some('j')) => app.move_sel(1),
        (KeyCode::Up, _) | (_, Some('k')) => app.move_sel(-1),
        (KeyCode::PageDown, _) => app.move_sel(20),
        (KeyCode::PageUp, _) => app.move_sel(-20),
        (KeyCode::Home, _) => app.jump_sel(0),
        (KeyCode::End, _) => app.jump_sel(app.len().saturating_sub(1)),
        (KeyCode::Char('f'), _) if key.modifiers.contains(KeyModifiers::CONTROL) => app.move_sel(20),
        (KeyCode::Char('b'), _) if key.modifiers.contains(KeyModifiers::CONTROL) => app.move_sel(-20),
        (_, Some('g')) if key.modifiers.contains(KeyModifiers::SHIFT) => {
            app.jump_sel(app.len().saturating_sub(1))
        }
        (_, Some('g')) => app.jump_sel(0),
        (KeyCode::Enter, _) => app.open_selected(),
        (_, Some(' ')) => app.toggle_pause(),
        (_, Some('s')) => {
            app.stop_player();
            app.status = "Stopped".into();
        }
        (_, Some('n')) => {
            if app.queue_index + 1 < app.queue.len() {
                app.queue_index += 1;
                app.play_current_queue();
            }
        }
        (_, Some('p')) => {
            if app.queue_index > 0 {
                app.queue_index -= 1;
                app.play_current_queue();
            }
        }
        (_, Some('+' | '=')) => app.bump_volume(VOLUME_STEP),
        (_, Some('-')) => app.bump_volume(-VOLUME_STEP),
        (_, Some('_')) => app.toggle_mute(),
        _ => {}
    }
    false
}

fn draw(frame: &mut Frame, app: &mut App) {
    if app.screen == Screen::Pair {
        app.hit_playlists = Rect::default();
        app.hit_tracks = Rect::default();
        app.hit_list = Rect::default();
        app.hit_playback = Rect::default();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(8), Constraint::Length(1)])
            .split(frame.area());
        draw_pair(frame, app, chunks[0]);
        draw_hints(frame, app, chunks[1]);
    } else {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(8), Constraint::Length(1), Constraint::Length(6)])
            .split(frame.area());
        draw_library(frame, app, chunks[0]);
        app.hit_playback = chunks[2];
        draw_playback(frame, app, chunks[2]);
    }
    if app.help {
        draw_help(frame);
    }
}

fn draw_pair(frame: &mut Frame, app: &App, area: Rect) {
    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(42), Constraint::Percentage(58)])
        .split(area);
    frame.render_widget(
        Paragraph::new(app.qr.clone())
            .style(theme::text())
            .block(block("QR").padding(Padding::new(2, 1, 1, 1))),
        cols[0],
    );

    let elapsed = app.pair_started.elapsed().as_secs();
    let phone = app
        .session
        .as_ref()
        .map(|session| format!("{}:{}", session.phone_host, session.bridge_port))
        .unwrap_or_else(|| "none yet".into());
    let phase = if app.client.is_some() {
        "Paired — loading library"
    } else if app.status.to_ascii_lowercase().contains("claim") {
        "Claiming phone"
    } else if app.status.to_ascii_lowercase().contains("scan") {
        "Scanning LAN"
    } else if app.status.to_ascii_lowercase().contains("hello") {
        "Reconnecting"
    } else {
        "Waiting to pair"
    };

    let mut body = vec![
        Line::from(Span::styled(phase, theme::title())),
        Line::from(""),
        Line::from(Span::styled(&app.status, theme::text())),
        Line::from(""),
        Line::from(Span::styled(
            format!("This PC     {}  (QR listen :{PAIR_PORT})", app.pair_pc),
            theme::dim(),
        )),
        Line::from(Span::styled(format!("Phone       {phone}"), theme::dim())),
        Line::from(Span::styled(format!("Elapsed     {elapsed}s"), theme::dim())),
        Line::from(Span::styled(&app.pair_url, theme::dim())),
        Line::from(""),
        Line::from(Span::styled("Log", theme::title())),
    ];
    if app.pair_log.is_empty() {
        body.push(Line::from(Span::styled("  (waiting)", theme::dim())));
    } else {
        for note in app.pair_log.iter().rev().take(10).rev() {
            body.push(Line::from(Span::styled(format!("  · {note}"), theme::dim())));
        }
    }
    body.push(Line::from(""));
    body.push(Line::from("Keep NLC open on the phone. This PC scans the LAN and also accepts a QR."));
    body.push(Line::from("If claim fails, open NLC in the foreground or paste the URL in Settings → Desktop."));
    if let Some(err) = app.error.as_ref() {
        body.push(Line::from(""));
        body.push(Line::from(Span::styled(format!("Error  {err}"), theme::error())));
    }
    body.push(Line::from(""));
    body.push(Line::from(Span::styled("q quit    r retry library    ? keys", theme::dim())));

    frame.render_widget(
        Paragraph::new(body)
            .wrap(Wrap { trim: false })
            .block(block("Pairing").padding(Padding::new(2, 1, 1, 1))),
        cols[1],
    );
}

fn draw_library(frame: &mut Frame, app: &mut App, area: Rect) {
    if matches!(app.screen, Screen::Tracks | Screen::Search) {
        let title = match app.screen {
            Screen::Tracks => "Playlist",
            Screen::Search => "Search",
            _ => "",
        };
        let heading = format!("{title}  ·  {}", app.context);
        let table = track_table(&app.tracks, app.now_playing.as_ref())
            .block(pane_block(&heading, true).padding(Padding::new(1, 1, 0, 0)));
        frame.render_stateful_widget(table, area, &mut app.table);
        app.hit_list = area;
        app.hit_playlists = Rect::default();
        app.hit_tracks = Rect::default();
        return;
    }

    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(42), Constraint::Length(1), Constraint::Min(20)])
        .split(area);

    app.hit_list = Rect::default();
    app.hit_playlists = cols[0];
    app.hit_tracks = cols[2];

    let album_items: Vec<ListItem> = app
        .albums
        .iter()
        .map(|album| {
            ListItem::new(Line::from(vec![
                Span::styled(album.name.clone(), theme::text()),
                Span::raw("  "),
                Span::styled(album.artist_name.clone(), theme::dim()),
            ]))
        })
        .collect();
    let playlists_title = format!("Playlists  {}", app.albums.len());
    let list = List::new(album_items)
        .block(
            pane_block(&playlists_title, app.focus == Focus::Playlists)
                .padding(Padding::new(1, 1, 0, 0)),
        )
        .highlight_style(theme::highlight())
        .highlight_symbol(" › ");
    frame.render_stateful_widget(list, cols[0], &mut app.list);

    let tracks_title = format!("Tracks  {}", app.loose_tracks.len());
    let table = track_table(&app.loose_tracks, app.now_playing.as_ref()).block(
        pane_block(&tracks_title, app.focus == Focus::Tracks).padding(Padding::new(1, 1, 0, 0)),
    );
    frame.render_stateful_widget(table, cols[2], &mut app.table);
}

fn track_table(tracks: &[Track], playing: Option<&Track>) -> Table<'static> {
    let playing_id = playing.map(|t| t.id.as_str());
    let rows: Vec<Row> = tracks
        .iter()
        .enumerate()
        .map(|(i, track)| {
            let mark = if playing_id == Some(track.id.as_str()) { "▶" } else { " " };
            let style = if playing_id == Some(track.id.as_str()) {
                theme::playing()
            } else {
                theme::text()
            };
            Row::new(vec![
                Cell::from(format!("{mark} {:>3}", i + 1)),
                Cell::from(track.title.clone()),
                Cell::from(track.artist_name.clone()),
                Cell::from(format_track_time(track.duration_ms)),
            ])
            .style(style)
        })
        .collect();
    Table::new(
        rows,
        [
            Constraint::Length(6),
            Constraint::Min(16),
            Constraint::Min(12),
            Constraint::Length(7),
        ],
    )
    .header(Row::new(["#", "Title", "Artist", "Time"]).style(theme::dim()))
    .row_highlight_style(theme::highlight())
    .highlight_symbol(" ")
}

fn draw_playback(frame: &mut Frame, app: &App, area: Rect) {
    let dock = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border())
        .title(Span::styled(" Playback ", theme::title()));
    let inner = dock.inner(area);
    frame.render_widget(dock, area);

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
        ])
        .split(inner);
    let text = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(2), Constraint::Min(1), Constraint::Length(1)])
        .split(rows[0])[1];
    let meta_area = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(2), Constraint::Min(1), Constraint::Length(1)])
        .split(rows[1])[1];
    let foot_area = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(2), Constraint::Min(1), Constraint::Length(1)])
        .split(rows[3])[1];

    let (title, album, times) = if let Some(track) = app.now_playing.as_ref() {
        let mark = if app.paused { "paused" } else { "playing" };
        let total = app.play_dur_ms.max(track.duration_ms);
        let elapsed = if app.play_dur_ms > 0 {
            app.play_pos_ms.min(total)
        } else if total > 0 {
            (app.progress * total as f64).round() as u64
        } else {
            0
        };
        (
            format!("{mark}  {}  —  {}", track.title, track.artist_name),
            track.album_name.clone(),
            format!("{} / {}", format_ms(elapsed), format_track_time(total)),
        )
    } else {
        (
            "Nothing playing".into(),
            "Enter a track. Space pauses. Scroll here for volume.".into(),
            String::new(),
        )
    };
    let vol = if app.muted.is_some() {
        "muted".into()
    } else {
        format!("vol {:>3}%", app.volume)
    };

    let top = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(16), Constraint::Length(12)])
        .split(text);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            title,
            theme::text().add_modifier(Modifier::BOLD),
        ))),
        top[0],
    );
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(vol, theme::dim()))).alignment(Alignment::Right),
        top[1],
    );

    let meta = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(16), Constraint::Length(14)])
        .split(meta_area);
    frame.render_widget(Paragraph::new(Line::from(Span::styled(album, theme::dim()))), meta[0]);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(times, theme::dim()))).alignment(Alignment::Right),
        meta[1],
    );

    let progress = Gauge::default()
        .gauge_style(Style::default().fg(theme::accent()).bg(theme::track()))
        .ratio(app.progress)
        .label("");
    frame.render_widget(progress, rows[2]);

    let foot = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(10), Constraint::Min(24)])
        .split(foot_area);
    frame.render_widget(Paragraph::new(status_line(app)), foot[0]);
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(hint_keys(app), theme::dim()))).alignment(Alignment::Right),
        foot[1],
    );
}

fn status_line(app: &App) -> Line<'static> {
    let search = if app.searching {
        format!(" /{}", app.search_input)
    } else {
        String::new()
    };
    let err = app.error.clone().unwrap_or_default();
    Line::from(vec![
        Span::styled(format!("{}{search}", app.status), theme::dim()),
        Span::styled(if err.is_empty() { String::new() } else { format!("  {err}") }, theme::error()),
    ])
}

fn hint_keys(app: &App) -> &'static str {
    if app.screen == Screen::Pair {
        "q quit    ? help    esc quit"
    } else {
        "j/k  enter  space  n/p  scroll  /  q  ?"
    }
}

fn draw_hints(frame: &mut Frame, app: &App, area: Rect) {
    let mut spans = status_line(app).spans;
    spans.push(Span::raw("  ·  "));
    spans.push(Span::styled(hint_keys(app), theme::dim()));
    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}

fn draw_help(frame: &mut Frame) {
    let shortcuts = [
        ("tab", "Switch playlists / tracks"),
        ("j k  ↑ ↓", "Move in the focused pane"),
        ("g  G", "Top / bottom"),
        ("PgUp  PgDn", "Page up / down"),
        ("enter", "Open playlist or play"),
        ("esc", "Back"),
        ("/", "Search"),
        ("r", "Reload library"),
        ("space", "Pause / resume"),
        ("s", "Stop"),
        ("n  p", "Next / previous track"),
        ("scroll lists", "Select playlist or track under the pointer"),
        ("scroll playback", "Volume"),
        ("+ −", "Volume"),
        ("_", "Mute"),
        ("q", "Quit"),
        ("?  esc", "Close this help"),
    ];
    let seps = shortcuts.len().saturating_sub(1) as u16;
    let height = 2 + 1 + 1 + 1 + shortcuts.len() as u16 + seps;
    let area = centered(frame.area(), 66, height);
    frame.render_widget(Clear, area);

    let mut rows: Vec<Row> = Vec::with_capacity(shortcuts.len() * 2);
    for (i, (keys, action)) in shortcuts.iter().enumerate() {
        rows.push(Row::new([
            Cell::from(Span::styled(*keys, theme::title())),
            Cell::from(Span::styled(*action, theme::text())),
        ]));
        if i + 1 < shortcuts.len() {
            rows.push(Row::new([
                Cell::from(Span::styled("─".repeat(16), theme::border())),
                Cell::from(Span::styled("─".repeat(36), theme::border())),
            ]));
        }
    }

    let table = Table::new(rows, [Constraint::Length(18), Constraint::Min(24)])
        .header(Row::new([
            Cell::from(Span::styled("Key", theme::dim())),
            Cell::from(Span::styled("Action", theme::dim())),
        ]))
        .column_spacing(3)
        .block(block("Help").padding(Padding::new(2, 2, 1, 1)));
    frame.render_widget(table, area);
}

fn block(title: &str) -> Block<'static> {
    Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border())
        .title(Span::styled(format!(" {title} "), theme::title()))
}

fn pane_block(title: &str, focused: bool) -> Block<'static> {
    let border = if focused {
        theme::focus_border()
    } else {
        theme::border()
    };
    let title_style = if focused { theme::title() } else { theme::dim() };
    Block::default()
        .borders(Borders::ALL)
        .border_style(border)
        .title(Span::styled(format!(" {title} "), title_style))
}

fn centered(area: Rect, width: u16, height: u16) -> Rect {
    let width = width.min(area.width);
    let height = height.min(area.height);
    Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    }
}
