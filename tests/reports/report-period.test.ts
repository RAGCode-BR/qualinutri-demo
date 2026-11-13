import { describe, expect, it } from "vitest";
import { formatRange, presetRange, validateRange } from "../../src/features/reports/reportPeriod";

const today = new Date(2026, 9, 9); // 09/10/2026

describe("períodos do relatório", () => {
  it("este mês vai do dia 1 até hoje", () => {
    expect(presetRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-09" });
  });

  it("mês passado cobre o mês inteiro anterior, inclusive na virada do ano", () => {
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("lastMonth", new Date(2027, 0, 15))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("últimos 7 e 30 dias incluem hoje", () => {
    expect(presetRange("last7", today)).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(presetRange("last30", today)).toEqual({ from: "2026-09-10", to: "2026-10-09" });
  });

  it("valida o período personalizado", () => {
    expect(validateRange({ from: "2026-10-01", to: "2026-10-09" })).toBeNull();
    expect(validateRange({ from: "", to: "2026-10-09" })).toMatch(/duas datas/);
    expect(validateRange({ from: "2026-10-09", to: "2026-10-01" })).toMatch(/posterior/);
    expect(validateRange({ from: "2025-01-01", to: "2026-10-09" })).toMatch(/um ano/);
  });

  it("formata o período para exibição", () => {
    expect(formatRange({ from: "2026-10-01", to: "2026-10-09" })).toBe("01/10/2026 a 09/10/2026");
    expect(formatRange({ from: "2026-10-09", to: "2026-10-09" })).toBe("09/10/2026");
  });
});
