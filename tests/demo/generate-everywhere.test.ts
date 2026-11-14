import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

const today = new Date(2026, 10, 13, 10);
beforeEach(async () => { installMemoryStorage(); vi.resetModules(); (await import("../../src/demo/store/ids")).setToday(today); });

const FLEET_CHECKS = ["Pneus (calibragem e desgaste)", "Freios", "Luzes, setas e faróis", "Óleo e água no nível", "Sem vazamentos", "Extintor e triângulo", "Documentos (CRLV, ANTT)", "Cinto e tacógrafo", "Carroceria e lona", "Carroceria limpa (sem resto de carga)"];

test("conferência só é salva com todos os itens conferidos", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { saveRecord } = await import("../../src/demo/checklist/service");
  const tables = db.read();
  const truck = tables.vehicles[0];
  const driver = tables.checklist.employees.find((item) => item.role === "Motorista")!;
  const values = { moment: "Saída", driver: driver.id, odometer: 152_300 };
  await expect(saveRecord({ tab: "fleetCheck", targetId: truck.id, checks: { Freios: true }, values, notes: "", evidence: [] })).rejects.toThrow("Confira todos os itens");
  const checks = Object.fromEntries(FLEET_CHECKS.map((item) => [item, item !== "Freios"]));
  const saved = await saveRecord({ tab: "fleetCheck", targetId: truck.id, checks, values, notes: "Pedal baixo.", evidence: [] });
  expect(saved.status).toBe("nao_conforme");
  expect(saved.targetLabel).toBe(truck.name);
});

test("a conferência inclui caminhões, carros e empilhadeira, com histórico no seed", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { targetsFor } = await import("../../src/demo/checklist/compliance");
  const tables = db.read();
  const labels = targetsFor("fleetCheck", tables).map((item) => item.label);
  expect(labels).toEqual(expect.arrayContaining([...tables.vehicles.map((item) => item.name), "Empilhadeira 2,5 t", "Strada · QCB-3D10"]));
  expect(labels.some((label) => label.includes("Moinho"))).toBe(false);
  expect(tables.checklist.records.filter((record) => record.tab === "fleetCheck").length).toBeGreaterThan(10);
});

test("conferência reprovada vira pedido de conserto com fotos e vai para aprovação", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { createFleetRequest } = await import("../../src/demo/erp/service");
  const evidence = [{ id: "ev-1", name: "pneu.jpg", type: "image/jpeg", size: 1000 }];
  await expect(createFleetRequest({ vehicle: "Graneleiro 01 · 10 t", problem: "Freios", quotes: [] })).rejects.toThrow("orçamento");
  await createFleetRequest({ vehicle: "Graneleiro 01 · 10 t", problem: "Conferência: Freios reprovado.", quotes: [{ shop: "Oficina interna", value: 850, days: 1 }], evidence, checkRecordId: "rec-1" });
  const tables = db.read();
  const request = tables.erp.fleetRequests[0];
  expect(request.evidence).toEqual(evidence);
  expect(request.checkRecordId).toBe("rec-1");
  expect(tables.erp.approvals.find((item) => item.ref === request.id)?.status).toBe("pendente");
});

test("entrada de matéria-prima soma no estoque e atualiza o custo médio", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { receiveMaterial } = await import("../../src/demo/erp/service");
  const before = { ...db.read().erp.materials[0] };
  await expect(receiveMaterial(before.id, 0)).rejects.toThrow("kg");
  await receiveMaterial(before.id, 10_000, before.pricePerKg * 2);
  const after = db.read().erp.materials[0];
  expect(after.stockKg).toBe(before.stockKg + 10_000);
  const expected = (before.stockKg * before.pricePerKg + 10_000 * before.pricePerKg * 2) / (before.stockKg + 10_000);
  expect(after.pricePerKg).toBeCloseTo(expected, 3);
});

test("administrador edita uma seção da política e a alteração fica no histórico", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { savePolicySection, loadCommercialPolicy } = await import("../../src/demo/services/policyService");
  const title = db.read().catalog.policySections[0].title;
  await savePolicySection(title, "Novo texto da seção.", false);
  const policy = await loadCommercialPolicy();
  expect(policy.sections[0].content).toBe("Novo texto da seção.");
  expect(db.read().catalog.changeLog[0].what).toContain(title);
  await expect(savePolicySection(title, "   ", false)).rejects.toThrow("vazio");
  const { setDemoRole } = await import("../../src/demo/app/session");
  setDemoRole("comercial");
  await expect(savePolicySection(title, "Outro", false)).rejects.toThrow("administradores");
});

test("conta a pagar parcelada é lançada e o pagamento sai do saldo e entra no extrato conciliado", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { createPayable, payPayable } = await import("../../src/demo/erp/service");
  await expect(createPayable({ supplier: " ", category: "Serviços", description: "x", dueDate: "2026-12-01", amount: 10 })).rejects.toThrow("fornecedor");
  const created = await createPayable({ supplier: "LabAgro Análises", category: "Serviços", description: "Laudos", dueDate: "2026-11-30", amount: 1000, installments: 3 });
  expect(created.map((item) => item.dueDate)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
  expect(created.map((item) => item.amount)).toEqual([333.33, 333.33, 333.34]);
  const before = db.read().erp.banks.find((bank) => bank.id === "itau")!.balance;
  const paid = await payPayable(created[0].id, "itau");
  expect(paid.paidAt).toBeTruthy();
  const tables = db.read();
  expect(tables.erp.banks.find((bank) => bank.id === "itau")!.balance).toBeCloseTo(before - 333.33, 2);
  expect(tables.erp.statement[0]).toMatchObject({ amount: -333.33, matched: created[0].id });
  await expect(payPayable(created[0].id, "itau")).rejects.toThrow("já foi paga");
});

test("conta a receber avulsa entra na lista e a baixa credita o banco", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { createReceivable, receiveTitle } = await import("../../src/demo/erp/service");
  const { receivables } = await import("../../src/demo/kpis/finance");
  const { titleKey } = await import("../../src/demo/erp/finance");
  const row = await createReceivable({ customer: "Sucata Juara", description: "Venda de sacaria usada", dueDate: "2026-11-20", amount: 640 });
  const title = receivables(db.read(), today).find((item) => item.description === "Venda de sacaria usada")!;
  expect(title).toMatchObject({ customer: "Sucata Juara", amount: 640, paidAt: null });
  const before = db.read().erp.banks.find((bank) => bank.id === "sicoob")!.balance;
  await receiveTitle(titleKey(title), "sicoob");
  const tables = db.read();
  expect(receivables(tables, today).find((item) => item.quoteId === `avulso:${row.id}`)?.paidAt).toBeTruthy();
  expect(tables.erp.banks.find((bank) => bank.id === "sicoob")!.balance).toBeCloseTo(before + 640, 2);
  await expect(receiveTitle(titleKey(title), "sicoob")).rejects.toThrow("já foi recebido");
  const late = receivables(tables, today).find((item) => !item.paidAt && item.dueDate < "2026-11-13" && !item.description);
  if (late) {
    await receiveTitle(titleKey(late), "itau");
    expect(receivables(db.read(), today).find((item) => titleKey(item) === titleKey(late))?.paidAt).toBeTruthy();
  }
});
