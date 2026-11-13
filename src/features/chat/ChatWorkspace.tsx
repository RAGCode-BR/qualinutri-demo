import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Boxes, Building2, FileText, Hash, Maximize2, MessageSquarePlus, MessagesSquare, Paperclip, PanelRightClose, PanelRightOpen, Search, Send, Truck, UserRound, X } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useNavigate } from "../../app/NavigationContext";
import { useQuoteEditing } from "../../app/QuoteEditingContext";
import { canAccessTab } from "../../layouts/AppSidebar";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { viewerName } from "../../demo/app/session";
import { loadEvidence, placeholderSvg } from "../../demo/checklist/evidence";
import { customerScore } from "../../demo/erp/finance";
import type { ChatAttachment, ChatMessage, ChatThread } from "../../demo/erp/types";
import { lastMessage, markRead, rememberThread, messagesOf, requestCreditCustomer, sendMessage, simulateReply, subscribeTyping, threadsOf, typingVersionNow, unreadOf, whoIsTyping } from "../../demo/chat/service";
import { today } from "../../demo/store/ids";
import { DocViewer } from "../../components/demo/docs/DocViewer";
import { QuoteDocument } from "../../components/demo/docs/QuoteDocument";
import { DeliverySheets } from "../../components/demo/DeliverySheets";
import { LoadViewer3D } from "../../components/demo/LoadViewer3D";
import { Lightbox } from "../checklist/shared";
import { money } from "../erp/shared";
import { NewThreadDialog } from "./NewThreadDialog";

type Filter = "all" | "unread" | "cliente" | "assunto" | "canal";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "cliente", label: "Clientes" },
  { id: "assunto", label: "Assuntos" },
  { id: "canal", label: "Setores" },
];

