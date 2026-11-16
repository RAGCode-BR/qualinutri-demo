import { history as h, customerName, sellerName, sum, type HistoryDocument } from './sales';
import { addDays, isoDate } from '../store/ids';
import type { DrawerSelection, Kpi, Period } from '../kpis/dashboard';

/** Dados reais do TGA (01–13/11/2026) nos campos correspondentes do Início. */

const docColumns: DrawerSelection['columns'] = [
  { key: 'date', label: 'Emissão', format: 'date' },
  { key: 'document', label: 'Documento', format: 'text' },
  { key: 'customer', label: 'Cliente', format: 'text' },
  { key: 'seller', label: 'Vendedor', format: 'text' },
  { key: 'status', label: 'Status', format: 'text' },
  { key: 'total', label: 'Líquido', format: 'currency' },
];

const docRow = (r: HistoryDocument) => ({
  id: `${r.document}-${r.customerCode}`, date: r.date, document: `${r.document}${r.series ? ` · ${r.series}` : ''}`,
  customer: customerName(r), seller: sellerName(r.seller), status: r.status || '—', total: r.net,
});

export const realDocsIn = (period: Period) => h.documents.filter(r => r.date >= period.from && r.date <= period.to);

export function realDocsSelection(title: string, docs: HistoryDocument[]): DrawerSelection {
  return { title, columns: docColumns, rows: [...docs].sort((a, b) => b.date.localeCompare(a.date)).map(docRow) };
}

export const realDaySelection = (day: string) =>
  realDocsSelection(`Vendas reais · ${day.split('-').reverse().join('/')}`, h.documents.filter(r => r.date === day));

export function realDailySales(today: Date, days = 14): number[] {
  return Array.from({ length: days }, (_, i) => {
    const key = isoDate(addDays(today, i - days + 1));
    return sum(h.documents.filter(r => r.date === key), r => r.net);
  });
}

export type RealProductRank = { code: string; unit: string; name: string; quantity: number; value: number };

/** Produtos do período completo 01–13/11 (o PDF de produtos não tem data por linha). */
export function realProductRanking(): RealProductRank[] {
  const byKey = new Map<string, RealProductRank>();
  for (const r of h.products) {
    const key = `${r.code}|${r.unit}`;
    const row = byKey.get(key) ?? { code: r.code, unit: r.unit, name: r.name, quantity: 0, value: 0 };
    row.quantity += r.quantity;
    row.value += r.value;
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map(r => ({ ...r, quantity: Math.round(r.quantity * 100) / 100, value: Math.round(r.value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

export const realRecentDocs = (n = 6) =>
  [...h.documents].sort((a, b) => b.date.localeCompare(a.date) || b.document.localeCompare(a.document)).slice(0, n);

export const realMonthNet = (monthKey: string) => sum(h.documents.filter(r => r.date.startsWith(monthKey)), r => r.net);

export const REAL_KPI_IDS = new Set<Kpi['id']>(['sales', 'ticket', 'topProduct']);

/** Substitui Vendas, Ticket médio e Produto mais vendido pelos valores reais. */
export function withRealKpis(kpis: Kpi[], period: Period, today: Date): Kpi[] {
  const docs = realDocsIn(period);
  const net = sum(docs, r => r.net);
  const sales = realDocsSelection('Vendas reais no período · TGA', docs);
  const ranking = realProductRanking();
  const leader = ranking[0];
  const real: Partial<Record<Kpi['id'], Kpi>> = {
    sales: {
      id: 'sales', label: 'Vendas', value: net, format: 'currency', previous: null, trend: realDailySales(today), target: 'sellers', selection: sales,
      caption: `${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'} reais · TGA`,
    },
    ticket: {
      id: 'ticket', label: 'Ticket médio', value: docs.length ? net / docs.length : 0, format: 'currency', previous: null, trend: [], target: 'sellers',
      caption: 'Líquido médio por documento real', selection: sales,
    },
    topProduct: {
      id: 'topProduct', label: 'Produto mais vendido', value: leader?.value ?? 0, format: 'currency', previous: null, trend: [], target: 'sellers',
      caption: leader ? `${leader.name} · ${leader.quantity.toLocaleString('pt-BR')} ${leader.unit} · 01–13/11` : 'Sem vendas',
      selection: {
        title: 'Ranking real de produtos · 01–13/11',
        columns: [{ key: 'name', label: 'Produto', format: 'text' }, { key: 'unit', label: 'Unidade', format: 'text' }, { key: 'quantity', label: 'Quantidade', format: 'number' }, { key: 'value', label: 'Valor', format: 'currency' }],
        rows: ranking.map(r => ({ id: `${r.code}|${r.unit}`, name: `${r.code} · ${r.name}`, unit: r.unit, quantity: r.quantity, value: r.value })),
      },
    },
  };
  return kpis.map(kpi => real[kpi.id] ?? kpi);
}
