import type { DemoTables, Row } from "../store/types";
import { addDays, isoDate } from "../store/ids";
import { openPayables, receivables, titleRef } from "./finance";
import type { TabId } from "../../layouts/AppSidebar";

export type Period = { from: string; to: string };
export type PeriodKey = "today" | "7d" | "month";
export type KpiFormat = "currency" | "number" | "percent" | "tons";
export type KpiId = "sales" | "openQuotes" | "conversion" | "topProduct" | "ticket" | "receivable" | "payable" | "overdue" | "newCustomers";

export type DrawerColumn = { key: string; label: string; format?: KpiFormat | "date" | "text" };
export type DrawerSelection = { title: string; columns: DrawerColumn[]; rows: Record<string, string | number | null>[] };

export type Kpi = {
  id: KpiId;
  label: string;
  caption?: string;
  value: number;
  format: KpiFormat;
  previous: number | null;
  /** Subir é ruim (atrasos, contas a pagar). */
  higherIsWorse?: boolean;
  trend: number[];
  simulated?: boolean;
  target?: TabId;
  selection: DrawerSelection;
};

function localKey(iso: string | null): string | null {
  return iso ? isoDate(new Date(iso)) : null;
}

function within(iso: string | null, period: Period) {
  const key = localKey(iso);
  return key !== null && key >= period.from && key <= period.to;
}

function parseKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function periodFor(key: PeriodKey, today: Date): Period {
  const to = isoDate(today);
  if (key === "today") return { from: to, to };
  if (key === "7d") return { from: isoDate(addDays(today, -6)), to };
  return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1, 12)), to };
}

export function previousPeriod(period: Period): Period {
  const from = parseKey(period.from);
  const to = parseKey(period.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return { from: isoDate(addDays(from, -days)), to: isoDate(addDays(from, -1)) };
}

const quoteColumns: DrawerColumn[] = [
  { key: "number", label: "Nº", format: "text" },
  { key: "customer", label: "Cliente", format: "text" },
  { key: "seller", label: "Vendedor", format: "text" },
  { key: "date", label: "Data", format: "date" },
  { key: "total", label: "Produtos", format: "currency" },
  { key: "grand", label: "Total c/ frete", format: "currency" },
];

function sellerName(tables: DemoTables, id: string | null) {
  const user = tables.profiles.find((profile) => profile.id === id);
  return user ? user.displayName || user.login : "—";
}

function quoteRow(tables: DemoTables, quote: Row<"quotes">, date: string | null) {
  return { id: quote.id, number: `#${quote.quote_number}`, customer: quote.customer_name_snapshot ?? "Sem cliente", seller: sellerName(tables, quote.created_by), date: localKey(date), total: quote.product_subtotal, grand: quote.grand_total };
}

function approvedIn(tables: DemoTables, period: Period) {
  return tables.quotes.filter((quote) => quote.status === "approved" && within(quote.approved_at, period));
}

function sum(rows: Record<string, string | number | null>[], key: string) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

export function dailySales(tables: DemoTables, today: Date, days = 14): number[] {
  return Array.from({ length: days }, (_, index) => {
    const day = isoDate(addDays(today, index - days + 1));
    return approvedIn(tables, { from: day, to: day }).reduce((total, quote) => total + quote.product_subtotal, 0);
  });
}

export type ProductRank = { name: string; bags: number; revenue: number; tons: number };

export function productRanking(tables: DemoTables, period: Period): ProductRank[] {
  const approved = new Set(approvedIn(tables, period).map((quote) => quote.id));
  const byName = new Map<string, ProductRank>();
  for (const item of tables.quote_items) {
    if (!approved.has(item.quote_id)) continue;
    const current = byName.get(item.product_name_snapshot) ?? { name: item.product_name_snapshot, bags: 0, revenue: 0, tons: 0 };
    current.bags += item.quantity;
    current.revenue += item.product_subtotal;
    current.tons += (item.quantity * item.weight_kg_snapshot) / 1000;
    byName.set(item.product_name_snapshot, current);
  }
  return [...byName.values()].sort((a, b) => b.bags - a.bags);
}

function salesSelection(tables: DemoTables, period: Period): DrawerSelection {
  const rows = approvedIn(tables, period)
    .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""))
    .map((quote) => quoteRow(tables, quote, quote.approved_at));
  return { title: "Orçamentos aprovados no período", columns: quoteColumns, rows };
}

