import { useMemo, useSyncExternalStore } from "react";
import { db } from "../store/db";
import type { DemoTables } from "../store/types";

let version = 0;
db.subscribe(() => { version += 1; });

/** Versão do banco local; muda a cada gravação, para recalcular painéis. */
export function useDemoVersion(): number {
  return useSyncExternalStore(db.subscribe, () => version, () => version);
}

/**
 * Tabelas do banco local. Devolve um objeto novo a cada gravação (cópia rasa),
 * para que useMemo/useEffect que dependem das tabelas recalculem.
 */
export function useDemoTables(): DemoTables {
  const current = useDemoVersion();
  return useMemo(() => ({ ...db.read() }), [current]);
}
