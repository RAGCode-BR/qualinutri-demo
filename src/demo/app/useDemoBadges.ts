import { useSyncExternalStore } from "react";
import type { TabId } from "../../layouts/AppSidebar";
import { db } from "../store/db";
import { today } from "../store/ids";
import { attentionList } from "../checklist/compliance";

let cached: { version: number; value: Partial<Record<TabId, number>> } = { version: -1, value: {} };
let version = 0;
db.subscribe(() => { version += 1; });

function snapshot(): Partial<Record<TabId, number>> {
  if (cached.version === version) return cached.value;
  const tables = db.read();
  const value: Partial<Record<TabId, number>> = {
    quotes: tables.quotes.filter((quote) => quote.status === "issued").length,
    checklist: attentionList(tables, today()).length,
    approvals: tables.erp.approvals.filter((item) => item.status === "pendente").length,
    fleet: tables.erp.fleetRequests.filter((item) => item.status === "aguardando").length,
    finance: tables.erp.statement.filter((line) => !line.matched).length,
  };
  cached = { version, value };
  return value;
}

/** Contadores do menu: orçamentos aguardando aprovação e pendências do checklist. */
export function useDemoBadges() {
  return useSyncExternalStore(db.subscribe, snapshot, snapshot);
}
