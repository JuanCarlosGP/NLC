import { hasPhoneClock, phoneTimeText, phoneInstant } from "../../backend/clock";
import { phoneNow } from "../../backend/clock";
import { isDateKey, localDateKey, shiftDateKey } from "../weight/model";

export type MedicationKind = "medication" | "supplement";
export type MedicationFrequency = "daily" | "alternate" | "weekly" | "monthly";
export type MedicationRevision = {
  fromDate: string; name: string; kind: MedicationKind; dose: string; note: string; times: string[];
  frequency: MedicationFrequency; anchorDate: string; endDate: string | null; active: boolean;
};
export type MedicationPlan = { id: string; revisions: MedicationRevision[]; createdAt: number; updatedAt: number };
export type DoseSnapshot = { name: string; dose: string; kind: MedicationKind; note: string };
export type DoseLog = {
  id: string; planId: string; date: string; time: string; status: "taken" | "skipped" | "pending";
  takenAt: number | null; actualTime: string | null; note: string; snapshot: DoseSnapshot; updatedAt: number;
};
export type DoseSlot = { id: string; planId: string; date: string; time: string; snapshot: DoseSnapshot; log: DoseLog | null };
export type MedicationData = { plans: MedicationPlan[]; logs: DoseLog[]; alertsEnabled: boolean };
export type PlanInput = Omit<MedicationRevision, "fromDate" | "active">;
export type DoseInput = { planId: string; date: string; time: string; status: DoseLog["status"]; actualTime?: string; note?: string };
export type MedicationErrorCode = "name" | "date" | "time" | "frequency" | "note" | "future" | "missing" | "invalid";
export class MedicationValidationError extends Error { constructor(public code: MedicationErrorCode) { super(code); } }
const fail = (code: MedicationErrorCode): never => { throw new MedicationValidationError(code); };
export function medicationId(): string { return `${phoneNow().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
export function isTime(value: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function timeText(date = new Date(phoneNow())): string { if (hasPhoneClock()) return phoneTimeText(date); return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }
export function parseTimes(text: string): string[] {
  if (!text.trim()) return [];
  const times = text.split(",").map((time) => time.trim());
  if (times.length > 8 || times.some((time) => !isTime(time)) || new Set(times).size !== times.length) fail("time");
  return times.sort();
}
export function normalizePlanInput(input: PlanInput): PlanInput {
  if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120 || typeof input.dose !== "string" || input.dose.length > 120) fail("name");
  if (!["medication", "supplement"].includes(input.kind)) fail("invalid");
  if (typeof input.note !== "string" || input.note.length > 2000) fail("note");
  if (!["daily", "alternate", "weekly", "monthly"].includes(input.frequency)) fail("frequency");
  if (!isDateKey(input.anchorDate) || (input.endDate !== null && (!isDateKey(input.endDate) || input.endDate < input.anchorDate))) fail("date");
  if (!Array.isArray(input.times)) fail("time");
  const times = parseTimes(input.times.join(","));
  return { ...input, name: input.name.trim(), dose: input.dose.trim(), note: input.note.trim(), times };
}
export function validatePlan(plan: MedicationPlan): MedicationPlan {
  if (!plan || typeof plan.id !== "string" || !/^[\w-]{1,100}$/.test(plan.id) || !Array.isArray(plan.revisions) || !plan.revisions.length || !Number.isFinite(plan.createdAt) || !Number.isFinite(plan.updatedAt)) fail("invalid");
  let previous = "";
  for (const revision of plan.revisions) {
    normalizePlanInput(revision);
    if (!isDateKey(revision.fromDate) || revision.fromDate <= previous || typeof revision.active !== "boolean") fail("invalid");
    previous = revision.fromDate;
  }
  return plan;
}
export function newMedicationPlan(input: PlanInput, now = phoneNow(), id = medicationId()): MedicationPlan {
  const normalized = normalizePlanInput(input);
  return validatePlan({ id, revisions: [{ ...normalized, fromDate: normalized.anchorDate, active: true }], createdAt: now, updatedAt: now });
}
export function revisionOn(plan: MedicationPlan, date: string): MedicationRevision | null {
  return [...plan.revisions].reverse().find((revision) => revision.fromDate <= date) ?? null;
}
export function revisePlan(plan: MedicationPlan, input: PlanInput, active: boolean, today = localDateKey(), now = phoneNow()): MedicationPlan {
  const normalized = normalizePlanInput(input);
  const revisions = plan.revisions.filter((revision) => revision.fromDate < today);
  // Revisions later than today can only be the first (not-yet-started) schedule.
  return validatePlan({ ...plan, revisions: [...revisions, { ...normalized, fromDate: today, active }], updatedAt: now });
}
const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;
export function isDue(revision: MedicationRevision, date: string): boolean {
  if (!revision.active || date < revision.anchorDate || (revision.endDate !== null && date > revision.endDate)) return false;
  const difference = Math.round(dayNumber(date) - dayNumber(revision.anchorDate));
  if (revision.frequency === "daily") return true;
  if (revision.frequency === "alternate") return difference % 2 === 0;
  if (revision.frequency === "weekly") return difference % 7 === 0;
  // A schedule anchored on the 29th–31st uses the last day of shorter months.
  const [year, month] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return Number(date.slice(8)) === Math.min(Number(revision.anchorDate.slice(8)), lastDay);
}
export function doseId(planId: string, date: string, time: string): string { return `${planId}:${date}:${time || "any"}`; }
export function slotsForDay(data: Pick<MedicationData, "plans" | "logs">, date: string): DoseSlot[] {
  if (!isDateKey(date)) fail("date");
  const slots = new Map<string, DoseSlot>();
  const logs = new Map(data.logs.filter((log) => log.date === date).map((log) => [log.id, log]));
  for (const plan of data.plans) {
    const revision = revisionOn(plan, date); if (!revision || !isDue(revision, date)) continue;
    for (const time of revision.times.length ? revision.times : [""]) {
      const id = doseId(plan.id, date, time); const log = logs.get(id) ?? null;
      slots.set(id, { id, planId: plan.id, date, time, snapshot: log && log.status !== "pending" ? log.snapshot : { name: revision.name, dose: revision.dose, kind: revision.kind, note: revision.note }, log });
    }
  }
  // Keep recorded doses visible when today's schedule is edited or paused.
  for (const log of logs.values()) if (!slots.has(log.id) && log.status !== "pending") slots.set(log.id, { id: log.id, planId: log.planId, date, time: log.time, snapshot: log.snapshot, log });
  return [...slots.values()].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.snapshot.name.localeCompare(b.snapshot.name));
}
export function doseSummary(slots: DoseSlot[]) {
  const taken = slots.filter((slot) => slot.log?.status === "taken").length;
  const skipped = slots.filter((slot) => slot.log?.status === "skipped").length;
  return { total: slots.length, taken, skipped, pending: slots.length - taken - skipped };
}
export function localDoseTimestamp(date: string, time: string): number {
  if (!isDateKey(date)) fail("date"); if (!isTime(time)) fail("time");
  if (hasPhoneClock()) return phoneInstant(date, time);
  const [year, month, day] = date.split("-").map(Number); const [hour, minute] = time.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute);
  if (localDateKey(value) !== date || timeText(value) !== time) fail("time");
  return value.getTime();
}
export function validateLog(log: DoseLog): DoseLog {
  if (!log || typeof log.planId !== "string" || !isDateKey(log.date) || (log.time !== "" && !isTime(log.time)) || log.id !== doseId(log.planId, log.date, log.time) || !["taken", "skipped", "pending"].includes(log.status) || !Number.isFinite(log.updatedAt)) fail("invalid");
  if (typeof log.note !== "string" || log.note.length > 2000) fail("note");
  if (!log.snapshot || typeof log.snapshot.name !== "string" || !log.snapshot.name.trim() || typeof log.snapshot.dose !== "string" || typeof log.snapshot.note !== "string" || !["medication", "supplement"].includes(log.snapshot.kind)) fail("invalid");
  // The recorded civil date/time stays stable if the device later changes time zone.
  if (log.status === "taken" ? !Number.isFinite(log.takenAt) || !log.actualTime || !isTime(log.actualTime) : log.takenAt !== null || log.actualTime !== null) fail("time");
  return log;
}
export function makeDoseLog(data: MedicationData, input: DoseInput, now = phoneNow()): DoseLog {
  if (!isDateKey(input.date)) fail("date"); if (input.date > localDateKey(new Date(now))) fail("future");
  if (typeof input.note !== "undefined" && (typeof input.note !== "string" || input.note.length > 2000)) fail("note");
  const slot = slotsForDay(data, input.date).find((row) => row.id === doseId(input.planId, input.date, input.time));
  if (!slot) throw new MedicationValidationError("missing");
  const actualTime = input.status === "taken" ? input.actualTime ?? timeText(new Date(now)) : null;
  const takenAt = actualTime !== null ? localDoseTimestamp(input.date, actualTime) : null;
  if (takenAt !== null && takenAt > now) fail("future");
  return validateLog({ id: slot.id, planId: input.planId, date: input.date, time: input.time, snapshot: slot.snapshot, status: input.status, takenAt, actualTime, note: (input.note ?? "").trim(), updatedAt: now });
}
export type MedicationAlert = { id: string; planId: string; date: string; time: string; at: number };
export function upcomingMedicationAlerts(data: MedicationData, now = phoneNow(), days = 30, limit = 40): MedicationAlert[] {
  if (!data.alertsEnabled) return [];
  const alerts: MedicationAlert[] = []; const today = localDateKey(new Date(now));
  for (let offset = 0; offset < days; offset++) {
    const date = shiftDateKey(today, offset);
    for (const slot of slotsForDay(data, date)) {
      if (!slot.time || slot.log && slot.log.status !== "pending") continue;
      let at: number; try { at = localDoseTimestamp(date, slot.time); } catch { continue; }
      if (at > now) alerts.push({ id: `medication:${slot.id}`, planId: slot.planId, date, time: slot.time, at });
    }
  }
  return alerts.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, limit);
}
