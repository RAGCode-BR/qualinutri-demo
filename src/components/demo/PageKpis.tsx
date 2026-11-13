import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { pageKpis, type PageKpi } from "../../demo/kpis/pages";
import { today } from "../../demo/store/ids";
import type { TabId } from "../../layouts/AppSidebar";
import { DetailDrawer } from "./DetailDrawer";
import { formatKpi } from "./format";
import { useCountUp } from "./useCountUp";

function StripCard({ kpi, index, onOpen }: { kpi: PageKpi; index: number; onOpen: () => void }) {
  const value = useCountUp(kpi.value, 800);
  return (
    <button type="button" className={`strip-card${kpi.tone ? ` is-${kpi.tone}` : ""}`} style={{ animationDelay: `${index * 55}ms` }} onClick={onOpen}>
      <span className="strip-label">{kpi.label}<ArrowUpRight size={14} aria-hidden="true" /></span>
      <strong className="strip-value">{formatKpi(value, kpi.format, true)}</strong>
      {kpi.caption && <span className="strip-caption">{kpi.caption}</span>}
    </button>
  );
}

/** Faixa de indicadores clicáveis no topo de cada tela. */
export function PageKpis({ tab }: { tab: TabId }) {
  const tables = useDemoTables();
  const { profile } = useAuth();
  const [open, setOpen] = useState<PageKpi | null>(null);
  const kpis = useMemo(() => pageKpis(tab, tables, today(), profile), [tab, tables, profile]);
  if (kpis.length === 0) return null;
  return (
    <>
      <section className="kpi-strip" aria-label="Indicadores da tela">
        {kpis.map((kpi, index) => <StripCard key={kpi.id} kpi={kpi} index={index} onOpen={() => setOpen(kpi)} />)}
      </section>
      {open && <DetailDrawer selection={open.selection} onClose={() => setOpen(null)} />}
    </>
  );
}
