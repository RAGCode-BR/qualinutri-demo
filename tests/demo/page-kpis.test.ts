import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

beforeEach(() => { installMemoryStorage(); vi.resetModules(); });

test("cada tela tem indicadores e contagens batem com a lista", async () => {
  const { db } = await import("../../src/demo/store/db");
  const { pageKpis } = await import("../../src/demo/kpis/pages");
  const { getDemoViewer } = await import("../../src/demo/app/session");
  const tabs = ["calculator", "quotes", "customers", "visits", "loads", "prices", "discounts", "terms", "freight", "policy", "updates", "users"] as const;
  for (const tab of tabs) {
    const kpis = pageKpis(tab, db.read(), new Date(), getDemoViewer());
    expect(kpis.length, tab).toBeGreaterThanOrEqual(3);
    for (const kpi of kpis) {
      if (kpi.format === "number" && ["today", "week", "late", "done", "open", "shipped", "active", "idle", "admins", "sellers"].includes(kpi.id)) {
        expect(kpi.selection.rows.length, `${tab}/${kpi.id}`).toBe(kpi.value);
      }
    }
  }
  expect(pageKpis("reports", db.read(), new Date(), getDemoViewer())).toEqual([]);
}, 20_000);
