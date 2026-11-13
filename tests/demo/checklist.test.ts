import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

const today = new Date(2026, 10, 13, 10);

beforeEach(async () => {
  installMemoryStorage();
  vi.resetModules();
  (await import("../../src/demo/store/ids")).setToday(today);
});

test("análise de milho fora do padrão fica não conforme", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { evaluateStatus } = await import("../../src/demo/checklist/compliance");
  const tables = db.read();
  const corn = tables.checklist.materials.find((material) => material.name.startsWith("Milho"))!;
  const ok = evaluateStatus("rawAnalyses", { checks: {}, values: { material: corn.id, protein: 7.8, moisture: 13, aflatoxin: 5 }, stage: null }, tables, today);
  const bad = evaluateStatus("rawAnalyses", { checks: {}, values: { material: corn.id, protein: 7.8, moisture: 15.2, aflatoxin: 5 }, stage: null }, tables, today);
  expect(ok).toBe("conforme");
  expect(bad).toBe("nao_conforme");
});

test("checklist reprovado e fluxo aberto", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { evaluateStatus } = await import("../../src/demo/checklist/compliance");
  const tables = db.read();
  expect(evaluateStatus("safety", { checks: { Capacete: true, Luvas: false }, values: {}, stage: null }, tables, today)).toBe("nao_conforme");
  expect(evaluateStatus("quality", { checks: {}, values: { severity: "Média" }, stage: "Aberta" }, tables, today)).toBe("pendente");
  expect(evaluateStatus("quality", { checks: {}, values: { severity: "Alta" }, stage: "Em tratamento" }, tables, today)).toBe("nao_conforme");
  expect(evaluateStatus("quality", { checks: {}, values: { severity: "Alta" }, stage: "Encerrada" }, tables, today)).toBe("conforme");
  expect(evaluateStatus("production", { checks: {}, values: {}, stage: "Aberta" }, tables, today)).toBe("nao_conforme");
});

test("seed tem histórico em todas as abas e o painel soma certo", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { tabSummary } = await import("../../src/demo/checklist/compliance");
  const { CHECKLIST_TABS } = await import("../../src/demo/checklist/tabs");
  const tables = db.read();
  for (const tab of CHECKLIST_TABS) {
    const records = tables.checklist.records.filter((record) => record.tab === tab.id);
    expect(records.length, tab.id).toBeGreaterThan(5);
    const summary = tabSummary(tab.id, tables, today);
    expect(summary.done + summary.nonConforming + summary.pending, tab.id).toBeGreaterThan(0);
    expect(summary.pct).toBeGreaterThanOrEqual(0);
    expect(summary.pct).toBeLessThanOrEqual(100);
  }
});

test("registrar EPI de colaborador atrasado tira a pendência", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { overdueTargets } = await import("../../src/demo/checklist/compliance");
  const { saveRecord } = await import("../../src/demo/checklist/service");
  const overdue = overdueTargets("safety", db.read(), today);
  expect(overdue.length).toBeGreaterThan(0);
  const target = overdue[0];
  const checks = Object.fromEntries(["Capacete", "Botina de segurança", "Luvas", "Protetor auricular", "Máscara PFF2", "Óculos de proteção", "Uniforme"].map((item) => [item, true]));
  const saved = await saveRecord({ tab: "safety", targetId: target.id, checks, values: { ca: "12345", caValidity: "2027-12-31", training: true }, notes: "", evidence: [] });
  expect(saved.status).toBe("conforme");
  expect(overdueTargets("safety", db.read(), today).some((item) => item.id === target.id)).toBe(false);
});

test("custo acumulado de manutenção por veículo", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { costByTarget } = await import("../../src/demo/checklist/compliance");
  const tables = db.read();
  const costs = costByTarget("maintenance", tables);
  const vehicle = tables.vehicles[0].id;
  const expected = tables.checklist.records.filter((record) => record.tab === "maintenance" && record.targetId === vehicle)
    .reduce((total, record) => total + Number(record.values.parts ?? 0) + Number(record.values.labor ?? 0), 0);
  expect(costs.get(vehicle) ?? 0).toBeCloseTo(expected, 2);
});
