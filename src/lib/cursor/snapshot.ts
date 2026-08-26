import { getAlbums, getTracks, loadPlaylists } from "@/lib/db/catalog";
import { listProjects, listTasks } from "@/lib/productivity/store";
import { listAccounts, listAssets, listGoals, listTx } from "@/lib/wealth/store";
import { formatEuro } from "@/lib/wealth/money";
import { formatGoalEta, goalProgress, netWorth, cashTotal, holdingsValue, accountBalance, accountHoldings, accountTotal, assetValue, assetQty } from "@/lib/wealth/compute";
import { STATUS_LABEL } from "@/lib/productivity/types";
import { formatDue } from "@/lib/productivity/dates";
import { listReminders } from "@/lib/reminders/store";
import { formatReminderWhen } from "@/lib/reminders/types";
import { TX_KIND_LABEL } from "@/lib/wealth/types";
import type { AppZone } from "@/lib/zone/zone-context";

export async function buildAssistantSnapshot(zone: AppZone): Promise<string> {
  const [projects, tasks, playlists, music, podcasts, albums, accounts, assets, txs, reminders, goals] = await Promise.all([
    listProjects(),
    listTasks(),
    loadPlaylists(),
    getTracks({ kind: "music" }),
    getTracks({ kind: "podcast" }),
    getAlbums(),
    listAccounts(),
    listAssets(),
    listTx(),
    listReminders(),
    listGoals(),
  ]);

  const liveAccounts = accounts.filter((item) => !item.archived);
  const liveAssets = assets.filter((item) => !item.archived);
  const total = netWorth(liveAccounts, liveAssets, txs);
  const cash = cashTotal(liveAccounts, txs);
  const invested = holdingsValue(liveAssets);
  const assetLines = liveAssets.slice(0, 20).map((asset) => {
    const value = assetValue(asset);
    const account = liveAccounts.find((item) => item.id === asset.accountId)?.name;
    return `- ${asset.name}${asset.ticker ? ` (${asset.ticker})` : ""}${account ? ` · ${account}` : ""} · ${formatEuro(value)} · ${assetQty(asset)} × ${formatEuro(asset.price)}`;
  });
  const txLines = txs.slice(0, 24).map(
    (tx) => `- ${TX_KIND_LABEL[tx.kind]} ${formatEuro(tx.amount)} · ${tx.title}${tx.category ? ` · ${tx.category}` : ""}`,
  );
  const accountLines = liveAccounts.map((account) => {
    const cash = accountBalance(account.id, txs);
    const invested = accountHoldings(liveAssets, account.id);
    const total = accountTotal(account.id, liveAssets, txs);
    if (invested > 0.004) {
      return `- ${account.name} · ${formatEuro(total)} (efectivo ${formatEuro(cash)} · invertido ${formatEuro(invested)})`;
    }
    return `- ${account.name} · ${formatEuro(cash)}`;
  });
  const goalLines = goals.slice(0, 16).map((goal) => {
    const progress = goalProgress(goal, liveAccounts, liveAssets, txs);
    return `- ${goal.name} · ${formatEuro(progress.current)} / ${formatEuro(goal.target)} · ${formatGoalEta(progress)}`;
  });
  const reminderLines = reminders.slice(0, 16).map((item) => {
    const state = item.enabled ? "" : " (off)";
    return `- ${item.title} · ${formatReminderWhen(item)}${state}`;
  });

  const projectName = (id: string) => projects.find((item) => item.id === id)?.name ?? id;
  const taskLines = tasks.slice(0, 40).map((task) => {
    const due = task.dueAt != null ? ` · ${formatDue(task.dueAt)}` : "";
    const star = task.starred ? " ★" : "";
    const notes = task.notes.trim() ? ` — ${task.notes.trim().slice(0, 80)}` : "";
    return `- [${STATUS_LABEL[task.status]}] ${task.title} (${projectName(task.projectId)})${due}${star}${notes}`;
  });
  const projectLines = projects.map((project) => {
    const open = tasks.filter((task) => task.projectId === project.id && task.status !== "done").length;
    return `- ${project.name}${project.archived ? " (archivado)" : ""} · ${open} abiertas`;
  });
  const playlistLines = playlists.slice(0, 20).map(
    (playlist) => `- ${playlist.name} · ${playlist.tracks.length} temas${playlist.liked ? " · en inicio" : ""}`,
  );
  const musicLines = music.slice(0, 16).map((track) => `- ${track.title} · ${track.artistName}`);
  const podcastLines = podcasts.slice(0, 12).map((track) => `- ${track.title}`);
  const albumLines = albums.slice(0, 12).map((album) => `- ${album.name} · ${album.artistName}`);

  return [
    `Zona activa: ${zone}.`,
    "",
    "Proyectos:",
    projectLines.join("\n") || "- (ninguno)",
    "",
    "Tareas:",
    taskLines.join("\n") || "- (ninguna)",
    "",
    "Playlists:",
    playlistLines.join("\n") || "- (ninguna)",
    "",
    "Canciones (muestra):",
    musicLines.join("\n") || "- (vacío)",
    "",
    "Podcasts (muestra):",
    podcastLines.join("\n") || "- (vacío)",
    "",
    "Álbumes (muestra):",
    albumLines.join("\n") || "- (vacío)",
    "",
    "Recordatorios:",
    reminderLines.join("\n") || "- (ninguno)",
    "",
    `Patrimonio: ${formatEuro(total)} · caja ${formatEuro(cash)} · invertido ${formatEuro(invested)}.`,
    "Cuentas:",
    accountLines.join("\n") || "- (ninguna)",
    "Inversiones:",
    assetLines.join("\n") || "- (ninguna)",
    "Movimientos recientes:",
    txLines.join("\n") || "- (ninguno)",
    "Objetivos:",
    goalLines.join("\n") || "- (ninguno)",
  ].join("\n");
}
