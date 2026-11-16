import { getDemoViewer, viewerName } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { isoDate, isoDateTime, newId, today } from "../store/ids";
import { receivables } from "../kpis/finance";
import { PAYABLE_CATEGORIES, type Payable, type PayableCategory } from "../store/types";
import { anticipatedKeys, discountTitle, titleKey } from "./finance";
import type { EvidenceRef } from "../checklist/types";
import { commitCashLine, prepareCounterSettlement, registerPendingCash } from "./cash";
import { PAYMENT_METHODS } from "./types";
import type { SettlementInput, Settlement, SupplierCredit, Anticipation, Approval, BankId, ExtraReceivable, FleetRequest, Invoice, Mdfe, ProductionOrder, Receipt } from "./types";

export class ErpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpError";
  }
}

function requireWriter() {
  if (getDemoViewer().role === "consulta") throw new ErpError("O perfil Consulta só visualiza.");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Desconta os títulos escolhidos no banco, com valor exato por boleto. */
export async function anticipate(keys: string[], bankId: BankId): Promise<Anticipation> {
  requireWriter();
  if (!keys.length) throw new ErpError("Escolha ao menos um título.");
  const wanted = new Set(keys);
  await simulateLatency(null);
  let result!: Anticipation;
  db.write((current) => {
    const bank = current.erp.banks.find((item) => item.id === bankId);
    if (!bank) throw new ErpError("Banco não encontrado.");
    const now = today();
    const date = isoDate(now);
    const already = anticipatedKeys(current);
    const titles = receivables(current, now).filter((item) => wanted.has(titleKey(item)) && !item.paidAt && item.dueDate > date && !already.has(titleKey(item)))
      .map((item) => discountTitle(item, bank, date));
    if (titles.length !== wanted.size) throw new ErpError("Há títulos que já foram baixados, antecipados ou deixaram de estar disponíveis.");
    const sum = (key: "amount" | "interest" | "iof" | "fee" | "net") => round(titles.reduce((total, title) => total + title[key], 0));
    result = { id: newId(), bank: bankId, date, titles, gross: sum("amount"), interest: sum("interest"), iof: sum("iof"), fees: sum("fee"), net: sum("net") };
    current.erp.anticipations.push(result);
    bank.balance = round(bank.balance + result.net);
    current.erp.statement.unshift({ id: newId(), bank: bankId, date, description: "CRED DESCONTO DUPLICATAS", amount: result.net, matched: result.id, suggestion: null });
  });
  return result;
}

export async function reconcile(lineId: string, ref: string | null): Promise<void> {
  requireWriter();
  await simulateLatency(null);
  db.write((tables) => {
    const line = tables.erp.statement.find((item) => item.id === lineId);
    if (line) { line.matched = ref ?? line.suggestion ?? `manual:${lineId}`; line.suggestion = null; }
  });
}

export async function reconcileAllSuggested(): Promise<number> {
  requireWriter();
  await simulateLatency(null);
  let count = 0;
  db.write((tables) => {
    for (const line of tables.erp.statement) {
      if (!line.matched && line.suggestion) { line.matched = line.suggestion; line.suggestion = null; count += 1; }
    }
  });
  return count;
}

/** Consulta simulada ao SINTEGRA: devolve a situação atual da IE. */
export async function checkIe(customerId: string) {
  await simulateLatency(null);
  let record = db.read().erp.ie.find((item) => item.customerId === customerId);
  db.write((tables) => {
    const row = tables.erp.ie.find((item) => item.customerId === customerId);
    if (row) row.checkedAt = isoDateTime(today());
    record = row;
  });
  return record ?? null;
}

/** Emite a NF-e do pedido aprovado, bloqueando inscrição estadual irregular. */
export async function emitInvoice(quoteId: string): Promise<Invoice> {
  requireWriter();
  const tables = db.read();
  const quote = tables.quotes.find((item) => item.id === quoteId);
  if (!quote || quote.status !== "approved") throw new ErpError("Só pedidos aprovados podem ser faturados.");
  if (tables.erp.invoices.some((item) => item.quoteId === quoteId && item.status === "autorizada")) throw new ErpError("Este pedido já tem NF-e autorizada.");
  const ie = tables.erp.ie.find((item) => item.customerId === quote.customer_id);
  if (ie && ie.status !== "ativa") throw new ErpError(`Emissão bloqueada: inscrição estadual ${ie.ie} está ${ie.status} no SINTEGRA.`);
  await simulateLatency(null);
  let invoice: Invoice | null = null;
  db.write((current) => {
    current.erp.seq.invoice += 1;
    invoice = { id: newId(), number: current.erp.seq.invoice, quoteId, customer: quote.customer_name_snapshot ?? "Consumidor", customerId: quote.customer_id, value: quote.grand_total, date: isoDateTime(today()), status: "autorizada", protocol: `151${Math.floor(100000000 + Math.random() * 899999999)}`, rejection: null };
    current.erp.invoices.push(invoice);
  });
  return invoice!;
}

export async function cancelInvoice(id: string): Promise<void> {
  requireWriter();
  await simulateLatency(null);
  db.write((tables) => {
    const invoice = tables.erp.invoices.find((item) => item.id === id);
    if (invoice) invoice.status = "cancelada";
  });
}

/** MDF-e encadeado à carga: notas, veículo e motorista já vêm preenchidos. */
export async function emitMdfe(loadId: string, driver: string): Promise<Mdfe> {
  requireWriter();
  const tables = db.read();
  const load = tables.loads.find((item) => item.id === loadId);
  if (!load) throw new ErpError("Carga não encontrada.");
  const quoteIds = new Set(tables.load_items.filter((item) => item.load_id === loadId).map((item) => item.quote_id));
  const notes = tables.erp.invoices.filter((item) => quoteIds.has(item.quoteId) && item.status === "autorizada").map((item) => item.number);
  if (!notes.length) throw new ErpError("Emita as NF-e dos pedidos da carga antes do MDF-e.");
  await simulateLatency(null);
  let mdfe: Mdfe | null = null;
  db.write((current) => {
    current.erp.seq.mdfe += 1;
    mdfe = { id: newId(), number: current.erp.seq.mdfe, loadId, vehicle: load.vehicle_name_snapshot, plate: load.vehicle_plate_snapshot, driver, invoices: notes, date: isoDateTime(today()), status: "autorizado" };
    current.erp.mdfe.push(mdfe);
  });
  return mdfe!;
}

export async function decideApproval(id: string, approve: boolean): Promise<void> {
  const viewer = getDemoViewer();
  if (viewer.role !== "administrador") throw new ErpError("Só a gestão (administrador) aprova.");
  await simulateLatency(null);
  db.write((tables) => {
    const item = tables.erp.approvals.find((row) => row.id === id);
    if (!item) return;
    item.status = approve ? "aprovado" : "recusado";
    item.decidedBy = viewerName();
    if (item.kind === "conserto" && item.ref) {
      const request = tables.erp.fleetRequests.find((row) => row.id === item.ref);
      if (request) { request.status = approve ? "aprovado" : "recusado"; request.decidedBy = viewerName(); }
    }
  });
}

export async function requestApproval(input: Pick<Approval, "kind" | "title" | "detail"> & { ref?: string | null }): Promise<void> {
  requireWriter();
  await simulateLatency(null);
  db.write((tables) => {
    tables.erp.approvals.unshift({ id: newId(), ...input, ref: input.ref ?? null, requestedBy: viewerName(), date: isoDateTime(today()), status: "pendente", decidedBy: null });
  });
}

/** Motorista/mecânico pede conserto; vai para aprovação da gestão com os orçamentos. */
export async function createFleetRequest(input: { vehicle: string; problem: string; quotes: FleetRequest["quotes"]; evidence?: EvidenceRef[]; checkRecordId?: string | null }): Promise<void> {
  requireWriter();
  if (!input.vehicle.trim()) throw new ErpError("Escolha o veículo.");
  if (!input.problem.trim()) throw new ErpError("Descreva o problema.");
  if (!input.quotes.length) throw new ErpError("Informe ao menos um orçamento com valor.");
  if (input.quotes.some((quote) => !quote.shop.trim())) throw new ErpError("Informe o nome da oficina de cada orçamento.");
  const id = newId();
  await simulateLatency(null);
  db.write((tables) => {
    tables.erp.fleetRequests.unshift({ id, vehicle: input.vehicle, date: isoDateTime(today()), problem: input.problem.trim(), requestedBy: viewerName(), quotes: input.quotes, chosen: null, status: "aguardando", decidedBy: null, context: null, evidence: input.evidence ?? [], checkRecordId: input.checkRecordId ?? null });
    const best = [...input.quotes].sort((a, b) => a.value - b.value)[0];
    tables.erp.approvals.unshift({ id: newId(), kind: "conserto", title: `Conserto do ${input.vehicle}`, detail: `${input.problem.trim().replace(/\.+$/, "")}. Menor orçamento: ${best.shop} (R$ ${best.value.toLocaleString("pt-BR")}).`, requestedBy: viewerName(), date: isoDateTime(today()), status: "pendente", decidedBy: null, ref: id });
  });
}

export async function decideFleetRequest(id: string, approve: boolean, chosen = 0): Promise<void> {
  if (getDemoViewer().role !== "administrador") throw new ErpError("Só a gestão (administrador) aprova consertos.");
  await simulateLatency(null);
  db.write((tables) => {
    const request = tables.erp.fleetRequests.find((row) => row.id === id);
    if (!request) return;
    request.status = approve ? "aprovado" : "recusado";
    request.chosen = approve ? chosen : null;
    request.decidedBy = viewerName();
    const approval = tables.erp.approvals.find((row) => row.ref === id && row.status === "pendente");
    if (approval) { approval.status = approve ? "aprovado" : "recusado"; approval.decidedBy = viewerName(); }
  });
}

export async function finishFleetRequest(id: string): Promise<void> {
  requireWriter();
  await simulateLatency(null);
  db.write((tables) => {
    const request = tables.erp.fleetRequests.find((row) => row.id === id);
    if (request && request.status === "aprovado") request.status = "concluido";
  });
}

/** Avança a ordem: planejada → em produção → concluída (dá baixa nos insumos e entrada no acabado). */
export async function advanceOrder(id: string): Promise<ProductionOrder["status"]> {
  requireWriter();
  await simulateLatency(null);
  let next: ProductionOrder["status"] = "planejada";
  db.write((tables) => {
    const order = tables.erp.orders.find((row) => row.id === id);
    if (!order) return;
    next = order.status === "planejada" ? "em_producao" : "concluida";
    if (order.status === "em_producao") {
      const formula = tables.erp.formulas.find((row) => row.product === order.product);
      const totalKg = order.bags * order.bagKg;
      const ingredients = order.formulaIngredients ?? formula?.ingredients ?? [];
      if (order.formulaIngredients) {
        for (const ingredient of ingredients) {
          const material = tables.erp.materials.find((entry) => entry.name === ingredient.material);
          if (!material || material.stockKg + 0.000001 < totalKg * ingredient.pct / 100) {
            throw new Error(`Estoque insuficiente de ${ingredient.material}. A ordem continua em produção.`);
          }
        }
      }
      for (const ingredient of ingredients) {
        const material = tables.erp.materials.find((row) => row.name === ingredient.material);
        if (material) material.stockKg = order.formulaIngredients
          ? Math.max(0, material.stockKg - totalKg * ingredient.pct / 100)
          : Math.max(0, Math.round(material.stockKg - (totalKg * ingredient.pct) / 100));
      }
      const stock = tables.erp.finished.find((row) => row.product === order.product);
      if (stock) stock.bags += order.bags;
      else tables.erp.finished.push({ product: order.product, bags: order.bags, reserved: 0, location: "Estoque acabado" });
    }
    order.status = next;
  });
  return next;
}

/** Entrada de matéria-prima no estoque (compra recebida na fábrica). */
export async function receiveMaterial(materialId: string, kg: number, pricePerKg?: number): Promise<void> {
  requireWriter();
  if (!(kg > 0)) throw new ErpError("Informe a quantidade recebida em kg.");
  if (pricePerKg !== undefined && !(pricePerKg > 0)) throw new ErpError("Informe o preço por kg.");
  const material = db.read().erp.materials.find((item) => item.id === materialId);
  if (!material) throw new ErpError("Matéria-prima não encontrada.");
  await simulateLatency(null);
  db.write((tables) => {
    const row = tables.erp.materials.find((item) => item.id === materialId)!;
    // Custo médio ponderado: o preço novo pesa pela quantidade recebida.
    if (pricePerKg !== undefined) row.pricePerKg = Math.round((((row.stockKg * row.pricePerKg) + (kg * pricePerKg)) / (row.stockKg + kg)) * 10_000) / 10_000;
    row.stockKg = row.stockKg + kg;
  });
}

export async function createOrder(product: string, bags: number, bagKg: number): Promise<void> {
  requireWriter();
  if (!product) throw new ErpError("Escolha o produto.");
  if (!(bags > 0)) throw new ErpError("Informe a quantidade de sacas.");
  await simulateLatency(null);
  db.write((tables) => {
    tables.erp.seq.order += 1;
    tables.erp.orders.unshift({ id: newId(), number: tables.erp.seq.order, product, bags, bagKg, status: "planejada", date: isoDate(today()), operator: viewerName() });
  });
}

export async function sendChat(thread: string, text: string): Promise<void> {
  if (!text.trim()) return;
  db.write((tables) => { tables.erp.chat.push({ id: newId(), thread, author: viewerName(), text: text.trim(), at: isoDateTime(today()) }); });
}

// ---------------------------------------------------------------- Contas a pagar e a receber

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function addMonths(key: string, months: number) {
  const [year, month, day] = key.split("-").map(Number);
  const last = new Date(year, month - 1 + months + 1, 0, 12).getDate();
  return isoDate(new Date(year, month - 1 + months, Math.min(day, last), 12));
}

export type NewPayable = { supplier: string; category: PayableCategory; description: string; dueDate: string; amount: number; installments?: number; issuedOn?: string; document?: string; documentType?: string; costCenter?: string; note?: string };

/** Lança uma conta a pagar; parcelada, vira uma conta por mês com o valor dividido em centavos. */
export async function createPayable(input: NewPayable): Promise<Payable[]> {
  requireWriter();
  const supplier = input.supplier.trim();
  const description = input.description.trim();
  const parts = input.installments ?? 1;
  if (!supplier) throw new ErpError("Informe o fornecedor.");
  if (!description) throw new ErpError("Descreva a conta (ex.: nota, serviço, lote).");
  if (!PAYABLE_CATEGORIES.includes(input.category)) throw new ErpError("Escolha a categoria.");
  if (!Number.isFinite(input.amount) || input.amount < 0.01 || input.amount > 1e9) throw new ErpError("Informe um valor válido, maior que zero.");
  if (!validFinanceDate(input.dueDate)) throw new ErpError("Informe a data de vencimento.");
  if (!Number.isInteger(parts) || parts < 1 || parts > 24) throw new ErpError("Parcelas: de 1 a 24.");
  const cents = Math.round(input.amount * 100);
  if (cents < parts) throw new ErpError("O total precisa cobrir pelo menos um centavo por parcela.");
  const issuedOn = input.issuedOn || isoDate(today());
  if (!validFinanceDate(issuedOn)) throw new ErpError("Informe uma data de emissão válida.");
  const group = newId();
  const each = Math.floor(cents / parts);
  const created: Payable[] = Array.from({ length: parts }, (_, index) => ({
    id: newId(),
    supplier,
    category: input.category,
    description: parts > 1 ? `${description} (${index + 1}/${parts})` : description,
    dueDate: addMonths(input.dueDate, index),
    issuedOn, createdAt: isoDateTime(today()), createdBy: viewerName(),
    document: input.document?.trim(), documentType: input.documentType?.trim(),
    costCenter: input.costCenter?.trim(), note: input.note?.trim(),
    installment: { number: index + 1, total: parts, group },
    amount: (index === parts - 1 ? cents - each * (parts - 1) : each) / 100,
    paidAt: null,
    bank: null,
  }));
  await simulateLatency(null);
  db.write((tables) => {
    tables.payables.push(...created);
    tables.payables.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  });
  return created;
}

function validFinanceDate(date: string) {
  if (!DATE_KEY.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && isoDate(parsed) === date;
}

function makeSettlement(amount: number, input?: SettlementInput): Settlement {
  const date = isoDate(today());
  const data = input ?? { date, method: "Transferência", interest: 0, fine: 0, discount: 0, note: "" };
  if (!validFinanceDate(data.date) || data.date > date) throw new ErpError("Informe uma data de baixa válida, até hoje.");
  if (!PAYMENT_METHODS.includes(data.method)) throw new ErpError("Escolha a forma de pagamento.");
  const credit = data.creditAmount ?? 0;
  const values = [data.interest, data.fine, data.discount, credit];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1e12)) throw new ErpError("Informe ajustes financeiros válidos.");
  const net = round(amount + round(data.interest) + round(data.fine) - round(data.discount) - round(credit));
  if (net < 0) throw new ErpError("Os abatimentos superam o valor do título.");
  return { ...data, interest: round(data.interest), fine: round(data.fine), discount: round(data.discount), creditAmount: round(credit), note: data.note.trim(), net, by: viewerName() };
}

