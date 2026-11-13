import type { ReactNode } from "react";
import { AlertOctagon, ArrowDownLeft, ArrowUpRight, Building2, FilePlus2, List, MapPin, Phone, TrendingUp, Users } from "lucide-react";
import type { DemoTables } from "../../demo/store/types";
import type { Kpi, Period } from "../../demo/kpis/dashboard";
import { openPayables, receivables } from "../../demo/kpis/finance";
import { addDays, isoDate } from "../../demo/store/ids";
import { BarList } from "./Charts";
import { Sheet } from "./DetailSheets";
import { formatKpi } from "./format";
import { useCountUp } from "./useCountUp";

type Common = { kpi: Kpi; tables: DemoTables; period: Period; today: Date; onList: () => void; onOpenQuote: (id: string) => void; onClose: () => void };

const short = (key: string | null) => (key ? key.split("-").reverse().slice(0, 2).join("/") : "—");
const local = (iso: string | null) => (iso ? isoDate(new Date(iso)) : null);
const within = (iso: string | null, period: Period) => { const key = local(iso); return key !== null && key >= period.from && key <= period.to; };
const sellerOf = (tables: DemoTables, id: string | null) => { const user = tables.profiles.find((profile) => profile.id === id); return user ? user.displayName || user.login : "—"; };

function Hero({ icon, kicker, value, format, caption, tone = "green" }: { icon: ReactNode; kicker: string; value: number; format: Kpi["format"]; caption?: string; tone?: "green" | "red" | "lime" }) {
  const animated = useCountUp(value, 900);
  return (
    <header className={`kpi-sheet-hero tone-${tone}`}>
      <span className="kpi-sheet-icon">{icon}</span>
      <div>
        <p>{kicker}</p>
        <strong>{formatKpi(animated, format)}</strong>
        {caption && <small>{caption}</small>}
      </div>
    </header>
  );
}

function ListButton({ onList }: { onList: () => void }) {
  return <button type="button" className="secondary-button compact-secondary kpi-sheet-list" onClick={onList}><List size={16} aria-hidden="true" />&nbsp;Ver lista completa</button>;
}

function SalesSheet({ kpi, tables, period, onList, onOpenQuote, onClose }: Common) {
  const approved = tables.quotes.filter((quote) => quote.status === "approved" && within(quote.approved_at, period));
  const bySeller = new Map<string, number>();
  for (const quote of approved) bySeller.set(sellerOf(tables, quote.created_by), (bySeller.get(sellerOf(tables, quote.created_by)) ?? 0) + quote.product_subtotal);
  const days: { key: string; value: number }[] = [];
  for (let date = new Date(`${period.from}T12:00:00`); isoDate(date) <= period.to; date = addDays(date, 1)) {
    const key = isoDate(date);
    days.push({ key, value: approved.filter((quote) => local(quote.approved_at) === key).reduce((total, quote) => total + quote.product_subtotal, 0) });
  }
  const max = Math.max(1, ...days.map((day) => day.value));
  return (
    <Sheet variant="center" label="Vendas" onClose={onClose}>
      <div className="kpi-sheet">
        <Hero icon={<TrendingUp size={26} />} kicker="Vendas aprovadas no período" value={kpi.value} format="currency" caption={kpi.caption} />
        <section className="kpi-sheet-columns">
          <div><h3>Por dia</h3><div className="mini-columns">{days.map((day, index) => <span key={day.key} title={`${short(day.key)}: ${formatKpi(day.value, "currency")}`} style={{ height: `${Math.max(3, (day.value / max) * 100)}%`, animationDelay: `${index * 20}ms` }} />)}</div></div>
          <div><h3>Por vendedor</h3><BarList format="currency" items={[...bySeller.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} /></div>
        </section>
        <h3>Últimos pedidos</h3>
        <ul className="kpi-sheet-quotes">
          {approved.sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? "")).slice(0, 6).map((quote) => (
            <li key={quote.id}><button type="button" onClick={() => onOpenQuote(quote.id)}><span>#{quote.quote_number} · {quote.customer_name_snapshot ?? "Sem cliente"}</span><small>{short(local(quote.approved_at))}</small><strong>{formatKpi(quote.product_subtotal, "currency")}</strong></button></li>
          ))}
        </ul>
        <ListButton onList={onList} />
      </div>
    </Sheet>
  );
}

