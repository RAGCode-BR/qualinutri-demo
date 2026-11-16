import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(async () => {
  installMemoryStorage();
  vi.resetModules();
  (await import("../../src/demo/store/ids")).setToday(new Date(2026, 10, 13, 10));
});

const date = "2026-11-13";
const entry = { account: "daily", date, document: "VEN-999", description: "Movimento de teste", amount: 120, kind: "Recebimento à vista", method: "Dinheiro" } as const;

test("registradora exige a sessão do operador e o fechamento separa Pix do dinheiro contado", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { openCashSession, addCashEntry, closeCashSession, reopenCashSession, cashLines, sessionTotals } = await import("../../src/demo/erp/cash");
  const { sessionReport } = await import("../../src/demo/erp/cashReports");
  expect(() => addCashEntry(entry, "example-session")).toThrow("sessão");
  const session = openCashSession("daily", 100);
  expect(() => openCashSession("safe", 50)).toThrow("sessão aberta");
  addCashEntry(entry, session.id);
  addCashEntry({ ...entry, account: "sicoob", method: "Pix", amount: 290 }, session.id);
  expect(sessionTotals(cashLines(db.read()), session)).toMatchObject({ entries: 120, closing: 220 });
  closeCashSession(session.id, 215);
  expect(() => addCashEntry(entry, session.id)).toThrow("sessão");
  const report = sessionReport(cashLines(db.read()), [], session, true);
  expect(report.tables[1].rows).toEqual(expect.arrayContaining([expect.arrayContaining(["Pix"]), expect.arrayContaining(["Dinheiro"])]));
  expect(report.tables[2].rows[0].at(-1)).toMatch(/-R\$\s*5,00/);
  reopenCashSession(session.id);
  addCashEntry({ ...entry, kind: "Saída avulsa", amount: 20 }, session.id);
  expect(sessionTotals(cashLines(db.read()), session).closing).toBe(200);
});

test("baixa de um título no cartão mantém parcelas fora do banco até a compensação efetiva e não duplica crédito", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { openCashSession, cashState, cashLines, clearPendingCash, cashRound, ledgerSummary } = await import("../../src/demo/erp/cash");
  const { createReceivable, receiveTitle } = await import("../../src/demo/erp/service");
  const title = await createReceivable({ customer: "Cliente teste", description: "Ração teste", dueDate: date, amount: 101.01 });
  const key = `avulso:${title.id}:1`;
  const bank = db.read().erp.banks.find((item) => item.id === "sicoob")!;
  const before = bank.balance;
  openCashSession("daily", 0);
  const receipt = await receiveTitle(key, "sicoob", { date, cashAccount: "daily", method: "Cartão crédito", interest: 0, fine: 0, discount: 0, note: "",
    instrument: { reference: "TESTE-101", brand: "Visa", due: "2027-01-31", fee: 3.01, installments: 2 } });
  expect(receipt.bank).toBeNull();
  const items = cashState(db.read()).pending.filter((item) => receipt.pendingIds?.includes(item.id));
  expect(items.map((item) => [item.gross, item.fee, item.due])).toEqual([[50.51, 1.51, "2027-01-31"], [50.5, 1.5, "2027-02-28"]]);
  expect(bank.balance).toBe(before);
  clearPendingCash(items[0].id, "sicoob", 48.5, date);
  expect(bank.balance).toBe(cashRound(before + 48.5));
  expect(items[0].fee).toBe(2.01);
  const flows = cashLines(db.read()).filter((line) => line.pendingId === items[0].id);
  expect(ledgerSummary(flows.filter((line) => line.account === "cards")).movement).toBe(0);
  expect(flows.filter((line) => line.account === "sicoob")).toHaveLength(1);
  expect(() => clearPendingCash(items[0].id, "sicoob", 48.5, date)).toThrow("já foi compensado");
});