export function registerSupplierCredit(input: Omit<SupplierCredit, "id" | "remaining">) {
  requireWriter();
  const supplier = input.supplier.trim();
  const reference = input.reference.trim();
  if (!supplier || !reference || !validFinanceDate(input.date) || input.date > isoDate(today())
    || !["Devolução", "Adiantamento"].includes(input.kind) || !Number.isFinite(input.amount) || input.amount < 0.01 || input.amount > 1e12) {
    throw new ErpError("Informe fornecedor, origem, data e valor do crédito.");
  }
  const amount = round(input.amount);
  db.write((tables) => {
    const credits = tables.erp.supplierCredits ?? [];
    if (credits.some((credit) => credit.supplier === supplier && credit.kind === input.kind && credit.reference === reference)) {
      throw new ErpError("Já existe um crédito desse fornecedor com a mesma referência.");
    }
    tables.erp.supplierCredits = [...credits, { ...input, supplier, reference, id: newId(), amount, remaining: amount }];
  });
}

export async function payPayable(id: string, bankId: BankId, input?: SettlementInput): Promise<Payable> {
  requireWriter();
  await simulateLatency(null);
  let paid!: Payable;
  db.write((current) => {
    const row = current.payables.find((item) => item.id === id);
    if (!row) throw new ErpError("Conta não encontrada.");
    if (row.paidAt) throw new ErpError("Esta conta já foi paga.");
    const bank = current.erp.banks.find((item) => item.id === bankId);
    if (!bank) throw new ErpError("Banco não encontrado.");
    const settlement = makeSettlement(row.amount, input);
    const credit = current.erp.supplierCredits?.find((item) => item.id === settlement.creditId && item.supplier === row.supplier);
    if ((settlement.creditAmount ?? 0) > 0 && (!credit || credit.remaining < settlement.creditAmount! || credit.date > settlement.date)) {
      throw new ErpError("Crédito insuficiente ou indisponível para este fornecedor e data.");
    }
    const cash = settlement.cashAccount ? prepareCounterSettlement(current, settlement.cashAccount, settlement.date) : null;
    if (settlement.instrument || settlement.method.startsWith("Cartão") || (cash && settlement.method !== "Dinheiro") || (!cash && settlement.method === "Dinheiro")) throw new ErpError("Para pagar pelo caixa físico, use Dinheiro.");
    if (!cash && bank.balance < settlement.net) throw new ErpError(`Saldo insuficiente no ${bank.name}.`);
    if (credit && settlement.creditAmount) {
      credit.remaining = round(credit.remaining - settlement.creditAmount);
      settlement.creditKind = credit.kind;
    }
    row.paidAt = settlement.date;
    row.bank = cash ? null : bankId;
    row.settlement = settlement;
    paid = { ...row };
    if (cash) {
      if (settlement.net) commitCashLine(current, cash.state, { account: cash.session.account, sessionId: cash.session.id, origin: "Baixa", date: settlement.date, clearedOn: settlement.date,
        kind: "Pagamento a prazo", amount: -settlement.net, method: "Dinheiro", document: row.document ?? row.id, description: `Pagamento · ${row.supplier}` });
      return;
    }
    bank.balance = round(bank.balance - settlement.net);
    if (settlement.net) current.erp.statement.unshift({ id: newId(), bank: bankId, date: settlement.date, description: `PAG ${row.supplier}`, amount: -settlement.net, matched: input ? null : row.id, suggestion: input ? row.id : null });
  });
  return paid;
}

