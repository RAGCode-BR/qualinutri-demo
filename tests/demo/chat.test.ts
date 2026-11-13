import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

const today = new Date(2026, 10, 13, 10);
beforeEach(async () => { installMemoryStorage(); vi.resetModules(); (await import("../../src/demo/store/ids")).setToday(today); });

test("as conversas de exemplo são criadas uma vez: canais, clientes e assuntos", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { ensureChat } = await import("../../src/demo/chat/seed");
  const { threadsOf } = await import("../../src/demo/chat/service");
  const tables = db.read();
  const kinds = new Set(threadsOf(tables).map((thread) => thread.kind));
  expect(kinds).toEqual(new Set(["canal", "cliente", "assunto"]));
  const count = tables.erp.chat.length;
  expect(ensureChat(tables, today)).toBe(false);
  expect(tables.erp.chat.length).toBe(count);
});

test("dados antigos (sem conversas) ganham as conversas sem perder mensagens", async () => {
  const { buildSeed } = await import("../../src/demo/seed");
  const { ensureChat } = await import("../../src/demo/chat/seed");
  const tables = buildSeed(today);
  tables.erp.chat.push({ id: "old", thread: "geral", author: "Alguém", text: "mensagem antiga", at: today.toISOString() });
  expect(ensureChat(tables, today)).toBe(true);
  expect(tables.erp.chat.some((message) => message.id === "old")).toBe(true);
  expect(tables.erp.threads?.length).toBeGreaterThan(5);
});

test("conversa de cliente não duplica; enviar zera o não lido de quem enviou", async () => {
  const { db } = await import("../../src/demo/store/db");
  const service = await import("../../src/demo/chat/service");
  const customer = db.read().customers[5];
  const first = service.createThread({ kind: "cliente", customerId: customer.id });
  const second = service.createThread({ kind: "cliente", customerId: customer.id });
  expect(second).toBe(first);
  expect(service.threadsOf(db.read()).filter((thread) => thread.id === first)).toHaveLength(1);
  await service.sendMessage(first, "Olá equipe");
  expect(service.messagesOf(db.read(), first).at(-1)?.text).toBe("Olá equipe");
  expect(service.unreadOf(db.read(), first)).toBe(0);
});

test("assunto exige título e pode apontar para um orçamento", async () => {
  const { db } = await import("../../src/demo/store/db");
  const service = await import("../../src/demo/chat/service");
  expect(() => service.createThread({ kind: "assunto", title: "  " })).toThrow();
  const quote = db.read().quotes[0];
  const id = service.createThread({ kind: "assunto", title: "Prazo de entrega", ref: { type: "quote", id: quote.id, label: `Orçamento #${quote.quote_number}` } });
  const thread = service.threadsOf(db.read()).find((item) => item.id === id);
  expect(thread?.title).toBe("Prazo de entrega");
  expect(thread?.ref?.id).toBe(quote.id);
});

test("marcar como lido zera as não lidas da conversa", async () => {
  const { db } = await import("../../src/demo/store/db");
  const service = await import("../../src/demo/chat/service");
  const withUnread = service.threadsOf(db.read()).find((thread) => service.unreadOf(db.read(), thread.id) > 0);
  expect(withUnread).toBeDefined();
  service.markRead(withUnread!.id);
  expect(service.unreadOf(db.read(), withUnread!.id)).toBe(0);
});
