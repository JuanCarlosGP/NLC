type Handler = () => void;

let handler: Handler | null = null;
let pending = false;

export function setReminderOpenHandler(fn: Handler): () => void {
  handler = fn;
  if (pending) {
    pending = false;
    fn();
  }
  return () => {
    if (handler === fn) handler = null;
  };
}

export function openRemindersFromNotification(): void {
  if (handler) handler();
  else pending = true;
}

export function isReminderNotification(data: Record<string, unknown> | undefined): boolean {
  return data?.kind === "reminder" || data?.reminder === true || data?.reminder === "true";
}
