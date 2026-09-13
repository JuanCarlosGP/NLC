use std::collections::HashSet;
use std::io::{self, stdout};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::{Arc, RwLock};
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

use crate::client::{Album, AlbumDetail, BridgeClient, Track};
use crate::cover::CoverLoader;
use crate::library::{is_podcast_track, is_imported_playlist};
use crate::pair::{link_host, listen_for_pair, PairOffer};
use crate::player::{
    clamp_volume, format_ms, format_track_time, is_video_file, probe_stream_duration, MpvSession,
};
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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Lang {
    En,
    Es,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Zone {
    Music,
    Podcast,
    Video,
    Tasks,
    Wealth,
}

const ZONES: [Zone; 5] = [Zone::Music, Zone::Podcast, Zone::Video, Zone::Tasks, Zone::Wealth];

impl Zone {
    fn label(self, lang: Lang) -> &'static str {
        match (self, lang) {
            (Zone::Music, Lang::En) => "Music",
            (Zone::Music, Lang::Es) => "Música",
            (Zone::Podcast, _) => "Podcasts",
            (Zone::Video, Lang::En) => "Video",
            (Zone::Video, Lang::Es) => "Vídeo",
            (Zone::Tasks, Lang::En) => "Tasks",
            (Zone::Tasks, Lang::Es) => "Tareas",
            (Zone::Wealth, Lang::En) => "Wealth",
            (Zone::Wealth, Lang::Es) => "Patrimonio",
        }
    }

    fn plays_media(self) -> bool {
        matches!(self, Zone::Music | Zone::Podcast | Zone::Video)
    }

    fn left_title(self, count: usize, lang: Lang) -> String {
        match (self, lang) {
            (Zone::Music, Lang::En) => format!("Playlists  {count}"),
            (Zone::Music, Lang::Es) => format!("Playlists  {count}"),
            (Zone::Podcast, Lang::En) => format!("Shows  {count}"),
            (Zone::Podcast, Lang::Es) => format!("Programas  {count}"),
            (Zone::Video, Lang::En) => format!("Video  {count}"),
            (Zone::Video, Lang::Es) => format!("Vídeos  {count}"),
            (Zone::Tasks, Lang::En) => format!("Projects  {count}"),
            (Zone::Tasks, Lang::Es) => format!("Proyectos  {count}"),
            (Zone::Wealth, Lang::En) => format!("Accounts  {count}"),
            (Zone::Wealth, Lang::Es) => format!("Cuentas  {count}"),
        }
    }

    fn right_title(self, count: usize, lang: Lang) -> String {
        match (self, lang) {
            (Zone::Music, Lang::En) => format!("Tracks  {count}"),
            (Zone::Music, Lang::Es) => format!("Canciones  {count}"),
            (Zone::Podcast, Lang::En) => format!("Episodes  {count}"),
            (Zone::Podcast, Lang::Es) => format!("Episodios  {count}"),
            (Zone::Video, Lang::En) => format!("Files  {count}"),
            (Zone::Video, Lang::Es) => format!("Archivos  {count}"),
            (Zone::Tasks, Lang::En) => format!("Tasks  {count}"),
            (Zone::Tasks, Lang::Es) => format!("Tareas  {count}"),
            (Zone::Wealth, Lang::En) => format!("Activity  {count}"),
            (Zone::Wealth, Lang::Es) => format!("Actividad  {count}"),
        }
    }

    fn from_index(index: usize) -> Self {
        ZONES.get(index).copied().unwrap_or(Zone::Music)
    }

    fn empty_hint(self, lang: Lang) -> &'static str {
        match (self, lang) {
            (Zone::Music, Lang::En) => "No playlists on the phone.",
            (Zone::Music, Lang::Es) => "No hay playlists en el teléfono.",
            (Zone::Podcast, Lang::En) => "No podcast shows in the phone library.",
            (Zone::Podcast, Lang::Es) => "No hay podcasts en la biblioteca del teléfono.",
            (Zone::Video, Lang::En) => "No series or movies on the NAS video share.",
            (Zone::Video, Lang::Es) => "No hay series ni películas en la carpeta de vídeo del NAS.",
            (Zone::Tasks, Lang::En) => "No open tasks, or the phone did not send Tasks.",
            (Zone::Tasks, Lang::Es) => "No hay tareas pendientes, o el teléfono no envió Tareas.",
            (Zone::Wealth, Lang::En) => "No accounts, or the phone did not send Wealth.",
            (Zone::Wealth, Lang::Es) => "No hay cuentas, o el teléfono no envió Patrimonio.",
        }
    }
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
    zone: Zone,
    nav: bool,
    nav_sel: usize,
    detail_all: Vec<Track>,
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
    hit_nav_rows: Vec<Rect>,
    duration_tx: Option<Sender<(String, u64)>>,
    probe_ids: HashSet<String>,
    pair_log: Vec<String>,
    pair_pc: String,
    pair_started: Instant,
    show_raw_logs: bool,
    lang: Lang,
    retry_pair: bool,
    pending_zone: Option<Receiver<Result<(Zone, Vec<Album>, Vec<Track>), (Zone, String)>>>,
    pending_album: Option<Receiver<Result<AlbumDetail, String>>>,
    cover_loader: CoverLoader,
    cover_key: Option<String>,
    show_cover_modal: bool,
    hit_cover: Rect,
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
            zone: Zone::Music,
            nav: false,
            nav_sel: 0,
            detail_all: Vec::new(),
            list: ListState::default().with_selected(Some(0)),
            table: TableState::default().with_selected(Some(0)),
            queue: Vec::new(),
            queue_index: 0,
            player: None,
            now_playing: None,
            volume: 45,
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
            hit_nav_rows: Vec::new(),
            duration_tx: None,
            probe_ids: HashSet::new(),
            pair_log: Vec::new(),
            pair_pc: ip,
            pair_started: Instant::now(),
            show_raw_logs: false,
            lang: Lang::En,
            retry_pair: false,
            pending_zone: None,
            pending_album: None,
            cover_loader: CoverLoader::new(),
            cover_key: None,
            show_cover_modal: false,
            hit_cover: Rect::default(),
        }
    }

    fn toggle_lang(&mut self) {
        self.lang = match self.lang {
            Lang::En => Lang::Es,
            Lang::Es => Lang::En,
        };
        self.context = self.zone.label(self.lang).into();
        if self.screen == Screen::Library {
            self.status = match self.focus {
                Focus::Playlists => self.zone.left_title(self.albums.len(), self.lang),
                Focus::Tracks => self.zone.right_title(self.loose_tracks.len(), self.lang),
            };
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
            self.sync_detail_pane();
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
            self.sync_detail_pane();
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
            Focus::Playlists => self.zone.left_title(self.albums.len(), self.lang),
            Focus::Tracks => self.zone.right_title(self.loose_tracks.len(), self.lang),
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
        self.cover_key = None;
        self.show_cover_modal = false;
        self.paused = false;
        self.progress = 0.0;
        self.play_pos_ms = 0;
        self.play_dur_ms = 0;
    }

    fn play_current_queue(&mut self) {
        self.stop_player();
        let Some(client) = self.client.as_ref() else { return };
        let Some(track) = self.queue.get(self.queue_index).cloned() else { return };
        let is_video = self.zone == Zone::Video
            || is_video_file(&track.id)
            || is_video_file(&track.title);
        match MpvSession::spawn(
            &client.stream_url(&track.id),
            &client.auth_header(),
            self.volume,
            is_video,
            Some(&track.title),
        ) {
            Ok(player) => {
                self.status = if is_video {
                    match self.lang {
                        Lang::En => format!("Playing video  {}", track.title),
                        Lang::Es => format!("Reproduciendo vídeo  {}", track.title),
                    }
                } else {
                    format!("Playing  {}", track.title)
                };
                self.error = None;
                self.paused = false;
                self.progress = 0.0;
                self.play_pos_ms = 0;
                self.play_dur_ms = track.duration_ms;
                let cover_key = track.cover_key();
                if let Some(ref key) = cover_key {
                    self.cover_loader.request(client, key);
                }
                self.cover_key = cover_key;
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
            if track.id.starts_with("video:") {
                continue;
            }
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
        self.albums = listed;
        self.detail_all = loose_tracks;
        self.focus = if self.albums.is_empty() {
            Focus::Tracks
        } else {
            Focus::Playlists
        };
        self.screen = Screen::Library;
        self.context = self.zone.label(self.lang).into();
        self.select_zero();
        self.sync_detail_pane();
        self.status = format!(
            "{}  ·  {}  ·  {}",
            self.zone.label(self.lang),
            self.albums.len(),
            self.loose_tracks.len()
        );
        if self.zone.plays_media() {
            self.kick_duration_probe();
        }
    }

    fn sync_detail_pane(&mut self) {
        if self.zone.plays_media() || self.albums.is_empty() {
            self.loose_tracks = self.detail_all.clone();
            return;
        }
        let Some(idx) = self.list.selected() else {
            self.loose_tracks = self.detail_all.clone();
            return;
        };
        let Some(album) = self.albums.get(idx) else {
            self.loose_tracks = self.detail_all.clone();
            return;
        };
        let filtered: Vec<Track> = self
            .detail_all
            .iter()
            .filter(|track| track.album_id == album.id || track.album_name == album.name)
            .cloned()
            .collect();
        self.loose_tracks = if filtered.is_empty() {
            self.detail_all.clone()
        } else {
            filtered
        };
    }

    fn load_library(&mut self) {
        self.request_zone(self.zone);
    }

    fn request_zone(&mut self, zone: Zone) {
        self.nav = false;
        self.zone = zone;
        self.screen = Screen::Library;
        self.context = zone.label(self.lang).into();
        self.albums.clear();
        self.detail_all.clear();
        self.loose_tracks.clear();
        self.tracks.clear();
        self.select_zero();
        self.error = None;
        self.status = match self.lang {
            Lang::En => format!("Loading {}…", zone.label(self.lang)),
            Lang::Es => format!("Cargando {}…", zone.label(self.lang)),
        };
        let Some(client) = self.client.clone() else {
            self.error = Some("no client".into());
            return;
        };
        self.pending_album = None;
        self.pending_zone = Some(spawn_zone(client, zone));
    }

    fn take_zone_load(&mut self) {
        let Some(rx) = self.pending_zone.as_ref() else { return };
        match rx.try_recv() {
            Ok(Ok((zone, listed, tracks))) => {
                self.pending_zone = None;
                if zone != self.zone {
                    return;
                }
                self.error = None;
                self.apply_library(listed, tracks);
                if self.albums.is_empty() && self.loose_tracks.is_empty() {
                    self.status = zone.empty_hint(self.lang).into();
                }
            }
            Ok(Err((zone, err))) => {
                self.pending_zone = None;
                if zone == self.zone {
                    self.error = Some(err);
                    self.status = zone.label(self.lang).into();
                }
            }
            Err(TryRecvError::Disconnected) => self.pending_zone = None,
            Err(TryRecvError::Empty) => {}
        }
    }

    fn take_album_load(&mut self) {
        let Some(rx) = self.pending_album.as_ref() else { return };
        match rx.try_recv() {
            Ok(Ok(mut detail)) => {
                self.pending_album = None;
                apply_cached_durations(&mut detail.tracks);
                self.tracks = detail.tracks;
                self.screen = Screen::Tracks;
                self.context = if detail.id.starts_with("playlist:")
                    || self.zone == Zone::Music
                    || detail.artist_name.trim().is_empty()
                {
                    detail.name.clone()
                } else {
                    format!("{}  ·  {}", detail.artist_name, detail.name)
                };
                self.select_zero();
                self.status = detail.name;
                if self.zone.plays_media() {
                    self.kick_duration_probe();
                }
            }
            Ok(Err(err)) => {
                self.pending_album = None;
                self.error = Some(err);
            }
            Err(TryRecvError::Disconnected) => self.pending_album = None,
            Err(TryRecvError::Empty) => {}
        }
    }

    fn open_album(&mut self, album: Album) {
        if !self.zone.plays_media() {
            self.focus = Focus::Tracks;
            self.status = self.zone.right_title(self.loose_tracks.len(), self.lang);
            return;
        }
        let Some(client) = self.client.clone() else { return };
        self.error = None;
        self.status = format!("Opening {}…", album.name);
        let id = album.id.clone();
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = tx.send(client.album(&id));
        });
        self.pending_album = Some(rx);
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
                    if !self.zone.plays_media() {
                        if let Some(row) = self.loose_tracks.get(idx) {
                            self.status = format!("{}  ·  {}", row.title, row.artist_name);
                        }
                        return;
                    }
                    if self.zone == Zone::Video {
                        if let Some(row) = self.loose_tracks.get(idx).cloned() {
                            if row.artist_name.eq_ignore_ascii_case("folder") {
                                self.open_album(Album::row(row.id, row.title, row.artist_name));
                                return;
                            }
                        }
                    }
                    self.tracks = self.loose_tracks.clone();
                    self.play_from_tracks(idx);
                }
            },
            Screen::Tracks | Screen::Search => {
                let Some(idx) = self.table.selected().or(self.list.selected()) else { return };
                if self.zone == Zone::Video {
                    if let Some(row) = self.tracks.get(idx).cloned() {
                        if row.artist_name.eq_ignore_ascii_case("folder") {
                            self.open_album(Album::row(row.id, row.title, row.artist_name));
                            return;
                        }
                    }
                }
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
                self.context = self.zone.label(self.lang).into();
                self.select_zero();
            }
        }
    }

    fn handle_unlink(&mut self, token_lock: &Arc<RwLock<String>>) {
        self.stop_player();
        self.client = None;
        self.session = None;
        self.pending_zone = None;
        self.pending_album = None;
        self.albums.clear();
        self.loose_tracks.clear();
        self.tracks.clear();
        self.detail_all.clear();
        self.queue.clear();
        self.now_playing = None;
        self.progress = 0.0;
        self.play_pos_ms = 0;
        self.play_dur_ms = 0;
        self.searching = false;
        self.search_input.clear();
        self.error = None;
        crate::session::clear_session();

        let new_token = random_token();
        if let Ok(mut lock) = token_lock.write() {
            *lock = new_token.clone();
        }
        let url = pair_url(&self.pair_pc, PAIR_PORT, &new_token);
        self.qr = render_qr(&url);
        self.pair_url = url;
        self.pair_started = Instant::now();
        self.screen = Screen::Pair;
        let note = match self.lang {
            Lang::En => "Unlinked. Press 'r' to retry connection or scan the QR code.",
            Lang::Es => "Desvinculado. Pulsa 'r' para reintentar la conexión o escanea el QR.",
        };
        self.status = note.into();
        self.push_pair_note(note.to_string());
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

fn fetch_zone(client: &BridgeClient, zone: Zone) -> Result<(Vec<Album>, Vec<Track>), String> {
    match zone {
        Zone::Music => fetch_music(client),
        Zone::Podcast => fetch_podcast(client),
        Zone::Video => fetch_video(client),
        Zone::Tasks => fetch_tasks(client),
        Zone::Wealth => fetch_wealth(client),
    }
}

fn fetch_music(client: &BridgeClient) -> Result<(Vec<Album>, Vec<Track>), String> {
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

fn fetch_video(client: &BridgeClient) -> Result<(Vec<Album>, Vec<Track>), String> {
    Ok((client.videos()?, Vec::new()))
}

fn fetch_podcast(client: &BridgeClient) -> Result<(Vec<Album>, Vec<Track>), String> {
    let albums = client.albums().unwrap_or_default();
    let listed: Vec<Album> = albums
        .into_iter()
        .filter(|album| crate::library::is_podcast_album(album))
        .collect();
    let mut tracks = Vec::new();
    for album in &listed {
        if let Ok(mut detail) = client.album(&album.id) {
            apply_cached_durations(&mut detail.tracks);
            tracks.extend(detail.tracks);
        }
    }
    tracks.retain(is_podcast_track);
    apply_cached_durations(&mut tracks);
    Ok((listed, tracks))
}

fn fetch_tasks(client: &BridgeClient) -> Result<(Vec<Album>, Vec<Track>), String> {
    let dump = client.focus()?;
    let projects: Vec<Album> = dump
        .projects
        .iter()
        .filter(|project| !project.archived)
        .map(|project| {
            let open = dump
                .tasks
                .iter()
                .filter(|task| task.project_id == project.id && task.status != "done")
                .count();
            Album::row(&project.id, &project.name, format!("{open} open"))
        })
        .collect();
    let tracks = dump
        .tasks
        .iter()
        .filter(|task| task.status != "done")
        .map(|task| {
            let project = dump
                .projects
                .iter()
                .find(|project| project.id == task.project_id)
                .map(|project| project.name.as_str())
                .unwrap_or("Inbox");
            Track::row(&task.id, &task.title, &task.project_id, project, &task.status)
        })
        .collect();
    Ok((projects, tracks))
}

fn fetch_wealth(client: &BridgeClient) -> Result<(Vec<Album>, Vec<Track>), String> {
    let dump = client.wealth()?;
    let accounts: Vec<Album> = dump
        .accounts
        .iter()
        .filter(|account| !account.archived)
        .map(|account| Album::row(&account.id, &account.name, &account.kind))
        .collect();
    let mut tracks: Vec<Track> = dump
        .txs
        .iter()
        .map(|tx| {
            let account = tx.account_id.clone().unwrap_or_default();
            Track::row(
                &tx.id,
                if tx.title.is_empty() { &tx.kind } else { &tx.title },
                &account,
                &tx.kind,
                format!("{:.2}", tx.amount),
            )
        })
        .collect();
    if tracks.is_empty() {
        tracks = dump
            .assets
            .iter()
            .map(|asset| {
                Track::row(
                    &asset.id,
                    &asset.name,
                    asset.account_id.clone().unwrap_or_default(),
                    "asset",
                    &asset.ticker,
                )
            })
            .collect();
    }
    Ok((accounts, tracks))
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

fn spawn_zone(
    client: BridgeClient,
    zone: Zone,
) -> Receiver<Result<(Zone, Vec<Album>, Vec<Track>), (Zone, String)>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let result = match fetch_zone(&client, zone) {
            Ok((listed, tracks)) => Ok((zone, listed, tracks)),
            Err(err) => Err((zone, err)),
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
            match fetch_zone(&client, Zone::Music) {
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
    let token_lock = Arc::new(RwLock::new(token));
    let last_host_lock = Arc::new(RwLock::new(saved.as_ref().map(|session| session.phone_host.clone())));
    let mut pair_unlink: Option<Receiver<()>> = None;
    let mut pair_tx: Option<Sender<Session>> = None;

    match listen_for_pair(PairOffer {
        token: token_lock.clone(),
        port: PAIR_PORT,
        ip,
        url,
        last_host: last_host_lock.clone(),
    }) {
            Ok(wait) => {
                pair_rx = Some(wait.session);
                pair_tx = Some(wait.session_tx);
                pair_status = Some(wait.status);
                pair_unlink = Some(wait.unlink);
                pair_stop = Some(wait.stop);
                app.push_pair_note("LAN scan started. NLC must stay open on the phone.");
            }
            Err(err) => {
                app.error = Some(err.clone());
                app.push_pair_note(format!("Could not listen on :{PAIR_PORT}: {err}"));
            }
    }

    let (hello_tick_tx, hello_tick_rx) = mpsc::channel();
    let mut consecutive_hello_fails = 0usize;

    'main: loop {
        while let Ok(ev) = keys.try_recv() {
            if handle_event(&mut app, ev, &mut last_key) {
                break 'main;
            }
        }
        while let Ok((id, ms)) = duration_rx.try_recv() {
            app.stamp_duration(&id, ms);
        }

        if app.retry_pair {
            app.retry_pair = false;
            app.error = None;
            app.pair_started = Instant::now();
            let ip = lan_ip();
            app.pair_pc = ip.clone();
            let current_token = token_lock.read().map(|t| t.clone()).unwrap_or_default();
            let url = pair_url(&ip, PAIR_PORT, &current_token);
            app.qr = render_qr(&url);
            app.pair_url = url;

            if let Some(stop) = pair_stop.as_ref() {
                stop.store(false, std::sync::atomic::Ordering::SeqCst);
            }

            let known_host = last_host_lock.read().ok().and_then(|h| h.clone());
            if let Some(host) = known_host {
                let note = match app.lang {
                    Lang::En => format!("Retrying phone at {host}:7421…"),
                    Lang::Es => format!("Reintentando conexión con el teléfono en {host}:7421…"),
                };
                app.status = note.clone();
                app.push_pair_note(note);
                if let Some(tx) = pair_tx.clone() {
                    let h = host.clone();
                    let tok = current_token.clone();
                    let lip = ip.clone();
                    thread::spawn(move || {
                        if let Some(session) = link_host(&h, &tok, &lip) {
                            let _ = tx.send(session);
                        }
                    });
                }
            } else {
                let note = match app.lang {
                    Lang::En => "Retrying… Scanning local Wi-Fi and waiting for QR scan.",
                    Lang::Es => "Reintentando… Buscando en la Wi-Fi local y esperando escaneo del QR.",
                };
                app.status = note.to_string();
                app.push_pair_note(note.to_string());
            }
        }

        if let Some(rx) = pair_unlink.as_ref() {
            if let Ok(()) = rx.try_recv() {
                library_rx = None;
                if let Some(stop) = pair_stop.as_ref() {
                    stop.store(true, std::sync::atomic::Ordering::SeqCst);
                }
                app.handle_unlink(&token_lock);
            }
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
                        if let Ok(mut lock) = last_host_lock.write() {
                            *lock = Some(host.clone());
                        }
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
                    if app.client.is_none() {
                        if let Err(err) = save_session(&session) {
                            app.error = Some(err);
                        }
                        let host = session.phone_host.clone();
                        let port = session.bridge_port;
                        let client = BridgeClient::new(&session);
                        if let Ok(mut lock) = last_host_lock.write() {
                            *lock = Some(host.clone());
                        }
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
                        "Music ready: {} playlists, {} tracks.",
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

        app.take_zone_load();
        app.take_album_load();
        app.cover_loader.poll();

        if let Some(player) = app.player.as_mut() {
            if let Ok(Some(_)) = player.try_wait() {
                let was_video = app.now_playing.as_ref().map_or(false, |t| {
                    app.zone == Zone::Video || is_video_file(&t.id) || is_video_file(&t.title)
                });
                app.player = None;
                app.paused = false;
                app.progress = 0.0;
                if !was_video && app.queue_index + 1 < app.queue.len() {
                    app.queue_index += 1;
                    app.play_current_queue();
                } else {
                    app.now_playing = None;
                    app.cover_key = None;
                    app.show_cover_modal = false;
                    app.play_pos_ms = 0;
                    app.play_dur_ms = 0;
                    app.status = if was_video {
                        match app.lang {
                            Lang::En => "Stopped".into(),
                            Lang::Es => "Detenido".into(),
                        }
                    } else {
                        match app.lang {
                            Lang::En => "Queue finished".into(),
                            Lang::Es => "Cola finalizada".into(),
                        }
                    };
                }
            }
        }
        app.poll_progress();

        if app.screen != Screen::Pair {
            if let Some(client) = app.client.clone() {
                if last_hello.elapsed() >= Duration::from_secs(3) {
                    last_hello = Instant::now();
                    let tx = hello_tick_tx.clone();
                    thread::spawn(move || {
                        let _ = tx.send(client.hello());
                    });
                }
            }
        }

        while let Ok(res) = hello_tick_rx.try_recv() {
            if app.screen != Screen::Pair {
                match res {
                    Ok(()) => {
                        consecutive_hello_fails = 0;
                    }
                    Err(_) => {
                        consecutive_hello_fails += 1;
                        if consecutive_hello_fails >= 2 {
                            consecutive_hello_fails = 0;
                            library_rx = None;
                            if let Some(stop) = pair_stop.as_ref() {
                                stop.store(true, std::sync::atomic::Ordering::SeqCst);
                            }
                            app.handle_unlink(&token_lock);
                        }
                    }
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
    let pos = mouse_pos(mouse);
    if app.nav {
        if matches!(mouse.kind, MouseEventKind::Down(_)) {
            for (i, rect) in app.hit_nav_rows.iter().enumerate() {
                if rect.contains(pos) {
                    app.nav_sel = i;
                    app.request_zone(Zone::from_index(i));
                    break;
                }
            }
        }
        return;
    }
    if app.show_cover_modal {
        if matches!(mouse.kind, MouseEventKind::Down(_)) {
            app.show_cover_modal = false;
        }
        return;
    }
    if app.help || app.searching || app.screen == Screen::Pair {
        return;
    }
    match mouse.kind {
        MouseEventKind::Down(_) => {
            if app.hit_cover.contains(pos) && app.now_playing.is_some() {
                app.show_cover_modal = !app.show_cover_modal;
                return;
            }
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
        app.status = app.zone.left_title(app.albums.len(), app.lang);
    } else if app.hit_tracks.contains(pos) {
        app.focus = Focus::Tracks;
        app.status = app.zone.right_title(app.loose_tracks.len(), app.lang);
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

fn is_confirm(key: KeyEvent) -> bool {
    matches!(
        key.code,
        KeyCode::Enter | KeyCode::Char('\n') | KeyCode::Char('\r')
    )
}

/// Returns true when the TUI should quit.
fn dispatch_key(app: &mut App, key: KeyEvent) -> bool {
    if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
        return true;
    }
    if app.show_cover_modal {
        if matches!(letter(key), Some(' ')) {
            app.toggle_pause();
            return false;
        }
        if matches!(letter(key), Some('n')) {
            if app.queue_index + 1 < app.queue.len() {
                app.queue_index += 1;
                app.play_current_queue();
            }
            return false;
        }
        if matches!(letter(key), Some('p')) {
            if app.queue_index > 0 {
                app.queue_index -= 1;
                app.play_current_queue();
            }
            return false;
        }
        if matches!(key.code, KeyCode::Esc | KeyCode::Enter) || matches!(letter(key), Some('q' | 'c')) {
            app.show_cover_modal = false;
            return false;
        }
        return false;
    }
    if app.help {
        if matches!(key.code, KeyCode::Esc) || matches!(letter(key), Some('q' | '?')) {
            app.help = false;
        }
        return false;
    }
    if app.nav {
        if is_confirm(key) || matches!(letter(key), Some(' ')) {
            app.request_zone(Zone::from_index(app.nav_sel));
            return false;
        }
        match (key.code, letter(key)) {
            (KeyCode::Esc, _) | (_, Some('m')) => app.nav = false,
            (_, Some('q')) => return true,
            (KeyCode::Down, _) | (_, Some('j')) => {
                app.nav_sel = (app.nav_sel + 1).min(ZONES.len() - 1);
            }
            (KeyCode::Up, _) | (_, Some('k')) => {
                app.nav_sel = app.nav_sel.saturating_sub(1);
            }
            (KeyCode::Char(c), _) if c.is_ascii_digit() => {
                let n = c.to_digit(10).unwrap_or(0) as usize;
                if (1..=ZONES.len()).contains(&n) {
                    app.request_zone(Zone::from_index(n - 1));
                }
            }
            _ => {}
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
        (_, Some('d')) if app.screen == Screen::Pair => {
            app.show_raw_logs = !app.show_raw_logs;
        }
        (_, Some('l')) => {
            app.toggle_lang();
        }
        (_, Some('c')) if app.client.is_some() && app.screen != Screen::Pair => {
            if app.now_playing.is_some() {
                app.show_cover_modal = !app.show_cover_modal;
            } else {
                app.status = match app.lang {
                    Lang::En => "Nothing playing".into(),
                    Lang::Es => "Nada en reproducción".into(),
                };
            }
        }
        (_, Some('m')) if app.client.is_some() && app.screen != Screen::Pair => {
            app.nav = true;
            app.nav_sel = ZONES.iter().position(|zone| *zone == app.zone).unwrap_or(0);
        }
        (_, Some('/')) => {
            if app.client.is_some() && app.zone.plays_media() {
                app.searching = true;
                app.search_input.clear();
                app.status = "Search".into();
            }
        }
        (_, Some('r')) if app.screen == Screen::Pair => {
            app.retry_pair = true;
        }
        (_, Some('r')) => {
            app.load_library();
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
            .constraints([Constraint::Min(8), Constraint::Length(7)])
            .split(frame.area());
        draw_library(frame, app, chunks[0]);
        app.hit_playback = chunks[1];
        draw_playback(frame, app, chunks[1]);
    }
    if app.help {
        draw_help(frame, app.lang);
    }
    if app.nav {
        draw_nav(frame, app);
    }
    if app.show_cover_modal {
        draw_cover_modal(frame, app);
    }
}

fn friendly_activity_line(note: &str, lang: Lang) -> Option<Line<'static>> {
    let lower = note.to_ascii_lowercase();
    if lower.contains("could not listen") || lower.contains("library failed") {
        Some(Line::from(vec![
            Span::styled("  ✕ ", theme::error()),
            Span::styled(note.to_string(), theme::error()),
        ]))
    } else if lower.contains("paired with") || lower.contains("hello ok") {
        let msg = match lang {
            Lang::En => "Phone connected successfully! Loading library…",
            Lang::Es => "¡Teléfono conectado con éxito! Cargando biblioteca…",
        };
        Some(Line::from(vec![
            Span::styled("  ✔ ", theme::playing()),
            Span::styled(msg, theme::playing()),
        ]))
    } else if lower.contains("linked to") {
        let msg = match lang {
            Lang::En => "Device linked! Getting your library ready…",
            Lang::Es => "¡Dispositivo vinculado! Preparando biblioteca…",
        };
        Some(Line::from(vec![
            Span::styled("  ✔ ", theme::playing()),
            Span::styled(msg, theme::playing()),
        ]))
    } else if lower.contains("lan scan started") {
        let msg = match lang {
            Lang::En => "Auto-discovery active — looking for NLC on Wi-Fi",
            Lang::Es => "Detección automática activa — buscando NLC en Wi-Fi",
        };
        Some(Line::from(vec![
            Span::styled("  ◎ ", theme::title()),
            Span::styled(msg, theme::text()),
        ]))
    } else if lower.contains("scanning") && lower.contains("/24") {
        let msg = match lang {
            Lang::En => "Scanning local network for open NLC app…",
            Lang::Es => "Buscando NLC en dispositivos de la red Wi-Fi…",
        };
        Some(Line::from(vec![
            Span::styled("  🔍 ", theme::dim()),
            Span::styled(msg, theme::dim()),
        ]))
    } else if lower.contains("saved link") || lower.contains("saying hello") {
        let msg = match lang {
            Lang::En => "Found previously paired phone, attempting reconnect…",
            Lang::Es => "Teléfono previo encontrado, intentando reconectar…",
        };
        Some(Line::from(vec![
            Span::styled("  ↻ ", theme::title()),
            Span::styled(msg, theme::dim()),
        ]))
    } else if lower.contains("saved phone did not answer") {
        let msg = match lang {
            Lang::En => "Previous phone offline, scanning local Wi-Fi…",
            Lang::Es => "Teléfono previo desconectado, buscando en Wi-Fi…",
        };
        Some(Line::from(vec![
            Span::styled("  · ", theme::dim()),
            Span::styled(msg, theme::dim()),
        ]))
    } else if lower.contains("no nlc on") || lower.contains("this pass") {
        let msg = match lang {
            Lang::En => "Phone not spotted yet — will keep looking in background…",
            Lang::Es => "Aún no detectado — reintentando en segundo plano…",
        };
        Some(Line::from(vec![
            Span::styled("  ⏳ ", theme::dim()),
            Span::styled(msg, theme::dim()),
        ]))
    } else if lower.contains("this pc is") {
        let msg = match lang {
            Lang::En => "Ready to receive pairing connection",
            Lang::Es => "Listo para recibir conexión de emparejado",
        };
        Some(Line::from(vec![
            Span::styled("  ⚡ ", theme::dim()),
            Span::styled(msg, theme::dim()),
        ]))
    } else if lower.contains("keep nlc in the foreground") || lower.contains("listening for qr") {
        None
    } else {
        Some(Line::from(vec![
            Span::styled("  · ", theme::dim()),
            Span::styled(note.to_string(), theme::dim()),
        ]))
    }
}

fn draw_pair(frame: &mut Frame, app: &App, area: Rect) {
    let cols = if area.width >= 79 {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(43), Constraint::Min(35)])
            .split(area)
    } else {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .split(area)
    };

    let qr_title = match app.lang {
        Lang::En => "Scan with NLC",
        Lang::Es => "Escanear con NLC",
    };

    let top_pad = if area.height >= 23 {
        2
    } else if area.height >= 21 {
        1
    } else {
        0
    };

    frame.render_widget(
        Paragraph::new(app.qr.as_str())
            .style(theme::text())
            .block(block(qr_title).padding(Padding::new(2, 2, top_pad, 0))),
        cols[0],
    );

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(10), Constraint::Min(6)])
        .split(cols[1]);

    let elapsed = app.pair_started.elapsed().as_secs();
    let searching_str = match app.lang {
        Lang::En => "Searching…",
        Lang::Es => "Buscando…",
    };
    let phone_label = app
        .session
        .as_ref()
        .map(|session| format!("{}:{}", session.phone_host, session.bridge_port))
        .unwrap_or_else(|| searching_str.into());

    let (status_badge, status_msg, status_style) = if app.client.is_some() {
        let msg = match app.lang {
            Lang::En => "Paired! Loading library…",
            Lang::Es => "¡Vinculado! Cargando biblioteca…",
        };
        (" ✔ ", msg, theme::playing())
    } else if app.status.to_ascii_lowercase().contains("claim") {
        let msg = match app.lang {
            Lang::En => "Phone detected! Linking…",
            Lang::Es => "¡Teléfono detectado! Conectando…",
        };
        (" ⚡ ", msg, theme::playing())
    } else if app.status.to_ascii_lowercase().contains("hello") {
        let msg = match app.lang {
            Lang::En => "Reconnecting to phone…",
            Lang::Es => "Reconectando con el teléfono…",
        };
        (" ↻ ", msg, theme::title())
    } else if app.status.to_ascii_lowercase().contains("scan") {
        let msg = match app.lang {
            Lang::En => "Searching local Wi-Fi for phone…",
            Lang::Es => "Buscando NLC en la red Wi-Fi…",
        };
        (" ◎ ", msg, theme::title())
    } else {
        let msg = match app.lang {
            Lang::En => "Ready to pair",
            Lang::Es => "Listo para vincular",
        };
        (" ◌ ", msg, theme::dim())
    };

    let (s1, s2, s3, phone_lbl_str) = match app.lang {
        Lang::En => (
            " Open NLC on your phone",
            " Ensure both devices are on the same Wi-Fi",
            " Scan the QR or wait for auto-connect",
            "   Phone: ",
        ),
        Lang::Es => (
            " Abre NLC en tu teléfono",
            " Conéctate a la misma red Wi-Fi",
            " Escanea el QR o espera la conexión automática",
            "   Móvil: ",
        ),
    };

    let guide_body = vec![
        Line::from(vec![
            Span::styled(status_badge, status_style),
            Span::styled(status_msg, status_style),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(" 1 ", theme::highlight()),
            Span::styled(s1, theme::dim()),
        ]),
        Line::from(vec![
            Span::styled(" 2 ", theme::highlight()),
            Span::styled(s2, theme::dim()),
        ]),
        Line::from(vec![
            Span::styled(" 3 ", theme::highlight()),
            Span::styled(s3, theme::dim()),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(" PC: ", theme::dim()),
            Span::styled(&app.pair_pc, theme::text()),
            Span::styled(phone_lbl_str, theme::dim()),
            Span::styled(
                &phone_label,
                if app.session.is_some() { theme::playing() } else { theme::dim() },
            ),
            Span::styled(format!("  ({elapsed}s)"), theme::dim()),
        ]),
    ];

    let guide_title = match app.lang {
        Lang::En => "How to Connect",
        Lang::Es => "Cómo conectar",
    };

    frame.render_widget(
        Paragraph::new(guide_body)
            .wrap(Wrap { trim: false })
            .block(block(guide_title).padding(Padding::new(2, 1, 1, 0))),
        rows[0],
    );

    let (activity_title, activity_body) = if app.show_raw_logs {
        let mut body = vec![
            Line::from(vec![
                Span::styled("Listen port: ", theme::dim()),
                Span::styled(format!("{PAIR_PORT}"), theme::text()),
                Span::styled("   Claim URL: ", theme::dim()),
                Span::styled(&app.pair_url, theme::dim()),
            ]),
            Line::from(""),
        ];
        if app.pair_log.is_empty() {
            let empty_msg = match app.lang {
                Lang::En => "  (no network events yet)",
                Lang::Es => "  (sin eventos de red todavía)",
            };
            body.push(Line::from(Span::styled(empty_msg, theme::dim())));
        } else {
            for note in app.pair_log.iter().rev().take(10).rev() {
                body.push(Line::from(Span::styled(format!("  · {note}"), theme::dim())));
            }
        }
        if let Some(err) = app.error.as_ref() {
            body.push(Line::from(""));
            body.push(Line::from(Span::styled(format!("  Error: {err}"), theme::error())));
        }
        let t = match app.lang {
            Lang::En => "Technical Log [d: friendly view, l: español]",
            Lang::Es => "Registro técnico [d: vista amigable, l: english]",
        };
        (t, body)
    } else {
        let mut body = Vec::new();
        let mut seen = None;
        let mut count = 0;
        for note in app.pair_log.iter().rev() {
            if let Some(line) = friendly_activity_line(note, app.lang) {
                let text_repr = format!("{line:?}");
                if seen.as_ref() == Some(&text_repr) {
                    continue;
                }
                seen = Some(text_repr);
                body.push(line);
                count += 1;
                if count >= 6 {
                    break;
                }
            }
        }
        body.reverse();
        if body.is_empty() {
            let empty_msg = match app.lang {
                Lang::En => "  ◌ Waiting for network activity…",
                Lang::Es => "  ◌ Esperando actividad de red…",
            };
            body.push(Line::from(Span::styled(empty_msg, theme::dim())));
        }
        body.push(Line::from(""));
        let (tip_lbl, tip_txt) = match app.lang {
            Lang::En => ("  Tip: ", "Keep NLC in the foreground on your phone during setup."),
            Lang::Es => ("  Consejo: ", "Mantén NLC en primer plano en tu teléfono durante la vinculación."),
        };
        body.push(Line::from(vec![
            Span::styled(tip_lbl, theme::title()),
            Span::styled(tip_txt, theme::dim()),
        ]));
        if let Some(err) = app.error.as_ref() {
            body.push(Line::from(vec![
                Span::styled("  ✕ Error: ", theme::error()),
                Span::styled(err, theme::error()),
            ]));
        }
        let t = match app.lang {
            Lang::En => "Connection Activity [d: details, l: español]",
            Lang::Es => "Actividad de conexión [d: detalles, l: english]",
        };
        (t, body)
    };

    frame.render_widget(
        Paragraph::new(activity_body)
            .wrap(Wrap { trim: false })
            .block(block(activity_title).padding(Padding::new(2, 2, 1, 1))),
        rows[1],
    );
}

fn draw_library(frame: &mut Frame, app: &mut App, area: Rect) {
    if matches!(app.screen, Screen::Tracks | Screen::Search) {
        let title = match (app.screen, app.lang) {
            (Screen::Tracks, Lang::En) => "Playlist",
            (Screen::Tracks, Lang::Es) => "Lista",
            (Screen::Search, Lang::En) => "Search",
            (Screen::Search, Lang::Es) => "Buscar",
            _ => "",
        };
        let heading = format!("{title}  ·  {}", app.context);
        let table = track_table(&app.tracks, app.now_playing.as_ref(), app.lang)
            .block(pane_block(&heading, true).padding(Padding::new(1, 1, 0, 0)));
        frame.render_stateful_widget(table, area, &mut app.table);
        app.hit_list = area;
        app.hit_playlists = Rect::default();
        app.hit_tracks = Rect::default();
        return;
    }

    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(18), Constraint::Length(1), Constraint::Min(20)])
        .split(area);

    app.hit_list = Rect::default();
    app.hit_playlists = cols[0];
    app.hit_tracks = cols[2];

    let album_items: Vec<ListItem> = app
        .albums
        .iter()
        .map(|album| {
            if is_imported_playlist(album) || app.zone == Zone::Music || album.artist_name.trim().is_empty() {
                ListItem::new(Line::from(Span::styled(album.name.clone(), theme::text())))
            } else {
                ListItem::new(Line::from(vec![
                    Span::styled(album.name.clone(), theme::text()),
                    Span::raw("  "),
                    Span::styled(album.artist_name.clone(), theme::dim()),
                ]))
            }
        })
        .collect();
    let playlists_title = app.zone.left_title(app.albums.len(), app.lang);
    let list = List::new(album_items)
        .block(
            pane_block(&playlists_title, app.focus == Focus::Playlists)
                .padding(Padding::new(1, 1, 0, 0)),
        )
        .highlight_style(theme::highlight())
        .highlight_symbol(" › ");
    frame.render_stateful_widget(list, cols[0], &mut app.list);

    let tracks_title = app.zone.right_title(app.loose_tracks.len(), app.lang);
    if app.albums.is_empty() && app.loose_tracks.is_empty() {
        frame.render_widget(
            Paragraph::new(app.zone.empty_hint(app.lang))
                .style(theme::dim())
                .wrap(Wrap { trim: false })
                .block(pane_block(&tracks_title, true).padding(Padding::new(1, 1, 0, 0))),
            cols[2],
        );
        return;
    }
    let table = track_table(&app.loose_tracks, app.now_playing.as_ref(), app.lang).block(
        pane_block(&tracks_title, app.focus == Focus::Tracks).padding(Padding::new(1, 1, 0, 0)),
    );
    frame.render_stateful_widget(table, cols[2], &mut app.table);
}

fn track_table(tracks: &[Track], playing: Option<&Track>, lang: Lang) -> Table<'static> {
    let playing_id = playing.map(|t| t.id.as_str());
    let rows: Vec<Row> = tracks
        .iter()
        .enumerate()
        .map(|(i, track)| {
            let is_playing = playing_id == Some(track.id.as_str());
            let style = if is_playing {
                theme::playing()
            } else {
                theme::text()
            };
            let num = i + 1;
            let num_cell = if is_playing {
                format!("▶ {num}")
            } else {
                format!("{num}")
            };
            Row::new(vec![
                Cell::from(num_cell),
                Cell::from(track.title.clone()),
                Cell::from(track.artist_name.clone()),
                Cell::from(format_track_time(track.duration_ms)),
            ])
            .style(style)
        })
        .collect();
    let headers = match lang {
        Lang::En => ["#", "Title", "Artist", "Time"],
        Lang::Es => ["#", "Título", "Artista", "Tiempo"],
    };
    Table::new(
        rows,
        [
            Constraint::Length(5),
            Constraint::Min(16),
            Constraint::Min(12),
            Constraint::Length(7),
        ],
    )
    .header(Row::new(headers).style(theme::dim()))
    .row_highlight_style(theme::highlight())
    .highlight_symbol("")
}

fn draw_playback(frame: &mut Frame, app: &mut App, area: Rect) {
    let dock_title = match app.lang {
        Lang::En => " Playback ",
        Lang::Es => " Reproducción ",
    };
    let dock = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::border())
        .title(Span::styled(dock_title, theme::title()));
    let inner = dock.inner(area);
    frame.render_widget(dock, area);

    if inner.height < 4 || inner.width < 20 {
        app.hit_cover = Rect::default();
        return;
    }

    let show_mini_cover = inner.width >= 40 && inner.height >= 5;
    let (cover_rect, details_area) = if show_mini_cover {
        let cols = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(12), Constraint::Min(20)])
            .split(inner);
        let c_rect = Rect {
            x: cols[0].x + 1,
            y: cols[0].y,
            width: 10,
            height: 5,
        };
        app.hit_cover = c_rect;
        (Some(c_rect), cols[1])
    } else {
        app.hit_cover = Rect::default();
        (None, inner)
    };

    if let Some(crect) = cover_rect {
        let pair_opt = app.cover_key.as_deref().and_then(|k| app.cover_loader.get(k));
        let is_loading = app.cover_key.as_deref().map_or(false, |k| app.cover_loader.is_loading(k));
        if let Some(pair) = pair_opt {
            frame.render_widget(Paragraph::new(pair.mini.lines.clone()), crect);
        } else if is_loading {
            let loading_lines = vec![
                Line::from(Span::styled("┌────────┐", theme::border())),
                Line::from(vec![
                    Span::styled("│   ", theme::border()),
                    Span::styled("♫", theme::accent()),
                    Span::styled("    │", theme::border()),
                ]),
                Line::from(vec![
                    Span::styled("│  ", theme::border()),
                    Span::styled("LOAD", theme::dim()),
                    Span::styled("  │", theme::border()),
                ]),
                Line::from(Span::styled("│  ....  │", theme::dim())),
                Line::from(Span::styled("└────────┘", theme::border())),
            ];
            frame.render_widget(Paragraph::new(loading_lines), crect);
        } else {
            let idle_lines = vec![
                Line::from(Span::styled("┌────────┐", theme::border())),
                Line::from(Span::styled("│        │", theme::border())),
                Line::from(vec![
                    Span::styled("│   ", theme::border()),
                    Span::styled("♫", theme::dim()),
                    Span::styled("    │", theme::border()),
                ]),
                Line::from(Span::styled("│        │", theme::border())),
                Line::from(Span::styled("└────────┘", theme::border())),
            ];
            frame.render_widget(Paragraph::new(idle_lines), crect);
        }
    }

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

    if details_area.height >= 5 {
        let rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
            ])
            .split(details_area);

        let top = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Min(16), Constraint::Length(12)])
            .split(rows[0]);
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
            .split(rows[1]);
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

        frame.render_widget(Paragraph::new(status_line(app)), rows[3]);

        let cover_badge = if app.now_playing.is_some() && app.cover_key.is_some() {
            match app.lang {
                Lang::En => "[c] cover",
                Lang::Es => "[c] carátula",
            }
        } else {
            ""
        };
        let foot = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(14), Constraint::Min(24)])
            .split(rows[4]);
        if !cover_badge.is_empty() {
            frame.render_widget(
                Paragraph::new(Line::from(Span::styled(cover_badge, theme::accent()))),
                foot[0],
            );
        }
        frame.render_widget(
            Paragraph::new(Line::from(Span::styled(hint_keys(app), theme::dim()))).alignment(Alignment::Right),
            foot[1],
        );
    } else {
        let rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
            ])
            .split(details_area);

        let top = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Min(16), Constraint::Length(12)])
            .split(rows[0]);
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
            .split(rows[1]);
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
            .split(rows[3]);
        frame.render_widget(Paragraph::new(status_line(app)), foot[0]);
        frame.render_widget(
            Paragraph::new(Line::from(Span::styled(hint_keys(app), theme::dim()))).alignment(Alignment::Right),
            foot[1],
        );
    }
}

