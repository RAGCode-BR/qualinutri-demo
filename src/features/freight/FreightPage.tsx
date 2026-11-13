import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { deactivateFreightZone, saveFreightZone, saveHandlingRate, type FreightTableCode } from "../../services/freightService";
import type { JuaraFreightRate, RegionalFreightRate } from "../../types/commercial";
import { formatCurrency } from "../../utils/formatters";

function formatDecimal(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function parseAmount(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

type Editing =
  | { table: "juara"; zone: JuaraFreightRate | null }
  | { table: "regional"; zone: RegionalFreightRate | null };

type Deleting = { table: FreightTableCode; id: string; label: string };

type AmountField = { key: string; label: string; unit: string; required: boolean; hint?: string };

const juaraFields: AmountField[] = [
  { key: "bag25", label: "Saca 25 kg", unit: "/saca", required: true },
  { key: "bag30", label: "Saca 30 kg", unit: "/saca", required: true },
  { key: "bag40", label: "Saca 40 kg", unit: "/saca", required: true },
  { key: "closedPerTon", label: "Carga fechada", unit: "/t", required: true },
];

const regionalFields: AmountField[] = [
  { key: "fractionalPerTon", label: "Fracionada", unit: "/t", required: false, hint: "Deixe vazio se a cidade só aceita carga fechada." },
  { key: "closedPerTon", label: "Carga fechada", unit: "/t", required: true },
];

function FreightZoneDialog({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: (message: string) => void }) {
  const isJuara = editing.table === "juara";
  const fields = isJuara ? juaraFields : regionalFields;
  const initialLabel = editing.zone ? (isJuara ? (editing.zone as JuaraFreightRate).distance : (editing.zone as RegionalFreightRate).location) : "";
  const [label, setLabel] = useState(initialLabel);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const zone = editing.zone as Record<string, unknown> | null;
    return Object.fromEntries(fields.map((field) => {
      const value = zone?.[field.key];
      return [field.key, typeof value === "number" ? String(value) : ""];
    }));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const noun = isJuara ? "faixa" : "cidade";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!label.trim()) return setError(`Informe o nome da ${noun}.`);
    const parsed: Record<string, number | null> = {};
    for (const field of fields) {
      const amount = parseAmount(amounts[field.key] ?? "");
      if (amount === null && field.required) return setError(`Preencha o valor de ${field.label.toLowerCase()}.`);
      if (amount !== null && (Number.isNaN(amount) || amount < 0)) return setError(`O valor de ${field.label.toLowerCase()} deve ser um número igual ou maior que zero.`);
      parsed[field.key] = amount;
    }

    setSaving(true);
    setError("");
    try {
      const rates = isJuara
        ? { bag25: parsed.bag25!, bag30: parsed.bag30!, bag40: parsed.bag40!, closedPerTon: parsed.closedPerTon! }
        : { fractionalPerTon: parsed.fractionalPerTon, closedPerTon: parsed.closedPerTon! };
      await saveFreightZone(editing.table, editing.zone?.id ?? null, label.trim(), rates);
      onSaved(editing.zone ? `${label.trim()} foi atualizada.` : `${label.trim()} foi criada.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o frete.");
      setSaving(false);
    }
  }

  const title = editing.zone
    ? (isJuara ? "Editar faixa de distância" : "Editar cidade")
    : (isJuara ? "Nova faixa de distância" : "Nova cidade");

  return (
    <Dialog title={title} description={isJuara ? "Tabela Juara, por distância" : "Tabela regional, valores por tonelada"} onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="zoneLabel">{isJuara ? "Faixa de distância" : "Cidade ou faixa"}</label>
          <input id="zoneLabel" required maxLength={80} placeholder={isJuara ? "Ex.: 191 a 230 km" : "Ex.: Juína até 35 km"} value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <fieldset className="price-fieldset">
          <legend>Valores do frete</legend>
          <div className="form-grid compact">
            {fields.map((field) => (
              <div className="field" key={field.key}>
                <label htmlFor={`zone-${field.key}`}>{field.label}{field.required ? "" : " (opcional)"}</label>
                <div className="input-affix">
                  <span aria-hidden="true">R$</span>
                  <input
                    id={`zone-${field.key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    required={field.required}
                    value={amounts[field.key] ?? ""}
                    onChange={(event) => setAmounts((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                  <span aria-hidden="true">{field.unit}</span>
                </div>
                {field.hint && <p className="field-hint">{field.hint}</p>}
              </div>
            ))}
          </div>
        </fieldset>
        <p className="field-hint">Vale para novos cálculos na Calculadora. Orçamentos já salvos não mudam.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : editing.zone ? "Salvar alterações" : `Criar ${noun}`}</button>
        </div>
      </form>
    </Dialog>
  );
}

function HandlingRateDialog({ current, onClose, onSaved }: { current: number; onClose: () => void; onSaved: (message: string) => void }) {
  const [value, setValue] = useState(String(current));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const amount = parseAmount(value);
    if (amount === null || Number.isNaN(amount) || amount < 0) return setError("Informe um valor igual ou maior que zero.");
    setSaving(true);
    setError("");
    try {
      await saveHandlingRate(amount);
      onSaved("Valor da chapa atualizado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o valor da chapa.");
      setSaving(false);
    }
  }

  return (
    <Dialog title="Valor da chapa" description="Carga e descarga terceirizada, cobrada à parte e sem desconto." size="small" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="handlingRate">Valor por tonelada</label>
          <div className="input-affix">
            <span aria-hidden="true">R$</span>
            <input id="handlingRate" type="number" min="0" step="0.01" inputMode="decimal" required value={value} onChange={(event) => setValue(event.target.value)} />
            <span aria-hidden="true">/t</span>
          </div>
          <p className="field-hint">É o valor que já vem preenchido na Calculadora. O vendedor pode ajustar em cada pedido.</p>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Salvar valor"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function FreightPage() {
  const { profile } = useAuth();
  const { data: { juaraFreightRates, regionalFreightRates, handlingRatePerTon }, source, loading, reload } = useCommercialData();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editingHandling, setEditingHandling] = useState(false);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = profile?.role === "administrador";
  const canEdit = isAdmin && source === "supabase";
  const handling = formatCurrency(handlingRatePerTon);

  function afterSave(savedMessage: string) {
    setEditing(null);
    setEditingHandling(false);
    setMessage(savedMessage);
    reload();
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await deactivateFreightZone(deleting.id);
      setMessage(`${deleting.label} foi excluída.`);
      setDeleting(null);
      reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setDeletingBusy(false);
    }
  }

  function rowActions(table: FreightTableCode, id: string | undefined, label: string, onEdit: () => void) {
    if (!canEdit) return null;
    return (
      <td className="action-cell">
        {id && <>
          <button type="button" className="row-button" onClick={() => { setMessage(""); onEdit(); }}>Editar<span className="sr-only"> {label}</span></button>
          <button type="button" className="row-button is-danger" onClick={() => { setDeleteError(""); setDeleting({ table, id, label }); }}>Excluir<span className="sr-only"> {label}</span></button>
        </>}
      </td>
    );
  }

  const newButton = (table: FreightTableCode, text: string) => canEdit && (
    <button type="button" className="primary-button compact-button" onClick={() => { setMessage(""); setEditing({ table, zone: null } as Editing); }}>{text}</button>
  );

  return (
    <>
      {isAdmin && !canEdit && !loading && (
        <p className="warning-message page-notice">A edição do frete fica disponível quando o sistema está conectado ao servidor. Use “Tentar novamente” no topo da página.</p>
      )}
      {message && <p className="form-message page-notice" role="status">{message}</p>}
      <p className="page-intro">Frete e chapa não têm desconto.</p>

      <Panel title="Juara, por distância" description="Valores em R$ por saca na carga fracionada e em R$ por tonelada na carga fechada." actions={newButton("juara", "Nova faixa")} flush>
        {juaraFreightRates.length === 0 ? <EmptyState title="Nenhuma faixa cadastrada." /> : (
          <ScrollableTable><table className="data-table stack-table stack-grid">
            <thead><tr><th scope="col">Distância</th><th scope="col" className="numeric">Saca 25 kg</th><th scope="col" className="numeric">Saca 30 kg</th><th scope="col" className="numeric">Saca 40 kg</th><th scope="col" className="numeric">Carga fechada (R$/t)</th>{canEdit && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
            <tbody>{juaraFreightRates.map((rate) => (
              <tr key={rate.id ?? rate.distance}>
                <td className="strong cell-primary">{rate.distance}</td>
                <td className="numeric" data-label="Saca 25 kg">{formatDecimal(rate.bag25)}</td>
                <td className="numeric" data-label="Saca 30 kg">{formatDecimal(rate.bag30)}</td>
                <td className="numeric" data-label="Saca 40 kg">{formatDecimal(rate.bag40)}</td>
                <td className="numeric" data-label="Carga fechada (R$/t)">{formatDecimal(rate.closedPerTon)}</td>
                {rowActions("juara", rate.id, rate.distance, () => setEditing({ table: "juara", zone: rate }))}
              </tr>
            ))}</tbody>
          </table></ScrollableTable>
        )}
        <ul className="note-list panel-footnote">
          <li>Carga fechada é uma única entrega de 10, 18 ou 28 t. Descarga por conta do cliente.</li>
          <li>Produto entregue descarregado: acrescentar {handling} por tonelada. Não vender descarregado em vendas fracionadas.</li>
          <li>Entrega mínima de 1.000 kg por cliente.</li>
        </ul>
      </Panel>

      <Panel title="Regional, por cidade" description="Valores em R$ por tonelada, entregue na fazenda sem descarga." actions={newButton("regional", "Nova cidade")} flush>
        {regionalFreightRates.length === 0 ? <EmptyState title="Nenhuma cidade cadastrada." /> : (
          <ScrollableTable><table className="data-table stack-table stack-grid">
            <thead><tr><th scope="col">Cidade ou faixa</th><th scope="col" className="numeric">Fracionada (R$/t)</th><th scope="col" className="numeric">Carga fechada (R$/t)</th>{canEdit && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
            <tbody>{regionalFreightRates.map((rate) => (
              <tr key={rate.id ?? rate.location}>
                <td className="strong cell-primary">{rate.location}</td>
                <td className="numeric" data-label="Fracionada (R$/t)">{rate.fractionalPerTon === null ? <span className="muted-cell">Só carga fechada</span> : formatDecimal(rate.fractionalPerTon)}</td>
                <td className="numeric" data-label="Carga fechada (R$/t)">{formatDecimal(rate.closedPerTon)}</td>
                {rowActions("regional", rate.id, rate.location, () => setEditing({ table: "regional", zone: rate }))}
              </tr>
            ))}</tbody>
          </table></ScrollableTable>
        )}
        <ul className="note-list panel-footnote">
          <li>Fracionada é mais de uma entrega. Carga fechada é uma única entrega de 10, 18 ou 28 t.</li>
          <li>Sacos por tonelada: ração, 25; mineral, proteico e núcleos, 33,33; concentrado 130/160, 40.</li>
          <li>Descarga por conta do cliente.</li>
        </ul>
      </Panel>

      <Panel
        title="Chapa"
        description="Carga e descarga terceirizada, cobrada à parte e sem desconto. É o valor que já vem preenchido na Calculadora."
        actions={canEdit && <button type="button" className="secondary-button compact-secondary" onClick={() => { setMessage(""); setEditingHandling(true); }}>Editar valor</button>}
      >
        <p className="handling-value"><strong>{handling}</strong> por tonelada</p>
      </Panel>

      {editing && <FreightZoneDialog editing={editing} onClose={() => setEditing(null)} onSaved={afterSave} />}
      {editingHandling && <HandlingRateDialog current={handlingRatePerTon} onClose={() => setEditingHandling(false)} onSaved={afterSave} />}

      {deleting && (
        <Dialog
          title={`Excluir ${deleting.label}?`}
          description={`A ${deleting.table === "juara" ? "faixa" : "cidade"} sai desta tabela e da Calculadora. Orçamentos já salvos continuam com o frete original.`}
          size="small"
          onClose={() => { if (!deletingBusy) setDeleting(null); }}
        >
          {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={deletingBusy} onClick={() => setDeleting(null)}>Cancelar</button>
            <button type="button" className="primary-button is-danger" disabled={deletingBusy} onClick={() => void confirmDelete()}>{deletingBusy ? "Excluindo…" : "Excluir"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
