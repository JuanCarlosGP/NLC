import { LibraryTile } from "@/components/library/library-tile";
import { useCoverUrl } from "@/hooks/use-cover-url";
import type { Album } from "@/lib/nas/types";

export function AlbumTile({
  album,
  coverUri,
  subtitle,
  onPress,
  onLongPress,
}: {
  album: Album;
  coverUri?: string | null;
  subtitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const nasCover = useCoverUrl(coverUri ? null : album.coverId);
  return (
    <LibraryTile
      id={album.id}
      title={album.name}
      subtitle={subtitle ?? album.artistName}
      uri={coverUri ?? nasCover}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}

export function ArtistTile({
  id,
  name,
  subtitle,
  coverId,
  onPress,
}: {
  id: string;
  name: string;
  subtitle: string;
  coverId?: string | null;
  onPress: () => void;
}) {
  const cover = useCoverUrl(coverId);
  return (
    <LibraryTile id={id} title={name} subtitle={subtitle} uri={cover} round onPress={onPress} />
  );
}
