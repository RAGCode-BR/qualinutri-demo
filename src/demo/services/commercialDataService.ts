import type { CommercialData } from "../../types/commercial";
import { clone, db, simulateLatency } from "../store/db";

/** Mesmo formato do serviço real; lê o catálogo do banco local da demonstração. */
export function invalidateCommercialData() {
  // O banco local é sempre a versão vigente: nada a invalidar.
}

export function loadCommercialData(): Promise<CommercialData> {
  return simulateLatency(() => {
    const { catalog } = db.read();
    const { anticipatedPercentage, changeLog: _changeLog, ...data } = clone(catalog);
    return {
      ...data,
      paymentTerms: [
        { id: "anticipated", label: "À vista antecipado", condition: "Pré-pagamento", notes: `Desconto adicional de ${anticipatedPercentage.toLocaleString("pt-BR")}% sobre o preço à vista.` },
        ...data.paymentTerms,
      ],
    };
  });
}
