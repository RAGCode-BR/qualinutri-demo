import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import logoUrl from "../../assets/qualinutri-logo.png";
import type { LoadDetail, LoadDetailItem, LoadStatus } from "../../services/loadService";
import { formatNumber } from "../../utils/formatters";
import { sourceField } from "../customers/customerSourceFields";
import { formatDate, formatKg, formatPlate, loadStatusLabels, packingLabels } from "./loadModel";

type Stop = { order: number; items: LoadDetailItem[] };

function customerPlace(item: LoadDetailItem) {
  const customer = item.quotes?.customers;
  const address = customer?.address ?? null;
  const city = [sourceField(address, "city"), sourceField(address, "state")].filter(Boolean).join("/");
  return [sourceField(address, "street"), city, customer?.phone].filter(Boolean).join(" · ");
}

/**
 * Romaneio da carga para A4, no mesmo esquema do PDF de orçamento: monta fora
 * da árvore do app e abre a janela de impressão ("Salvar como PDF").
 */
export function LoadPrint({ detail, onDone }: { detail: LoadDetail; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { load, items } = detail;

  useEffect(() => {
    const previousTitle = document.title;
    let active = true;
    const restore = () => {
      active = false;
      document.title = previousTitle;
      document.body.classList.remove("is-printing");
      window.removeEventListener("afterprint", handleAfterPrint);
    };
    function handleAfterPrint() {
      restore();
      onDone();
    }

    document.title = `Romaneio-carga-${load.load_number}`;
    document.body.classList.add("is-printing");
    window.addEventListener("afterprint", handleAfterPrint);

    const images = Array.from(rootRef.current?.querySelectorAll("img") ?? []);
    Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => {
      if (active) window.print();
    });

    return restore;
    // Imprime uma vez por carga aberta.
  }, [load.id]);

  const stops: Stop[] = [];
  for (const item of items) {
    const last = stops.at(-1);
    if (last && last.order === item.stop_order) last.items.push(item);
    else stops.push({ order: item.stop_order, items: [item] });
  }
  const totalBags = items.reduce((total, item) => total + item.quantity, 0);

  return createPortal(
    <div className="print-root" ref={rootRef}>
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
          const first = stop.items[0];
          const weight = stop.items.reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0);
          const place = customerPlace(first);
          return (
            <section key={stop.order} className="load-doc-stop">
              <h2>
                <span>{index + 1}ª entrega</span> {first.quotes?.customer_name_snapshot || "Sem cliente vinculado"}
                <span className="load-doc-stop-weight">{formatKg(weight)}</span>
              </h2>
              {place && <p className="quote-doc-sub">{place}</p>}
              <table className="quote-doc-items">
                <thead>
                  <tr>
                    <th scope="col">Pedido</th>
                    <th scope="col">Produto</th>
                    <th scope="col">Carga</th>
                    <th scope="col" className="numeric">Sacas</th>
                    <th scope="col" className="numeric">Peso</th>
                    <th scope="col" className="numeric">Conferido</th>
                  </tr>
                </thead>
                <tbody>
                  {stop.items.map((item) => (
                    <tr key={item.id}>
                      <td>#{item.quotes?.quote_number}</td>
                      <td>
                        <span className="quote-doc-strong">{item.quote_items?.product_name_snapshot}</span>
                        <span className="quote-doc-sub">saca de {formatNumber(item.weight_kg_snapshot)} kg</span>
                      </td>
                      <td>{packingLabels[item.packing]}</td>
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
    </div>,
    document.body,
  );
}
