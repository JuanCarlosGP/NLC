import type { CatalogDb } from "../../db/types";
import type { RestTimer, TrainingSession } from "../training/model";
import type { BodyReview } from "../body-photos/model";
import type { HealthData } from "./model";
export type SqlHealthState = { data: HealthData; rest: RestTimer | null };
export async function readSqlHealth(db: CatalogDb, body = true): Promise<SqlHealthState> {
  const weights = await db.getAllAsync<HealthData["weights"][number]>("SELECT entry_date AS entryDate, weight_kg AS weightKg, note, created_at AS createdAt, updated_at AS updatedAt FROM health_weight_entries ORDER BY entry_date DESC");
  async function payloads<T>(table: string) { return (await db.getAllAsync<{ payload: string }>(`SELECT payload FROM ${table}`)).map((row) => JSON.parse(row.payload) as T); }
  const sessions = await payloads<TrainingSession>("health_training_sessions"); const plans = await payloads<HealthData["medication"]["plans"][number]>("health_medication_plans"); const logs = await payloads<HealthData["medication"]["logs"][number]>("health_medication_logs");
  const alerts = await db.getFirstAsync<{ alerts_enabled: number }>("SELECT alerts_enabled FROM health_medication_settings WHERE id = 1");
  const rest = await db.getFirstAsync<{ payload: string }>("SELECT payload FROM health_training_rest WHERE id = 1");
  return { data: { weights, sessions, medication: { plans, logs, alertsEnabled: alerts?.alerts_enabled === 1 }, nutrition: await payloads("health_nutrition_days"), bodyReviews: body ? await payloads<BodyReview>("health_body_reviews") : [] }, rest: rest ? JSON.parse(rest.payload) : null };
}
// Caller owns the transaction. No unrelated catalogue, finance, settings or demo rows change.
export async function writeSqlHealth(db: CatalogDb, state: SqlHealthState, body = true) {
  const { data, rest } = state;
  for (const table of ["health_medication_logs", "health_medication_plans", "health_medication_settings", "health_weight_entries", "health_training_sessions", "health_training_rest", "health_nutrition_days", ...(body ? ["health_body_reviews"] : [])]) await db.runAsync(`DELETE FROM ${table}`);
  for (const row of data.weights) await db.runAsync("INSERT INTO health_weight_entries (entry_date, weight_kg, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", row.entryDate, row.weightKg, row.note, row.createdAt, row.updatedAt);
  for (const row of data.sessions) await db.runAsync("INSERT INTO health_training_sessions (id, session_date, updated_at, payload) VALUES (?, ?, ?, ?)", row.id, row.date, row.updatedAt, JSON.stringify(row));
  if (rest) await db.runAsync("INSERT INTO health_training_rest (id, payload) VALUES (1, ?)", JSON.stringify(rest));
  for (const row of data.medication.plans) await db.runAsync("INSERT INTO health_medication_plans (id, updated_at, payload) VALUES (?, ?, ?)", row.id, row.updatedAt, JSON.stringify(row));
  for (const row of data.medication.logs) await db.runAsync("INSERT INTO health_medication_logs (id, plan_id, entry_date, payload) VALUES (?, ?, ?, ?)", row.id, row.planId, row.date, JSON.stringify(row));
  await db.runAsync("INSERT INTO health_medication_settings (id, alerts_enabled) VALUES (1, ?)", data.medication.alertsEnabled ? 1 : 0);
  for (const row of data.nutrition) await db.runAsync("INSERT INTO health_nutrition_days (entry_date, payload) VALUES (?, ?)", row.date, JSON.stringify(row));
  if (body) for (const row of data.bodyReviews) await db.runAsync("INSERT INTO health_body_reviews (id, entry_date, payload) VALUES (?, ?, ?)", row.id, row.date, JSON.stringify(row));
}
