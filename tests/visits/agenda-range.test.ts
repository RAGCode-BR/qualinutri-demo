import { describe, expect, it } from "vitest";
import { agendaRange, shiftAnchor } from "../../src/features/visits/visitModel";

describe("períodos da agenda de visitas", () => {
  it("dia é o próprio dia", () => {
    expect(agendaRange("day", "2026-10-13")).toEqual({ from: "2026-10-13", to: "2026-10-13" });
  });

  it("semana vai de segunda a domingo, inclusive quando o dia é domingo", () => {
    expect(agendaRange("week", "2026-10-13")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(agendaRange("week", "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(agendaRange("week", "2026-10-12")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("mês cobre do dia 1 ao último dia, inclusive fevereiro", () => {
    expect(agendaRange("month", "2026-10-13")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(agendaRange("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("avança e volta um período inteiro, atravessando o ano", () => {
    expect(shiftAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftAnchor("week", "2026-10-13", -1)).toBe("2026-10-06");
    expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-01");
  });
});
