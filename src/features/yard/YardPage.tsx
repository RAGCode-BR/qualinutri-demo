import { useMemo, useState } from "react";
import { Box, Expand, PackageOpen, Truck } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { yardOptions } from "../../demo/kpis/yard";
import { formatKpi } from "../../components/demo/format";

/** Simulador 3D de montagem de carga, alimentado pelas cargas e pedidos do sistema. */
export function YardPage() {
  const tables = useDemoTables();
  const options = useMemo(() => yardOptions(tables), [tables]);
  const [active, setActive] = useState<string | null>(options[0]?.id ?? null);
  const current = options.find((option) => option.id === active);
  const src = `${import.meta.env.BASE_URL}patio-de-carga.html${current ? `#${encodeURIComponent(JSON.stringify(current.preset))}` : ""}`;

  return (
    <div className="yard">
      <aside className="yard-list dash-card" aria-label="Cargas">
        <header className="dash-card-head"><h2>Cargas</h2><span className="kpi-sim">3D</span></header>
        <p className="muted">Escolha uma carga: os pedidos viram paletes de sacas e o sistema organiza o caminhão.</p>
        <ul>
          {options.map((option, index) => (
            <li key={option.id} style={{ animationDelay: `${index * 40}ms` }}>
              <button type="button" aria-pressed={option.id === active} onClick={() => setActive(option.id)}>
                <span className="yard-icon">{option.id === "pending" ? <PackageOpen size={18} aria-hidden="true" /> : <Truck size={18} aria-hidden="true" />}</span>
                <span className="yard-text">
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                  <small className="yard-meta"><Box size={12} aria-hidden="true" /> {formatKpi(option.kg / 1000, "tons")} · {option.status}</small>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" aria-pressed={active === null} onClick={() => setActive(null)}>
              <span className="yard-icon"><Box size={18} aria-hidden="true" /></span>
              <span className="yard-text"><strong>Carga livre</strong><small>Exemplo para montar do zero</small></span>
            </button>
          </li>
        </ul>
      </aside>
      <section className="yard-stage">
        <iframe key={src} title="Pátio de Carga 3D" src={src} />
        <button type="button" className="yard-full" onClick={() => window.open(src, "_blank", "noopener")}><Expand size={16} aria-hidden="true" /> Tela cheia</button>
      </section>
    </div>
  );
}