export type NewReceivable = { customer: string; description: string; dueDate: string; amount: number };

/** Conta a receber avulsa, fora de orçamento (venda de sucata, aluguel, reembolso…). */
export async function createReceivable(input: NewReceivable): Promise<ExtraReceivable> {
  requireWriter();
  const customer = input.customer.trim();
  const description = input.description.trim();
  if (!customer) throw new ErpError("Informe de quem vamos receber.");
  if (!description) throw new ErpError("Descreva o que está sendo cobrado.");
  if (!Number.isFinite(input.amount) || input.amount < 0.01 || input.amount > 1e9) throw new ErpError("Informe um valor válido, maior que zero.");
  if (!validFinanceDate(input.dueDate)) throw new ErpError("Informe a data de vencimento.");
  const row: ExtraReceivable = { id: newId(), customer, description, dueDate: input.dueDate, amount: round(input.amount), createdAt: isoDateTime(today()), createdBy: viewerName() };
  await simulateLatency(null);
  db.write((tables) => {
    tables.erp.extraReceivables = [...(tables.erp.extraReceivables ?? []), row];
  });
  return row;
}

/** Baixa de um título: o valor entra no saldo do banco e no extrato, já conciliado. */
export async function receiveTitle(key: string, bankId: BankId, input?: SettlementInput): Promise<Receipt> {
  requireWriter();
  await simulateLatency(null);
  let receipt!: Receipt;
  db.write((current) => {
    const title = receivables(current, today()).find((item) => titleKey(item) === key);
    if (!title) throw new ErpError("Título não encontrado.");
    if (title.paidAt) throw new ErpError("Este título já foi recebido.");
    if (anticipatedKeys(current).has(key)) throw new ErpError("Título antecipado: a baixa comum está bloqueada.");
    const bank = current.erp.banks.find((item) => item.id === bankId);
    if (!bank) throw new ErpError("Banco não encontrado.");
    if (input?.creditId || input?.creditAmount) throw new ErpError("Crédito de fornecedor se aplica a contas a pagar.");
    const settlement = makeSettlement(title.amount, input);
    const cash = settlement.cashAccount ? prepareCounterSettlement(current, settlement.cashAccount, settlement.date) : null;
    let pendingIds: string[] | undefined;
    const method = settlement.method;
    if (settlement.instrument) {
      if (!cash || (method !== "Cheque" && method !== "Cartão débito" && method !== "Cartão crédito")) throw new ErpError("Abra a sessão do balcão e informe um cartão ou cheque.");
      const meta = settlement.instrument;
      pendingIds = registerPendingCash(cash.state, { ...meta, method, gross: settlement.net, document: `${title.quoteNumber}/${title.number}` }, cash.session.id, meta.installments, "Recebimento a prazo").map((row) => row.id);
      current.erp.cash = cash.state;
    } else if ((cash && method !== "Dinheiro") || method.startsWith("Cartão") || (!cash && method === "Dinheiro")) {
      throw new ErpError("Confira a forma de pagamento e a conta selecionada.");
    }
    receipt = { key, paidAt: settlement.date, bank: cash ? null : bankId, amount: settlement.net, by: settlement.by, settlement, pendingIds };
    current.erp.receipts = [...(current.erp.receipts ?? []), receipt];
    if (pendingIds) return;
    if (cash) {
      if (settlement.net) commitCashLine(current, cash.state, { account: cash.session.account, sessionId: cash.session.id, origin: "Baixa", date: settlement.date, clearedOn: settlement.date,
        kind: "Recebimento a prazo", amount: settlement.net, method: "Dinheiro", document: `${title.quoteNumber}/${title.number}`, description: `Recebimento · ${title.customer}` });
      return;
    }
    bank.balance = round(bank.balance + settlement.net);
    if (settlement.net) current.erp.statement.unshift({ id: newId(), bank: bankId, date: settlement.date, description: `LIQ ${title.customer}`, amount: settlement.net, matched: input ? null : key, suggestion: input ? key : null });
  });
  return receipt;
}
