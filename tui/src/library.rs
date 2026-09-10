use crate::client::{Album, Track};

pub fn is_imported_playlist(album: &Album) -> bool {
    album.id.starts_with("playlist:")
}

fn is_podcast_folder(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case("podcasts")
}

pub fn is_podcast_album(album: &Album) -> bool {
    is_podcast_folder(&album.artist_name)
        || is_podcast_folder(&album.name)
        || album.id.eq_ignore_ascii_case("album:podcasts")
        || album.id.to_lowercase().contains("/podcasts/")
}

pub fn is_podcast_track(track: &Track) -> bool {
    is_podcast_folder(&track.artist_name)
        || is_podcast_folder(&track.album_name)
        || track.id.to_lowercase().contains("/podcasts/")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn album(id: &str, name: &str, artist: &str) -> Album {
        Album {
            id: id.into(),
            name: name.into(),
            artist_name: artist.into(),
        }
    }

    #[test]
    fn imported_playlists_are_prefixed() {
        let playlist = album("playlist:abc", "★", "me");
        assert!(is_imported_playlist(&playlist));
        assert!(!is_podcast_album(&playlist));
        assert!(!is_imported_playlist(&album("a1", "In Rainbows", "Radiohead")));
    }

    #[test]
    fn podcasts_are_filtered_from_music() {
        assert!(is_podcast_album(&album("p1", "Show", "Podcasts")));
        assert!(!is_podcast_album(&album("a1", "In Rainbows", "Radiohead")));
    }
}
