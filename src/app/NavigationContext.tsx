import { createContext, useContext } from "react";
import type { TabId } from "../layouts/AppSidebar";

/** Navegação entre telas para componentes novos (painel, gavetas, busca). */
export const NavigationContext = createContext<(tab: TabId) => void>(() => {});

export function useNavigate() {
  return useContext(NavigationContext);
}
