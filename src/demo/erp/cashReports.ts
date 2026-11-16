import type { DemoTables } from "../store/types";
import { accountOpening, calculationDate, CASH_ACCOUNTS, cashRound, ledgerSummary, sessionTotals, type CashAccount, type CashLine, type CashPending, type CashSession } from "./cash";

export type Report = { title: string; subtitle: string; tables: { label?: string; columns: string[]; rows: string[][]; total?: string[] }[] };
export const cashMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const cashDay = (value?: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "–";
export const cashTime = (value: string) => new Date(value).toLocaleString("pt-BR");
const period = (start: string, end: string) => `${cashDay(start)} a ${cashDay(end)}`;
const money = cashMoney;

export type LedgerFilter = {
  start: string; end: string; basis: "emission" | "clearing"; account: CashAccount | "all"; status: "all" | "yes" | "no";
  query: string; method: string; kind: string; origin: string; min: string; max: string;
};

function normalized(value: string) { return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim(); }
function ledgerScope(line: CashLine, filter: LedgerFilter) {
  return (filter.account === "all" || line.account === filter.account) &&
    (filter.status === "all" || (filter.status === "yes" ? !!line.clearedOn : !line.clearedOn));
}
export function filterLedger(lines: CashLine[], filter: LedgerFilter) {
  const query = normalized(filter.query);
  return lines.filter((line) => {
    const date = calculationDate(line, filter.basis);
    return ledgerScope(line, filter) && !!date && (!filter.start || date >= filter.start) && (!filter.end || date <= filter.end) &&
      (!query || normalized(line.document + " " + line.description).includes(query)) && (!filter.method || line.method === filter.method) &&
      (!filter.kind || line.kind === filter.kind) && (!filter.origin || line.origin === filter.origin) &&
      (filter.min === "" || Math.abs(line.amount) >= Number(filter.min)) && (filter.max === "" || Math.abs(line.amount) <= Number(filter.max));
  }).sort((a, b) => (calculationDate(a, filter.basis) ?? "").localeCompare(calculationDate(b, filter.basis) ?? "") || a.id.localeCompare(b.id));
}

export function position(tables: DemoTables, lines: CashLine[], filter: LedgerFilter, accounts: CashAccount[]) {
  return accounts.map((account) => {
    const scoped = lines.filter((line) => ledgerScope(line, { ...filter, account }));
    const prior = filter.start ? scoped.filter((line) => {
      const date = calculationDate(line, filter.basis);
      return date !== null && date < filter.start;
    }) : [];
    const opening = ledgerSummary(prior, filter.status === "no" ? 0 : accountOpening(tables, account)).closing;
    const selected = filterLedger(scoped, { ...filter, account, query: "", method: "", kind: "", origin: "", min: "", max: "" });
    return { account, ...ledgerSummary(selected, opening) };
  });
}

function groups<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) { const label = key(row); const group = result.get(label) ?? []; group.push(row); result.set(label, group); }
  return [...result.entries()].sort(([left], [right]) => left.localeCompare(right, "pt-BR"));
}

function movements(rows: CashLine[], basis: LedgerFilter["basis"]): Report["tables"][number] {
  const total = ledgerSummary(rows);
  return {
    columns: [basis === "emission" ? "Emissão" : "Compensação", "Documento", "Histórico", "Conta", "Forma", "Entrada", "Saída"],
    rows: rows.map((row) => [cashDay(calculationDate(row, basis)), row.document || "–", row.description, CASH_ACCOUNTS[row.account], row.method ?? "–", row.amount >= 0 ? money(row.amount) : "–", row.amount < 0 ? money(-row.amount) : "–"]),
    total: ["", "", "Subtotal", "", "", money(total.entries), money(total.exits)],
  };
}

function byMethod(rows: CashLine[]): Report["tables"][number] {
  return { label: "Totais por forma de pagamento", columns: ["Forma", "Entradas", "Saídas", "Movimento líquido"],
    rows: groups(rows, (row) => row.method ?? "Não informada").map(([label, list]) => { const sum = ledgerSummary(list); return [label, money(sum.entries), money(sum.exits), money(sum.movement)]; }) };
}

export function ledgerReport(tables: DemoTables, lines: CashLine[], filter: LedgerFilter, accounts: CashAccount[], mode: "daily" | "extract" | "position" | "summary", subgroup = true): Report {
  const rows = filterLedger(lines, filter);
  const current = position(tables, lines, filter, accounts);
  const total = ledgerSummary(rows);
  const titles = { daily: "Movimento Diário do Caixa", extract: "Extrato de Movimentação", position: "Saldo das Contas", summary: "Resumo do Caixa" };
  const filtered = !!(filter.query || filter.method || filter.kind || filter.origin || filter.min || filter.max);
  const positionTotal = current.reduce((sum, item) => ({ opening: sum.opening + item.opening, entries: sum.entries + item.entries, exits: sum.exits + item.exits, closing: sum.closing + item.closing }), { opening: 0, entries: 0, exits: 0, closing: 0 });
  const positionTable = { label: filtered ? "Posição das contas no período (sem filtros de detalhe)" : "Posição das contas",
    columns: ["Conta", "Saldo anterior", "Entradas", "Saídas", "Saldo final"],
    rows: current.map((row) => [CASH_ACCOUNTS[row.account], money(row.opening), money(row.entries), money(row.exits), money(row.closing)]),
    total: ["Total geral", money(positionTotal.opening), money(positionTotal.entries), money(positionTotal.exits), money(positionTotal.closing)],
  };
  return { title: titles[mode], subtitle: `${period(filter.start, filter.end)} · ${filter.account === "all" ? "Todas as contas" : CASH_ACCOUNTS[filter.account]} · Por ${filter.basis === "emission" ? "emissão" : "compensação"} · ${filter.status === "all" ? "Todas as situações" : filter.status === "yes" ? "Compensados" : "Não compensados"}`, tables: [
    ...(mode === "daily" ? groups(rows, (row) => subgroup ? `${row.kind} · ${row.method ?? "Não informada"}` : row.kind).map(([label, list]) => ({ ...movements(list, filter.basis), label }))
      : mode === "extract" ? [movements(rows, filter.basis)] : []),
    ...(mode !== "position" ? [byMethod(rows), { label: "Resumo dos lançamentos", columns: ["Entradas", "Saídas", "Movimento líquido"], rows: [[money(total.entries), money(total.exits), money(total.movement)]] }] : []),
    positionTable,
  ] };
}

