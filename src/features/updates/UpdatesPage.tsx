import { useMemo, useState } from "react";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { Panel } from "../../components/Panel";
import { applyCatalogUpdate, type CatalogUpdatePayload } from "../../services/catalogUpdateService";
import { formatCurrency } from "../../utils/formatters";
import { extractPdfLines, PdfReadError } from "./extractPdfLines";
import { parseCatalogUpdate, type CatalogUpdateProposal, type FreightField } from "./parseCatalogUpdate";
import { Select } from "../../components/Select";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const freightFieldLabels: Record<FreightField, string> = {
  bag25: "Saca 25 kg",
  bag30: "Saca 30 kg",
  bag40: "Saca 40 kg",
  closedPerTon: "Carga fechada (R$/t)",
  fractionalPerTon: "Fracionada (R$/t)",
};

type NewProductDraft = { name: string; category: string; weight: string };

function formatValue(value: number | null) {
  return value === null ? "sem valor" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Change({ label, current, next }: { label: string; current: string; next: string }) {
  return (
    <li className="update-change">
      <span className="update-change-label">{label}</span>
      <span className="update-change-values"><s>{current}</s> <span aria-hidden="true">→</span><span className="sr-only">passa para</span> <strong>{next}</strong></span>
    </li>
  );
}

export function UpdatesPage() {
  const { data, source, loading, reload } = useCommercialData();
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [proposal, setProposal] = useState<CatalogUpdateProposal | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<NewProductDraft[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [message, setMessage] = useState("");

  const canEdit = source === "supabase" && Boolean(data.paymentTermIds);
  const categories = useMemo(() => [...new Set(data.products.map((product) => product.group))], [data.products]);

  function reset() {
    setProposal(null);
    setSelected(new Set());
    setDrafts([]);
    setFileName("");
    setReadError("");
    setApplyError("");
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    reset();
    setMessage("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setReadError("Escolha um arquivo PDF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setReadError("O arquivo passa de 15 MB. Use o PDF da tabela, sem imagens grandes.");
      return;
    }
    setFileName(file.name);
    setReading(true);
    try {
      const lines = await extractPdfLines(file);
      const result = parseCatalogUpdate(lines, data);
      setProposal(result);
      // Mudanças em itens já cadastrados vêm marcadas; produtos novos, desmarcados.
      setSelected(new Set([
        ...result.productUpdates.map((update) => `p:${update.id}`),
        ...result.discountUpdates.map((update) => `d:${update.id}`),
        ...result.freightUpdates.map((update) => `f:${update.id}`),
      ]));
      setDrafts(result.newProducts.map((product) => ({
        name: product.name,
        category: product.category ?? "",
        weight: product.weightKg === null ? "" : String(product.weightKg),
      })));
    } catch (error) {
      setReadError(error instanceof PdfReadError ? error.message : "Não foi possível ler o PDF.");
      setFileName("");
    } finally {
      setReading(false);
    }
  }

  function toggle(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function updateDraft(index: number, field: keyof NewProductDraft, value: string) {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, [field]: value } : draft));
  }

  const selectedNew = proposal ? proposal.newProducts.map((_, index) => index).filter((index) => selected.has(`n:${index}`)) : [];
  const draftProblems = selectedNew.flatMap((index) => {
    const draft = drafts[index];
    const problems = [];
    if (!draft.name.trim()) problems.push(`Produto novo ${index + 1}: informe o nome.`);
    if (!draft.category) problems.push(`${draft.name || "Produto novo"}: escolha a categoria.`);
    if (!(Number(draft.weight.replace(",", ".")) > 0)) problems.push(`${draft.name || "Produto novo"}: informe o peso da saca.`);
    return problems;
  });
  const selectedCount = selected.size;

  function buildPayload(): CatalogUpdatePayload {
    const termIds = data.paymentTermIds ?? [];
    const prices = (values: number[]) => values.map((unit_price, index) => ({ payment_term_id: termIds[index], unit_price }));
    const proposalData = proposal!;
    return {
      file_name: fileName,
      products: proposalData.productUpdates
        .filter((update) => selected.has(`p:${update.id}`))
        .map((update) => ({ id: update.id, weight: update.nextWeight, prices: prices(update.nextPrices) })),
      new_products: selectedNew.map((index) => ({
        name: drafts[index].name.trim(),
        category: drafts[index].category,
        weight: Number(drafts[index].weight.replace(",", ".")),
        prices: prices(proposalData.newProducts[index].prices),
      })),
      discounts: proposalData.discountUpdates
        .filter((update) => selected.has(`d:${update.id}`))
        .map((update) => ({ id: update.id, percentage: update.next })),
      freight: proposalData.freightUpdates
        .filter((update) => selected.has(`f:${update.id}`))
        .map((update) => {
          const rates: Record<string, number | null> = update.table === "juara"
            ? { bag25: update.nextRates.bag25 ?? null, bag30: update.nextRates.bag30 ?? null, bag40: update.nextRates.bag40 ?? null, closed_per_ton: update.nextRates.closedPerTon ?? null }
            : { fractional_per_ton: update.nextRates.fractionalPerTon ?? null, closed_per_ton: update.nextRates.closedPerTon ?? null };
          return { table: update.table, id: update.id, rates };
        }),
    };
  }

  async function apply() {
    if (applying || !proposal) return;
    setApplying(true);
    setApplyError("");
    try {
      const result = await applyCatalogUpdate(buildPayload());
      const parts = [
        result.products && `${result.products} ${result.products === 1 ? "produto atualizado" : "produtos atualizados"}`,
        result.new_products && `${result.new_products} ${result.new_products === 1 ? "produto cadastrado" : "produtos cadastrados"}`,
        result.discounts && `${result.discounts} ${result.discounts === 1 ? "desconto atualizado" : "descontos atualizados"}`,
        result.freight && `${result.freight} ${result.freight === 1 ? "frete atualizado" : "fretes atualizados"}`,
      ].filter(Boolean);
      setConfirming(false);
      reset();
      setMessage(`Atualização aplicada: ${parts.join(", ")}. A Calculadora já usa os novos valores.`);
      reload();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Não foi possível aplicar a atualização. Nada foi alterado.");
    } finally {
      setApplying(false);
    }
  }

  if (!canEdit) {
    return (
      <Panel title="Atualizar tabelas por PDF">
        <p className="warning-message">{loading ? "Carregando os dados do sistema…" : "As atualizações ficam disponíveis quando o sistema está conectado ao servidor. Use “Tentar novamente” no topo da página."}</p>
      </Panel>
    );
  }

  const hasChanges = proposal && (proposal.productUpdates.length + proposal.newProducts.length + proposal.discountUpdates.length + proposal.freightUpdates.length) > 0;

  return (
    <>
      {message && <p className="form-message page-notice" role="status">{message}</p>}

      <Panel
        title="Atualizar tabelas por PDF"
        description="Envie o PDF com a tabela de preços, descontos ou frete. O sistema compara com os valores cadastrados e mostra o que mudou. Nada é gravado sem a sua confirmação."
      >
        <label className={`file-drop${reading ? " is-busy" : ""}`} htmlFor="updateFile">
          <input id="updateFile" type="file" accept="application/pdf,.pdf" disabled={reading} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />
          <strong>{reading ? "Lendo o PDF…" : fileName ? `Arquivo: ${fileName}` : "Escolher arquivo PDF"}</strong>
          <span>{fileName && !reading ? "Clique para escolher outro arquivo." : "PDF gerado por computador, até 15 MB."}</span>
        </label>
        {readError && <p className="auth-error" role="alert">{readError}</p>}
      </Panel>

      {proposal && (
        <>
          <dl className="kpi-row update-summary">
            <div className="kpi-tile"><dt>Com valores novos</dt><dd>{proposal.productUpdates.length + proposal.discountUpdates.length + proposal.freightUpdates.length}</dd></div>
            <div className="kpi-tile"><dt>Produtos novos no PDF</dt><dd>{proposal.newProducts.length}</dd></div>
            <div className="kpi-tile"><dt>Iguais ao sistema</dt><dd>{proposal.unchanged.products + proposal.unchanged.discounts + proposal.unchanged.freight}</dd></div>
          </dl>

          {!hasChanges && (
            <Panel>
              <div className="empty-items report-empty">
                <p><strong>Nenhuma mudança encontrada.</strong></p>
                <p>Os itens reconhecidos no PDF já estão com os mesmos valores do sistema. Confira abaixo as linhas que o sistema não entendeu.</p>
              </div>
            </Panel>
          )}

          {proposal.productUpdates.length > 0 && (
            <Panel title="Produtos com preço novo" description="Marcados para atualizar. Desmarque o que não quiser alterar.">
              <ul className="update-list">
                {proposal.productUpdates.map((update) => (
                  <li key={update.id} className="update-item">
                    <label className="update-check">
                      <input type="checkbox" checked={selected.has(`p:${update.id}`)} onChange={(event) => toggle(`p:${update.id}`, event.target.checked)} />
                      <span><strong>{update.name}</strong><small>{update.group}</small></span>
                    </label>
                    <ul className="update-changes">
                      {update.weight && <Change label="Peso da saca" current={`${update.weight.current} kg`} next={`${update.weight.next} kg`} />}
                      {update.prices.map((change) => (
                        <Change key={change.termIndex} label={data.paymentTermLabels[change.termIndex]} current={formatCurrency(change.current)} next={formatCurrency(change.next)} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {proposal.newProducts.length > 0 && (
            <Panel title="Produtos novos no PDF" description="Não existem no sistema. Marque os que devem ser cadastrados e confira nome, categoria e peso.">
              <ul className="update-list">
                {proposal.newProducts.map((product, index) => (
                  <li key={product.line} className="update-item">
                    <label className="update-check">
                      <input type="checkbox" checked={selected.has(`n:${index}`)} onChange={(event) => toggle(`n:${index}`, event.target.checked)} />
                      <span><strong>{drafts[index]?.name || product.name}</strong><small>Cadastrar como produto novo</small></span>
                    </label>
                    {selected.has(`n:${index}`) && (
                      <div className="form-grid compact update-new-fields">
                        <div className="field">
                          <label htmlFor={`newName${index}`}>Nome</label>
                          <input id={`newName${index}`} maxLength={120} value={drafts[index]?.name ?? ""} onChange={(event) => updateDraft(index, "name", event.target.value)} />
                        </div>
                        <div className="field">
                          <label htmlFor={`newCategory${index}`}>Categoria</label>
                          <Select
                            id={`newCategory${index}`}
                            value={drafts[index]?.category ?? ""}
                            onChange={(value) => updateDraft(index, "category", value)}
                            options={[{ value: "", label: "Escolha a categoria" }, ...categories.map((category) => ({ value: category, label: category }))]}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`newWeight${index}`}>Peso da saca</label>
                          <div className="input-affix">
                            <input id={`newWeight${index}`} type="number" min="1" step="0.001" inputMode="decimal" value={drafts[index]?.weight ?? ""} onChange={(event) => updateDraft(index, "weight", event.target.value)} />
                            <span aria-hidden="true">kg</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <ul className="update-changes">
                      {product.prices.map((price, termIndex) => (
                        <li key={termIndex} className="update-change">
                          <span className="update-change-label">{data.paymentTermLabels[termIndex]}</span>
                          <span className="update-change-values"><strong>{formatCurrency(price)}</strong></span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {proposal.discountUpdates.length > 0 && (
            <Panel title="Descontos com percentual novo">
              <ul className="update-list">
                {proposal.discountUpdates.map((update) => (
                  <li key={update.id} className="update-item">
                    <label className="update-check">
                      <input type="checkbox" checked={selected.has(`d:${update.id}`)} onChange={(event) => toggle(`d:${update.id}`, event.target.checked)} />
                      <span><strong>{update.name}</strong></span>
                    </label>
                    <ul className="update-changes">
                      <Change label="Desconto" current={`${formatValue(update.current)}%`} next={`${formatValue(update.next)}%`} />
                    </ul>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {proposal.freightUpdates.length > 0 && (
            <Panel title="Fretes com valores novos">
              <ul className="update-list">
                {proposal.freightUpdates.map((update) => (
                  <li key={update.id} className="update-item">
                    <label className="update-check">
                      <input type="checkbox" checked={selected.has(`f:${update.id}`)} onChange={(event) => toggle(`f:${update.id}`, event.target.checked)} />
                      <span><strong>{update.label}</strong><small>{update.table === "juara" ? "Juara, por distância" : "Regional, por cidade"}</small></span>
                    </label>
                    <ul className="update-changes">
                      {update.changes.map((change) => (
                        <Change key={change.field} label={freightFieldLabels[change.field]} current={formatValue(change.current)} next={formatValue(change.next)} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {proposal.missingProducts.length > 0 && (
            <Panel title="Cadastrados que não aparecem no PDF" description="Apenas um aviso: estes produtos continuam como estão. Se algum saiu de linha, exclua pela página Produtos.">
              <details className="update-details">
                <summary>Ver {proposal.missingProducts.length} {proposal.missingProducts.length === 1 ? "produto" : "produtos"}</summary>
                <ul className="note-list">
                  {proposal.missingProducts.map((product) => <li key={product.id}>{product.name} <span className="muted-cell">({product.group})</span></li>)}
                </ul>
              </details>
            </Panel>
          )}

          {proposal.unrecognizedLines.length > 0 && (
            <Panel title="Linhas não entendidas" description="Trechos do PDF com números que o sistema não conseguiu associar a nenhum produto, desconto ou frete. Confira se algo importante ficou de fora.">
              <details className="update-details">
                <summary>Ver {proposal.unrecognizedLines.length} {proposal.unrecognizedLines.length === 1 ? "linha" : "linhas"}</summary>
                <ul className="update-raw-lines">
                  {proposal.unrecognizedLines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                </ul>
              </details>
            </Panel>
          )}

          {hasChanges && (
            <div className="update-actions">
              {draftProblems.length > 0 && <p className="field-error" role="alert">{draftProblems[0]}</p>}
              <button type="button" className="secondary-button" onClick={() => setConfirmDiscard(true)}>Descartar</button>
              <button type="button" className="primary-button" disabled={selectedCount === 0 || draftProblems.length > 0} onClick={() => { setApplyError(""); setConfirming(true); }}>
                Aplicar {selectedCount} {selectedCount === 1 ? "alteração" : "alterações"}
              </button>
            </div>
          )}
        </>
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title="Descartar a leitura do PDF?"
          description="As seleções e os ajustes feitos nesta tela serão perdidos. Nada foi gravado ainda."
          confirmLabel="Descartar"
          cancelLabel="Voltar"
          danger
          onConfirm={async () => { setConfirmDiscard(false); reset(); }}
          onClose={() => setConfirmDiscard(false)}
        />
      )}
      {confirming && proposal && (
        <Dialog
          title={`Aplicar ${selectedCount} ${selectedCount === 1 ? "alteração" : "alterações"}?`}
          description="Os novos valores passam a valer na hora para todos os usuários. Orçamentos já salvos não mudam. Tudo é gravado de uma vez: se algo der errado, nada é alterado."
          size="small"
          onClose={() => { if (!applying) setConfirming(false); }}
        >
          {applyError && <p className="auth-error" role="alert">{applyError}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={applying} onClick={() => setConfirming(false)}>Voltar</button>
            <button type="button" className="primary-button" disabled={applying} onClick={() => void apply()}>{applying ? "Aplicando…" : "Aplicar atualização"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
