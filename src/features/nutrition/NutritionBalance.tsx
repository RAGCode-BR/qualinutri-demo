import { NUTRIENTS, type DietCalculation } from "../../demo/nutrition/types";

const format = (value: number | undefined) => value === undefined ? "—" : Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "Análise ausente";

export function NutritionStatus({ result }: { result: DietCalculation }) {
  return <p className={result.compliant ? "form-message" : "warning-message"}>
    {result.compliant ? "Atende aos limites informados." : "Em revisão · há limites de inclusão ou nutrientes não atendidos."}
  </p>;
}

/** Inclui análises ausentes: omitir a linha esconderia a restrição não atendida. */
export function NutritionBalance({ result }: { result: DietCalculation }) {
  const keys = [...new Set([...Object.keys(result.nutrients), ...result.incompleteNutrients,
    ...result.constraints.filter((entry) => entry.kind === "nutrient").map((entry) => entry.key)])];
  return <table className="data-table"><thead><tr><th>Nutriente na MS</th><th>Resultado</th><th>Mínimo</th><th>Máximo</th><th>Conferência</th></tr></thead>
    <tbody>{keys.map((key) => {
      const def = NUTRIENTS.find((entry) => entry.key === key);
      const value = result.nutrients[key];
      const bound = result.constraints.find((entry) => entry.kind === "nutrient" && entry.key === key);
      return <tr key={key}><td>{def?.label ?? key} · {def?.unit ?? "Unidade cadastrada"}</td>
        <td>{value === undefined ? "Análise ausente" : format(value)}</td><td>{format(bound?.min)}</td><td>{format(bound?.max)}</td>
        <td>{!Number.isFinite(value) ? "Análise incompleta" : bound ? bound.satisfied ? "Atende" : "Fora do limite" : "Sem limite"}</td></tr>;
    })}</tbody></table>;
}

export function NutritionInclusionChecks({ result }: { result: DietCalculation }) {
  const rows = result.constraints.filter((entry) => entry.kind === "ingredient");
  if (!rows.length) return null;
  return <table className="data-table"><thead><tr><th>Limites de inclusão</th><th>Inclusão (%)</th><th>Mínimo (%)</th><th>Máximo (%)</th><th>Conferência</th></tr></thead>
    <tbody>{rows.map((entry) => <tr key={entry.key}>
      <td>{result.ingredients.find((item) => item.feedId === entry.key)?.name ?? entry.key}</td>
      <td>{format(entry.value)}</td><td>{format(entry.min)}</td><td>{format(entry.max)}</td><td>{entry.satisfied ? "Atende" : "Fora do limite"}</td>
    </tr>)}</tbody></table>;
}
