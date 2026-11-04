import { Platform, StyleSheet, type DimensionValue } from "react-native";
import { metricScales, type MetricFamily } from "./metrics";

function metric(family: MetricFamily, value: number): number {
  const original = Math.abs(value);
  if (Platform.OS !== "web" || !Object.hasOwn(metricScales[family], original)) return value;
  const token = `var(--nlc-${family}-${original}, ${original}px)`;
  // RN Web accepts CSS lengths. Keep this cast at the platform boundary; native
  // styles always receive numbers. These helpers are for styles, not geometry.
  return (value < 0 ? `calc(-1 * ${token})` : token) as unknown as number;
}

export const space = (value: number): number => metric("space", value);
export const textSize = (value: number): number => metric("text", value);
export const leading = (value: number): number => metric("leading", value);

export function insetSpace(inset: number, value: number): number {
  return Platform.OS === "web"
    ? `calc(${inset}px + var(--nlc-space-${value}, ${value}px))` as unknown as number
    : inset + value;
}

const spacingProperties = new Set([
  "gap", "rowGap", "columnGap", "padding", "paddingHorizontal", "paddingVertical",
  "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "paddingStart", "paddingEnd",
  "margin", "marginHorizontal", "marginVertical", "marginTop", "marginBottom",
  "marginLeft", "marginRight", "marginStart", "marginEnd",
]);

// Same contract as StyleSheet.create. Only presentation values become CSS
// variables; widths, heights, hit areas, chart geometry and animations stay numeric.
export function createStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  styles: T & StyleSheet.NamedStyles<any>,
): T {
  if (Platform.OS !== "web") return StyleSheet.create(styles);
  const themed = Object.fromEntries(Object.entries(styles).map(([name, style]) => [name,
    Object.fromEntries(Object.entries(style).map(([property, value]) => [property,
      typeof value !== "number" ? value : spacingProperties.has(property) ? space(value)
        : property === "fontSize" ? textSize(value) : property === "lineHeight" ? leading(value) : value,
    ])),
  ])) as T;
  return StyleSheet.create(themed);
}

export function densityData(role: string): object {
  return Platform.OS === "web" ? { dataSet: { nlcUi: role } } : {};
}

export const pageFrame = Platform.OS === "web" ? {
  width: "100%" as const,
  maxWidth: "var(--nlc-page-max, 100%)" as unknown as number,
  alignSelf: "center" as const,
} : {};

export const responsiveBasis = (original: DimensionValue, token: string): DimensionValue =>
  Platform.OS === "web" ? `var(--nlc-${token}, ${original})` as DimensionValue : original;
