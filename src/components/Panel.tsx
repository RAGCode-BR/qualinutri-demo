import type { ReactNode } from "react";

type PanelProps = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Tabela encostada nas bordas do painel, sem recuo interno. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
};

export function Panel({ title, description, actions, flush = false, className, children }: PanelProps) {
  const classes = ["panel", flush ? "panel-flush" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <section className={classes}>
      {(title || description || actions) && (
        <header className="panel-header">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {description && <p className="panel-description">{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
