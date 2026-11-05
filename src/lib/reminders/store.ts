import * as local from "./store.impl";
import { expose } from "@/lib/backend/registry";
export * from "./store.impl";
export const listReminders: typeof local.listReminders = expose("reminders.listReminders", local.listReminders, { domain: "reminders", write: false, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const getReminder: typeof local.getReminder = expose("reminders.getReminder", local.getReminder, { domain: "reminders", write: false, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const createReminder: typeof local.createReminder = expose("reminders.createReminder", local.createReminder, { domain: "reminders", write: true, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const updateReminder: typeof local.updateReminder = expose("reminders.updateReminder", local.updateReminder, { domain: "reminders", write: true, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const deleteReminder: typeof local.deleteReminder = expose("reminders.deleteReminder", local.deleteReminder, { domain: "reminders", write: true, phoneOnly: false, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
export const replaceReminders: typeof local.replaceReminders = expose("reminders.replaceReminders", local.replaceReminders, { domain: "reminders", write: true, phoneOnly: true, key: args => String(typeof args[0] === "string" ? args[0] : args[0]?.id ?? "$collection") });
