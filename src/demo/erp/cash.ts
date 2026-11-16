import type { DemoTables } from "../store/types";
import { db } from "../store/db";
import { addDays, isoDate, isoDateTime, newId, today } from "../store/ids";
import { getDemoViewer, viewerName } from "../app/session";
import type { BankId } from "./types";

export const CASH_METHODS = ["Dinheiro", "Pix", "Cartão débito", "Cartão crédito", "Cheque", "Transferência", "Boleto", "Depósito"] as const;
export const CASH_KINDS = ["Recebimento à vista", "Recebimento a prazo", "Pagamento à vista", "Pagamento a prazo", "Entrada avulsa", "Saída avulsa", "Transferência", "Tarifa"] as const;
export type CashMethod = typeof CASH_METHODS[number];
export type CashKind = typeof CASH_KINDS[number];
export type CashAccount = "daily" | "safe" | "cards" | "cheques" | BankId;
type DeskAccount = "daily" | "safe";
export const CASH_ACCOUNTS: Record<CashAccount, string> = { daily: "Caixa Diário", safe: "Cofre", cards: "Cartões a compensar", cheques: "Cheques recebidos", sicoob: "Sicoob", itau: "Itaú" };
export type CashLine = {
  id: string; account: CashAccount; date: string; document: string; description: string;
  amount: number; kind: CashKind; method?: CashMethod; clearedOn: string | null;
  origin: "Balcão" | "Manual" | "Baixa" | "Conciliação" | "Transferência" | "Exemplo";
  sessionId?: string; pendingId?: string; bankLineId?: string;
};
export type CashPending = {
  id: string; method: "Cartão débito" | "Cartão crédito" | "Cheque"; date: string; due: string;
  reference: string; document: string; installment: number; installments: number; brand: string;
  gross: number; fee: number; clearedOn?: string; bank?: BankId; sessionId?: string;
};
export type CashSession = { id: string; number: number; account: DeskAccount; operator: string; operatorId: string; openedAt: string; opening: number; closedAt?: string; closedBy?: string; counted?: number };
export type CashState = { start: Record<DeskAccount, number>; lines: CashLine[]; pending: CashPending[]; sessions: CashSession[] };
export const cashRound = (value: number) => Math.round(value * 100) / 100;
const amountOk = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1e9 && Math.abs(value - cashRound(value)) < 1e-8;
export const cashDateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const cashToday = () => isoDate(today());
const isBank = (account: string): account is BankId => account === "sicoob" || account === "itau";

export function seedCash(now = today()): CashState {
  const date = isoDate(addDays(now, -1));
  const session: CashSession = { id: "example-session", number: 1, account: "daily", operator: "Balcão Demo", operatorId: "example", openedAt: date + "T08:00:00", opening: 400, closedAt: date + "T17:00:00", closedBy: "Balcão Demo", counted: 570 };
  const pending: CashPending[] = [
    { id: "card-debit", method: "Cartão débito", date, due: isoDate(now), reference: "DEMO-8102", document: "VEN-002", installment: 1, installments: 1, brand: "Visa", gross: 350, fee: 7, sessionId: session.id },
    ...[1, 2].map((installment): CashPending => ({ id: "card-credit-" + installment, method: "Cartão crédito", date, due: isoDate(addDays(now, 30 * installment)), reference: "DEMO-9183", document: "VEN-003", installment, installments: 2, brand: "Mastercard", gross: 250, fee: 10, sessionId: session.id })),
    { id: "cheque-demo", method: "Cheque", date, due: isoDate(addDays(now, 12)), reference: "CH-DEMO-014", document: "VEN-004", installment: 1, installments: 1, brand: "", gross: 640, fee: 0, sessionId: session.id },
  ];
  return { start: { daily: 400, safe: 1000 }, sessions: [session], pending, lines: [
    { id: "desk-in", account: "daily", date, document: "VEN-001", description: "Venda de balcão (exemplo)", amount: 240, kind: "Recebimento à vista", method: "Dinheiro", clearedOn: date, origin: "Exemplo", sessionId: session.id },
    { id: "desk-out", account: "daily", date, document: "SAI-001", description: "Despesa do balcão (exemplo)", amount: -70, kind: "Pagamento à vista", method: "Dinheiro", clearedOn: date, origin: "Exemplo", sessionId: session.id },
    ...pending.map(pendingLine),
  ] };
}

