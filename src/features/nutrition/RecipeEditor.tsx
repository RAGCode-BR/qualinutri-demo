import { useEffect, useRef, useState } from "react";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { calculateDiet, recipeFeeds } from "../../demo/nutrition/calculations";
import type { Recipe, SourceNutrient } from "../../demo/nutrition/model";
import { NUTRIENTS, type DietCalculation, type DietOptimization, type NutritionFeed } from "../../demo/nutrition/types";
import { NumericField } from "./NumericField";
import { NutritionBalance, NutritionInclusionChecks, NutritionStatus } from "./NutritionBalance";

const basisLabels = { natural: "Matéria natural", dry: "Matéria seca" };
const format = (value: number) => Number.isFinite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "Sem análise";
const money = (value: number) => !Number.isFinite(value) ? "Preço pendente" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function evaluateRecipe(recipe: Recipe, feeds: NutritionFeed[]): { result: DietCalculation | null; error: string } {
  try { return { result: calculateDiet(recipe, feeds), error: "" }; }
  catch (reason) { return { result: null, error: reason instanceof Error ? reason.message : "Confira os dados." }; }
}

export function RecipeEditor({ recipe, feeds, definitions, customers, onChange, onNotice }: {
  recipe: Recipe; feeds: NutritionFeed[]; definitions: SourceNutrient[]; customers: { id: string; name: string }[];
  onChange: (recipe: Recipe) => void; onNotice: (message: string, error?: boolean) => void;
}) {
  const [feedId, setFeedId] = useState("");
  const [editFeed, setEditFeed] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => { setBusy(false); setEditFeed(""); setFeedId(""); setSearch(""); return () => { worker.current?.terminate(); worker.current = null; }; }, [recipe.id]);
  const { result, error } = evaluateRecipe(recipe, feeds);
  const sum = recipe.ingredients.reduce((total, item) => total + item.percentage, 0);
  const selected = new Set(recipe.ingredients.map((item) => item.feedId));
  const effective = recipeFeeds(recipe, feeds);
  const inRecipe = effective.filter((feed) => selected.has(feed.id));
  const available = feeds.filter((feed) => !selected.has(feed.id) && feed.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  const edited = inRecipe.find((feed) => feed.id === editFeed);
  const nutrientKeys = [...new Set([...NUTRIENTS.map((nutrient) => nutrient.key), ...inRecipe.flatMap((feed) => Object.keys(feed.nutrients)), ...recipe.nutrientBounds.map((bound) => bound.nutrient)])];
  const label = (key: string) => {
    const nutrient = NUTRIENTS.find((entry) => entry.key === key);
    const source = definitions.find((entry) => entry.id === key);
    return nutrient ? `${nutrient.label} (${nutrient.unit})` : source ? `${source.name} (${source.unit})` : key;

  };
  function update(change: Partial<Recipe>) { onChange({ ...recipe, ...change }); }

  function editAnalysis(feed: NutritionFeed, change: Partial<NonNullable<Recipe["ingredients"][number]["analysis"]>>) {
    const { dryMatterPct, nutrients, pricePerKgNatural, pricePending } = feed;
    update({ ingredients: recipe.ingredients.map((item) => item.feedId === feed.id
      ? { ...item, analysis: { dryMatterPct, nutrients, pricePerKgNatural, pricePending, ...change } } : item) });
  }

  function changeBasis(basis: Recipe["basis"]) {
    if (basis === recipe.basis) return;
    if (!recipe.ingredients.length) return update({ basis });
    if (!result) return onNotice("Feche a composição em 100% antes de converter a base.", true);
    update({ basis, ingredients: recipe.ingredients.map((item, index) => ({
      feedId: item.feedId, ...(item.analysis ? { analysis: item.analysis } : {}), percentage: result.ingredients[index][basis === "natural" ? "naturalPct" : "dryPct"],
    })) });
    onNotice("Base convertida. Reconfigure os limites de inclusão para a nova base.");
  }

  function optimize() {
    if (busy) return;
    setBusy(true);
    const active = new Worker(new URL("../../demo/nutrition/optimizer.worker.ts", import.meta.url), { type: "module" });
    worker.current = active;
    const finish = () => { active.terminate(); worker.current = null; setBusy(false); };
    active.onmessage = (event: MessageEvent<{ result?: DietOptimization; error?: string }>) => {
      const response = event.data;
      if (response.error) onNotice(response.error, true);
      else if (response.result?.status === "infeasible") onNotice(response.result.message, true);
      else if (response.result?.status === "optimal") {
        onChange({ ...recipe, ingredients: response.result.diet.ingredients });
        onNotice(`Composição de menor custo por kg de ${recipe.costBasis === "natural" ? "matéria natural" : "matéria seca"} encontrada para as restrições informadas.`);
      }
      finish();
    };
    active.onerror = () => { onNotice("O cálculo foi interrompido. Revise as restrições e tente novamente.", true); finish(); };
    active.postMessage({ recipe, feeds });
  }

  return (
    <div className="nutrition-stack">
      <Panel title="Dados da formulação">
        <fieldset className="nutrition-edit-fields" disabled={busy}>
          <div className="form-grid">
            <label className="field nutrition-field">Nome<input value={recipe.name} maxLength={160} onChange={(event) => update({ name: event.target.value })} /></label>
            <label className="field nutrition-field">Tipo
              <select value={recipe.kind} onChange={(event) => {
                const kind = event.target.value as Recipe["kind"];
                update({ kind, factoryBatch: kind === "concentrado", dryMatterIntakeKg: kind === "concentrado" ? 0 : recipe.dryMatterIntakeKg || 10, costBasis: kind === "concentrado" ? "natural" : "dry",
                  animal: { ...recipe.animal, category: kind === "corte" ? "corte" : kind === "leite" ? "leite" : "outro" },
                  economics: kind === "leite"
                    ? { ...recipe.economics, gainKgDay: undefined, gainPricePerKg: undefined }
                    : { ...recipe.economics, milkKgDay: undefined, milkPricePerKg: undefined },
                });
              }}>
                <option value="usuario">Exigências informadas</option><option value="corte">Bovinos de corte</option>
                <option value="leite">Bovinos de leite</option><option value="concentrado">Concentrado e suplemento</option>
              </select>
            </label>
            <label className="field nutrition-field">Base das inclusões
              <select value={recipe.basis} onChange={(event) => changeBasis(event.target.value as Recipe["basis"])}>
                <option value="natural">Matéria natural</option><option value="dry">Matéria seca</option>
              </select>
            </label>
            <label className="field nutrition-field">Objetivo de menor custo
              <select value={recipe.costBasis ?? "dry"} onChange={(event) => update({ costBasis: event.target.value as "natural" | "dry" })}>
                <option value="natural">Por kg de matéria natural</option><option value="dry">Por kg de matéria seca</option>
              </select>
            </label>
            <label className="field nutrition-field">Cliente
              <select value={recipe.customerId ?? ""} onChange={(event) => update({ customerId: event.target.value })}>
                <option value="">Sem vínculo</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label className="field nutrition-field">Lote de animais<input value={recipe.lot ?? ""} onChange={(event) => update({ lot: event.target.value })} /></label>
            <NumericField label="Peso do lote de mistura (kg naturais)" value={recipe.batchKg} onChange={(value) => update({ batchKg: value! })} />
            {!recipe.factoryBatch && <><NumericField label="Consumo informado (kg MS/cabeça/dia)" value={recipe.dryMatterIntakeKg} onChange={(value) => update({ dryMatterIntakeKg: value! })} />
            <NumericField label="Animais" value={recipe.heads} onChange={(value) => update({ heads: value! })} />
            <NumericField label="Dias de alimentação" value={recipe.days} onChange={(value) => update({ days: value! })} /></>}
          </div>
          {recipe.kind === "concentrado" && <div className="form-grid">
            <label className="field nutrition-field">Indicação<textarea value={recipe.indication ?? ""} rows={2} onChange={(event) => update({ indication: event.target.value })} /></label>
            <label className="field nutrition-field">Modo de uso<textarea value={recipe.directions ?? ""} rows={2} onChange={(event) => update({ directions: event.target.value })} /></label>
          </div>}
          <label className="field nutrition-field">Observações<textarea value={recipe.notes ?? ""} rows={2} onChange={(event) => update({ notes: event.target.value })} /></label>
        </fieldset>
      </Panel>
      <Panel title="Ingredientes" description={`Inclusões e limites em ${basisLabels[recipe.basis].toLowerCase()}.`}>
        <fieldset className="nutrition-edit-fields" disabled={busy}>
          <div className="nutrition-actions">
            <input type="search" aria-label="Buscar alimento" placeholder="Buscar alimento" value={search} onChange={(event) => { setSearch(event.target.value); setFeedId(""); }} />
            <select aria-label="Adicionar alimento" value={feedId} onChange={(event) => setFeedId(event.target.value)}>
              <option value="">Escolha um alimento</option>{available.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}
            </select>
            <button type="button" className="secondary-button" disabled={!available.some((feed) => feed.id === feedId)} onClick={() => {
              update({ ingredients: [...recipe.ingredients, { feedId, percentage: 0, minPct: 0, maxPct: 100 }] }); setFeedId("");
            }}>Adicionar alimento</button>
            <button type="button" className="secondary-button" disabled={!Number.isFinite(sum) || sum <= 0} onClick={() => update({
              ingredients: recipe.ingredients.map((item) => ({ ...item, percentage: item.percentage / sum * 100 })),
            })}>Normalizar para 100%</button>
          </div>
          <ScrollableTable>
            <table className="data-table nutrition-table"><thead><tr><th>Alimento</th><th>Inclusão (%)</th><th>Mínimo (%)</th><th>Máximo (%)</th><th /></tr></thead>
              <tbody>{recipe.ingredients.map((item, index) => {
                const feed = effective.find((entry) => entry.id === item.feedId);
                const set = (key: "percentage" | "minPct" | "maxPct", value: number | undefined) => update({
                  ingredients: recipe.ingredients.map((entry, i) => i === index ? { ...entry, [key]: value } : entry),
                });
                return <tr key={item.feedId}><td><strong>{feed?.name ?? "Alimento ausente"}</strong><small className="cell-sub">{feed && `${feed.dryMatterPct}% MS · ${feed.pricePending ? "Preço pendente" : money(feed.pricePerKgNatural) + "/kg natural"}`}</small></td>
                  <td><NumericField label={`Inclusão de ${feed?.name}`} value={item.percentage} onChange={(value) => set("percentage", value)} /></td>
                  <td><NumericField label={`Mínimo de ${feed?.name}`} optional value={item.minPct} onChange={(value) => set("minPct", value)} /></td>
                  <td><NumericField label={`Máximo de ${feed?.name}`} optional value={item.maxPct} onChange={(value) => set("maxPct", value)} /></td>
                  <td><button type="button" className="row-button" onClick={() => setEditFeed(editFeed === item.feedId ? "" : item.feedId)}>Ajustar preço e análise</button>
                  <button type="button" className="row-button is-danger" onClick={() => update({ ingredients: recipe.ingredients.filter((_, i) => i !== index) })}>Retirar</button></td>
                </tr>;
              })}</tbody>
            </table>
          </ScrollableTable>
          {edited && <section className="nutrition-stack" aria-label="Análise do ingrediente na formulação">
            <h3>{edited.name} · nesta fórmula</h3>
            <p className="field-hint">Os ajustes ficam nesta fórmula. As análises são informadas na matéria seca.</p>
            <div className="form-grid">
              <NumericField label="Preço do ingrediente (R$/t natural)" optional value={edited.pricePending ? undefined : edited.pricePerKgNatural * 1000}
                onChange={(value) => editAnalysis(edited, { pricePerKgNatural: value === undefined ? 0 : value / 1000, pricePending: value === undefined })} />
              <NumericField label="Matéria seca do ingrediente (%)" value={edited.dryMatterPct} onChange={(value) => editAnalysis(edited, { dryMatterPct: value! })} />
              {[...new Set([...NUTRIENTS.map((entry) => entry.key), ...Object.keys(edited.nutrients), ...recipe.nutrientBounds.map((bound) => bound.nutrient)])].map((key) =>
                <NumericField key={key} label={label(key)} optional value={edited.nutrients[key]} onChange={(value) => {
                  const nutrients = { ...edited.nutrients };
                  if (value === undefined) delete nutrients[key];
                  else nutrients[key] = value;
                  editAnalysis(edited, { nutrients });
                }} />
              )}
            </div>
            <div className="nutrition-actions">
              <button type="button" className="secondary-button" onClick={() => setEditFeed("")}>Voltar para ingredientes</button>
              <button type="button" className="row-button" onClick={() => update({ ingredients: recipe.ingredients.map((item) => item.feedId === edited.id
                ? { ...item, analysis: undefined } : item) })}>Usar análise e preço da biblioteca</button>
            </div>
          </section>}
          <p className={Math.abs(sum - 100) > .00001 ? "warning-message" : "form-message"}>Soma das inclusões · {format(sum)}%</p>
        </fieldset>
      </Panel>
      <Panel title="Limites de nutrientes" description="Defina o mínimo e o máximo e escolha a base de cada meta.">
        <fieldset className="nutrition-edit-fields" disabled={busy}>
          {recipe.nutrientBounds.map((bound, index) => (
            <div className="nutrition-bound" key={index}>
              <label className="field nutrition-field">Nutriente<select value={bound.nutrient} onChange={(event) => update({
                nutrientBounds: recipe.nutrientBounds.map((entry, i) => i === index ? { ...entry, nutrient: event.target.value } : entry),
              })}>{nutrientKeys.filter((key) => key === bound.nutrient || !recipe.nutrientBounds.some((entry) => entry.nutrient === key))
                .map((key) => <option key={key} value={key}>{label(key)}</option>)}</select></label>
              <label className="field nutrition-field">Base da meta<select value={bound.basis ?? "dry"} onChange={(event) => update({
                nutrientBounds: recipe.nutrientBounds.map((entry, i) => i === index
                  ? { ...entry, basis: event.target.value as "natural" | "dry", min: undefined, max: undefined } : entry),
              })}><option value="dry">Matéria seca</option><option value="natural">Matéria natural</option></select></label>
              {(["min", "max"] as const).map((side) => <NumericField key={side} label={side === "min" ? "Mínimo" : "Máximo"} optional
                value={bound[side]} onChange={(value) => update({ nutrientBounds: recipe.nutrientBounds.map((entry, i) => i === index ? { ...entry, [side]: value } : entry) })} />)}
              <button type="button" className="row-button" onClick={() => update({ nutrientBounds: recipe.nutrientBounds.filter((_, i) => i !== index) })}>Retirar limite</button>
            </div>
          ))}
          <button type="button" className="secondary-button" disabled={recipe.nutrientBounds.length >= nutrientKeys.length} onClick={() => {
            const nutrient = nutrientKeys.find((key) => !recipe.nutrientBounds.some((entry) => entry.nutrient === key));
            if (nutrient) update({ nutrientBounds: [...recipe.nutrientBounds, { nutrient }] });
          }}>Adicionar limite</button>
        </fieldset>
        <div className="nutrition-actions">
          <button type="button" className="primary-button" disabled={busy || !recipe.ingredients.length} onClick={optimize}>{busy ? "Otimizando…" : "Otimizar menor custo"}</button>
          {busy && <button type="button" className="secondary-button" onClick={() => { worker.current?.terminate(); worker.current = null; setBusy(false); }}>Cancelar cálculo</button>}
        </div>
      </Panel>
      <Panel title="Avaliação da dieta">
        {error && <p role="status" className="warning-message">{error}</p>}
        {recipe.rlmReference && <p className="field-hint">
          Referência salva no RLM · {recipe.rlmReference.fileName}
          {recipe.rlmReference.costPerTonNatural !== undefined && ` · ${money(recipe.rlmReference.costPerTonNatural)}/t natural`}
          {recipe.rlmReference.dryMatterPct !== undefined && ` · ${format(recipe.rlmReference.dryMatterPct)}% MS`}
          {result && Number.isFinite(result.costPerTonNatural) && recipe.rlmReference.costPerTonNatural !== undefined
            && ` · Diferença de custo: ${money(result.costPerTonNatural - recipe.rlmReference.costPerTonNatural)}/t natural`}
        </p>}
        {result && <DietResults result={result} factory={recipe.factoryBatch} definitions={definitions} />}
      </Panel>
      {!recipe.factoryBatch && <Panel title="Animal e análise econômica" description="Ganho e produção são valores informados. Os custos são calculados com o consumo e a composição da dieta.">
        {(recipe.kind === "corte" || recipe.kind === "leite") && <p className="field-hint">As exigências, o consumo e o desempenho devem ser informados pelo nutricionista. Selecionar o tipo de animal não calcula automaticamente as exigências dos modelos do RLM.</p>}
        <fieldset className="nutrition-edit-fields" disabled={busy}>
          <div className="form-grid">
            <NumericField label="Peso corporal informado (kg)" optional value={recipe.animal?.bodyWeightKg} onChange={(value) => update({ animal: { ...recipe.animal, category: recipe.kind === "corte" ? "corte" : recipe.kind === "leite" ? "leite" : "outro", bodyWeightKg: value } })} />
            <NumericField label="Outros custos (R$/cabeça/dia)" value={recipe.economics?.otherCostPerHeadDay ?? 0} onChange={(value) => update({ economics: { ...recipe.economics, otherCostPerHeadDay: value } })} />
            {recipe.kind === "leite" ? <>
              <NumericField label="Leite informado (kg/cabeça/dia)" optional value={recipe.economics?.milkKgDay} onChange={(value) => update({ economics: { ...recipe.economics, milkKgDay: value } })} />
              <NumericField label="Preço do leite (R$/kg)" optional value={recipe.economics?.milkPricePerKg} onChange={(value) => update({ economics: { ...recipe.economics, milkPricePerKg: value } })} />
            </> : <>
              <NumericField label="Ganho informado (kg/cabeça/dia)" optional value={recipe.economics?.gainKgDay} onChange={(value) => update({ economics: { ...recipe.economics, gainKgDay: value } })} />
              <NumericField label="Receita por kg de ganho (R$)" optional value={recipe.economics?.gainPricePerKg} onChange={(value) => update({ economics: { ...recipe.economics, gainPricePerKg: value } })} />
            </>}
          </div>
        </fieldset>
      </Panel>}
    </div>
  );
}

