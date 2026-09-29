use std::collections::{HashMap, HashSet};
use std::io::{self, Write};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;

use base64::Engine;
use image::imageops::FilterType;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};

use crate::client::BridgeClient;

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct CoverArt {
    pub lines: Vec<Line<'static>>,
    pub width: u16,
    pub height: u16,
}

#[derive(Clone, Debug)]
pub struct CoverPair {
    pub mini: CoverArt,
    pub large: CoverArt,
    /// JPEG or PNG sent to the browser terminal as a real image.
    pub bytes: Arc<Vec<u8>>,
}

/// Set by the ttyd launcher. The desktop TUI keeps half-block covers.
pub fn web_covers() -> bool {
    std::env::var("NLC_WEB").ok().as_deref() == Some("1")
}

#[derive(Clone)]
pub struct WebCoverPaint {
    pub key: String,
    pub area: Rect,
    pub bytes: Arc<Vec<u8>>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct WebCoverStamp {
    key: String,
    x: u16,
    y: u16,
    w: u16,
    h: u16,
    cols: u16,
    rows: u16,
}

/// iTerm2 inline image. ttyd draws it on the page when started with `enableSixel`.
pub fn iterm_inline(bytes: &[u8], width: u16, height: u16) -> String {
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!(
        "\u{1b}]1337;File=inline=1;size={};width={width};height={height};preserveAspectRatio=0:{b64}\u{7}",
        bytes.len(),
    )
}

pub fn render_halfblocks(img_bytes: &[u8], target_width: u32, target_height_lines: u32) -> Option<CoverArt> {
    let img = image::load_from_memory(img_bytes).ok()?;
    let pixel_w = target_width;
    let pixel_h = target_height_lines * 2;
    let resized = img.resize_exact(pixel_w, pixel_h, FilterType::Triangle);
    let rgb = resized.to_rgba8();

    let mut lines = Vec::with_capacity(target_height_lines as usize);

    for y in 0..target_height_lines {
        let top_y = y * 2;
        let bot_y = top_y + 1;
        let mut spans = Vec::with_capacity(target_width as usize);

        for x in 0..target_width {
            let top_p = rgb.get_pixel(x, top_y);
            let bot_p = rgb.get_pixel(x, bot_y);

            let top_color = if top_p[3] > 32 {
                Color::Rgb(top_p[0], top_p[1], top_p[2])
            } else {
                Color::Rgb(24, 22, 20)
            };
            let bot_color = if bot_p[3] > 32 {
                Color::Rgb(bot_p[0], bot_p[1], bot_p[2])
            } else {
                Color::Rgb(24, 22, 20)
            };

            let style = Style::default().fg(top_color).bg(bot_color);
            spans.push(Span::styled("▀", style));
        }
        lines.push(Line::from(spans));
    }

    Some(CoverArt {
        lines,
        width: target_width as u16,
        height: target_height_lines as u16,
    })
}

fn cover_payload(bytes: &[u8]) -> Vec<u8> {
    let Ok(img) = image::load_from_memory(bytes) else {
        return bytes.to_vec();
    };
    let jpeg = bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8;
    if jpeg && bytes.len() <= 150 * 1024 && img.width() <= 512 && img.height() <= 512 {
        return bytes.to_vec();
    }
    let scaled = if img.width() > 512 || img.height() > 512 {
        img.resize(512, 512, FilterType::Triangle)
    } else {
        img
    };
    let rgb = scaled.to_rgb8();
    let mut out = Vec::new();
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 80);
    if enc
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .is_ok()
    {
        out
    } else {
        bytes.to_vec()
    }
}

pub fn flush_web_cover(
    paint: Option<&WebCoverPaint>,
    stamp: &mut Option<WebCoverStamp>,
    cols: u16,
    rows: u16,
) -> io::Result<()> {
    if !web_covers() {
        return Ok(());
    }
    let Some(paint) = paint else {
        *stamp = None;
        return Ok(());
    };
    if paint.area.width == 0 || paint.area.height == 0 || paint.bytes.is_empty() {
        *stamp = None;
        return Ok(());
    }
    let next = WebCoverStamp {
        key: paint.key.clone(),
        x: paint.area.x,
        y: paint.area.y,
        w: paint.area.width,
        h: paint.area.height,
        cols,
        rows,
    };
    if stamp.as_ref() == Some(&next) {
        return Ok(());
    }
    let mut out = io::stdout().lock();
    let area = paint.area;
    for row in 0..area.height {
        write!(
            out,
            "\x1b[{};{}H{:width$}",
            area.y + row + 1,
            area.x + 1,
            "",
            width = area.width as usize
        )?;
    }
    write!(out, "\x1b[{};{}H", area.y + 1, area.x + 1)?;
    write!(out, "{}", iterm_inline(&paint.bytes, area.width, area.height))?;
    out.flush()?;
    *stamp = Some(next);
    Ok(())
}

type CoverMsg = (String, Option<Arc<CoverPair>>);

pub struct CoverLoader {
    tx: mpsc::Sender<CoverMsg>,
    rx: mpsc::Receiver<CoverMsg>,
    cache: HashMap<String, Option<Arc<CoverPair>>>,
    pending: HashSet<String>,
}

impl Default for CoverLoader {
    fn default() -> Self {
        Self::new()
    }
}

impl CoverLoader {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel();
        Self {
            tx,
            rx,
            cache: HashMap::new(),
            pending: HashSet::new(),
        }
    }

    pub fn poll(&mut self) {
        while let Ok((key, maybe_pair)) = self.rx.try_recv() {
            self.pending.remove(&key);
            self.cache.insert(key, maybe_pair);
        }
    }

    pub fn get(&self, key: &str) -> Option<Arc<CoverPair>> {
        self.cache.get(key).and_then(|v| v.as_ref().cloned())
    }

    pub fn is_loading(&self, key: &str) -> bool {
        self.pending.contains(key.trim())
    }

    pub fn request(&mut self, client: &BridgeClient, key: &str) {
        let trimmed = key.trim();
        if trimmed.is_empty() || self.cache.contains_key(trimmed) || self.pending.contains(trimmed) {
            return;
        }

        self.pending.insert(trimmed.to_string());
        let tx = self.tx.clone();
        let client = client.clone();
        let key_str = trimmed.to_string();

        thread::spawn(move || {
            let pair = client.cover_bytes(&key_str).ok().and_then(|bytes| {
                let mini = render_halfblocks(&bytes, 10, 5)?;
                let large = render_halfblocks(&bytes, 34, 17)?;
                Some(CoverPair {
                    mini,
                    large,
                    bytes: Arc::new(cover_payload(&bytes)),
                })
            });
            let _ = tx.send((key_str, pair.map(Arc::new)));
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_halfblocks_from_synthetic_image() {
        use image::{Rgb, RgbImage};
        let mut img = RgbImage::new(4, 4);
        for x in 0..4 {
            for y in 0..4 {
                img.put_pixel(x, y, Rgb([255, 0, 0]));
            }
        }
        let mut bytes = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();

        let art = render_halfblocks(&bytes, 2, 1).expect("Failed to render halfblocks");
        assert_eq!(art.width, 2);
        assert_eq!(art.height, 1);
        assert_eq!(art.lines.len(), 1);
        assert_eq!(art.lines[0].spans.len(), 2);
    }

    #[test]
    fn iterm_inline_names_size_and_cells() {
        let seq = iterm_inline(b"hi", 10, 5);
        assert!(seq.starts_with("\u{1b}]1337;File=inline=1;size=2;width=10;height=5;preserveAspectRatio=0:"));
        assert!(seq.ends_with("aGk=\u{7}"));
    }
}
