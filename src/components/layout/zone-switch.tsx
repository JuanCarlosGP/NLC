import { Pressable, StyleSheet, View } from "react-native";
import { Clapperboard, Mic, Music2, SquareCheck } from "lucide-react-native";
import { useZone, type AppZone } from "@/lib/zone/zone-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors } from "@/lib/theme";

const OPTIONS: { id: AppZone; label: string; Icon: typeof Music2 }[] = [
  { id: "music", label: "Música", Icon: Music2 },
  { id: "podcast", label: "Podcasts", Icon: Mic },
  { id: "video", label: "Vídeo", Icon: Clapperboard },
  { id: "focus", label: "Productividad", Icon: SquareCheck },
];

export function ZoneSwitch() {
  const { zone, setZone } = useZone();

  return (
    <View style={styles.switch}>
      {OPTIONS.map((item) => {
        const active = zone === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              triggerUiHaptic();
              setZone(item.id);
            }}
            style={[styles.btn, active && styles.btnActive]}
          >
            <item.Icon size={16} color={active ? colors.void : colors.inkSoft} strokeWidth={1.9} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    backgroundColor: colors.sheet,
    padding: 3,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    backgroundColor: colors.ink,
  },
});
