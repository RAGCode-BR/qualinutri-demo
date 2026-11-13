import { useState } from "react";
import { BadgePercent, CheckCircle2, CreditCard, MessageCircle, Send, UserPlus, Wrench, XCircle } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { decideApproval, sendChat } from "../../demo/erp/service";
import type { Approval } from "../../demo/erp/types";
import { Chip, Stat, dateBr } from "./shared";

const kindIcon = { cadastro: UserPlus, desconto: BadgePercent, credito: CreditCard, conserto: Wrench } as const;
const kindLabel = { cadastro: "Cadastro", desconto: "Desconto", credito: "Crédito", conserto: "Conserto de frota" } as const;

export function ApprovalsPage() {
  const tables = useDemoTables();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "administrador";
  const [filter, setFilter] = useState<Approval["kind"] | "all">("all");
  const [message, setMessage] = useState("");
  const pending = tables.erp.approvals.filter((item) => item.status === "pendente" && (filter === "all" || item.kind === filter));
  const done = tables.erp.approvals.filter((item) => item.status !== "pendente").slice(0, 8);
  const chat = tables.erp.chat.filter((item) => item.thread === "geral");
  return (
    <div className="approvals">
      <div className="erp-grid">
        <section className="kpi-strip">
          <Stat label="Pendentes" value={tables.erp.approvals.filter((item) => item.status === "pendente").length} format="number" tone="warn" caption="Aprovar sem precisar ligar" />
          <Stat index={1} label="Decididas" value={tables.erp.approvals.filter((item) => item.status !== "pendente").length} format="number" tone="good" caption="Tudo com quem, quando e por quê" />
        </section>
        <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Tipo">
          {(["all", "cadastro", "desconto", "credito", "conserto"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={filter === kind} onClick={() => setFilter(kind)}>{kind === "all" ? "Todas" : kindLabel[kind]}</button>)}
        </div>
        <ul className="approval-list">
          {pending.length === 0 && <li className="muted">Nada pendente.</li>}
          {pending.map((item, index) => {
            const Icon = kindIcon[item.kind];
            return (
              <li key={item.id} className="approval-card" style={{ animationDelay: `${index * 50}ms` }}>
                <span className="mega-icon"><Icon size={18} aria-hidden="true" /></span>
                <div>
                  <Chip tone="info">{kindLabel[item.kind]}</Chip>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>Enviado por {item.requestedBy} · {dateBr(item.date)}</small>
                </div>
                {isAdmin ? (
                  <div className="approval-buttons">
                    <button type="button" className="secondary-button compact-secondary" onClick={() => void decideApproval(item.id, false)}><XCircle size={15} aria-hidden="true" />&nbsp;Recusar</button>
                    <button type="button" className="primary-button compact-button" onClick={() => void decideApproval(item.id, true)}><CheckCircle2 size={15} aria-hidden="true" />&nbsp;Aprovar</button>
                  </div>
                ) : <Chip tone="warn">Aguardando gestão</Chip>}
              </li>
            );
          })}
        </ul>
        {done.length > 0 && (
          <section className="dash-card">
            <header className="dash-card-head"><h2>Histórico de decisões</h2></header>
            <ul className="erp-list">{done.map((item) => <li key={item.id}><span className="erp-list-icon">{item.status === "aprovado" ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}</span><span><strong>{item.title}</strong><small>{item.status} por {item.decidedBy}</small></span><Chip tone={item.status === "aprovado" ? "good" : "bad"}>{item.status}</Chip></li>)}</ul>
          </section>
        )}
      </div>
      <aside className="dash-card approvals-chat">
        <header className="dash-card-head"><h2><MessageCircle size={16} aria-hidden="true" /> Chat interno</h2><Chip tone="muted">fica no sistema</Chip></header>
        <ul className="chat">{chat.map((item) => <li key={item.id}><strong>{item.author}</strong><span>{item.text}</span><small>{new Date(item.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></li>)}</ul>
        <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void sendChat("geral", message); setMessage(""); }}>
          <input placeholder="Mensagem para a equipe…" value={message} onChange={(event) => setMessage(event.target.value)} />
          <button type="submit" className="primary-button compact-button" aria-label="Enviar"><Send size={15} aria-hidden="true" /></button>
        </form>
      </aside>
    </div>
  );
}
