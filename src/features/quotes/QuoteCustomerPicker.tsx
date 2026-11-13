import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { listCustomers, type CustomerSummary } from "../../services/customerService";
import type { CalculatorController } from "../calculator/useCalculator";
import { Select } from "../../components/Select";

/** Escolha do cliente do orçamento, no topo da Calculadora. */
export function QuoteCustomerPicker({ controller }: { controller: CalculatorController }) {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const canSave = profile?.role === "administrador" || profile?.role === "comercial";
  const { customer, setCustomer } = controller;

  useEffect(() => {
    if (!canSave) return;
    listCustomers()
      .then((rows) => { setCustomers(rows); setLoaded(true); })
      .catch(() => setError("Não foi possível carregar os clientes."));
  }, [canSave]);

  if (!canSave) return null;

  // Cliente de um orçamento em edição que foi desativado depois: continua vinculado.
  // Enquanto a lista não chega, o cliente escolhido aparece sem a marca "(inativo)".
  const missingCustomer = customer && !customers.some((option) => option.id === customer.id) ? customer : null;
  const inactiveCustomer = missingCustomer;

  function choose(id: string) {
    const selected = customers.find((option) => option.id === id);
    if (selected) setCustomer({ id: selected.id, name: selected.legal_name, document: selected.document });
    else if (inactiveCustomer && inactiveCustomer.id === id) setCustomer(inactiveCustomer);
    else setCustomer(null);
  }

  return (
    <section className="panel form-section quote-customer-panel" aria-labelledby="quoteCustomerTitle">
      <h2 className="panel-title" id="quoteCustomerTitle">Cliente</h2>
      <div className="field">
        <label htmlFor="quoteCustomer">Cliente do orçamento (opcional)</label>
        <Select
          id="quoteCustomer"
          value={customer?.id ?? ""}
          onChange={choose}
          searchable
          options={[
            { value: "", label: "Sem cliente vinculado" },
            ...(inactiveCustomer ? [{ value: inactiveCustomer.id, label: loaded ? `${inactiveCustomer.name} (inativo)` : inactiveCustomer.name }] : []),
            ...customers.map((option) => ({ value: option.id, label: `${option.legal_name}${option.legacy_code ? ` · ${option.legacy_code}` : ""}` })),
          ]}
        />
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
