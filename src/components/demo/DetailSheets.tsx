import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, ExternalLink, FileText, Package, X } from "lucide-react";
import type { DemoTables } from "../../demo/store/types";
import { receivables, openPayables } from "../../demo/kpis/finance";
import { addDays, isoDate } from "../../demo/store/ids";
import { formatKpi } from "./format";
import { Sparkline } from "./Sparkline";

type Variant = "center" | "bottom";

/** Janela modal nativa com formato próprio (centro ou folha de baixo). */
export function Sheet({ variant, label, onClose, children }: { variant: Variant; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className={`sheet sheet-${variant}`} aria-label={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="sheet-inner">
        {variant === "bottom" && <span className="sheet-grabber" aria-hidden="true" />}
        <button type="button" className="drawer-close sheet-close" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
        {children}
      </div>
    </dialog>
  );
}

const statusNames: Record<string, string> = { draft: "Rascunho", issued: "Enviado", approved: "Aprovado", cancelled: "Cancelado" };
const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

/** Ficha de orçamento, em formato de documento. */
export function QuoteSheet({ tables, quoteId, onOpen, onClose, actions }: { tables: DemoTables; quoteId: string; onOpen?: () => void; onClose: () => void; actions?: ReactNode }) {
  const quote = tables.quotes.find((item) => item.id === quoteId);
  if (!quote) return null;
  const items = tables.quote_items.filter((item) => item.quote_id === quoteId).sort((a, b) => a.display_order - b.display_order);
  const seller = tables.profiles.find((profile) => profile.id === quote.created_by);
  const term = items[0]?.payment_term_snapshot ?? "—";
  const steps = [
    { label: "Criado", at: quote.created_at },
    { label: "Enviado", at: quote.issued_at },
    quote.status === "cancelled" ? { label: "Cancelado", at: quote.cancelled_at } : { label: "Aprovado", at: quote.approved_at },
  ];
  const weight = items.reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0);
  return (
    <Sheet variant="center" label={`Orçamento ${quote.quote_number}`} onClose={onClose}>
      <div className="doc-sheet">
        <header className="doc-head">
          <span className="doc-icon"><FileText size={22} aria-hidden="true" /></span>
          <div>
            <p className="drawer-kicker">Orçamento</p>
            <h2>#{quote.quote_number}</h2>
          </div>
          <span className={`doc-status is-${quote.status}`}>{statusNames[quote.status] ?? quote.status}</span>
        </header>
        <dl className="doc-parties">
          <div><dt>Cliente</dt><dd>{quote.customer_name_snapshot ?? "Sem cliente vinculado"}</dd></div>
          <div><dt>Vendedor</dt><dd>{seller ? seller.displayName || seller.login : "—"}</dd></div>
          <div><dt>Prazo</dt><dd>{term}{quote.payment_mode ? ` · ${quote.payment_mode === "single" ? "direto" : "parcelado"}` : ""}</dd></div>
          <div><dt>Frete</dt><dd>{quote.freight_table_name_snapshot ? `${quote.freight_table_name_snapshot} · ${quote.freight_zone_snapshot}` : "Sem frete"}</dd></div>
        </dl>
        <ol className="doc-timeline">
          {steps.map((step) => (
            <li key={step.label} className={step.at ? "is-done" : undefined}>
              {step.at ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
              <span><strong>{step.label}</strong><small>{dt(step.at) ?? "—"}</small></span>
            </li>
          ))}
        </ol>
        <table className="doc-items">
          <thead><tr><th>Produto</th><th className="is-number">Sacas</th><th className="is-number">Preço final</th><th className="is-number">Total</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.product_name_snapshot}</strong><small>{item.weight_kg_snapshot} kg{item.total_discount_percentage ? ` · ${item.total_discount_percentage}% desc.` : ""}</small></td>
                <td className="is-number">{item.quantity}</td>
                <td className="is-number">{formatKpi(item.final_unit_price, "currency")}</td>
                <td className="is-number">{formatKpi(item.total, "currency")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="doc-totals">
          <span>Produtos <strong>{formatKpi(quote.product_subtotal, "currency")}</strong></span>
          <span>Frete + chapa <strong>{formatKpi(quote.freight_total + quote.handling_total, "currency")}</strong></span>
          <span>Peso <strong>{formatKpi(weight / 1000, "tons")}</strong></span>
          <span className="doc-grand">Total <strong>{formatKpi(quote.grand_total, "currency")}</strong></span>
        </div>
        {quote.notes && <p className="doc-notes">“{quote.notes}”</p>}
        {actions ? <div className="doc-actions">{actions}</div> : onOpen && <button type="button" className="primary-button" onClick={onOpen}>Abrir em Orçamentos&nbsp;<ExternalLink size={15} aria-hidden="true" /></button>}
      </div>
    </Sheet>
  );
}

/** Ficha do produto: desempenho no período e quem compra. */
export function ProductSheet({ tables, productName, from, to, onOpen, onClose }: { tables: DemoTables; productName: string; from: string; to: string; onOpen?: () => void; onClose: () => void }) {
  const data = useMemo(() => {
    const approved = new Map(tables.quotes.filter((quote) => quote.status === "approved" && quote.approved_at).map((quote) => [quote.id, quote]));
    const lines = tables.quote_items.filter((item) => item.product_name_snapshot === productName && approved.has(item.quote_id));
    const inPeriod = lines.filter((item) => { const key = isoDate(new Date(approved.get(item.quote_id)!.approved_at!)); return key >= from && key <= to; });
    const customers = new Map<string, { name: string; bags: number; revenue: number }>();
    for (const item of inPeriod) {
      const quote = approved.get(item.quote_id)!;
      const name = quote.customer_name_snapshot ?? "Sem cliente";
      const row = customers.get(name) ?? { name, bags: 0, revenue: 0 };
      row.bags += item.quantity;
      row.revenue += item.product_subtotal;
      customers.set(name, row);
    }
    const end = new Date(`${to}T12:00:00`);
    const weekly = Array.from({ length: 12 }, (_, index) => {
      const weekEnd = isoDate(addDays(end, -(11 - index) * 7));
      const weekStart = isoDate(addDays(end, -(11 - index) * 7 - 6));
      return lines.filter((item) => { const key = isoDate(new Date(approved.get(item.quote_id)!.approved_at!)); return key >= weekStart && key <= weekEnd; }).reduce((total, item) => total + item.quantity, 0);
    });
    const product = tables.catalog.products.find((item) => item.name === productName);
    return {
      product, weekly,
      bags: inPeriod.reduce((total, item) => total + item.quantity, 0),
      revenue: inPeriod.reduce((total, item) => total + item.product_subtotal, 0),
      orders: new Set(inPeriod.map((item) => item.quote_id)).size,
      avgPrice: inPeriod.length ? inPeriod.reduce((total, item) => total + item.final_unit_price * item.quantity, 0) / Math.max(1, inPeriod.reduce((total, item) => total + item.quantity, 0)) : 0,
      customers: [...customers.values()].sort((a, b) => b.bags - a.bags).slice(0, 6),
    };
  }, [tables, productName, from, to]);
  return (
    <Sheet variant="center" label={productName} onClose={onClose}>
      <div className="product-sheet">
        <header className="product-hero glass-dark">
          <span className="doc-icon is-light"><Package size={24} aria-hidden="true" /></span>
          <div>
            <p className="dash-greet">{data.product?.group ?? "Produto"} · saca de {data.product?.weightKg ?? "—"} kg</p>
            <h2>{productName}</h2>
            <p className="product-price">Tabela à vista {data.product ? formatKpi(data.product.prices[0], "currency") : "—"}</p>
          </div>
          <Sparkline values={data.weekly} width={160} height={54} tone="dark" />
        </header>
        <div className="product-stats">
          <div><span>Sacas no período</span><strong>{formatKpi(data.bags, "number")}</strong></div>
          <div><span>Faturamento</span><strong>{formatKpi(data.revenue, "currency", true)}</strong></div>
          <div><span>Pedidos</span><strong>{data.orders}</strong></div>
          <div><span>Preço médio praticado</span><strong>{formatKpi(data.avgPrice, "currency")}</strong></div>
        </div>
        <h3>Quem mais comprou</h3>
        <ol className="product-customers">
          {data.customers.map((customer, index) => (
            <li key={customer.name}><span className="bar-rank">{index + 1}</span><span>{customer.name}</span><small>{formatKpi(customer.bags, "number")} sacas</small><strong>{formatKpi(customer.revenue, "currency", true)}</strong></li>
          ))}
          {data.customers.length === 0 && <li className="muted">Sem vendas no período.</li>}
        </ol>
        {onOpen && <button type="button" className="secondary-button" onClick={onOpen}>Ver tabela de produtos</button>}
      </div>
    </Sheet>
  );
}

/** Folha de baixo: linha do tempo dos pedidos aprovados no dia. */
export function DaySheet({ tables, day, onOpenQuote, onClose }: { tables: DemoTables; day: string; onOpenQuote: (id: string) => void; onClose: () => void }) {
  const quotes = tables.quotes.filter((quote) => quote.status === "approved" && quote.approved_at && isoDate(new Date(quote.approved_at)) === day).sort((a, b) => (a.approved_at ?? "").localeCompare(b.approved_at ?? ""));
  const total = quotes.reduce((sum, quote) => sum + quote.product_subtotal, 0);
  return (
    <Sheet variant="bottom" label="Vendas do dia" onClose={onClose}>
      <header className="sheet-head">
        <p className="drawer-kicker">{new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h2>{formatKpi(total, "currency")} <small>em {quotes.length} {quotes.length === 1 ? "pedido aprovado" : "pedidos aprovados"}</small></h2>
      </header>
      {quotes.length === 0 ? <p className="drawer-empty">Nenhum pedido aprovado neste dia.</p> : (
        <ol className="day-timeline">
          {quotes.map((quote, index) => (
            <li key={quote.id} style={{ animationDelay: `${index * 50}ms` }}>
              <time>{new Date(quote.approved_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
              <button type="button" onClick={() => onOpenQuote(quote.id)}>
                <strong>#{quote.quote_number} · {quote.customer_name_snapshot ?? "Sem cliente"}</strong>
                <span>{formatKpi(quote.product_subtotal, "currency")}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

/** Folha de baixo: entradas e saídas da semana, lado a lado. */
export function WeekSheet({ tables, today, weekIndex, onClose }: { tables: DemoTables; today: Date; weekIndex: number; onClose: () => void }) {
  const from = isoDate(addDays(today, weekIndex * 7));
  const to = isoDate(addDays(today, weekIndex * 7 + 6));
  const incoming = receivables(tables, today).filter((item) => !item.paidAt && item.dueDate >= from && item.dueDate <= to);
  const outgoing = openPayables(tables).filter((item) => item.dueDate >= from && item.dueDate <= to);
  const sumIn = incoming.reduce((total, item) => total + item.amount, 0);
  const sumOut = outgoing.reduce((total, item) => total + item.amount, 0);
  const short = (key: string) => key.split("-").reverse().slice(0, 2).join("/");
  return (
    <Sheet variant="bottom" label="Fluxo de caixa da semana" onClose={onClose}>
      <header className="sheet-head">
        <p className="drawer-kicker">Fluxo de caixa · {short(from)} a {short(to)} · simulado</p>
        <h2 className={sumIn - sumOut >= 0 ? "is-positive" : "is-negative"}>Saldo {formatKpi(sumIn - sumOut, "currency")}</h2>
      </header>
      <div className="week-columns">
        <section className="week-col is-in">
          <h3><ArrowDownLeft size={18} aria-hidden="true" /> Entradas <strong>{formatKpi(sumIn, "currency")}</strong></h3>
          <ul>{incoming.map((item) => <li key={`${item.quoteId}-${item.number}`}><span>{item.customer}<small>#{item.quoteNumber} · parcela {item.number}/{item.of} · {short(item.dueDate)}</small></span><strong>{formatKpi(item.amount, "currency")}</strong></li>)}</ul>
          {incoming.length === 0 && <p className="muted">Nada a receber nesta semana.</p>}
        </section>
        <section className="week-col is-out">
          <h3><ArrowUpRight size={18} aria-hidden="true" /> Saídas <strong>{formatKpi(sumOut, "currency")}</strong></h3>
          <ul>{outgoing.map((item) => <li key={item.id}><span>{item.supplier}<small>{item.category} · {item.description} · {short(item.dueDate)}</small></span><strong>{formatKpi(item.amount, "currency")}</strong></li>)}</ul>
          {outgoing.length === 0 && <p className="muted">Nada a pagar nesta semana.</p>}
        </section>
      </div>
    </Sheet>
  );
}
