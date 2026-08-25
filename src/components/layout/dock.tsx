import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Library, MessageCircle, Search, Settings } from "lucide-react-native";
import { usePendingApk } from "@/hooks/use-app-update";
import { useCursor } from "@/hooks/use-cursor";
import { DOCK_HEIGHT, DOCK_MARGIN, useDock } from "@/lib/dock-context";
import { webInteractiveStyle } from "@/lib/interactive";
import { usePlayerUi } from "@/lib/player/player-ui-context";
import { colors } from "@/lib/theme";
import { triggerSelectionUiHaptic } from "@/lib/ui-haptics";
import { USE_NATIVE_DRIVER } from "@/lib/use-native-driver";
import { useZone } from "@/lib/zone/zone-context";

const HIDE_SPRING = { damping: 22, stiffness: 280, mass: 0.85 };
const GLASS_FILL = "rgba(14, 13, 12, 0.94)";

function isHomeRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/";
  return normalized === "/" || normalized === "/index";
}

function DockButton({
  active,
  badge,
  label,
  onPress,
  children,
}: {
  active: boolean;
  badge?: boolean;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, novedad` : label}
      accessibilityState={{ selected: active }}
      onPress={() => {
        triggerSelectionUiHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        webInteractiveStyle(),
        {
          backgroundColor: active ? colors.sheetRaised : colors.sheet,
          borderColor: active ? colors.rule : "transparent",
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      {children}
      {badge ? <View pointerEvents="none" style={styles.badge} /> : null}
    </Pressable>
  );
}

function DockIcons() {
  const router = useRouter();
  const pathname = usePathname();
  const { zone } = useZone();
  const apkPending = usePendingApk();
  const { chatOpen, chatUnread, setChatOpen } = useCursor();
  const homeActive = isHomeRoute(pathname);
  const libraryActive =
    pathname.startsWith("/library") ||
    pathname.startsWith("/album") ||
    pathname.startsWith("/artist") ||
    pathname.startsWith("/imported") ||
    pathname.startsWith("/wealth") ||
    pathname.startsWith("/focus") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/project") ||
    pathname.startsWith("/task");
  const searchActive = pathname.startsWith("/search");
  const settingsActive = pathname.startsWith("/settings");
  const libraryLabel = zone === "wealth" ? "Libro" : "Biblioteca";

  return (
    <>
      <DockButton
        active={homeActive}
        label="Inicio"
        onPress={() => {
          if (isHomeRoute(pathname)) return;
          router.push("/");
        }}
      >
        <Home color={homeActive ? colors.ink : colors.muted} size={26} strokeWidth={1.75} />
      </DockButton>
      <DockButton
        active={searchActive}
        label="Buscar"
        onPress={() => {
          if (pathname.startsWith("/search")) return;
          router.push("/search");
        }}
      >
        <Search color={searchActive ? colors.ink : colors.muted} size={26} strokeWidth={1.75} />
      </DockButton>
      <DockButton
        active={chatOpen}
        badge={chatUnread}
        label="Mensajes"
        onPress={() => setChatOpen(true)}
      >
        <MessageCircle color={chatOpen ? colors.ink : colors.muted} size={26} strokeWidth={1.75} />
      </DockButton>
      <DockButton
        active={libraryActive}
        label={libraryLabel}
        onPress={() => {
          if (pathname === "/library" || pathname.replace(/\/$/, "") === "/library") return;
          router.push("/library");
        }}
      >
        <Library color={libraryActive ? colors.ink : colors.muted} size={26} strokeWidth={1.75} />
      </DockButton>
      <DockButton
        active={settingsActive}
        badge={apkPending}
        label="Ajustes"
        onPress={() => {
          if (pathname.startsWith("/settings")) return;
          router.push("/settings");
        }}
      >
        <Settings color={settingsActive ? colors.ink : colors.muted} size={26} strokeWidth={1.75} />
      </DockButton>
    </>
  );
}

function glassChrome() {
  return Platform.OS === "web"
    ? ({
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      } as object)
    : { elevation: 24 };
}

export function Dock() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const dock = useDock();
  const { nowPlayingOpen } = usePlayerUi();
  const progress = useRef(new Animated.Value(0)).current;

  const watching = pathname === "/watch" || pathname.startsWith("/watch/");
  const visible = (dock?.visible ?? true) && !nowPlayingOpen && !watching;
  const hiddenOffset = DOCK_HEIGHT + insets.bottom + 24;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: visible ? 0 : 1,
      ...HIDE_SPRING,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [progress, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, hiddenOffset],
  });
  const scaleX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.78],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        { bottom: DOCK_MARGIN + insets.bottom },
        Platform.OS === "web" ? ({ position: "fixed" } as object) : null,
      ]}
    >
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[
          styles.pill,
          {
            backgroundColor: GLASS_FILL,
            borderColor: colors.rule,
            transform: [{ translateY }, { scaleX }],
            ...glassChrome(),
          },
        ]}
      >
        <DockIcons />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 40,
    elevation: 24,
    paddingHorizontal: 20,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: DOCK_HEIGHT,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.void,
  },
});
