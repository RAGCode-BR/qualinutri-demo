import logoUrl from "../../../assets/qualinutri-logo.png";
import type { DemoTables } from "../../../demo/store/types";
import type { Invoice, Mdfe } from "../../../demo/erp/types";
import { formatCurrency, formatNumber } from "../../../utils/formatters";

function accessKey(seed: number) {
  const body = `5126111234567800019055001${String(seed).padStart(9, "0")}1${String(seed * 7919).padStart(8, "0").slice(-8)}`;
  return `${body}${body.split("").reduce((sum, digit) => sum + Number(digit), 0) % 10}`.slice(0, 44).replace(/(\d{4})/g, "$1 ").trim();
}

function Barcode({ value }: { value: string }) {
  const bars = value.replace(/\D/g, "").split("").flatMap((digit, index) => [Number(digit) % 3 + 1, (Number(digit) + index) % 2 + 1]);
  let x = 0;
  return (
    <svg className="fiscal-barcode" viewBox={`0 0 ${bars.reduce((sum, width) => sum + width, 0)} 30`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((width, index) => { const rect = index % 2 === 0 ? <rect key={index} x={x} y="0" width={width} height="30" fill="#111" /> : null; x += width; return rect; })}
    </svg>
  );
}

/** DANFE da NF-e (simulado), no formato do documento auxiliar. */
export function DanfeDocument({ tables, invoice }: { tables: DemoTables; invoice: Invoice }) {
  const items = tables.quote_items.filter((item) => item.quote_id === invoice.quoteId).sort((a, b) => a.display_order - b.display_order);
  const quote = tables.quotes.find((item) => item.id === invoice.quoteId);
  const customer = tables.customers.find((item) => item.id === invoice.customerId);
  const ie = tables.erp.ie.find((item) => item.customerId === invoice.customerId);
  const address = customer?.address && typeof customer.address === "object" && !Array.isArray(customer.address) ? customer.address as Record<string, string | null> : {};
  const key = accessKey(invoice.number);
  return (
    <article className="fiscal-doc">
      <header className="fiscal-head">
        <div className="fiscal-issuer"><img src={logoUrl} alt="" /><div><strong>QUALINUTRI IND. COM. DE NUTRIÇÃO ANIMAL LTDA</strong><span>Av. Rio Arinos, 3881 S · Juara/MT</span><span>CNPJ 12.345.678/0001-90 · IE 13.456.789-0</span></div></div>
        <div className="fiscal-title"><strong>DANFE</strong><span>Documento Auxiliar da Nota Fiscal Eletrônica</span><span>1 - Saída</span><strong>Nº {formatNumber(invoice.number)} · Série 1</strong></div>
        <div className="fiscal-key"><Barcode value={key} /><span>Chave de acesso</span><code>{key}</code><span>Protocolo de autorização: {invoice.protocol ?? "—"} · {new Date(invoice.date).toLocaleString("pt-BR")}</span></div>
      </header>
      <section className="fiscal-box"><h3>Natureza da operação</h3><p>Venda de produção do estabelecimento</p></section>
      <section className="fiscal-box fiscal-grid">
        <h3>Destinatário / remetente</h3>
        <div><span>Nome / razão social</span><strong>{invoice.customer}</strong></div>
        <div><span>CPF/CNPJ</span><strong>{customer?.document ?? "—"}</strong></div>
        <div><span>Inscrição estadual</span><strong>{ie ? `${ie.ie} (${ie.status})` : "Isento"}</strong></div>
        <div><span>Endereço</span><strong>{[address.street, address.city, address.state].filter(Boolean).join(" · ") || "—"}</strong></div>
        <div><span>Data de emissão</span><strong>{new Date(invoice.date).toLocaleDateString("pt-BR")}</strong></div>
      </section>
      <section className="fiscal-box fiscal-grid is-five">
        <h3>Cálculo do imposto</h3>
        <div><span>Base ICMS</span><strong>{formatCurrency(0)}</strong></div>
        <div><span>Valor ICMS</span><strong>{formatCurrency(0)}</strong></div>
        <div><span>Valor dos produtos</span><strong>{formatCurrency(quote?.product_subtotal ?? invoice.value)}</strong></div>
        <div><span>Valor do frete</span><strong>{formatCurrency((quote?.freight_total ?? 0) + (quote?.handling_total ?? 0))}</strong></div>
        <div><span>Valor total da nota</span><strong>{formatCurrency(invoice.value)}</strong></div>
      </section>
      <section className="fiscal-box">
        <h3>Dados dos produtos</h3>
        <table className="fiscal-items">
          <thead><tr><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>Un</th><th className="numeric">Qtd</th><th className="numeric">V. unit.</th><th className="numeric">V. total</th></tr></thead>
          <tbody>{items.map((item, index) => <tr key={item.id}><td>{String(index + 1).padStart(4, "0")}</td><td>{item.product_name_snapshot} · saca {formatNumber(item.weight_kg_snapshot)} kg</td><td>2309.90.90</td><td>5101</td><td>SC</td><td className="numeric">{formatNumber(item.quantity)}</td><td className="numeric">{formatCurrency(item.final_unit_price)}</td><td className="numeric">{formatCurrency(item.product_subtotal)}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="fiscal-box"><h3>Informações complementares</h3><p>Referente ao pedido nº {quote?.quote_number}. Ração e suplemento para alimentação animal: isenção de ICMS conforme legislação estadual (simulado). Documento emitido pela demonstração do sistema.</p></section>
    </article>
  );
}

/** DAMDFE (manifesto de transporte), encadeado à carga. */
export function MdfeDocument({ tables, mdfe }: { tables: DemoTables; mdfe: Mdfe }) {
  const load = tables.loads.find((item) => item.id === mdfe.loadId);
  const invoices = tables.erp.invoices.filter((item) => mdfe.invoices.includes(item.number));
  const key = accessKey(mdfe.number + 70000);
  return (
    <article className="fiscal-doc">
      <header className="fiscal-head">
        <div className="fiscal-issuer"><img src={logoUrl} alt="" /><div><strong>QUALINUTRI IND. COM. DE NUTRIÇÃO ANIMAL LTDA</strong><span>CNPJ 12.345.678/0001-90 · RNTRC 012345678</span></div></div>
        <div className="fiscal-title"><strong>DAMDFE</strong><span>Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais</span><strong>Nº {mdfe.number} · Série 1</strong></div>
        <div className="fiscal-key"><Barcode value={key} /><span>Chave de acesso</span><code>{key}</code><span>Situação: {mdfe.status} · {new Date(mdfe.date).toLocaleString("pt-BR")}</span></div>
      </header>
      <section className="fiscal-box fiscal-grid">
        <h3>Modal rodoviário</h3>
        <div><span>Veículo</span><strong>{mdfe.vehicle}</strong></div>
        <div><span>Placa</span><strong>{mdfe.plate ?? "—"}</strong></div>
        <div><span>Motorista</span><strong>{mdfe.driver}</strong></div>
        <div><span>Carga</span><strong>#{load?.load_number ?? "—"} · {load ? formatNumber(load.total_weight_kg) : "—"} kg</strong></div>
        <div><span>UF carregamento → descarregamento</span><strong>MT → MT</strong></div>
      </section>
      <section className="fiscal-box">
        <h3>Documentos vinculados (NF-e)</h3>
        <table className="fiscal-items">
          <thead><tr><th>Nº NF-e</th><th>Destinatário</th><th className="numeric">Valor</th></tr></thead>
          <tbody>{invoices.map((item) => <tr key={item.id}><td>{item.number}</td><td>{item.customer}</td><td className="numeric">{formatCurrency(item.value)}</td></tr>)}</tbody>
        </table>
      </section>
    </article>
  );
}
