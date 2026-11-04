import { Platform, StyleSheet, type DimensionValue } from "react-native";
import { metricScales, type MetricFamily } from "./metrics";
import { getNativeAppearance } from "./native-store";

let factoryDepth = 0;
export function isStyleFactory() { return factoryDepth > 0; }
export function isNativePixel() { return Platform.OS !== "web" && getNativeAppearance() === "geist-pixel"; }
function nativeMetric(family: MetricFamily, value: number) {
  const sign = value < 0 ? -1 : 1;
  return sign * (metricScales[family][Math.abs(value)] ?? Math.abs(value));
}

function metric(family: MetricFamily, value: number): number {
  const original = Math.abs(value);
  if (Platform.OS !== "web") return isNativePixel() && !isStyleFactory() ? nativeMetric(family, value) : value;
  if (!Object.hasOwn(metricScales[family], original)) return value;
  const token = `var(--nlc-${family}-${original}, ${original}px)`;
  // RN Web accepts CSS lengths. Keep this cast at the platform boundary; native
  // styles always receive numbers. These helpers are for styles, not geometry.
  return (value < 0 ? `calc(-1 * ${token})` : token) as unknown as number;
}

export const space = (value: number): number => metric("space", value);
export const textSize = (value: number): number => metric("text", value);
export const leading = (value: number): number => metric("leading", value);
export const radius = (value: number): number => isNativePixel() ? 0 : value;

export function insetSpace(inset: number, value: number): number {
  return Platform.OS === "web"
    ? `calc(${inset}px + var(--nlc-space-${value}, ${value}px))` as unknown as number
    : inset + space(value);
}

const spacingProperties = new Set([
  "gap", "rowGap", "columnGap", "padding", "paddingHorizontal", "paddingVertical",
  "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "paddingStart", "paddingEnd",
  "margin", "marginHorizontal", "marginVertical", "marginTop", "marginBottom",
  "marginLeft", "marginRight", "marginStart", "marginEnd",
]);

// Factories keep every palette/font lookup live. Sheets are cached per theme,
// with new style identities on a change; frozen RN StyleSheets are never mutated.
// Only presentation metrics change. Geometry, hit areas and animation values do not.
export function createStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  source: () => T & StyleSheet.NamedStyles<any>,
): T {
  function evaluate() {
    factoryDepth++;
    try { return source(); }
    finally { factoryDepth--; }
  }
  function compile(styles: T): T {
    const pixel = isNativePixel();
    const themed = Object.fromEntries(Object.entries(styles).map(([name, style]) => {
      const result: Record<string, unknown> = {};
      for (const [property, value] of Object.entries(style)) {
        let next = value;
        if (typeof value === "number") {
          if (spacingProperties.has(property)) next = Platform.OS === "web" ? space(value) : pixel ? nativeMetric("space",value) : value;
          else if (property === "fontSize") next = Platform.OS === "web" ? textSize(value) : pixel ? nativeMetric("text",value) : value;
          else if (property === "lineHeight") next = Platform.OS === "web" ? leading(value) : pixel ? nativeMetric("leading",value) : value;
        }
        if (pixel) {
          if (property.startsWith("border") && property.endsWith("Radius")) next = 0;
          if (["shadowOpacity","shadowRadius","letterSpacing"].includes(property)) next = 0;
          if (property === "fontWeight") next = "400";
        }
        result[property] = next;
      }
      if (pixel && ("elevation" in result || "shadowColor" in result)) { result.shadowColor = "transparent"; result.shadowOpacity = 0; result.shadowRadius = 0; }
      if (pixel && ("fontFamily" in result || "fontSize" in result)) { result.includeFontPadding = false; result.fontWeight = "400"; }
      return [name,result];
    })) as unknown as T;
    return StyleSheet.create(themed);
  }
  const initial = evaluate();
  if (Platform.OS === "web") return compile(initial);
  const cache = new Map<string,T>();
  cache.set(getNativeAppearance(),compile(initial));
  const result = {} as T;
  for (const key of Object.keys(initial)) Object.defineProperty(result,key,{ enumerable:true, get() {
    if (isStyleFactory()) return evaluate()[key as keyof T];
    const id = getNativeAppearance();
    if (!cache.has(id)) cache.set(id,compile(evaluate()));
    return cache.get(id)![key as keyof T];
  } });
  return result;
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
