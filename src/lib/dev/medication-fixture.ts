import { makeDoseLog, newMedicationPlan, revisePlan, slotsForDay, type MedicationData } from "@/lib/health/medication/model";
import { localDateKey, shiftDateKey } from "@/lib/health/weight/model";

export function makeMedicationDemoFixture(today = localDateKey()): MedicationData {
  const now = new Date(`${today}T23:59:00`).getTime();
  const start = shiftDateKey(today, -20);
  const input = { dose: "1 unidad (dato ficticio)", note: "Pauta ficticia para comprobar la aplicación.", times: ["08:00", "20:00"], frequency: "daily" as const, kind: "medication" as const, anchorDate: start, endDate: null };
  const plans = [
    newMedicationPlan({ ...input, name: "Medicación de ejemplo" }, now, "demo-medication-1"),
    newMedicationPlan({ ...input, name: "Suplemento de ejemplo", kind: "supplement", times: [], frequency: "alternate" }, now, "demo-medication-2"),
    newMedicationPlan({ ...input, name: "Pauta mensual de ejemplo", kind: "supplement", times: ["12:00"], frequency: "monthly", anchorDate: shiftDateKey(`${today.slice(0, 7)}-01`, -1) }, now, "demo-medication-3"),
    newMedicationPlan({ ...input, name: "Pauta pausada de ejemplo", times: ["10:00"], anchorDate: shiftDateKey(today, -10) }, now, "demo-medication-4"),
  ];
  plans[3] = revisePlan(plans[3], plans[3].revisions[0], false, shiftDateKey(today, -3), now);
  const data: MedicationData = { plans, logs: [], alertsEnabled: false };
  for (let offset = -14; offset < 0; offset++) {
    const date = shiftDateKey(today, offset);
    for (const [index, slot] of slotsForDay(data, date).entries()) {
      if ((offset + index + 30) % 5 === 0) continue;
      data.logs.push(makeDoseLog(data, { planId: slot.planId, date, time: slot.time, status: (offset + index + 30) % 7 === 0 ? "skipped" : "taken", actualTime: slot.time || "09:00", note: "Registro ficticio" }, now));
    }
  }
  return data;
}