fn draw_cover_modal(frame: &mut Frame, app: &App) {
    let screen = frame.area();
    let modal_w = 44.min(screen.width.saturating_sub(4));
    let modal_h = 24.min(screen.height.saturating_sub(2));
    if modal_w < 20 || modal_h < 8 {
        return;
    }
    let area = centered(screen, modal_w, modal_h);
    frame.render_widget(Clear, area);

    let modal_title = match app.lang {
        Lang::En => " Cover Art ",
        Lang::Es => " Carátula ",
    };
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme::focus_border())
        .title(Span::styled(modal_title, theme::title()));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let pair_opt = app.cover_key.as_deref().and_then(|k| app.cover_loader.get(k));
    let is_loading = app.cover_key.as_deref().map_or(false, |k| app.cover_loader.is_loading(k));

    if inner.height >= 21 && inner.width >= 34 {
        let v_chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(17),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
            ])
            .split(inner);

        let cover_rect = centered(v_chunks[0], 34, 17);
        if let Some(pair) = pair_opt {
            frame.render_widget(Paragraph::new(pair.large.lines.clone()), cover_rect);
        } else if is_loading {
            let loading_text = match app.lang {
                Lang::En => "Loading high-resolution cover art…",
                Lang::Es => "Cargando carátula en alta resolución…",
            };
            frame.render_widget(
                Paragraph::new(loading_text)
                    .alignment(Alignment::Center)
                    .style(theme::dim()),
                cover_rect,
            );
        } else {
            let no_art_text = match app.lang {
                Lang::En => "No cover art available for this track",
                Lang::Es => "No hay carátula disponible para esta canción",
            };
            frame.render_widget(
                Paragraph::new(no_art_text)
                    .alignment(Alignment::Center)
                    .style(theme::dim()),
                cover_rect,
            );
        }

        if let Some(track) = app.now_playing.as_ref() {
            frame.render_widget(
                Paragraph::new(Line::from(vec![
                    Span::styled(&track.title, theme::text().add_modifier(Modifier::BOLD)),
                    Span::styled("  —  ", theme::dim()),
                    Span::styled(&track.artist_name, theme::text()),
                ])).alignment(Alignment::Center),
                v_chunks[2],
            );
            frame.render_widget(
                Paragraph::new(Span::styled(&track.album_name, theme::dim())).alignment(Alignment::Center),
                v_chunks[3],
            );
        }

        let close_hint = match app.lang {
            Lang::En => "Space pause   n/p skip   esc / c close",
            Lang::Es => "Espacio pausar   n/p saltar   esc / c cerrar",
        };
        frame.render_widget(
            Paragraph::new(Span::styled(close_hint, theme::dim())).alignment(Alignment::Center),
            v_chunks[4],
        );
    } else {
        let v_chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(5),
                Constraint::Length(1),
                Constraint::Length(1),
                Constraint::Length(1),
            ])
            .split(inner);

        let cover_rect = centered(v_chunks[0], 10, 5);
        if let Some(pair) = pair_opt {
            frame.render_widget(Paragraph::new(pair.mini.lines.clone()), cover_rect);
        } else {
            let loading_text = match app.lang {
                Lang::En => "Loading…",
                Lang::Es => "Cargando…",
            };
            frame.render_widget(
                Paragraph::new(loading_text)
                    .alignment(Alignment::Center)
                    .style(theme::dim()),
                cover_rect,
            );
        }

        if let Some(track) = app.now_playing.as_ref() {
            frame.render_widget(
                Paragraph::new(Line::from(vec![
                    Span::styled(&track.title, theme::text().add_modifier(Modifier::BOLD)),
                    Span::styled(" — ", theme::dim()),
                    Span::styled(&track.artist_name, theme::text()),
                ])).alignment(Alignment::Center),
                v_chunks[1],
            );
        }

        let close_hint = match app.lang {
            Lang::En => "esc / c close",
            Lang::Es => "esc / c cerrar",
        };
        frame.render_widget(
            Paragraph::new(Span::styled(close_hint, theme::dim())).alignment(Alignment::Center),
            v_chunks[2],
        );
    }
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
        match (app.lang, app.show_raw_logs) {
            (Lang::En, false) => "q quit    r retry    d details    l español    ? help    esc quit",
            (Lang::En, true) => "q quit    r retry    d friendly log    l español    ? help    esc quit",
            (Lang::Es, false) => "q salir    r reintentar    d detalles    l english    ? ayuda    esc salir",
            (Lang::Es, true) => "q salir    r reintentar    d registro amigable    l english    ? ayuda    esc salir",
        }
    } else if app.nav {
        "j/k  1-5  enter  m/esc"
    } else {
        match app.lang {
            Lang::En => "c cover  j/k  enter  space  n/p  m  /  l (es)  q  ?",
            Lang::Es => "c carátula  j/k  enter  space  n/p  m  /  l (en)  q  ?",
        }
    }
}

