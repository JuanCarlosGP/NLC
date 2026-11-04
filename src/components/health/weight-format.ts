export function weightNumber(value: number | null, locale: string): string {
  return value == null ? "—" : value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function weightDate(value: string, locale: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
