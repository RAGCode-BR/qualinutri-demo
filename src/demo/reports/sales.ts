import type { DemoTables, Row as DbRow } from "../store/types";
import { customerScore } from "../erp/finance";
import { describePaymentTerm } from "../../domain/payment/paymentTerm";
import {
  customerCity, daysBetween, fd, toCustomer, toQuote, groupBy, inPeriod, localDay, previousOf, productGroup, round2, sellerName, series, sum, topWithOthers,
  type ReportDef, type ReportFilters, type Row, type Table,
} from "./core";

type Quote = DbRow<"quotes">;
type Item = DbRow<"quote_items">;

export type SaleLine = {
  quote: Quote;
  item: Item;
  day: string;
  customerId: string | null;
  customer: string;
  sellerId: string | null;
  seller: string;
  city: string;
  group: string;
  product: string;
  bags: number;
  kg: number;
  revenue: number;
  discount: number;
};

function quoteMatches(tables: DemoTables, quote: Quote, filters: ReportFilters) {
  if (filters.seller && quote.created_by !== filters.seller) return false;
  if (filters.customer && quote.customer_id !== filters.customer) return false;
  if (filters.city && customerCity(tables, quote.customer_id) !== filters.city) return false;
  return true;
}

/** Linhas vendidas = itens de orçamentos aprovados no período (mesma base do relatório de vendas original). */
export function saleLines(tables: DemoTables, filters: ReportFilters): SaleLine[] {
  const lines: SaleLine[] = [];
  const quotes = tables.quotes.filter((quote) => quote.status === "approved" && inPeriod(quote.approved_at, filters) && quoteMatches(tables, quote, filters));
  const byQuote = groupBy(tables.quote_items, (item) => item.quote_id);
  for (const quote of quotes) {
    for (const item of byQuote.get(quote.id) ?? []) {
      const group = productGroup(tables, item.product_name_snapshot, item.category_name_snapshot);
      if (filters.product && item.product_name_snapshot !== filters.product) continue;
      if (filters.group && group !== filters.group) continue;
      lines.push({
        quote, item, day: localDay(quote.approved_at),
        customerId: quote.customer_id, customer: quote.customer_name_snapshot ?? "Sem cliente",
        sellerId: quote.created_by, seller: sellerName(tables, quote.created_by),
        city: customerCity(tables, quote.customer_id), group, product: item.product_name_snapshot,
        bags: item.quantity, kg: item.quantity * Number(item.weight_kg_snapshot), revenue: Number(item.product_subtotal),
        discount: Number(item.economy_per_unit) * item.quantity,
      });
    }
  }
  return lines;
}

const quoteRow = (line: SaleLine, lines: SaleLine[]): Row => {
  const mine = lines.filter((other) => other.quote.id === line.quote.id);
  return {
    numero: `#${line.quote.quote_number}`, data: line.day, cliente: line.customer, vendedor: line.seller, cidade: line.city,
    sacas: sum(mine, (item) => item.bags), toneladas: round2(sum(mine, (item) => item.kg) / 1000), valor: round2(sum(mine, (item) => item.revenue)),
    _drill: toQuote(line.quote.id),
  };
};

function ordersTable(title: string, lines: SaleLine[]): Table {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const line of [...lines].sort((a, b) => b.day.localeCompare(a.day))) {
    if (seen.has(line.quote.id)) continue;
    seen.add(line.quote.id);
    rows.push(quoteRow(line, lines));
  }
  return {
    title,
    columns: [{ key: "numero", label: "Pedido" }, { key: "data", label: "Aprovado em", format: "date" }, { key: "cliente", label: "Cliente" }, { key: "vendedor", label: "Vendedor" }, { key: "cidade", label: "Cidade" }, { key: "sacas", label: "Sacas", format: "number" }, { key: "toneladas", label: "Toneladas", format: "tons" }, { key: "valor", label: "Valor", format: "currency" }],
    rows,
    // Totais pela soma exata das linhas vendidas (igual ao KPI), não pela soma dos valores já arredondados.
    total: { numero: `${rows.length} pedidos`, sacas: sum(lines, (line) => line.bags), toneladas: round2(sum(lines, (line) => line.kg) / 1000), valor: round2(sum(lines, (line) => line.revenue)) },
  };
}

const orderCount = (lines: SaleLine[]) => new Set(lines.map((line) => line.quote.id)).size;

