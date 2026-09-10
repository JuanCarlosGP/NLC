use std::io::{self, stdout};
use std::sync::mpsc::TryRecvError;
use std::time::{Duration, Instant};

use crossterm::event::{
    self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, KeyModifiers, MouseEventKind,
};
use crossterm::execute;
use qrcode::QrCode;
use qrcode::render::unicode::Dense1x2;
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Cell, Clear, Gauge, List, ListItem, ListState, Padding, Paragraph, Row, Table, TableState, Wrap};
use ratatui::{DefaultTerminal, Frame};

use crate::client::{Album, BridgeClient, Track};
use crate::library::{is_loose_album, listed_albums, loose_albums};
use crate::pair::{listen_for_pair, PairOffer};
use crate::player::{clamp_volume, format_ms, MpvSession};
use crate::session::{lan_ip, load_session, pair_url, random_token, save_session, Session};
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
    Albums,
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
    context: String,
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
            focus: Focus::Albums,
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
            context: "Library".into(),
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
                Focus::Albums => self.albums.len(),
                Focus::Tracks => self.loose_tracks.len(),
            },
            Screen::Tracks | Screen::Search => self.tracks.len(),
        }
    }

    fn move_sel(&mut self, delta: i32) {
        let len = self.len();
        if len == 0 {
            if self.screen == Screen::Library && self.focus == Focus::Albums {
                self.list.select(None);
            } else {
                self.table.select(None);
            }
            return;
        }
        let cur = if self.screen == Screen::Library && self.focus == Focus::Albums {
            self.list.selected().unwrap_or(0)
        } else {
            self.table.selected().unwrap_or(0)
        } as i32;
        let next = (cur + delta).clamp(0, len as i32 - 1) as usize;
        if self.screen == Screen::Library && self.focus == Focus::Albums {
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
        if self.screen == Screen::Library && self.focus == Focus::Albums {
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
            Focus::Albums => Focus::Tracks,
            Focus::Tracks => Focus::Albums,
        };
        self.status = match self.focus {
            Focus::Albums => format!("{} albums", self.albums.len()),
            Focus::Tracks => format!("{} tracks", self.loose_tracks.len()),
        };
    }

    fn stop_player(&mut self) {
        if let Some(mut player) = self.player.take() {
            player.stop();
        }
        self.now_playing = None;
        self.paused = false;
        self.progress = 0.0;
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

    fn poll_progress(&mut self) {
        if self.paused {
            return;
        }
        if let Some(player) = self.player.as_ref() {
            if let Some(pct) = player.percent() {
                self.progress = (pct / 100.0).clamp(0.0, 1.0);
            }
        }
    }

    fn load_library(&mut self) -> Result<(), String> {
        let client = self.client.clone().ok_or("no client")?;
        client.ping()?;
        let albums = client.albums().unwrap_or_default();
        let listed: Vec<Album> = listed_albums(&albums)
            .into_iter()
            .filter(|album| !is_loose_album(album))
            .collect();
        let loose = loose_albums(&albums);
        let mut loose_tracks = Vec::new();
        for album in &loose {
            if let Ok(detail) = client.album(&album.id) {
                loose_tracks.extend(detail.tracks);
            }
        }
        self.status = format!("{} albums  ·  {} tracks", listed.len(), loose_tracks.len());
        self.albums = listed;
        self.loose_tracks = loose_tracks;
        self.focus = if self.albums.is_empty() {
            Focus::Tracks
        } else {
            Focus::Albums
        };
        self.screen = Screen::Library;
        self.context = "Library".into();
        self.select_zero();
        Ok(())
    }

    fn open_album(&mut self, album: Album) {
        let Some(client) = self.client.as_ref() else { return };
        match client.album(&album.id) {
            Ok(detail) => {
                self.tracks = detail.tracks;
                self.screen = Screen::Tracks;
                self.context = format!("{}  ·  {}", detail.artist_name, detail.name);
                self.select_zero();
                self.status = detail.name;
            }
            Err(err) => self.error = Some(err),
        }
    }

    fn open_selected(&mut self) {
        match self.screen {
            Screen::Pair => {}
            Screen::Library => match self.focus {
                Focus::Albums => {
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
    execute!(stdout(), EnableMouseCapture)?;
    let result = run_app(&mut terminal);
    execute!(stdout(), DisableMouseCapture)?;
    ratatui::restore();
    result
}

fn run_app(terminal: &mut DefaultTerminal) -> io::Result<()> {
    let mut app = App::new();
    let mut pair_rx = None;
    let mut pair_status = None;
    let mut last_hello = Instant::now() - Duration::from_secs(4);
    let saved = load_session();

    if let Some(session) = saved.as_ref() {
        let client = BridgeClient::new(session);
        match client.ping() {
            Ok(()) => {
                app.session = Some(session.clone());
                app.client = Some(client);
                if let Err(err) = app.load_library() {
                    app.error = Some(err);
                    app.screen = Screen::Pair;
                }
            }
            Err(_) => {
                app.status = format!("Last phone {} unreachable. Looking on the LAN…", session.phone_host);
            }
        }
    }

    if app.screen == Screen::Pair {
        let token = saved
            .as_ref()
            .map(|session| session.token.clone())
            .unwrap_or_else(random_token);
        let ip = lan_ip();
        let url = pair_url(&ip, PAIR_PORT, &token);
        app.qr = render_qr(&url);
        app.pair_url = url.clone();
        match listen_for_pair(PairOffer {
            token: token.clone(),
            port: PAIR_PORT,
            ip,
            url,
            last_host: saved.as_ref().map(|session| session.phone_host.clone()),
        }) {
            Ok(wait) => {
                pair_rx = Some(wait.session);
                pair_status = Some(wait.status);
            }
            Err(err) => app.error = Some(err),
        }
    }

    loop {
        if let Some(rx) = pair_status.as_ref() {
            match rx.try_recv() {
                Ok(note) => app.status = note,
                Err(TryRecvError::Disconnected) => pair_status = None,
                Err(TryRecvError::Empty) => {}
            }
        }

        if let Some(rx) = pair_rx.as_ref() {
            match rx.try_recv() {
                Ok(session) => {
                    if let Err(err) = save_session(&session) {
                        app.error = Some(err);
                    }
                    let client = BridgeClient::new(&session);
                    app.session = Some(session);
                    app.client = Some(client);
                    pair_rx = None;
                    if let Err(err) = app.load_library() {
                        app.error = Some(err);
                    }
                }
                Err(TryRecvError::Disconnected) => pair_rx = None,
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
                    app.status = "Queue finished".into();
                }
            }
        }
        app.poll_progress();

        if app.screen != Screen::Pair {
            if let Some(client) = app.client.as_ref() {
                if last_hello.elapsed() >= Duration::from_secs(4) {
                    let _ = client.hello();
                    last_hello = Instant::now();
                }
            }
        }

        terminal.draw(|frame| draw(frame, &mut app))?;

        if !event::poll(Duration::from_millis(80))? {
            continue;
        }
        match event::read()? {
            Event::Mouse(mouse) => match mouse.kind {
                MouseEventKind::ScrollUp => app.bump_volume(VOLUME_STEP),
                MouseEventKind::ScrollDown => app.bump_volume(-VOLUME_STEP),
                _ => {}
            },
            Event::Key(key) if key.kind == KeyEventKind::Press || key.kind == KeyEventKind::Repeat => {
                if app.help {
                    match key.code {
                        KeyCode::Char('?') | KeyCode::Esc | KeyCode::Char('q') => app.help = false,
                        _ => {}
                    }
                    continue;
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
                                    Ok(found) => {
                                        app.tracks = found.tracks;
                                        app.screen = Screen::Search;
                                        app.context = format!("Search  {}", app.search_input);
                                        app.select_zero();
                                        app.status = format!("{} tracks", app.tracks.len());
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
                    continue;
                }
                match key.code {
                    KeyCode::Char('q') => break,
                    KeyCode::Char('?') => app.help = true,
                    KeyCode::Char('/') => {
                        if app.client.is_some() {
                            app.searching = true;
                            app.search_input.clear();
                            app.status = "Search".into();
                        }
                    }
                    KeyCode::Char('r') => {
                        if let Err(err) = app.load_library() {
                            app.error = Some(err);
                        }
                    }
                    KeyCode::Tab | KeyCode::BackTab => app.toggle_focus(),
                    KeyCode::Esc | KeyCode::Backspace => app.back(),
                    KeyCode::Down | KeyCode::Char('j') => app.move_sel(1),
                    KeyCode::Up | KeyCode::Char('k') => app.move_sel(-1),
                    KeyCode::PageDown => app.move_sel(20),
                    KeyCode::PageUp => app.move_sel(-20),
                    KeyCode::Home => app.jump_sel(0),
                    KeyCode::End => app.jump_sel(app.len().saturating_sub(1)),
                    KeyCode::Char('f') if key.modifiers.contains(KeyModifiers::CONTROL) => app.move_sel(20),
                    KeyCode::Char('b') if key.modifiers.contains(KeyModifiers::CONTROL) => app.move_sel(-20),
                    KeyCode::Char('g') => app.jump_sel(0),
                    KeyCode::Char('G') => app.jump_sel(app.len().saturating_sub(1)),
                    KeyCode::Enter => app.open_selected(),
                    KeyCode::Char(' ') => app.toggle_pause(),
                    KeyCode::Char('s') => {
                        app.stop_player();
                        app.status = "Stopped".into();
                    }
                    KeyCode::Char('n') => {
                        if app.queue_index + 1 < app.queue.len() {
                            app.queue_index += 1;
                            app.play_current_queue();
                        }
                    }
                    KeyCode::Char('p') => {
                        if app.queue_index > 0 {
                            app.queue_index -= 1;
                            app.play_current_queue();
                        }
                    }
                    KeyCode::Char('+') | KeyCode::Char('=') => app.bump_volume(VOLUME_STEP),
                    KeyCode::Char('-') => app.bump_volume(-VOLUME_STEP),
                    KeyCode::Char('_') => app.toggle_mute(),
                    _ => {}
                }
            }
            _ => {}
        }
    }
    if let Some(client) = app.client.as_ref() {
        client.bye();
    }
    Ok(())
}

fn draw(frame: &mut Frame, app: &mut App) {
    if app.screen == Screen::Pair {
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
        draw_playback(frame, app, chunks[2]);
    }
    if app.help {
        draw_help(frame);
    }
}

fn draw_pair(frame: &mut Frame, app: &App, area: Rect) {
    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(48), Constraint::Percentage(52)])
        .split(area);
    frame.render_widget(
        Paragraph::new(app.qr.clone())
            .style(theme::text())
            .block(block("QR").padding(Padding::new(2, 1, 1, 1))),
        cols[0],
    );
    let body = vec![
        Line::from(Span::styled("Pair this PC with NLC", theme::title())),
        Line::from(""),
        Line::from(Span::styled(&app.status, theme::text())),
        Line::from(""),
        Line::from(Span::styled(&app.pair_url, theme::dim())),
        Line::from(""),
        Line::from("Keep NLC open on the phone. This PC scans the LAN and pairs on its own."),
        Line::from("If nothing shows up, scan the QR (or paste the URL in Settings → Desktop)."),
        Line::from(""),
        Line::from(Span::styled("q quit    ? keys", theme::dim())),
    ];
    frame.render_widget(
        Paragraph::new(body)
            .wrap(Wrap { trim: false })
            .block(block("NLC TUI").padding(Padding::new(2, 1, 1, 1))),
        cols[1],
    );
}

fn draw_library(frame: &mut Frame, app: &mut App, area: Rect) {
    if matches!(app.screen, Screen::Tracks | Screen::Search) {
        let title = match app.screen {
            Screen::Tracks => "Tracks",
            Screen::Search => "Search",
            _ => "",
        };
        let heading = format!("{title}  ·  {}", app.context);
        let table = track_table(&app.tracks, app.now_playing.as_ref())
            .block(pane_block(&heading, true).padding(Padding::new(1, 1, 0, 0)));
        frame.render_stateful_widget(table, area, &mut app.table);
        return;
    }

    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(42), Constraint::Length(1), Constraint::Min(20)])
        .split(area);

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
    let albums_title = format!("Albums  {}", app.albums.len());
    let list = List::new(album_items)
        .block(
            pane_block(&albums_title, app.focus == Focus::Albums)
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
                Cell::from(format_ms(track.duration_ms)),
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
        let elapsed = (app.progress * track.duration_ms as f64).round() as u64;
        (
            format!("{mark}  {}  —  {}", track.title, track.artist_name),
            track.album_name.clone(),
            format!("{} / {}", format_ms(elapsed), format_ms(track.duration_ms)),
        )
    } else {
        (
            "Nothing playing".into(),
            "Enter a track. Space pauses. Scroll changes volume.".into(),
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
        "scroll volume    q quit    ?"
    } else {
        "j/k  enter  space  n/p  scroll  /  ?"
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
        ("tab", "Switch albums / tracks"),
        ("j k  ↑ ↓", "Move in the focused pane"),
        ("g  G", "Top / bottom"),
        ("PgUp  PgDn", "Page up / down"),
        ("enter", "Open album or play"),
        ("esc", "Back"),
        ("/", "Search"),
        ("r", "Reload library"),
        ("space", "Pause / resume"),
        ("s", "Stop"),
        ("n  p", "Next / previous track"),
        ("scroll  + −", "Volume"),
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