function pendingLine(item: CashPending): CashLine {
  return { id: "in-" + item.id, account: item.method === "Cheque" ? "cheques" : "cards", date: item.date, document: item.document,
    description: item.reference + (item.installments > 1 ? ` · ${item.installment}/${item.installments}` : ""), amount: cashRound(item.gross - item.fee),
    kind: "Recebimento à vista", method: item.method, clearedOn: null, origin: "Balcão", pendingId: item.id, sessionId: item.sessionId };
}

export function cashState(tables: DemoTables) {
  return tables.erp.cash ?? fallbackCash(tables);
}
const demoSamples = new WeakMap<DemoTables, CashState>();
function fallbackCash(tables: DemoTables) {
  const sample = demoSamples.get(tables) ?? seedCash();
  demoSamples.set(tables, sample);
  return sample;
}

export function cashLines(tables: DemoTables): CashLine[] {
  const state = cashState(tables);
  const details = new Map(state.lines.flatMap((line) => line.bankLineId ? [[line.bankLineId, line] as const] : []));
  return [...state.lines.filter((line) => !line.bankLineId), ...tables.erp.statement.map((line): CashLine => {
    const detail = details.get(line.id);
    const linked = line.matched ?? line.suggestion;
    const receipt = tables.erp.receipts?.find((item) => item.key === linked);
    const payable = tables.payables.find((item) => item.id === linked);
    const settlement = line.amount > 0 ? receipt?.settlement : payable?.settlement;
    const document = line.amount < 0 ? payable?.document ?? "" : receipt?.key ?? "";
    return { id: line.id, account: line.bank, date: line.date, document, description: line.description, amount: line.amount,
      kind: settlement ? (line.amount > 0 ? "Recebimento a prazo" : "Pagamento a prazo") : (line.amount > 0 ? "Entrada avulsa" : "Saída avulsa"),
      method: settlement?.method, origin: settlement ? "Baixa" : "Conciliação", ...detail, clearedOn: line.matched ? detail?.clearedOn ?? line.date : null };
  })];
}

export function ledgerSummary(lines: Pick<CashLine, "amount">[], opening = 0) {
  const entries = cashRound(lines.reduce((sum, line) => sum + Math.max(0, line.amount), 0));
  const exits = cashRound(lines.reduce((sum, line) => sum + Math.max(0, -line.amount), 0));
  return { opening, entries, exits, movement: cashRound(entries - exits), closing: cashRound(opening + entries - exits) };
}

export function calculationDate(line: CashLine, basis: "emission" | "clearing") { return basis === "clearing" ? line.clearedOn : line.date; }

export function accountOpening(tables: DemoTables, account: CashAccount) {
  if (account === "daily" || account === "safe") return cashState(tables).start[account];
  if (isBank(account)) {
    const bank = tables.erp.banks.find((item) => item.id === account);
    return cashRound((bank?.balance ?? 0) - tables.erp.statement.filter((line) => line.bank === account).reduce((sum, line) => sum + line.amount, 0));
  }
  return 0;
}

export function sessionTotals(lines: CashLine[], session: CashSession) {
  return ledgerSummary(lines.filter((line) => line.sessionId === session.id && line.account === session.account), session.opening);
}

function updateCash<T>(callback: (tables: DemoTables, state: CashState) => T): T {
  let result!: T;
  if (getDemoViewer().role === "consulta") throw new Error("O perfil Consulta só visualiza.");
  db.write((tables) => {
    const state = cashState(tables);
    result = callback(tables, state);
    tables.erp.cash = state;
  });
  return result;
}

export function prepareCounterSettlement(tables: DemoTables, account: DeskAccount, date: string) {
  const state = cashState(tables);
  const session = state.sessions.find((row) => row.account === account && !row.closedAt && row.operatorId === getDemoViewer().id);
  if (!session || date !== cashToday()) throw new Error("Para baixa em dinheiro, abra uma sessão nesta conta e use a data de hoje.");
  return { state, session };
}

export function commitCashLine(tables: DemoTables, state: CashState, data: Omit<CashLine, "id">) {
  const row: CashLine = { ...data, id: newId() };
  // Avulsos e transferências também movimentam o dinheiro da sessão aberta.
  if (!row.sessionId && (row.account === "daily" || row.account === "safe")) {
    const active = state.sessions.find((item) => item.account === row.account && !item.closedAt);
    if (active) {
      if (active.operatorId !== getDemoViewer().id || row.date !== cashToday()) throw new Error("Movimente esta conta pela sessão do operador, com a data de hoje.");
      row.sessionId = active.id;
    }
  }
  if (isBank(row.account)) {
    const bank = tables.erp.banks.find((item) => item.id === row.account);
    if (!bank) throw new Error("Conta bancária indisponível.");
    row.bankLineId = row.id;
    bank.balance = cashRound(bank.balance + row.amount);
    tables.erp.statement.unshift({ id: row.id, bank: bank.id, date: row.date, description: row.description, amount: row.amount, matched: row.clearedOn ? row.id : null, suggestion: null });
  }
  state.lines.push(row);
  tables.erp.cash = state;
  return row;
}

