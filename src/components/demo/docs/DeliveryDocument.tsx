import logoUrl from "../../../assets/qualinutri-logo.png";
import type { DemoTables } from "../../../demo/store/types";
import { installmentsFor } from "../../../demo/kpis/finance";
import { formatCurrency, formatNumber } from "../../../utils/formatters";

export type DeliveryStop = {
  key: string;
  stop: number;
  customerId: string | null;
  customer: string;
  quoteIds: string[];
};

/** Paradas da carga, uma por cliente, na ordem de entrega (load_items.stop_order). */
export function deliveryStops(tables: DemoTables, loadId: string): DeliveryStop[] {
  const items = tables.load_items.filter((item) => item.load_id === loadId).sort((a, b) => a.stop_order - b.stop_order);
  const stops: DeliveryStop[] = [];
  for (const item of items) {
    const quote = tables.quotes.find((row) => row.id === item.quote_id);
    const key = quote?.customer_id ?? quote?.customer_name_snapshot ?? item.quote_id;
    let stop = stops.find((row) => row.key === key);
    if (!stop) {
      stop = { key, stop: stops.length + 1, customerId: quote?.customer_id ?? null, customer: quote?.customer_name_snapshot ?? "Sem cliente", quoteIds: [] };
      stops.push(stop);
    }
    if (!stop.quoteIds.includes(item.quote_id)) stop.quoteIds.push(item.quote_id);
  }
  return stops;
}

const DRIVERS = ["Valdir Souza", "Marcos Pereira", "Edson Lima"];

