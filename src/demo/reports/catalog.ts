import type { DemoTables } from "../store/types";
import { customerCity, productGroup, sellerName, type FilterKey, type ReportDef } from "./core";
import { SALES_REPORTS } from "./sales";
import { OPERATION_REPORTS } from "./operations";

export const REPORTS: ReportDef[] = [...SALES_REPORTS, ...OPERATION_REPORTS];
export const REPORT_BY_ID = Object.fromEntries(REPORTS.map((report) => [report.id, report])) as Record<string, ReportDef>;

/** Opções de cada filtro (valor gravado + rótulo exibido), tiradas dos dados. */
export function filterOptions(tables: DemoTables, key: FilterKey, report: ReportDef): { value: string; label: string }[] {
  const sorted = (list: { value: string; label: string }[]) => [...new Map(list.map((item) => [item.value, item])).values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  switch (key) {
    case "seller": return sorted(tables.profiles.filter((user) => user.role !== "consulta").map((user) => ({ value: user.id, label: sellerName(tables, user.id) })));
    case "customer": return sorted(tables.customers.map((customer) => ({ value: customer.id, label: customer.trade_name || customer.legal_name })));
    case "product": return sorted(tables.catalog.products.map((product) => ({ value: product.name, label: product.name })));
    case "group": return sorted(tables.catalog.products.map((product) => ({ value: productGroup(tables, product.name, null), label: productGroup(tables, product.name, null) })));
    case "city": return sorted(tables.customers.map((customer) => customerCity(tables, customer.id)).map((city) => ({ value: city, label: city })));
    case "vehicle": return sorted([...tables.vehicles.map((vehicle) => vehicle.name), ...tables.erp.trips.map((trip) => trip.vehicle)].map((name) => ({ value: name, label: name })));
    case "status": return STATUS_OPTIONS[report.id] ?? [];
  }
}

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  funil: [{ value: "draft", label: "Rascunho" }, { value: "issued", label: "Enviado" }, { value: "approved", label: "Aprovado" }, { value: "cancelled", label: "Cancelado" }],
  carteira: [{ value: "verde", label: "Em dia" }, { value: "amarelo", label: "Atenção" }, { value: "vermelho", label: "Em atraso" }],
  visitas: [{ value: "planned", label: "Agendada" }, { value: "completed", label: "Realizada" }, { value: "not_done", label: "Não realizada" }],
  receber: [{ value: "a_vencer", label: "A vencer" }, { value: "vencido", label: "Vencido" }, { value: "pago", label: "Pago" }],
  pagar: [{ value: "a_vencer", label: "A vencer" }, { value: "vencido", label: "Vencido" }, { value: "pago", label: "Pago" }],
  cargas: [{ value: "planned", label: "Planejada" }, { value: "loaded", label: "Carregada" }, { value: "shipped", label: "Expedida" }, { value: "cancelled", label: "Cancelada" }],
  producao: [{ value: "planejada", label: "Planejada" }, { value: "em_producao", label: "Em produção" }, { value: "concluida", label: "Concluída" }],
  conformidade: [{ value: "conforme", label: "Conforme" }, { value: "pendente", label: "Pendente" }, { value: "nao_conforme", label: "Não conforme" }],
  fiscal: [{ value: "autorizada", label: "Autorizada" }, { value: "rejeitada", label: "Rejeitada" }, { value: "cancelada", label: "Cancelada" }],
};