export function openCashSession(account: DeskAccount, opening: number) {
  return updateCash((_, state) => {
    if (!amountOk(opening) || (account !== "daily" && account !== "safe")) throw new Error("Informe uma conta de caixa e um saldo inicial válido.");
    const viewer = getDemoViewer();
    if (state.sessions.some((item) => !item.closedAt && (item.account === account || item.operatorId === viewer.id))) throw new Error("Já há uma sessão aberta para este operador ou esta conta.");
    const row: CashSession = { id: newId(), number: 1 + Math.max(0, ...state.sessions.map((item) => item.number)), account, opening,
      operator: viewerName(), operatorId: viewer.id, openedAt: isoDateTime(today()) };
    state.sessions.push(row);
    return row;
  });
}

function ownSession(state: CashState, id: string) {
  const row = state.sessions.find((item) => item.id === id && !item.closedAt && item.operatorId === getDemoViewer().id);
  if (!row) throw new Error("Abra uma sessão de caixa para este operador.");
  return row;
}

export function closeCashSession(id: string, counted: number) {
  return updateCash((_, state) => {
    if (!amountOk(counted)) throw new Error("Informe o total contado.");
    const row = ownSession(state, id);
    row.closedAt = isoDateTime(today()); row.closedBy = viewerName(); row.counted = counted;
    return row;
  });
}

export function reopenCashSession(id: string) {
  return updateCash((_, state) => {
    const row = state.sessions.find((item) => item.id === id && item.closedAt && item.operatorId === getDemoViewer().id);
    if (!row || state.sessions.some((item) => (item.account === row.account && item.number > row.number) || (item.operatorId === row.operatorId && !item.closedAt))) throw new Error("Só é possível reabrir a última sessão da conta, do próprio operador e sem outra sessão aberta.");
    delete row.closedAt; delete row.closedBy; delete row.counted;
    return row;
  });
}

export type CashEntry = { account: CashAccount; date: string; document: string; description: string; amount: number; kind: CashKind; method: CashMethod };
export function addCashEntry(input: CashEntry, sessionId?: string) {
  return updateCash((tables, state) => {
    if (!cashDateOk(input.date) || input.date > cashToday() || !input.description.trim() || !amountOk(input.amount) || input.amount <= 0 ||
      !CASH_METHODS.includes(input.method) || !CASH_KINDS.includes(input.kind) || input.kind === "Transferência") throw new Error("Confira a data, o histórico, o tipo e o valor.");
    const session = sessionId ? ownSession(state, sessionId) : null;
    const account = session && input.method === "Dinheiro" ? session.account : input.account;
    if (!Object.hasOwn(CASH_ACCOUNTS, account) || account === "cards" || account === "cheques") throw new Error("Selecione uma conta de caixa ou banco.");
    if (session && (input.date !== cashToday() || (input.method !== "Dinheiro" && !(input.method === "Pix" && isBank(account))))) throw new Error("Na registradora, use dinheiro ou informe a conta bancária do Pix, com a data de hoje.");
    if ((account === "daily" || account === "safe") && input.method !== "Dinheiro") throw new Error("Selecione uma conta bancária para essa forma de pagamento.");
    if (!session && (input.method.startsWith("Cartão") || input.method === "Cheque")) throw new Error("Registre cartões e cheques no balcão para acompanhar a compensação.");
    const amount = /^(Pagamento|Saída|Tarifa)/.test(input.kind) ? -input.amount : input.amount;
    return commitCashLine(tables, state, { ...input, account, amount, sessionId, description: input.description.trim(), origin: session ? "Balcão" : "Manual", clearedOn: input.date });
  });
}

