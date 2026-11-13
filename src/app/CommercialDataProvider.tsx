import { createContext, useContext, type ReactNode } from "react";
import { demoCommercialData } from "../data/demoCommercialData";
import type { CommercialData } from "../types/commercial";

type CommercialDataContextValue = {
  data: CommercialData;
  source: "local" | "supabase";
  loading: boolean;
  message: string;
  reload: () => void;
};

const CommercialDataContext = createContext<CommercialDataContextValue | null>(null);

const demo: CommercialDataContextValue = {
  data: demoCommercialData,
  source: "local",
  loading: false,
  message: "Dados de demonstração",
  reload: () => {},
};

export function CommercialDataProvider({ children }: { children: ReactNode }) {
  return <CommercialDataContext.Provider value={demo}>{children}</CommercialDataContext.Provider>;
}

export function useCommercialData() {
  const value = useContext(CommercialDataContext);
  if (!value) throw new Error("useCommercialData deve ser usado dentro de CommercialDataProvider.");
  return value;
}
