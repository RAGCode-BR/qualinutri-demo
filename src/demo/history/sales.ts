import data from './november2026.json';
export const history = data;
export const historySellers = Object.entries(data.sellers).sort(([a], [b]) => a.localeCompare(b));
export const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const decimal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
export const sum = <T,>(rows: T[], get: (r: T) => number) => Math.round(rows.reduce((s, r) => s + get(r), 0) * 100) / 100;
export type ScenarioLine = { seller: string; code: string; unit: 'KG' | 'SC'; quantity: number; price: number };
export function scenarioTotal(lines: ScenarioLine[]) {
  if (!lines.length) throw new Error('Inclua pelo menos um produto.');
  for (const line of lines) {
    if (!data.products.some(r => r.code === line.code && r.unit === line.unit) || !data.sellers[line.seller as keyof typeof data.sellers]) throw new Error('Produto, unidade ou vendedor inválido.');
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1e8 || !Number.isFinite(line.price) || line.price <= 0 || line.price > 1e8) throw new Error('Informe quantidade e preço positivos e válidos.');
  }
  return sum(lines, r => Math.round(r.quantity * r.price * 100) / 100);
}
export const SCENARIO_KEY = 'qualinutri-demo:historical-scenarios:v1';
export type Scenario = { id: string; name: string; lines: ScenarioLine[]; createdAt: string };
export function loadScenarios(): Scenario[] {
  try { const raw: unknown = JSON.parse(localStorage.getItem(SCENARIO_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is Scenario => { try { return typeof s.id === 'string' && typeof s.name === 'string' && typeof s.createdAt === 'string' && Number.isFinite(scenarioTotal(s.lines)); } catch { return false; } });
  } catch { return []; }
}
export function saveScenario(scenario: Scenario) {
  scenarioTotal(scenario.lines);
  const rows = loadScenarios();
  localStorage.setItem(SCENARIO_KEY, JSON.stringify([...rows, scenario]));
}
export type HistoryProduct = typeof data.products[number];
export type HistoryDocument = typeof data.documents[number];
/** Nome do cliente como no PDF, completo quando o relatório o cortou na coluna. */
export const customerName = (r: HistoryDocument) => ('customerFull' in r && r.customerFull) || r.customer;
/** Grupo do produto, completo quando o relatório o cortou na coluna. */
export const groupName = (r: HistoryProduct) => ('groupFull' in r && r.groupFull) || r.group;
export const sellerName = (id: string) => `${id} · ${data.sellers[id as keyof typeof data.sellers] ?? 'Não informado'}`;
