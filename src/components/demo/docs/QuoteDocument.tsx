import logoUrl from "../../../assets/qualinutri-logo.png";
import { guessDocumentKind } from "../../../domain/documents/brazilianDocument";
import { calculateOrderWeight } from "../../../domain/order/orderWeight";
import { describePaymentTerm, paymentTermCondition } from "../../../domain/payment/paymentTerm";
import type { DemoTables } from "../../../demo/store/types";
import { formatCurrency, formatNumber, formatPercentage } from "../../../utils/formatters";

const loadTypeLabels: Record<string, string> = { fractional: "carga fracionada", closed: "carga fechada" };

/** Mesma página do PDF do orçamento (mesmas classes .quote-doc), para ver na tela. */
export function QuoteDocument({ tables, quoteId }: { tables: DemoTables; quoteId: string }) {
  const quote = tables.quotes.find((item) => item.id === quoteId);
  if (!quote) return null;
  const items = tables.quote_items.filter((item) => item.quote_id === quoteId).sort((a, b) => a.display_order - b.display_order);
  const seller = tables.profiles.find((profile) => profile.id === quote.created_by);
  const sellerName = seller ? seller.displayName || seller.login : null;
  const paymentMode = quote.payment_mode === "installments" || quote.payment_mode === "single" ? quote.payment_mode : null;
  const termLabels = [...new Set(items.map((item) => item.payment_term_snapshot).filter((label): label is string => Boolean(label)))];
  const singleTerm = termLabels.length === 1 ? termLabels[0] : null;
  const { bags: totalBags, weightKg: totalWeight } = calculateOrderWeight(items.map((item) => ({ quantity: item.quantity, weightKg: Number(item.weight_kg_snapshot) })));
  const freight = quote.freight_table_name_snapshot ? [quote.freight_table_name_snapshot, quote.freight_zone_snapshot, quote.load_type_snapshot ? loadTypeLabels[quote.load_type_snapshot] : null].filter(Boolean).join(", ") : "Não incluído";
  const handling = Number(quote.handling_total) > 0 ? `${formatCurrency(Number(quote.handling_rate_per_ton_snapshot))} por tonelada` : "Não incluída";
  return (
    <article className="quote-doc">
      <header className="quote-doc-header">
        <img src={logoUrl} alt="Qualinutri Nutrição Animal" />
        <div className="quote-doc-number"><span>Orçamento</span><strong>nº {quote.quote_number}</strong><span>{new Date(quote.created_at).toLocaleDateString("pt-BR")}</span></div>
      </header>
      <p className="quote-doc-company">Qualinutri Ind. Com. de Nutrição Animal Ltda, Av. Rio Arinos, 3881 S, Juara, MT.</p>
      <section className="quote-doc-parties">
        <div><h2>Cliente</h2><p className="quote-doc-strong">{quote.customer_name_snapshot || "Não informado"}</p>{quote.customer_document_snapshot && <p>{guessDocumentKind(quote.customer_document_snapshot) === "cpf" ? "CPF" : "CNPJ"} {quote.customer_document_snapshot}</p>}</div>
        <div><h2>Vendedor</h2><p className="quote-doc-strong">{sellerName || "Equipe comercial Qualinutri"}</p></div>
      </section>
      <table className="quote-doc-items">
        <thead><tr><th scope="col">Produto</th><th scope="col" className="numeric">Sacas</th><th scope="col" className="numeric">Preço de tabela</th><th scope="col" className="numeric">Desconto</th><th scope="col" className="numeric">Preço final</th><th scope="col" className="numeric">Subtotal</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><span className="quote-doc-strong">{item.product_name_snapshot}</span><span className="quote-doc-sub">{[!singleTerm && item.payment_term_snapshot ? describePaymentTerm(item.payment_term_snapshot, paymentMode) : null, `saca de ${formatNumber(Number(item.weight_kg_snapshot))} kg`, `${formatNumber(item.quantity * Number(item.weight_kg_snapshot))} kg`].filter(Boolean).join(", ")}</span></td>
              <td className="numeric">{formatNumber(item.quantity)}</td>
              <td className="numeric">{formatCurrency(Number(item.table_unit_price))}</td>
              <td className="numeric">{formatPercentage(Number(item.total_discount_percentage))}</td>
              <td className="numeric">{formatCurrency(Number(item.final_unit_price))}</td>
              <td className="numeric quote-doc-strong">{formatCurrency(Number(item.product_subtotal))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="quote-doc-bottom">
        <dl className="quote-doc-conditions">
          {singleTerm && <div><dt>Prazo de pagamento</dt><dd>{paymentTermCondition(singleTerm, paymentMode)}</dd></div>}
          <div><dt>Quantidade</dt><dd>{formatNumber(totalBags)} {totalBags === 1 ? "saca" : "sacas"}</dd></div>
          <div><dt>Frete</dt><dd>{freight}</dd></div>
          <div><dt>Chapa (carga e descarga)</dt><dd>{handling}</dd></div>
          <div><dt>Pagamento antecipado</dt><dd>{quote.anticipated_payment ? `Sim, com desconto adicional de ${formatPercentage(Number(quote.anticipated_discount_percentage))}` : "Não"}</dd></div>
        </dl>
        <dl className="quote-doc-totals">
          <div><dt>Subtotal dos produtos</dt><dd>{formatCurrency(Number(quote.product_subtotal))}</dd></div>
          <div><dt>Frete</dt><dd>{formatCurrency(Number(quote.freight_total))}</dd></div>
          <div><dt>Chapa</dt><dd>{formatCurrency(Number(quote.handling_total))}</dd></div>
          <div className="quote-doc-grand"><dt>Total do pedido</dt><dd>{formatCurrency(Number(quote.grand_total))}</dd></div>
          <div className="quote-doc-saving"><dt>Desconto concedido</dt><dd>{formatCurrency(Number(quote.economy_total))}</dd></div>
        </dl>
      </section>
      {quote.notes && <section className="quote-doc-notes"><h2>Observações</h2><p>{quote.notes}</p></section>}
      <section className="quote-doc-weight" aria-label="Peso da carga"><span>Peso total da carga</span><strong>{formatNumber(totalWeight)} kg</strong><span>{formatNumber(Math.round(totalWeight) / 1000)} t · {formatNumber(totalBags)} {totalBags === 1 ? "saca" : "sacas"} · {items.length} {items.length === 1 ? "produto" : "produtos"}</span></section>
      <footer className="quote-doc-footer">O desconto incide sobre o preço de tabela, independente da condição de pagamento. Frete e chapa não têm desconto. Pedido mínimo: 1 tonelada.</footer>
    </article>
  );
}
