import { numberLocale } from "@/lib/i18n/runtime";

const euroOptions: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
};

let cachedLocale = "";
let euro: Intl.NumberFormat;
let compact: Intl.NumberFormat;

function formatters() {
  const locale = numberLocale();
  if (cachedLocale !== locale) {
    cachedLocale = locale;
    euro = new Intl.NumberFormat(locale, euroOptions);
    compact = new Intl.NumberFormat(locale, { ...euroOptions, notation: "standard" });
  }
  return { euro, compact };
}

export function formatEuro(value: number): string {
  const { euro, compact } = formatters();
  if (!Number.isFinite(value)) return compact.format(0);
  return euro.format(value);
}

export function formatSignedEuro(value: number): string {
  const formatted = formatEuro(Math.abs(value));
  if (value > 0.004) return `+${formatted}`;
  if (value < -0.004) return `−${formatted}`;
  return formatted;
}

export function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const body = abs.toLocaleString(numberLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (value > 0.0005) return `▲ ${body} %`;
  if (value < -0.0005) return `▼ ${body} %`;
  return `${body} %`;
}

const JUNK = /[\s\u00a0\u202f€$£]/g;

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(value * factor) / factor;
}

export function roundMoney(value: number): number {
  return roundTo(value, 2);
}

/** Display in the field after blur: 1234.5 → "1.234,5" or "1,234.5". */
export function formatAmountInput(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "";
  return roundTo(value, decimals).toLocaleString(numberLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
}

/** Placeholder that matches the active decimal style: 0,00 vs 0.00. */
export function amountPlaceholder(value = 0, decimals = 2): string {
  return roundTo(value, decimals).toLocaleString(numberLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
}

/** Keep digits, comma, dot and a leading minus while typing. */
export function sanitizeAmountInput(raw: string): string {
  const trimmed = raw.replace(JUNK, "");
  const negative = trimmed.startsWith("-") || trimmed.startsWith("−");
  const body = trimmed.replace(/[^\d.,]/g, "");
  if (negative) return body ? `-${body}` : "-";
  return body;
}

/**
 * Money uses Spanish grouping (1.234,56) and also accepts 10.5 / 10,5.
 * A single separator with exactly 3 digits is thousands for money (`10.000` → 10000)
 * and a decimal for quantities (`10.000` shares → 10).
 */
export function parseAmount(raw: string, decimals = 2): number | null {
  const sanitized = sanitizeAmountInput(raw);
  if (!sanitized || sanitized === "-" || sanitized === "," || sanitized === ".") return null;
  const negative = sanitized.startsWith("-");
  const s = sanitized.replace(/^-/, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = withSingleSeparator(s, ",", decimals);
  } else if (lastDot >= 0) {
    normalized = withSingleSeparator(s, ".", decimals);
  } else {
    normalized = s;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return roundTo(negative ? -value : value, decimals);
}

function withSingleSeparator(s: string, sep: "," | ".", decimals: number): string {
  const parts = s.split(sep);
  if (parts.length > 2) return parts.join("");
  const intPart = parts[0] ?? "";
  const frac = parts[1] ?? "";
  if (!frac) return intPart || "0";
  if (!intPart || intPart === "0") return `${intPart || "0"}.${frac}`;
  if (frac.length <= 2) return `${intPart}.${frac}`;
  if (frac.length === 3 && decimals <= 2 && intPart.length <= 3) return `${intPart}${frac}`;
  return `${intPart}.${frac}`;
}
