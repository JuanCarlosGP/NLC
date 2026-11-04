// Original sizes are the keys. Pixel uses a denser scale; Classic keeps every value.
export const pixelSpaces: Record<number, number> = {
  4: 4, 5: 4, 6: 4, 8: 6, 10: 8, 12: 8, 14: 10, 16: 12,
  18: 12, 20: 16, 22: 16, 24: 16, 26: 18, 28: 20, 30: 22,
  32: 24, 36: 24, 40: 28, 48: 36, 56: 40, 64: 48,
};
export const pixelTextSizes: Record<number, number> = {
  11: 11, 12: 12, 13: 12, 14: 13, 15: 14, 16: 14, 17: 15,
  18: 16, 19: 17, 20: 18, 21: 18, 22: 20, 24: 22, 26: 22,
  28: 24, 30: 26, 32: 26, 34: 28, 36: 30, 38: 30, 40: 32,
  44: 34, 46: 36, 48: 36, 52: 38, 56: 40, 64: 44, 72: 48,
};
export const pixelLineHeights: Record<number, number> = {
  14: 14, 16: 16, 17: 16, 18: 16, 20: 18, 22: 20, 24: 22,
  26: 24, 28: 24, 30: 26, 32: 28, 34: 30, 36: 30, 38: 32,
  40: 34, 42: 34, 44: 36, 48: 40, 52: 44, 56: 44, 64: 50, 72: 56,
};

export const metricScales = { space: pixelSpaces, text: pixelTextSizes, leading: pixelLineHeights };
export type MetricFamily = keyof typeof metricScales;

export function densityVariables(pixel: boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(metricScales).flatMap(([family, scale]) =>
    Object.entries(scale).map(([original, compact]) => [`--nlc-${family}-${original}`, `${pixel ? compact : original}px`]),
  ));
}