export function transferCash(from: CashAccount, to: CashAccount, amount: number, date: string, description: string) {
  return updateCash((tables, state) => {
    const valid = (key: CashAccount) => key === "daily" || key === "safe" || tables.erp.banks.some((bank) => bank.id === key);
    if (!valid(from) || !valid(to) || from === to || !amountOk(amount) || amount <= 0 || !cashDateOk(date) || date > cashToday() || !description.trim()) throw new Error("Informe contas distintas, histórico, data e valor válidos.");
    for (const account of [from, to]) {
      const active = state.sessions.find((item) => item.account === account && !item.closedAt);
      if (active && (active.operatorId !== getDemoViewer().id || date !== cashToday())) throw new Error("Movimente esta conta pela sessão do operador, com a data de hoje.");
    }
    const doc = "TR-" + newId().slice(0, 8);
    const base = { date, description: description.trim(), document: doc, origin: "Transferência", kind: "Transferência", method: "Transferência", clearedOn: date } as const;
    commitCashLine(tables, state, { ...base, account: from, amount: -amount });
    commitCashLine(tables, state, { ...base, account: to, amount });
  });
}

export type PendingInput = Omit<CashPending, "id" | "clearedOn" | "bank" | "installment" | "installments" | "sessionId" | "date">;
export function addPendingCash(input: PendingInput, sessionId: string, installments: number) {
  return updateCash((_, state) => registerPendingCash(state, input, sessionId, installments));
}
export function registerPendingCash(state: CashState, input: PendingInput, sessionId: string, installments: number, kind: CashKind = "Recebimento à vista") {
    const session = ownSession(state, sessionId);
    const date = cashToday();
    const ref = input.reference.trim().toUpperCase();
    if (!["Cartão débito", "Cartão crédito", "Cheque"].includes(input.method) || !ref || !input.document.trim() || !amountOk(input.gross) || input.gross <= 0 || !amountOk(input.fee) || input.fee >= input.gross ||
      !cashDateOk(input.due) || input.due < date || !Number.isInteger(installments) || installments < 1 || installments > 12 ||
      (input.method !== "Cartão crédito" && installments !== 1) || (input.method === "Cheque" ? input.fee !== 0 : !input.brand.trim()) ||
      state.pending.some((item) => item.reference === ref && item.method === input.method)) throw new Error("Confira autorização/cheque, documento, vencimento, bandeira, valores e parcelas. A referência não pode estar duplicada.");
    const split = (total: number, index: number) => {
      const cents = Math.round(total * 100);
      return (Math.floor(cents / installments) + (index < cents % installments ? 1 : 0)) / 100;
    };
    const rows = Array.from({ length: installments }, (_, index): CashPending => {
      const dueDate = new Date(input.due + "T12:00:00");
      const day = dueDate.getDate();
      dueDate.setDate(1);
      dueDate.setMonth(dueDate.getMonth() + index);
      dueDate.setDate(Math.min(day, new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate()));
      return { ...input, reference: ref, id: newId(), date, due: isoDate(dueDate), installment: index + 1, installments,
        gross: split(input.gross, index), fee: split(input.fee, index), sessionId: session.id };
    });
    if (rows.some((row) => row.gross <= row.fee)) throw new Error("O líquido deve ser positivo em cada parcela.");
    state.pending.push(...rows); state.lines.push(...rows.map((row) => ({ ...pendingLine(row), kind })));
    return rows;
}

export function clearPendingCash(id: string, bank: BankId, received: number, date: string) {
  return updateCash((tables, state) => {
    const item = state.pending.find((row) => row.id === id);
    if (!item || item.clearedOn) throw new Error("Este lançamento já foi compensado ou não existe.");
    if (!tables.erp.banks.some((row) => row.id === bank) || !amountOk(received) || received <= 0 || received > item.gross ||
      (item.method === "Cheque" && received !== item.gross) || !cashDateOk(date) || date < item.date || date > cashToday()) throw new Error("Confira a conta, a data e o líquido recebido.");
    const source = state.lines.find((line) => line.id === "in-" + id);
    if (!source) throw new Error("Movimento de origem não encontrado.");
    const base = { date, document: item.document, description: `Compensação ${item.reference} · ${item.installment}/${item.installments}`, origin: "Transferência",
      kind: "Transferência", method: item.method, clearedOn: date, pendingId: id } as const;
    const previousFee = item.fee;
    const actualFee = cashRound(item.gross - received);
    const difference = cashRound(actualFee - previousFee);
    if (difference !== 0) commitCashLine(tables, state, { ...base, account: source.account, amount: -difference, kind: "Tarifa", description: "Ajuste de taxa · " + item.reference });
    commitCashLine(tables, state, { ...base, account: source.account, amount: -received });
    commitCashLine(tables, state, { ...base, account: bank, amount: received });
    source.clearedOn = date;
    item.clearedOn = date; item.bank = bank; item.fee = actualFee;
  });
}
