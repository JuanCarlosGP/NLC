import { leading, textSize } from "@/lib/appearance/density";
import { Platform, type TextStyle } from "react-native";
import { classicPalette, classicWebFonts, type Palette } from "./appearance/themes";

export const colors = Object.fromEntries(Object.entries(classicPalette).map(([key, value]) => [key,
  Platform.OS === "web" ? `var(--nlc-color-${key}, ${value})` : value,
])) as Readonly<Palette>;

const font = (key: keyof typeof classicWebFonts, native: string) => Platform.OS === "web" ? `var(--nlc-font-${key})` : native;
export const fonts = {
  sans: font("sans", "Figtree_400Regular"),
  sansMedium: font("sansMedium", "Figtree_500Medium"),
  sansSemiBold: font("sansSemiBold", "Figtree_600SemiBold"),
  sansBold: font("sansBold", "Figtree_700Bold"),
  serif: font("serif", "InstrumentSerif_400Regular"),
} as const;

export const type = {
  pageTitle: {
    fontFamily: fonts.serif,
    fontSize: textSize(32),
    lineHeight: leading(38),
    letterSpacing: -0.4,
    color: colors.ink,
  } satisfies TextStyle,
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: textSize(20),
    lineHeight: leading(26),
    color: colors.ink,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: textSize(15),
    lineHeight: leading(22),
    color: colors.inkSoft,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: textSize(12),
    lineHeight: leading(16),
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  } satisfies TextStyle,
  track: {
    fontFamily: fonts.sansMedium,
    fontSize: textSize(15),
    lineHeight: leading(20),
    color: colors.ink,
  } satisfies TextStyle,
  meta: {
    fontFamily: fonts.sans,
    fontSize: textSize(13),
    lineHeight: leading(18),
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
