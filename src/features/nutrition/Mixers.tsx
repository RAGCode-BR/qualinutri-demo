import { useEffect, useState } from "react";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { applyMixerWeights, calculateMixerPlan, mixerSettings, type MixerPlan, type MixerSettings, type MixerStage } from "../../demo/nutrition/mixers";
import type { Recipe, SourceNutrient } from "../../demo/nutrition/model";
import { NutritionBalance, NutritionStatus } from "./NutritionBalance";
import { calculateDiet } from "../../demo/nutrition/calculations";
import type { DietCalculation, NutritionFeed } from "../../demo/nutrition/types";

const formatKg = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} kg`;
const parseWeight = (value: string) => /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : Number.NaN;

function WeightInput({ label, value, optional = false, minimum = 0, onChange, onValidity }: {
  label: string; value: number | undefined; optional?: boolean; minimum?: number; onChange: (next: number | undefined) => void; onValidity: (valid: boolean) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  useEffect(() => { setText(value === undefined ? "" : String(value)); setError(""); }, [value]);
  function commit() {
    if (optional && !text.trim()) { setError(""); onChange(undefined); return; }
    const next = parseWeight(text);
    if (!Number.isFinite(next) || next < minimum) { setError("Informe um peso válido em kg."); return; }
    setError("");
    onChange(next);
  }
  return <label className="field">{label}
    <input type="text" inputMode="decimal" aria-invalid={Boolean(error) || undefined} value={text}
      placeholder={optional ? "Usar peso nominal" : "0"} onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const valid = (optional && !next.trim()) || (Number.isFinite(parseWeight(next)) && parseWeight(next) >= minimum);
        onValidity(valid);
      }}
      onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
    {error && <small className="field-error" role="alert">{error}</small>}
  </label>;
}

export function Mixers({ recipe, feeds, definitions, onChange }: { recipe: Recipe; feeds: NutritionFeed[]; definitions: SourceNutrient[]; onChange: (next: Recipe) => void }) {
  const [message, setMessage] = useState("");
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const invalidInput = Object.values(invalidFields).some(Boolean);
  const settings = mixerSettings(recipe);
  let plan: MixerPlan | null = null;
  let before: DietCalculation | undefined;
  let preview: DietCalculation | undefined;
  let problem = "";
  try {
    plan = calculateMixerPlan(recipe, feeds);
    before = calculateDiet(recipe, feeds);
    if (!invalidInput && !plan.warnings.length && plan.ingredients.some((row) => Math.abs(row.nominalKg - row.actualKg) > 0.000001)) {
      preview = calculateDiet(applyMixerWeights(recipe, feeds), feeds);
    }
  }
  catch (reason) { problem = reason instanceof Error ? reason.message : "Confira os dados da fórmula."; }

  function validity(key: string, valid: boolean) {
    setInvalidFields((current) => ({ ...current, [key]: !valid }));
  }
  function update(next: MixerSettings) {
    setMessage("");
    onChange({ ...recipe, mixer: next });
  }
  function changeStage(feedId: string, stage: MixerStage) {
    update({ ...settings, assignment: { ...settings.assignment, [feedId]: stage } });
  }
  function changeOverride(feedId: string, next: number | undefined) {
    const overrides = { ...settings.overrides };
    if (next === undefined) delete overrides[feedId];
    else overrides[feedId] = next;
    update({ ...settings, overrides });
  }
  function apply() {
    if (invalidInput) return;
    try {
      onChange(applyMixerWeights(recipe, feeds));
      setMessage(recipe.basis === "dry" && !recipe.factoryBatch
        ? "Pesagens aplicadas em matéria natural. Os limites de inclusão em matéria seca foram limpos. Confira os novos limites e o balanço nutricional."
        : "Pesagens aplicadas. Confira o balanço da fórmula atualizada.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Não foi possível aplicar as pesagens."); }
  }

  return <Panel title="Misturadores" description="A mistura do 3 entra no 2, e a mistura do 2 entra no 1. As capacidades limitam o peso de uma batida.">
    <div className="form-grid nutrition-mixer-capacities">
      {([1, 2, 3] as const).map((stage) => <WeightInput key={stage} label={`Capacidade do misturador ${stage} (kg)`} value={settings.capacityKg[stage - 1]} onValidity={(valid) => validity(`capacity-${stage}`, valid)}
        onChange={(value) => {
          const capacityKg: [number, number, number] = [...settings.capacityKg];
          capacityKg[stage - 1] = value ?? 0;
          update({ ...settings, capacityKg });
        }} />)}
    </div>
    <WeightInput label="Peso da batida (kg naturais)" minimum={0.001} value={recipe.batchKg} onValidity={(valid) => validity("batch", valid)}
      onChange={(value) => { if (value && value > 0 && value !== recipe.batchKg) onChange({ ...recipe, batchKg: value, mixer: { ...settings, overrides: {} } }); }} />
    {problem && <p role="alert" className="warning-message">{problem}</p>}
    {plan && <>
      <h3>Distribuição e pesagem dos ingredientes</h3>
      <p className="field-hint">O peso nominal segue a quantidade do lote e as proporções da fórmula. Deixe o ajuste em branco para usar o nominal. Confirme cada valor saindo do campo.</p>
      <ScrollableTable><table className="data-table">
        <thead><tr><th>Ingrediente</th><th>Misturador</th><th>Peso nominal</th><th>Ajuste da pesagem</th><th>Peso utilizado</th></tr></thead>
        <tbody>{plan.ingredients.map((row) => <tr key={row.feedId}>
          <td>{row.name}</td>
          <td><label className="field"><span className="sr-only">Misturador de {row.name}</span>
            <select value={row.stage} onChange={(event) => changeStage(row.feedId, Number(event.target.value) as MixerStage)}>
              {[1, 2, 3].map((stage) => <option key={stage} value={stage}>Misturador {stage}</option>)}
            </select></label></td>
          <td>{formatKg(row.nominalKg)}</td>
          <td><WeightInput label={`Pesagem de ${row.name} (kg)`} value={settings.overrides[row.feedId]} optional onValidity={(valid) => validity(row.feedId, valid)} onChange={(value) => changeOverride(row.feedId, value)} /></td>
          <td>{formatKg(row.actualKg)}</td>
        </tr>)}</tbody>
      </table></ScrollableTable>
      {plan.stages.filter((stage) => stage.rows.length > 0).map((stage) => <section className="nutrition-mixer-stage" key={stage.stage}>
        <h3>Misturador {stage.stage} · {formatKg(stage.actualKg)} de {formatKg(stage.capacityKg)}</h3>
        <ScrollableTable><table className="data-table">
          <thead><tr><th>Ordem de carregamento</th><th>Adicionar</th><th>Peso acumulado</th></tr></thead>
          <tbody>{stage.rows.map((row, index) => <tr key={row.key}>
            <td>{index + 1}. {row.name}</td><td>{formatKg(row.actualKg)}</td><td>{formatKg(row.accumulatedKg)}</td>
          </tr>)}</tbody>
        </table></ScrollableTable>
      </section>)}
      {plan.warnings.map((warning) => <p key={warning} className="warning-message" role="alert">{warning}</p>)}
      <p>Peso final da batida: <strong>{formatKg(plan.totalKg)}</strong></p>
      {preview && before && <section>
        <h3>Conferência da batida ajustada</h3>
        <p>Matéria seca: {before.dryMatterPct.toFixed(2)}% → {preview.dryMatterPct.toFixed(2)}%. Custo por tonelada natural: {before.costPerTonNatural.toLocaleString("pt-BR")} → {preview.costPerTonNatural.toLocaleString("pt-BR")}.</p>
        <NutritionStatus result={preview} />
        <ScrollableTable><NutritionBalance result={preview} definitions={definitions} baseline={before} /></ScrollableTable>
      </section>}
      {recipe.basis === "dry" && !recipe.factoryBatch && <p className="warning-message">Ao aplicar as pesagens, a fórmula passa para matéria natural e os limites de inclusão em matéria seca são limpos para revisão.</p>}
      <button type="button" className="primary-button" disabled={invalidInput || plan.warnings.length > 0} onClick={apply}>Aplicar pesagens à fórmula</button>
      <p className="field-hint">A fórmula só incorpora os pesos ajustados ao aplicar as pesagens. Seus limites nutricionais devem ser conferidos após a atualização.</p>
    </>}
    {invalidInput && <p className="warning-message">Corrija as pesagens e capacidades inválidas antes de aplicar.</p>}
    {message && <p role="status">{message}</p>}
  </Panel>;
}
