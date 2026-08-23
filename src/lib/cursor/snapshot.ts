import { getAlbums, getTracks, loadPlaylists } from "@/lib/db/catalog";
import { listProjects, listTasks } from "@/lib/productivity/store";
import { STATUS_LABEL } from "@/lib/productivity/types";
import { formatDue } from "@/lib/productivity/dates";
import type { AppZone } from "@/lib/zone/zone-context";

export async function buildAssistantSnapshot(zone: AppZone): Promise<string> {
  const [projects, tasks, playlists, music, podcasts, albums] = await Promise.all([
    listProjects(),
    listTasks(),
    loadPlaylists(),
    getTracks({ kind: "music" }),
    getTracks({ kind: "podcast" }),
    getAlbums(),
  ]);

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
  ].join("\n");
}