export function sessionReport(lines: CashLine[], pending: CashPending[], session: CashSession, detailed: boolean): Report {
  const rows = lines.filter((line) => line.sessionId === session.id);
  const items = pending.filter((item) => item.sessionId === session.id);
  // No fechamento do balcão, as vendas por cartão/cheque constam pelo valor pago pelo cliente.
  const byPayment = rows.map((line) => ({ ...line, amount: items.find((item) => item.id === line.pendingId)?.gross ?? line.amount }));
  const summary = sessionTotals(lines, session);
  return {
    title: detailed ? "Fechamento de Caixa — Modelo 1" : "Resumo da Sessão de Caixa",
    subtitle: `Sessão nº ${session.number} · ${CASH_ACCOUNTS[session.account]} · ${session.operator} · Abertura ${cashTime(session.openedAt)} · ${session.closedAt ? "Fechada em " + cashTime(session.closedAt) + " por " + session.closedBy : "Em aberto"}`,
    tables: [...(detailed ? [movements(byPayment, "emission")] : []), byMethod(byPayment), {
      label: "Conferência do dinheiro em caixa", columns: ["Saldo inicial", "Entradas", "Saídas", "Esperado", "Contado", "Diferença"],
      rows: [[money(summary.opening), money(summary.entries), money(summary.exits), money(summary.closing), session.counted === undefined ? "–" : money(session.counted), session.counted === undefined ? "–" : money(cashRound(session.counted - summary.closing))]],
    }],
  };
}

export type PendingFilter = { query: string; start: string; end: string; basis: "date" | "due" | "clearedOn"; status: "all" | "yes" | "no"; method: string; grouping: "none" | "brand" | "due" | "method"; totalsOnly: boolean };
export function filterPending(rows: CashPending[], filter: PendingFilter, isCheque: boolean) {
  return rows.filter((row) => {
    const date = row[filter.basis];
    const query = normalized(filter.query);
    return (row.method === "Cheque") === isCheque && (!query || normalized(row.reference + " " + row.document).includes(query)) &&
      (filter.basis !== "clearedOn" || !!date) && (!filter.start || !!date && date >= filter.start) && (!filter.end || !!date && date <= filter.end) &&
      (filter.status === "all" || (filter.status === "yes" ? !!row.clearedOn : !row.clearedOn)) && (!filter.method || row.method === filter.method);
  }).sort((a, b) => a.due.localeCompare(b.due) || a.reference.localeCompare(b.reference));
}

export function pendingReport(rows: CashPending[], filter: PendingFilter, isCheque: boolean): Report {
  const sum = (list: CashPending[]) => { const gross = cashRound(list.reduce((t, item) => t + item.gross, 0)); const fee = cashRound(list.reduce((t, item) => t + item.fee, 0)); return [money(gross), money(fee), money(cashRound(gross - fee))]; };
  const grouped = filter.grouping === "none" ? [["", rows] as const] : groups(rows, (row) => filter.grouping === "due" ? cashDay(row.due) : filter.grouping === "brand" ? row.brand || "Sem bandeira" : row.method);
  return { title: isCheque ? "Listagem de Cheques Recebidos" : "Listagem de Cartões Emitidos",
    subtitle: `${period(filter.start, filter.end)} · Por ${({ date: "emissão", due: "vencimento", clearedOn: "compensação" })[filter.basis]} · ${filter.status === "no" ? "Não compensados" : filter.status === "yes" ? "Compensados" : "Todas as situações"}`,
    tables: [...(!filter.totalsOnly ? grouped.map(([label, list]) => ({
      label: label || undefined,
      columns: ["Emissão", "Vencimento", isCheque ? "Nº cheque" : "Autorização", "Documento", "Parc.", "Forma / bandeira", "Bruto", "Taxa", "Líquido", "Compensação"],
      rows: list.map((row) => [cashDay(row.date), cashDay(row.due), row.reference, row.document, `${row.installment}/${row.installments}`, [row.method, row.brand].filter(Boolean).join(" · "), money(row.gross), money(row.fee), money(cashRound(row.gross - row.fee)), row.clearedOn ? `${cashDay(row.clearedOn)} · ${row.bank ? CASH_ACCOUNTS[row.bank] : "–"}` : "Pendente"]),
      total: ["", "", "", "Subtotal", "", "", ...sum(list), ""],
    })) : grouped[0]?.[0] ? [{ label: "Subtotais", columns: ["Grupo", "Bruto", "Taxa", "Líquido"], rows: grouped.map(([label, list]) => [label, ...sum(list)]) }] : []),
    { label: `Total geral · ${rows.length} registro(s)`, columns: ["Bruto", "Taxa", "Líquido"], rows: [sum(rows)] }],
  };
}
