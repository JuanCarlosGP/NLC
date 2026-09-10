use ratatui::style::{Color, Modifier, Style};

pub fn accent() -> Color {
    Color::Rgb(228, 213, 184)
}

pub fn ink() -> Color {
    Color::Rgb(240, 235, 227)
}

pub fn muted() -> Color {
    Color::Rgb(140, 133, 124)
}

pub fn ok() -> Color {
    Color::Rgb(143, 184, 154)
}

pub fn danger() -> Color {
    Color::Rgb(201, 137, 128)
}

pub fn track() -> Color {
    Color::Rgb(42, 38, 34)
}

pub fn border() -> Style {
    Style::default().fg(Color::Rgb(58, 53, 48))
}

pub fn focus_border() -> Style {
    Style::default().fg(accent())
}

pub fn title() -> Style {
    Style::default().fg(accent()).add_modifier(Modifier::BOLD)
}

pub fn text() -> Style {
    Style::default().fg(ink())
}

pub fn dim() -> Style {
    Style::default().fg(muted())
}

pub fn highlight() -> Style {
    Style::default()
        .bg(accent())
        .fg(Color::Rgb(14, 13, 12))
        .add_modifier(Modifier::BOLD)
}

pub fn playing() -> Style {
    Style::default().fg(ok()).add_modifier(Modifier::BOLD)
}

pub fn error() -> Style {
    Style::default().fg(danger()).add_modifier(Modifier::BOLD)
}
