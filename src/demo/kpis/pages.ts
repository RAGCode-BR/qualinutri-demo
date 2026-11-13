import type { TabId } from "../../layouts/AppSidebar";
import type { UserProfile } from "../../types/auth";
import type { DemoTables } from "../store/types";
import { addDays, isoDate } from "../store/ids";
import { candidatesFor } from "../services/loadService";
import { dashboardKpis, periodFor, type DrawerSelection, type Kpi, type KpiFormat } from "./dashboard";

export type PageKpi = { id: string; label: string; value: number; format: KpiFormat; caption?: string; tone?: "good" | "warn" | "bad"; selection: DrawerSelection };

function localKey(iso: string | null) {
  return iso ? isoDate(new Date(iso)) : null;
}

function fromKpi(kpi: Kpi, tone?: PageKpi["tone"]): PageKpi {
  return { id: kpi.id, label: kpi.label, value: kpi.value, format: kpi.format, caption: kpi.caption, tone, selection: kpi.selection };
}

const loadStatus: Record<string, string> = { planned: "Planejada", loaded: "Carregada", shipped: "Expedida", cancelled: "Cancelada" };
const visitStatus: Record<string, string> = { planned: "Agendada", completed: "Realizada", not_done: "Não realizada" };

/** Indicadores do topo de cada tela, todos clicáveis (abrem a lista detalhada). */
export function pageKpis(tab: TabId, tables: DemoTables, today: Date, viewer: UserProfile | null): PageKpi[] {
  const todayKey = isoDate(today);
  const month = periodFor("month", today);
  let dash: Kpi[] | null = null;
  const find = (id: Kpi["id"]) => (dash ??= dashboardKpis(tables, month, today)).find((kpi) => kpi.id === id)!;
  const sellerName = (id: string | null) => {
    const user = tables.profiles.find((profile) => profile.id === id);
    return user ? user.displayName || user.login : "—";
  };
  const customerName = (id: string | null) => tables.customers.find((customer) => customer.id === id)?.legal_name ?? "—";

  switch (tab) {
    case "calculator": {
      const createdToday = tables.quotes.filter((quote) => localKey(quote.created_at) === todayKey);
      return [
        { id: "today", label: "Orçamentos criados hoje", value: createdToday.length, format: "number", selection: { title: "Orçamentos criados hoje", columns: [{ key: "number", label: "Nº" }, { key: "customer", label: "Cliente" }, { key: "total", label: "Total", format: "currency" }], rows: createdToday.map((quote) => ({ id: quote.id, number: `#${quote.quote_number}`, customer: quote.customer_name_snapshot ?? "Sem cliente", total: quote.grand_total })) } },
        { id: "products", label: "Produtos na tabela", value: tables.catalog.products.length, format: "number", caption: `Vigente desde ${tables.catalog.priceTableFrom?.split("-").reverse().join("/") ?? "—"}`, selection: { title: "Produtos da tabela vigente", columns: [{ key: "name", label: "Produto" }, { key: "group", label: "Linha" }, { key: "weight", label: "Saca (kg)", format: "number" }, { key: "price", label: "À vista", format: "currency" }], rows: tables.catalog.products.map((product) => ({ id: product.id ?? product.name, name: product.name, group: product.group, weight: product.weightKg, price: product.prices[0] })) } },
        fromKpi(find("sales"), "good"),
      ];
    }
    case "quotes":
      return [fromKpi(find("openQuotes")), fromKpi(find("sales"), "good"), fromKpi(find("conversion")), fromKpi(find("ticket"))];
    case "customers": {
      const active = tables.customers.filter((customer) => customer.active);
      const lastBuy = new Map<string, string>();
      for (const quote of tables.quotes) {
        if (quote.status === "approved" && quote.customer_id && quote.approved_at && (lastBuy.get(quote.customer_id) ?? "") < quote.approved_at) lastBuy.set(quote.customer_id, quote.approved_at);
      }
      const limit = addDays(today, -90).toISOString();
      const idle = active.filter((customer) => (lastBuy.get(customer.id) ?? "") < limit);
      return [
        { id: "active", label: "Clientes ativos", value: active.length, format: "number", selection: { title: "Clientes ativos", columns: [{ key: "name", label: "Cliente" }, { key: "document", label: "CPF/CNPJ" }, { key: "phone", label: "Telefone" }], rows: active.map((customer) => ({ id: customer.id, name: customer.legal_name, document: customer.document, phone: customer.phone })) } },
        fromKpi(find("newCustomers"), "good"),
        { id: "idle", label: "Sem compra há 90 dias", value: idle.length, format: "number", tone: "warn", caption: "Oportunidade de visita", selection: { title: "Clientes sem compra aprovada há 90 dias", columns: [{ key: "name", label: "Cliente" }, { key: "phone", label: "Telefone" }, { key: "last", label: "Última compra", format: "date" }], rows: idle.map((customer) => ({ id: customer.id, name: customer.legal_name, phone: customer.phone, last: localKey(lastBuy.get(customer.id) ?? null) })) } },
      ];
    }
    case "visits": {
      const mine = tables.visits.filter((visit) => viewer?.role === "administrador" || visit.seller_id === viewer?.id);
      const columns = [{ key: "date", label: "Data", format: "date" as const }, { key: "customer", label: "Cliente" }, { key: "seller", label: "Vendedor" }, { key: "status", label: "Situação" }];
      const row = (visit: (typeof mine)[number]) => ({ id: visit.id, date: visit.visited_date ?? visit.scheduled_date, customer: customerName(visit.customer_id), seller: sellerName(visit.seller_id), status: visitStatus[visit.status] ?? visit.status });
      const weekEnd = isoDate(addDays(today, 6));
      const todayList = mine.filter((visit) => (visit.visited_date ?? visit.scheduled_date) === todayKey);
      const week = mine.filter((visit) => visit.status === "planned" && (visit.scheduled_date ?? "") >= todayKey && (visit.scheduled_date ?? "") <= weekEnd);
      const late = mine.filter((visit) => visit.status === "planned" && (visit.scheduled_date ?? "") < todayKey);
      const done = mine.filter((visit) => visit.status === "completed" && (visit.visited_date ?? "") >= month.from);
      return [
        { id: "today", label: "Visitas hoje", value: todayList.length, format: "number", selection: { title: "Visitas de hoje", columns, rows: todayList.map(row) } },
        { id: "week", label: "Agendadas · 7 dias", value: week.length, format: "number", selection: { title: "Visitas agendadas para os próximos 7 dias", columns, rows: week.map(row) } },
        { id: "late", label: "Atrasadas", value: late.length, format: "number", tone: late.length ? "bad" : "good", caption: "Agendadas e não registradas", selection: { title: "Visitas atrasadas", columns, rows: late.map(row) } },
        { id: "done", label: "Realizadas no mês", value: done.length, format: "number", tone: "good", selection: { title: "Visitas realizadas no mês", columns, rows: done.map(row) } },
      ];
    }
    case "loads": {
      const columns = [{ key: "number", label: "Carga" }, { key: "vehicle", label: "Veículo" }, { key: "date", label: "Data", format: "date" as const }, { key: "weight", label: "Peso (kg)", format: "number" as const }, { key: "fill", label: "Ocupação", format: "percent" as const }, { key: "status", label: "Situação" }];
      const row = (load: DemoTables["loads"][number]) => ({ id: load.id, number: `#${load.load_number}`, vehicle: load.vehicle_name_snapshot, date: load.planned_date, weight: load.total_weight_kg, fill: (load.total_weight_kg / load.capacity_kg_snapshot) * 100, status: loadStatus[load.status] ?? load.status });
      const open = tables.loads.filter((load) => load.status === "planned" || load.status === "loaded");
      const shipped = tables.loads.filter((load) => load.status === "shipped" && (localKey(load.shipped_at) ?? "") >= month.from);
      const all = tables.loads.filter((load) => load.status !== "cancelled");
      const occupancy = all.length ? all.reduce((total, load) => total + load.total_weight_kg / load.capacity_kg_snapshot, 0) / all.length * 100 : 0;
      const pending = candidatesFor(tables, null).filter((item) => item.allocated < item.quantity);
      return [
        { id: "open", label: "Em andamento", value: open.length, format: "number", caption: "Planejadas ou carregadas", selection: { title: "Cargas em andamento", columns, rows: open.map(row) } },
        { id: "shipped", label: "Expedidas no mês", value: shipped.length, format: "number", tone: "good", selection: { title: "Cargas expedidas no mês", columns, rows: shipped.map(row) } },
        { id: "occupancy", label: "Ocupação média", value: occupancy, format: "percent", selection: { title: "Ocupação das cargas", columns, rows: all.map(row) } },
        { id: "pending", label: "Sacas a enviar", value: pending.reduce((total, item) => total + item.quantity - item.allocated, 0), format: "number", tone: "warn", caption: `${new Set(pending.map((item) => item.quote_id)).size} pedidos aprovados`, selection: { title: "Itens aprovados com saldo a enviar", columns: [{ key: "quote", label: "Pedido" }, { key: "customer", label: "Cliente" }, { key: "product", label: "Produto" }, { key: "bags", label: "Sacas a enviar", format: "number" }], rows: pending.map((item) => ({ id: item.quote_item_id, quote: `#${item.quote_number}`, customer: item.customer_name ?? "—", product: item.product_name, bags: item.quantity - item.allocated })) } },
      ];
    }
    case "prices":
    case "discounts":
    case "terms":
    case "freight":
    case "policy":
    case "updates": {
      const log = tables.catalog.changeLog;
      const changes: PageKpi = { id: "changes", label: "Alterações registradas", value: log.length, format: "number", caption: log[0] ? `Última: ${new Date(log[0].at).toLocaleDateString("pt-BR")}` : "Nenhuma alteração ainda", selection: { title: "Histórico de alterações do catálogo", columns: [{ key: "at", label: "Quando", format: "date" }, { key: "who", label: "Quem" }, { key: "what", label: "O que mudou" }], rows: log.map((entry, index) => ({ id: index, at: localKey(entry.at), who: entry.who, what: entry.what })) } };
      const groups = new Map<string, number>();
      for (const product of tables.catalog.products) groups.set(product.group, (groups.get(product.group) ?? 0) + 1);
      const avgDiscount = tables.catalog.discountLines.filter((line) => line.percentage !== null);
      const imports: PageKpi = { id: "imports", label: "Importações de PDF", value: tables.catalog_imports.length, format: "number", caption: tables.catalog_imports[0] ? tables.catalog_imports[0].fileName : undefined, selection: { title: "Importações de tabela", columns: [{ key: "at", label: "Quando", format: "date" }, { key: "file", label: "Arquivo" }, { key: "changes", label: "Alterações", format: "number" }, { key: "who", label: "Quem" }], rows: tables.catalog_imports.map((item) => ({ id: item.id, at: localKey(item.appliedAt), file: item.fileName, changes: item.changes, who: item.appliedBy })) } };
      return [
        { id: "products", label: "Produtos ativos", value: tables.catalog.products.length, format: "number", caption: [...groups.entries()].map(([group, count]) => `${count} ${group.toLowerCase()}`).join(" · "), selection: { title: "Produtos ativos", columns: [{ key: "name", label: "Produto" }, { key: "group", label: "Linha" }, { key: "weight", label: "Saca (kg)", format: "number" }, { key: "price", label: "À vista", format: "currency" }], rows: tables.catalog.products.map((product) => ({ id: product.id ?? product.name, name: product.name, group: product.group, weight: product.weightKg, price: product.prices[0] })) } },
        { id: "discount", label: "Desconto médio", value: avgDiscount.length ? avgDiscount.reduce((total, line) => total + (line.percentage ?? 0), 0) / avgDiscount.length : 0, format: "percent", caption: `${avgDiscount.length} linhas fixas`, selection: { title: "Linhas de desconto", columns: [{ key: "name", label: "Linha" }, { key: "pct", label: "Desconto", format: "percent" }], rows: tables.catalog.discountLines.map((line) => ({ id: line.id ?? line.name, name: line.name, pct: line.percentage })) } },
        { id: "freight", label: "Faixas de frete", value: tables.catalog.juaraFreightRates.length + tables.catalog.regionalFreightRates.length, format: "number", caption: `Chapa R$ ${tables.catalog.handlingRatePerTon.toLocaleString("pt-BR")}/t`, selection: { title: "Faixas e cidades de frete", columns: [{ key: "name", label: "Faixa / cidade" }, { key: "table", label: "Tabela" }, { key: "closed", label: "Fechada (R$/t)", format: "currency" }], rows: [...tables.catalog.juaraFreightRates.map((rate) => ({ id: rate.id ?? rate.distance, name: rate.distance, table: "Juara", closed: rate.closedPerTon })), ...tables.catalog.regionalFreightRates.map((rate) => ({ id: rate.id ?? rate.location, name: rate.location, table: "Regional", closed: rate.closedPerTon }))] } },
        tab === "updates" ? imports : changes,
      ];
    }
    case "users": {
      const columns = [{ key: "name", label: "Nome" }, { key: "login", label: "Login" }, { key: "role", label: "Perfil" }, { key: "status", label: "Situação" }];
      const rows = tables.profiles.map((profile) => ({ id: profile.id, name: profile.displayName ?? profile.login, login: profile.login, role: profile.role, status: profile.active ? "Ativo" : "Inativo" }));
      const count = (role: string) => tables.profiles.filter((profile) => profile.active && profile.role === role).length;
      return [
        { id: "active", label: "Usuários ativos", value: tables.profiles.filter((profile) => profile.active).length, format: "number", selection: { title: "Usuários", columns, rows } },
        { id: "admins", label: "Administradores", value: count("administrador"), format: "number", selection: { title: "Usuários", columns, rows: rows.filter((row) => row.role === "administrador") } },
        { id: "sellers", label: "Comerciais", value: count("comercial"), format: "number", selection: { title: "Usuários", columns, rows: rows.filter((row) => row.role === "comercial") } },
      ];
    }
    default:
      return [];
  }
}
