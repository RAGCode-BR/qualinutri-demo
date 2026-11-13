import type { QuoteSnapshot, QuoteSnapshotItem } from "../../types/quote";
import { getDemoViewer } from "../app/session";
import { snapshotToRows } from "../quotes/rows";
import { clone, db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import type { Row } from "../store/types";
import { nowIso } from "./common";

type QuoteRow = Row<"quotes">;
type QuoteItemRow = Row<"quote_items">;

export type SavedQuoteSummary = Pick<QuoteRow, "id" | "quote_number" | "status" | "customer_name_snapshot" | "grand_total" | "created_at" | "updated_at" | "issued_at" | "approved_at" | "created_by">;
export type SavedQuoteDetail = { quote: QuoteRow; items: QuoteItemRow[] };
export type QuoteFilters = { number?: number | null; customer?: "all" | "none" | string };

export class QuoteServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com o orçamento.") {
    super(message);
    this.name = "QuoteServiceError";
  }
}

function requireWriter() {
  const role = getDemoViewer().role;
  if (role !== "administrador" && role !== "comercial") throw new QuoteServiceError("Seu perfil não pode salvar orçamentos.");
}

function requireOwner(quote: QuoteRow) {
  const viewer = getDemoViewer();
  if (viewer.role !== "administrador" && quote.created_by !== viewer.id) {
    throw new QuoteServiceError("Só quem criou o orçamento ou um administrador pode alterá-lo.");
  }
}

function findQuote(id: string): QuoteRow {
  const quote = db.read().quotes.find((item) => item.id === id);
  if (!quote) throw new QuoteServiceError("Orçamento não encontrado ou indisponível.");
  return quote;
}

function validateSnapshot(snapshot: QuoteSnapshot) {
  if (snapshot.items.length === 0) throw new QuoteServiceError("Adicione ao menos um produto ao orçamento.");
  const sum = snapshot.items.reduce((total, item) => total + item.total, 0);
  if (Math.abs(sum - snapshot.grandTotal) > 0.05) throw new QuoteServiceError("Os totais do orçamento não conferem. Revise os itens.");
  if (snapshot.notes && snapshot.notes.length > 1000) throw new QuoteServiceError("As observações aceitam até 1.000 caracteres.");
}

export async function createQuote(snapshot: QuoteSnapshot) {
  requireWriter();
  validateSnapshot(snapshot);
  await simulateLatency(null);
  const id = newId();
  let quoteNumber = 0;
  db.write((tables) => {
    tables.seq.quote += 1;
    quoteNumber = tables.seq.quote;
    const rows = snapshotToRows({ ...snapshot, status: "draft" }, { id, quoteNumber, createdAt: nowIso(), createdBy: getDemoViewer().id, itemId: () => newId() });
    tables.quotes.push(rows.quote);
    tables.quote_items.push(...rows.items);
  });
  return { id, quote_number: quoteNumber };
}

export async function getQuoteSellerName(id: string): Promise<string | null> {
  const quote = db.read().quotes.find((item) => item.id === id);
  const user = db.read().profiles.find((profile) => profile.id === quote?.created_by);
  return user ? user.displayName || user.login : null;
}

export async function updateQuote(id: string, snapshot: QuoteSnapshot) {
  requireWriter();
  validateSnapshot(snapshot);
  const current = findQuote(id);
  requireOwner(current);
  if (current.status !== "draft" && current.status !== "issued") throw new QuoteServiceError("Só orçamentos em rascunho ou enviados podem ser editados.");
  await simulateLatency(null);
  db.write((tables) => {
    const index = tables.quotes.findIndex((item) => item.id === id);
    const rows = snapshotToRows({ ...snapshot, status: "draft" }, { id, quoteNumber: current.quote_number, createdAt: current.created_at, createdBy: current.created_by ?? getDemoViewer().id, itemId: () => newId() });
    tables.quotes[index] = { ...rows.quote, status: current.status, issued_at: current.issued_at, approved_at: current.approved_at, cancelled_at: current.cancelled_at, updated_at: nowIso(), updated_by: getDemoViewer().id };
    tables.quote_items = tables.quote_items.filter((item) => item.quote_id !== id).concat(rows.items);
  });
  return { id, quote_number: current.quote_number };
}

export async function getQuoteNumbers(ids: string[]): Promise<Map<string, number>> {
  const wanted = new Set(ids);
  return new Map(db.read().quotes.filter((quote) => wanted.has(quote.id)).map((quote) => [quote.id, quote.quote_number]));
}

export function toQuoteSummary(row: QuoteRow): SavedQuoteSummary {
  const { id, quote_number, status, customer_name_snapshot, grand_total, created_at, updated_at, issued_at, approved_at, created_by } = row;
  return { id, quote_number, status, customer_name_snapshot, grand_total, created_at, updated_at, issued_at, approved_at, created_by };
}

