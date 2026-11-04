import { densityVariables } from "./metrics";
export const APPEARANCE_KEY = "nlc.appearance.v1";
export type AppearanceId = "classic" | "geist-pixel";
export function parseAppearance(raw: string | null): AppearanceId {
  return raw === "geist-pixel" ? "geist-pixel" : "classic";
}

export const classicPalette = {
  void: "#0E0D0C", sheet: "#161412", sheetRaised: "#1C1A17", sheetHover: "#24211D",
  ink: "#F0EBE3", inkSoft: "#C4BDB3", muted: "#8C857C", rule: "#2A2724", ruleLight: "#3A3530",
  accent: "#E4D5B8", accentText: "#0E0D0C", warn: "#C4A574", danger: "#C98980", ok: "#8FB89A",
  glass: "rgba(14, 13, 12, 0.94)", glassSoft: "rgba(14, 13, 12, 0.28)",
  backdrop: "rgba(8, 7, 6, 0.72)", ripple: "rgba(240, 235, 227, 0.12)",
  accentWash: "rgba(228, 213, 184, 0.12)", accentWashSoft: "rgba(228, 213, 184, 0.1)",
  accentWashFaint: "rgba(228, 213, 184, 0.08)", accentRule: "rgba(228, 213, 184, 0.28)",
  dangerWash: "rgba(201, 137, 128, 0.14)", okWash: "rgba(143, 184, 154, 0.16)",
} as const;
export type Palette = { [Key in keyof typeof classicPalette]: string };
export const pixelPalette: Palette = {
  void: "#000000", sheet: "#000000", sheetRaised: "#0B0B0B", sheetHover: "#141414",
  ink: "#F5F5F5", inkSoft: "#BEBEBE", muted: "#858585", rule: "#242424", ruleLight: "#3A3A3A",
  accent: "#F5F5F5", accentText: "#000000", warn: "#BDBDBD", danger: "#F09090", ok: "#BFBFBF",
  glass: "rgba(0, 0, 0, 0.96)", glassSoft: "rgba(0, 0, 0, 0.4)",
  backdrop: "rgba(0, 0, 0, 0.82)", ripple: "rgba(255, 255, 255, 0.12)",
  accentWash: "rgba(255, 255, 255, 0.08)", accentWashSoft: "rgba(255, 255, 255, 0.06)",
  accentWashFaint: "rgba(255, 255, 255, 0.04)", accentRule: "rgba(255, 255, 255, 0.24)",
  dangerWash: "rgba(240, 144, 144, 0.1)", okWash: "rgba(255, 255, 255, 0.08)",
};
export const classicWebFonts = {
  sans: "Figtree, system-ui, sans-serif", sansMedium: "Figtree, system-ui, sans-serif",
  sansSemiBold: "Figtree, system-ui, sans-serif", sansBold: "Figtree, system-ui, sans-serif",
  serif: "Instrument Serif, Georgia, serif",
};
export function appearanceVariables(id: AppearanceId): Record<string, string> {
  const palette = id === "geist-pixel" ? pixelPalette : classicPalette;
  return {
    ...densityVariables(id === "geist-pixel"),
    ...Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--nlc-color-${key}`, value])),
    ...Object.fromEntries(Object.entries(classicWebFonts).map(([key, value]) => [`--nlc-font-${key}`, id === "geist-pixel" ? '"GeistPixelSquare", monospace' : value])),
  };
}
