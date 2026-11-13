import { useEffect, useRef, useState } from "react";
import { Boxes, CheckCircle2, ClipboardSignature, Expand, FileText, PencilLine, X } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { presetForLoad } from "../../demo/kpis/yard";
import { editButtonOf } from "./RowClickToEdit";
import { RowActionMenu, type RowAction } from "./RowActionMenu";
import { DeliverySheets, type LoadDocChoice } from "./DeliverySheets";

/** Janela grande com a carga montada no caminhão em 3D. */
export function LoadViewer3D({ loadId, onClose }: { loadId: string; onClose: () => void }) {
  const tables = useDemoTables();
  const ref = useRef<HTMLDialogElement>(null);
  const load = tables.loads.find((item) => item.id === loadId);
  const preset = presetForLoad(tables, loadId);
  const src = `/patio-de-carga.html${preset ? `#${encodeURIComponent(JSON.stringify(preset))}` : ""}`;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  if (!load) return null;
  const customers = [...new Set(tables.load_items.filter((item) => item.load_id === loadId).map((item) => tables.quotes.find((quote) => quote.id === item.quote_id)?.customer_name_snapshot ?? "Sem cliente"))];
  const fill = Math.round((load.total_weight_kg / load.capacity_kg_snapshot) * 100);

  return (
    <dialog ref={ref} className="sheet sheet-3d" aria-label={`Carga ${load.load_number} em 3D`} onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="sheet-inner sheet-3d-inner">
        <header className="sheet-3d-head">
          <span className="doc-icon"><Boxes size={22} aria-hidden="true" /></span>
          <div>
            <p className="drawer-kicker">Carga montada · visualização 3D</p>
            <h2>Carga #{load.load_number} · {load.vehicle_name_snapshot}</h2>
            <small>{(load.total_weight_kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} t de {(load.capacity_kg_snapshot / 1000).toLocaleString("pt-BR")} t ({fill}%) · {load.pallet_count} paletes · {customers.length} {customers.length === 1 ? "entrega" : "entregas"}: {customers.join(", ")}</small>
          </div>
          <button type="button" className="secondary-button compact-secondary" onClick={() => window.open(src, "_blank", "noopener")}><Expand size={15} aria-hidden="true" />&nbsp;Tela cheia</button>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
        </header>
        <iframe title={`Carga ${load.load_number} em 3D`} src={src} />
      </div>
    </dialog>
  );
}

/** Na tela Logística: clique na linha abre um menu (editar, ver em 3D, romaneio); ao salvar uma carga, oferece ver em 3D. */
export function LoadsRowOpener() {
  const tables = useDemoTables();
  const [openId, setOpenId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; number: number } | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; row: Element } | null>(null);
  const [sheets, setSheets] = useState<{ id: string; initial: LoadDocChoice } | null>(null);
  const seen = useRef<Map<string, string> | null>(null);

  // Detecta carga criada ou alterada depois que a tela abriu.
  useEffect(() => {
    const current = new Map(tables.loads.map((load) => [load.id, load.updated_at]));
    if (seen.current) {
      const changed = tables.loads.find((load) => load.status === "planned" && seen.current!.get(load.id) !== load.updated_at);
      if (changed) setSaved({ id: changed.id, number: changed.load_number });
    }
    seen.current = current;
  }, [tables]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    const main = document.querySelector("main.page-loads");
    if (!main) return;
    const loadOf = (row: Element) => {
      const match = row.querySelector("td")?.textContent?.match(/#(\d+)/);
      return match ? tables.loads.find((item) => item.load_number === Number(match[1])) : undefined;
    };
    // Botão "Romaneio" da linha: abre o romaneio na tela (de lá, imprimir ou salvar em PDF).
    const onRomaneio = (event: Event) => {
      const button = (event.target as HTMLElement).closest("button");
      const row = button?.closest("tbody tr");
      if (!button || !row || !main.contains(row) || !button.textContent?.trim().startsWith("Romaneio")) return;
      const load = loadOf(row);
      if (!load) return;
      event.preventDefault();
      event.stopPropagation();
      setSheets({ id: load.id, initial: "romaneio" });
    };
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea, label, dialog, [role='listbox'], [role='option']")) return;
      const row = target.closest("tbody tr");
      if (!row || !main.contains(row)) return;
      const load = loadOf(row);
      if (!load || window.getSelection()?.toString()) return;
      const mouse = event as MouseEvent;
      setMenu({ id: load.id, x: mouse.clientX, y: mouse.clientY, row });
    };
    main.addEventListener("click", onRomaneio, true);
    main.addEventListener("click", onClick);
    return () => { main.removeEventListener("click", onRomaneio, true); main.removeEventListener("click", onClick); };
  }, [tables]);

  const menuLoad = menu ? tables.loads.find((item) => item.id === menu.id) : undefined;
  const menuActions: RowAction[] = [];
  if (menu && menuLoad) {
    const edit = editButtonOf(menu.row);
    const print = menuLoad.status !== "cancelled";
    if (edit) menuActions.push({ id: "edit", label: "Editar carga", hint: "Pedidos, ordem de entrega e veículo", icon: <PencilLine size={16} aria-hidden="true" />, primary: true, onSelect: () => edit.click() });
    menuActions.push({ id: "3d", label: "Ver em 3D", hint: "Como a carga fica no caminhão", icon: <Boxes size={16} aria-hidden="true" />, primary: !edit, onSelect: () => setOpenId(menuLoad.id) });
    menuActions.push({ id: "sheets", label: "Fichas de entrega", hint: "Uma por cliente, com assinatura e fotos", icon: <ClipboardSignature size={16} aria-hidden="true" />, onSelect: () => setSheets({ id: menuLoad.id, initial: "fichas" }) });
    if (print) menuActions.push({ id: "print", label: "Romaneio", hint: "Lista da carga inteira para conferir na saída", icon: <FileText size={16} aria-hidden="true" />, onSelect: () => setSheets({ id: menuLoad.id, initial: "romaneio" }) });
  }

  return (
    <>
      {menu && menuLoad && <RowActionMenu x={menu.x} y={menu.y} title={`Carga #${menuLoad.load_number}`} actions={menuActions} onClose={() => setMenu(null)} />}
      {saved && !openId && (
        <div className="load-saved-toast glass-dark" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span><strong>Carga #{saved.number} salva</strong><small>Confira como ela fica no caminhão</small></span>
          <button type="button" className="primary-button compact-button" onClick={() => { setOpenId(saved.id); setSaved(null); }}><Boxes size={15} aria-hidden="true" />&nbsp;Ver em 3D</button>
          <button type="button" className="drawer-close" onClick={() => setSaved(null)} aria-label="Fechar aviso"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      {sheets && <DeliverySheets key={`${sheets.id}-${sheets.initial}`} loadId={sheets.id} initial={sheets.initial} onClose={() => setSheets(null)} />}
      {openId && <LoadViewer3D loadId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
