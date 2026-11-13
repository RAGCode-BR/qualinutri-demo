import { supabase } from "../lib/supabase";
import { mapQuoteSnapshotToPayload } from "../domain/quotes/mapQuoteSnapshotToPayload";
import type { Database, Json } from "../types/database.types";
import type { QuoteSnapshot, QuoteSnapshotItem } from "../types/quote";

type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteItemRow = Database["public"]["Tables"]["quote_items"]["Row"];

export type SavedQuoteSummary = Pick<
  QuoteRow,
  "id" | "quote_number" | "status" | "customer_name_snapshot" | "grand_total" | "created_at" | "updated_at" | "issued_at" | "approved_at" | "created_by"
>;

export type SavedQuoteDetail = {
  quote: QuoteRow;
  items: QuoteItemRow[];
};

export class QuoteServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com o orçamento.") {
    super(message);
    this.name = "QuoteServiceError";
  }
}

function requireClient() {
  if (!supabase) throw new QuoteServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

export async function createQuote(snapshot: QuoteSnapshot) {
  const client = requireClient();
  const payload = mapQuoteSnapshotToPayload(snapshot);
  const { data, error } = await client.rpc("create_quote", {
    p_quote: payload.quote as Json,
    p_items: payload.items as Json,
  });
  const saved = data?.[0];
  if (error || !saved) throw readableError(error, "Não foi possível salvar o orçamento.");
  return saved;
}

/** Nome de quem criou o orçamento; null se não for possível obter. */
export async function getQuoteSellerName(id: string): Promise<string | null> {
  const { data, error } = await requireClient().rpc("quote_seller_name", { p_quote_id: id });
  return error ? null : data ?? null;
}

/** Regrava um orçamento existente mantendo número e situação. */
export async function updateQuote(id: string, snapshot: QuoteSnapshot) {
  const client = requireClient();
  const payload = mapQuoteSnapshotToPayload(snapshot);
  const { data, error } = await client.rpc("update_quote", {
    p_quote_id: id,
    p_quote: payload.quote as Json,
    p_items: payload.items as Json,
  });
  const saved = data?.[0];
  if (error || !saved) throw readableError(error, "Não foi possível salvar as alterações do orçamento.");
  return saved;
}

export type QuoteFilters = {
  /** Número exato do orçamento. */
  number?: number | null;
  /** "all": todos; "none": sem cliente vinculado; ou o id de um cliente. */
  customer?: "all" | "none" | string;
};

/** Orçamentos mais recentes que atendem aos filtros, aplicados no banco. */
/** Números dos orçamentos, para exibir vínculos (ex.: visitas). */
export async function getQuoteNumbers(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await requireClient().from("quotes").select("id,quote_number").in("id", ids);
  if (error || !data) return new Map();
  return new Map(data.map((row) => [row.id, row.quote_number]));
}

export async function listQuotes(filters: QuoteFilters = {}, limit = 50): Promise<SavedQuoteSummary[]> {
  const client = requireClient();
  let query = client
    .from("quotes")
    .select("id,quote_number,status,customer_name_snapshot,grand_total,created_at,updated_at,issued_at,approved_at,created_by");
  if (filters.number) query = query.eq("quote_number", filters.number);
  if (filters.customer === "none") query = query.is("customer_id", null);
  else if (filters.customer && filters.customer !== "all") query = query.eq("customer_id", filters.customer);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) throw new QuoteServiceError();
  return data;
}

export async function getQuote(id: string): Promise<SavedQuoteDetail> {
  const client = requireClient();
  const [quoteResult, itemsResult] = await Promise.all([
    client.from("quotes").select("*").eq("id", id).maybeSingle(),
    client.from("quote_items").select("*").eq("quote_id", id).order("display_order"),
  ]);
  if (quoteResult.error || itemsResult.error || !quoteResult.data || !itemsResult.data) {
    throw new QuoteServiceError("Orçamento não encontrado ou indisponível.");
  }
  return { quote: quoteResult.data, items: itemsResult.data };
}

