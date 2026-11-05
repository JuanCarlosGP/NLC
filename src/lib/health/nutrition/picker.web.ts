import { markEditDraft, hasEditDraft, confirmEdit } from "@/lib/backend/edit-drafts";
import { rememberNutritionUpload } from "@/lib/backend/nutrition-upload";
import { remoteEnabled } from "@/lib/backend/profile";
import { browserBackend } from "@/lib/backend/remote";
import { pickUpload, uploadFile } from "@/lib/backend/transfers";
import { NutritionError } from "./model";
import { MAX_CSV_BYTES } from "./macrofactor";
export async function pickNutritionCsv(): Promise<{ name: string; text: string; days?: import("./model").ImportedDay[] } | null> {
  if (remoteEnabled) {
    const previous = hasEditDraft(); const generation = markEditDraft("nutrition");
    const file = await pickUpload(".csv,text/csv"); if (!file) { if (!previous) confirmEdit("nutrition", generation); return null; }
    if (file.size > MAX_CSV_BYTES) throw new NutritionError("size");
    const upload = await uploadFile(file, file.name);
    const result = await browserBackend.invoke<{ name: string; text: string; days: import("./model").ImportedDay[] }>("nutrition.csvPreview", [upload.id], { domain: "nutrition", atomic: false });
    rememberNutritionUpload(result.days, upload.id); return result;
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".csv,text/csv,text/plain";
    input.style.display = "none"; document.body.appendChild(input);
    let settled = false;
    function finish(value: { name: string; text: string; days?: import("./model").ImportedDay[] } | null, error?: unknown) { if (settled) return; settled = true; input.remove(); window.removeEventListener("focus", focused); if (error) reject(error); else resolve(value); }
    function focused() { setTimeout(() => { if (!input.files?.length) finish(null); }, 1000); }
    input.addEventListener("cancel", () => finish(null), { once: true }); window.addEventListener("focus", focused);
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return finish(null);
      try { if (file.size > MAX_CSV_BYTES) throw new NutritionError("size"); if (!/\.csv$/i.test(file.name)) throw new NutritionError("headers"); finish({ name: file.name, text: await file.text() }); } catch (error) { finish(null, error); }
    };
    input.click();
  });
}
