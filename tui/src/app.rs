use std::io;
use std::process::Child;
use std::sync::mpsc::TryRecvError;
use std::time::Duration;

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use qrcode::QrCode;
use qrcode::render::unicode::Dense1x2;
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap};
use ratatui::{DefaultTerminal, Frame};

use crate::client::{play_url, Album, Artist, BridgeClient, Track};
use crate::pair::{listen_for_pair, PairOffer};
use crate::session::{lan_ip, load_session, pair_url, random_token, save_session, Session};

const PAIR_PORT: u16 = 7420;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Pair,
    Artists,
    Albums,
    Tracks,
    Search,
}

struct App {
    screen: Screen,
    status: String,
    error: Option<String>,
    qr: String,
    pair_url: String,
    session: Option<Session>,
    client: Option<BridgeClient>,
    artists: Vec<Artist>,
    albums: Vec<Album>,
    tracks: Vec<Track>,
    search_input: String,
    searching: bool,
    list: ListState,
    queue: Vec<Track>,
    queue_index: usize,
    player: Option<Child>,
    now_playing: Option<String>,
}

impl App {
    fn new() -> Self {
        let token = random_token();
        let ip = lan_ip();
        let url = pair_url(&ip, PAIR_PORT, &token);
        let qr = render_qr(&url);
        Self {
            screen: Screen::Pair,
            status: "Scan this QR in NLC → Settings → Desktop".into(),
            error: None,
            qr,
            pair_url: url,
            session: None,
            client: None,
            artists: Vec::new(),
            albums: Vec::new(),
            tracks: Vec::new(),
            search_input: String::new(),
            searching: false,
            list: ListState::default().with_selected(Some(0)),
            queue: Vec::new(),
            queue_index: 0,
            player: None,
            now_playing: None,
        }
    }

    fn select_zero(&mut self) {
        self.list.select(Some(0));
    }

    fn len(&self) -> usize {
        match self.screen {
            Screen::Pair => 0,
            Screen::Artists => self.artists.len(),
            Screen::Albums => self.albums.len(),
            Screen::Tracks | Screen::Search => self.tracks.len(),
        }
    }

    fn move_sel(&mut self, delta: i32) {
        let len = self.len();
        if len == 0 {
            self.list.select(None);
            return;
        }
        let cur = self.list.selected().unwrap_or(0) as i32;
        let next = (cur + delta).clamp(0, len as i32 - 1) as usize;
        self.list.select(Some(next));
    }

    fn stop_player(&mut self) {
        if let Some(mut child) = self.player.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.now_playing = None;
    }

    fn play_current_queue(&mut self) {
        self.stop_player();
        let Some(client) = self.client.as_ref() else { return };
        let Some(track) = self.queue.get(self.queue_index) else { return };
        match play_url(&client.stream_url(&track.id), &client.auth_header()) {
            Ok(child) => {
                self.now_playing = Some(format!("{} — {}", track.artist_name, track.title));
                self.status = format!("Playing locally: {}", track.title);
                self.error = None;
                self.player = Some(child);
            }
            Err(err) => {
                self.error = Some(err);
            }
        }
    }

    fn play_from_tracks(&mut self, start: usize) {
        self.queue = self.tracks.clone();
        self.queue_index = start.min(self.queue.len().saturating_sub(1));
        self.play_current_queue();
    }

    fn load_library(&mut self) -> Result<(), String> {
        let client = self.client.as_ref().ok_or("no client")?;
        client.ping()?;
        self.artists = client.artists()?;
        self.albums = client.albums().unwrap_or_default();
        self.screen = Screen::Artists;
        self.select_zero();
        self.status = format!("{} artists via phone bridge", self.artists.len());
        Ok(())
    }

    fn open_selected(&mut self) {
        match self.screen {
            Screen::Pair => {}
            Screen::Artists => {
                let Some(idx) = self.list.selected() else { return };
                let Some(artist) = self.artists.get(idx) else { return };
                let name = artist.name.clone();
                self.albums = self
                    .albums
                    .iter()
                    .filter(|a| a.artist_name.eq_ignore_ascii_case(&name))
                    .cloned()
                    .collect();
                if self.albums.is_empty() {
                    if let Some(client) = self.client.as_ref() {
                        if let Ok(all) = client.albums() {
                            self.albums = all
                                .into_iter()
                                .filter(|a| a.artist_name.eq_ignore_ascii_case(&name))
                                .collect();
                        }
                    }
                }
                self.screen = Screen::Albums;
                self.select_zero();
                self.status = name;
            }
            Screen::Albums => {
                let Some(idx) = self.list.selected() else { return };
                let Some(album) = self.albums.get(idx).cloned() else { return };
                if let Some(client) = self.client.as_ref() {
                    match client.album(&album.id) {
                        Ok(detail) => {
                            self.tracks = detail.tracks;
                            self.screen = Screen::Tracks;
                            self.select_zero();
                            self.status = format!("{} — {}", detail.artist_name, detail.name);
                        }
                        Err(err) => self.error = Some(err),
                    }
                }
            }
            Screen::Tracks | Screen::Search => {
                let Some(idx) = self.list.selected() else { return };
                self.play_from_tracks(idx);
            }
        }
    }

