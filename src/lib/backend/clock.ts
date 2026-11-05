let active = false, offset = 0, timeZone = "UTC";
export function setPhoneClock(timestamp: number, zone: string, receivedAt = Date.now()) { new Intl.DateTimeFormat("en", { timeZone: zone }); active = true; offset = timestamp - receivedAt; timeZone = zone; }
export function resetPhoneClock() { active = false; offset = 0; }
export const hasPhoneClock = () => active;
export const phoneNow = () => Date.now() + offset;
export const phoneTimeZone = () => active ? timeZone : undefined;
export function phoneDateKey(date = new Date(phoneNow())) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: active ? timeZone : undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const get = (type: string) => parts.find(part => part.type === type)!.value; return `${get("year")}-${get("month")}-${get("day")}`; }
export function phoneTimeText(date = new Date(phoneNow())) { return new Intl.DateTimeFormat("en-GB", { timeZone: active ? timeZone : undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date); }
export function phoneInstant(date: string, time = "00:00") {
 const [year, month, day] = date.split("-").map(Number), [hour, minute] = time.split(":").map(Number); const wanted = Date.UTC(year, month - 1, day, hour, minute); let guess = wanted;
 for (let index = 0; index < 4; index++) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: active ? timeZone : undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess); const get = (type: string) => Number(parts.find(part => part.type === type)!.value);
  const seen = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")); const difference = wanted - seen; guess += difference; if (!difference) return guess;
 }
 if (phoneDateKey(new Date(guess)) !== date || phoneTimeText(new Date(guess)) !== time) throw new Error("Invalid local time"); return guess;
}
export function phoneDayStart(timestamp = phoneNow(), days = 0) { const value = new Date(`${phoneDateKey(new Date(timestamp))}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return phoneInstant(value.toISOString().slice(0, 10)); }
