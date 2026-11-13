import logoUrl from "../../../assets/qualinutri-logo.png";
import type { DemoTables } from "../../../demo/store/types";
import type { LoadStatus } from "../../../services/loadService";
import type { Packing } from "../../../domain/loads/summarizeLoad";
import { formatDate, formatKg, formatPlate, loadStatusLabels, packingLabels } from "../../../features/loads/loadModel";
import { formatNumber } from "../../../utils/formatters";

/** Mesma página do romaneio original (mesmas classes .quote-doc .load-doc), para ver na tela. */
export function RomaneioDocument({ tables, loadId }: { tables: DemoTables; loadId: string }) {
  const load = tables.loads.find((item) => item.id === loadId);
  if (!load) return null;
  const items = tables.load_items.filter((item) => item.load_id === loadId).sort((a, b) => a.stop_order - b.stop_order);
  const stops: { order: number; items: typeof items }[] = [];
  for (const item of items) {
    const last = stops.at(-1);
    if (last && last.order === item.stop_order) last.items.push(item);
    else stops.push({ order: item.stop_order, items: [item] });
  }
  const totalBags = items.reduce((total, item) => total + item.quantity, 0);
  const quoteOf = (id: string) => tables.quotes.find((quote) => quote.id === id);

  return (
    <article className="quote-doc load-doc">
      <header className="quote-doc-header">
        <img src={logoUrl} alt="Qualinutri Nutrição Animal" />
        <div className="quote-doc-number">
          <span>Romaneio de carga</span>
          <strong>nº {load.load_number}</strong>
          <span>{loadStatusLabels[load.status as LoadStatus] ?? load.status}</span>
        </div>
      </header>
      <dl className="quote-doc-conditions load-doc-facts">
        <div><dt>Veículo</dt><dd>{[load.vehicle_name_snapshot, formatPlate(load.vehicle_plate_snapshot)].filter(Boolean).join(" · ")}</dd></div>
        <div><dt>Saída prevista</dt><dd>{formatDate(load.planned_date) ?? "Não informada"}</dd></div>
        <div><dt>Peso total</dt><dd>{formatKg(Number(load.total_weight_kg))} de {formatKg(Number(load.capacity_kg_snapshot))}</dd></div>
        <div><dt>Volumes</dt><dd>{formatNumber(totalBags)} sacas{load.pallet_count > 0 ? `, ${formatNumber(load.pallet_count)} paletes` : ""}</dd></div>
      </dl>
      {load.notes && <p className="load-doc-notes"><strong>Observações:</strong> {load.notes}</p>}
      {stops.map((stop, index) => {
        const quote = quoteOf(stop.items[0].quote_id);
        const customer = quote?.customer_id ? tables.customers.find((row) => row.id === quote.customer_id) : undefined;
        const address = customer?.address && typeof customer.address === "object" && !Array.isArray(customer.address) ? customer.address as Record<string, string | null> : {};
        const place = [address.street, [address.city, address.state].filter(Boolean).join("/"), customer?.phone].filter(Boolean).join(" · ");
        const weight = stop.items.reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0);
        return (
          <section key={stop.order} className="load-doc-stop">
            <h2><span>{index + 1}ª entrega</span> {quote?.customer_name_snapshot || "Sem cliente vinculado"}<span className="load-doc-stop-weight">{formatKg(weight)}</span></h2>
            {place && <p className="quote-doc-sub">{place}</p>}
            <table className="quote-doc-items">
              <thead><tr><th scope="col">Pedido</th><th scope="col">Produto</th><th scope="col">Carga</th><th scope="col" className="numeric">Sacas</th><th scope="col" className="numeric">Peso</th><th scope="col" className="numeric">Conferido</th></tr></thead>
              <tbody>
                {stop.items.map((item) => (
                  <tr key={item.id}>
                    <td>#{quoteOf(item.quote_id)?.quote_number}</td>
                    <td><span className="quote-doc-strong">{tables.quote_items.find((row) => row.id === item.quote_item_id)?.product_name_snapshot}</span><span className="quote-doc-sub">saca de {formatNumber(item.weight_kg_snapshot)} kg</span></td>
                    <td>{packingLabels[item.packing as Packing] ?? item.packing}</td>
                    <td className="numeric quote-doc-strong">{formatNumber(item.quantity)}</td>
                    <td className="numeric">{formatKg(item.quantity * item.weight_kg_snapshot)}</td>
                    <td className="numeric load-doc-check" aria-label="Conferido">☐</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <footer className="load-doc-signatures">
        <div><span>Conferente</span></div>
        <div><span>Motorista</span></div>
        <div><span>Data e hora da saída</span></div>
      </footer>
    </article>
  );
}
