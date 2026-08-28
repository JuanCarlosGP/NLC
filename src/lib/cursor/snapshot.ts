import { getAlbums, getTracks, loadPlaylists } from "@/lib/db/catalog";
import { t } from "@/lib/i18n/runtime";
import { listProjects, listTasks } from "@/lib/productivity/store";
import { listAccounts, listAssets, listGoals, listTx } from "@/lib/wealth/store";
import { formatEuro } from "@/lib/wealth/money";
import {
  formatGoalEta,
  goalProgress,
  netWorth,
  cashTotal,
  holdingsValue,
  accountBalance,
  accountHoldings,
  accountTotal,
  assetValue,
  assetQty,
} from "@/lib/wealth/compute";
import { projectDisplayName, STATUS_LABEL } from "@/lib/productivity/types";
import { formatDue } from "@/lib/productivity/dates";
import { listReminders } from "@/lib/reminders/store";
import { formatReminderWhen } from "@/lib/reminders/types";
import { accountDisplayName, TX_KIND_LABEL } from "@/lib/wealth/types";
import type { AppZone } from "@/lib/zone/zone-context";

export async function buildAssistantSnapshot(zone: AppZone): Promise<string> {
  const [projects, tasks, playlists, music, podcasts, albums, accounts, assets, txs, reminders, goals] =
    await Promise.all([
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
    const account = liveAccounts.find((item) => item.id === asset.accountId);
    return `- ${asset.name}${asset.ticker ? ` (${asset.ticker})` : ""}${account ? ` · ${accountDisplayName(account)}` : ""} · ${formatEuro(value)} · ${assetQty(asset)} × ${formatEuro(asset.price)}`;
  });
  const txLines = txs.slice(0, 24).map(
    (tx) =>
      `- ${TX_KIND_LABEL[tx.kind]} ${formatEuro(tx.amount)} · ${tx.title}${tx.category ? ` · ${tx.category}` : ""}`,
  );
  const accountLines = liveAccounts.map((account) => {
    const cashBal = accountBalance(account.id, txs);
    const investedBal = accountHoldings(liveAssets, account.id);
    const accountTotalVal = accountTotal(account.id, liveAssets, txs);
    if (investedBal > 0.004) {
      return `- ${accountDisplayName(account)} · ${formatEuro(accountTotalVal)} (${t("chat.snapCashInvested", { cash: formatEuro(cashBal), invested: formatEuro(investedBal) })})`;
    }
    return `- ${accountDisplayName(account)} · ${formatEuro(cashBal)}`;
  });
  const goalLines = goals.slice(0, 16).map((goal) => {
    const progress = goalProgress(goal, liveAccounts, liveAssets, txs);
    return `- ${goal.name} · ${formatEuro(progress.current)} / ${formatEuro(goal.target)} · ${formatGoalEta(progress)}`;
  });
  const reminderLines = reminders.slice(0, 16).map((item) => {
    const state = item.enabled ? "" : ` (${t("chat.snapOff")})`;
    return `- ${item.title} · ${formatReminderWhen(item)}${state}`;
  });

  const projectName = (id: string) => {
    const project = projects.find((item) => item.id === id);
    return project ? projectDisplayName(project) : id;
  };
  const taskLines = tasks.slice(0, 40).map((task) => {
    const due = task.dueAt != null ? ` · ${formatDue(task.dueAt)}` : "";
    const star = task.starred ? " ★" : "";
    const notes = task.notes.trim() ? ` — ${task.notes.trim().slice(0, 80)}` : "";
    return `- [${STATUS_LABEL[task.status]}] ${task.title} (${projectName(task.projectId)})${due}${star}${notes}`;
  });
  const projectLines = projects.map((project) => {
    const open = tasks.filter((task) => task.projectId === project.id && task.status !== "done").length;
    return `- ${projectDisplayName(project)}${project.archived ? ` (${t("chat.snapArchived")})` : ""} · ${t("chat.snapOpen", { count: open })}`;
  });
  const playlistLines = playlists.slice(0, 20).map(
    (playlist) =>
      `- ${playlist.name} · ${t("chat.snapTracksCount", { count: playlist.tracks.length })}${playlist.liked ? ` · ${t("chat.snapHome")}` : ""}`,
  );
  const musicLines = music.slice(0, 16).map((track) => `- ${track.title} · ${track.artistName}`);
  const podcastLines = podcasts.slice(0, 12).map((track) => `- ${track.title}`);
  const albumLines = albums.slice(0, 12).map((album) => `- ${album.name} · ${album.artistName}`);

  const none = `- (${t("chat.snapNone")})`;
  const empty = `- (${t("chat.snapEmpty")})`;

  return [
    t("chat.snapActiveZone", { zone }),
    "",
    t("chat.snapProjects"),
    projectLines.join("\n") || none,
    "",
    t("chat.snapTasks"),
    taskLines.join("\n") || none,
    "",
    t("chat.snapPlaylists"),
    playlistLines.join("\n") || none,
    "",
    t("chat.snapTracksSample"),
    musicLines.join("\n") || empty,
    "",
    t("chat.snapPodcastsSample"),
    podcastLines.join("\n") || empty,
    "",
    t("chat.snapAlbumsSample"),
    albumLines.join("\n") || empty,
    "",
    t("chat.snapReminders"),
    reminderLines.join("\n") || none,
    "",
    t("chat.snapWealthLine", { total: formatEuro(total), cash: formatEuro(cash), invested: formatEuro(invested) }),
    t("chat.snapAccounts"),
    accountLines.join("\n") || none,
    t("chat.snapAssets"),
    assetLines.join("\n") || none,
    t("chat.snapRecentTx"),
    txLines.join("\n") || none,
    t("chat.snapGoals"),
    goalLines.join("\n") || none,
  ].join("\n");
}
