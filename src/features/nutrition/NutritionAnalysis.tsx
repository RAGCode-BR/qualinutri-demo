import { useState } from "react";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { priceScenarios, nutrientScenarios } from "../../demo/nutrition/analysis";
import type { Recipe } from "../../demo/nutrition/model";
import type { DietOptimization, NutritionFeed } from "../../demo/nutrition/types";
import { evaluateRecipe } from "./RecipeEditor";
import { NUTRIENTS } from "../../demo/nutrition/types";

type Scenario = { label: string; result: DietOptimization };
const money = (value: number) => !Number.isFinite(value) ? "Preço pendente" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NutritionAnalysis({ recipe, feeds, saved, onUse }: {
  recipe: Recipe; feeds: NutritionFeed[]; saved: Recipe[]; onUse: (recipe: Recipe) => void;
}) {
  const [mode, setMode] = useState("price");
  const [feed, setFeed] = useState(recipe.ingredients[0]?.feedId ?? "");
  const [nutrient, setNutrient] = useState("crudeProtein");
  const [values, setValues] = useState("-20; -10; 0; 10; 20");
  const [results, setResults] = useState<Scenario[]>([]);
  const [error, setError] = useState("");
  function run() {
    setError("");
    try {
      const raw = values.split(";").map((item) => item.trim());
      const inputs = raw.map((item) => /^[+-]?\d+(?:[.,]\d+)?$/.test(item) ? Number(item.replace(",", ".")) : Number.NaN);
      if (!inputs.length || inputs.length > 20 || inputs.some((value) => !Number.isFinite(value))) throw new Error("Informe até 20 valores separados por ponto e vírgula.");
      setResults(mode === "price"
        ? priceScenarios(recipe, feeds, feed, inputs).map((row) => ({ label: `${row.changePercent}% no preço · ${money(row.pricePerKgNatural)}/kg natural`, result: row.result }))
        : nutrientScenarios(recipe, feeds, nutrient, inputs).map((row) => ({ label: `Mínimo ${row.minimum}`, result: row.result })));
    } catch (reason) {
      setResults([]);
      setError(reason instanceof Error ? reason.message : "Confira os valores.");
    }
  }
  return <div className="nutrition-stack">
    <Panel title="Cenários de menor custo" description="Cada linha resolve novamente a fórmula com o valor informado.">
      <div className="form-grid">
        <label className="field nutrition-field">Variável
          <select value={mode} onChange={(event) => { setMode(event.target.value); setValues(event.target.value === "price" ? "-20; -10; 0; 10; 20" : "16; 18; 20; 22"); setResults([]); }}>
            <option value="price">Preço do alimento</option><option value="nutrient">Mínimo nutricional</option>
          </select>
        </label>
        {mode === "price"
          ? <label className="field nutrition-field">Alimento para cenário<select value={feed} onChange={(event) => setFeed(event.target.value)}>
            <option value="">Selecione</option>{recipe.ingredients.map((item) => <option value={item.feedId} key={item.feedId}>{feeds.find((entry) => entry.id === item.feedId)?.name}</option>)}
          </select></label>
          : <label className="field nutrition-field">Nutriente para cenário<select value={nutrient} onChange={(event) => setNutrient(event.target.value)}>
            {NUTRIENTS.map((entry) => <option value={entry.key} key={entry.key}>{entry.label} · {entry.unit}</option>)}
          </select></label>}
        <label className="field nutrition-field">{mode === "price" ? "Variações no preço (%)" : "Valores mínimos"}
          <input value={values} onChange={(event) => setValues(event.target.value)} />
        </label>
      </div>
      <button type="button" className="primary-button" onClick={run}>Calcular cenários</button>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {!!results.length && <ScrollableTable><table className="data-table"><thead><tr><th>Cenário</th><th>Custo/t natural</th><th>Custo/cabeça/dia</th><th>Resultado</th></tr></thead>
        <tbody>{results.map((row, index) => <tr key={index}><td>{row.label}</td>
          {row.result.status === "optimal" ? <><td>{money(row.result.calculation.costPerTonNatural)}</td><td>{money(row.result.calculation.costPerHeadDay)}</td><td>{row.result.diet.ingredients.filter((item) => item.percentage > .001).map((item) => `${feeds.find((entry) => entry.id === item.feedId)?.name} ${item.percentage.toFixed(2)}%`).join(" · ")}</td></>
            : <td colSpan={3}>{row.result.message}</td>}</tr>)}</tbody></table></ScrollableTable>}
    </Panel>
    <Panel title="Versões salvas">
      <p>Duplique uma formulação para manter a composição anterior e comparar seus custos e restrições.</p>
      <ScrollableTable><table className="data-table"><thead><tr><th>Versão</th><th>Custo/t natural</th><th>Custo/cab./dia</th><th>Restrições</th></tr></thead><tbody>
        {saved.map((entry) => {
          const evaluation = evaluateRecipe(entry, feeds);
          return <tr key={entry.id}><td>{entry.name}</td><td>{evaluation.result ? money(evaluation.result.costPerTonNatural) : "Revisar composição"}</td>
            <td>{evaluation.result ? money(evaluation.result.costPerHeadDay) : "—"}</td><td>{evaluation.result?.compliant ? "Atende" : evaluation.error || "Revisar limites"}</td></tr>;
        })}
      </tbody></table></ScrollableTable>
      <ul className="nutrition-saved">{saved.map((entry) => <li key={entry.id}>
        <span><strong>{entry.name}</strong><small>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString("pt-BR") : "Exemplo inicial"}</small></span>
        <button type="button" className="secondary-button" onClick={() => onUse(structuredClone(entry))}>Abrir formulação</button>
      </li>)}</ul>
    </Panel>
  </div>;
}
