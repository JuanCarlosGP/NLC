// Background producers and the command facade share this queue.
let queue: Promise<unknown> = Promise.resolve();
export function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
export function drainWrites() { return queue.catch(() => {}); }