/** Erros de regra do banco (22023, 42501) já vêm com mensagem para o usuário. */
function readableError(error: { code?: string; message?: string } | null, fallback: string) {
  const readable = (error?.code === "22023" || error?.code === "42501") && error.message;
  return new QuoteServiceError(readable || fallback);
}

/**
 * Muda a situação pelo banco: rascunho -> enviado -> aprovado, ou cancelado.
 * Só o dono do orçamento ou um administrador; as datas são do servidor.
 */
async function setQuoteStatus(id: string, status: "issued" | "approved" | "cancelled") {
  const { error } = await requireClient().rpc("set_quote_status", { p_quote_id: id, p_status: status });
  if (error) throw readableError(error, "Não foi possível atualizar a situação do orçamento.");
}

export async function advanceQuoteStatus(id: string, status: "issued" | "approved"): Promise<void> {
  await setQuoteStatus(id, status);
}

export async function cancelQuote(id: string): Promise<void> {
  await setQuoteStatus(id, "cancelled");
}

function itemRowToSnapshot(item: QuoteItemRow): QuoteSnapshotItem {
  return {
    displayOrder: item.display_order,
    productId: item.product_id,
    paymentTermId: item.payment_term_id,
    discountRuleId: item.discount_rule_id,
    productName: item.product_name_snapshot,
    categoryName: item.category_name_snapshot,
    weightKg: Number(item.weight_kg_snapshot),
    paymentTerm: item.payment_term_snapshot,
    tableUnitPrice: Number(item.table_unit_price),
    quantity: item.quantity,
    lineDiscountPercentage: Number(item.line_discount_percentage),
    anticipatedDiscountPercentage: Number(item.anticipated_discount_percentage),
    totalDiscountPercentage: Number(item.total_discount_percentage),
    finalUnitPrice: Number(item.final_unit_price),
    economyPerUnit: Number(item.economy_per_unit),
    freightPerUnit: Number(item.freight_per_unit),
    handlingPerUnit: Number(item.handling_per_unit),
    productSubtotal: Number(item.product_subtotal),
    freightSubtotal: Number(item.freight_subtotal),
    handlingSubtotal: Number(item.handling_subtotal),
    total: Number(item.total),
  };
}

export async function duplicateQuote(id: string) {
  const { quote, items } = await getQuote(id);
  const loadType = quote.load_type_snapshot === "fractional" || quote.load_type_snapshot === "closed"
    ? quote.load_type_snapshot
    : null;
  return createQuote({
    status: "draft",
    calculationVersion: quote.calculation_version,
    customerId: quote.customer_id,
    customerName: quote.customer_name_snapshot,
    customerDocument: quote.customer_document_snapshot,
    priceTableId: quote.price_table_id,
    discountTableId: quote.discount_table_id,
    freightTableId: quote.freight_table_id,
    handlingRateTableId: quote.handling_rate_table_id,
    policyVersionId: quote.policy_version_id,
    anticipatedPayment: quote.anticipated_payment,
    anticipatedDiscountPercentage: Number(quote.anticipated_discount_percentage),
    freightTableName: quote.freight_table_name_snapshot,
    freightZone: quote.freight_zone_snapshot,
    loadType,
    handlingRatePerTon: Number(quote.handling_rate_per_ton_snapshot),
    productSubtotal: Number(quote.product_subtotal),
    freightTotal: Number(quote.freight_total),
    handlingTotal: Number(quote.handling_total),
    economyTotal: Number(quote.economy_total),
    grandTotal: Number(quote.grand_total),
    notes: quote.notes,
    paymentMode: quote.payment_mode === "installments" || quote.payment_mode === "single" ? quote.payment_mode : null,
    items: items.map(itemRowToSnapshot),
  });
}