function conversionValue(tables: DemoTables, period: Period) {
  const issued = tables.quotes.filter((quote) => within(quote.issued_at, period)).length;
  const approved = approvedIn(tables, period).length;
  return issued === 0 ? 0 : (approved / issued) * 100;
}

export function dashboardKpis(tables: DemoTables, period: Period, today: Date): Kpi[] {
  const previous = previousPeriod(period);
  const todayKey = isoDate(today);
  const sales = salesSelection(tables, period);
  const salesValue = sum(sales.rows, "total");
  const previousSales = sum(salesSelection(tables, previous).rows, "total");
  const trend = dailySales(tables, today);

  const open = tables.quotes
    .filter((quote) => quote.status === "draft" || quote.status === "issued")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((quote) => ({ ...quoteRow(tables, quote, quote.created_at), status: quote.status === "draft" ? "Rascunho" : "Enviado" }));

  const ranking = productRanking(tables, period);
  const leader = ranking[0];

  const installments = receivables(tables, today);
  const toReceive = installments.filter((item) => !item.paidAt && item.dueDate >= todayKey);
  const payables = openPayables(tables);
  const toPay = payables.filter((item) => item.dueDate >= todayKey);
  const lateReceivables = installments.filter((item) => !item.paidAt && item.dueDate < todayKey);
  const latePayables = payables.filter((item) => item.dueDate < todayKey);

  const newCustomers = tables.customers.filter((customer) => within(customer.created_at, period));

  const overdueRows = [
    ...lateReceivables.map((item) => ({ type: "A receber", who: item.customer, ref: titleRef(item), date: item.dueDate, total: item.amount })),
    ...latePayables.map((item) => ({ type: "A pagar", who: item.supplier, ref: item.description, date: item.dueDate, total: item.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const approvedCount = sales.rows.length;
  const previousApproved = salesSelection(tables, previous).rows.length;

  return [
    {
      id: "sales", label: "Vendas", value: salesValue, format: "currency", previous: previousSales, trend, target: "quotes", selection: sales,
      caption: `${approvedCount} ${approvedCount === 1 ? "pedido aprovado" : "pedidos aprovados"}`,
    },
    {
      id: "openQuotes", label: "Orçamentos em aberto", value: sum(open, "total"), format: "currency", previous: null, trend: [], target: "quotes",
      caption: `${open.length} aguardando decisão`,
      selection: { title: "Orçamentos em rascunho ou enviados", columns: [...quoteColumns, { key: "status", label: "Situação", format: "text" }], rows: open },
    },
    {
      id: "conversion", label: "Conversão", value: conversionValue(tables, period), format: "percent", previous: conversionValue(tables, previous), trend: [], target: "analytics",
      caption: "Aprovados ÷ enviados no período",
      selection: { title: "Aprovados no período", columns: quoteColumns, rows: sales.rows },
    },
    {
      id: "topProduct", label: "Produto mais vendido", value: leader?.bags ?? 0, format: "number", previous: null, trend: [], target: "prices",
      caption: leader ? `${leader.name} · sacas` : "Sem vendas no período",
      selection: {
        title: "Ranking de produtos no período",
        columns: [{ key: "name", label: "Produto", format: "text" }, { key: "bags", label: "Sacas", format: "number" }, { key: "tons", label: "Toneladas", format: "tons" }, { key: "revenue", label: "Faturamento", format: "currency" }],
        rows: ranking.map((item) => ({ ...item })),
      },
    },
    {
      id: "ticket", label: "Ticket médio", value: approvedCount ? salesValue / approvedCount : 0, format: "currency",
      previous: previousApproved ? previousSales / previousApproved : null, trend: [], target: "quotes", caption: "Valor médio por pedido", selection: sales,
    },
    {
      id: "receivable", label: "A receber", value: toReceive.reduce((total, item) => total + item.amount, 0), format: "currency", previous: null, trend: [], simulated: true, target: "quotes",
      caption: `${toReceive.length} parcelas a vencer`,
      selection: {
        title: "Parcelas a receber",
        columns: [{ key: "customer", label: "Cliente", format: "text" }, { key: "ref", label: "Orçamento", format: "text" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }],
        rows: toReceive.map((item) => ({ id: item.quoteId, customer: item.customer, ref: titleRef(item), date: item.dueDate, total: item.amount })),
      },
    },
    {
      id: "payable", label: "A pagar", value: toPay.reduce((total, item) => total + item.amount, 0), format: "currency", previous: null, higherIsWorse: true, trend: [], simulated: true,
      caption: `${toPay.length} contas a vencer`,
      selection: {
        title: "Contas a pagar",
        columns: [{ key: "supplier", label: "Fornecedor", format: "text" }, { key: "category", label: "Categoria", format: "text" }, { key: "description", label: "Descrição", format: "text" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }],
        rows: toPay.map((item) => ({ id: item.id, supplier: item.supplier, category: item.category, description: item.description, date: item.dueDate, total: item.amount })),
      },
    },
    {
      id: "overdue", label: "Em atraso", value: overdueRows.length, format: "number", previous: null, higherIsWorse: true, trend: [],
      caption: `${overdueRows.reduce((total, row) => total + row.total, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} vencidos`,
      selection: {
        title: "Contas vencidas e não pagas",
        columns: [{ key: "type", label: "Tipo", format: "text" }, { key: "who", label: "Cliente / fornecedor", format: "text" }, { key: "ref", label: "Referência", format: "text" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }],
        rows: overdueRows,
      },
    },
    {
      id: "newCustomers", label: "Novos clientes", value: newCustomers.length, format: "number",
      previous: tables.customers.filter((customer) => within(customer.created_at, previous)).length, trend: [], target: "customers",
      caption: "Cadastrados no período",
      selection: {
        title: "Clientes cadastrados no período",
        columns: [{ key: "name", label: "Cliente", format: "text" }, { key: "document", label: "CPF/CNPJ", format: "text" }, { key: "phone", label: "Telefone", format: "text" }, { key: "date", label: "Cadastro", format: "date" }],
        rows: newCustomers.map((customer) => ({ id: customer.id, name: customer.legal_name, document: customer.document, phone: customer.phone, date: localKey(customer.created_at) })),
      },
    },
  ];
}

export function statusFunnel(tables: DemoTables, period: Period) {
  const created = tables.quotes.filter((quote) => within(quote.created_at, period));
  return {
    created: created.length,
    issued: created.filter((quote) => quote.issued_at).length,
    approved: created.filter((quote) => quote.status === "approved").length,
    cancelled: created.filter((quote) => quote.status === "cancelled").length,
  };
}

export function cashflow(tables: DemoTables, today: Date, days = 30) {
  const todayKey = isoDate(today);
  const end = isoDate(addDays(today, days));
  const incoming = receivables(tables, today).filter((item) => !item.paidAt && item.dueDate >= todayKey && item.dueDate <= end);
  const outgoing = openPayables(tables).filter((item) => item.dueDate >= todayKey && item.dueDate <= end);
  const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, index) => {
    const from = isoDate(addDays(today, index * 7));
    const to = isoDate(addDays(today, index * 7 + 6));
    return {
      label: index === 0 ? "Esta semana" : `+${index} sem.`,
      incoming: incoming.filter((item) => item.dueDate >= from && item.dueDate <= to).reduce((total, item) => total + item.amount, 0),
      outgoing: outgoing.filter((item) => item.dueDate >= from && item.dueDate <= to).reduce((total, item) => total + item.amount, 0),
    };
  });
  return weeks;
}

// ---------- Detalhes para cada elemento clicável do painel ----------

export function daySelection(tables: DemoTables, day: string): DrawerSelection {
  const sel = salesSelection(tables, { from: day, to: day });
  return { ...sel, title: `Pedidos aprovados em ${day.split("-").reverse().join("/")}` };
}

export function productSelection(tables: DemoTables, period: Period, productName: string): DrawerSelection {
  const approved = new Map(approvedIn(tables, period).map((quote) => [quote.id, quote]));
  const rows = tables.quote_items
    .filter((item) => approved.has(item.quote_id) && item.product_name_snapshot === productName)
    .map((item) => {
      const quote = approved.get(item.quote_id)!;
      return { id: item.id, number: `#${quote.quote_number}`, customer: quote.customer_name_snapshot ?? "Sem cliente", date: localKey(quote.approved_at), bags: item.quantity, price: item.final_unit_price, total: item.product_subtotal };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    title: `${productName} · pedidos aprovados`,
    columns: [{ key: "number", label: "Nº" }, { key: "customer", label: "Cliente" }, { key: "date", label: "Aprovado em", format: "date" }, { key: "bags", label: "Sacas", format: "number" }, { key: "price", label: "Preço final", format: "currency" }, { key: "total", label: "Subtotal", format: "currency" }],
    rows,
  };
}

export function weekSelection(tables: DemoTables, today: Date, weekIndex: number): DrawerSelection {
  const from = isoDate(addDays(today, weekIndex * 7));
  const to = isoDate(addDays(today, weekIndex * 7 + 6));
  const incoming = receivables(tables, today).filter((item) => !item.paidAt && item.dueDate >= from && item.dueDate <= to)
    .map((item) => ({ id: `${item.quoteId}-${item.number}`, type: "Entrada", who: item.customer, ref: titleRef(item), date: item.dueDate, total: item.amount }));
  const outgoing = openPayables(tables).filter((item) => item.dueDate >= from && item.dueDate <= to)
    .map((item) => ({ id: item.id, type: "Saída", who: item.supplier, ref: item.description, date: item.dueDate, total: -item.amount }));
  return {
    title: `Fluxo de caixa de ${from.split("-").reverse().slice(0, 2).join("/")} a ${to.split("-").reverse().slice(0, 2).join("/")} (simulado)`,
    columns: [{ key: "type", label: "Tipo" }, { key: "who", label: "Cliente / fornecedor" }, { key: "ref", label: "Referência" }, { key: "date", label: "Vencimento", format: "date" }, { key: "total", label: "Valor", format: "currency" }],
    rows: [...incoming, ...outgoing].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const statusNames: Record<string, string> = { draft: "Rascunho", issued: "Enviado", approved: "Aprovado", cancelled: "Cancelado" };

export function funnelSelection(tables: DemoTables, period: Period, step: "created" | "issued" | "approved" | "cancelled"): DrawerSelection {
  const created = tables.quotes.filter((quote) => within(quote.created_at, period));
  const list = step === "created" ? created : step === "issued" ? created.filter((quote) => quote.issued_at) : created.filter((quote) => quote.status === step);
  return {
    title: `Orçamentos criados no período · ${step === "created" ? "todos" : step === "issued" ? "enviados" : step === "approved" ? "aprovados" : "cancelados"}`,
    columns: [...quoteColumns, { key: "status", label: "Situação" }],
    rows: list.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((quote) => ({ ...quoteRow(tables, quote, quote.created_at), status: statusNames[quote.status] ?? quote.status })),
  };
}

export function quoteSelection(tables: DemoTables, quoteId: string): DrawerSelection {
  const quote = tables.quotes.find((item) => item.id === quoteId);
  const items = tables.quote_items.filter((item) => item.quote_id === quoteId).sort((a, b) => a.display_order - b.display_order);
  return {
    title: quote ? `Orçamento #${quote.quote_number} · ${quote.customer_name_snapshot ?? "Sem cliente"} · ${statusNames[quote.status] ?? quote.status}` : "Orçamento",
    columns: [{ key: "product", label: "Produto" }, { key: "bags", label: "Sacas", format: "number" }, { key: "weight", label: "Saca (kg)", format: "number" }, { key: "discount", label: "Desconto", format: "percent" }, { key: "price", label: "Preço final", format: "currency" }, { key: "freight", label: "Frete + chapa", format: "currency" }, { key: "total", label: "Total", format: "currency" }],
    rows: items.map((item) => ({ id: item.id, product: item.product_name_snapshot, bags: item.quantity, weight: item.weight_kg_snapshot, discount: item.total_discount_percentage, price: item.final_unit_price, freight: item.freight_subtotal + item.handling_subtotal, total: item.total })),
  };
}
