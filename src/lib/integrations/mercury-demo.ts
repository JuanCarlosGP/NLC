import type { MercurySnapshot } from "./model";
export function mercuryExample(now = new Date().toISOString()): MercurySnapshot {
  const days = Array.from({ length: 21 }, (_, i) => new Date(Date.parse(now) - i * 86400000).toISOString().slice(0, 10));
  return { version: 1, provider: "mercury", mode: "demo", syncedAt: now, owner: "mercury-example",
    accounts: [
      { id: "example-checking", name: "Checking", kind: "depository", status: "active", currency: "USD", balance: 8234.5, available: 8100, last4: "1234" },
      { id: "example-credit", name: "Mercury credit", kind: "credit", status: "active", currency: "USD", balance: -420, available: -500, last4: "" },
      { id: "example-treasury", name: "Mercury Treasury", kind: "treasury", status: "active", currency: "USD", balance: 15000, available: 15000, last4: "" },
    ],
    transactions: days.map((date, i) => ({ id: `example-tx-${i}`, accountId: "example-checking", surface: "depository", amount: i % 4 === 0 ? 1200 : -29 - i,
      currency: "USD", date, at: `${date}T12:00:00Z`, title: i % 4 === 0 ? "Cliente de ejemplo" : "Servicio de ejemplo", status: i === 0 ? "pending" : "sent", category: "Software" })),
    returns: [{ id: "example-return", accountId: "example-treasury", month: now.slice(0, 7), netAmount: 42.5, fee: 2, status: "charged" }],
  };
}