const salesPeriod: ReportDef = {
  id: "vendas-periodo",
  area: "vendas",
  title: "Vendas por período",
  description: "Faturamento, pedidos, toneladas e ticket médio no período, com a evolução no tempo.",
  filters: ["seller", "customer", "group", "product", "city"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const before = saleLines(tables, previousOf(filters));
    const revenue = sum(lines, (line) => line.revenue);
    const orders = orderCount(lines);
    const table = ordersTable("Pedidos aprovados", lines);
    return {
      kpis: [
        { id: "revenue", label: "Faturamento", value: round2(revenue), format: "currency", previous: round2(sum(before, (line) => line.revenue)), detail: table },
        { id: "orders", label: "Pedidos aprovados", value: orders, format: "number", previous: orderCount(before), detail: table },
        { id: "ticket", label: "Ticket médio", value: orders ? round2(revenue / orders) : 0, format: "currency", previous: orderCount(before) ? round2(sum(before, (line) => line.revenue) / orderCount(before)) : 0 },
        { id: "tons", label: "Toneladas vendidas", value: round2(sum(lines, (line) => line.kg) / 1000), format: "tons", previous: round2(sum(before, (line) => line.kg) / 1000) },
        { id: "bags", label: "Sacas vendidas", value: sum(lines, (line) => line.bags), format: "number", previous: sum(before, (line) => line.bags) },
      ],
      charts: [
        { kind: "line", id: "time", title: "Faturamento no tempo", format: "currency", points: series(lines, filters, (line) => line.day, (line) => line.revenue) },
        { kind: "bar", id: "group", title: "Faturamento por linha de produto", format: "currency", items: [...groupBy(lines, (line) => line.group)].map(([label, list]) => ({ label, value: round2(sum(list, (line) => line.revenue)), drill: fd("group", label) })).sort((a, b) => b.value - a.value) },
        { kind: "donut", id: "seller", title: "Participação por vendedor", format: "currency", items: topWithOthers([...groupBy(lines, (line) => line.sellerId ?? "")].map(([id, list]) => ({ label: list[0].seller, value: round2(sum(list, (line) => line.revenue)), drill: id ? fd("seller", id) : null })), 6) },
      ],
      table,
    };
  },
};

const salesProduct: ReportDef = {
  id: "vendas-produto",
  area: "vendas",
  title: "Vendas por produto",
  description: "Ranking de produtos: sacas, toneladas, faturamento, preço médio e participação.",
  filters: ["seller", "customer", "group", "city"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const total = sum(lines, (line) => line.revenue);
    const rows: Row[] = [...groupBy(lines, (line) => line.product)].map(([product, list]) => {
      const revenue = sum(list, (line) => line.revenue);
      const bags = sum(list, (line) => line.bags);
      return { produto: product, linha: list[0].group, pedidos: orderCount(list), sacas: bags, toneladas: round2(sum(list, (line) => line.kg) / 1000), faturamento: round2(revenue), participacao: total ? round2((revenue / total) * 100) : 0, preco: bags ? round2(revenue / bags) : 0, _drill: fd("product", product) };
    }).sort((a, b) => Number(b.faturamento) - Number(a.faturamento));
    const top = rows[0];
    return {
      kpis: [
        { id: "products", label: "Produtos vendidos", value: rows.length, format: "number" },
        { id: "top", label: "Mais vendido", value: Number(top?.faturamento ?? 0), format: "currency", text: String(top?.produto ?? "—") },
        { id: "tons", label: "Toneladas", value: round2(sum(lines, (line) => line.kg) / 1000), format: "tons" },
        { id: "price", label: "Preço médio por saca", value: sum(lines, (line) => line.bags) ? round2(total / sum(lines, (line) => line.bags)) : 0, format: "currency" },
      ],
      charts: [
        { kind: "bar", id: "rank", title: "Top produtos por faturamento", format: "currency", horizontal: true, items: rows.slice(0, 12).map((row) => ({ label: String(row.produto), value: Number(row.faturamento), drill: fd("product", String(row.produto)) })) },
        { kind: "donut", id: "groups", title: "Faturamento por linha", format: "currency", items: topWithOthers([...groupBy(lines, (line) => line.group)].map(([label, list]) => ({ label, value: round2(sum(list, (line) => line.revenue)), drill: fd("group", label) })), 6) },
        { kind: "bar", id: "tons", title: "Toneladas por produto", format: "tons", horizontal: true, items: [...rows].sort((a, b) => Number(b.toneladas) - Number(a.toneladas)).slice(0, 12).map((row) => ({ label: String(row.produto), value: Number(row.toneladas), drill: fd("product", String(row.produto)) })) },
      ],
      table: {
        title: "Produtos",
        columns: [{ key: "produto", label: "Produto" }, { key: "linha", label: "Linha" }, { key: "pedidos", label: "Pedidos", format: "number" }, { key: "sacas", label: "Sacas", format: "number" }, { key: "toneladas", label: "Toneladas", format: "tons" }, { key: "faturamento", label: "Faturamento", format: "currency" }, { key: "participacao", label: "% do total", format: "percent" }, { key: "preco", label: "Preço médio/saca", format: "currency" }],
        rows,
        total: { produto: `${rows.length} produtos`, sacas: sum(rows, (row) => Number(row.sacas)), toneladas: round2(sum(rows, (row) => Number(row.toneladas))), faturamento: round2(total), participacao: rows.length ? 100 : 0 },
      },
    };
  },
};

