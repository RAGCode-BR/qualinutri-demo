import { history as h, historySellers, sum, customerName } from './sales';
import { fd, type ReportDef, type ReportFilters, type Table } from '../reports/core';
export const realSalesIds = ['vendas-periodo', 'vendas-produto', 'vendas-vendedor'];
export const isRealReport = (report: ReportDef) => report.description.startsWith('Histórico real');
export function realSalesReport(original: ReportDef): ReportDef {
  const product = original.id === 'vendas-produto';
  const seller = original.id === 'vendas-vendedor';
  return { ...original, description: 'Histórico real dos PDFs TGA · 01 a 13/11/2026. Valores e vendedores originais.', filters: product ? ['seller','product'] : ['seller'],
    run(_tables, f: ReportFilters) {
      const complete = f.from <= h.period.start && f.to >= h.period.end;
      const ps = h.products.filter(r => complete && (!f.seller || r.seller===f.seller) && (!f.product || r.code===f.product));
      const ds = h.documents.filter(r => r.date>=f.from && r.date<=f.to && (!f.seller || r.seller===f.seller));
      const names = (id: string) => `${id} · ${h.sellers[id as keyof typeof h.sellers]}`;
      const rows = historySellers.filter(([id])=>!f.seller||id===f.seller).map(([id])=>{
        const docs=ds.filter(r=>r.seller===id), products=ps.filter(r=>r.seller===id);
        return { vendedor:names(id), documentos:docs.length, bruto:sum(docs,r=>r.gross), desconto:sum(docs,r=>r.discount), despesa:sum(docs,r=>r.expense), liquido:sum(docs,r=>r.net), kg:complete?sum(products.filter(r=>r.unit==='KG'),r=>r.quantity):null, sc:complete?sum(products.filter(r=>r.unit==='SC'),r=>r.quantity):null, _drill:fd('seller',id) };
      });
      const table: Table = product ? {
        title:'Produtos por vendedor · histórico real', columns:[{key:'vendedor',label:'Vendedor'},{key:'produto',label:'Produto'},{key:'unidade',label:'Unidade'},{key:'quantidade',label:'Quantidade líquida',format:'decimal'},{key:'medio',label:'Preço médio histórico (não atual)',format:'currency'},{key:'valor',label:'Valor original',format:'currency'}],
        rows:ps.map(r=>({vendedor:names(r.seller),produto:`${r.code} · ${r.name}`,unidade:r.unit,quantidade:r.quantity,medio:r.historicalAverage,valor:r.value,_drill:f.product?fd('seller',r.seller):fd('product',r.code)})),total:{produto:'Total monetário',valor:sum(ps,r=>r.value)},
      } : seller ? {
        title:'Vendedores reais · vendas líquidas',columns:[{key:'vendedor',label:'Vendedor'},{key:'documentos',label:'Documentos',format:'number'},{key:'kg',label:'KG (período completo)',format:'decimal'},{key:'sc',label:'SC (período completo)',format:'decimal'},{key:'bruto',label:'Bruto',format:'currency'},{key:'desconto',label:'Descontos',format:'currency'},{key:'despesa',label:'Despesa',format:'currency'},{key:'liquido',label:'Líquido',format:'currency'}],rows,
      } : {
        title:'Documentos reais · vendas gerais',columns:[{key:'vendedor',label:'Vendedor'},{key:'cliente',label:'Cliente/fornecedor'},{key:'documento',label:'Documento'},{key:'serie',label:'Série'},{key:'data',label:'Emissão',format:'date'},{key:'bruto',label:'Bruto',format:'currency'},{key:'desconto',label:'Descontos',format:'currency'},{key:'despesa',label:'Despesa',format:'currency'},{key:'liquido',label:'Líquido',format:'currency'},{key:'status',label:'Status original'}],rows:ds.map(r=>({vendedor:names(r.seller),cliente:`${r.customerCode} · ${customerName(r)}`,documento:r.document,serie:r.series,data:r.date,bruto:r.gross,desconto:r.discount,despesa:r.expense,liquido:r.net,status:r.status||'Em branco',_drill:fd('seller',r.seller)})),
      };
      return {kpis:[{id:'total',label:'Vendas líquidas · histórico real',value:product?sum(ps,r=>r.value):sum(ds,r=>r.net),format:'currency'},{id:'count',label:product?'Linhas de produtos':'Documentos reais',value:product?ps.length:ds.length,format:'number'},{id:'sellers',label:'Vendedores no recorte',value:new Set((product?ps:ds).map(r=>r.seller)).size,format:'number'}],charts:[],table,
        notes:['Fonte: PDFs TGA, 01–13/11/2026. Dados reais; pedidos operacionais da demo continuam simulados.',...(!complete?['Quantidades e produtos só estão disponíveis para o período completo 01–13/11; não é possível atribuí-los a um dia/documento.']:[]),'KG e SC são independentes. Valores negativos foram preservados. Preço médio histórico não é preço vigente.','Os PDFs não vinculam produtos a documentos. Conversão, metas, comissão e visitas não foram inferidas.']};
    } };
}
