import { buildSeed } from "../seed";
import type { DemoTables } from "./types";
import { isoDate, today } from "./ids";

export const STORAGE_KEY = "qualinutri-demo:v1";
/** Aumentar quando o formato do seed mudar: dados antigos são descartados. */
export const SEED_VERSION = 5;

type Stored = { version: number; seededOn: string; tables: DemoTables };

let tables: DemoTables | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): DemoTables | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed.version !== SEED_VERSION || !parsed.tables || !Array.isArray(parsed.tables.customers)) return null;
    return parsed.tables;
  } catch {
    return null;
  }
}

function save() {
  if (!tables) return;
  try {
    const stored: Stored = { version: SEED_VERSION, seededOn: isoDate(today()), tables };
    storage()?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Sem armazenamento (navegação privada, cota cheia): a demo segue em memória.
  }
}

function consumeResetParam(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    if (url.searchParams.get("reset") !== "1") return false;
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", url.toString());
    return true;
  } catch {
    return false;
  }
}

function notify() {
  for (const listener of [...listeners]) listener();
}

export const db = {
  read(): DemoTables {
    if (!tables) {
      tables = consumeResetParam() ? null : load();
      if (!tables) {
        tables = buildSeed(today());
        save();
      }
    }
    return tables;
  },
  write(mutator: (current: DemoTables) => void): void {
    mutator(db.read());
    save();
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  reset(): void {
    tables = buildSeed(today());
    save();
    notify();
  },
};

/** Espera curta para a tela mostrar "carregando" como no sistema real. */
export function simulateLatency<T>(value: T | (() => T)): Promise<T> {
  const resolve = () => (typeof value === "function" ? (value as () => T)() : value);
  const isTest = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
  if (isTest) return Promise.resolve().then(resolve);
  const delay = 120 + Math.random() * 180;
  return new Promise((done, fail) => {
    setTimeout(() => {
      try { done(resolve()); } catch (error) { fail(error); }
    }, delay);
  });
}

/** Cópia profunda para não entregar à tela objetos que o banco local continua alterando. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