    fn back(&mut self) {
        match self.screen {
            Screen::Pair => {}
            Screen::Artists => {}
            Screen::Albums => {
                if let Some(client) = self.client.as_ref() {
                    self.albums = client.albums().unwrap_or_default();
                }
                self.screen = Screen::Artists;
                self.select_zero();
            }
            Screen::Tracks => {
                self.screen = Screen::Albums;
                self.select_zero();
            }
            Screen::Search => {
                self.searching = false;
                self.screen = Screen::Artists;
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
        Ok(code) => code.render::<Dense1x2>().build(),
        Err(err) => err.to_string(),
    }
}

pub fn run() -> io::Result<()> {
    let mut terminal = ratatui::init();
    let result = run_app(&mut terminal);
    ratatui::restore();
    result
}

fn run_app(terminal: &mut DefaultTerminal) -> io::Result<()> {
    let mut app = App::new();
    let mut pair_rx = None;

    if let Some(session) = load_session() {
        let client = BridgeClient::new(&session);
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
                app.status = "Last phone unreachable. Scan the QR again.".into();
            }
        }
    }

    if app.screen == Screen::Pair {
        let token = random_token();
        let ip = lan_ip();
        let url = pair_url(&ip, PAIR_PORT, &token);
        app.qr = render_qr(&url);
        app.pair_url = url.clone();
        match listen_for_pair(PairOffer {
            token: token.clone(),
            port: PAIR_PORT,
            ip,
            url,
        }) {
            Ok(rx) => pair_rx = Some(rx),
            Err(err) => app.error = Some(err),
        }
    }

    loop {
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

        if let Some(child) = app.player.as_mut() {
            if let Ok(Some(_)) = child.try_wait() {
                app.player = None;
                if app.queue_index + 1 < app.queue.len() {
                    app.queue_index += 1;
                    app.play_current_queue();
                } else {
                    app.now_playing = None;
                    app.status = "Queue finished".into();
                }
            }
        }

        terminal.draw(|frame| draw(frame, &mut app))?;

        if event::poll(Duration::from_millis(120))? {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }
                if app.searching {
                    match key.code {
                        KeyCode::Esc => {
                            app.searching = false;
                            app.screen = Screen::Artists;
                        }
                        KeyCode::Enter => {
                            app.searching = false;
                            if let Some(client) = app.client.as_ref() {
                                match client.search(&app.search_input) {
                                    Ok(found) => {
                                        app.tracks = found.tracks;
                                        app.artists = found.artists;
                                        app.albums = found.albums;
                                        app.screen = Screen::Search;
                                        app.select_zero();
                                        app.status = format!("Search: {}", app.search_input);
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
                    KeyCode::Char('/') => {
                        if app.client.is_some() {
                            app.searching = true;
                            app.search_input.clear();
                            app.status = "Type and Enter to search".into();
                        }
                    }
                    KeyCode::Esc => app.back(),
                    KeyCode::Down | KeyCode::Char('j') => app.move_sel(1),
                    KeyCode::Up | KeyCode::Char('k') => app.move_sel(-1),
                    KeyCode::Enter => app.open_selected(),
                    KeyCode::Char(' ') => {
                        if app.player.is_some() {
                            app.stop_player();
                            app.status = "Stopped local playback".into();
                        }
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
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

fn draw(frame: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(3)])
        .split(frame.area());

    if app.screen == Screen::Pair {
        let help = format!(
            "{}\n\n{}\n\nq quit\nSame Wi-Fi as the phone. Then Settings → Desktop in NLC.",
            app.qr, app.pair_url
        );
        frame.render_widget(
            Paragraph::new(help)
                .wrap(Wrap { trim: false })
                .block(Block::default().borders(Borders::ALL).title("NLC TUI — pair")),
            chunks[0],
        );
    } else {
        let title = match app.screen {
            Screen::Artists => "Artists",
            Screen::Albums => "Albums",
            Screen::Tracks => "Tracks",
            Screen::Search => "Search",
            Screen::Pair => "",
        };
        let items: Vec<ListItem> = match app.screen {
            Screen::Artists => app
                .artists
                .iter()
                .map(|a| ListItem::new(a.name.clone()))
                .collect(),
            Screen::Albums => app
                .albums
                .iter()
                .map(|a| ListItem::new(format!("{} — {}", a.artist_name, a.name)))
                .collect(),
            Screen::Tracks | Screen::Search => app
                .tracks
                .iter()
                .map(|t| ListItem::new(format!("{} — {}", t.artist_name, t.title)))
                .collect(),
            Screen::Pair => Vec::new(),
        };
        let list = List::new(items)
            .block(Block::default().borders(Borders::ALL).title(title))
            .highlight_style(Style::default().add_modifier(Modifier::REVERSED))
            .highlight_symbol("> ");
        frame.render_stateful_widget(list, chunks[0], &mut app.list);
    }

    let playing = app.now_playing.clone().unwrap_or_else(|| "Nothing playing locally".into());
    let search = if app.searching {
        format!(" /{}", app.search_input)
    } else {
        String::new()
    };
    let err = app.error.clone().unwrap_or_default();
    let footer = Line::from(vec![
        Span::raw(format!("{playing}  |  {}{search}  ", app.status)),
        Span::styled(err, Style::default().add_modifier(Modifier::BOLD)),
        Span::raw("  q quit  enter open  space stop  n/p skip  / search"),
    ]);
    frame.render_widget(
        Paragraph::new(footer).block(Block::default().borders(Borders::ALL).title("Status")),
        chunks[1],
    );
}
