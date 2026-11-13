export function installMemoryStorage(options: { broken?: boolean } = {}) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => { if (options.broken) throw new Error("bloqueado"); return data.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (options.broken) throw new Error("bloqueado"); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  return data;
}
