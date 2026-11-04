import { normalizeWeightInput, type WeightEntry } from "../weight/model";
import { validateSession, type TrainingSession } from "../training/model";
import { validateLog, validatePlan, type MedicationData } from "../medication/model";
import { validateDays, type NutritionDay } from "../nutrition/model";
import { validateBodyReview, type BodyPhoto, type BodyReview } from "../body-photos/model";
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
export const MAX_BACKUP_FILES = 5001;
export type BackupErrorCode = "format" | "version" | "size" | "integrity" | "missingPhoto" | "storage" | "nativeUpdate" | "recovery";
export class BackupError extends Error { constructor(public code: BackupErrorCode) { super(code); this.name = "BackupError"; } }
export type HealthData = { weights: WeightEntry[]; sessions: TrainingSession[]; medication: MedicationData; nutrition: NutritionDay[]; bodyReviews: BodyReview[] };
export type HealthSnapshot = { data: HealthData; photos: Map<string, Uint8Array> };
export type BackupInfo = { createdAt: string; bytes: number; weights: number; sessions: number; plans: number; logs: number; nutrition: number; reviews: number; photos: number };
export type DecodedBackup = HealthSnapshot & { createdAt: string };
export function photoList(data: HealthData): BodyPhoto[] { return data.bodyReviews.flatMap((review) => Object.values(review.photos)); }
function unique(values: string[]) { if (new Set(values).size !== values.length) throw new BackupError("format"); }
export function validateHealthData(value: unknown): HealthData {
  try {
    const data = value as HealthData;
    if (!data || Object.keys(data).sort().join(",") !== "bodyReviews,medication,nutrition,sessions,weights" || ![data.weights, data.sessions, data.nutrition, data.bodyReviews].every(Array.isArray)) throw new BackupError("format");
    if (data.weights.length > 100000 || data.sessions.length > 20000 || data.nutrition.length > 20000 || data.bodyReviews.length > 5000) throw new BackupError("size");
    for (const row of data.weights) { const clean = normalizeWeightInput(row); if (row.weightKg !== clean.weightKg || typeof row.note !== "string" || !Number.isFinite(row.createdAt) || !Number.isFinite(row.updatedAt)) throw new BackupError("format"); }
    unique(data.weights.map((row) => row.entryDate)); data.sessions.forEach(validateSession); unique(data.sessions.map((row) => row.id));
    if (!data.medication || !Array.isArray(data.medication.plans) || !Array.isArray(data.medication.logs) || typeof data.medication.alertsEnabled !== "boolean") throw new BackupError("format");
    if (data.medication.plans.length > 5000 || data.medication.logs.length > 200000) throw new BackupError("size");
    data.medication.plans.forEach(validatePlan); data.medication.logs.forEach(validateLog);
    unique(data.medication.plans.map((row) => row.id)); unique(data.medication.logs.map((row) => row.id));
    const plans = new Set(data.medication.plans.map((row) => row.id)); if (data.medication.logs.some((row) => !plans.has(row.planId))) throw new BackupError("format");
    validateDays(data.nutrition); data.bodyReviews.forEach(validateBodyReview);
    unique(data.bodyReviews.map((row) => row.id)); unique(data.bodyReviews.map((row) => row.date)); unique(photoList(data).map((photo) => photo.id));
    if (photoList(data).length + 1 > MAX_BACKUP_FILES) throw new BackupError("size");
    return data;
  } catch (error) { throw error instanceof BackupError ? error : new BackupError("format"); }
}
export function assertPhotoBudget(data: HealthData) { if (photoList(data).reduce((sum, photo) => sum + photo.bytes, 0) > MAX_BACKUP_BYTES) throw new BackupError("size"); }
export function backupInfo(data: HealthData, createdAt: string, bytes: number): BackupInfo { return { createdAt, bytes, weights: data.weights.length, sessions: data.sessions.length, plans: data.medication.plans.length, logs: data.medication.logs.length, nutrition: data.nutrition.length, reviews: data.bodyReviews.length, photos: photoList(data).length }; }
export function remapPhotos(data: HealthData, newId: () => string): HealthData {
  const copy = JSON.parse(JSON.stringify(data)) as HealthData;
  for (const review of copy.bodyReviews) for (const photo of Object.values(review.photos)) photo.id = newId();
  validateHealthData(copy); copy.medication.alertsEnabled = false; return copy;
}
