import { useCommercialData } from "../app/CommercialDataProvider";

/** Identifica os valores fictícios da demonstração. */
export function DataSourceStatus() {
  const { loading, message, source } = useCommercialData();
  if (loading || source !== "local") return null;

  return (
    <div className="data-source-status is-local" role="status" aria-live="polite" title={message}>
      <span className="status-dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
