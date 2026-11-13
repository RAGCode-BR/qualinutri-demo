import { Panel } from "../../components/Panel";
import { useCommercialData } from "../../app/CommercialDataProvider";

export function CommercialPolicyPage() {
  const { data: { policySections, policyVersion } } = useCommercialData();
  return (
    <div className="page-columns">
      <div className="policy-sections">
        {policySections.map((section) => (
          <details key={section.title}>
            <summary>
              <span>{section.title}</span>
              {section.pending && <span className="status-badge is-warning">A definir</span>}
            </summary>
            <div className="policy-body">{section.content}</div>
          </details>
        ))}
      </div>
      <Panel title="Política comercial da fábrica" description={`Versão ${policyVersion}`} className="aside-panel">
        <address className="company-card">
          <strong>Qualinutri Ind. Com. de Nutrição Animal Ltda</strong>
          <span>Av. Rio Arinos, 3881 S</span>
          <span>Juara, MT</span>
          <a href="tel:+556635562300">(66) 3556-2300</a>
        </address>
      </Panel>
    </div>
  );
}
