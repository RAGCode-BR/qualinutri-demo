import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

const today = new Date(2026, 10, 13, 10);
beforeEach(async () => { installMemoryStorage(); vi.resetModules(); (await import("../../src/demo/store/ids")).setToday(today); });

async function setup() {
  const { db } = await import("../../src/demo/store/db");
  const core = await import("../../src/demo/reports/core");
  const { REPORTS } = await import("../../src/demo/reports/catalog");
  return { tables: db.read(), core, REPORTS };
}

test("todos os relatórios rodam com os filtros padrão e trazem KPIs, gráficos e tabela", async () => {
  const { tables, core, REPORTS } = await setup();
  expect(REPORTS.length).toBeGreaterThanOrEqual(20);
  expect(new Set(REPORTS.map((report) => report.id)).size).toBe(REPORTS.length);
  for (const report of REPORTS) {
    const result = report.run(tables, core.defaultFilters(today), today);
    expect(result.kpis.length, report.id).toBeGreaterThan(0);
    expect(result.charts.length, report.id).toBeGreaterThan(0);
    expect(result.table.columns.length, report.id).toBeGreaterThan(0);
    for (const kpi of result.kpis) expect(Number.isFinite(kpi.value), `${report.id}:${kpi.id}`).toBe(true);
  }
});

test("vendas por produto soma o mesmo faturamento que vendas por período", async () => {
  const { tables, core, REPORTS } = await setup();
  const filters = core.defaultFilters(today);
  const period = REPORTS.find((report) => report.id === "vendas-periodo")!.run(tables, filters, today);
  const product = REPORTS.find((report) => report.id === "vendas-produto")!.run(tables, filters, today);
  const revenue = period.kpis.find((kpi) => kpi.id === "revenue")!.value;
  expect(revenue).toBeGreaterThan(0);
  expect(Number(product.table.total?.faturamento)).toBeCloseTo(revenue, 1);
});

test("filtro de produto restringe as vendas a esse produto", async () => {
  const { tables, core, REPORTS } = await setup();
  const report = REPORTS.find((item) => item.id === "vendas-produto")!;
  const all = report.run(tables, core.defaultFilters(today), today);
  const first = String(all.table.rows[0].produto);
  const only = report.run(tables, { ...core.defaultFilters(today), product: first }, today);
  expect(only.table.rows.map((row) => row.produto)).toEqual([first]);
});

test("o período anterior tem o mesmo tamanho e termina na véspera", async () => {
  const { core } = await setup();
  const previous = core.previousOf({ ...core.defaultFilters(today), from: "2026-11-01", to: "2026-11-10" });
  expect(previous.from).toBe("2026-10-22");
  expect(previous.to).toBe("2026-10-31");
});

test("CSV usa ponto e vírgula, vírgula decimal e escapa aspas", async () => {
  const { toCsv } = await import("../../src/demo/reports/export");
  const csv = toCsv({ title: "T", columns: [{ key: "a", label: "Nome" }, { key: "b", label: "Valor", format: "currency" }], rows: [{ a: 'Fazenda "Boa"; Vista', b: 10.5 }] });
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain('"Fazenda ""Boa""; Vista";10,5');
});

test("o .xlsx é um zip válido com planilha, indicadores e estilos", async () => {
  const { toXlsx, crc32 } = await import("../../src/demo/reports/export");
  const bytes = toXlsx("Vendas", ["Período: 01/11 a 13/11"], [{ id: "k", label: "Faturamento", value: 1234.5, format: "currency" }], { title: "Pedidos", columns: [{ key: "n", label: "Pedido" }, { key: "v", label: "Valor", format: "currency" }, { key: "d", label: "Data", format: "date" }], rows: [{ n: "#1", v: 99.9, d: "2026-11-13" }], total: { n: "1 pedido", v: 99.9 } });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(7);
  // Lê as entradas (sem compressão) e confere CRC e conteúdo.
  const names: string[] = [];
  let offset = 0;
  let sheet = "";
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const data = bytes.slice(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(crc32(data)).toBe(view.getUint32(offset + 14, true));
    if (name === "xl/worksheets/sheet1.xml") sheet = new TextDecoder().decode(data);
    names.push(name);
    offset += 30 + nameLength + size;
  }
  expect(names).toContain("xl/workbook.xml");
  expect(names).toContain("xl/worksheets/sheet2.xml");
  expect(sheet).toContain("Pedido");
  expect(sheet).toContain("<v>99.9</v>");
  expect(sheet).toContain("<v>46339</v>"); // 13/11/2026 como data do Excel
});
