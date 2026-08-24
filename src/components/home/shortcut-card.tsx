import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarDays, Clapperboard, FolderKanban, Heart, Inbox, Bell, Mic, Music2 } from "lucide-react-native";
import { Cover } from "@/components/ui/cover";
import { useCoverUrl } from "@/hooks/use-cover-url";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts } from "@/lib/theme";

export function ShortcutCard({
  id,
  title,
  coverId,
  uri,
  liked,
  podcast,
  music,
  video,
  focus,
  onPress,
  onLongPress,
}: {
  id: string;
  title: string;
  coverId?: string | null;
  uri?: string | null;
  liked?: boolean;
  podcast?: boolean;
  music?: boolean;
  video?: boolean;
  focus?: "today" | "inbox" | "projects" | "reminders";
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const nasCover = useCoverUrl(uri || liked || podcast || music || video || focus ? null : coverId);
  const cover = uri ?? nasCover;

  let art: React.ReactNode;
  if (liked && podcast) {
    art = (
      <View style={[styles.badge, styles.likedPodcast]}>
        <Heart color={colors.accent} fill={colors.accent} size={22} />
      </View>
    );
  } else if (liked && video) {
    art = (
      <View style={[styles.badge, styles.likedVideo]}>
        <Heart color={colors.accent} fill={colors.accent} size={22} />
      </View>
    );
  } else if (liked) {
    art = (
      <View style={[styles.badge, styles.liked]}>
        <Heart color={colors.accent} fill={colors.accent} size={22} />
      </View>
    );
  } else if (podcast) {
    art = (
      <View style={[styles.badge, styles.podcast]}>
        <Mic color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else if (music) {
    art = (
      <View style={[styles.badge, styles.music]}>
        <Music2 color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else if (video) {
    art = (
      <View style={[styles.badge, styles.video]}>
        <Clapperboard color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else if (focus === "today") {
    art = (
      <View style={[styles.badge, styles.focusToday]}>
        <CalendarDays color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else if (focus === "inbox") {
    art = (
      <View style={[styles.badge, styles.focusInbox]}>
        <Inbox color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else if (focus === "projects") {
    art = (
      <View style={[styles.badge, styles.focusProjects]}>
        <FolderKanban color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else if (focus === "reminders") {
    art = (
      <View style={[styles.badge, styles.focusReminders]}>
        <Bell color={colors.accent} size={22} strokeWidth={1.8} />
      </View>
    );
  } else {
    art = <Cover id={id} label={title} uri={cover} size={56} radius={0} />;
  }

  return (
    <Pressable
      onPress={() => {
        triggerSelectionUiHaptic();
        onPress();
      }}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.86 : 1 }]}
    >
      {art}
      <Text numberOfLines={2} style={styles.title}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: "47%",
    maxWidth: "49%",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: colors.sheetRaised,
    borderRadius: 6,
  },
  badge: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  liked: {
    backgroundColor: "#3A2E2E",
  },
  likedPodcast: {
    backgroundColor: "#2E3A32",
  },
  likedVideo: {
    backgroundColor: "#3A2E38",
  },
  podcast: {
    backgroundColor: "#2A322E",
  },
  music: {
    backgroundColor: "#2A3038",
  },
  video: {
    backgroundColor: "#322A38",
  },
  focusToday: {
    backgroundColor: "#353029",
  },
  focusInbox: {
    backgroundColor: "#2C3330",
  },
  focusProjects: {
    backgroundColor: "#2E3140",
  },
  focusReminders: {
    backgroundColor: "#3A3229",
  },
  title: {
    flex: 1,
    paddingHorizontal: 10,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 17,
    color: colors.ink,
  },
});
