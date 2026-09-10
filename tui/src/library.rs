use crate::client::Album;

pub fn is_songs_folder(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case("canciones")
}

pub fn is_podcast_folder(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case("podcasts")
}

pub fn is_loose_album(album: &Album) -> bool {
    album.id == "album:canciones" || is_songs_folder(&album.artist_name) || is_songs_folder(&album.name)
}

pub fn is_podcast_album(album: &Album) -> bool {
    is_podcast_folder(&album.artist_name)
        || is_podcast_folder(&album.name)
        || album.id.eq_ignore_ascii_case("album:podcasts")
        || album.id.to_lowercase().contains("/podcasts/")
}

pub fn listed_albums(albums: &[Album]) -> Vec<Album> {
    albums
        .iter()
        .filter(|album| !is_podcast_album(album))
        .cloned()
        .collect()
}

pub fn loose_albums(albums: &[Album]) -> Vec<Album> {
    albums
        .iter()
        .filter(|album| !is_podcast_album(album) && is_loose_album(album))
        .cloned()
        .collect()
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
    fn lists_albums_including_canciones_folders() {
        let albums = vec![
            album("a1", "In Rainbows", "Radiohead"),
            album("album:canciones", "Canciones", "Canciones"),
            album("a2", "Canciones", "Ada"),
            album("p1", "Show", "Podcasts"),
        ];
        let listed = listed_albums(&albums);
        assert_eq!(listed.len(), 3);
        assert_eq!(loose_albums(&albums).len(), 2);
    }
}
