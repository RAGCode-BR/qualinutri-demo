import { useEffect } from "react";

const INTERACTIVE = "button, a, input, select, textarea, label, summary, [role='listbox'], [role='option'], [role='button']";
const ROW = "tbody tr, .visit-card";
const ACTIONS = ["Editar", "Registrar"];

/** Botão de edição da própria linha/cartão ("Editar", ou "Registrar" nas visitas). */
export function editButtonOf(row: Element): HTMLButtonElement | null {
  const buttons = [...row.querySelectorAll<HTMLButtonElement>("button")].filter((button) => !button.disabled);
  for (const action of ACTIONS) {
    const found = buttons.find((button) => button.textContent?.trim().startsWith(action));
    if (found) return found;
  }
  return null;
}

/**
 * Em todas as telas: clicar em qualquer ponto de uma linha (ou cartão) abre a edição,
 * acionando o botão "Editar" da própria linha. Orçamentos e Logística têm regra própria.
 * Nenhuma tela original é alterada.
 */
export function RowClickToEdit() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(INTERACTIVE)) return;
      if (target.closest("main.page-quotes, main.page-loads tbody")) return;
      const row = target.closest(ROW);
      if (!row || !row.closest("main.page, dialog")) return;
      if (window.getSelection()?.toString()) return;
      editButtonOf(row)?.click();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
