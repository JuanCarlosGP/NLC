import { dateLocale, numberLocale, tr } from "@/lib/i18n/runtime";
import { monthToDateChange } from "@/lib/wealth/compute";
import { formatEuro } from "@/lib/wealth/money";
import { listAccounts, listAssets, listQuotes, listTx } from "@/lib/wealth/store.internal";

export async function answerWealthMonth(): Promise<string> {
  const [accounts, assets, txs, quotes] = await Promise.all([
    listAccounts(), listAssets(), listTx(), listQuotes(),
  ]);
  const result = monthToDateChange(accounts, assets, txs, quotes);
  if (!result) return tr(
    "There are no recorded transactions or valuations through today.",
    "Todavía no hay movimientos ni valoraciones registrados hasta hoy.",
  );
  const start = new Date(result.start).toLocaleDateString(dateLocale(), { day: "numeric", month: "long" });
  const now = new Date(result.now).toLocaleDateString(dateLocale(), { day: "numeric", month: "long" });
  const percent = result.opening > 0
    ? ` (${new Intl.NumberFormat(numberLocale(), { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(result.change / result.opening)})`
    : "";
  const change = (result.change > 0 ? "+" : "") + formatEuro(result.change);
  return tr(
    `**${change}${percent}** from ${start} to ${now}. Recorded net worth went from ${formatEuro(result.opening)} to ${formatEuro(result.closing)}.`,
    `**${change}${percent}** del ${start} al ${now}. El patrimonio registrado pasó de ${formatEuro(result.opening)} a ${formatEuro(result.closing)}.`,
  );
}
