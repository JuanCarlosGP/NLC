use std::collections::{HashMap, HashSet};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;

use image::imageops::FilterType;
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
                Some(CoverPair { mini, large })
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
}
