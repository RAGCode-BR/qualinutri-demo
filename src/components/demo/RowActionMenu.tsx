import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type RowAction = { id: string; label: string; hint?: string; icon: ReactNode; primary?: boolean; onSelect: () => void };

/** Menu pequeno que abre onde a linha foi clicada, para escolher o que fazer com ela. */
export function RowActionMenu({ x, y, title, actions, onClose }: { x: number; y: number; title: string; actions: RowAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.max(12, Math.min(x, window.innerWidth - box.width - 12));
    const top = y + box.height + 12 > window.innerHeight ? Math.max(12, y - box.height) : y;
    setPos({ left, top });
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="row-menu" role="menu" aria-label={title} style={{ left: pos.left, top: pos.top }}>
      <p className="row-menu-title">{title}</p>
      {actions.map((action) => (
        <button key={action.id} type="button" role="menuitem" className={action.primary ? "is-primary" : undefined} onClick={() => { onClose(); action.onSelect(); }}>
          <span className="row-menu-icon">{action.icon}</span>
          <span><strong>{action.label}</strong>{action.hint && <small>{action.hint}</small>}</span>
        </button>
      ))}
    </div>
  );
}
