export type PeriodPreset = "month" | "lastMonth" | "last7" | "last30" | "custom";

export type DateRange = { from: string; to: string };

export const periodPresetLabels: Record<PeriodPreset, string> = {
  month: "Este mês",
  lastMonth: "Mês passado",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  custom: "Personalizado",
};

/** Data local no formato AAAA-MM-DD, como os campos type="date". */
export function toIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Intervalo inclusivo do atalho, relativo a `today`. Personalizado não tem intervalo próprio. */
export function presetRange(preset: Exclude<PeriodPreset, "custom">, today = new Date()): DateRange {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (preset) {
    case "month":
      return { from: toIsoDate(new Date(year, month, 1)), to: toIsoDate(today) };
    case "lastMonth":
      return { from: toIsoDate(new Date(year, month - 1, 1)), to: toIsoDate(new Date(year, month, 0)) };
    case "last7":
      return { from: toIsoDate(addDays(today, -6)), to: toIsoDate(today) };
    case "last30":
      return { from: toIsoDate(addDays(today, -29)), to: toIsoDate(today) };
  }
}

export function validateRange(range: DateRange): string | null {
  if (!range.from || !range.to) return "Informe as duas datas do período.";
  if (range.to < range.from) return "A data final deve ser igual ou posterior à inicial.";
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  if (days > 366) return "Escolha um período de até um ano.";
  return null;
}

export function formatRange(range: DateRange) {
  const format = (value: string) => value.split("-").reverse().join("/");
  return range.from === range.to ? format(range.from) : `${format(range.from)} a ${format(range.to)}`;
}
