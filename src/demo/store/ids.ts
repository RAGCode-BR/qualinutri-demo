let fixedToday: Date | null = null;

/** "Agora" da demonstração; os testes podem fixar. */
export function today(): Date {
  return fixedToday ? new Date(fixedToday) : new Date();
}

export function setToday(date: Date | null) {
  fixedToday = date;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** UUID estável gerado a partir do PRNG da semente. */
export function seededId(rng: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** AAAA-MM-DD no fuso local. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoDateTime(date: Date): string {
  return date.toISOString();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Hash simples e estável para decisões determinísticas (ex.: parcela em atraso). */
export function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