test("extrato filtra emissão e compensação separadamente e posição mantém o saldo anterior", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { cashLines, clearPendingCash, transferCash } = await import("../../src/demo/erp/cash");
  const { filterLedger, position } = await import("../../src/demo/erp/cashReports");
  const tables = db.read();
  transferCash("daily", "safe", 100, date, "Recolhimento de teste");
  const filter = { start: date, end: date, account: "daily", basis: "emission", status: "all", query: "", method: "", kind: "", origin: "", min: "", max: "" } as const;
  expect(position(tables, cashLines(tables), filter, ["daily"])[0]).toMatchObject({ opening: 570, exits: 100, closing: 470 });
  clearPendingCash("card-debit", "sicoob", 343, date);
  const card = { ...filter, account: "cards", query: "DEMO-8102", origin: "Balcão" } as const;
  expect(filterLedger(cashLines(tables), card)).toHaveLength(0);
  expect(filterLedger(cashLines(tables), { ...card, basis: "clearing" })).toHaveLength(1);
});

test("PDF criado de um relatório longo contém o título, múltiplas páginas e numeração", async () => {
  const { createCashPdf } = await import("../../src/features/erp/cashPdf");
  const pdf = createCashPdf({ title: "Movimento Diário do Caixa", subtitle: "Período de teste", tables: [
    { columns: ["Documento", "Histórico"], rows: Array.from({ length: 120 }, (_, i) => [`DOC-${i + 1}`, "Movimento da demonstração"]), total: ["Total", "120"] },
  ] });
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  const file = pdf.output();
  expect(file).toMatch(/^%PDF-/);
  expect(file).toContain("DOC-120");
  expect(file).toContain(`gina ${pdf.getNumberOfPages()} de ${pdf.getNumberOfPages()}`);
});

test("transferências e avulsos na conta aberta entram no fechamento da sessão", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { openCashSession, transferCash, addCashEntry, cashLines, sessionTotals } = await import("../../src/demo/erp/cash");
  const session = openCashSession("daily", 100);
  transferCash("daily", "safe", 40, date, "Recolhimento");
  addCashEntry({ ...entry, amount: 15 });
  expect(sessionTotals(cashLines(db.read()), session)).toMatchObject({ entries: 15, exits: 40, closing: 75 });
});

test("transferência inválida para sessão de outro operador não debita a origem", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { openCashSession, transferCash } = await import("../../src/demo/erp/cash");
  const session = openCashSession("daily", 100);
  session.operatorId = "outro-operador";
  const before = JSON.stringify(db.read());
  expect(() => transferCash("sicoob", "daily", 40, date, "Suprimento")).toThrow("operador");
  expect(JSON.stringify(db.read())).toBe(before);
});

test("busca de extrato mantém documento e forma depois da conciliação da baixa", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { createPayable, payPayable, reconcile } = await import("../../src/demo/erp/service");
  const { cashLines } = await import("../../src/demo/erp/cash");
  const [payable] = await createPayable({ supplier: "Fornecedor teste", category: "Serviços", description: "Serviço", document: "NF-4321", dueDate: date, amount: 20 });
  await payPayable(payable.id, "sicoob", { method: "Pix", date, interest: 0, fine: 0, discount: 0, note: "" });
  const line = db.read().erp.statement.find((item) => item.suggestion === payable.id)!;
  await reconcile(line.id, null);
  expect(cashLines(db.read()).find((item) => item.id === line.id)).toMatchObject({ document: "NF-4321", origin: "Baixa", method: "Pix" });
});

test("conta a receber rejeita data impossível e valor infinito sem gravar", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { createReceivable, createPayable } = await import("../../src/demo/erp/service");
  const before = JSON.stringify(db.read());
  await expect(createReceivable({ customer: "Teste", description: "Teste", amount: Infinity, dueDate: date })).rejects.toThrow();
  await expect(createReceivable({ customer: "Teste", description: "Teste", amount: 10, dueDate: "2026-02-31" })).rejects.toThrow();
  await expect(createPayable({ supplier: "Teste", category: "Serviços", description: "Teste", amount: Number.MAX_VALUE, dueDate: date })).rejects.toThrow();
  expect(JSON.stringify(db.read())).toBe(before);
});
