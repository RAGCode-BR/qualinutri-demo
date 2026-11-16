/**
 * Atalhos para os dados reais dos PDFs TGA (01–13/11/2026), sempre em Relatórios.
 * Cada atalho corresponde a um dos relatórios recebidos:
 * - vendas-vendedor: vendedor 11-26.pdf, totais por vendedor
 * - vendas-produto:  produtos 11-26.pdf, produtos vendidos por vendedor
 * - vendas-periodo:  vendedor 11-26.pdf, vendas gerais documento a documento
 * - reconcile:       conferência entre os dois PDFs
 * - scenario:        simulação comercial com produtos reais
 */
export type RealReportId = 'vendas-vendedor' | 'vendas-produto' | 'vendas-periodo';
export type RealTarget =
  | { kind: 'report'; id: RealReportId; seller?: string; product?: string }
  | { kind: 'history'; tab: 'reconcile' | 'scenario' | 'documents' | 'products'; seller?: string; query?: string };

export type RealShortcut = { key: string; label: string; source: string; hint: string; target: RealTarget };

export const REAL_SHORTCUTS: RealShortcut[] = [
  { key: 'sellers', label: 'Vendas por vendedor', source: 'vendedor 11-26.pdf', hint: '13 vendedores · documentos, KG, SC e líquido', target: { kind: 'report', id: 'vendas-vendedor' } },
  { key: 'products', label: 'Produtos por vendedor', source: 'produtos 11-26.pdf', hint: '43 produtos · quantidade, preço médio e valor', target: { kind: 'report', id: 'vendas-produto' } },
  { key: 'documents', label: 'Vendas gerais', source: 'vendedor 11-26.pdf', hint: '134 documentos · cliente, série, emissão e status', target: { kind: 'report', id: 'vendas-periodo' } },
  { key: 'reconcile', label: 'Conferência dos PDFs', source: 'os dois PDFs', hint: 'Totais, subtotais e diferenças entre os relatórios', target: { kind: 'history', tab: 'reconcile' } },
  { key: 'scenario', label: 'Cenário simulado', source: 'produtos reais', hint: 'Teste vendas com produtos reais e preços informados', target: { kind: 'history', tab: 'scenario' } },
];

let pending: RealTarget | null = null;
const listeners = new Set<(target: RealTarget) => void>();

/** Leva a Relatórios já no relatório real pedido (funciona mesmo com Relatórios aberto). */
export function openReal(target: RealTarget, navigate: (tab: 'analytics') => void) {
  pending = target;
  listeners.forEach((listener) => listener(target));
  navigate('analytics');
}

/** Destino pedido antes da tela montar; consumido uma vez. */
export function takeRealTarget(): RealTarget | null {
  const target = pending;
  pending = null;
  return target;
}

export function onRealTarget(listener: (target: RealTarget) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
