import { md5Hex } from "@/lib/crypto/md5";
import { t } from "@/lib/i18n/runtime";

type RecordId = { id: string };
type Names<T> = (record: T) => string | string[];

export function normalizeRecordName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Media IDs may be local URIs or NAS paths. Only opaque selectors leave NLC.
export function recordReference(id: string) {
  return `ref:${md5Hex(id)}`;
}

export function matchingRecords<T extends RecordId>(records: T[], names: Names<T>, query: string) {
  const normalized = normalizeRecordName(query);
  if (!normalized) return [];
  if (normalized.startsWith("ref:")) {
    return records.filter(record => recordReference(record.id) === normalized);
  }
  const tokens = normalized.split(/\s+/);
  const exact: T[] = [];
  const partial: T[] = [];
  for (const record of records) {
    const namesForRecord = names(record);
    const aliases = (typeof namesForRecord === "string" ? [namesForRecord] : namesForRecord).map(normalizeRecordName);
    if (aliases.includes(normalized)) exact.push(record);
    else if (aliases.some(alias => tokens.every(token => alias.includes(token)))) partial.push(record);
  }
  return exact.length ? exact : partial;
}

export class AssistantChoiceError extends Error {
  constructor(message: string, readonly modelText: string = message) {
    super(message);
  }
}

export function uniqueRecord<T extends RecordId>(records: T[], names: Names<T>, query: string, describe?: (record: T) => string) {
  const matches = matchingRecords(records, names, query);
  if (matches.length <= 1) return matches[0] ?? null;
  const options = matches.slice(0, 6);
  const labels = options.map((record, index) => `${index + 1}. ${recordLabel(record, names, describe)}`);
  const question = t("cursor.recordAmbiguous", { query });
  const message = [question, ...labels].join("\n\n");
  const modelText = [question, ...labels.map((label, index) => `${label} [${recordReference(options[index]!.id)}]`)].join("\n");
  throw new AssistantChoiceError(message, modelText);
}

export function describeMatches<T extends RecordId>(records: T[], names: Names<T>, query: string, describe?: (record: T) => string) {
  const matches = matchingRecords(records, names, query);
  return {
    count: matches.length,
    matches: matches.slice(0, 12).map(record => ({
      ref: recordReference(record.id),
      label: recordLabel(record, names, describe),
    })),
  };
}

function recordLabel<T>(record: T, names: Names<T>, describe?: (record: T) => string) {
  if (describe) return describe(record);
  const name = names(record);
  return typeof name === "string" ? name : name[0] ?? "";
}
