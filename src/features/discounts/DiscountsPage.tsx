import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { deactivateDiscountRule, saveDiscountRule } from "../../services/discountService";
import type { DiscountLine } from "../../types/commercial";

type EditableLine = DiscountLine & { id: string; percentage: number };

/** null: janela fechada; "new": nova linha; EditableLine: edição. */
type FormTarget = null | "new" | EditableLine;

function DiscountFormDialog({ line, onClose, onSaved }: { line?: EditableLine; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(line?.name ?? "");
  const [percentage, setPercentage] = useState(line ? String(line.percentage) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const value = Number.parseFloat(percentage.replace(",", "."));
    if (!name.trim()) return setError("Informe a descrição da linha.");
    if (Number.isNaN(value) || value < 0 || value > 100) return setError("O desconto deve estar entre 0% e 100%.");
    setSaving(true);
    setError("");
    try {
      await saveDiscountRule(line?.id ?? null, name.trim(), value);
      onSaved(line ? `${name.trim()} foi atualizada.` : `${name.trim()} foi criada.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a linha de desconto.");
      setSaving(false);
    }
  }

  return (
    <Dialog title={line ? "Editar linha de desconto" : "Nova linha de desconto"} size="small" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="discountName">Descrição</label>
          <input id="discountName" required maxLength={120} placeholder="Ex.: Linha Adense" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="discountPercentage">Desconto</label>
          <div className="input-affix">
            <input id="discountPercentage" type="number" required min="0" max="100" step="0.01" inputMode="decimal" value={percentage} onChange={(event) => setPercentage(event.target.value)} />
            <span aria-hidden="true">%</span>
          </div>
        </div>
        <p className="field-hint">Vale para novos itens na Calculadora. Orçamentos já salvos não mudam.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : line ? "Salvar alterações" : "Criar linha"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function DiscountsPage() {
  const { profile } = useAuth();
  const { data: { discountLines }, source, loading, reload } = useCommercialData();
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [deleting, setDeleting] = useState<EditableLine | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = profile?.role === "administrador";
  const canEdit = isAdmin && source === "supabase";
  const lines = discountLines.filter((line): line is DiscountLine & { percentage: number } => line.percentage !== null);

  function asEditable(line: DiscountLine & { percentage: number }) {
    return line.id ? line as EditableLine : null;
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await deactivateDiscountRule(deleting.id);
      setMessage(`${deleting.name} foi excluída.`);
      setDeleting(null);
      reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir a linha de desconto.");
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <>
      {isAdmin && !canEdit && !loading && (
        <p className="warning-message page-notice">A edição de descontos fica disponível quando o sistema está conectado ao servidor. Use “Tentar novamente” no topo da página.</p>
      )}
      {message && <p className="form-message page-notice" role="status">{message}</p>}

      <div className="page-columns">
        <Panel
          title="Desconto por linha de produto"
          description="Percentual aplicado sobre o preço de tabela."
          actions={canEdit && (
            <button type="button" className="primary-button compact-button" onClick={() => { setMessage(""); setFormTarget("new"); }}>
              Nova linha
            </button>
          )}
          flush
        >
          {lines.length === 0 ? (
            <EmptyState title="Nenhuma linha de desconto cadastrada.">{canEdit ? "Clique em “Nova linha” para cadastrar." : null}</EmptyState>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Linha ou produto</th>
                  <th scope="col" className="numeric">Desconto</th>
                  {canEdit && <th scope="col"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const editable = asEditable(line);
                  return (
                    <tr key={line.id ?? line.name}>
                      <td>{line.name}</td>
                      <td className="numeric"><span className="value-badge">{String(line.percentage).replace(".", ",")}%</span></td>
                      {canEdit && (
                        <td className="action-cell">
                          {editable && <>
                            <button type="button" className="row-button" onClick={() => { setMessage(""); setFormTarget(editable); }}>Editar<span className="sr-only"> {line.name}</span></button>
                            <button type="button" className="row-button is-danger" onClick={() => { setDeleteError(""); setDeleting(editable); }}>Excluir<span className="sr-only"> {line.name}</span></button>
                          </>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Como aplicar" className="aside-panel">
          <ul className="note-list">
            <li>O desconto incide sobre o preço de tabela, independente da condição de pagamento.</li>
            <li>Frete e chapa não têm desconto.</li>
            <li>As condições são promocionais e podem mudar a qualquer momento.</li>
            <li>Somar o 1,5% do pagamento antecipado ao desconto de linha exige aprovação do Gestor Comercial e da Diretoria.</li>
          </ul>
        </Panel>
      </div>

      {formTarget && (
        <DiscountFormDialog
          line={formTarget === "new" ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={(savedMessage) => {
            setFormTarget(null);
            setMessage(savedMessage);
            reload();
          }}
        />
      )}

      {deleting && (
        <Dialog
          title={`Excluir ${deleting.name}?`}
          description="A linha sai desta tabela e da Calculadora. Orçamentos já salvos continuam com o desconto original."
          size="small"
          onClose={() => { if (!deletingBusy) setDeleting(null); }}
        >
          {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={deletingBusy} onClick={() => setDeleting(null)}>Cancelar</button>
            <button type="button" className="primary-button is-danger" disabled={deletingBusy} onClick={() => void confirmDelete()}>{deletingBusy ? "Excluindo…" : "Excluir linha"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
