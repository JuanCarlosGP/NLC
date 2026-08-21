import { Platform, type TextStyle } from "react-native";

export const colors = {
  void: "#0E0D0C",
  sheet: "#161412",
  sheetRaised: "#1C1A17",
  sheetHover: "#24211D",
  ink: "#F0EBE3",
  inkSoft: "#C4BDB3",
  muted: "#8C857C",
  rule: "#2A2724",
  ruleLight: "#3A3530",
  accent: "#E4D5B8",
  accentText: "#0E0D0C",
  warn: "#C4A574",
  danger: "#C98980",
  ok: "#8FB89A",
} as const;

export const fonts = {
  sans: Platform.select({ web: "Figtree, system-ui, sans-serif", default: "Figtree_400Regular" }),
  sansMedium: Platform.select({
    web: "Figtree, system-ui, sans-serif",
    default: "Figtree_500Medium",
  }),
  sansSemiBold: Platform.select({
    web: "Figtree, system-ui, sans-serif",
    default: "Figtree_600SemiBold",
  }),
  sansBold: Platform.select({
    web: "Figtree, system-ui, sans-serif",
    default: "Figtree_700Bold",
  }),
  serif: Platform.select({
    web: "Instrument Serif, Georgia, serif",
    default: "InstrumentSerif_400Regular",
  }),
} as const;

export const type = {
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: colors.ink,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  } satisfies TextStyle,
  track: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  } satisfies TextStyle,
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  } satisfies TextStyle,
};

export const layout = {
  dockHeight: 68,
  dockMargin: 14,
  miniPlayerHeight: 62,
  miniPlayerGap: 10,
  screenPad: 20,
} as const;

export function coverTint(id: string): string {
  const palettes = ["#3A3229", "#2C3330", "#3A2E2E", "#2E3140", "#353029"];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return palettes[hash % palettes.length];
}
