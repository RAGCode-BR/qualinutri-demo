import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

const today = new Date(2026, 10, 13, 15, 0, 0);

beforeEach(async () => {
  installMemoryStorage();
  vi.resetModules();
  (await import("../../src/demo/store/ids")).setToday(today);
});

test("gaveta e cartão usam a mesma seleção", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { dashboardKpis, periodFor } = await import("../../src/demo/kpis/dashboard");
  for (const key of ["today", "7d", "month"] as const) {
    const kpis = dashboardKpis(db.read(), periodFor(key, today), today);
    const sales = kpis.find((kpi) => kpi.id === "sales")!;
    const sum = sales.selection.rows.reduce((total, row) => total + Number(row.total), 0);
    expect(Math.abs(sum - sales.value)).toBeLessThan(0.01);
    const overdue = kpis.find((kpi) => kpi.id === "overdue")!;
    expect(overdue.selection.rows.length).toBe(overdue.value);
  }
});

test("periodFor mês começa no dia 1 e hoje é um dia só", async () => {
  const { periodFor, previousPeriod } = await import("../../src/demo/kpis/dashboard");
  expect(periodFor("month", today)).toEqual({ from: "2026-11-01", to: "2026-11-13" });
  expect(periodFor("today", today)).toEqual({ from: "2026-11-13", to: "2026-11-13" });
  expect(previousPeriod({ from: "2026-11-13", to: "2026-11-13" })).toEqual({ from: "2026-11-12", to: "2026-11-12" });
});

test("parcelamento das vendas", async () => {
  const { installmentsFor } = await import("../../src/demo/kpis/finance");
  const parcelado = installmentsFor("30/60/90 ou 60 dd", "installments", 900, "2026-11-01T12:00:00.000Z");
  expect(parcelado.map((item) => item.dueDate)).toEqual(["2026-12-01", "2026-12-31", "2027-01-30"]);
  expect(parcelado.reduce((total, item) => total + item.amount, 0)).toBeCloseTo(900, 2);
  expect(installmentsFor("30/60/90 ou 60 dd", "single", 900, "2026-11-01T12:00:00.000Z")).toEqual([{ dueDate: "2026-12-31", amount: 900 }]);
  expect(installmentsFor("À vista", null, 100, "2026-11-01T12:00:00.000Z")).toEqual([{ dueDate: "2026-11-01", amount: 100 }]);
  const odd = installmentsFor("30/60 ou 45 dd", "installments", 100, "2026-11-01T12:00:00.000Z");
  expect(odd.map((item) => item.amount)).toEqual([50, 50]);
  const thirds = installmentsFor("30/60/90 ou 60 dd", "installments", 100, "2026-11-01T12:00:00.000Z");
  expect(thirds.reduce((total, item) => total + item.amount, 0)).toBeCloseTo(100, 2);
});

test("aprovar um orçamento hoje aumenta as vendas de hoje", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { dashboardKpis, periodFor } = await import("../../src/demo/kpis/dashboard");
  const quotes = await import("../../src/demo/services/quoteService");
  const before = dashboardKpis(db.read(), periodFor("today", today), today).find((kpi) => kpi.id === "sales")!.value;
  const draft = db.read().quotes.find((quote) => quote.status === "draft")!;
  await quotes.advanceQuoteStatus(draft.id, "issued");
  await quotes.advanceQuoteStatus(draft.id, "approved");
  const after = dashboardKpis(db.read(), periodFor("today", today), today).find((kpi) => kpi.id === "sales")!.value;
  expect(after - before).toBeCloseTo(draft.product_subtotal, 2);
});
