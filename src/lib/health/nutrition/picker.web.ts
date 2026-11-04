import { NutritionError } from "./model";
import { MAX_CSV_BYTES } from "./macrofactor";
export async function pickNutritionCsv(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".csv,text/csv,text/plain";
    input.style.display = "none"; document.body.appendChild(input);
    let settled = false;
    function finish(value: { name: string; text: string } | null, error?: unknown) { if (settled) return; settled = true; input.remove(); window.removeEventListener("focus", focused); if (error) reject(error); else resolve(value); }
    function focused() { setTimeout(() => { if (!input.files?.length) finish(null); }, 1000); }
    input.addEventListener("cancel", () => finish(null), { once: true }); window.addEventListener("focus", focused);
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return finish(null);
      try { if (file.size > MAX_CSV_BYTES) throw new NutritionError("size"); if (!/\.csv$/i.test(file.name)) throw new NutritionError("headers"); finish({ name: file.name, text: await file.text() }); } catch (error) { finish(null, error); }
    };
    input.click();
  });
}
