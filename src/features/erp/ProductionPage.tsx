import { useState } from "react";
import { AlertTriangle, Factory, FlaskConical, Lock, PackageCheck, Play, Plus, Warehouse } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { advanceOrder, createOrder } from "../../demo/erp/service";
import { isoDate, today } from "../../demo/store/ids";
import { Chip, Stat, Tabs, dateBr, money } from "./shared";

type Section = "orders" | "stock" | "formulas";
const orderLabel = { planejada: "Planejada", em_producao: "Em produção", concluida: "Concluída" } as const;

export function ProductionPage() {
  const tables = useDemoTables();
  const [section, setSection] = useState<Section>("orders");
  const low = tables.erp.materials.filter((item) => item.stockKg < item.minKg).length;
  return (
    <div className="erp-page">
      <Tabs value={section} onChange={setSection} options={[{ id: "orders", label: "Ordens de produção" }, { id: "stock", label: "Estoque", badge: low }, { id: "formulas", label: "Fórmulas e custo" }]} />
      <div className="page-enter" key={section}>
        {section === "orders" && <Orders />}
        {section === "stock" && <Stock />}
        {section === "formulas" && <Formulas />}
      </div>
    </div>
  );
}

function Orders() {
  const tables = useDemoTables();
  const todayKey = isoDate(today());
  const [product, setProduct] = useState(tables.catalog.products[0]?.name ?? "");
  const [bags, setBags] = useState(200);
  const orders = tables.erp.orders;
  const [error, setError] = useState("");
  const columns = (["planejada", "em_producao", "concluida"] as const).map((status) => ({ status, list: orders.filter((order) => order.status === status).slice(0, status === "concluida" ? 8 : 20) }));
  const producedToday = orders.filter((order) => order.status === "concluida" && order.date === todayKey).reduce((sum, order) => sum + order.bags, 0);
  return (
    <div className="erp-grid">
      <section className="kpi-strip">
        <Stat label="Em produção agora" value={orders.filter((order) => order.status === "em_producao").length} format="number" tone="good" caption="Lançado na hora, não no fim do dia" />
        <Stat index={1} label="Planejadas" value={orders.filter((order) => order.status === "planejada").length} format="number" />
        <Stat index={2} label="Sacas produzidas hoje" value={producedToday} format="number" />
        <Stat index={3} label="Toneladas no mês" value={orders.filter((order) => order.status === "concluida" && order.date.slice(0, 7) === todayKey.slice(0, 7)).reduce((sum, order) => sum + (order.bags * order.bagKg) / 1000, 0)} format="tons" />
      </section>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <form className="dash-card erp-inline-form" onSubmit={(event) => { event.preventDefault(); const item = tables.catalog.products.find((row) => row.name === product); void createOrder(product, bags, item?.weightKg ?? 40); }}>
        <Plus size={18} aria-hidden="true" />
        <select className="ck-target-filter" value={product} onChange={(event) => setProduct(event.target.value)} aria-label="Produto">{tables.catalog.products.map((item) => <option key={item.name}>{item.name}</option>)}</select>
        <input type="number" min={10} step={10} value={bags} onChange={(event) => setBags(Number(event.target.value))} aria-label="Sacas" />
        <span className="muted">sacas</span>
        <button type="submit" className="primary-button compact-button">Criar ordem</button>
      </form>
      <section className="kpi-board is-three">
        {columns.map((column) => (
          <div key={column.status} className={`kpi-board-col is-${column.status}`}>
            <h3>{orderLabel[column.status]}<span>{orders.filter((order) => order.status === column.status).length}</span></h3>
            {column.list.map((order, index) => (
              <article key={order.id} className="kpi-board-card is-static" style={{ animationDelay: `${index * 35}ms` }}>
                <strong>OP {order.number} · {order.product}</strong>
                <small>{order.bags} sacas de {order.bagKg} kg · {dateBr(order.date)} · {order.operator}</small>
                {order.status !== "concluida" && <button type="button" className="link-button" onClick={() => { setError(""); void advanceOrder(order.id).catch((reason: Error) => setError(reason.message)); }}><Play size={13} aria-hidden="true" /> {order.status === "planejada" ? "Iniciar" : "Concluir e baixar insumos"}</button>}
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function Stock() {
  const tables = useDemoTables();
  const max = Math.max(...tables.erp.materials.map((item) => Math.max(item.stockKg, item.minKg)));
  return (
    <div className="dash-columns">
      <section className="dash-card">
        <header className="dash-card-head"><h2><Warehouse size={16} aria-hidden="true" /> Matéria-prima</h2></header>
        <ul className="stock-list">
          {tables.erp.materials.map((item, index) => (
            <li key={item.id} className={item.stockKg < item.minKg ? "is-low" : undefined} style={{ animationDelay: `${index * 50}ms` }}>
              <span className="stock-head"><strong>{item.name}</strong><small>{item.location}</small>{item.stockKg < item.minKg && <Chip tone="bad"><AlertTriangle size={12} aria-hidden="true" /> abaixo do mínimo</Chip>}<b>{(item.stockKg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</b></span>
              <span className="stock-track"><i style={{ width: `${(item.stockKg / max) * 100}%` }} /><em style={{ left: `${(item.minKg / max) * 100}%` }} title={`Mínimo ${(item.minKg / 1000).toLocaleString("pt-BR")} t`} /></span>
            </li>
          ))}
        </ul>
      </section>
      <section className="dash-card">
        <header className="dash-card-head"><h2><PackageCheck size={16} aria-hidden="true" /> Produto acabado</h2><Chip tone="info">disponível para separar</Chip></header>
        <table className="erp-table">
          <thead><tr><th>Produto</th><th className="is-number">Em estoque</th><th className="is-number">Reservado</th><th className="is-number">Disponível</th></tr></thead>
          <tbody>{tables.erp.finished.map((item) => <tr key={item.product}><td>{item.product}<small>{item.location}</small></td><td className="is-number">{item.bags}</td><td className="is-number">{item.reserved}</td><td className="is-number"><strong className={item.bags - item.reserved <= 0 ? "erp-error" : undefined}>{item.bags - item.reserved}</strong></td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

function Formulas() {
  const tables = useDemoTables();
  const [selected, setSelected] = useState(tables.erp.formulas[0]?.id ?? "");
  const formula = tables.erp.formulas.find((item) => item.id === selected);
  const price = (name: string) => tables.erp.materials.find((item) => item.name === name)?.pricePerKg ?? 0;
  const costPerTon = formula ? formula.ingredients.reduce((sum, item) => sum + (item.pct / 100) * 1000 * price(item.material), 0) : 0;
  const product = tables.catalog.products.find((item) => item.name === formula?.product);
  const costPerBag = product ? (costPerTon / 1000) * product.weightKg : 0;
  const margin = product ? ((product.prices[0] - costPerBag) / product.prices[0]) * 100 : 0;
  return (
    <div className="formula-layout">
      <aside className="dash-card formula-list">
        <header className="dash-card-head"><h2><FlaskConical size={16} aria-hidden="true" /> Fórmulas</h2></header>
        <ul>{tables.erp.formulas.map((item) => <li key={item.id}><button type="button" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}><strong>{item.product}</strong><small>{item.version} · {item.author}</small></button></li>)}</ul>
      </aside>
      {formula && (
        <section className="dash-card formula-detail">
          <header className="formula-hero glass-dark">
            <Factory size={26} aria-hidden="true" />
            <div><p className="dash-greet"><Lock size={13} aria-hidden="true" /> Fórmula da empresa · {formula.version}</p><h2>{formula.product}</h2><p>Atualizada em {dateBr(formula.updatedAt)} por {formula.author}. Fica no sistema da Qualinutri, sem depender de programa externo.</p></div>
          </header>
          <div className="formula-mix">
            {formula.ingredients.map((item, index) => <span key={item.material} className={`cat-${index % 5}`} style={{ flex: item.pct }} title={`${item.material} ${item.pct}%`} />)}
          </div>
          <table className="erp-table">
            <thead><tr><th>Ingrediente</th><th className="is-number">%</th><th className="is-number">kg por t</th><th className="is-number">R$/kg</th><th className="is-number">Custo por t</th></tr></thead>
            <tbody>{formula.ingredients.map((item, index) => <tr key={item.material}><td><i className={`cat-dot cat-${index % 5}`} /> {item.material}</td><td className="is-number">{item.pct}%</td><td className="is-number">{item.pct * 10}</td><td className="is-number">{money(price(item.material))}</td><td className="is-number">{money((item.pct / 100) * 1000 * price(item.material))}</td></tr>)}</tbody>
          </table>
          <div className="erp-compare">
            <div><span>Custo de matéria-prima por tonelada</span><strong>{money(costPerTon)}</strong></div>
            <div><span>Custo por saca de {product?.weightKg ?? "—"} kg</span><strong>{money(costPerBag)}</strong></div>
            <div className={margin < 25 ? "is-diff" : undefined}><span>Margem sobre o preço à vista</span><strong>{margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>
          </div>
        </section>
      )}
    </div>
  );
}
