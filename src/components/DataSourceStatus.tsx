import { useCommercialData } from "../app/CommercialDataProvider";

/** Aparece quando não é possível confirmar que o catálogo está atualizado. */
export function DataSourceStatus() {
  const { loading, message, reload, source } = useCommercialData();
  if (loading || source !== "local") return null;

  return (
    <div className="data-source-status is-local" role="status" aria-live="polite" title={message}>
      <span className="status-dot" aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={reload}>Tentar novamente</button>
    </div>
  );
}
