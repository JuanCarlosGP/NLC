type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeAssistantMutations(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyAssistantMutations(): void {
  for (const fn of listeners) fn();
}