fn draw_hints(frame: &mut Frame, app: &App, area: Rect) {
    if app.screen == Screen::Pair {
        let line = Line::from(vec![
            Span::raw("  "),
            Span::styled(hint_keys(app), theme::dim()),
        ]);
        frame.render_widget(Paragraph::new(line), area);
        return;
    }
    let mut spans = status_line(app).spans;
    spans.push(Span::raw("  ·  "));
    spans.push(Span::styled(hint_keys(app), theme::dim()));
    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}

fn draw_nav(frame: &mut Frame, app: &mut App) {
    let height = 4 + ZONES.len() as u16 + 2;
    let area = centered(frame.area(), 46, height);
    frame.render_widget(Clear, area);
    let title = match app.lang {
        Lang::En => "Sections",
        Lang::Es => "Secciones",
    };
    let chrome = block(title).padding(Padding::new(2, 2, 1, 1));
    let inner = chrome.inner(area);
    frame.render_widget(chrome, area);
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Min(1),
        ])
        .split(inner);
    app.hit_nav_rows = rows.iter().take(ZONES.len()).copied().collect();
    for (i, zone) in ZONES.iter().enumerate() {
        let mark = if *zone == app.zone { "●" } else { " " };
        let line = format!(" {}  {}  {}", i + 1, zone.label(app.lang), mark);
        let style = if i == app.nav_sel {
            theme::highlight()
        } else {
            theme::text()
        };
        frame.render_widget(Paragraph::new(Line::from(Span::styled(line, style))), rows[i]);
    }
    let footer = match app.lang {
        Lang::En => "Enter opens the page   Esc closes",
        Lang::Es => "Enter abre la sección   Esc cierra",
    };
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            footer,
            theme::dim(),
        ))),
        rows[ZONES.len()],
    );
}

