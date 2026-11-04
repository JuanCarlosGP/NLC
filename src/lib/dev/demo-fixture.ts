import { shiftDateKey } from "../health/weight/model";
import type { ProdProject, ProdTask } from "../productivity/types";
import type { ProdReminder } from "../reminders/types";
import type { WealthDump } from "../wealth/store";
import type { WealthTx } from "../wealth/types";

export function makeDemoFixture(today: string) {
  const at = (daysAgo: number) => Date.parse(`${shiftDateKey(today, -daysAgo)}T12:00:00Z`);
  const now = at(0);
  const projects: ProdProject[] = [
    { id: "inbox", name: "Bandeja", color: "#E4D5B8", createdAt: at(80), archived: false },
    { id: "demo-home", name: "Casa", color: "#8FB89A", createdAt: at(60), archived: false },
    { id: "demo-learn", name: "Aprender", color: "#C4A574", createdAt: at(45), archived: false },
    { id: "demo-trip", name: "Viaje terminado", color: "#8C857C", createdAt: at(90), archived: true },
  ];
  const definitions = [
    ["demo-home", "Revisar el presupuesto mensual", "doing", 0, true],
    ["demo-home", "Preparar la compra de la semana", "todo", 0, true],
    ["demo-learn", "Leer un capítulo", "doing", 0, false],
    ["demo-home", "Cambiar el filtro del agua", "todo", 3, false],
    ["demo-learn", "Practicar veinte minutos de guitarra", "todo", -1, false],
    ["inbox", "Elegir una película para el viernes", "todo", null, false],
    ["inbox", "Llamar al taller", "todo", -2, false],
    ["demo-home", "Ordenar la estantería", "done", 2, false],
    ["demo-learn", "Terminar el curso de fotografía", "done", 7, true],
    ["demo-trip", "Preparar la mochila", "done", 60, false],
  ] as const;
  const tasks: ProdTask[] = definitions.map(([projectId, title, status, due, starred], i) => ({
    id: `demo-task-${i + 1}`, projectId, title, status, starred, sort: i * 100,
    notes: "Dato ficticio para comprobar edición, filtros y persistencia en local.",
    dueAt: due == null ? null : at(due), createdAt: at(20 - i), updatedAt: at(i),
  }));
  const reminders: ProdReminder[] = [
    { id: "demo-reminder-1", title: "Pausa para estirar", body: "Recordatorio de prueba", hour: 11, minute: 30, frequency: "daily", weekday: null, onceAt: null, enabled: true, createdAt: at(10), updatedAt: now },
    { id: "demo-reminder-2", title: "Planificar la semana", body: "Revisar Casa y Aprender", hour: 18, minute: 0, frequency: "weekly", weekday: 1, onceAt: null, enabled: true, createdAt: at(10), updatedAt: now },
    { id: "demo-reminder-3", title: "Revisar la maleta", body: "Ejemplo de aviso en pausa", hour: 9, minute: 15, frequency: "once", weekday: null, onceAt: at(-2), enabled: false, createdAt: at(10), updatedAt: now },
  ];
  let txId = 0;
  const txs: WealthTx[] = [];
  function tx(kind: WealthTx["kind"], amount: number, title: string, days: number, patch: Partial<WealthTx> = {}) {
    txs.push({ id: `demo-tx-${++txId}`, kind, amount, title, currency: "EUR", category: "Otro", accountId: "demo-bank", assetId: null,
      counterAccountId: null, quantity: null, unitPrice: null, bookedAt: at(days), createdAt: at(days), notes: "Movimiento ficticio; no hay conexión bancaria.", ...patch });
  }
  tx("income", 4500, "Saldo inicial", 180);
  tx("income", 120, "Efectivo inicial", 180, { accountId: "cash" });
  for (let m = 0; m < 6; m++) {
    const days = 150 - m * 30;
    tx("income", 2300, "Nómina de prueba", days, { category: "Nómina" });
    for (const [amount, title, category] of [[700, "Alquiler", "Casa"], [260, "Compra del mes", "Comida"], [60, "Transporte", "Transporte"], [110, "Ocio", "Ocio"], [25, "Suscripciones", "Suscripciones"]] as const)
      tx("expense", amount, title, Math.max(0, days - 3), { category });
  }
  tx("transfer", 2000, "Ahorro para imprevistos", 120, { counterAccountId: "demo-savings" });
  tx("transfer", 2500, "Aportación a inversiones", 110, { counterAccountId: "demo-broker" });
  tx("transfer", 80, "Retirada de efectivo", 10, { counterAccountId: "cash" });
  tx("expense", 24.5, "Café y comida", 1, { accountId: "cash", category: "Comida" });
  tx("buy", 1140, "Compra de fondo global", 100, { accountId: "demo-broker", assetId: "demo-etf", quantity: 12, unitPrice: 95 });
  tx("buy", 850, "Compra de activo digital", 90, { accountId: "demo-broker", assetId: "demo-btc", quantity: 0.02, unitPrice: 42500 });
  tx("buy", 360, "Compra de fondo de bonos", 80, { accountId: "demo-broker", assetId: "demo-bonds", quantity: 4, unitPrice: 90 });
  const wealth: WealthDump = {
    version: 1, updatedAt: now,
    accounts: [
      { id: "cash", name: "Caja", kind: "cash", currency: "EUR", createdAt: at(180), archived: false },
      { id: "demo-bank", name: "Cuenta diaria", kind: "bank", currency: "EUR", createdAt: at(180), archived: false },
      { id: "demo-savings", name: "Ahorro", kind: "bank", currency: "EUR", createdAt: at(180), archived: false },
      { id: "demo-broker", name: "Cartera de prueba", kind: "wallet", currency: "EUR", createdAt: at(180), archived: false },
    ],
    assets: [
      { id: "demo-etf", name: "Fondo global", ticker: "DEMO-W", kind: "etf", accountId: "demo-broker", quantity: 12, price: 105, costBasis: 1140, currency: "EUR", createdAt: at(100), updatedAt: now, archived: false },
      { id: "demo-btc", name: "Activo digital", ticker: "DEMO-B", kind: "crypto", accountId: "demo-broker", quantity: 0.02, price: 50000, costBasis: 850, currency: "EUR", createdAt: at(90), updatedAt: now, archived: false },
      { id: "demo-bonds", name: "Fondo de bonos", ticker: "DEMO-F", kind: "fund", accountId: "demo-broker", quantity: 4, price: 100, costBasis: 360, currency: "EUR", createdAt: at(80), updatedAt: now, archived: false },
    ],
    quotes: Array.from({ length: 6 }, (_, i) => [
      { id: `demo-quote-etf-${i}`, assetId: "demo-etf", price: 95 + i * 2, bookedAt: at(75 - i * 15), createdAt: at(75 - i * 15) },
      { id: `demo-quote-btc-${i}`, assetId: "demo-btc", price: 42500 + i * 1500, bookedAt: at(75 - i * 15), createdAt: at(75 - i * 15) },
      { id: `demo-quote-bonds-${i}`, assetId: "demo-bonds", price: 90 + i * 2, bookedAt: at(75 - i * 15), createdAt: at(75 - i * 15) },
    ]).flat(), txs,
    goals: [
      { id: "demo-goal-1", name: "Fondo de emergencia", target: 5000, scope: "account", accountId: "demo-savings", assetId: null, deadlineAt: at(-180), createdAt: at(60), updatedAt: now, archived: false },
      { id: "demo-goal-2", name: "Primera reserva", target: 1000, scope: "cash", accountId: null, assetId: null, deadlineAt: null, createdAt: at(60), updatedAt: now, archived: false },
      { id: "demo-goal-3", name: "Inversión a largo plazo", target: 3000, scope: "asset", accountId: null, assetId: "demo-etf", deadlineAt: at(-365), createdAt: at(60), updatedAt: now, archived: false },
    ],
  };
  const weights = Array.from({ length: 90 }, (_, i) => ({
    entryDate: shiftDateKey(today, i - 89), weightKg: Math.round((80 - i * 0.035 + Math.sin(i * 0.7) * 0.25) * 10) / 10,
    note: i % 13 === 0 ? "Registro después de caminar — dato de prueba" : i % 9 === 0 ? "Registro de prueba" : "",
  })).filter((_, i) => i % 11 !== 0 || i === 89);
  return { projects, tasks, reminders, wealth, weights };
}
