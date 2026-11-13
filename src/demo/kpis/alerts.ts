import type { TabId } from "../../layouts/AppSidebar";
import type { DemoTables } from "../store/types";
import { isoDate } from "../store/ids";
import { openPayables, receivables } from "./finance";
import { checklistAlerts } from "../checklist/compliance";

export type DemoAlert = { id: string; level: "high" | "medium"; title: string; detail: string; tab: TabId };

/** Tudo que precisa de atenção hoje, do mais grave ao menos grave. */
export function demoAlerts(tables: DemoTables, today: Date): DemoAlert[] {
  const todayKey = isoDate(today);
  const fmt = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = (key: string) => key.split("-").reverse().join("/");
  const alerts: DemoAlert[] = [];
  for (const item of receivables(tables, today).filter((row) => !row.paidAt && row.dueDate < todayKey)) {
    alerts.push({ id: `r-${item.quoteId}-${item.number}`, level: "high", title: `Parcela vencida · ${item.customer}`, detail: `Orçamento #${item.quoteNumber} (${item.number}/${item.of}) · ${fmt(item.amount)} · venceu em ${date(item.dueDate)}`, tab: "quotes" });
  }
  for (const item of openPayables(tables).filter((row) => row.dueDate < todayKey)) {
    alerts.push({ id: `p-${item.id}`, level: "high", title: `Conta a pagar vencida · ${item.supplier}`, detail: `${item.description} · ${fmt(item.amount)} · venceu em ${date(item.dueDate)}`, tab: "dashboard" });
  }
  for (const visit of tables.visits.filter((row) => row.status === "planned" && (row.scheduled_date ?? "") < todayKey)) {
    const customer = tables.customers.find((row) => row.id === visit.customer_id)?.legal_name ?? "Cliente";
    alerts.push({ id: `v-${visit.id}`, level: "medium", title: `Visita sem registro · ${customer}`, detail: `Agendada para ${date(visit.scheduled_date ?? "")}`, tab: "visits" });
  }
  alerts.push(...checklistAlerts(tables, today));
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
}
