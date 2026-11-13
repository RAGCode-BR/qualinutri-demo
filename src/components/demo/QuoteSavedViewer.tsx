import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ListChecks, Plus, Printer } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { useNavigate } from "../../app/NavigationContext";
import { DocViewer } from "./docs/DocViewer";
import { QuoteDocument } from "./docs/QuoteDocument";

/**
 * Depois de salvar um orçamento (tela Novo orçamento), abre o PDF na tela com as opções:
 * baixar / imprimir, começar um novo orçamento ou ir para a lista de Orçamentos.
 * A tela original não muda: o salvamento é percebido pela mudança na tabela de orçamentos.
 */
export function QuoteSavedViewer({ active }: { active: boolean }) {
  const tables = useDemoTables();
  const navigate = useNavigate();
  const [savedId, setSavedId] = useState<string | null>(null);
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const current = new Map(tables.quotes.map((quote) => [quote.id, quote.updated_at]));
    if (seen.current && active) {
      const changed = tables.quotes
        .filter((quote) => seen.current!.get(quote.id) !== quote.updated_at)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      if (changed) setSavedId(changed.id);
    }
    seen.current = current;
  }, [tables, active]);

  const quote = savedId ? tables.quotes.find((item) => item.id === savedId) : undefined;
  if (!quote) return null;
  const close = () => setSavedId(null);

  function print() {
    const previous = document.title;
    document.title = `Orcamento-${quote!.quote_number}`;
    window.addEventListener("afterprint", () => { document.title = previous; }, { once: true });
    window.print();
  }

  return (
    <DocViewer
      title={`Orçamento nº ${quote.quote_number} salvo`}
      subtitle={quote.customer_name_snapshot ?? "Sem cliente"}
      onClose={close}
      actions={(
        <div className="doc-viewer-actions">
          <span className="saved-badge"><CheckCircle2 size={15} aria-hidden="true" /> Salvo</span>
          <button type="button" className="secondary-button compact-secondary" onClick={() => { close(); navigate("quotes"); }}><ListChecks size={15} aria-hidden="true" />&nbsp;Ir para Orçamentos</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => { close(); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Plus size={15} aria-hidden="true" />&nbsp;Novo orçamento</button>
          <button type="button" className="primary-button compact-button" onClick={print}><Printer size={15} aria-hidden="true" />&nbsp;Baixar / imprimir PDF</button>
        </div>
      )}
    >
      <QuoteDocument tables={tables} quoteId={quote.id} />
    </DocViewer>
  );
}
