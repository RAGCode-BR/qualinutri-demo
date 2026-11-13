import { getDemoViewer, viewerName } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { isoDate, isoDateTime, newId, today } from "../store/ids";
import { receivables } from "../kpis/finance";
import { discountTitle, titleKey } from "./finance";
import type { Anticipation, Approval, BankId, FleetRequest, Invoice, Mdfe, ProductionOrder } from "./types";

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
  const tables = db.read();
  const bank = tables.erp.banks.find((item) => item.id === bankId);
  if (!bank) throw new ErpError("Banco não encontrado.");
  const wanted = new Set(keys);
  const date = isoDate(today());
  const titles = receivables(tables, today()).filter((item) => wanted.has(titleKey(item))).map((item) => discountTitle(item, bank, date));
  const sum = (key: "amount" | "interest" | "iof" | "fee" | "net") => round(titles.reduce((total, title) => total + title[key], 0));
  const result: Anticipation = { id: newId(), bank: bankId, date, titles, gross: sum("amount"), interest: sum("interest"), iof: sum("iof"), fees: sum("fee"), net: sum("net") };
  await simulateLatency(null);
  db.write((current) => {
    current.erp.anticipations.push(result);
    const target = current.erp.banks.find((item) => item.id === bankId)!;
    target.balance = round(target.balance + result.net);
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
export async function createFleetRequest(input: { vehicle: string; problem: string; quotes: FleetRequest["quotes"] }): Promise<void> {
  requireWriter();
  if (!input.problem.trim()) throw new ErpError("Descreva o problema.");
  if (!input.quotes.length) throw new ErpError("Informe ao menos um orçamento.");
  const id = newId();
  await simulateLatency(null);
  db.write((tables) => {
    tables.erp.fleetRequests.unshift({ id, vehicle: input.vehicle, date: isoDateTime(today()), problem: input.problem.trim(), requestedBy: viewerName(), quotes: input.quotes, chosen: null, status: "aguardando", decidedBy: null, context: null });
    const best = [...input.quotes].sort((a, b) => a.value - b.value)[0];
    tables.erp.approvals.unshift({ id: newId(), kind: "conserto", title: `Conserto do ${input.vehicle}`, detail: `${input.problem.trim()}. Menor orçamento: ${best.shop} (R$ ${best.value.toLocaleString("pt-BR")}).`, requestedBy: viewerName(), date: isoDateTime(today()), status: "pendente", decidedBy: null, ref: id });
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
    }
    order.status = next;
  });
  return next;
}

export async function createOrder(product: string, bags: number, bagKg: number): Promise<void> {
  requireWriter();
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
