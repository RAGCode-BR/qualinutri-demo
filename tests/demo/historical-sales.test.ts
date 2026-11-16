import { describe, it, expect, beforeEach, vi } from 'vitest';
import { history as h, sum, scenarioTotal, saveScenario, loadScenarios, SCENARIO_KEY } from '../../src/demo/history/sales';
describe('PDFs Qualinutri 01–13/11/2026', () => {
  it('reconcilia cada vendedor com todos os subtotais impressos em ambos os relatórios', () => {
    expect(h.products).toHaveLength(95); expect(h.documents).toHaveLength(134);
    expect(new Set(h.products.map(r=>r.code)).size).toBe(43);
    expect(Object.keys(h.sellers)).toHaveLength(13);
    for (const id of Object.keys(h.sellers)) {
      const p=h.products.filter(r=>r.seller===id),d=h.documents.filter(r=>r.seller===id);
      const pt=h.productTotals[id as keyof typeof h.productTotals],dt=h.documentTotals[id as keyof typeof h.documentTotals];
      expect(sum(p,r=>r.quantity)).toBe(pt[0]); expect(sum(p,r=>r.value)).toBe(pt[1]);
      expect(sum(p,r=>r.quantity)).toBe(dt[0]); expect(d.length).toBe(dt[1]);
      ['gross','discount','expense','net'].forEach((k,i)=>expect(sum(d,r=>r[k as keyof typeof r] as number)).toBe(dt[i+2]));
      expect(sum(p,r=>r.value)).toBe(sum(d,r=>r.net));
    }
  });
  it('separa unidades e mantém negativos e valores originais', () => {
    expect(sum(h.products.filter(r=>r.unit==='KG'),r=>r.quantity)).toBe(7222.1);
    expect(sum(h.products.filter(r=>r.unit==='SC'),r=>r.quantity)).toBe(6144);
    expect(sum(h.products,r=>r.value)).toBe(395945.88);
    expect(h.products.filter(r=>r.quantity<0).map(r=>r.quantity)).toEqual([-250,-500]);
    expect(h.documents.filter(r=>r.net<0).map(r=>r.net)).toEqual([-17235,-31370]);
    expect(sum(h.documents,r=>r.net-r.gross+r.discount-r.expense)).toBe(22116.9);
    expect(Math.round((95264.80+300681.08)*100)/100).toBe(395945.88);
    expect(h.products.some(r=>Math.abs(r.quantity*r.historicalAverage-r.value)>.01)).toBe(true);
    expect(h.documents.every(r=>!('product' in r))).toBe(true);
  });
});
describe('cenários isolados',()=>{
  beforeEach(()=>{const map=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v)});});
  const line={seller:'001',code:'000075',unit:'KG' as const,quantity:12.5,price:2};
  it('persiste cenário sem alterar armazenamento da demo ou histórico',()=>{
    const original=JSON.stringify(h);localStorage.setItem('qualinutri-demo:v1','dados existentes');
    saveScenario({id:'teste',name:'Teste',lines:[line],createdAt:'2026-11-16'});
    expect(scenarioTotal(loadScenarios()[0].lines)).toBe(25);
    expect(localStorage.getItem('qualinutri-demo:v1')).toBe('dados existentes');expect(JSON.stringify(h)).toBe(original);
  });
  it('rejeita unidade trocada, vendedor ausente e números inválidos',()=>{
    for(const change of [{unit:'SC' as const},{seller:'999'},{price:0},{price:Infinity},{quantity:-1}])expect(()=>scenarioTotal([{...line,...change}])).toThrow();
    localStorage.setItem(SCENARIO_KEY,'{"invalid":true}');expect(loadScenarios()).toEqual([]);
  });
});

describe("nomes completos recuperados do texto do PDF", () => {
  it("completa só nomes cortados, sempre começando pelo texto impresso", async () => {
    const { history, customerName, groupName } = await import("../../src/demo/history/sales");
    for (const doc of history.documents) {
      const full = customerName(doc);
      expect(full.startsWith(doc.customer)).toBe(true);
    }
    const carlos = history.documents.find((doc) => doc.customerCode === "C002984")!;
    expect(customerName(carlos)).toBe("CARLOS GABRIEL OLYNTHO DE ARRUDA VILLACA");
    const agnaldo = history.documents.find((doc) => doc.document === "0005802")!;
    expect(customerName(agnaldo)).toBe("AGNALDO JOSE ARAUJO- FAZENDA VACA BAIA");
    expect(new Set(history.products.map(groupName))).toEqual(new Set(["MATERIA PRIMA", "MINERAIS ADENSADOS", "NUCLEOS", "PROTEICOS ENERGETICOS", "RACOES", "SUPLEMENTO MINERAL", "USO E CONSUMO"]));
  });

  it("não altera nenhum valor: totais continuam iguais aos impressos", async () => {
    const { history, sum } = await import("../../src/demo/history/sales");
    expect(history.documents).toHaveLength(134);
    expect(history.products).toHaveLength(95);
    expect(sum(history.documents, (doc) => doc.net)).toBe(395945.88);
    expect(sum(history.documents, (doc) => doc.gross)).toBe(370304.24);
    expect(sum(history.products, (row) => row.value)).toBe(395945.88);
  });
});
