import { useEffect, useState } from "react";
import { Copy, FileText, Printer, PencilLine } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { DocViewer } from "./docs/DocViewer";
import { QuoteDocument } from "./docs/QuoteDocument";
import { RowActionMenu, type RowAction } from "./RowActionMenu";

/** Botão da própria linha da tela Orçamentos (mesma ação, mesma regra). */
function rowButton(quoteNumber: number, action: "Editar" | "Duplicar" | "Exportar") {
  const rows = document.querySelectorAll<HTMLTableRowElement>("main.page-quotes tbody tr");
  for (const row of rows) {
    if (!row.textContent?.includes(`#${quoteNumber}`)) continue;
    return [...row.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim().startsWith(action) && button.textContent.includes(`orçamento ${quoteNumber}`)) ?? null;
  }
  return null;
}

/** Quando verdadeiro, o clique em "Exportar" segue o fluxo original (impressão / salvar PDF). */
let bypassExport = false;

/**
 * Tela Orçamentos:
 * - clique na linha: abre um menu para escolher entre editar na Calculadora (botão "Editar"
 *   da própria linha), ver o PDF na tela ou duplicar;
 * - botão "Exportar": abre o PDF na tela; de lá, "Baixar / imprimir" segue o fluxo original.
 * A tela original não é alterada: tudo aciona os botões da própria linha.
 */
export function QuoteRowOpener() {
  const tables = useDemoTables();
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const main = document.querySelector("main.page-quotes");
    if (!main) return;
    const quoteOf = (row: Element | null) => {
      const match = row?.textContent?.match(/#(\d+)/);
      return match ? tables.quotes.find((item) => item.quote_number === Number(match[1])) : undefined;
    };
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const button = target.closest("button");
      const row = target.closest("tbody tr");
      if (!row || !main.contains(row)) return;
      if (button) {
        if (!bypassExport && button.textContent?.trim().startsWith("Exportar")) {
          event.preventDefault();
          event.stopPropagation();
          const quote = quoteOf(row);
          if (quote) setOpenId(quote.id);
        }
        return;
      }
      if (target.closest("a, input, select, textarea, label, [role='listbox'], [role='option']")) return;
      const quote = quoteOf(row);
      if (!quote) return;
      if (window.getSelection()?.toString()) return;
      const mouse = event as MouseEvent;
      setMenu({ id: quote.id, x: mouse.clientX, y: mouse.clientY });
    };
    main.addEventListener("click", onClick, true);
    return () => main.removeEventListener("click", onClick, true);
  }, [tables]);

  const run = (quoteNumber: number, action: "Editar" | "Duplicar" | "Exportar") => {
    const button = rowButton(quoteNumber, action);
    setOpenId(null);
    if (!button) return;
    bypassExport = action === "Exportar";
    try { button.click(); } finally { bypassExport = false; }
  };

  if (menu) {
    const item = tables.quotes.find((row) => row.id === menu.id);
    if (!item) return null;
    const editable = !!rowButton(item.quote_number, "Editar");
    const actions: RowAction[] = [
      ...(editable ? [{ id: "edit", label: "Editar orçamento", hint: "Abre na Calculadora", icon: <PencilLine size={16} aria-hidden="true" />, primary: true, onSelect: () => run(item.quote_number, "Editar") }] : []),
      { id: "pdf", label: "Ver PDF", hint: "Visualizar na tela, baixar ou imprimir", icon: <FileText size={16} aria-hidden="true" />, primary: !editable, onSelect: () => setOpenId(item.id) },
      ...(rowButton(item.quote_number, "Duplicar") ? [{ id: "dup", label: "Duplicar", hint: "Novo orçamento a partir deste", icon: <Copy size={16} aria-hidden="true" />, onSelect: () => run(item.quote_number, "Duplicar") }] : []),
    ];
    return <RowActionMenu x={menu.x} y={menu.y} title={`Orçamento nº ${item.quote_number}${editable ? "" : " · não editável"}`} actions={actions} onClose={() => setMenu(null)} />;
  }

  if (!openId) return null;
  const quote = tables.quotes.find((item) => item.id === openId);
  if (!quote) return null;
  const canEdit = !!rowButton(quote.quote_number, "Editar");
  const canExport = !!rowButton(quote.quote_number, "Exportar");

  const status: Record<string, string> = { draft: "Rascunho", issued: "Enviado", approved: "Aprovado", cancelled: "Cancelado" };
  return (
    <DocViewer
      title={`Orçamento nº ${quote.quote_number}`}
      subtitle={`${quote.customer_name_snapshot ?? "Sem cliente"} · ${status[quote.status] ?? quote.status}`}
      onClose={() => setOpenId(null)}
      actions={(
        <div className="doc-viewer-actions">
          <button type="button" className="secondary-button compact-secondary" onClick={() => run(quote.quote_number, "Duplicar")}><Copy size={15} aria-hidden="true" />&nbsp;Duplicar</button>
          {canEdit && <button type="button" className="secondary-button compact-secondary" onClick={() => run(quote.quote_number, "Editar")}><PencilLine size={15} aria-hidden="true" />&nbsp;Editar</button>}
          {canExport && <button type="button" className="primary-button compact-button" onClick={() => run(quote.quote_number, "Exportar")}><Printer size={15} aria-hidden="true" />&nbsp;Baixar / imprimir PDF</button>}
        </div>
      )}
    >
      <QuoteDocument tables={tables} quoteId={openId} />
    </DocViewer>
  );
}
