import { useEffect, useRef } from "react";
import { AlertTriangle, BellRing, ChevronRight, X } from "lucide-react";
import type { DemoAlert } from "../../demo/kpis/alerts";
import type { TabId } from "../../layouts/AppSidebar";

type AlertsPanelProps = { alerts: DemoAlert[]; onNavigate: (tab: TabId) => void; onClose: () => void };

export function AlertsPanel({ alerts, onNavigate, onClose }: AlertsPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="detail-drawer alerts-drawer" aria-labelledby="alerts-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className="drawer-inner">
        <header className="drawer-head">
          <div>
            <p className="drawer-kicker">{alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}</p>
            <h2 id="alerts-title">Precisa de atenção</h2>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden="true" /></button>
        </header>
        <ul className="alert-list">
          {alerts.length === 0 && <li className="drawer-empty">Tudo em dia por aqui.</li>}
          {alerts.map((alert, index) => (
            <li key={alert.id} style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}>
              <button type="button" className={`alert-item is-${alert.level}`} onClick={() => { onClose(); onNavigate(alert.tab); }}>
                <span className="alert-icon">{alert.level === "high" ? <AlertTriangle size={18} aria-hidden="true" /> : <BellRing size={18} aria-hidden="true" />}</span>
                <span className="alert-text"><strong>{alert.title}</strong><small>{alert.detail}</small></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
