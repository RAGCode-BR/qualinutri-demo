import { Printer } from "lucide-react";
import { DocViewer } from "../../components/demo/docs/DocViewer";
import type { Recipe, SourceNutrient } from "../../demo/nutrition/model";
import type { DietCalculation, NutritionFeed } from "../../demo/nutrition/types";
import { calculateMixerPlan } from "../../demo/nutrition/mixers";
import { NutritionBalance, NutritionInclusionChecks, NutritionStatus } from "./NutritionBalance";

const format = (value: number) => Number.isFinite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "Análise ausente";
const money = (value: number) => !Number.isFinite(value) ? "Preço pendente" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function NutritionReport({ recipe, feeds, result, kind, customer, definitions, onDone }: {
  recipe: Recipe; feeds: NutritionFeed[]; result: DietCalculation; kind: string; customer?: string; definitions?: SourceNutrient[]; onDone: () => void;
}) {
  const plan = kind === "operational" ? calculateMixerPlan(recipe, feeds) : null;
  function print() {
    const title = document.title;
    document.title = `Nutrição-${recipe.name}`;
    window.addEventListener("afterprint", () => { document.title = title; }, { once: true });
    window.print();
  }
  return <DocViewer title={`${recipe.name} · ${kind === "operational" ? "Ficha de pesagem" : kind === "client" ? "Plano de alimentação" : "Relatório técnico"}`} subtitle={customer} onClose={onDone}
    actions={<div className="doc-viewer-actions"><button type="button" className="primary-button compact-button" onClick={print}><Printer size={15} aria-hidden="true" />&nbsp;Imprimir</button></div>}>
    <div className="nutrition-report">
    <article className="quote-doc">
      <header><p>Qualinutri · Demonstração</p><h1>{recipe.name}</h1>
        <p>{kind === "operational" ? "Ficha de pesagem" : kind === "client" ? "Plano de alimentação" : "Relatório técnico"} · {new Date().toLocaleDateString("pt-BR")}</p>
      </header>
      <p>{customer} {recipe.lot && `· Lote ${recipe.lot}`}{!recipe.factoryBatch && ` · ${recipe.heads} animais · ${recipe.days} dias`}</p>
      <p>{recipe.notes}</p>
      {recipe.indication && <p>Indicação · {recipe.indication}</p>}
      {recipe.directions && <p>Modo de uso · {recipe.directions}</p>}
      <NutritionStatus result={result} />
      <p>{!recipe.factoryBatch && `Consumo informado · ${format(recipe.dryMatterIntakeKg)} kg MS/cabeça/dia. `}Mistura · {format(result.dryMatterPct)}% MS.</p>
      {plan ? plan.stages.filter((stage) => stage.rows.length > 0).map((stage) => <section key={stage.stage}>
        <h2>Misturador {stage.stage} · capacidade {format(stage.capacityKg)} kg</h2>
        <table><thead><tr><th>Ordem</th><th>Ingrediente</th><th>kg calculados</th><th>kg ajustados</th><th>Acumulado kg</th><th>Conferido</th></tr></thead>
          <tbody>{stage.rows.map((row, index) => <tr key={row.key}><td>{index + 1}</td><td>{row.name}</td><td>{format(row.nominalKg)}</td><td>{format(row.actualKg)}</td><td>{format(row.accumulatedKg)}</td><td>□</td></tr>)}</tbody></table>
      </section>) : <table><thead><tr><th>Alimento</th><th>% natural</th><th>% MS</th><th>kg/batida</th>{!recipe.factoryBatch && <><th>kg natural/cab./dia</th><th>kg no período</th></>}</tr></thead>
        <tbody>{result.ingredients.map((row) => <tr key={row.feedId}><td>{row.name}</td><td>{format(row.naturalPct)}</td><td>{format(row.dryPct)}</td><td>{format(row.batchKg)}</td>{!recipe.factoryBatch && <><td>{format(row.naturalKgPerHeadDay)}</td><td>{format(row.totalNaturalKg)}</td></>}</tr>)}</tbody></table>}
      {kind !== "operational" && <p>Custo/t natural · {money(result.costPerTonNatural)}. {recipe.factoryBatch ? `Custo por batida · ${money(result.batchCost)}.` : `Custo alimentar/cab./dia · ${money(result.costPerHeadDay)}. Custo do período · ${money(result.totalCost)}.`}</p>}
      {kind === "technical" && <>
        <h2>Balanço nutricional</h2>
        <NutritionBalance result={result} definitions={definitions} />
        <NutritionInclusionChecks result={result} />
        {result.economics && <p>Receita informada/cab./dia · {money(result.economics.revenuePerHeadDay)}. Margem após alimentação e outros custos · {money(result.economics.grossMarginPerHeadDay)}.</p>}
        <p>Origens das análises · {[...new Set(recipe.ingredients.map((item) => feeds.find((feed) => feed.id === item.feedId)?.source).filter(Boolean))].join(" · ")}</p>
      </>}
      <footer><p>Responsável técnico ____________________ Operador ____________________ Data __________</p></footer>
    </article>
    </div>
  </DocViewer>;
}
