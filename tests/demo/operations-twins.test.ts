import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

test("comercial só vê as próprias visitas; admin vê todas", async () => {
  const { setDemoRole, getDemoViewer } = await import("../../src/demo/app/session");
  const visits = await import("../../src/demo/services/visitService");
  const range = { from: "2000-01-01", to: "2100-01-01" };
  const all = await visits.listVisits(range);
  setDemoRole("comercial");
  const own = await visits.listVisits(range);
  expect(own.length).toBeGreaterThan(0);
  expect(own.length).toBeLessThan(all.length);
  expect(own.every((visit) => visit.seller_id === getDemoViewer().id)).toBe(true);
  setDemoRole("administrador");
});

test("registrar visita de fechamento com orçamento de outro cliente é recusado", async () => {
  const { db } = await import("../../src/demo/store/db");
  const visits = await import("../../src/demo/services/visitService");
  const tables = db.read();
  const quote = tables.quotes.find((item) => item.customer_id)!;
  const other = tables.customers.find((customer) => customer.id !== quote.customer_id && customer.active)!;
  await expect(visits.registerVisit(null, { sellerId: "demo-admin", customerId: other.id, propertyId: null, visitedDate: "2026-11-10", developed: "Teste", types: ["closing"], quoteId: quote.id, nextAction: null })).rejects.toThrow("não é deste cliente");
  const id = await visits.registerVisit(null, { sellerId: "demo-admin", customerId: other.id, propertyId: null, visitedDate: "2026-11-10", developed: "Teste", types: ["relationship"], quoteId: null, nextAction: null });
  expect(db.read().visits.find((visit) => visit.id === id)?.status).toBe("completed");
  await expect(visits.deletePlannedVisit(id)).rejects.toThrow();
});

test("carga respeita saldo e capacidade e devolve saldo ao cancelar", async () => {
  const loads = await import("../../src/demo/services/loadService");
  const candidates = await loads.listLoadCandidates(null);
  const item = candidates.find((row) => row.allocated < row.quantity)!;
  const free = item.quantity - item.allocated;
  const vehicles = await loads.listVehicles();
  const big = vehicles.sort((a, b) => b.capacity_kg - a.capacity_kg)[0];
  const small = vehicles.sort((a, b) => a.capacity_kg - b.capacity_kg)[0];
  await expect(loads.saveLoad(null, { vehicleId: big.id, plannedDate: null, notes: null }, [{ quoteItemId: item.quote_item_id, quantity: free + 1, packing: "loose", stopOrder: 0 }])).rejects.toThrow("saldo");
  if (free * item.weight_kg > small.capacity_kg) {
    await expect(loads.saveLoad(null, { vehicleId: small.id, plannedDate: null, notes: null }, [{ quoteItemId: item.quote_item_id, quantity: free, packing: "loose", stopOrder: 0 }])).rejects.toThrow("capacidade");
  }
  const quantity = Math.min(free, Math.floor(big.capacity_kg / item.weight_kg / 2));
  const saved = await loads.saveLoad(null, { vehicleId: big.id, plannedDate: "2026-11-20", notes: null }, [{ quoteItemId: item.quote_item_id, quantity, packing: "loose", stopOrder: 0 }]);
  const after = (await loads.listLoadCandidates(null)).find((row) => row.quote_item_id === item.quote_item_id);
  expect(after?.allocated ?? item.quantity).toBe(item.allocated + quantity);
  await expect(loads.setLoadStatus(saved.id, "shipped")).rejects.toThrow();
  await loads.setLoadStatus(saved.id, "loaded");
  await loads.setLoadStatus(saved.id, "cancelled");
  const restored = (await loads.listLoadCandidates(null)).find((row) => row.quote_item_id === item.quote_item_id)!;
  expect(restored.allocated).toBe(item.allocated);
});

test("relatório de vendas soma produtos dos aprovados e comercial não vê vendedores", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { isoDate } = await import("../../src/demo/store/ids");
  const { setDemoRole } = await import("../../src/demo/app/session");
  const { loadSalesReport } = await import("../../src/demo/services/reportService");
  const range = { from: "2000-01-01", to: "2100-01-01" };
  await expect(loadSalesReport(range)).rejects.toThrow("até um ano");
  const yearRange = { from: isoDate(new Date(Date.now() - 300 * 86_400_000)), to: isoDate(new Date()) };
  const report = await loadSalesReport(yearRange);
  const expected = db.read().quotes.filter((quote) => quote.status === "approved").reduce((total, quote) => total + quote.product_subtotal, 0);
  expect(report.totals.revenue).toBeCloseTo(expected, 2);
  expect(report.sellers?.length).toBeGreaterThan(0);
  setDemoRole("comercial");
  expect((await loadSalesReport(yearRange)).sellers).toBeNull();
  setDemoRole("administrador");
});

test("último administrador não pode ser rebaixado", async () => {
  const { updateProfileAccess, listProfiles } = await import("../../src/demo/services/profileService");
  await expect(updateProfileAccess("demo-admin", "comercial", true)).rejects.toThrow("último administrador");
  const sellers = (await listProfiles()).filter((profile) => profile.role === "comercial");
  await updateProfileAccess(sellers[0].id, "consulta", true);
  expect((await listProfiles()).find((profile) => profile.id === sellers[0].id)?.role).toBe("consulta");
});
