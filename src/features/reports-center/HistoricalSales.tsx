import { useState } from 'react';
import { history as h, historySellers, money, decimal, sum, loadScenarios, saveScenario, scenarioTotal, customerName, groupName, type ScenarioLine } from '../../demo/history/sales';
import { HistoryDetail, type HistorySelection } from './HistoryDetail';

/** Linha de tabela que abre o detalhe: clique ou Enter/Espaço. */
const rowOpen = (open: () => void) => ({ className: 'is-clickable', tabIndex: 0, onClick: open, onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } } });
import { Panel } from '../../components/Panel';
import { ScrollableTable } from '../../components/ScrollableTable';

export default function HistoricalSales({ onBack, initialSeller = "", initialTab = "products", initialQuery = "", backLabel = "Voltar aos relatórios" }: { onBack?: () => void; initialSeller?: string; initialTab?: string; initialQuery?: string; backLabel?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [seller, setSeller] = useState(initialSeller);
  const [unit, setUnit] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const [negative, setNegative] = useState(false);
  const [start, setStart] = useState('2026-11-01');
  const [end, setEnd] = useState('2026-11-13');
  const [lines, setLines] = useState<ScenarioLine[]>([]);
  const [saved, setSaved] = useState(loadScenarios);
  const [name, setName] = useState('Teste comercial');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<HistorySelection | null>(null);
  const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const matches = (text: string) => normalize(text).includes(normalize(query));
  const ps = h.products.filter(r => (!seller || r.seller === seller) && (!unit || r.unit === unit) && (!negative || r.quantity < 0 || r.value < 0) && matches(`${r.code} ${r.name} ${groupName(r)}`));
  const ds = h.documents.filter(r => (!seller || r.seller === seller) && (!negative || r.net < 0) && r.date >= start && r.date <= end && matches(`${r.customerCode} ${customerName(r)} ${r.document} ${r.series} ${r.status}`));
  const sellerLabel = (id: string) => `${id} · ${h.sellers[id as keyof typeof h.sellers]}`;
  const add = (r: typeof h.products[number]) => { setLines([...lines, { seller: r.seller, code: r.code, unit: r.unit as 'KG' | 'SC', quantity: 1, price: 0 }]); setNotice('Produto adicionado ao cenário. Informe um preço simulado; o preço histórico não foi aplicado.'); };
  const total = (() => { try { return scenarioTotal(lines); } catch { return null; } })();
  return <div className="nutrition-stack">
    {onBack && <button className="secondary-button" onClick={onBack}>{backLabel}</button>}
    <Panel title="Histórico real e simulação comercial" description="Qualinutri · 01 a 13/11/2026 · relatórios TGA emitidos em 14/11/2026.">
      <p>Dados reais dos PDFs: 95 linhas de produtos, 43 produtos, 134 documentos e 13 vendedores. Histórico preservado, separado dos pedidos fictícios da demo.</p>
      <p>Preço médio histórico não é preço atual. KG e SC são unidades independentes; não há conversão automática para peso. Os PDFs não informam os produtos de cada documento, prazos financeiros, estoque ou dimensões.</p>
      <div className="nutrition-actions">{[['products','Produtos por vendedor'],['documents','Vendas gerais'],['reconcile','Conferência dos PDFs'],['scenario','Cenário simulado']].map(([id,label]) => <button className={tab === id ? 'primary-button' : 'secondary-button'} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>
    </Panel>
    <Panel title="Filtros do histórico">
      <div className="form-grid">
        <label className="field">Vendedor real<select value={seller} onChange={e=>setSeller(e.target.value)}><option value="">Todos</option>{historySellers.map(([id,label])=><option key={id} value={id}>{id} · {label}</option>)}</select></label>
        <label className="field">Buscar produto ou documento<input value={query} onChange={e=>setQuery(e.target.value)} /></label>
        {tab === 'products' && <label className="field">Unidade original<select value={unit} onChange={e=>setUnit(e.target.value)}><option value="">KG e SC separados</option><option>KG</option><option>SC</option></select></label>}
        {tab === 'documents' && <><label className="field">Emissão inicial<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label className="field">Emissão final<input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label></>}
        <label><input type="checkbox" checked={negative} onChange={e=>setNegative(e.target.checked)} /> Somente negativos</label>
      </div>
      <p>Filtros de produto/unidade aplicam-se aos produtos; datas e busca de documentos aplicam-se às vendas gerais. Conferência sempre apresenta o período completo.</p>
    </Panel>
    {notice && <p role="status">{notice}</p>}
    {tab === 'products' && <Panel title="Produtos vendidos por vendedor — dados reais">
      <p>{ps.length} linhas · {decimal(sum(ps.filter(r=>r.unit==='KG'),r=>r.quantity))} KG · {decimal(sum(ps.filter(r=>r.unit==='SC'),r=>r.quantity))} SC · {money(sum(ps,r=>r.value))}</p>
      <ScrollableTable><table className="data-table"><thead><tr>{['Vendedor','Código / Produto','Unidade','Fabricante','Grupo','Quantidade líquida','P. médio histórico','Valor original','Fonte','Simulação'].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{ps.map((r,i)=><tr key={i} {...rowOpen(()=>setDetail({kind:'product',code:r.code,unit:r.unit}))}><td>{sellerLabel(r.seller)}</td><td>{r.code} · {r.name}</td><td>{r.unit}</td><td>{r.manufacturer || 'Não informado'}</td><td>{groupName(r)}</td><td>{decimal(r.quantity)}</td><td>{money(r.historicalAverage)}/{r.unit}</td><td>{money(r.value)}</td><td>Produtos · p. {r.page}</td><td><button className="secondary-button" onClick={(e)=>{e.stopPropagation();add(r);}}>Simular produto</button></td></tr>)}</tbody></table></ScrollableTable>
      <p>Clique numa linha para ver o produto em todos os vendedores. Valores originais são a referência: quantidade × preço médio arredondado pode diferir. Negativos entre parênteses no PDF foram preservados com sinal.</p>
    </Panel>}
    {tab === 'documents' && <Panel title="Relatório de vendas geral — dados reais">
      <p>{ds.length} documentos · Bruto {money(sum(ds,r=>r.gross))} · Descontos {money(sum(ds,r=>r.discount))} · Despesa {money(sum(ds,r=>r.expense))} · Líquido {money(sum(ds,r=>r.net))}</p>
      <ScrollableTable><table className="data-table"><thead><tr>{['Vendedor','Cliente/Fornecedor','Documento','Série','Emissão','Bruto','Descontos','Despesa','Líquido','Status original','Fonte'].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{ds.map((r,i)=><tr key={i} {...rowOpen(()=>setDetail({kind:'document',document:r.document,customerCode:r.customerCode}))}><td>{sellerLabel(r.seller)}</td><td>{r.customerCode} · {customerName(r)}</td><td>{r.document}</td><td>{r.series || 'Não informado'}</td><td>{r.date}</td><td>{money(r.gross)}</td><td>{money(r.discount)}</td><td>{money(r.expense)}</td><td>{money(r.net)}</td><td>{r.status || 'Em branco no PDF'}</td><td>Vendedor · p. {r.page}</td></tr>)}</tbody></table></ScrollableTable>
      <p>Clique numa linha para ver o documento e os outros documentos do cliente. Nomes cortados na impressão foram completados com o texto do próprio PDF. Status são textos de origem, sem conversão automática em dívida ou quitação. Documento 0005783: série EV impressa no fim da página 3; linha na página 4.</p>
    </Panel>}
    {tab === 'reconcile' && <Panel title="Reconciliação integral — 01 a 13/11/2026">
      <p>Produtos e líquido das vendas: {money(sum(h.products,r=>r.value))}. Diferença entre relatórios: {money(sum(h.products,r=>r.value)-sum(h.documents,r=>r.net))}.</p>
      <p>7.222,10 KG e 6.144 SC. O total impresso 13.366,10 mistura unidades e não representa peso nem sacas.</p>
      <p>Bruto R$ 370.304,24 − descontos R$ 0,76 + despesa R$ 3.525,50 = R$ 373.828,98. Líquido impresso R$ 395.945,88: diferença não explicada pelas colunas de R$ 22.116,90. Não foi atribuída a impostos ou frete.</p>
      <p>À vista R$ 95.264,80 + a prazo R$ 300.681,08 = R$ 395.945,88. O PDF só fornece essa divisão no total geral.</p>
      <ScrollableTable><table className="data-table"><thead><tr>{['Vendedor','KG','SC','Produtos','Líquido documentos','Diferença','Documentos','Conferência subtotais'].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{historySellers.filter(([id])=>!seller||id===seller).map(([id])=>{const p=h.products.filter(r=>r.seller===id),d=h.documents.filter(r=>r.seller===id);return <tr key={id}><td>{sellerLabel(id)}</td><td>{decimal(sum(p.filter(r=>r.unit==='KG'),r=>r.quantity))}</td><td>{decimal(sum(p.filter(r=>r.unit==='SC'),r=>r.quantity))}</td><td>{money(sum(p,r=>r.value))}</td><td>{money(sum(d,r=>r.net))}</td><td>{money(sum(p,r=>r.value)-sum(d,r=>r.net))}</td><td>{d.length}</td><td>Conferidos com os dois PDFs</td></tr>;})}</tbody></table></ScrollableTable>
      <p>Movimentos: 2.2.03 / 2.2.06 / 2.2.10 / 2.2.11 / 2.3.01 / 2.3.04. Vínculo disponível entre relatórios: vendedor e período; não há vínculo produto ↔ documento.</p>
    </Panel>}
    {tab === 'scenario' && <Panel title="Cenário simulado — sem efeito no histórico">
      <p>Selecione produtos reais na aba Produtos por vendedor. Defina quantidades e preços para testar uma venda hipotética. Este cenário não comprova uma venda, reserva estoque ou gera título financeiro.</p>
      <label className="field">Nome do cenário<input value={name} onChange={e=>setName(e.target.value)} /></label>
      <ScrollableTable><table className="data-table"><thead><tr><th>Produto real</th><th>Vendedor do cenário</th><th>Unidade</th><th>Quantidade simulada</th><th>Preço simulado por unidade</th><th>Total simulado</th><th /></tr></thead><tbody>{lines.map((line,i)=><tr key={i}><td>{line.code} · {h.products.find(r=>r.code===line.code)?.name}</td><td><select aria-label={`Vendedor do item ${i+1}`} value={line.seller} onChange={e=>setLines(lines.map((r,j)=>j===i?{...r,seller:e.target.value}:r))}>{historySellers.map(([id,label])=><option key={id} value={id}>{id} · {label}</option>)}</select></td><td>{line.unit}</td>{(['quantity','price'] as const).map(k=><td key={k}><input aria-label={`${k==='quantity'?'Quantidade':'Preço'} simulado do item ${i+1}`} type="number" step="any" min="0" value={line[k]} onChange={e=>setLines(lines.map((r,j)=>j===i?{...r,[k]:e.target.value===''?0:Number(e.target.value)}:r))} /></td>)}<td>{money(line.quantity*line.price)}</td><td><button onClick={()=>setLines(lines.filter((_,j)=>j!==i))}>Retirar</button></td></tr>)}</tbody></table></ScrollableTable>
      <p>Total simulado: {total===null?'Informe quantidades e preços positivos':money(total)}</p>
      <button className="primary-button" disabled={total===null || !name.trim()} onClick={()=>{try{saveScenario({id:crypto.randomUUID(),name:name.trim(),lines:structuredClone(lines),createdAt:new Date().toISOString()});setSaved(loadScenarios());setNotice('Cenário simulado salvo neste navegador.');}catch(e){setNotice(e instanceof Error?e.message:'Falha ao salvar.');}}}>Salvar cenário local</button>
      <h3>Cenários salvos neste navegador</h3>{saved.map(s=><p key={s.id}><button className="secondary-button" onClick={()=>{setName(s.name);setLines(structuredClone(s.lines));}}>{s.name} · {money(scenarioTotal(s.lines))} · Abrir cenário</button></p>)}
    </Panel>}
    {detail && <HistoryDetail selection={detail} onSelect={setDetail} onClose={()=>setDetail(null)} onSeller={(id,next)=>{setDetail(null);setSeller(id);setTab(next);setQuery('');}} />}
  </div>;
}