function OpenQuotesSheet({ kpi, tables, onList, onOpenQuote, onClose }: Common) {
  const open = tables.quotes.filter((quote) => quote.status === "draft" || quote.status === "issued").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const column = (status: "draft" | "issued", title: string) => {
    const list = open.filter((quote) => quote.status === status);
    return (
      <section className={`kpi-board-col is-${status}`}>
        <h3>{title}<span>{list.length} · {formatKpi(list.reduce((total, quote) => total + quote.grand_total, 0), "currency", true)}</span></h3>
        {list.map((quote, index) => (
          <button type="button" key={quote.id} className="kpi-board-card" style={{ animationDelay: `${Math.min(index, 15) * 35}ms` }} onClick={() => onOpenQuote(quote.id)}>
            <strong>#{quote.quote_number} · {quote.customer_name_snapshot ?? "Sem cliente"}</strong>
            <small>{sellerOf(tables, quote.created_by)} · {short(local(quote.created_at))}</small>
            <span>{formatKpi(quote.grand_total, "currency")}</span>
          </button>
        ))}
      </section>
    );
  };
  return (
    <Sheet variant="bottom" label="Orçamentos em aberto" onClose={onClose}>
      <header className="sheet-head"><p className="drawer-kicker">Orçamentos em aberto</p><h2>{formatKpi(kpi.value, "currency")} <small>{kpi.caption}</small></h2></header>
      <div className="kpi-board">{column("draft", "Rascunho")}{column("issued", "Enviado · aguardando o cliente")}</div>
      <ListButton onList={onList} />
    </Sheet>
  );
}

function ConversionSheet({ kpi, tables, period, onList, onClose }: Common) {
  const created = tables.quotes.filter((quote) => within(quote.created_at, period));
  const issued = created.filter((quote) => quote.issued_at);
  const approved = created.filter((quote) => quote.status === "approved");
  const steps = [{ label: "Criados", value: created.length }, { label: "Enviados", value: issued.length }, { label: "Aprovados", value: approved.length }];
  const sellers = [...new Set(created.map((quote) => quote.created_by))].map((id) => {
    const mine = created.filter((quote) => quote.created_by === id);
    const sent = mine.filter((quote) => quote.issued_at).length;
    return { label: sellerOf(tables, id), value: sent ? (mine.filter((quote) => quote.status === "approved").length / sent) * 100 : 0, sub: `${mine.length} orçamentos` };
  }).sort((a, b) => b.value - a.value);
  return (
    <Sheet variant="center" label="Conversão" onClose={onClose}>
      <div className="kpi-sheet">
        <Hero icon={<TrendingUp size={26} />} kicker="Conversão (aprovados ÷ enviados)" value={kpi.value} format="percent" tone="lime" />
        <ol className="big-funnel">
          {steps.map((step, index) => (
            <li key={step.label} style={{ width: `${created.length ? Math.max(30, (step.value / created.length) * 100) : 30}%`, animationDelay: `${index * 100}ms` }}>
              <span>{step.label}</span><strong>{step.value}</strong>
              {index > 0 && <em>{steps[index - 1].value ? Math.round((step.value / steps[index - 1].value) * 100) : 0}% da etapa anterior</em>}
            </li>
          ))}
        </ol>
        <h3>Conversão por vendedor</h3>
        <BarList format="number" items={sellers.map((seller) => ({ label: seller.label, value: Math.round(seller.value), sub: `${Math.round(seller.value)}% · ${seller.sub}` }))} />
        <ListButton onList={onList} />
      </div>
    </Sheet>
  );
}

function TicketSheet({ kpi, tables, period, onList, onClose }: Common) {
  const values = tables.quotes.filter((quote) => quote.status === "approved" && within(quote.approved_at, period)).map((quote) => quote.product_subtotal);
  const buckets = [10_000, 25_000, 50_000, 100_000, Infinity];
  const labels = ["até 10 mil", "10–25 mil", "25–50 mil", "50–100 mil", "acima de 100 mil"];
  const counts = buckets.map((limit, index) => values.filter((value) => value <= limit && value > (index ? buckets[index - 1] : -1)).length);
  const max = Math.max(1, ...counts);
  return (
    <Sheet variant="center" label="Ticket médio" onClose={onClose}>
      <div className="kpi-sheet">
        <Hero icon={<TrendingUp size={26} />} kicker="Ticket médio por pedido aprovado" value={kpi.value} format="currency" caption={`${values.length} pedidos no período`} />
        <div className="ticket-stats">
          <div><span>Menor pedido</span><strong>{formatKpi(values.length ? Math.min(...values) : 0, "currency")}</strong></div>
          <div><span>Média</span><strong>{formatKpi(kpi.value, "currency")}</strong></div>
          <div><span>Maior pedido</span><strong>{formatKpi(values.length ? Math.max(...values) : 0, "currency")}</strong></div>
        </div>
        <h3>Distribuição dos pedidos</h3>
        <div className="histogram">
          {counts.map((count, index) => (
            <div key={labels[index]}><span className="histogram-bar" style={{ height: `${(count / max) * 100}%`, animationDelay: `${index * 70}ms` }}><b>{count}</b></span><small>{labels[index]}</small></div>
          ))}
        </div>
        <ListButton onList={onList} />
      </div>
    </Sheet>
  );
}

