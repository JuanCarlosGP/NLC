import { normalizeNutrition, NutritionError, MACROS, round, type ImportedDay, type NutritionFood } from "./model";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 20000;
// A strict RFC 4180 reader: malformed quotes/column counts abort the entire import.
export function csvRows(text: string): { cells: string[]; line: number }[] {
  if (text.length > MAX_CSV_BYTES) throw new NutritionError("size");
  let bytes = 0;
  for (const char of text) { const point = char.codePointAt(0)!; bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; if (bytes > MAX_CSV_BYTES) throw new NutritionError("size"); }
  text = text.replace(/^\uFEFF/, "");
  const header = text.split(/\r?\n/, 1)[0];
  const delimiter = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false, line = 1, rowLine = 1;
  function emit() { cells.push(cell.trim()); if (cells.some(Boolean)) rows.push({ cells, line: rowLine }); cells = []; cell = ""; closed = false; if (rows.length > MAX_CSV_ROWS + 1) throw new NutritionError("size"); }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else { cell += c; if (c === "\n") line++; }
    } else if (c === delimiter) { cells.push(cell.trim()); cell = ""; closed = false; }
    else if (c === "\r" || c === "\n") { if (c === "\r" && text[i + 1] === "\n") i++; emit(); line++; rowLine = line; }
    else if (c === '"') { if (cell !== "" || closed) throw new NutritionError("csv", line); quoted = true; }
    else if (closed) { if (!/\s/.test(c)) throw new NutritionError("csv", line); }
    else cell += c;
  }
  if (quoted) throw new NutritionError("csv", line);
  emit(); return rows;
}
function canonical(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
export function parseMacroFactor(text: string, today?: string): ImportedDay[] {
  const rows = csvRows(text); if (rows.length < 2) throw new NutritionError("empty");
  const headers = rows[0].cells.map(canonical);
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) throw new NutritionError("headers");
  function column(...names: string[]) { return headers.findIndex((header) => names.includes(header)); }
  const date = column("date"); const food = column("food name"); const time = column("time");
  const columns = { calories: column("calories (kcal)", "calories", "energy (kcal)"), protein: column("protein (g)", "protein"), carbs: column("carbs (g)", "carbohydrates (g)", "carbs"), fat: column("fat (g)", "fat") };
  if (date < 0 || MACROS.some((key) => columns[key] < 0)) throw new NutritionError("headers");
  const days = new Map<string, ImportedDay>();
  for (const row of rows.slice(1)) {
    try {
      if (row.cells.length !== headers.length) throw new NutritionError("csv");
      const input = normalizeNutrition({ date: row.cells[date], calories: row.cells[columns.calories], protein: row.cells[columns.protein], carbs: row.cells[columns.carbs], fat: row.cells[columns.fat] }, today);
      const previous = days.get(input.date);
      if (food < 0 && previous) throw new NutritionError("duplicate");
      const foods: NutritionFood[] = previous?.foods ?? [];
      if (food >= 0) {
        const name = row.cells[food]; const at = time >= 0 ? row.cells[time] : "";
        if (!name || name.length > 1000 || (at !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(at))) throw new NutritionError("food");
        foods.push({ name, time: at, calories: input.calories, protein: input.protein, carbs: input.carbs, fat: input.fat });
      }
      const day = { date: input.date, foods, calories: 0, protein: 0, carbs: 0, fat: 0 };
      for (const key of MACROS) day[key] = round((previous?.[key] ?? 0) + input[key]);
      normalizeNutrition(day, today); days.set(day.date, day);
    } catch (error) { if (error instanceof NutritionError) throw new NutritionError(error.code, row.line); throw error; }
  }
  // Sort meals for stable repeated imports even when the export reorders rows.
  for (const day of days.values()) day.foods.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
