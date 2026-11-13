import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { emptyCommercialData } from "../../data/emptyCommercialData";
import { loadCommercialData } from "../services/commercialDataService";
import { db } from "../store/db";
import type { CommercialData } from "../../types/commercial";

type CommercialDataContextValue = {
  data: CommercialData;
  source: "local" | "supabase";
  loading: boolean;
  message: string;
  reload: () => void;
};

const CommercialDataContext = createContext<CommercialDataContextValue | null>(null);

/**
 * Versão da demonstração do provedor original: o catálogo vem do banco local
 * e é recarregado sempre que uma tela altera produtos, descontos ou frete.
 * "supabase" aqui significa "catálogo confirmado", liberando salvar orçamentos.
 */
export function CommercialDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CommercialData>(emptyCommercialData);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => db.subscribe(() => setVersion((current) => current + 1)), []);

  useEffect(() => {
    let active = true;
    loadCommercialData()
      .then((next) => {
        if (active) setData((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  const value = useMemo<CommercialDataContextValue>(() => ({
    data,
    source: "supabase",
    loading,
    message: "Dados de demonstração",
    reload: () => setVersion((current) => current + 1),
  }), [data, loading]);

  return <CommercialDataContext.Provider value={value}>{children}</CommercialDataContext.Provider>;
}

export function useCommercialData() {
  const value = useContext(CommercialDataContext);
  if (!value) throw new Error("useCommercialData deve ser usado dentro de CommercialDataProvider.");
  return value;
}
