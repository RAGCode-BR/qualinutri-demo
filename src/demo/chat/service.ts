import { db } from "../store/db";
import { isoDateTime, newId, stableHash, today } from "../store/ids";
import { viewerName } from "../app/session";
import { storeEvidence } from "../checklist/evidence";
import type { DemoTables } from "../store/types";
import type { ChatAttachment, ChatMessage, ChatRef, ChatThread } from "../erp/types";
import { CHANNELS, TEAM } from "./seed";

/** Todas as conversas, incluindo as de cliente criadas antes do módulo (só com mensagens). */
export function threadsOf(tables: DemoTables): ChatThread[] {
  const list = [...(tables.erp.threads ?? [])];
  if (!list.some((thread) => thread.id === "geral")) {
    const geral = CHANNELS[0];
    list.unshift({ id: geral.id, kind: "canal", title: geral.title, customerId: null, ref: null, members: geral.members, createdBy: TEAM.agnaldo, createdAt: "" });
  }
  for (const message of tables.erp.chat) {
    if (list.some((thread) => thread.id === message.thread)) continue;
    if (message.thread.startsWith("cliente:")) {
      const customerId = message.thread.slice("cliente:".length);
      const customer = tables.customers.find((item) => item.id === customerId);
      list.push({ id: message.thread, kind: "cliente", title: customer ? customer.trade_name || customer.legal_name : "Cliente", customerId, ref: null, members: [], createdBy: message.author, createdAt: message.at });
    }
  }
  return list;
}

export function messagesOf(tables: DemoTables, threadId: string): ChatMessage[] {
  return tables.erp.chat.filter((message) => message.thread === threadId).sort((a, b) => a.at.localeCompare(b.at));
}

export function lastMessage(tables: DemoTables, threadId: string): ChatMessage | undefined {
  return messagesOf(tables, threadId).at(-1);
}

export function unreadOf(tables: DemoTables, threadId: string, me = viewerName()): number {
  const read = tables.erp.chatReads?.[threadId] ?? "";
  return tables.erp.chat.filter((message) => message.thread === threadId && message.author !== me && message.at > read).length;
}

export function totalUnread(tables: DemoTables, me = viewerName()): number {
  return threadsOf(tables).reduce((sum, thread) => sum + unreadOf(tables, thread.id, me), 0);
}

export function markRead(threadId: string): void {
  const tables = db.read();
  const last = lastMessage(tables, threadId);
  if (!last || (tables.erp.chatReads?.[threadId] ?? "") >= last.at) return;
  db.write((current) => { current.erp.chatReads = { ...(current.erp.chatReads ?? {}), [threadId]: last.at }; });
}

const slug = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export type NewThread = { kind: "cliente"; customerId: string } | { kind: "assunto"; title: string; ref?: ChatRef | null; customerId?: string | null };

/** Abre (ou reaproveita) a conversa do cliente, ou cria uma conversa sobre um assunto. Devolve o id. */
export function createThread(input: NewThread, firstMessage?: string): string {
  const me = viewerName();
  const tables = db.read();
  let id: string;
  if (input.kind === "cliente") {
    id = `cliente:${input.customerId}`;
    const exists = threadsOf(tables).find((thread) => thread.id === id);
    const customer = tables.customers.find((item) => item.id === input.customerId);
    if (!customer) throw new Error("Cliente não encontrado.");
    db.write((current) => {
      current.erp.threads ??= [];
      if (!exists || !current.erp.threads.some((thread) => thread.id === id)) {
        current.erp.threads.push({ id, kind: "cliente", title: customer.trade_name || customer.legal_name, customerId: customer.id, ref: null, members: [me], createdBy: me, createdAt: isoDateTime(new Date()) });
      }
    });
  } else {
    const title = input.title.trim();
    if (!title) throw new Error("Escreva o assunto da conversa.");
    id = `assunto:${slug(title) || "conversa"}-${newId().slice(0, 6)}`;
    db.write((current) => {
      current.erp.threads ??= [];
      current.erp.threads.push({ id, kind: "assunto", title, customerId: input.customerId ?? null, ref: input.ref ?? null, members: [me], createdBy: me, createdAt: isoDateTime(new Date()) });
    });
  }
  if (firstMessage?.trim()) void sendMessage(id, firstMessage);
  return id;
}

export async function sendMessage(threadId: string, text: string, files: File[] = []): Promise<void> {
  const body = text.trim();
  if (!body && files.length === 0) return;
  const attachments: ChatAttachment[] = [];
  for (const file of files) {
    const ref = await storeEvidence(file);
    attachments.push({ id: ref.id, name: ref.name, type: ref.type, size: ref.size });
  }
  const me = viewerName();
  const at = isoDateTime(new Date(Math.max(Date.now(), today().getTime())));
  db.write((tables) => {
    tables.erp.chat.push({ id: newId(), thread: threadId, author: me, text: body, at, ...(attachments.length ? { attachments } : {}) });
    tables.erp.chatReads = { ...(tables.erp.chatReads ?? {}), [threadId]: at };
    const thread = tables.erp.threads?.find((item) => item.id === threadId);
    if (thread && !thread.members.includes(me)) thread.members.push(me);
  });
}

