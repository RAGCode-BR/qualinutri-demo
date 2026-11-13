import { mapQuoteSnapshotToPayload } from "../../domain/quotes/mapQuoteSnapshotToPayload";
import type { QuoteSnapshot } from "../../types/quote";
import type { Row } from "../store/types";

export type QuoteRowMeta = {
  id: string;
  quoteNumber: number;
  createdAt: string;
  createdBy: string;
  itemId: (index: number) => string;
};

/** Converte o snapshot gravado pela Calculadora nas linhas que o banco real guardaria. */
export function snapshotToRows(snapshot: QuoteSnapshot, meta: QuoteRowMeta): { quote: Row<"quotes">; items: Row<"quote_items">[] } {
  const payload = mapQuoteSnapshotToPayload(snapshot);
  const quote: Row<"quotes"> = {
    ...payload.quote,
    status: snapshot.status,
    id: meta.id,
    quote_number: meta.quoteNumber,
    created_at: meta.createdAt,
    updated_at: meta.createdAt,
    created_by: meta.createdBy,
    updated_by: null,
    issued_at: null,
    approved_at: null,
    cancelled_at: null,
  };
  const items = payload.items.map((item, index) => ({ ...item, id: meta.itemId(index), quote_id: meta.id, created_at: meta.createdAt }));
  return { quote, items };
}