export async function listQuotes(filters: QuoteFilters = {}, limit = 50): Promise<SavedQuoteSummary[]> {
  return simulateLatency(() => db.read().quotes
    .filter((quote) => !filters.number || quote.quote_number === filters.number)
    .filter((quote) => filters.customer === "none" ? quote.customer_id === null : !filters.customer || filters.customer === "all" || quote.customer_id === filters.customer)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map(toQuoteSummary));
}

export async function getQuote(id: string): Promise<SavedQuoteDetail> {
  return simulateLatency(() => {
    const quote = findQuote(id);
    const items = db.read().quote_items.filter((item) => item.quote_id === id).sort((a, b) => a.display_order - b.display_order);
    return clone({ quote, items });
  });
}

function inActiveLoad(id: string) {
  const { loads, load_items } = db.read();
  const active = new Set(loads.filter((load) => load.status !== "cancelled").map((load) => load.id));
  return load_items.some((item) => item.quote_id === id && active.has(item.load_id));
}

async function setQuoteStatus(id: string, status: "issued" | "approved" | "cancelled") {
  const quote = findQuote(id);
  requireOwner(quote);
  const allowed = status === "issued" ? quote.status === "draft"
    : status === "approved" ? quote.status === "issued"
    : quote.status === "draft" || quote.status === "issued" || quote.status === "approved";
  if (!allowed) throw new QuoteServiceError("Esta mudança de situação não é permitida para o orçamento.");
  if (status === "cancelled" && inActiveLoad(id)) throw new QuoteServiceError("O orçamento está numa carga e não pode ser cancelado.");
  await simulateLatency(null);
  db.write((tables) => {
    const row = tables.quotes.find((item) => item.id === id);
    if (!row) return;
    const at = nowIso();
    row.status = status;
    row.updated_at = at;
    row.updated_by = getDemoViewer().id;
    if (status === "issued") row.issued_at = at;
    if (status === "approved") row.approved_at = at;
    if (status === "cancelled") row.cancelled_at = at;
  });
}

export async function advanceQuoteStatus(id: string, status: "issued" | "approved"): Promise<void> {
  await setQuoteStatus(id, status);
}

export async function cancelQuote(id: string): Promise<void> {
  await setQuoteStatus(id, "cancelled");
}

function itemRowToSnapshot(item: QuoteItemRow): QuoteSnapshotItem {
  return {
    displayOrder: item.display_order, productId: item.product_id, paymentTermId: item.payment_term_id, discountRuleId: item.discount_rule_id,
    productName: item.product_name_snapshot, categoryName: item.category_name_snapshot, weightKg: Number(item.weight_kg_snapshot),
    paymentTerm: item.payment_term_snapshot, tableUnitPrice: Number(item.table_unit_price), quantity: item.quantity,
    lineDiscountPercentage: Number(item.line_discount_percentage), anticipatedDiscountPercentage: Number(item.anticipated_discount_percentage),
    totalDiscountPercentage: Number(item.total_discount_percentage), finalUnitPrice: Number(item.final_unit_price), economyPerUnit: Number(item.economy_per_unit),
    freightPerUnit: Number(item.freight_per_unit), handlingPerUnit: Number(item.handling_per_unit), productSubtotal: Number(item.product_subtotal),
    freightSubtotal: Number(item.freight_subtotal), handlingSubtotal: Number(item.handling_subtotal), total: Number(item.total),
  };
}

export async function duplicateQuote(id: string) {
  const { quote, items } = await getQuote(id);
  const loadType = quote.load_type_snapshot === "fractional" || quote.load_type_snapshot === "closed" ? quote.load_type_snapshot : null;
  return createQuote({
    status: "draft", calculationVersion: quote.calculation_version, customerId: quote.customer_id, customerName: quote.customer_name_snapshot,
    customerDocument: quote.customer_document_snapshot, priceTableId: quote.price_table_id, discountTableId: quote.discount_table_id,
    freightTableId: quote.freight_table_id, handlingRateTableId: quote.handling_rate_table_id, policyVersionId: quote.policy_version_id,
    anticipatedPayment: quote.anticipated_payment, anticipatedDiscountPercentage: Number(quote.anticipated_discount_percentage),
    freightTableName: quote.freight_table_name_snapshot, freightZone: quote.freight_zone_snapshot, loadType,
    handlingRatePerTon: Number(quote.handling_rate_per_ton_snapshot), productSubtotal: Number(quote.product_subtotal), freightTotal: Number(quote.freight_total),
    handlingTotal: Number(quote.handling_total), economyTotal: Number(quote.economy_total), grandTotal: Number(quote.grand_total), notes: quote.notes,
    paymentMode: quote.payment_mode === "installments" || quote.payment_mode === "single" ? quote.payment_mode : null,
    items: items.map(itemRowToSnapshot),
  });
}
