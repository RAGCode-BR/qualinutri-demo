import { useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { Panel } from "../../components/Panel";
import { useAuth } from "../../app/AuthProvider";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { savePolicySection } from "../../demo/services/policyService";
import type { PolicySection } from "../../types/commercial";

function escape(text: string) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));
}

/** Abre a política numa janela própria e chama a impressão (salvar em PDF para enviar ao cliente ou à equipe). */
function printPolicy(sections: PolicySection[], version: string) {
  const body = sections.map((section) => `<section><h2>${escape(section.title)}${section.pending ? ' <small>(a definir)</small>' : ""}</h2><p>${escape(section.content)}</p></section>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Política comercial ${escape(version)}</title><style>body{font:13px/1.55 system-ui,sans-serif;color:#0e2116;margin:40px;max-width:760px}h1{font-size:22px;margin:0}header p{color:#4a5850;margin:4px 0 24px}h2{font-size:15px;margin:18px 0 4px}h2 small{color:#7a5300;font-weight:600}p{margin:0}footer{margin-top:28px;color:#5f7366;font-size:11px}</style></head><body><header><h1>Política comercial</h1><p>Qualinutri Ind. Com. de Nutrição Animal Ltda · Versão ${escape(version)}</p></header>${body}<footer>Emitido em ${new Date().toLocaleString("pt-BR")}.</footer><script>window.onload=()=>window.print()</script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

export function CommercialPolicyPage() {
  const { profile } = useAuth();
  const { data: { policySections, policyVersion }, reload } = useCommercialData();
  const isAdmin = profile?.role === "administrador";
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function startEdit(section: PolicySection) {
    setEditing(section.title);
    setDraft(section.content);
    setPending(Boolean(section.pending));
    setError("");
    setMessage("");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await savePolicySection(editing, draft, pending);
      setMessage(`Seção “${editing}” atualizada. A alteração fica no histórico das tabelas.`);
      setEditing(null);
      reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a seção.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-columns">
      <div className="policy-sections">
        {message && <p className="form-message page-notice" role="status">{message}</p>}
        {policySections.map((section) => (
          <details key={section.title} open={editing === section.title || undefined}>
            <summary>
              <span>{section.title}</span>
              {section.pending && <span className="status-badge is-warning">A definir</span>}
            </summary>
            {editing === section.title ? (
              <form className="policy-body policy-edit" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                <label className="sr-only" htmlFor="policyDraft">Texto da seção {section.title}</label>
                <textarea id="policyDraft" rows={6} value={draft} onChange={(event) => setDraft(event.target.value)} />
                <label className="policy-pending"><input type="checkbox" checked={pending} onChange={(event) => setPending(event.target.checked)} /> Ainda a definir</label>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <div className="policy-edit-actions">
                  <button type="button" className="secondary-button compact-secondary" onClick={() => setEditing(null)}>Cancelar</button>
                  <button type="submit" className="primary-button compact-button" disabled={busy}>{busy ? "Salvando…" : "Salvar seção"}</button>
                </div>
              </form>
            ) : (
              <div className="policy-body">
                {section.content}
                {isAdmin && <button type="button" className="link-button policy-edit-button" onClick={() => startEdit(section)}><Pencil size={13} aria-hidden="true" /> Editar seção</button>}
              </div>
            )}
          </details>
        ))}
      </div>
      <Panel title="Política comercial da fábrica" description={`Versão ${policyVersion}`} className="aside-panel">
        <address className="company-card">
          <strong>Qualinutri Ind. Com. de Nutrição Animal Ltda</strong>
          <span>Av. Rio Arinos, 3881 S</span>
          <span>Juara, MT</span>
          <a href="tel:+556635562300">(66) 3556-2300</a>
        </address>
        <button type="button" className="secondary-button compact-secondary policy-print" onClick={() => printPolicy(policySections, policyVersion)}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir / PDF</button>
        {!isAdmin && <p className="muted">Só administradores editam a política.</p>}
      </Panel>
    </div>
  );
}
