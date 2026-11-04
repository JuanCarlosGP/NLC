import { leading, textSize, isStyleFactory, isNativePixel } from "@/lib/appearance/density";
import { Platform, type TextStyle } from "react-native";
import { classicPalette, pixelPalette, type Palette } from "./appearance/themes";
import { getNativeAppearance } from "./appearance/native-store";

// The exported records remain stable; their values come from the active native
// appearance. UI consumers subscribe with useThemeId and sheet factories resolve
// them lazily, so switching themes never mutates a frozen StyleSheet.
function liveRecord<T extends object>(keys: (keyof T)[], read: (key: keyof T) => T[keyof T]): Readonly<T> {
  const record = {} as T;
  for (const key of keys) Object.defineProperty(record,key,{ enumerable:true, get:() => read(key) });
  return record;
}
export const colors = liveRecord<Palette>(Object.keys(classicPalette) as (keyof Palette)[], key =>
  Platform.OS === "web" ? `var(--nlc-color-${key}, ${classicPalette[key]})` : (isNativePixel() ? pixelPalette : classicPalette)[key],
);
const nativeFonts = {
  sans: "Figtree_400Regular", sansMedium: "Figtree_500Medium",
  sansSemiBold: "Figtree_600SemiBold", sansBold: "Figtree_700Bold",
  serif: "InstrumentSerif_400Regular",
};
export const fonts = liveRecord<typeof nativeFonts>(Object.keys(nativeFonts) as (keyof typeof nativeFonts)[], key =>
  Platform.OS === "web" ? `var(--nlc-font-${key})` : isNativePixel() ? "GeistPixelSquare" : nativeFonts[key],
);

function typography() { return {
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
}; }
type Typography = ReturnType<typeof typography>;
const typographyCache = new Map<string,Typography>();
const textRoles: (keyof Typography)[] = ["pageTitle","sectionTitle","body","label","track","meta"];
export const type = liveRecord<Typography>(textRoles,key => {
  // A factory consumes the original metrics; direct/inline styles consume the
  // compact ones. This prevents an inherited text role being scaled twice.
  const id = `${Platform.OS}:${getNativeAppearance()}:${isStyleFactory()}`;
  if (!typographyCache.has(id)) {
    const tokens = typography();
    if (isNativePixel()) for (const role of Object.values(tokens)) {
      Object.assign(role,{ letterSpacing:0, includeFontPadding:false, fontWeight:"400" });
    }
    typographyCache.set(id,tokens);
  }
  return typographyCache.get(id)![key];
});

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