/** Ficha de entrega de um cliente: itens, notas, cobrança, roteiro e espaço para assinatura e fotos. */
export function DeliveryDocument({ tables, loadId, stop, total }: { tables: DemoTables; loadId: string; stop: DeliveryStop; total: DeliveryStop[] }) {
  const load = tables.loads.find((item) => item.id === loadId);
  if (!load) return null;
  const customer = stop.customerId ? tables.customers.find((item) => item.id === stop.customerId) : undefined;
  const address = customer?.address && typeof customer.address === "object" && !Array.isArray(customer.address) ? customer.address as Record<string, string | null> : {};
  const lines = tables.load_items.filter((item) => item.load_id === loadId && stop.quoteIds.includes(item.quote_id));
  const quotes = stop.quoteIds.map((id) => tables.quotes.find((item) => item.id === id)).filter((item) => !!item);
  const mdfe = tables.erp.mdfe.find((item) => item.loadId === loadId && item.status !== "cancelado");
  const invoices = tables.erp.invoices.filter((item) => stop.quoteIds.includes(item.quoteId) && item.status === "autorizada");
  const driver = mdfe?.driver ?? DRIVERS[load.load_number % DRIVERS.length];
  const weight = lines.reduce((sum, item) => sum + item.quantity * item.weight_kg_snapshot, 0);
  const bags = lines.reduce((sum, item) => sum + item.quantity, 0);
  const value = quotes.reduce((sum, quote) => sum + quote.grand_total, 0);
  const date = load.shipped_at ?? load.loaded_at ?? load.planned_date ?? load.created_at;
  const bills = quotes.flatMap((quote) => {
    const term = tables.quote_items.find((item) => item.quote_id === quote.id)?.payment_term_snapshot ?? null;
    return installmentsFor(term, quote.payment_mode, quote.grand_total, quote.approved_at ?? quote.created_at).map((part, index, all) => ({ ...part, label: `${quote.quote_number}-${index + 1}/${all.length}`, term }));
  });

  return (
    <article className="fiscal-doc delivery-doc">
      <header className="fiscal-head">
        <div className="fiscal-issuer"><img src={logoUrl} alt="" /><div><strong>QUALINUTRI IND. COM. DE NUTRIÇÃO ANIMAL LTDA</strong><span>Av. Rio Arinos, 3881 S · Juara/MT</span><span>Expedição · (66) 3556-0000</span></div></div>
        <div className="fiscal-title"><strong>FICHA DE ENTREGA</strong><span>Comprovante de recebimento por cliente</span><strong>Carga #{load.load_number} · Parada {stop.stop} de {total.length}</strong></div>
        <div className="fiscal-key delivery-route">
          <span>Roteiro da carga</span>
          <ol>{total.map((item) => <li key={item.key} className={item.key === stop.key ? "is-current" : undefined}><b>{item.stop}</b>{item.customer}</li>)}</ol>
        </div>
      </header>

      <section className="fiscal-box fiscal-grid">
        <h3>Destinatário</h3>
        <div><span>Cliente</span><strong>{stop.customer}</strong></div>
        <div><span>CPF/CNPJ</span><strong>{customer?.document ?? quotes[0]?.customer_document_snapshot ?? "—"}</strong></div>
        <div><span>Telefone</span><strong>{customer?.phone ?? "—"}</strong></div>
        <div><span>Endereço de entrega</span><strong>{[address.street, address.district, address.city && `${address.city}/${address.state ?? "MT"}`].filter(Boolean).join(" · ") || "—"}</strong></div>
        <div><span>Pedido(s)</span><strong>{quotes.map((quote) => `nº ${quote.quote_number}`).join(", ")}</strong></div>
      </section>

      <section className="fiscal-box fiscal-grid">
        <h3>Transporte</h3>
        <div><span>Veículo</span><strong>{load.vehicle_name_snapshot}</strong></div>
        <div><span>Placa</span><strong>{load.vehicle_plate_snapshot ?? "—"}</strong></div>
        <div><span>Motorista</span><strong>{driver}</strong></div>
        <div><span>MDF-e</span><strong>{mdfe ? `nº ${mdfe.number}` : "a emitir"}</strong></div>
        <div><span>Data de saída</span><strong>{new Date(date).toLocaleDateString("pt-BR")}</strong></div>
      </section>

      <section className="fiscal-box">
        <h3>Mercadorias desta entrega</h3>
        <table className="fiscal-items">
          <thead><tr><th>Pedido</th><th>Produto</th><th>Embalagem</th><th className="numeric">Sacas</th><th className="numeric">Peso (kg)</th><th className="numeric">Conferido</th></tr></thead>
          <tbody>
            {lines.map((line) => {
              const item = tables.quote_items.find((row) => row.id === line.quote_item_id);
              const quote = quotes.find((row) => row.id === line.quote_id);
              return <tr key={line.id}><td>{quote?.quote_number}</td><td>{item?.product_name_snapshot ?? "—"}</td><td>{line.packing === "pallet" ? "Paletizado" : "Batida (solta)"} · {formatNumber(line.weight_kg_snapshot)} kg</td><td className="numeric">{formatNumber(line.quantity)}</td><td className="numeric">{formatNumber(line.quantity * line.weight_kg_snapshot)}</td><td className="numeric">☐</td></tr>;
            })}
            <tr className="delivery-total"><td colSpan={3}>Total da entrega</td><td className="numeric">{formatNumber(bags)}</td><td className="numeric">{formatNumber(weight)}</td><td /></tr>
          </tbody>
        </table>
      </section>

      <section className="fiscal-box delivery-split">
        <div>
          <h3>Notas fiscais</h3>
          {invoices.length ? <ul>{invoices.map((item) => <li key={item.id}>NF-e nº {item.number} · {formatCurrency(item.value)}</li>)}</ul> : <p>NF-e a emitir no faturamento da carga.</p>}
        </div>
        <div>
          <h3>Cobrança</h3>
          <ul>{bills.map((bill) => <li key={bill.label}>Boleto {bill.label} · venc. {new Date(`${bill.dueDate}T12:00:00`).toLocaleDateString("pt-BR")} · {formatCurrency(bill.amount)}</li>)}</ul>
          <p><strong>Valor total: {formatCurrency(value)}</strong></p>
        </div>
      </section>

      <section className="fiscal-box">
        <h3>Comprovação da entrega (fotos)</h3>
        <div className="delivery-photos"><span>Descarga</span><span>Nota fiscal assinada</span><span>Boleto entregue</span></div>
      </section>

      <section className="fiscal-box delivery-sign">
        <p>Recebi as mercadorias acima descritas, em perfeitas condições e nas quantidades indicadas.</p>
        <div className="delivery-sign-grid">
          <div><i /><span>Assinatura do recebedor</span></div>
          <div><i /><span>Nome legível e CPF</span></div>
          <div><i /><span>Data e hora do recebimento</span></div>
        </div>
        <p className="delivery-obs">Ocorrências (avaria, falta, recusa): ________________________________________________</p>
      </section>
    </article>
  );
}
