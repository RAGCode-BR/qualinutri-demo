import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

test("paletes no 3D batem com a contagem da carga (regra do sistema)", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { presetForLoad } = await import("../../src/demo/kpis/yard");
  const tables = db.read();
  for (const load of tables.loads.filter((item) => item.status !== "cancelled")) {
    const preset = presetForLoad(tables, load.id)!;
    const pallets = preset.itens.filter((item) => item.tipo.startsWith("p")).reduce((sum, item) => sum + item.n, 0);
    expect(pallets, `carga #${load.load_number}`).toBe(load.pallet_count);
    const bags = tables.load_items.filter((item) => item.load_id === load.id).reduce((sum, item) => sum + item.quantity, 0);
    expect(preset.itens.reduce((sum, item) => sum + item.n * (item.sacas ?? 0), 0)).toBe(bags);
    const kg = tables.load_items.filter((item) => item.load_id === load.id).reduce((sum, item) => sum + item.quantity * item.weight_kg_snapshot, 0) + pallets * 25;
    expect(Math.abs(preset.itens.reduce((sum, item) => sum + item.n * item.kg, 0) - kg)).toBeLessThan(0.5);
  }
});

test("veículo do 3D segue a capacidade do caminhão da carga", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { presetForLoad } = await import("../../src/demo/kpis/yard");
  const tables = db.read();
  const byCap: Record<number, string> = { 10000: "gran10", 15000: "gran15", 18000: "gran18" };
  for (const load of tables.loads.slice(0, 8)) expect(presetForLoad(tables, load.id)!.veiculo).toBe(byCap[load.capacity_kg_snapshot]);
});