fn draw_help(frame: &mut Frame, lang: Lang) {
    let shortcuts_en = [
        ("tab", "Switch playlists / tracks"),
        ("j k  ↑ ↓", "Move in the focused pane"),
        ("g  G", "Top / bottom"),
        ("PgUp  PgDn", "Page up / down"),
        ("enter", "Open playlist or play"),
        ("esc", "Back"),
        ("c", "Toggle album cover"),
        ("m", "Sections (music, podcasts, video, tasks, wealth)"),
        ("d", "Toggle details / friendly log (pairing screen)"),
        ("l", "Toggle language (English / Español)"),
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

    let shortcuts_es = [
        ("tab", "Cambiar listas / pistas"),
        ("j k  ↑ ↓", "Moverse en el panel activo"),
        ("g  G", "Inicio / fin"),
        ("PgUp  PgDn", "Avanzar / retroceder página"),
        ("enter", "Abrir lista o reproducir"),
        ("esc", "Atrás"),
        ("c", "Ver / ocultar carátula"),
        ("m", "Secciones (música, podcasts, vídeo, tareas, finanzas)"),
        ("d", "Alternar detalles / registro amigable (emparejamiento)"),
        ("l", "Cambiar idioma (English / Español)"),
        ("/", "Buscar"),
        ("r", "Recargar biblioteca"),
        ("space", "Pausar / reanudar"),
        ("s", "Detener"),
        ("n  p", "Pista siguiente / anterior"),
        ("scroll listas", "Seleccionar lista o pista bajo el puntero"),
        ("scroll playback", "Volumen"),
        ("+ −", "Volumen"),
        ("_", "Silenciar"),
        ("q", "Salir"),
        ("?  esc", "Cerrar esta ayuda"),
    ];

    let (shortcuts, title, key_col, action_col) = match lang {
        Lang::En => (&shortcuts_en[..], "Help", "Key", "Action"),
        Lang::Es => (&shortcuts_es[..], "Ayuda", "Tecla", "Acción"),
    };

    let seps = shortcuts.len().saturating_sub(1) as u16;
    let height = 2 + 1 + 1 + 1 + shortcuts.len() as u16 + seps;
    let area = centered(frame.area(), 70, height);
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
                Cell::from(Span::styled("─".repeat(46), theme::border())),
            ]));
        }
    }

    let table = Table::new(rows, [Constraint::Length(18), Constraint::Min(24)])
        .header(Row::new([
            Cell::from(Span::styled(key_col, theme::dim())),
            Cell::from(Span::styled(action_col, theme::dim())),
        ]))
        .column_spacing(3)
        .block(block(title).padding(Padding::new(2, 2, 1, 1)));
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
