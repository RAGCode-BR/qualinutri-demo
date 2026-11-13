import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, MessagesSquare, Search, X } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { createThread, simulateReply } from "../../demo/chat/service";
import type { ChatRef } from "../../demo/erp/types";

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Nova conversa: sobre um cliente (reaproveita a do cliente, se já existir) ou sobre um assunto. */
export function NewThreadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (threadId: string) => void }) {
  const tables = useDemoTables();
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"cliente" | "assunto">("cliente");
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const customers = useMemo(() => tables.customers
    .filter((customer) => customer.active)
    .filter((customer) => !query || normalize(`${customer.legal_name} ${customer.trade_name ?? ""} ${customer.document ?? ""}`).includes(normalize(query)))
    .slice(0, 8), [tables, query]);
  const quotes = useMemo(() => [...tables.quotes].sort((a, b) => b.quote_number - a.quote_number).slice(0, 25), [tables]);
  const loads = useMemo(() => [...tables.loads].sort((a, b) => b.load_number - a.load_number).slice(0, 10), [tables]);

  function create() {
    setError("");
    try {
      if (kind === "cliente") {
        if (!customerId) { setError("Escolha o cliente."); return; }
        const id = createThread({ kind: "cliente", customerId }, message);
        if (message.trim()) simulateReply(id);
        onCreated(id);
        return;
      }
      let chatRef: ChatRef | null = null;
      let refCustomer: string | null = null;
      if (link.startsWith("q:")) {
        const quote = tables.quotes.find((item) => item.id === link.slice(2));
        if (quote) { chatRef = { type: "quote", id: quote.id, label: `Orçamento #${quote.quote_number}` }; refCustomer = quote.customer_id; }
      } else if (link.startsWith("l:")) {
        const load = tables.loads.find((item) => item.id === link.slice(2));
        if (load) chatRef = { type: "load", id: load.id, label: `Carga #${load.load_number}` };
      }
      const id = createThread({ kind: "assunto", title, ref: chatRef, customerId: refCustomer }, message);
      if (message.trim()) simulateReply(id);
      onCreated(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a conversa.");
    }
  }

  return (
    <dialog ref={ref} className="ck-dialog chat-new" aria-labelledby="chat-new-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <form className="ck-dialog-inner" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <header className="ck-dialog-head">
          <div><p className="drawer-kicker">Conversa interna</p><h2 id="chat-new-title">Nova conversa</h2></div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fechar"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="ck-dialog-body">
          <div className="chat-new-kinds" role="radiogroup" aria-label="Sobre o quê">
            <button type="button" role="radio" aria-checked={kind === "cliente"} onClick={() => setKind("cliente")}><Building2 size={20} aria-hidden="true" /><strong>Sobre um cliente</strong><small>Crédito, entrega, cadastro, negociação</small></button>
            <button type="button" role="radio" aria-checked={kind === "assunto"} onClick={() => setKind("assunto")}><MessagesSquare size={20} aria-hidden="true" /><strong>Sobre um assunto</strong><small>Um orçamento, uma carga, um conserto…</small></button>
          </div>

          {kind === "cliente" ? (
            <div className="field">
              <label htmlFor="chat-new-customer">Cliente</label>
              <label className="chat-search"><Search size={15} aria-hidden="true" /><input id="chat-new-customer" value={query} onChange={(event) => { setQuery(event.target.value); setCustomerId(null); }} placeholder="Nome, fantasia ou CPF/CNPJ" autoFocus /></label>
              <ul className="chat-new-customers">
                {customers.map((customer) => (
                  <li key={customer.id}><button type="button" aria-pressed={customer.id === customerId} onClick={() => setCustomerId(customer.id)}><strong>{customer.trade_name || customer.legal_name}</strong><small>{customer.document ?? "—"}</small></button></li>
                ))}
                {customers.length === 0 && <li className="muted">Nenhum cliente encontrado.</li>}
              </ul>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="chat-new-title-input">Assunto</label>
                <input id="chat-new-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Prazo de entrega da região norte" autoFocus maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="chat-new-link">Vincular a (opcional)</label>
                <select id="chat-new-link" value={link} onChange={(event) => setLink(event.target.value)}>
                  <option value="">Sem vínculo</option>
                  <optgroup label="Orçamentos">{quotes.map((quote) => <option key={quote.id} value={`q:${quote.id}`}>#{quote.quote_number} · {quote.customer_name_snapshot ?? "Sem cliente"}</option>)}</optgroup>
                  <optgroup label="Cargas">{loads.map((load) => <option key={load.id} value={`l:${load.id}`}>Carga #{load.load_number} · {load.vehicle_name_snapshot}</option>)}</optgroup>
                </select>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="chat-new-message">Primeira mensagem (opcional)</label>
            <textarea id="chat-new-message" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva para a equipe…" />
          </div>
          {error && <p role="alert" className="auth-error">{error}</p>}
        </div>
        <footer className="ck-dialog-foot">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button">Abrir conversa</button>
        </footer>
      </form>
    </dialog>
  );
}