/* ---------- "Digitando…" e respostas simuladas dos colegas ---------- */

const typing = new Map<string, string>();
const typingListeners = new Set<() => void>();
let typingVersion = 0;

export function subscribeTyping(listener: () => void) {
  typingListeners.add(listener);
  return () => { typingListeners.delete(listener); };
}
export function typingVersionNow() { return typingVersion; }
export function whoIsTyping(threadId: string): string | null { return typing.get(threadId) ?? null; }
function setTyping(threadId: string, author: string | null) {
  if (author) typing.set(threadId, author); else typing.delete(threadId);
  typingVersion += 1;
  for (const listener of [...typingListeners]) listener();
}

const REPLIES: Record<string, string[]> = {
  [TEAM.ana]: ["Anotado, já registrei no cadastro.", "Vou confirmar com o cliente e te aviso.", "Feito. Deixei o comprovante anexado aqui."],
  [TEAM.cibelly]: ["Conferi aqui no financeiro, está tudo certo.", "Vou checar o extrato do Sicoob e te respondo.", "Esse título já está antecipado, cuidado ao renegociar."],
  [TEAM.rogerio]: ["Beleza, já ajusto o roteiro.", "Caminhão separado. Saída confirmada.", "Vou conferir no pátio e te falo."],
  [TEAM.cassio]: ["Produção ok, sai no horário.", "Vou ver o estoque de insumos e te confirmo.", "Fórmula ajustada, pode seguir."],
  [TEAM.joao]: ["Registrei no checklist de qualidade.", "Vou coletar amostra e te passo o laudo.", "Tudo dentro do padrão."],
  [TEAM.agnaldo]: ["Ok, pode seguir.", "Me manda o resumo depois.", "Aprovado."],
  [TEAM.carla]: ["Combinado, falo com o cliente agora.", "Já atualizei o orçamento.", "Show, obrigada!"],
  [TEAM.rafael]: ["Fechado, sigo por aqui.", "Vou passar lá amanhã na visita.", "Beleza, obrigado!"],
  [TEAM.daniel]: ["Ok, vou ajustar a região da carga.", "Combinado.", "Valeu!"],
};

/** Quem responde: um integrante da conversa (que não seja quem escreveu). */
export function replierFor(thread: ChatThread | undefined, me: string, seed: string): string {
  const members = (thread?.members ?? []).filter((member) => member !== me && REPLIES[member]);
  const pool = members.length ? members : thread?.kind === "cliente" ? [TEAM.ana, TEAM.cibelly] : [TEAM.agnaldo, TEAM.ana];
  return pool[stableHash(seed) % pool.length];
}

/** Depois de uma mensagem, um colega "digita" e responde (só na demonstração). */
export function simulateReply(threadId: string): () => void {
  const tables = db.read();
  const me = viewerName();
  const thread = threadsOf(tables).find((item) => item.id === threadId);
  const seed = `${threadId}:${tables.erp.chat.length}`;
  const author = replierFor(thread, me, seed);
  const options = REPLIES[author] ?? ["Ok!"];
  const text = options[stableHash(seed + "r") % options.length];
  const start = window.setTimeout(() => setTyping(threadId, author), 900);
  const done = window.setTimeout(() => {
    setTyping(threadId, null);
    const at = isoDateTime(new Date(Math.max(Date.now(), today().getTime())));
    db.write((current) => { current.erp.chat.push({ id: newId(), thread: threadId, author, text, at }); });
  }, 3200);
  return () => { window.clearTimeout(start); window.clearTimeout(done); setTyping(threadId, null); };
}

/* ---------- Abrir uma conversa a partir de outras telas ---------- */

let pendingThread: string | null = null;
/** Última conversa aberta na tela Conversas (ao voltar para ela, reabre a mesma). */
let lastThread: string | null = null;
export function rememberThread(threadId: string | null) { lastThread = threadId; }
export function lastOpenThread(): string | null { return lastThread; }
export function requestThread(threadId: string) { pendingThread = threadId; }
export function peekRequestedThread(): string | null { return pendingThread; }
export function clearRequestedThread() { pendingThread = null; }

/* ---------- Abrir o Crédito 360° já com um cliente escolhido ---------- */

let pendingCreditCustomer: string | null = null;
export function requestCreditCustomer(customerId: string) { pendingCreditCustomer = customerId; }
export function peekCreditCustomer(): string | null { return pendingCreditCustomer; }
export function clearCreditCustomer() { pendingCreditCustomer = null; }
