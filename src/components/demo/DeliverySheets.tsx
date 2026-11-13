import { useState } from "react";
import { Printer } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { DocViewer } from "./docs/DocViewer";
import { DeliveryDocument, deliveryStops } from "./docs/DeliveryDocument";
import { RomaneioDocument } from "./docs/RomaneioDocument";

export type LoadDocChoice = "romaneio" | "fichas";

/**
 * Documentos da carga na tela: o romaneio (carga inteira, para conferir na saída) e as
 * fichas de entrega (uma por cliente, para assinar na entrega). "Imprimir / PDF" usa a
 * impressão do navegador, onde dá para escolher "Salvar como PDF".
 */
export function DeliverySheets({ loadId, initial = "fichas", onClose }: { loadId: string; initial?: LoadDocChoice; onClose: () => void }) {
  const tables = useDemoTables();
  const stops = deliveryStops(tables, loadId);
  const [selected, setSelected] = useState<string>(initial === "romaneio" ? "romaneio" : stops[0]?.key ?? "all");
  const load = tables.loads.find((item) => item.id === loadId);
  if (!load) return null;
  const romaneio = selected === "romaneio";
  const shown = selected === "all" ? stops : stops.filter((stop) => stop.key === selected);

  function print() {
    const previous = document.title;
    const who = romaneio ? "Romaneio" : selected === "all" ? "Fichas-de-entrega" : `Ficha-de-entrega-${shown[0]?.customer ?? ""}`;
    document.title = `${who}-carga-${load!.load_number}`.replace(/\s+/g, "-");
    window.addEventListener("afterprint", () => { document.title = previous; }, { once: true });
    window.print();
  }

  return (
    <DocViewer
      title={`${romaneio ? "Romaneio" : "Ficha de entrega"} · Carga #${load.load_number}`}
      subtitle={`${stops.length} ${stops.length === 1 ? "cliente" : "clientes"} · ${load.vehicle_name_snapshot}`}
      onClose={onClose}
      actions={(
        <div className="doc-viewer-actions">
          <select className="delivery-select" value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Documento">
            <option value="romaneio">Romaneio (carga inteira)</option>
            <optgroup label="Fichas de entrega">
              {stops.map((stop) => <option key={stop.key} value={stop.key}>{stop.stop}. {stop.customer}</option>)}
              {stops.length > 1 && <option value="all">Todas as fichas ({stops.length})</option>}
            </optgroup>
          </select>
          <button type="button" className="primary-button compact-button" onClick={print}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir / PDF</button>
        </div>
      )}
    >
      {romaneio ? <RomaneioDocument tables={tables} loadId={loadId} /> : shown.map((stop) => <DeliveryDocument key={stop.key} tables={tables} loadId={loadId} stop={stop} total={stops} />)}
    </DocViewer>
  );
}
