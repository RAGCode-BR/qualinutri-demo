import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Paperclip, Trash2, X } from "lucide-react";
import { Select } from "../../components/Select";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { evaluateStatus, outOfStandard, recordCost, summaryLine, targetsFor } from "../../demo/checklist/compliance";
import { storeEvidence } from "../../demo/checklist/evidence";
import { deleteRecord, saveRecord } from "../../demo/checklist/service";
import { TAB_BY_ID, type FieldDef } from "../../demo/checklist/tabs";
import type { ChecklistRecord, ChecklistTabId, EvidenceRef, FieldValue } from "../../demo/checklist/types";
import { today } from "../../demo/store/ids";
import { formatKpi } from "../../components/demo/format";
import { EvidenceThumb, Lightbox, StatusChip, formatDateTime } from "./shared";
import { FileDropZone } from "../../components/demo/FileDropZone";

type RecordDialogProps = {
  tabId: ChecklistTabId;
  record?: ChecklistRecord;
  presetTarget?: string | null;
  readOnly?: boolean;
  /** Chamado depois de gravar (antes de fechar), com o registro salvo. */
  onSaved?: (record: ChecklistRecord) => void;
  onClose: () => void;
};

export function RecordDialog({ tabId, record, presetTarget, readOnly = false, onSaved, onClose }: RecordDialogProps) {
  const tab = TAB_BY_ID[tabId];
  const tables = useDemoTables();
  const ref = useRef<HTMLDialogElement>(null);
  const [targetId, setTargetId] = useState<string>(record?.targetId ?? presetTarget ?? "");
  const [values, setValues] = useState<Record<string, FieldValue>>(() => record?.values ?? {});
  const [checks, setChecks] = useState<Record<string, boolean>>(() => record?.checks ?? {});
  const [stage, setStage] = useState<string | null>(record?.stage ?? tab.stages?.[0] ?? null);
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [evidence, setEvidence] = useState<EvidenceRef[]>(record?.evidence ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; type?: string } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const targets = targetsFor(tabId, tables);
  const answered = tab.checks.filter((item) => typeof checks[item] === "boolean").length;
  const failed = tab.checks.filter((item) => checks[item] === false);
  // Enquanto a conferência não termina, o registro ainda não está conforme.
  const evaluated = evaluateStatus(tabId, { checks, values, stage }, tables, today());
  const live = evaluated === "conforme" && answered < tab.checks.length ? "pendente" : evaluated;
  const problems = outOfStandard(tabId, values, tables);
  const cost = recordCost(tabId, values);

  const sourceOptions = useMemo(() => ({
    suppliers: tables.checklist.suppliers.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name })),
    materials: tables.checklist.materials.map((item) => ({ value: item.id, label: item.name })),
    employees: tables.checklist.employees.filter((item) => item.active).map((item) => ({ value: item.id, label: `${item.name} · ${item.role}` })),
    products: tables.catalog.products.map((item) => ({ value: item.id ?? item.name, label: item.name })),
    customers: tables.customers.filter((item) => item.active).map((item) => ({ value: item.id, label: item.legal_name })),
    loads: tables.loads.filter((item) => item.status !== "cancelled").slice(-30).reverse().map((item) => ({ value: item.id, label: `Carga #${item.load_number} · ${item.vehicle_name_snapshot}` })),
    samples: tables.checklist.records.filter((item) => item.tab === "samples").slice(0, 60).map((item) => ({ value: item.id, label: summaryLine("samples", item, tables) })),
  }), [tables]);

  function set(key: string, value: FieldValue) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function standardHint(field: FieldDef) {
    if (!field.standardParam) return null;
    const material = tables.checklist.materials.find((item) => item.id === values.material);
    const standard = material?.standards.find((item) => item.param === field.standardParam);
    if (!standard) return null;
    return `Padrão: ${standard.min !== undefined ? `mín. ${standard.min}` : ""}${standard.min !== undefined && standard.max !== undefined ? " · " : ""}${standard.max !== undefined ? `máx. ${standard.max}` : ""}${standard.unit}`;
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const stored = await Promise.all([...files].slice(0, 6).map((file) => storeEvidence(file)));
    setEvidence((current) => [...current, ...stored]);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await saveRecord({ id: record?.id, tab: tabId, targetId: targetId || null, checks, values, notes, evidence, stage });
      onSaved?.(saved);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!record || !window.confirm("Excluir este registro?")) return;
    await deleteRecord(record.id);
    onClose();
  }

  function renderField(field: FieldDef) {
    const value = values[field.key];
    const id = `ck-${field.key}`;
    const outOfStd = field.standardParam && problems.some((problem) => problem.startsWith(field.label));
    let control;
    if (field.type === "select") {
      const options = field.source ? sourceOptions[field.source] : (field.options ?? []).map((option) => ({ value: option, label: option }));
      control = <Select id={id} value={String(value ?? "")} disabled={readOnly} onChange={(next) => set(field.key, next || null)} options={[{ value: "", label: "Selecione" }, ...options]} />;
    } else if (field.type === "textarea") {
      control = <textarea id={id} rows={3} disabled={readOnly} value={String(value ?? "")} onChange={(event) => set(field.key, event.target.value)} />;
    } else if (field.type === "boolean") {
      control = (
        <div className="ck-toggle" role="radiogroup" aria-labelledby={`${id}-label`}>
          {[true, false].map((option) => (
            <button key={String(option)} type="button" role="radio" disabled={readOnly} aria-checked={value === option} onClick={() => set(field.key, option)}>{option ? "Sim" : "Não"}</button>
          ))}
        </div>
      );
    } else {
      control = (
        <div className="input-affix">
          <input id={id} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} step="any" disabled={readOnly}
            aria-invalid={outOfStd ? true : undefined}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(event) => set(field.key, field.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)} />
          {field.unit && <span>{field.unit}</span>}
        </div>
      );
    }
    return (
      <div className={`field${field.wide ? " ck-wide" : ""}`} key={field.key}>
        <label id={`${id}-label`} htmlFor={id}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
        {control}
        {standardHint(field) && <small className={outOfStd ? "ck-hint is-bad" : "ck-hint"}>{standardHint(field)}</small>}
      </div>
    );
  }

  const Icon = tab.icon;
  return (
    <dialog ref={ref} className="ck-dialog" aria-labelledby="ck-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form className="ck-dialog-inner" onSubmit={(event) => { event.preventDefault(); if (!readOnly) void save(); }}>
        <header className="ck-dialog-head">
          <span className="mega-icon"><Icon size={20} aria-hidden="true" /></span>
          <div>
            <p className="drawer-kicker">{tab.label}</p>
            <h2 id="ck-dialog-title">{record ? (readOnly ? "Registro" : "Editar registro") : "Novo registro"}</h2>
            {record && <small className="ck-meta">{formatDateTime(record.date)} · {record.responsible}</small>}
          </div>
          <StatusChip status={live} />
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
        </header>

        <div className="ck-dialog-body">
          {problems.length > 0 && <p className="ck-alert" role="alert">Fora do padrão: {problems.join("; ")}.</p>}

          <div className="ck-form-grid">
            {tab.target && (
              <div className="field">
                <label htmlFor="ck-target">{tab.targetLabel} *</label>
                <Select id="ck-target" value={targetId} disabled={readOnly} onChange={setTargetId} options={[{ value: "", label: "Selecione" }, ...targets.map((target) => ({ value: target.id, label: target.sub ? `${target.label} · ${target.sub}` : target.label }))]} />
              </div>
            )}
            {tab.stages && (
              <div className="field">
                <label htmlFor="ck-stage">Etapa</label>
                <Select id="ck-stage" value={stage ?? ""} disabled={readOnly} onChange={(next) => setStage(next)} options={tab.stages.map((item) => ({ value: item, label: item }))} />
              </div>
            )}
            {tab.fields.map(renderField)}
          </div>

          {tab.checks.length > 0 && (
            <fieldset className="ck-checks">
              <legend>Checklist · {answered} de {tab.checks.length} conferidos{failed.length > 0 && <span className="ck-failed"> · {failed.length} reprovado{failed.length > 1 ? "s" : ""}</span>}</legend>
              {!readOnly && answered < tab.checks.length && (
                <button type="button" className="link-button ck-all-ok" onClick={() => setChecks((current) => ({ ...Object.fromEntries(tab.checks.map((item) => [item, true])), ...current }))}>Marcar os que faltam como OK</button>
              )}
              {tab.checks.map((item) => (
                <div className={`ck-check${checks[item] === undefined ? " is-open" : ""}`} key={item}>
                  <span>{item}</span>
                  <div className="ck-toggle">
                    <button type="button" disabled={readOnly} aria-pressed={checks[item] === true} className="is-ok" onClick={() => setChecks((current) => ({ ...current, [item]: true }))}>OK</button>
                    <button type="button" disabled={readOnly} aria-pressed={checks[item] === false} className="is-no" onClick={() => setChecks((current) => ({ ...current, [item]: false }))}>Não</button>
                  </div>
                </div>
              ))}
            </fieldset>
          )}

          <div className="field ck-wide">
            <label htmlFor="ck-notes">Observações</label>
            <textarea id="ck-notes" rows={2} disabled={readOnly} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          <div className="ck-evidence">
            <div className="ck-evidence-head">
              <strong>Evidências</strong>
              {!readOnly && (
                <div className="ck-evidence-actions">
                  <label className="secondary-button compact-secondary"><Camera size={16} aria-hidden="true" />&nbsp;Foto<input type="file" accept="image/*" capture="environment" hidden onChange={(event) => void addFiles(event.target.files)} /></label>
                  <label className="secondary-button compact-secondary"><Paperclip size={16} aria-hidden="true" />&nbsp;Arquivo<input type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => void addFiles(event.target.files)} /></label>
                </div>
              )}
            </div>
            {!readOnly && <FileDropZone compact onFiles={(files) => void addFiles(files)} label="Arraste fotos ou PDFs da evidência" hint="ou clique para escolher · no celular abre a câmera" />}
            {evidence.length === 0 ? <p className="muted">Nenhuma evidência anexada.</p> : (
              <div className="ck-thumbs">
                {evidence.map((item) => (
                  <div className="ck-thumb-wrap" key={item.id}>
                    <EvidenceThumb evidence={item} onOpen={(url, type) => setPreview({ url, type })} />
                    {!readOnly && <button type="button" className="ck-thumb-remove" aria-label={`Remover ${item.name}`} onClick={() => setEvidence((current) => current.filter((row) => row.id !== item.id))}><X size={12} aria-hidden="true" /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {cost > 0 && <p className="ck-cost">Custo deste registro: <strong>{formatKpi(cost, "currency")}</strong></p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
        </div>

        <footer className="ck-dialog-foot">
          {record && !readOnly && <button type="button" className="text-button ck-delete" onClick={() => void remove()}><Trash2 size={16} aria-hidden="true" /> Excluir</button>}
          <button type="button" className="secondary-button" onClick={onClose}>{readOnly ? "Fechar" : "Cancelar"}</button>
          {!readOnly && <button type="submit" className="primary-button" disabled={busy}>{busy ? "Salvando…" : "Salvar registro"}</button>}
        </footer>
      </form>
      {preview && <Lightbox url={preview.url} type={preview.type} onClose={() => setPreview(null)} />}
    </dialog>
  );
}
