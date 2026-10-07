const queues = new Map<string, Promise<unknown>>();

/** Browser uploads share a Web Lock; non-browser adapters share an in-process queue. */
export async function withProjectSyncLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (globalThis.navigator?.locks) return navigator.locks.request(key, action);
  if (typeof window !== "undefined") throw new Error("This browser cannot coordinate cloud saves safely.");
  const previous = queues.get(key) ?? Promise.resolve();
  const work = previous.catch(() => undefined).then(action);
  queues.set(key, work);
  try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
}
