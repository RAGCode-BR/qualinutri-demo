import { DatabaseZap } from "lucide-react";
import { setRealOnly } from "../../demo/realOnly";

export const NO_REAL_TEXT = "Sem dados reais para exibir";

/** Aviso do modo "Somente dados reais" no lugar de telas e cartões com dados fictícios. */
export function NoRealData({ compact = false }: { compact?: boolean }) {
  if (compact) return <p className="no-real is-compact"><DatabaseZap size={16} aria-hidden="true" /> {NO_REAL_TEXT}</p>;
  return (
    <section className="no-real" role="status">
      <DatabaseZap size={34} aria-hidden="true" />
      <strong>{NO_REAL_TEXT}</strong>
      <small>Esta tela só tem dados fictícios da demonstração. Os dados reais (PDFs TGA, 01 a 13/11/2026) estão em Início, Vendedores, Relatórios e Produtos.</small>
      <button type="button" className="secondary-button compact-secondary" onClick={() => setRealOnly(false)}>Mostrar também os dados da demonstração</button>
    </section>
  );
}
