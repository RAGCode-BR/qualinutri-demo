import { useState } from 'react';
import { history as h, historySellers, sum, money, decimal } from '../../demo/history/sales';
import { Panel } from '../../components/Panel';
import { ScrollableTable } from '../../components/ScrollableTable';
import HistoricalSales from './HistoricalSales';
export function RealSellers() {
  const [selected,setSelected]=useState<{id:string;tab:string}|null>(null);
  const [search,setSearch]=useState('');
  if(selected) return <HistoricalSales initialSeller={selected.id} initialTab={selected.tab} backLabel="Voltar aos vendedores" onBack={()=>setSelected(null)} />;
  return <Panel title="Vendedores reais da Qualinutri" description="Histórico TGA · 01 a 13/11/2026 · dados reais dos PDFs">
    <p>13 códigos de vendedor · {money(sum(h.documents,r=>r.net))} líquidos. “S/ comissão” é um agrupamento do relatório, não uma pessoa. Estes registros comerciais não criam contas de acesso.</p>
    <label className="field">Buscar vendedor<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Agnaldo, Telma, Daniel…" /></label>
    <ScrollableTable><table className="data-table"><thead><tr><th>Vendedor</th><th>Documentos</th><th>KG</th><th>SC</th><th>Vendas líquidas</th><th>Consultar</th></tr></thead><tbody>{historySellers.filter(([id,name])=>`${id} ${name}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(([id,name])=>{const p=h.products.filter(r=>r.seller===id),d=h.documents.filter(r=>r.seller===id);return <tr key={id} className="is-clickable" tabIndex={0} aria-label={`Abrir produtos de ${name}`} onClick={()=>setSelected({id,tab:'products'})} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setSelected({id,tab:'products'});}}}><td>{id} · {name}</td><td>{d.length}</td><td>{decimal(sum(p.filter(r=>r.unit==='KG'),r=>r.quantity))}</td><td>{decimal(sum(p.filter(r=>r.unit==='SC'),r=>r.quantity))}</td><td>{money(sum(d,r=>r.net))}</td><td><button className="secondary-button" onClick={(e)=>{e.stopPropagation();setSelected({id,tab:'products'});}}>Produtos de {name}</button> <button className="secondary-button" onClick={(e)=>{e.stopPropagation();setSelected({id,tab:'documents'});}}>Vendas de {name}</button></td></tr>;})}</tbody></table></ScrollableTable>
  </Panel>;
}