function ReceivableSheet({ kpi, tables, today, onList, onOpenQuote, onClose }: Common) {
  const todayKey = isoDate(today);
  const list = receivables(tables, today).filter((item) => !item.paidAt && item.dueDate >= todayKey);
  const groups = new Map<string, typeof list>();
  for (const item of list) {
    const days = Math.floor((new Date(`${item.dueDate}T12:00:00`).getTime() - new Date(`${todayKey}T12:00:00`).getTime()) / 86_400_000);
    const key = days < 7 ? "Próximos 7 dias" : days < 30 ? "Em até 30 dias" : days < 60 ? "De 30 a 60 dias" : "Acima de 60 dias";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <Sheet variant="bottom" label="A receber" onClose={onClose}>
      <header className="sheet-head"><p className="drawer-kicker"><ArrowDownLeft size={14} aria-hidden="true" /> A receber · simulado</p><h2 className="is-positive">{formatKpi(kpi.value, "currency")} <small>{kpi.caption}</small></h2></header>
      <div className="due-groups">
        {[...groups.entries()].map(([title, items]) => (
          <section key={title} className="due-group">
            <h3>{title}<strong>{formatKpi(items.reduce((total, item) => total + item.amount, 0), "currency")}</strong></h3>
            <ul>{items.slice(0, 12).map((item) => <li key={`${item.quoteId}-${item.number}`}><button type="button" onClick={() => onOpenQuote(item.quoteId)}><span className="due-date">{short(item.dueDate)}</span><span>{item.customer}<small>#{item.quoteNumber} · parcela {item.number}/{item.of}</small></span><strong>{formatKpi(item.amount, "currency")}</strong></button></li>)}</ul>
            {items.length > 12 && <p className="muted">+{items.length - 12} parcelas</p>}
          </section>
        ))}
      </div>
      <ListButton onList={onList} />
    </Sheet>
  );
}

function PayableSheet({ kpi, tables, today, onList, onClose }: Common) {
  const todayKey = isoDate(today);
  const list = openPayables(tables).filter((item) => item.dueDate >= todayKey);
  const categories = new Map<string, typeof list>();
  for (const item of list) categories.set(item.category, [...(categories.get(item.category) ?? []), item]);
  const total = list.reduce((sum, item) => sum + item.amount, 0) || 1;
  return (
    <Sheet variant="bottom" label="A pagar" onClose={onClose}>
      <header className="sheet-head"><p className="drawer-kicker"><ArrowUpRight size={14} aria-hidden="true" /> A pagar · simulado</p><h2 className="is-negative">{formatKpi(kpi.value, "currency")} <small>{kpi.caption}</small></h2></header>
      <div className="category-bar">{[...categories.entries()].map(([category, items], index) => <span key={category} className={`cat-${index}`} style={{ flex: items.reduce((sum, item) => sum + item.amount, 0) / total }} title={category} />)}</div>
      <div className="due-groups">
        {[...categories.entries()].map(([category, items], index) => (
          <section key={category} className="due-group">
            <h3><i className={`cat-dot cat-${index}`} />{category}<strong>{formatKpi(items.reduce((sum, item) => sum + item.amount, 0), "currency")}</strong></h3>
            <ul>{items.map((item) => <li key={item.id}><div className="due-row"><span className="due-date">{short(item.dueDate)}</span><span>{item.supplier}<small>{item.description}</small></span><strong>{formatKpi(item.amount, "currency")}</strong></div></li>)}</ul>
          </section>
        ))}
      </div>
      <ListButton onList={onList} />
    </Sheet>
  );
}

function OverdueSheet({ kpi, tables, today, onList, onOpenQuote, onClose }: Common) {
  const todayKey = isoDate(today);
  const late = (due: string) => Math.round((new Date(`${todayKey}T12:00:00`).getTime() - new Date(`${due}T12:00:00`).getTime()) / 86_400_000);
  const receivable = receivables(tables, today).filter((item) => !item.paidAt && item.dueDate < todayKey).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const payable = openPayables(tables).filter((item) => item.dueDate < todayKey).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <Sheet variant="center" label="Em atraso" onClose={onClose}>
      <div className="kpi-sheet is-alert">
        <Hero icon={<AlertOctagon size={26} />} kicker="Contas vencidas e não pagas" value={kpi.value} format="number" caption={kpi.caption} tone="red" />
        <section className="overdue-col"><h3><ArrowDownLeft size={16} aria-hidden="true" /> Clientes em atraso ({receivable.length})</h3>
          <ul>{receivable.map((item) => <li key={`${item.quoteId}-${item.number}`}><button type="button" onClick={() => onOpenQuote(item.quoteId)}><span className="late-days">{late(item.dueDate)}d</span><span>{item.customer}<small>#{item.quoteNumber} · parcela {item.number}/{item.of} · venceu {short(item.dueDate)}</small></span><strong>{formatKpi(item.amount, "currency")}</strong></button></li>)}</ul>
        </section>
        <section className="overdue-col"><h3><ArrowUpRight size={16} aria-hidden="true" /> Fornecedores em atraso ({payable.length})</h3>
          <ul>{payable.map((item) => <li key={item.id}><div className="due-row"><span className="late-days">{late(item.dueDate)}d</span><span>{item.supplier}<small>{item.description} · venceu {short(item.dueDate)}</small></span><strong>{formatKpi(item.amount, "currency")}</strong></div></li>)}</ul>
        </section>
        <ListButton onList={onList} />
      </div>
    </Sheet>
  );
}

function CustomersSheet({ kpi, tables, period, onList, onClose, onNewQuote }: Common & { onNewQuote?: (customer: { id: string; name: string; document: string | null }) => void }) {
  const list = tables.customers.filter((customer) => within(customer.created_at, period));
  const city = (address: unknown) => (address && typeof address === "object" && "city" in address ? String((address as { city: unknown }).city ?? "") : "");
  return (
    <Sheet variant="center" label="Novos clientes" onClose={onClose}>
      <div className="kpi-sheet">
        <Hero icon={<Users size={26} />} kicker="Novos clientes no período" value={kpi.value} format="number" tone="lime" />
        {list.length === 0 ? <p className="drawer-empty">Nenhum cliente novo neste período. Tente "Mês".</p> : (
          <div className="contact-grid">
            {list.map((customer, index) => (
              <article key={customer.id} className="contact-card" style={{ animationDelay: `${index * 50}ms` }}>
                <span className="avatar">{customer.legal_name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span>
                <strong>{customer.legal_name}</strong>
                {customer.trade_name && <small><Building2 size={12} aria-hidden="true" /> {customer.trade_name}</small>}
                <small><MapPin size={12} aria-hidden="true" /> {city(customer.address) || "—"}</small>
                <small><Phone size={12} aria-hidden="true" /> {customer.phone ?? "—"}</small>
                {onNewQuote && <button type="button" className="link-button" onClick={() => onNewQuote({ id: customer.id, name: customer.legal_name, document: customer.document })}><FilePlus2 size={14} aria-hidden="true" /> Novo orçamento</button>}
              </article>
            ))}
          </div>
        )}
        <ListButton onList={onList} />
      </div>
    </Sheet>
  );
}

/** Cada indicador do painel abre uma tela com formato próprio. */
export function KpiSheet(props: Common & { onNewQuote?: (customer: { id: string; name: string; document: string | null }) => void }) {
  switch (props.kpi.id) {
    case "sales": return <SalesSheet {...props} />;
    case "openQuotes": return <OpenQuotesSheet {...props} />;
    case "conversion": return <ConversionSheet {...props} />;
    case "ticket": return <TicketSheet {...props} />;
    case "receivable": return <ReceivableSheet {...props} />;
    case "payable": return <PayableSheet {...props} />;
    case "overdue": return <OverdueSheet {...props} />;
    case "newCustomers": return <CustomersSheet {...props} />;
    default: return null;
  }
}
