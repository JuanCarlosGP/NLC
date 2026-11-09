import { getSecret, setSecret } from "@/lib/settings/secret-store";
import { tr } from "@/lib/i18n/runtime";
import type { ProposedAction } from "./proposals";

const REPOSITORY = "JuanCarlosGP/NLC";
const GITHUB_KEY = "nlc.github.issues-token";

export function saveGitHubIssuesToken(token: string) {
  const value = token.trim();
  if (!value.startsWith("github_pat_") || value.length > 512 || /\s/.test(value)) {
    throw new Error(tr("Use a fine-grained GitHub token.", "Usa un token de permisos detallados de GitHub."));
  }
  return setSecret(GITHUB_KEY, value);
}

function issueLink(number: number) {
  return `Issue [#${number}](https://github.com/${REPOSITORY}/issues/${number}).`;
}

async function publishIssue(title: string, body: string): Promise<string> {
  const token = await getSecret(GITHUB_KEY);
  if (!token) {
    throw new Error(tr(
      "Add a GitHub token in the assistant settings before publishing.",
      "Guarda un token de GitHub en los ajustes del asistente para publicar.",
    ));
  }
  const endpoint = `https://api.github.com/repos/${REPOSITORY}/issues`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  async function githubRequest(url: string, init?: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      if (!response.ok) throw new Error(tr(
        `GitHub returned HTTP ${response.status}. Check the token and its Issues permission.`,
        `GitHub devolvió HTTP ${response.status}. Revisa el token y su permiso Issues.`,
      ));
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  const open = await githubRequest(`${endpoint}?state=open&per_page=100`) as {
    title: string; number: number; pull_request?: unknown;
  }[];
  const existing = open.find(issue => !issue.pull_request && issue.title.toLowerCase() === title.toLowerCase());
  if (existing) return tr("Already open. ", "Ya está abierta. ") + issueLink(existing.number);
  const result = await githubRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({ title, body }),
  }) as { number?: number };
  if (typeof result.number !== "number" || !Number.isSafeInteger(result.number) || result.number < 1) {
    throw new Error(tr("GitHub did not return an issue number.", "GitHub no devolvió el número de la issue."));
  }
  return issueLink(result.number);
}

export function proposeIssue(title: unknown, body: unknown): ProposedAction {
  const subject = typeof title === "string" ? title.trim().replace(/^\[idea\]\s*/i, "") : "";
  const description = typeof body === "string" ? body.trim() : "";
  if (!subject || subject.length > 100 || /[\r\n]/.test(subject) || !description || description.length > 3000) {
    throw new Error(tr("The issue needs a short title and a description.", "La issue necesita un título breve y una descripción."));
  }
  const issueTitle = `[Idea] ${subject}`;
  return {
    kind: "issue",
    title: issueTitle,
    body: description,
    execute: () => publishIssue(issueTitle, description),
  };
}
