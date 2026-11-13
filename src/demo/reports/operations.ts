import { isoDate } from "../store/ids";
import { receivables } from "../kpis/finance";
import { CHECKLIST_TABS } from "../checklist/tabs";
import { costByTarget, tabSummary } from "../checklist/compliance";
import {
  customerCity, daysBetween, fd, groupBy, inPeriod, localDay, round2, series, sum, toLoad, toQuote, topWithOthers,
  type ReportDef, type Row,
} from "./core";

/* ================= Financeiro ================= */

const receivable: ReportDef = {
  id: "receber",
  area: "financeiro",
  title: "Contas a receber e atrasos",
  description: "Parcelas a receber por vencimento, idade dos atrasos (aging) e o que entra nas próximas semanas.",
  filters: ["customer", "city", "status"],
  run(tables, filters, today) {
    const todayKey = isoDate(today);
    const all = receivables(tables, today).filter((item) => {
      const quote = tables.quotes.find((row) => row.id === item.quoteId);
      if (filters.customer && quote?.customer_id !== filters.customer) return false;
      if (filters.city && customerCity(tables, quote?.customer_id ?? null) !== filters.city) return false;
      return true;
    });
    const state = (item: (typeof all)[number]) => item.paidAt ? "pago" : item.dueDate < todayKey ? "vencido" : "a_vencer";
    const list = all.filter((item) => inPeriod(item.dueDate, filters) || (!item.paidAt && item.dueDate < todayKey)).filter((item) => !filters.status || state(item) === filters.status);
    const open = list.filter((item) => !item.paidAt);
    const late = open.filter((item) => item.dueDate < todayKey);
    const age = (item: (typeof all)[number]) => daysBetween(item.dueDate, todayKey);
    const buckets: [string, (days: number) => boolean][] = [["A vencer", (d) => d <= 0], ["1 a 30 dias", (d) => d >= 1 && d <= 30], ["31 a 60 dias", (d) => d > 30 && d <= 60], ["61 a 90 dias", (d) => d > 60 && d <= 90], ["Mais de 90 dias", (d) => d > 90]];
    const label = { pago: "Pago", vencido: "Vencido", a_vencer: "A vencer" } as const;
    const lateTable = { title: "Parcelas vencidas", columns: [{ key: "cliente", label: "Cliente" }, { key: "parcela", label: "Parcela" }, { key: "vencimento", label: "Vencimento", format: "date" as const }, { key: "dias", label: "Atraso", format: "days" as const }, { key: "valor", label: "Valor", format: "currency" as const }], rows: late.map((item) => ({ cliente: item.customer, parcela: `#${item.quoteNumber} ${item.number}/${item.of}`, vencimento: item.dueDate, dias: age(item), valor: item.amount, _drill: toQuote(item.quoteId) })) };
    return {
      kpis: [
        { id: "open", label: "A receber (em aberto)", value: round2(sum(open, (item) => item.amount)), format: "currency" },
        { id: "late", label: "Vencido", value: round2(sum(late, (item) => item.amount)), format: "currency", tone: "bad", detail: lateTable },
        { id: "next30", label: "Vence em 30 dias", value: round2(sum(open.filter((item) => item.dueDate >= todayKey && daysBetween(todayKey, item.dueDate) <= 30), (item) => item.amount)), format: "currency" },
        { id: "received", label: "Recebido no período", value: round2(sum(list.filter((item) => item.paidAt && inPeriod(item.paidAt, filters)), (item) => item.amount)), format: "currency", tone: "good" },
        { id: "rate", label: "Inadimplência", value: sum(open, (item) => item.amount) ? round2(sum(late, (item) => item.amount) / sum(open, (item) => item.amount) * 100) : 0, format: "percent", tone: "warn" },
      ],
      charts: [
        { kind: "bar", id: "aging", title: "Idade dos valores em aberto", format: "currency", items: buckets.map(([name, test]) => ({ label: name, value: round2(sum(open.filter((item) => test(age(item))), (item) => item.amount)), drill: name === "A vencer" ? fd("status", "a_vencer") : fd("status", "vencido") })) },
        { kind: "line", id: "due", title: "Vencimentos no período", format: "currency", points: series(list, filters, (item) => item.dueDate, (item) => item.amount) },
        { kind: "donut", id: "state", title: "Situação das parcelas", format: "currency", items: (Object.keys(label) as (keyof typeof label)[]).map((key) => ({ label: label[key], value: round2(sum(list.filter((item) => state(item) === key), (item) => item.amount)), drill: fd("status", key) })) },
      ],
      table: {
        title: "Parcelas",
        columns: [{ key: "cliente", label: "Cliente" }, { key: "pedido", label: "Pedido" }, { key: "parcela", label: "Parcela" }, { key: "vencimento", label: "Vencimento", format: "date" }, { key: "valor", label: "Valor", format: "currency" }, { key: "situacao", label: "Situação" }, { key: "dias", label: "Atraso", format: "days" }],
        rows: [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((item) => ({ cliente: item.customer, pedido: `#${item.quoteNumber}`, parcela: `${item.number}/${item.of}`, vencimento: item.dueDate, valor: item.amount, situacao: label[state(item)], dias: state(item) === "vencido" ? age(item) : 0, _drill: toQuote(item.quoteId) })),
        total: { cliente: `${list.length} parcelas`, valor: round2(sum(list, (item) => item.amount)) },
      },
    };
  },
};

const payable: ReportDef = {
  id: "pagar",
  area: "financeiro",
  title: "Contas a pagar",
  description: "Despesas por categoria e fornecedor, vencidas e a vencer.",
  filters: ["status"],
  run(tables, filters, today) {
    const todayKey = isoDate(today);
    const state = (item: (typeof tables.payables)[number]) => item.paidAt ? "pago" : item.dueDate < todayKey ? "vencido" : "a_vencer";
    const list = tables.payables.filter((item) => inPeriod(item.dueDate, filters)).filter((item) => !filters.status || state(item) === filters.status);
    const open = list.filter((item) => !item.paidAt);
    const label = { pago: "Pago", vencido: "Vencido", a_vencer: "A vencer" } as const;
    return {
      kpis: [
        { id: "total", label: "Total no período", value: round2(sum(list, (item) => item.amount)), format: "currency" },
        { id: "open", label: "Em aberto", value: round2(sum(open, (item) => item.amount)), format: "currency", tone: "warn" },
        { id: "late", label: "Vencido", value: round2(sum(open.filter((item) => item.dueDate < todayKey), (item) => item.amount)), format: "currency", tone: "bad" },
        { id: "suppliers", label: "Fornecedores", value: new Set(list.map((item) => item.supplier)).size, format: "number" },
      ],
      charts: [
        { kind: "donut", id: "category", title: "Despesas por categoria", format: "currency", items: topWithOthers([...groupBy(list, (item) => item.category)].map(([labelText, items]) => ({ label: labelText, value: round2(sum(items, (item) => item.amount)) })), 6) },
        { kind: "bar", id: "supplier", title: "Maiores fornecedores", format: "currency", horizontal: true, items: [...groupBy(list, (item) => item.supplier)].map(([labelText, items]) => ({ label: labelText, value: round2(sum(items, (item) => item.amount)) })).sort((a, b) => b.value - a.value).slice(0, 10) },
        { kind: "line", id: "due", title: "Vencimentos no tempo", format: "currency", points: series(list, filters, (item) => item.dueDate, (item) => item.amount) },
      ],
      table: {
        title: "Contas",
        columns: [{ key: "vencimento", label: "Vencimento", format: "date" }, { key: "fornecedor", label: "Fornecedor" }, { key: "categoria", label: "Categoria" }, { key: "descricao", label: "Descrição" }, { key: "valor", label: "Valor", format: "currency" }, { key: "situacao", label: "Situação" }],
        rows: [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((item) => ({ vencimento: item.dueDate, fornecedor: item.supplier, categoria: item.category, descricao: item.description, valor: item.amount, situacao: label[state(item)] })),
        total: { vencimento: `${list.length} contas`, valor: round2(sum(list, (item) => item.amount)) },
      },
    };
  },
};

const cashflowReport: ReportDef = {
  id: "fluxo",
  area: "financeiro",
  title: "Fluxo de caixa",
  description: "Entradas (parcelas) e saídas (contas) por período e o saldo acumulado.",
  filters: [],
  run(tables, filters, today) {
    const ins = receivables(tables, today).filter((item) => inPeriod(item.dueDate, filters));
    const outs = tables.payables.filter((item) => inPeriod(item.dueDate, filters));
    const inSeries = series(ins, filters, (item) => item.dueDate, (item) => item.amount);
    const outSeries = series(outs, filters, (item) => item.dueDate, (item) => item.amount);
    let balance = 0;
    const rows: Row[] = inSeries.map((point, index) => {
      balance += point.value - outSeries[index].value;
      return { periodo: point.label, entradas: point.value, saidas: outSeries[index].value, resultado: round2(point.value - outSeries[index].value), acumulado: round2(balance), _drill: point.drill };
    });
    const totalIn = sum(ins, (item) => item.amount);
    const totalOut = sum(outs, (item) => item.amount);
    return {
      kpis: [
        { id: "in", label: "Entradas previstas", value: round2(totalIn), format: "currency", tone: "good" },
        { id: "out", label: "Saídas previstas", value: round2(totalOut), format: "currency", tone: "warn" },
        { id: "net", label: "Resultado do período", value: round2(totalIn - totalOut), format: "currency", tone: totalIn - totalOut >= 0 ? "good" : "bad" },
        { id: "banks", label: "Saldo em bancos hoje", value: round2(sum(tables.erp.banks, (bank) => bank.balance)), format: "currency" },
      ],
      charts: [
        { kind: "line", id: "balance", title: "Saldo acumulado do período", format: "currency", points: rows.map((row) => ({ label: String(row.periodo), value: Number(row.acumulado), drill: row._drill ?? null })) },
        { kind: "bar", id: "in", title: "Entradas por período", format: "currency", items: inSeries },
        { kind: "bar", id: "out", title: "Saídas por período", format: "currency", items: outSeries },
      ],
      table: {
        title: "Fluxo por período",
        columns: [{ key: "periodo", label: "Período" }, { key: "entradas", label: "Entradas", format: "currency" }, { key: "saidas", label: "Saídas", format: "currency" }, { key: "resultado", label: "Resultado", format: "currency" }, { key: "acumulado", label: "Acumulado", format: "currency" }],
        rows,
        total: { periodo: "Total", entradas: round2(totalIn), saidas: round2(totalOut), resultado: round2(totalIn - totalOut) },
      },
    };
  },
};

const anticipations: ReportDef = {
  id: "antecipacoes",
  area: "financeiro",
  title: "Antecipações (desconto de duplicatas)",
  description: "Quanto foi antecipado em cada banco e quanto custou: juros, IOF e tarifas, título a título.",
  filters: [],
  run(tables, filters) {
    const list = tables.erp.anticipations.filter((item) => inPeriod(item.date, filters));
    const cost = (item: (typeof list)[number]) => item.interest + item.iof + item.fees;
    const bankName = (id: string) => tables.erp.banks.find((bank) => bank.id === id)?.name ?? id;
    const gross = sum(list, (item) => item.gross);
    return {
      kpis: [
        { id: "gross", label: "Valor antecipado", value: round2(gross), format: "currency" },
        { id: "cost", label: "Custo total", value: round2(sum(list, cost)), format: "currency", tone: "warn" },
        { id: "rate", label: "Custo efetivo", value: gross ? round2(sum(list, cost) / gross * 100) : 0, format: "percent" },
        { id: "titles", label: "Títulos descontados", value: sum(list, (item) => item.titles.length), format: "number" },
      ],
      charts: [
        { kind: "bar", id: "bank", title: "Custo por banco", format: "currency", items: [...groupBy(list, (item) => item.bank)].map(([bank, items]) => ({ label: bankName(bank), value: round2(sum(items, cost)) })) },
        { kind: "donut", id: "parts", title: "Composição do custo", format: "currency", items: [{ label: "Juros", value: round2(sum(list, (item) => item.interest)) }, { label: "IOF", value: round2(sum(list, (item) => item.iof)) }, { label: "Tarifas", value: round2(sum(list, (item) => item.fees)) }] },
        { kind: "line", id: "time", title: "Antecipado no tempo", format: "currency", points: series(list, filters, (item) => item.date.slice(0, 10), (item) => item.gross) },
      ],
      table: {
        title: "Borderôs",
        columns: [{ key: "data", label: "Data", format: "date" }, { key: "banco", label: "Banco" }, { key: "titulos", label: "Títulos", format: "number" }, { key: "bruto", label: "Bruto", format: "currency" }, { key: "juros", label: "Juros", format: "currency" }, { key: "iof", label: "IOF", format: "currency" }, { key: "tarifas", label: "Tarifas", format: "currency" }, { key: "liquido", label: "Líquido", format: "currency" }],
        rows: list.map((item) => ({ data: item.date.slice(0, 10), banco: bankName(item.bank), titulos: item.titles.length, bruto: item.gross, juros: item.interest, iof: item.iof, tarifas: item.fees, liquido: item.net })),
        total: { data: `${list.length} borderôs`, bruto: round2(gross), liquido: round2(sum(list, (item) => item.net)) },
      },
    };
  },
};

/* ================= Logística e frota ================= */

const loadsReport: ReportDef = {
  id: "cargas",
  area: "logistica",
  title: "Cargas e ocupação dos caminhões",
  description: "Cargas montadas, toneladas transportadas, ocupação de cada caminhão e entregas.",
  filters: ["vehicle", "status"],
  run(tables, filters) {
    const STATUS = { planned: "Planejada", loaded: "Carregada", shipped: "Expedida", cancelled: "Cancelada" } as Record<string, string>;
    const list = tables.loads.filter((load) => inPeriod(load.planned_date ?? load.created_at, filters) && (!filters.vehicle || load.vehicle_name_snapshot === filters.vehicle) && (!filters.status || load.status === filters.status));
    const valid = list.filter((load) => load.status !== "cancelled");
    const stops = (loadId: string) => new Set(tables.load_items.filter((item) => item.load_id === loadId).map((item) => item.stop_order)).size;
    const occupancy = (load: (typeof list)[number]) => load.capacity_kg_snapshot ? load.total_weight_kg / load.capacity_kg_snapshot * 100 : 0;
    return {
      kpis: [
        { id: "loads", label: "Cargas", value: valid.length, format: "number" },
        { id: "tons", label: "Toneladas", value: round2(sum(valid, (load) => load.total_weight_kg) / 1000), format: "tons" },
        { id: "occ", label: "Ocupação média", value: valid.length ? round2(sum(valid, occupancy) / valid.length) : 0, format: "percent", tone: "good" },
        { id: "stops", label: "Entregas", value: sum(valid, (load) => stops(load.id)), format: "number" },
        { id: "pallets", label: "Paletes", value: sum(valid, (load) => load.pallet_count), format: "number" },
      ],
      charts: [
        { kind: "bar", id: "vehicle", title: "Toneladas por caminhão", format: "tons", items: [...groupBy(valid, (load) => load.vehicle_name_snapshot)].map(([name, items]) => ({ label: name, value: round2(sum(items, (load) => load.total_weight_kg) / 1000), drill: fd("vehicle", name) })) },
        { kind: "bar", id: "occupancy", title: "Ocupação média por caminhão (%)", format: "percent", items: [...groupBy(valid, (load) => load.vehicle_name_snapshot)].map(([name, items]) => ({ label: name, value: round2(sum(items, occupancy) / items.length), drill: fd("vehicle", name) })) },
        { kind: "donut", id: "status", title: "Situação das cargas", format: "number", items: [...groupBy(list, (load) => load.status)].map(([status, items]) => ({ label: STATUS[status] ?? status, value: items.length, drill: fd("status", status) })) },
      ],
      table: {
        title: "Cargas",
        columns: [{ key: "carga", label: "Carga" }, { key: "data", label: "Saída", format: "date" }, { key: "veiculo", label: "Veículo" }, { key: "situacao", label: "Situação" }, { key: "entregas", label: "Entregas", format: "number" }, { key: "peso", label: "Peso", format: "tons" }, { key: "ocupacao", label: "Ocupação", format: "percent" }, { key: "paletes", label: "Paletes", format: "number" }],
        rows: [...list].sort((a, b) => b.load_number - a.load_number).map((load) => ({ carga: `#${load.load_number}`, data: (load.planned_date ?? localDay(load.created_at)).slice(0, 10), veiculo: load.vehicle_name_snapshot, situacao: STATUS[load.status] ?? load.status, entregas: stops(load.id), peso: round2(load.total_weight_kg / 1000), ocupacao: round2(occupancy(load)), paletes: load.pallet_count, _drill: toLoad(load.id) })),
      },
    };
  },
};

const fleetReport: ReportDef = {
  id: "frota",
  area: "logistica",
  title: "Frota: frete cobrado × custo",
  description: "Quanto cada caminhão fatura de frete e quanto custa (combustível, pedágio e consertos), com as ocorrências.",
  filters: ["vehicle", "city"],
  run(tables, filters) {
    const trips = tables.erp.trips.filter((trip) => inPeriod(trip.date, filters) && (!filters.vehicle || trip.vehicle === filters.vehicle) && (!filters.city || trip.city === filters.city));
    const repairs = tables.erp.fleetRequests.filter((request) => inPeriod(request.date, filters) && (request.status === "aprovado" || request.status === "concluido") && (!filters.vehicle || request.vehicle === filters.vehicle));
    const repairCost = (vehicle: string) => sum(repairs.filter((request) => request.vehicle === vehicle), (request) => request.chosen !== null ? request.quotes[request.chosen]?.value ?? 0 : 0);
    const vehicles = [...new Set([...trips.map((trip) => trip.vehicle), ...repairs.map((request) => request.vehicle)])];
    const rows: Row[] = vehicles.map((vehicle) => {
      const mine = trips.filter((trip) => trip.vehicle === vehicle);
      const charged = sum(mine, (trip) => trip.freightCharged);
      const cost = sum(mine, (trip) => trip.fuel + trip.tolls) + repairCost(vehicle);
      return { veiculo: vehicle, viagens: mine.length, km: sum(mine, (trip) => trip.km), toneladas: round2(sum(mine, (trip) => trip.tons)), frete: round2(charged), custo: round2(cost), resultado: round2(charged - cost), margem: charged ? round2((charged - cost) / charged * 100) : 0, ocorrencias: mine.filter((trip) => trip.incident).length, _drill: fd("vehicle", vehicle) };
    });
    const charged = sum(trips, (trip) => trip.freightCharged);
    const cost = sum(trips, (trip) => trip.fuel + trip.tolls) + sum(vehicles, repairCost);
    return {
      kpis: [
        { id: "charged", label: "Frete cobrado", value: round2(charged), format: "currency" },
        { id: "cost", label: "Custo da frota", value: round2(cost), format: "currency", tone: "warn" },
        { id: "result", label: "Resultado", value: round2(charged - cost), format: "currency", tone: charged - cost >= 0 ? "good" : "bad" },
        { id: "km", label: "Km rodados", value: sum(trips, (trip) => trip.km), format: "number" },
        { id: "incidents", label: "Ocorrências", value: trips.filter((trip) => trip.incident).length, format: "number", tone: "bad", detail: { title: "Ocorrências", columns: [{ key: "data", label: "Data", format: "date" }, { key: "veiculo", label: "Veículo" }, { key: "cliente", label: "Cliente" }, { key: "ocorrencia", label: "Ocorrência" }], rows: trips.filter((trip) => trip.incident).map((trip) => ({ data: trip.date.slice(0, 10), veiculo: trip.vehicle, cliente: trip.customer, ocorrencia: trip.incident })) } },
      ],
      charts: [
        { kind: "bar", id: "result", title: "Resultado por caminhão (frete − custo)", format: "currency", items: rows.map((row) => ({ label: String(row.veiculo), value: Number(row.resultado), drill: row._drill ?? null })) },
        { kind: "bar", id: "charged", title: "Frete cobrado por caminhão", format: "currency", items: rows.map((row) => ({ label: String(row.veiculo), value: Number(row.frete), drill: row._drill ?? null })) },
        { kind: "donut", id: "incident", title: "Ocorrências por cliente", format: "number", items: topWithOthers([...groupBy(trips.filter((trip) => trip.incident), (trip) => trip.customer)].map(([label, items]) => ({ label, value: items.length })), 6) },
      ],
      table: {
        title: "Caminhões",
        columns: [{ key: "veiculo", label: "Veículo" }, { key: "viagens", label: "Viagens", format: "number" }, { key: "km", label: "Km", format: "number" }, { key: "toneladas", label: "Toneladas", format: "tons" }, { key: "frete", label: "Frete cobrado", format: "currency" }, { key: "custo", label: "Custo", format: "currency" }, { key: "resultado", label: "Resultado", format: "currency" }, { key: "margem", label: "Margem", format: "percent" }, { key: "ocorrencias", label: "Ocorrências", format: "number" }],
        rows,
        total: { veiculo: "Frota", frete: round2(charged), custo: round2(cost), resultado: round2(charged - cost) },
      },
    };
  },
};

/* ================= Produção e estoque ================= */

const productionReport: ReportDef = {
  id: "producao",
  area: "producao",
  title: "Produção",
  description: "Ordens de produção: sacas e toneladas produzidas por produto e por dia.",
  filters: ["product", "status"],
  run(tables, filters) {
    const STATUS = { planejada: "Planejada", em_producao: "Em produção", concluida: "Concluída" } as Record<string, string>;
    const list = tables.erp.orders.filter((order) => inPeriod(order.date, filters) && (!filters.product || order.product === filters.product) && (!filters.status || order.status === filters.status));
    const done = list.filter((order) => order.status === "concluida");
    const tons = (order: (typeof list)[number]) => order.bags * order.bagKg / 1000;
    return {
      kpis: [
        { id: "tons", label: "Toneladas produzidas", value: round2(sum(done, tons)), format: "tons", tone: "good" },
        { id: "bags", label: "Sacas produzidas", value: sum(done, (order) => order.bags), format: "number" },
        { id: "orders", label: "Ordens", value: list.length, format: "number" },
        { id: "open", label: "Em produção agora", value: list.filter((order) => order.status === "em_producao").length, format: "number" },
      ],
      charts: [
        { kind: "line", id: "time", title: "Toneladas produzidas no tempo", format: "tons", points: series(done, filters, (order) => order.date.slice(0, 10), tons) },
        { kind: "bar", id: "product", title: "Toneladas por produto", format: "tons", horizontal: true, items: [...groupBy(done, (order) => order.product)].map(([label, items]) => ({ label, value: round2(sum(items, tons)), drill: fd("product", label) })).sort((a, b) => b.value - a.value).slice(0, 12) },
        { kind: "donut", id: "status", title: "Ordens por situação", format: "number", items: [...groupBy(list, (order) => order.status)].map(([status, items]) => ({ label: STATUS[status] ?? status, value: items.length, drill: fd("status", status) })) },
      ],
      table: {
        title: "Ordens de produção",
        columns: [{ key: "op", label: "OP" }, { key: "data", label: "Data", format: "date" }, { key: "produto", label: "Produto" }, { key: "sacas", label: "Sacas", format: "number" }, { key: "toneladas", label: "Toneladas", format: "tons" }, { key: "situacao", label: "Situação" }, { key: "operador", label: "Operador" }],
        rows: [...list].sort((a, b) => b.number - a.number).map((order) => ({ op: order.number, data: order.date.slice(0, 10), produto: order.product, sacas: order.bags, toneladas: round2(tons(order)), situacao: STATUS[order.status] ?? order.status, operador: order.operator })),
      },
    };
  },
};

const stockReport: ReportDef = {
  id: "estoque",
  area: "producao",
  title: "Estoque",
  description: "Matéria-prima (com mínimo e valor em estoque) e produto acabado disponível para separar.",
  filters: [],
  run(tables) {
    const materials = tables.erp.materials;
    const low = materials.filter((item) => item.stockKg < item.minKg);
    return {
      kpis: [
        { id: "value", label: "Valor em matéria-prima", value: round2(sum(materials, (item) => item.stockKg * item.pricePerKg)), format: "currency" },
        { id: "low", label: "Abaixo do mínimo", value: low.length, format: "number", tone: low.length ? "bad" : "good", detail: { title: "Abaixo do mínimo", columns: [{ key: "material", label: "Material" }, { key: "estoque", label: "Estoque (t)", format: "tons" }, { key: "minimo", label: "Mínimo (t)", format: "tons" }], rows: low.map((item) => ({ material: item.name, estoque: round2(item.stockKg / 1000), minimo: round2(item.minKg / 1000) })) } },
        { id: "finished", label: "Sacas de produto acabado", value: sum(tables.erp.finished, (item) => item.bags), format: "number" },
        { id: "available", label: "Disponível para separar", value: sum(tables.erp.finished, (item) => Math.max(0, item.bags - item.reserved)), format: "number", tone: "good" },
      ],
      charts: [
        { kind: "bar", id: "stock", title: "Matéria-prima em estoque (t)", format: "tons", horizontal: true, items: [...materials].sort((a, b) => b.stockKg - a.stockKg).map((item) => ({ label: item.name, value: round2(item.stockKg / 1000) })) },
        { kind: "bar", id: "cover", title: "Estoque sobre o mínimo (%)", format: "percent", horizontal: true, items: [...materials].map((item) => ({ label: item.name, value: item.minKg ? round2(item.stockKg / item.minKg * 100) : 0 })).sort((a, b) => a.value - b.value) },
        { kind: "bar", id: "finished", title: "Produto acabado disponível (sacas)", format: "number", horizontal: true, items: tables.erp.finished.map((item) => ({ label: item.product, value: Math.max(0, item.bags - item.reserved) })).sort((a, b) => b.value - a.value).slice(0, 12) },
      ],
      table: {
        title: "Matéria-prima",
        columns: [{ key: "material", label: "Material" }, { key: "local", label: "Local" }, { key: "estoque", label: "Estoque (t)", format: "tons" }, { key: "minimo", label: "Mínimo (t)", format: "tons" }, { key: "preco", label: "R$/kg", format: "currency" }, { key: "valor", label: "Valor em estoque", format: "currency" }, { key: "situacao", label: "Situação" }],
        rows: materials.map((item) => ({ material: item.name, local: item.location, estoque: round2(item.stockKg / 1000), minimo: round2(item.minKg / 1000), preco: item.pricePerKg, valor: round2(item.stockKg * item.pricePerKg), situacao: item.stockKg < item.minKg ? "Abaixo do mínimo" : "OK" })),
        total: { material: `${materials.length} materiais`, valor: round2(sum(materials, (item) => item.stockKg * item.pricePerKg)) },
      },
    };
  },
};

const formulasReport: ReportDef = {
  id: "formulas",
  area: "producao",
  title: "Custo das fórmulas e margem",
  description: "Custo de matéria-prima por tonelada e por saca de cada fórmula, comparado ao preço de venda.",
  filters: [],
  run(tables) {
    const price = (name: string) => tables.erp.materials.find((item) => item.name === name)?.pricePerKg ?? 0;
    const rows: Row[] = tables.erp.formulas.map((formula) => {
      const product = tables.catalog.products.find((item) => item.name === formula.product);
      const perTon = sum(formula.ingredients, (item) => (item.pct / 100) * 1000 * price(item.material));
      const perBag = product ? perTon / 1000 * product.weightKg : 0;
      const sale = product?.prices[0] ?? 0;
      return { produto: formula.product, versao: formula.version, custoT: round2(perTon), custoSaca: round2(perBag), preco: sale, margem: sale ? round2((sale - perBag) / sale * 100) : 0, _drill: fd("product", formula.product) };
    });
    const avg = rows.length ? sum(rows, (row) => Number(row.margem)) / rows.length : 0;
    return {
      kpis: [
        { id: "formulas", label: "Fórmulas no sistema", value: rows.length, format: "number" },
        { id: "margin", label: "Margem média", value: round2(avg), format: "percent" },
        { id: "low", label: "Margem abaixo de 25%", value: rows.filter((row) => Number(row.margem) < 25).length, format: "number", tone: "warn" },
      ],
      charts: [
        { kind: "bar", id: "margin", title: "Margem sobre o preço à vista (%)", format: "percent", horizontal: true, items: [...rows].sort((a, b) => Number(a.margem) - Number(b.margem)).map((row) => ({ label: String(row.produto), value: Number(row.margem) })) },
        { kind: "bar", id: "cost", title: "Custo de matéria-prima por tonelada", format: "currency", horizontal: true, items: [...rows].sort((a, b) => Number(b.custoT) - Number(a.custoT)).map((row) => ({ label: String(row.produto), value: Number(row.custoT) })) },
      ],
      table: {
        title: "Fórmulas",
        columns: [{ key: "produto", label: "Produto" }, { key: "versao", label: "Versão" }, { key: "custoT", label: "Custo por t", format: "currency" }, { key: "custoSaca", label: "Custo por saca", format: "currency" }, { key: "preco", label: "Preço à vista", format: "currency" }, { key: "margem", label: "Margem", format: "percent" }],
        rows,
      },
    };
  },
};

/* ================= Qualidade e checklist ================= */

const STATUS_LABEL = { conforme: "Conforme", pendente: "Pendente", nao_conforme: "Não conforme" } as const;

const complianceReport: ReportDef = {
  id: "conformidade",
  area: "qualidade",
  title: "Conformidade do checklist",
  description: "Registros por aba (manutenção, EPIs, matéria-prima, qualidade…), não conformidades e custos.",
  filters: ["status"],
  run(tables, filters, today) {
    const tabName = Object.fromEntries(CHECKLIST_TABS.map((tab) => [tab.id, tab.short ?? tab.label]));
    const records = tables.checklist.records.filter((record) => tabName[record.tab] && inPeriod(record.date, filters) && (!filters.status || record.status === filters.status));
    const conforming = records.filter((record) => record.status === "conforme").length;
    const bad = records.filter((record) => record.status === "nao_conforme");
    const days = Math.max(1, daysBetween(filters.from, filters.to) + 1);
    return {
      kpis: [
        { id: "records", label: "Registros", value: records.length, format: "number" },
        { id: "pct", label: "Conformidade", value: records.length ? round2(conforming / records.length * 100) : 0, format: "percent", tone: "good" },
        { id: "bad", label: "Não conformidades", value: bad.length, format: "number", tone: "bad", detail: { title: "Não conformidades", columns: [{ key: "data", label: "Data", format: "date" }, { key: "aba", label: "Aba" }, { key: "item", label: "Item" }, { key: "responsavel", label: "Responsável" }], rows: bad.map((record) => ({ data: record.date.slice(0, 10), aba: tabName[record.tab], item: record.targetLabel ?? "—", responsavel: record.responsible })) } },
        { id: "pending", label: "Pendentes", value: records.filter((record) => record.status === "pendente").length, format: "number", tone: "warn" },
      ],
      charts: [
        { kind: "bar", id: "tabs", title: "Conformidade por aba (%)", format: "percent", horizontal: true, items: CHECKLIST_TABS.map((tab) => ({ label: tab.short ?? tab.label, value: round2(tabSummary(tab.id, tables, today, Math.min(days, 365)).pct) })).sort((a, b) => a.value - b.value) },
        { kind: "donut", id: "status", title: "Registros por situação", format: "number", items: (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((key) => ({ label: STATUS_LABEL[key], value: records.filter((record) => record.status === key).length, drill: fd("status", key) })) },
        { kind: "line", id: "bad", title: "Não conformidades no tempo", format: "number", points: series(bad, filters, (record) => record.date.slice(0, 10), () => 1) },
      ],
      table: {
        title: "Registros",
        columns: [{ key: "data", label: "Data", format: "date" }, { key: "aba", label: "Aba" }, { key: "item", label: "Item" }, { key: "responsavel", label: "Responsável" }, { key: "situacao", label: "Situação" }],
        rows: [...records].sort((a, b) => b.date.localeCompare(a.date)).map((record) => ({ data: record.date.slice(0, 10), aba: tabName[record.tab], item: record.targetLabel ?? "—", responsavel: record.responsible, situacao: STATUS_LABEL[record.status] })),
      },
    };
  },
};

const maintenanceReport: ReportDef = {
  id: "manutencao",
  area: "qualidade",
  title: "Manutenção e custo por equipamento",
  description: "Quanto cada caminhão, carro, empilhadeira e máquina custou em manutenção.",
  filters: [],
  run(tables, filters) {
    const records = tables.checklist.records.filter((record) => record.tab === "maintenance" && inPeriod(record.date, filters));
    const cost = (record: (typeof records)[number]) => (Number(record.values.parts) || 0) + (Number(record.values.labor) || 0);
    const byTarget = [...groupBy(records, (record) => record.targetLabel ?? "Sem equipamento")].map(([label, items]) => ({ label, items, total: sum(items, cost) })).sort((a, b) => b.total - a.total);
    const allTime = costByTarget("maintenance", tables);
    return {
      kpis: [
        { id: "cost", label: "Custo no período", value: round2(sum(records, cost)), format: "currency", tone: "warn" },
        { id: "count", label: "Manutenções", value: records.length, format: "number" },
        { id: "corrective", label: "Corretivas", value: records.filter((record) => record.values.kind === "Corretiva").length, format: "number", tone: "bad" },
        { id: "top", label: "Equipamento mais caro", value: round2(byTarget[0]?.total ?? 0), format: "currency", text: byTarget[0]?.label ?? "—" },
      ],
      charts: [
        { kind: "bar", id: "target", title: "Custo por equipamento", format: "currency", horizontal: true, items: byTarget.slice(0, 12).map((item) => ({ label: item.label, value: round2(item.total) })) },
        { kind: "donut", id: "kind", title: "Tipo de manutenção", format: "number", items: [...groupBy(records, (record) => String(record.values.kind ?? "Outro"))].map(([label, items]) => ({ label, value: items.length })) },
        { kind: "line", id: "time", title: "Custo no tempo", format: "currency", points: series(records, filters, (record) => record.date.slice(0, 10), cost) },
      ],
      table: {
        title: "Equipamentos",
        columns: [{ key: "item", label: "Equipamento" }, { key: "manutencoes", label: "Manutenções", format: "number" }, { key: "custo", label: "Custo no período", format: "currency" }, { key: "historico", label: "Custo acumulado", format: "currency" }],
        rows: byTarget.map((item) => ({ item: item.label, manutencoes: item.items.length, custo: round2(item.total), historico: round2([...allTime].find(([key]) => item.items[0]?.targetId === key)?.[1] ?? item.total) })),
      },
    };
  },
};

/* ================= Fiscal ================= */

const fiscalReport: ReportDef = {
  id: "fiscal",
  area: "fiscal",
  title: "Notas fiscais e inscrições estaduais",
  description: "NF-e autorizadas, rejeitadas e canceladas, valores faturados e clientes com IE irregular.",
  filters: ["customer", "status"],
  run(tables, filters) {
    const STATUS = { autorizada: "Autorizada", rejeitada: "Rejeitada", cancelada: "Cancelada" } as Record<string, string>;
    const list = tables.erp.invoices.filter((invoice) => inPeriod(invoice.date, filters) && (!filters.customer || invoice.customerId === filters.customer) && (!filters.status || invoice.status === filters.status));
    const authorized = list.filter((invoice) => invoice.status === "autorizada");
    const irregular = tables.erp.ie.filter((item) => item.status !== "ativa");
    return {
      kpis: [
        { id: "count", label: "NF-e autorizadas", value: authorized.length, format: "number", tone: "good" },
        { id: "value", label: "Valor faturado", value: round2(sum(authorized, (invoice) => invoice.value)), format: "currency" },
        { id: "rejected", label: "Rejeitadas", value: list.filter((invoice) => invoice.status === "rejeitada").length, format: "number", tone: "bad" },
        { id: "mdfe", label: "MDF-e emitidos", value: tables.erp.mdfe.filter((item) => inPeriod(item.date, filters)).length, format: "number" },
        { id: "ie", label: "Clientes com IE irregular", value: irregular.length, format: "number", tone: "warn", detail: { title: "IE irregular (SINTEGRA)", columns: [{ key: "cliente", label: "Cliente" }, { key: "ie", label: "IE" }, { key: "situacao", label: "Situação" }], rows: irregular.map((item) => ({ cliente: tables.customers.find((customer) => customer.id === item.customerId)?.legal_name ?? "—", ie: item.ie, situacao: item.status })) } },
      ],
      charts: [
        { kind: "line", id: "time", title: "Valor faturado no tempo", format: "currency", points: series(authorized, filters, (invoice) => invoice.date.slice(0, 10), (invoice) => invoice.value) },
        { kind: "donut", id: "status", title: "Notas por situação", format: "number", items: [...groupBy(list, (invoice) => invoice.status)].map(([status, items]) => ({ label: STATUS[status] ?? status, value: items.length, drill: fd("status", status) })) },
        { kind: "bar", id: "customers", title: "Maiores clientes faturados", format: "currency", horizontal: true, items: [...groupBy(authorized, (invoice) => invoice.customer)].map(([label, items]) => ({ label, value: round2(sum(items, (invoice) => invoice.value)) })).sort((a, b) => b.value - a.value).slice(0, 10) },
      ],
      table: {
        title: "Notas fiscais",
        columns: [{ key: "numero", label: "NF-e" }, { key: "data", label: "Emissão", format: "date" }, { key: "cliente", label: "Cliente" }, { key: "pedido", label: "Pedido" }, { key: "valor", label: "Valor", format: "currency" }, { key: "situacao", label: "Situação" }],
        rows: [...list].sort((a, b) => b.number - a.number).map((invoice) => ({ numero: invoice.number, data: invoice.date.slice(0, 10), cliente: invoice.customer, pedido: `#${tables.quotes.find((quote) => quote.id === invoice.quoteId)?.quote_number ?? "—"}`, valor: invoice.value, situacao: STATUS[invoice.status] ?? invoice.status, _drill: toQuote(invoice.quoteId) })),
        total: { numero: `${list.length} notas`, valor: round2(sum(list, (invoice) => invoice.value)) },
      },
    };
  },
};

export const OPERATION_REPORTS: ReportDef[] = [receivable, payable, cashflowReport, anticipations, loadsReport, fleetReport, productionReport, stockReport, formulasReport, complianceReport, maintenanceReport, fiscalReport];
