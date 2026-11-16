import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { history as h, customerName, groupName, sellerName, money, decimal, sum, type HistoryDocument } from '../../demo/history/sales';

export type HistorySelection = { kind: 'product'; code: string; unit: string } | { kind: 'document'; document: string; customerCode: string };

const dateBr = (iso: string) => iso.split('-').reverse().join('/');

/** Detalhe de um produto ou documento do histórico real: tudo o que os PDFs permitem cruzar. */
export function HistoryDetail({ selection: initial, onSeller, onClose }: {
  selection: HistorySelection; onSelect?: (next: HistorySelection) => void; onSeller: (id: string, tab: 'products' | 'documents') => void; onClose: () => void;
}) {
  /* Pilha de navegação dentro do detalhe: "Voltar" retorna ao item anterior; no primeiro, fecha. */
  const [stack, setStack] = useState<HistorySelection[]>([initial]);
  const selection = stack[stack.length - 1];
  const onSelect = (next: HistorySelection) => setStack((list) => [...list, next]);
  const back = () => (stack.length > 1 ? setStack((list) => list.slice(0, -1)) : onClose());
  const nav = <div className="history-nav">
    <button type="button" className="secondary-button compact-secondary" onClick={back}><ArrowLeft size={15} aria-hidden="true" />&nbsp;Voltar</button>
    <button type="button" className="secondary-button compact-secondary" onClick={onClose} aria-label="Fechar"><X size={15} aria-hidden="true" />&nbsp;Fechar</button>
  </div>;
  if (selection.kind === 'product') {
    const rows = h.products.filter(r => r.code === selection.code && r.unit === selection.unit);
    const first = rows[0];
    if (!first) return null;
    const qty = sum(rows, r => r.quantity), value = sum(rows, r => r.value);
    return <Dialog key={`p-${first.code}-${first.unit}`} dismissible title={`${first.code} · ${first.name}`} description={`${groupName(first)} · ${first.unit} · ${first.manufacturer || 'fabricante não informado'}`} onClose={onClose}>
      {nav}
      <dl className="history-kpis">
        <div><dt>Quantidade líquida</dt><dd>{decimal(qty)} {first.unit}</dd></div>
        <div><dt>Valor original</dt><dd>{money(value)}</dd></div>
        <div><dt>Preço médio histórico</dt><dd>{qty ? `${money(value / qty)}/${first.unit}` : '—'}</dd></div>
        <div><dt>Vendedores</dt><dd>{rows.length}</dd></div>
      </dl>
      <h3 className="history-sub">Quem vendeu</h3>
      <ul className="history-list">{rows.slice().sort((a, b) => b.value - a.value).map(r =>
        <li key={r.seller}><button type="button" onClick={() => onSeller(r.seller, 'documents')}>
          <span><strong>{sellerName(r.seller)}</strong><small>{decimal(r.quantity)} {r.unit} · {money(r.historicalAverage)}/{r.unit} · PDF de produtos, p. {r.page}</small></span>
          <b className={r.value < 0 ? 'is-negative' : undefined}>{money(r.value)}</b>
        </button></li>)}</ul>
      <p className="history-note">Preço médio histórico, não preço atual. O PDF não liga produtos a documentos; clique num vendedor para ver as vendas dele no período.</p>
    </Dialog>;
  }
  const doc = h.documents.find(r => r.document === selection.document && r.customerCode === selection.customerCode);
  if (!doc) return null;
  const others = h.documents.filter(r => r.customerCode === doc.customerCode && r !== doc).sort((a, b) => b.date.localeCompare(a.date));
  const sellerDocs = h.documents.filter(r => r.seller === doc.seller);
  const columns = Math.round((doc.gross - doc.discount + doc.expense) * 100) / 100;
  const gap = Math.round((doc.net - columns) * 100) / 100;
  const open = (r: HistoryDocument) => onSelect({ kind: 'document', document: r.document, customerCode: r.customerCode });
  return <Dialog title={`Documento ${doc.document}${doc.series ? ` · série ${doc.series}` : ''}`} description={`${dateBr(doc.date)} · ${sellerName(doc.seller)} · ${doc.status || 'status em branco no PDF'}`} dismissible onClose={onClose}>
    {nav}
    <p className="history-customer"><strong>{customerName(doc)}</strong><small>{doc.customerCode.startsWith('F') ? 'Fornecedor' : 'Cliente'} {doc.customerCode}{'customerFull' in doc && doc.customerFull ? ' · nome completo recuperado do texto do PDF' : ''}</small></p>
    <dl className="history-kpis">
      <div><dt>Bruto</dt><dd>{money(doc.gross)}</dd></div>
      <div><dt>Descontos</dt><dd>{money(doc.discount)}</dd></div>
      <div><dt>Despesa</dt><dd>{money(doc.expense)}</dd></div>
      <div><dt>Líquido</dt><dd className={doc.net < 0 ? 'is-negative' : undefined}>{money(doc.net)}</dd></div>
    </dl>
    {gap !== 0 && <p className="history-note">Bruto − descontos + despesa = {money(columns)}. O líquido impresso difere em {money(gap)}, valor que o PDF não detalha (não atribuímos a imposto ou frete).</p>}
    <p className="history-note">{sellerName(doc.seller)}: {sellerDocs.length} documentos no período, {money(sum(sellerDocs, r => r.net))} líquidos. <button type="button" className="link-button" onClick={() => onSeller(doc.seller, 'documents')}>Ver vendas do vendedor</button> · PDF de vendas, p. {doc.page}.</p>
    <h3 className="history-sub">Outros documentos deste {doc.customerCode.startsWith('F') ? 'fornecedor' : 'cliente'}</h3>
    {others.length ? <ul className="history-list">{others.map(r =>
      <li key={`${r.document}-${r.seller}`}><button type="button" onClick={() => open(r)}>
        <span><strong>{r.document}{r.series ? ` · ${r.series}` : ''} · {dateBr(r.date)}</strong><small>{sellerName(r.seller)} · {r.status || 'sem status'}</small></span>
        <b className={r.net < 0 ? 'is-negative' : undefined}>{money(r.net)}</b>
      </button></li>)}</ul> : <p className="history-note">Nenhum outro documento no período.</p>}
  </Dialog>;
}
