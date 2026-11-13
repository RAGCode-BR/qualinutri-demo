import { useMemo, useState } from "react";
import { FilePlus2, FileText, MessageCircle, Paperclip, Search, Send, ShieldCheck } from "lucide-react";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { customerScore } from "../../demo/erp/finance";
import { requestApproval, sendChat } from "../../demo/erp/service";
import { storeEvidence } from "../../demo/checklist/evidence";
import type { EvidenceRef } from "../../demo/checklist/types";
import { today } from "../../demo/store/ids";
import { BarList } from "../../components/demo/Charts";
import { Sheet } from "../../components/demo/DetailSheets";
import { EvidenceThumb, Lightbox, Ring } from "../checklist/shared";
import { Chip, dateBr, money } from "./shared";
import { FileDropZone } from "../../components/demo/FileDropZone";

const levelTone = { verde: "good", amarelo: "warn", vermelho: "bad" } as const;
const docsKey = (id: string) => `qualinutri-demo:docs:${id}`;

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function CreditPage() {
  const tables = useDemoTables();
  const now = today();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "vermelho" | "amarelo">("all");
  const scored = useMemo(() => tables.customers.filter((customer) => customer.active).map((customer) => ({ customer, score: customerScore(tables, customer.id, now) })), [tables]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = scored
    .filter((row) => filter === "all" || row.score.level === filter)
    .filter((row) => !query || normalize(`${row.customer.legal_name} ${row.customer.document ?? ""}`).includes(normalize(query)))
    .sort((a, b) => a.score.score - b.score.score);
  const [selectedId, setSelectedId] = useState<string | null>(list[0]?.customer.id ?? null);
  const counts = { vermelho: scored.filter((row) => row.score.level === "vermelho").length, amarelo: scored.filter((row) => row.score.level === "amarelo").length };

  return (
    <div className="credit">
      <aside className="dash-card credit-list">
        <label className="drawer-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Buscar cliente ou CPF/CNPJ" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="segmented-glass ck-seg" role="radiogroup" aria-label="Risco">
          <button type="button" role="radio" aria-checked={filter === "all"} onClick={() => setFilter("all")}>Todos</button>
          <button type="button" role="radio" aria-checked={filter === "vermelho"} onClick={() => setFilter("vermelho")}>Vermelho {counts.vermelho}</button>
          <button type="button" role="radio" aria-checked={filter === "amarelo"} onClick={() => setFilter("amarelo")}>Atenção {counts.amarelo}</button>
        </div>
        <ul>
          {list.map(({ customer, score }) => (
            <li key={customer.id}>
              <button type="button" aria-pressed={selectedId === customer.id} onClick={() => setSelectedId(customer.id)}>
                <span className={`score-dot is-${score.level}`} aria-label={`Score ${score.level}`} />
                <span className="credit-name"><strong>{customer.legal_name}</strong><small>{score.lateTitles ? `${score.lateTitles} em atraso · ${score.maxLate} dias` : `Em aberto ${money(score.openAmount)}`}</small></span>
                <b>{score.score}</b>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selectedId ? <Customer360 key={selectedId} customerId={selectedId} /> : <p className="muted">Escolha um cliente.</p>}
    </div>
  );
}

function Customer360({ customerId }: { customerId: string }) {
  const tables = useDemoTables();
  const now = today();
  const { openCalculatorForCustomer } = useQuoteEditing();
  const customer = tables.customers.find((item) => item.id === customerId)!;
  const score = customerScore(tables, customerId, now);
  const ie = tables.erp.ie.find((item) => item.customerId === customerId);
  const quotes = tables.quotes.filter((quote) => quote.customer_id === customerId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const approved = quotes.filter((quote) => quote.status === "approved");
  const items = tables.quote_items.filter((item) => approved.some((quote) => quote.id === item.quote_id));
  const byProduct = new Map<string, number>();
  for (const item of items) byProduct.set(item.product_name_snapshot, (byProduct.get(item.product_name_snapshot) ?? 0) + item.quantity);
  const avgDiscount = items.length ? items.reduce((sum, item) => sum + item.total_discount_percentage, 0) / items.length : 0;
  const ticket = approved.length ? approved.reduce((sum, quote) => sum + quote.product_subtotal, 0) / approved.length : 0;
  const [docs, setDocs] = useState<EvidenceRef[]>(() => { try { return JSON.parse(localStorage.getItem(docsKey(customerId)) ?? "[]"); } catch { return []; } });
  const [preview, setPreview] = useState<{ url: string; type?: string } | null>(null);
  const [agRisk, setAgRisk] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const thread = `cliente:${customerId}`;
  const chat = tables.erp.chat.filter((item) => item.thread === thread);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const stored = await Promise.all([...files].slice(0, 8).map((file) => storeEvidence(file)));
    setDocs((current) => {
      const next = [...current, ...stored];
      try { localStorage.setItem(docsKey(customerId), JSON.stringify(next)); } catch { /* sem armazenamento */ }
      return next;
    });
  }

  return (
    <div className="credit-detail">
      <section className="credit-hero glass-dark">
        <Ring value={score.score} size={110} stroke={10} tone={levelTone[score.level]} />
        <div className="credit-hero-text">
          <p className="dash-greet">Score automático · atualizado pelos pagamentos</p>
          <h2>{customer.legal_name}</h2>
          <p>{customer.document ?? "Sem documento"} · {customer.phone ?? "sem telefone"}</p>
          <div className="credit-chips">
            <Chip tone={levelTone[score.level]}>{score.level === "vermelho" ? `Bloqueio: ${score.maxLate} dias de atraso` : score.level === "amarelo" ? "Atenção" : "Bom pagador"}</Chip>
            <Chip tone={ie?.status === "ativa" ? "good" : "bad"}><ShieldCheck size={12} aria-hidden="true" /> IE {ie?.ie ?? "—"} · {ie?.status ?? "sem IE"}</Chip>
          </div>
        </div>
        <div className="credit-actions">
          <button type="button" className="primary-button compact-button" onClick={() => openCalculatorForCustomer({ id: customer.id, name: customer.legal_name, document: customer.document })}><FilePlus2 size={15} aria-hidden="true" />&nbsp;Novo orçamento</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => setAgRisk(true)}>Consultar AG Risk</button>
          <button type="button" className="secondary-button compact-secondary" onClick={() => void requestApproval({ kind: "credito", title: `Revisar crédito: ${customer.legal_name}`, detail: `Score ${score.score}; em aberto ${money(score.openAmount)}.` }).then(() => setNotice("Pedido enviado para a gestão aprovar."))}>Pedir aprovação de crédito</button>
        </div>
      </section>
      {notice && <p className="erp-notice">{notice}</p>}

      <section className="kpi-strip">
        <div className="strip-card"><span className="strip-label">Ticket médio</span><strong className="strip-value">{money(ticket)}</strong><span className="strip-caption">{approved.length} pedidos aprovados</span></div>
        <div className="strip-card is-warn"><span className="strip-label">Em aberto</span><strong className="strip-value">{money(score.openAmount)}</strong></div>
        <div className={`strip-card${score.lateAmount ? " is-bad" : ""}`}><span className="strip-label">Em atraso</span><strong className="strip-value">{money(score.lateAmount)}</strong><span className="strip-caption">{score.lateTitles} títulos</span></div>
        <div className="strip-card"><span className="strip-label">Desconto médio concedido</span><strong className="strip-value">{avgDiscount.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>
      </section>

      <div className="dash-columns">
        <section className="dash-card">
          <header className="dash-card-head"><h2>O que mais compra</h2></header>
          <BarList format="number" items={[...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value, sub: "sacas" }))} />
        </section>
        <section className="dash-card">
          <header className="dash-card-head"><h2>Histórico de pedidos</h2></header>
          <ul className="erp-list">
            {quotes.slice(0, 8).map((quote) => (
              <li key={quote.id}><span className="erp-list-icon"><FileText size={15} aria-hidden="true" /></span><span><strong>#{quote.quote_number} · {quote.status === "approved" ? "Aprovado" : quote.status === "issued" ? "Enviado" : quote.status === "draft" ? "Rascunho" : "Cancelado"}</strong><small>{dateBr(quote.created_at)}</small></span><strong>{money(quote.grand_total)}</strong></li>
            ))}
            {quotes.length === 0 && <li className="muted">Sem pedidos.</li>}
          </ul>
        </section>
        <section className="dash-card">
          <header className="dash-card-head"><h2>Documentos do cliente</h2><span className="erp-chip is-muted"><Paperclip size={12} aria-hidden="true" /> {docs.length} anexos</span></header>
          <FileDropZone onFiles={(files) => void addFiles(files)} accept="image/*,application/pdf,audio/*" label="Arraste ficha, comprovantes, autorização assinada" hint="PDF, fotos, prints ou áudios do WhatsApp" />
          {docs.length > 0 && <div className="ck-thumbs">{docs.map((doc) => <EvidenceThumb key={doc.id} evidence={doc} onOpen={(url, type) => setPreview({ url, type })} />)}</div>}
        </section>
        <section className="dash-card">
          <header className="dash-card-head"><h2><MessageCircle size={16} aria-hidden="true" /> Conversa interna sobre o cliente</h2></header>
          <ul className="chat">
            {chat.length === 0 && <li className="muted">Nenhuma mensagem. Tudo que for combinado aqui fica registrado no cliente, sem depender do WhatsApp.</li>}
            {chat.map((item) => <li key={item.id}><strong>{item.author}</strong><span>{item.text}</span><small>{new Date(item.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></li>)}
          </ul>
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void sendChat(thread, message); setMessage(""); }}>
            <input placeholder="Escreva para a equipe…" value={message} onChange={(event) => setMessage(event.target.value)} />
            <button type="submit" className="primary-button compact-button" aria-label="Enviar"><Send size={15} aria-hidden="true" /></button>
          </form>
        </section>
      </div>
      {preview && <Lightbox url={preview.url} type={preview.type} onClose={() => setPreview(null)} />}
      {agRisk && (
        <Sheet variant="center" label="Consulta AG Risk" onClose={() => setAgRisk(false)}>
          <div className="kpi-sheet">
            <header className={`kpi-sheet-hero${score.level === "vermelho" ? " tone-red" : ""}`}><span className="kpi-sheet-icon"><ShieldCheck size={26} /></span><div><p>Consulta externa de crédito (AG Risk · simulada)</p><strong>{Math.max(120, score.score * 9)} pontos</strong><small>{customer.legal_name}</small></div></header>
            <dl className="doc-parties">
              <div><dt>Restrições</dt><dd>{score.level === "vermelho" ? "1 protesto em cartório" : "Nada consta"}</dd></div>
              <div><dt>Cônjuge</dt><dd>{score.level === "verde" ? "Nada consta" : "Consulta pendente"}</dd></div>
              <div><dt>Inscrição estadual</dt><dd>{ie?.status ?? "—"}</dd></div>
              <div><dt>Limite sugerido</dt><dd>{money(Math.round((ticket * (score.score / 50)) / 1000) * 1000 || 20_000)}</dd></div>
            </dl>
            <p className="muted">Com API aberta, o resultado entra direto na ficha e atualiza o score.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}
