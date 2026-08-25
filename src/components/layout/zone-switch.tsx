import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Clapperboard, Mic, Music2, SquareCheck, Wallet } from "lucide-react-native";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import { SheetScrollView } from "@/components/layout/sheet-scroll-view";
import { APP_ZONES, useZone, type AppZone, type EnabledZones } from "@/lib/zone/zone-context";
import { triggerUiHaptic } from "@/lib/ui-haptics";
import { colors, fonts, type } from "@/lib/theme";

const ICONS: Record<AppZone, typeof Music2> = {
  music: Music2,
  podcast: Mic,
  video: Clapperboard,
  focus: SquareCheck,
  wealth: Wallet,
};

export function zoneVisibilitySummary(enabled: EnabledZones): string {
  const visible = APP_ZONES.filter((item) => enabled[item.id]);
  if (visible.length === APP_ZONES.length) return "Todos visibles";
  return visible.map((item) => item.label).join(" · ") || "Ninguno";
}

export function ZoneSwitch() {
  const { zone, setZone, enabled } = useZone();
  const options = APP_ZONES.filter((item) => enabled[item.id]);
  if (options.length <= 1) return null;

  return (
    <View style={styles.switch}>
      {options.map((item) => {
        const active = zone === item.id;
        const Icon = ICONS[item.id];
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
            <Icon size={15} color={active ? colors.void : colors.inkSoft} strokeWidth={1.9} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ZoneVisibilitySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { enabled, setZoneEnabled } = useZone();

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      accessibilityCloseLabel="Cerrar apartados"
      viewportRatio={0.62}
    >
      <SheetScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleMeta}>
          <Text style={type.label}>Apartados</Text>
          <Text style={type.pageTitle}>Selector de zona</Text>
        </View>
        <Text style={styles.hint}>
          El selector solo enseña los que dejes encendidos. Tiene que quedar al menos uno.
        </Text>
        {APP_ZONES.map((item) => {
          const Icon = ICONS[item.id];
          const on = enabled[item.id];
          return (
            <View key={item.id} style={styles.visibilityRow}>
              <Icon size={18} color={on ? colors.ink : colors.inkSoft} strokeWidth={1.9} />
              <View style={styles.visibilityMeta}>
                <Text style={styles.option}>{item.label}</Text>
                <Text style={styles.visibilitySummary}>{on ? "Visible" : "Oculto"}</Text>
              </View>
              <Switch
                value={on}
                onValueChange={(next) => {
                  triggerUiHaptic();
                  setZoneEnabled(item.id, next);
                }}
                trackColor={{ false: colors.rule, true: colors.accent }}
                thumbColor={colors.ink}
              />
            </View>
          );
        })}
      </SheetScrollView>
    </BottomSheet>
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
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    backgroundColor: colors.ink,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 32,
    gap: 4,
  },
  titleMeta: {
    gap: 4,
    marginBottom: 8,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  option: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    flex: 1,
  },
  visibilityRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  visibilityMeta: {
    flex: 1,
    gap: 2,
  },
  visibilitySummary: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
});
