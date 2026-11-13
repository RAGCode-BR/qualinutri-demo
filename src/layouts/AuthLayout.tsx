import type { ReactNode } from "react";
import logoUrl from "../assets/qualinutri-logo.png";

type AuthLayoutProps = {
  titleId?: string;
  children: ReactNode;
};

export function AuthLayout({ titleId, children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <img src={logoUrl} alt="Qualinutri Nutrição Animal" />
        <div className="auth-brand-text">
          <p className="auth-brand-title">Sistema comercial</p>
          <p className="auth-brand-lead">A ferramenta da equipe comercial para montar pedidos com o preço certo.</p>
          <ul className="auth-brand-list">
            <li>Preços por prazo e descontos por linha de produto</li>
            <li>Frete por cidade ou por distância, com chapa</li>
            <li>Orçamentos salvos e vinculados a cada cliente</li>
            <li>Agenda e registro de visitas</li>
          </ul>
        </div>
        {/* Arcos que retomam a curva do símbolo da marca */}
        <svg className="auth-brand-arcs" viewBox="0 0 600 600" aria-hidden="true" focusable="false">
          <circle cx="420" cy="460" r="150" />
          <circle cx="420" cy="460" r="230" />
          <circle cx="420" cy="460" r="310" />
          <circle cx="420" cy="460" r="390" />
        </svg>
      </div>
      <section className="auth-panel" aria-labelledby={titleId}>
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