const salesCustomerAbc: ReportDef = {
  id: "vendas-cliente",
  area: "clientes",
  title: "Curva ABC de clientes",
  description: "Quem mais compra: faturamento por cliente, participação acumulada e classe A, B ou C.",
  filters: ["seller", "group", "product", "city"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const total = sum(lines, (line) => line.revenue);
    let accumulated = 0;
    const rows: Row[] = [...groupBy(lines, (line) => line.customerId ?? line.customer)].map(([, list]) => ({ list, revenue: sum(list, (line) => line.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .map(({ list, revenue }) => {
        accumulated += revenue;
        const share = total ? (accumulated / total) * 100 : 0;
        return { cliente: list[0].customer, cidade: list[0].city, pedidos: orderCount(list), toneladas: round2(sum(list, (line) => line.kg) / 1000), faturamento: round2(revenue), participacao: total ? round2((revenue / total) * 100) : 0, acumulado: round2(share), classe: share <= 80 ? "A" : share <= 95 ? "B" : "C", _drill: list[0].customerId ? toCustomer(list[0].customerId) : null };
      });
    const byClass = (cls: string) => rows.filter((row) => row.classe === cls);
    return {
      kpis: [
        { id: "buyers", label: "Clientes que compraram", value: rows.length, format: "number" },
        { id: "a", label: "Clientes classe A", value: byClass("A").length, format: "number", hint: "80% do faturamento", detail: { title: "Clientes classe A", columns: [{ key: "cliente", label: "Cliente" }, { key: "faturamento", label: "Faturamento", format: "currency" }], rows: byClass("A") } },
        { id: "share", label: "Peso dos 5 maiores", value: total ? round2(sum(rows.slice(0, 5), (row) => Number(row.faturamento)) / total * 100) : 0, format: "percent" },
        { id: "avg", label: "Faturamento médio por cliente", value: rows.length ? round2(total / rows.length) : 0, format: "currency" },
      ],
      charts: [
        { kind: "bar", id: "top", title: "Top 12 clientes", format: "currency", horizontal: true, items: rows.slice(0, 12).map((row) => ({ label: String(row.cliente), value: Number(row.faturamento), drill: row._drill ?? null })) },
        { kind: "donut", id: "abc", title: "Faturamento por classe", format: "currency", items: ["A", "B", "C"].map((cls) => ({ label: `Classe ${cls} (${byClass(cls).length})`, value: round2(sum(byClass(cls), (row) => Number(row.faturamento))) })) },
        { kind: "line", id: "pareto", title: "Participação acumulada (%)", format: "percent", points: rows.slice(0, 40).map((row, index) => ({ label: String(index + 1), value: Number(row.acumulado), drill: row._drill ?? null })) },
      ],
      table: {
        title: "Clientes",
        columns: [{ key: "cliente", label: "Cliente" }, { key: "cidade", label: "Cidade" }, { key: "pedidos", label: "Pedidos", format: "number" }, { key: "toneladas", label: "Toneladas", format: "tons" }, { key: "faturamento", label: "Faturamento", format: "currency" }, { key: "participacao", label: "%", format: "percent" }, { key: "acumulado", label: "% acumulado", format: "percent" }, { key: "classe", label: "Classe" }],
        rows,
        total: { cliente: `${rows.length} clientes`, faturamento: round2(total) },
      },
    };
  },
};

const salesSeller: ReportDef = {
  id: "vendas-vendedor",
  area: "vendas",
  title: "Desempenho por vendedor",
  description: "Orçamentos feitos, aprovados, conversão, faturamento, ticket e descontos de cada vendedor.",
  filters: ["customer", "group", "product", "city"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const created = tables.quotes.filter((quote) => inPeriod(quote.created_at, filters) && quoteMatches(tables, quote, { ...filters, seller: "" }));
    const sellers = [...new Set([...created.map((quote) => quote.created_by ?? ""), ...lines.map((line) => line.sellerId ?? "")])];
    const rows: Row[] = sellers.map((id) => {
      const mine = lines.filter((line) => (line.sellerId ?? "") === id);
      const made = created.filter((quote) => (quote.created_by ?? "") === id);
      const approved = made.filter((quote) => quote.status === "approved").length;
      const revenue = sum(mine, (line) => line.revenue);
      return { vendedor: sellerName(tables, id || null), criados: made.length, aprovados: approved, conversao: made.length ? round2((approved / made.length) * 100) : 0, faturamento: round2(revenue), ticket: orderCount(mine) ? round2(revenue / orderCount(mine)) : 0, desconto: round2(sum(mine, (line) => line.discount)), _drill: id ? fd("seller", id) : null };
    }).sort((a, b) => Number(b.faturamento) - Number(a.faturamento));
    return {
      kpis: [
        { id: "sellers", label: "Vendedores ativos", value: rows.length, format: "number" },
        { id: "created", label: "Orçamentos feitos", value: created.length, format: "number" },
        { id: "conv", label: "Conversão geral", value: created.length ? round2(created.filter((quote) => quote.status === "approved").length / created.length * 100) : 0, format: "percent" },
        { id: "discount", label: "Descontos concedidos", value: round2(sum(lines, (line) => line.discount)), format: "currency" },
      ],
      charts: [
        { kind: "bar", id: "revenue", title: "Faturamento por vendedor", format: "currency", items: rows.map((row) => ({ label: String(row.vendedor), value: Number(row.faturamento), drill: row._drill ?? null })) },
        { kind: "bar", id: "conv", title: "Conversão de orçamentos (%)", format: "percent", items: rows.map((row) => ({ label: String(row.vendedor), value: Number(row.conversao), drill: row._drill ?? null })) },
        { kind: "line", id: "time", title: "Faturamento no tempo", format: "currency", points: series(lines, filters, (line) => line.day, (line) => line.revenue) },
      ],
      table: {
        title: "Vendedores",
        columns: [{ key: "vendedor", label: "Vendedor" }, { key: "criados", label: "Orçamentos", format: "number" }, { key: "aprovados", label: "Aprovados", format: "number" }, { key: "conversao", label: "Conversão", format: "percent" }, { key: "faturamento", label: "Faturamento", format: "currency" }, { key: "ticket", label: "Ticket médio", format: "currency" }, { key: "desconto", label: "Descontos", format: "currency" }],
        rows,
      },
    };
  },
};

const salesRegion: ReportDef = {
  id: "vendas-regiao",
  area: "vendas",
  title: "Vendas por cidade e região",
  description: "Onde a Qualinutri vende: cidades, clientes, toneladas, faturamento e frete.",
  filters: ["seller", "group", "product"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const rows: Row[] = [...groupBy(lines, (line) => line.city)].map(([city, list]) => {
      const quotes = [...new Map(list.map((line) => [line.quote.id, line.quote])).values()];
      return { cidade: city, clientes: new Set(list.map((line) => line.customer)).size, pedidos: quotes.length, toneladas: round2(sum(list, (line) => line.kg) / 1000), faturamento: round2(sum(list, (line) => line.revenue)), frete: round2(sum(quotes, (quote) => Number(quote.freight_total))), _drill: fd("city", city) };
    }).sort((a, b) => Number(b.faturamento) - Number(a.faturamento));
    const quotes = [...new Map(lines.map((line) => [line.quote.id, line.quote])).values()];
    const zones = groupBy(quotes, (quote) => quote.freight_table_name_snapshot ? `Frete ${quote.freight_table_name_snapshot}` : "Sem frete (FOB)");
    return {
      kpis: [
        { id: "cities", label: "Cidades atendidas", value: rows.length, format: "number" },
        { id: "top", label: "Maior praça", value: Number(rows[0]?.faturamento ?? 0), format: "currency", text: String(rows[0]?.cidade ?? "—") },
        { id: "freight", label: "Frete cobrado", value: round2(sum(quotes, (quote) => Number(quote.freight_total))), format: "currency" },
        { id: "tons", label: "Toneladas", value: round2(sum(lines, (line) => line.kg) / 1000), format: "tons" },
      ],
      charts: [
        { kind: "bar", id: "city", title: "Faturamento por cidade", format: "currency", horizontal: true, items: rows.slice(0, 12).map((row) => ({ label: String(row.cidade), value: Number(row.faturamento), drill: row._drill ?? null })) },
        { kind: "donut", id: "zone", title: "Pedidos por tabela de frete", format: "number", items: [...zones].map(([label, list]) => ({ label, value: list.length })) },
        { kind: "bar", id: "tons", title: "Toneladas por cidade", format: "tons", items: [...rows].sort((a, b) => Number(b.toneladas) - Number(a.toneladas)).slice(0, 10).map((row) => ({ label: String(row.cidade), value: Number(row.toneladas), drill: row._drill ?? null })) },
      ],
      table: {
        title: "Cidades",
        columns: [{ key: "cidade", label: "Cidade" }, { key: "clientes", label: "Clientes", format: "number" }, { key: "pedidos", label: "Pedidos", format: "number" }, { key: "toneladas", label: "Toneladas", format: "tons" }, { key: "faturamento", label: "Faturamento", format: "currency" }, { key: "frete", label: "Frete", format: "currency" }],
        rows,
      },
    };
  },
};

const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", issued: "Enviado", approved: "Aprovado", cancelled: "Cancelado" };

const quoteFunnel: ReportDef = {
  id: "funil",
  area: "vendas",
  title: "Funil de orçamentos",
  description: "Do rascunho ao aprovado: quantos orçamentos em cada etapa, conversão e tempo até fechar.",
  filters: ["seller", "customer", "city", "status"],
  run(tables, filters) {
    const quotes = tables.quotes.filter((quote) => inPeriod(quote.created_at, filters) && quoteMatches(tables, quote, filters) && (!filters.status || quote.status === filters.status));
    const approved = quotes.filter((quote) => quote.status === "approved");
    const reached = (status: string) => quotes.filter((quote) => status === "draft" || (status === "issued" ? quote.issued_at || quote.status === "approved" : quote.status === status)).length;
    const days = approved.filter((quote) => quote.approved_at).map((quote) => daysBetween(quote.created_at, quote.approved_at!));
    const rows: Row[] = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((quote) => ({ numero: `#${quote.quote_number}`, criado: localDay(quote.created_at), cliente: quote.customer_name_snapshot ?? "Sem cliente", vendedor: sellerName(tables, quote.created_by), situacao: STATUS_LABEL[quote.status] ?? quote.status, valor: Number(quote.grand_total), _drill: toQuote(quote.id) }));
    return {
      kpis: [
        { id: "created", label: "Orçamentos criados", value: quotes.length, format: "number" },
        { id: "approved", label: "Aprovados", value: approved.length, format: "number", tone: "good" },
        { id: "conv", label: "Conversão", value: quotes.length ? round2(approved.length / quotes.length * 100) : 0, format: "percent" },
        { id: "days", label: "Dias até aprovar (média)", value: days.length ? round2(sum(days, (day) => day) / days.length) : 0, format: "days" },
        { id: "open", label: "Em aberto (valor)", value: round2(sum(quotes.filter((quote) => quote.status === "issued" || quote.status === "draft"), (quote) => Number(quote.grand_total))), format: "currency", tone: "warn" },
      ],
      charts: [
        { kind: "bar", id: "funnel", title: "Etapas do funil", format: "number", items: [
          { label: "Criados", value: reached("draft"), drill: null },
          { label: "Enviados", value: reached("issued"), drill: fd("status", "issued") },
          { label: "Aprovados", value: approved.length, drill: fd("status", "approved") },
          { label: "Cancelados", value: quotes.filter((quote) => quote.status === "cancelled").length, drill: fd("status", "cancelled") },
        ] },
        { kind: "donut", id: "status", title: "Situação atual", format: "number", items: Object.entries(STATUS_LABEL).map(([status, label]) => ({ label, value: quotes.filter((quote) => quote.status === status).length, drill: fd("status", status) })).filter((item) => item.value > 0) },
        { kind: "line", id: "created", title: "Orçamentos criados no tempo", format: "number", points: series(quotes, filters, (quote) => localDay(quote.created_at), () => 1) },
      ],
      table: {
        title: "Orçamentos",
        columns: [{ key: "numero", label: "Nº" }, { key: "criado", label: "Criado em", format: "date" }, { key: "cliente", label: "Cliente" }, { key: "vendedor", label: "Vendedor" }, { key: "situacao", label: "Situação" }, { key: "valor", label: "Valor", format: "currency" }],
        rows,
        total: { numero: `${rows.length} orçamentos`, valor: round2(sum(rows, (row) => Number(row.valor))) },
      },
    };
  },
};

const discounts: ReportDef = {
  id: "descontos",
  area: "vendas",
  title: "Descontos concedidos",
  description: "Quanto foi dado de desconto, em quais produtos, para quem e por qual vendedor.",
  filters: ["seller", "customer", "group", "product"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const withDiscount = lines.filter((line) => line.discount > 0);
    const gross = sum(lines, (line) => Number(line.item.table_unit_price) * line.bags);
    const given = sum(lines, (line) => line.discount);
    return {
      kpis: [
        { id: "given", label: "Total em descontos", value: round2(given), format: "currency", tone: "warn" },
        { id: "pct", label: "Desconto médio", value: gross ? round2(given / gross * 100) : 0, format: "percent" },
        { id: "lines", label: "Itens com desconto", value: withDiscount.length, format: "number" },
        { id: "orders", label: "Pedidos com desconto", value: orderCount(withDiscount), format: "number" },
      ],
      charts: [
        { kind: "bar", id: "product", title: "Desconto por produto", format: "currency", horizontal: true, items: [...groupBy(withDiscount, (line) => line.product)].map(([label, list]) => ({ label, value: round2(sum(list, (line) => line.discount)), drill: fd("product", label) })).sort((a, b) => b.value - a.value).slice(0, 12) },
        { kind: "bar", id: "seller", title: "Desconto por vendedor", format: "currency", items: [...groupBy(withDiscount, (line) => line.sellerId ?? "")].map(([id, list]) => ({ label: list[0].seller, value: round2(sum(list, (line) => line.discount)), drill: id ? fd("seller", id) : null })) },
        { kind: "line", id: "time", title: "Descontos no tempo", format: "currency", points: series(withDiscount, filters, (line) => line.day, (line) => line.discount) },
      ],
      table: {
        title: "Itens com desconto",
        columns: [{ key: "numero", label: "Pedido" }, { key: "data", label: "Data", format: "date" }, { key: "cliente", label: "Cliente" }, { key: "produto", label: "Produto" }, { key: "sacas", label: "Sacas", format: "number" }, { key: "percentual", label: "% desconto", format: "percent" }, { key: "desconto", label: "Desconto (R$)", format: "currency" }],
        rows: withDiscount.sort((a, b) => b.discount - a.discount).map((line) => ({ numero: `#${line.quote.quote_number}`, data: line.day, cliente: line.customer, produto: line.product, sacas: line.bags, percentual: round2(Number(line.item.total_discount_percentage)), desconto: round2(line.discount), _drill: toQuote(line.quote.id) })),
        total: { numero: `${withDiscount.length} itens`, desconto: round2(given) },
      },
    };
  },
};

const paymentTerms: ReportDef = {
  id: "condicoes",
  area: "vendas",
  title: "Condições de pagamento",
  description: "Como os clientes pagam: à vista, prazos e parcelamentos, com valores e quantidade de pedidos.",
  filters: ["seller", "customer", "city"],
  run(tables, filters) {
    const lines = saleLines(tables, filters);
    const quotes = [...new Map(lines.map((line) => [line.quote.id, line])).values()];
    const label = (line: SaleLine) => {
      const term = line.item.payment_term_snapshot;
      if (!term) return "Sem condição";
      try { return describePaymentTerm(term, line.quote.payment_mode === "installments" || line.quote.payment_mode === "single" ? line.quote.payment_mode : null); } catch { return term; }
    };
    const rows: Row[] = [...groupBy(quotes, label)].map(([condicao, list]) => ({ condicao, pedidos: list.length, faturamento: round2(sum(list, (line) => Number(line.quote.grand_total))), ticket: list.length ? round2(sum(list, (line) => Number(line.quote.grand_total)) / list.length) : 0, antecipado: list.filter((line) => line.quote.anticipated_payment).length })).sort((a, b) => Number(b.faturamento) - Number(a.faturamento));
    const cash = quotes.filter((line) => line.quote.anticipated_payment).length;
    return {
      kpis: [
        { id: "terms", label: "Condições usadas", value: rows.length, format: "number" },
        { id: "cash", label: "Pedidos com pagamento antecipado", value: cash, format: "number" },
        { id: "cashPct", label: "% antecipado", value: quotes.length ? round2(cash / quotes.length * 100) : 0, format: "percent" },
        { id: "main", label: "Condição mais usada", value: Number(rows[0]?.pedidos ?? 0), format: "number", text: String(rows[0]?.condicao ?? "—") },
      ],
      charts: [
        { kind: "donut", id: "terms", title: "Faturamento por condição", format: "currency", items: topWithOthers(rows.map((row) => ({ label: String(row.condicao), value: Number(row.faturamento) })), 6) },
        { kind: "bar", id: "orders", title: "Pedidos por condição", format: "number", items: rows.map((row) => ({ label: String(row.condicao), value: Number(row.pedidos) })) },
      ],
      table: {
        title: "Condições de pagamento",
        columns: [{ key: "condicao", label: "Condição" }, { key: "pedidos", label: "Pedidos", format: "number" }, { key: "faturamento", label: "Faturamento", format: "currency" }, { key: "ticket", label: "Ticket médio", format: "currency" }, { key: "antecipado", label: "Antecipados", format: "number" }],
        rows,
      },
    };
  },
};

const customerPortfolio: ReportDef = {
  id: "carteira",
  area: "clientes",
  title: "Carteira de clientes e crédito",
  description: "Clientes ativos, novos, score de crédito (verde, amarelo, vermelho), em aberto e em atraso.",
  filters: ["city", "status"],
  run(tables, filters, today) {
    const level = { verde: "Em dia", amarelo: "Atenção", vermelho: "Em atraso (5+ dias)" } as const;
    const customers = tables.customers.filter((customer) => (!filters.city || customerCity(tables, customer.id) === filters.city));
    const scored = customers.filter((customer) => customer.active).map((customer) => ({ customer, score: customerScore(tables, customer.id, today) })).filter((row) => !filters.status || row.score.level === filters.status);
    const created = customers.filter((customer) => inPeriod(customer.created_at, filters));
    return {
      kpis: [
        { id: "active", label: "Clientes ativos", value: customers.filter((customer) => customer.active).length, format: "number" },
        { id: "new", label: "Novos no período", value: created.length, format: "number", tone: "good", detail: { title: "Novos clientes", columns: [{ key: "cliente", label: "Cliente" }, { key: "cidade", label: "Cidade" }, { key: "cadastro", label: "Cadastro", format: "date" }], rows: created.map((customer) => ({ cliente: customer.legal_name, cidade: customerCity(tables, customer.id), cadastro: localDay(customer.created_at), _drill: toCustomer(customer.id) })) } },
        { id: "red", label: "Score vermelho", value: scored.filter((row) => row.score.level === "vermelho").length, format: "number", tone: "bad" },
        { id: "late", label: "Valor em atraso", value: round2(sum(scored, (row) => row.score.lateAmount)), format: "currency", tone: "bad" },
        { id: "open", label: "Em aberto (a receber)", value: round2(sum(scored, (row) => row.score.openAmount)), format: "currency" },
      ],
      charts: [
        { kind: "donut", id: "levels", title: "Clientes por score", format: "number", items: (Object.keys(level) as (keyof typeof level)[]).map((key) => ({ label: level[key], value: scored.filter((row) => row.score.level === key).length, drill: fd("status", key) })) },
        { kind: "bar", id: "late", title: "Maiores atrasos (R$)", format: "currency", horizontal: true, items: scored.filter((row) => row.score.lateAmount > 0).sort((a, b) => b.score.lateAmount - a.score.lateAmount).slice(0, 10).map((row) => ({ label: row.customer.trade_name || row.customer.legal_name, value: round2(row.score.lateAmount), drill: toCustomer(row.customer.id) })) },
        { kind: "bar", id: "cities", title: "Clientes por cidade", format: "number", items: [...groupBy(customers, (customer) => customerCity(tables, customer.id))].map(([label, list]) => ({ label, value: list.length, drill: fd("city", label) })).sort((a, b) => b.value - a.value).slice(0, 10) },
      ],
      table: {
        title: "Clientes",
        columns: [{ key: "cliente", label: "Cliente" }, { key: "documento", label: "CPF/CNPJ" }, { key: "cidade", label: "Cidade" }, { key: "score", label: "Score", format: "number" }, { key: "nivel", label: "Situação" }, { key: "aberto", label: "Em aberto", format: "currency" }, { key: "atraso", label: "Em atraso", format: "currency" }, { key: "dias", label: "Maior atraso", format: "days" }],
        rows: scored.sort((a, b) => a.score.score - b.score.score).map((row) => ({ cliente: row.customer.legal_name, documento: row.customer.document ?? "—", cidade: customerCity(tables, row.customer.id), score: row.score.score, nivel: level[row.score.level], aberto: round2(row.score.openAmount), atraso: round2(row.score.lateAmount), dias: row.score.maxLate, _drill: toCustomer(row.customer.id) })),
      },
    };
  },
};

const VISIT_STATUS: Record<string, string> = { planned: "Agendada", completed: "Realizada", not_done: "Não realizada", cancelled: "Cancelada" };

const visits: ReportDef = {
  id: "visitas",
  area: "clientes",
  title: "Visitas a clientes",
  description: "Visitas agendadas, realizadas e não realizadas por vendedor, e quantas viraram orçamento.",
  filters: ["seller", "customer", "status"],
  run(tables, filters) {
    const list = tables.visits.filter((visit) => inPeriod(visit.visited_date ?? visit.scheduled_date, filters) && (!filters.seller || visit.seller_id === filters.seller) && (!filters.customer || visit.customer_id === filters.customer) && (!filters.status || visit.status === filters.status));
    const done = list.filter((visit) => visit.status === "completed");
    const withQuote = list.filter((visit) => visit.quote_id);
    return {
      kpis: [
        { id: "total", label: "Visitas", value: list.length, format: "number" },
        { id: "done", label: "Realizadas", value: done.length, format: "number", tone: "good" },
        { id: "rate", label: "Taxa de realização", value: list.length ? round2(done.length / list.length * 100) : 0, format: "percent" },
        { id: "quotes", label: "Viraram orçamento", value: withQuote.length, format: "number" },
      ],
      charts: [
        { kind: "bar", id: "seller", title: "Visitas por vendedor", format: "number", items: [...groupBy(list, (visit) => visit.seller_id)].map(([id, items]) => ({ label: sellerName(tables, id), value: items.length, drill: fd("seller", id) })) },
        { kind: "donut", id: "status", title: "Situação das visitas", format: "number", items: [...groupBy(list, (visit) => visit.status)].map(([status, items]) => ({ label: VISIT_STATUS[status] ?? status, value: items.length, drill: fd("status", status) })) },
        { kind: "line", id: "time", title: "Visitas no tempo", format: "number", points: series(list, filters, (visit) => (visit.visited_date ?? visit.scheduled_date ?? "").slice(0, 10), () => 1) },
      ],
      table: {
        title: "Visitas",
        columns: [{ key: "data", label: "Data", format: "date" }, { key: "cliente", label: "Cliente" }, { key: "vendedor", label: "Vendedor" }, { key: "situacao", label: "Situação" }, { key: "tipos", label: "Tipo" }, { key: "orcamento", label: "Orçamento" }],
        rows: list.sort((a, b) => (b.visited_date ?? b.scheduled_date ?? "").localeCompare(a.visited_date ?? a.scheduled_date ?? "")).map((visit) => ({ data: (visit.visited_date ?? visit.scheduled_date ?? "").slice(0, 10), cliente: tables.customers.find((customer) => customer.id === visit.customer_id)?.legal_name ?? "—", vendedor: sellerName(tables, visit.seller_id), situacao: VISIT_STATUS[visit.status] ?? visit.status, tipos: visit.visit_types.join(", "), orcamento: visit.quote_id ? `#${tables.quotes.find((quote) => quote.id === visit.quote_id)?.quote_number ?? ""}` : "—", _drill: toCustomer(visit.customer_id) })),
      },
    };
  },
};

export const SALES_REPORTS: ReportDef[] = [salesPeriod, salesProduct, salesSeller, salesRegion, quoteFunnel, discounts, paymentTerms, salesCustomerAbc, customerPortfolio, visits];
