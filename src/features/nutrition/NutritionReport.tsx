import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Recipe } from "../../demo/nutrition/model";
import type { DietCalculation, NutritionFeed } from "../../demo/nutrition/types";
import { NUTRIENTS } from "../../demo/nutrition/types";
import { calculateMixerPlan } from "../../demo/nutrition/mixers";

const format = (value: number) => Number.isFinite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "Análise ausente";
const money = (value: number) => !Number.isFinite(value) ? "Preço pendente" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function NutritionReport({ recipe, feeds, result, kind, customer, onDone }: {
  recipe: Recipe; feeds: NutritionFeed[]; result: DietCalculation; kind: string; customer?: string; onDone: () => void;
}) {
  const plan = kind === "operational" ? calculateMixerPlan(recipe, feeds) : null;
  useEffect(() => {
    const title = document.title;
    document.title = `Nutrição-${recipe.name}`;
    document.body.classList.add("is-printing");
    const end = () => onDone();
    window.addEventListener("afterprint", end);
    const timer = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(timer); window.removeEventListener("afterprint", end);
      document.body.classList.remove("is-printing"); document.title = title;
    };
  }, [onDone, recipe.name]);
  return createPortal(<div className="print-root nutrition-report">
    <article className="quote-doc">
      <header><p>Qualinutri · Demonstração</p><h1>{recipe.name}</h1>
        <p>{kind === "operational" ? "Ficha de pesagem" : kind === "client" ? "Plano de alimentação" : "Relatório técnico"} · {new Date().toLocaleDateString("pt-BR")}</p>
      </header>
      <p>{customer} {recipe.lot && `· Lote ${recipe.lot}`} · {recipe.heads} animais · {recipe.days} dias</p>
      <p>{recipe.notes}</p>
      <p>Consumo informado · {format(recipe.dryMatterIntakeKg)} kg MS/cabeça/dia. Mistura · {format(result.dryMatterPct)}% MS.</p>
      {plan ? plan.stages.filter((stage) => stage.rows.length > 0).map((stage) => <section key={stage.stage}>
        <h2>Misturador {stage.stage} · capacidade {format(stage.capacityKg)} kg</h2>
        <table><thead><tr><th>Ordem</th><th>Ingrediente</th><th>kg calculados</th><th>kg ajustados</th><th>Acumulado kg</th><th>Conferido</th></tr></thead>
          <tbody>{stage.rows.map((row, index) => <tr key={row.key}><td>{index + 1}</td><td>{row.name}</td><td>{format(row.nominalKg)}</td><td>{format(row.actualKg)}</td><td>{format(row.accumulatedKg)}</td><td>□</td></tr>)}</tbody></table>
      </section>) : <table><thead><tr><th>Alimento</th><th>% natural</th><th>% MS</th><th>kg/lote</th><th>kg natural/cab./dia</th><th>kg no período</th></tr></thead>
        <tbody>{result.ingredients.map((row) => <tr key={row.feedId}><td>{row.name}</td><td>{format(row.naturalPct)}</td><td>{format(row.dryPct)}</td><td>{format(row.batchKg)}</td><td>{format(row.naturalKgPerHeadDay)}</td><td>{format(row.totalNaturalKg)}</td></tr>)}</tbody></table>}
      {kind !== "operational" && <p>Custo/t natural · {money(result.costPerTonNatural)}. Custo alimentar/cab./dia · {money(result.costPerHeadDay)}. Custo do período · {money(result.totalCost)}.</p>}
      {kind === "technical" && <>
        <h2>Balanço nutricional</h2>
        <table><thead><tr><th>Nutriente na MS</th><th>Resultado</th><th>Mínimo</th><th>Máximo</th><th>Conferência</th></tr></thead><tbody>{Object.entries(result.nutrients).map(([key, value]) => {
          const def = NUTRIENTS.find((item) => item.key === key);
          const bound = result.constraints.find((item) => item.kind === "nutrient" && item.key === key);
          return <tr key={key}><td>{def?.label ?? key} · {def?.unit ?? "Unidade cadastrada"}</td><td>{format(value)}</td><td>{bound?.min ?? "—"}</td><td>{bound?.max ?? "—"}</td><td>{bound ? bound.satisfied ? "Atende" : "Fora do limite" : "Sem limite"}</td></tr>;
        })}</tbody></table>
        {result.economics && <p>Receita informada/cab./dia · {money(result.economics.revenuePerHeadDay)}. Margem após alimentação e outros custos · {money(result.economics.grossMarginPerHeadDay)}.</p>}
        <p>Origens das análises · {[...new Set(recipe.ingredients.map((item) => feeds.find((feed) => feed.id === item.feedId)?.source).filter(Boolean))].join(" · ")}</p>
      </>}
      <footer><p>Responsável técnico ____________________ Operador ____________________ Data __________</p></footer>
    </article>
  </div>, document.body);
}