const kindIcon = { canal: Hash, cliente: Building2, assunto: MessagesSquare } as const;
const kindLabel = { canal: "Canal do setor", cliente: "Conversa sobre o cliente", assunto: "Conversa sobre um assunto" } as const;

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function timeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoje";
  if (date.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function initials(name: string) {
  return name.replace(/\(.*\)/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function hue(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

type Props = {
  /** Painel flutuante (lista e conversa alternam; sem coluna de contexto). */
  compact?: boolean;
  initialThread?: string | null;
  onExpand?: (threadId: string | null) => void;
};

export function ChatWorkspace({ compact = false, initialThread = null, onExpand }: Props) {
  const tables = useDemoTables();
  const me = viewerName();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const threads = useMemo(() => threadsOf(tables), [tables]);
  const [selected, setSelected] = useState<string | null>(() => initialThread ?? (compact ? null : threads[0]?.id ?? null));
  const [creating, setCreating] = useState(false);
  const [showContext, setShowContext] = useState(true);

  useEffect(() => { if (initialThread) setSelected(initialThread); }, [initialThread]);
  useEffect(() => { if (!compact) rememberThread(selected); }, [compact, selected]);

  const rows = useMemo(() => threads
    .map((thread) => ({ thread, last: lastMessage(tables, thread.id), unread: unreadOf(tables, thread.id, me) }))
    .filter((row) => filter === "all" || (filter === "unread" ? row.unread > 0 : row.thread.kind === filter))
    .filter((row) => !query || normalize(`${row.thread.title} ${row.last?.text ?? ""}`).includes(normalize(query)))
    .sort((a, b) => (b.last?.at ?? b.thread.createdAt).localeCompare(a.last?.at ?? a.thread.createdAt)), [threads, tables, filter, query, me]);

  const thread = threads.find((item) => item.id === selected) ?? null;
  const counts = { unread: threads.filter((item) => unreadOf(tables, item.id, me) > 0).length };

  return (
    <div className={`chat-ws${compact ? " is-compact" : ""}${compact && thread ? " has-thread" : ""}${!compact && thread && showContext ? " has-context" : ""}`}>
      <aside className="chat-list" aria-label="Conversas">
        <header className="chat-list-head">
          <h2>Conversas</h2>
          <button type="button" className="primary-button compact-button" onClick={() => setCreating(true)}><MessageSquarePlus size={15} aria-hidden="true" />&nbsp;Nova</button>
        </header>
        <label className="chat-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, assunto ou mensagem" aria-label="Buscar conversas" /></label>
        <div className="chat-filters" role="radiogroup" aria-label="Filtrar conversas">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}{item.id === "unread" && counts.unread > 0 && <b>{counts.unread}</b>}
            </button>
          ))}
        </div>
        <ul className="chat-threads">
          {rows.length === 0 && <li className="chat-empty">Nenhuma conversa encontrada.</li>}
          {rows.map(({ thread: item, last, unread }) => {
            const Icon = kindIcon[item.kind];
            return (
              <li key={item.id}>
                <button type="button" className={`chat-thread-row is-${item.kind}${item.id === selected ? " is-active" : ""}`} onClick={() => setSelected(item.id)}>
                  <span className="chat-thread-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span className="chat-thread-main">
                    <span className="chat-thread-top"><strong>{item.title}</strong><small>{last ? timeLabel(last.at) : ""}</small></span>
                    <span className="chat-thread-bottom">
                      <span>{last ? `${last.author === me ? "Você" : last.author.replace(/\s*\(.*\)/, "")}: ${last.text || (last.attachments?.length ? "📎 anexo" : "")}` : "Sem mensagens ainda"}</span>
                      {unread > 0 && <b aria-label={`${unread} não lidas`}>{unread}</b>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {thread ? (
        <ChatRoom
          key={thread.id}
          thread={thread}
          compact={compact}
          showContext={showContext}
          onToggleContext={() => setShowContext((value) => !value)}
          onBack={() => setSelected(null)}
          onExpand={onExpand}
        />
      ) : (
        !compact && <section className="chat-room chat-room-empty"><MessagesSquare size={42} aria-hidden="true" /><h3>Escolha uma conversa</h3><p>Ou comece uma nova sobre um cliente ou um assunto. Tudo fica registrado no sistema, sem depender do WhatsApp.</p><button type="button" className="primary-button" onClick={() => setCreating(true)}>Nova conversa</button></section>
      )}

      {!compact && thread && showContext && <ChatContext thread={thread} />}

      {creating && <NewThreadDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setFilter("all"); setSelected(id); }} />}
    </div>
  );
}

function ChatRoom({ thread, compact, showContext, onToggleContext, onBack, onExpand }: { thread: ChatThread; compact: boolean; showContext: boolean; onToggleContext: () => void; onBack: () => void; onExpand?: (threadId: string | null) => void }) {
  const tables = useDemoTables();
  const me = viewerName();
  const messages = messagesOf(tables, thread.id);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type?: string } | null>(null);
  const [quoteDoc, setQuoteDoc] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  useSyncExternalStore(subscribeTyping, typingVersionNow, typingVersionNow);
  const typing = whoIsTyping(thread.id);
  const Icon = kindIcon[thread.kind];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: messages.length > 0 ? "smooth" : "auto" });
    markRead(thread.id);
  }, [messages.length, thread.id, typing]);

  async function send() {
    if (sending || (!text.trim() && files.length === 0)) return;
    setSending(true);
    try {
      await sendMessage(thread.id, text, files);
      setText("");
      setFiles([]);
      simulateReply(thread.id);
    } finally {
      setSending(false);
    }
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length) setFiles((current) => [...current, ...Array.from(event.dataTransfer.files)]);
  }

  async function openAttachment(attachment: ChatAttachment, seed: number) {
    const blob = attachment.id ? await loadEvidence(attachment.id) : null;
    if (blob) { setPreview({ url: URL.createObjectURL(blob), type: blob.type || attachment.type }); return; }
    setPreview({ url: placeholderSvg(attachment.name, seed), type: "image/svg+xml" });
  }

  /** "#1139" no texto vira um atalho para o PDF do orçamento. */
  function renderText(body: string) {
    const parts = body.split(/(#\d{3,5})/g);
    return parts.map((part, index) => {
      const match = part.match(/^#(\d{3,5})$/);
      const quote = match ? tables.quotes.find((item) => item.quote_number === Number(match[1])) : undefined;
      return quote ? <button key={index} type="button" className="chat-ref" onClick={() => setQuoteDoc(quote.id)}>{part}</button> : <span key={index}>{part}</span>;
    });
  }

  let lastDay = "";
  return (
    <section
      className={`chat-room${dragging ? " is-dragging" : ""}`}
      aria-label={thread.title}
      onDragEnter={(event) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); depth.current += 1; setDragging(true); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) setDragging(false); }}
      onDrop={onDrop}
    >
      <header className="chat-room-head">
        <button type="button" className={`chat-icon-button${compact ? "" : " is-mobile-only"}`} onClick={onBack} aria-label="Voltar às conversas"><ArrowLeft size={18} aria-hidden="true" /></button>
        <span className={`chat-thread-icon is-${thread.kind}`}><Icon size={18} aria-hidden="true" /></span>
        <div className="chat-room-title">
          <strong>{thread.title}</strong>
          <small>{kindLabel[thread.kind]}{thread.members.length ? ` · ${thread.members.length} ${thread.members.length === 1 ? "participante" : "participantes"}` : ""}{thread.ref ? ` · ${thread.ref.label}` : ""}</small>
        </div>
        {compact && onExpand && <button type="button" className="chat-icon-button" onClick={() => onExpand(thread.id)} aria-label="Ampliar conversa" title="Ampliar"><Maximize2 size={17} aria-hidden="true" /></button>}
        {!compact && <button type="button" className="chat-icon-button" onClick={onToggleContext} aria-label={showContext ? "Esconder detalhes" : "Mostrar detalhes"} title={showContext ? "Esconder detalhes" : "Mostrar detalhes"}>{showContext ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRightOpen size={18} aria-hidden="true" />}</button>}
      </header>

      <div className="chat-messages" ref={scroller}>
        {messages.length === 0 && <p className="chat-empty">Nenhuma mensagem ainda. Escreva a primeira — a conversa fica registrada no sistema.</p>}
        {messages.map((message: ChatMessage, index) => {
          const day = dayLabel(message.at);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = message.author === me;
          const previous = messages[index - 1];
          const grouped = !showDay && previous?.author === message.author;
          return (
            <div key={message.id} className="chat-message-wrap">
              {showDay && <p className="chat-day"><span>{day}</span></p>}
              <div className={`chat-message${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}`}>
                {!mine && !grouped && <span className="chat-avatar" style={{ "--h": hue(message.author) } as React.CSSProperties} aria-hidden="true">{initials(message.author)}</span>}
                <div className="chat-bubble">
                  {!mine && !grouped && <strong className="chat-author">{message.author}</strong>}
                  {message.text && <p>{renderText(message.text)}</p>}
                  {message.attachments?.map((attachment, attachmentIndex) => (
                    <button key={attachmentIndex} type="button" className="chat-attachment" onClick={() => void openAttachment(attachment, index + attachmentIndex)}>
                      {attachment.type === "application/pdf" ? <FileText size={18} aria-hidden="true" /> : <Paperclip size={18} aria-hidden="true" />}
                      <span><strong>{attachment.name}</strong><small>{Math.max(1, Math.round(attachment.size / 1024))} KB · abrir</small></span>
                    </button>
                  ))}
                  <small className="chat-time">{new Date(message.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>
                </div>
              </div>
            </div>
          );
        })}
        {typing && <div className="chat-typing" role="status"><span className="chat-dots"><i /><i /><i /></span>{typing.replace(/\s*\(.*\)/, "")} está digitando…</div>}
      </div>

      {dragging && <div className="chat-drop-overlay"><Paperclip size={28} aria-hidden="true" /><strong>Solte para anexar à conversa</strong><small>Fotos, PDF, prints e áudios</small></div>}

      <footer className="chat-composer">
        {files.length > 0 && (
          <div className="chat-pending">
            {files.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={13} aria-hidden="true" />{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remover ${file.name}`}><X size={13} aria-hidden="true" /></button></span>)}
          </div>
        )}
        <div className="chat-composer-row">
          <button type="button" className="chat-icon-button" onClick={() => fileInput.current?.click()} aria-label="Anexar arquivo" title="Anexar (ou arraste para a conversa)"><Paperclip size={18} aria-hidden="true" /></button>
          <input ref={fileInput} type="file" multiple hidden accept="image/*,application/pdf,audio/*" onChange={(event) => { if (event.target.files?.length) setFiles((current) => [...current, ...Array.from(event.target.files!)]); event.target.value = ""; }} />
          <textarea rows={1} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} placeholder="Escreva uma mensagem… (#número cita um orçamento)" aria-label="Mensagem" />
          <button type="button" className="primary-button chat-send" disabled={sending || (!text.trim() && files.length === 0)} onClick={() => void send()} aria-label="Enviar"><Send size={17} aria-hidden="true" /></button>
        </div>
      </footer>

      {preview && <Lightbox url={preview.url} type={preview.type} onClose={() => setPreview(null)} />}
      {quoteDoc && (
        <DocViewer title={`Orçamento nº ${tables.quotes.find((item) => item.id === quoteDoc)?.quote_number ?? ""}`} onClose={() => setQuoteDoc(null)}>
          <QuoteDocument tables={tables} quoteId={quoteDoc} />
        </DocViewer>
      )}
    </section>
  );
}

function ChatContext({ thread }: { thread: ChatThread }) {
  const tables = useDemoTables();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { openCalculatorForCustomer } = useQuoteEditing();
  const [doc, setDoc] = useState<null | "quote" | "load-docs" | "load-3d">(null);
  const customer = thread.customerId ? tables.customers.find((item) => item.id === thread.customerId) : undefined;
  const now = today();

  return (
    <aside className="chat-context" aria-label="Detalhes da conversa">
      {customer && (() => {
        const score = customerScore(tables, customer.id, now);
        const quotes = tables.quotes.filter((quote) => quote.customer_id === customer.id);
        const approved = quotes.filter((quote) => quote.status === "approved");
        const total = approved.reduce((sum, quote) => sum + quote.grand_total, 0);
        const address = customer.address && typeof customer.address === "object" && !Array.isArray(customer.address) ? customer.address as Record<string, string | null> : {};
        const lastQuote = [...quotes].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        return (
          <section className="chat-context-card">
            <p className="drawer-kicker">Cliente</p>
            <h3>{customer.trade_name || customer.legal_name}</h3>
            <p className="muted">{customer.trade_name && customer.trade_name !== customer.legal_name && <>{customer.legal_name}<br /></>}{customer.document ?? "—"} · {customer.phone ?? "sem telefone"}<br />{[address.city, address.state].filter(Boolean).join("/")}</p>
            <div className={`chat-score is-${score.level}`}><span>Score</span><strong>{score.score}</strong><small>{score.level === "vermelho" ? `${score.maxLate} dias de atraso` : score.level === "amarelo" ? "atenção" : "em dia"}</small></div>
            <dl className="chat-facts">
              <div><dt>Em aberto</dt><dd>{money(score.openAmount)}</dd></div>
              <div><dt>Em atraso</dt><dd className={score.lateAmount > 0 ? "is-bad" : undefined}>{money(score.lateAmount)}</dd></div>
              <div><dt>Pedidos aprovados</dt><dd>{approved.length}</dd></div>
              <div><dt>Total comprado</dt><dd>{money(total)}</dd></div>
              {lastQuote && <div><dt>Último orçamento</dt><dd>#{lastQuote.quote_number}</dd></div>}
            </dl>
            <div className="chat-context-actions">
              {canAccessTab("credit", profile) && <button type="button" className="secondary-button compact-secondary" onClick={() => { requestCreditCustomer(customer.id); navigate("credit"); }}><UserRound size={15} aria-hidden="true" />&nbsp;Abrir cliente 360°</button>}
              {canAccessTab("calculator", profile) && <button type="button" className="secondary-button compact-secondary" onClick={() => openCalculatorForCustomer({ id: customer.id, name: customer.legal_name, document: customer.document })}><FileText size={15} aria-hidden="true" />&nbsp;Novo orçamento</button>}
            </div>
          </section>
        );
      })()}

      {thread.ref && (
        <section className="chat-context-card">
          <p className="drawer-kicker">Vinculado a</p>
          <h3>{thread.ref.label}</h3>
          <div className="chat-context-actions">
            {thread.ref.type === "quote" && <button type="button" className="secondary-button compact-secondary" onClick={() => setDoc("quote")}><FileText size={15} aria-hidden="true" />&nbsp;Ver PDF do orçamento</button>}
            {thread.ref.type === "load" && <>
              <button type="button" className="secondary-button compact-secondary" onClick={() => setDoc("load-3d")}><Boxes size={15} aria-hidden="true" />&nbsp;Ver carga em 3D</button>
              <button type="button" className="secondary-button compact-secondary" onClick={() => setDoc("load-docs")}><Truck size={15} aria-hidden="true" />&nbsp;Romaneio e fichas</button>
            </>}
          </div>
        </section>
      )}

      <section className="chat-context-card">
        <p className="drawer-kicker">{thread.kind === "canal" ? "Integrantes do setor" : "Participantes"}</p>
        <ul className="chat-members">
          {(thread.members.length ? thread.members : ["Equipe Qualinutri"]).map((member) => <li key={member}><span className="chat-avatar" style={{ "--h": hue(member) } as React.CSSProperties} aria-hidden="true">{initials(member)}</span>{member}</li>)}
        </ul>
        {thread.createdAt && <p className="muted chat-created">Criada por {thread.createdBy} em {new Date(thread.createdAt).toLocaleDateString("pt-BR")}</p>}
      </section>

      {doc === "quote" && thread.ref && (
        <DocViewer title={thread.ref.label} onClose={() => setDoc(null)}><QuoteDocument tables={tables} quoteId={thread.ref.id} /></DocViewer>
      )}
      {doc === "load-docs" && thread.ref && <DeliverySheets loadId={thread.ref.id} initial="romaneio" onClose={() => setDoc(null)} />}
      {doc === "load-3d" && thread.ref && <LoadViewer3D loadId={thread.ref.id} onClose={() => setDoc(null)} />}
    </aside>
  );
}