export function DietResults({ result, factory, definitions }: { result: DietCalculation; factory?: boolean; definitions?: SourceNutrient[] }) {
  return <>
    <NutritionStatus result={result} />
    <div className="nutrition-summary">
      <div><span>Custo por t natural</span><strong>{money(result.costPerTonNatural)}</strong></div>
      <div><span>Matéria seca da mistura</span><strong>{format(result.dryMatterPct)}%</strong></div>
      {factory ? <div><span>Custo por batida</span><strong>{money(result.batchCost)}</strong></div> : <><div><span>Custo alimentar / cabeça / dia</span><strong>{money(result.costPerHeadDay)}</strong></div>
      <div><span>Alimentação no período · lote</span><strong>{money(result.totalCost)}</strong></div></>}
    </div>
    <ScrollableTable><table className="data-table"><thead><tr><th>Ingrediente</th><th>% natural</th><th>% MS</th><th>kg/batida</th>{!factory && <><th>kg natural/cab./dia</th><th>kg para o período</th></>}</tr></thead>
      <tbody>{result.ingredients.map((item) => <tr key={item.feedId}><td>{item.name}</td><td>{format(item.naturalPct)}</td><td>{format(item.dryPct)}</td><td>{format(item.batchKg)}</td>{!factory && <><td>{format(item.naturalKgPerHeadDay)}</td><td>{format(item.totalNaturalKg)}</td></>}</tr>)}</tbody></table></ScrollableTable>
    <div className="nutrition-summary">
      <div><span>Custo por t MS</span><strong>{money(result.costPerTonDry)}</strong></div>
      {!factory && <div><span>Consumo natural / cabeça / dia</span><strong>{format(result.naturalKgPerHeadDay)} kg</strong></div>}
      {result.economics && <div><span>Margem após alimentação e outros custos / dia</span><strong>{money(result.economics.grossMarginPerHeadDay)}</strong></div>}
    </div>
    <ScrollableTable><NutritionBalance result={result} definitions={definitions} /></ScrollableTable>
    <ScrollableTable><NutritionInclusionChecks result={result} /></ScrollableTable>
    {result.incompleteNutrients.length > 0 && <p className="field-hint">Nutrientes com análise ausente em algum ingrediente · {result.incompleteNutrients.join(", ")}.</p>}
  </>;
}
