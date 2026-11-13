import { useCallback, useRef, useState } from "react";
import { useNavigate } from "../../app/NavigationContext";
import { Dialog } from "../../components/Dialog";
import { Panel } from "../../components/Panel";
import { Notice, type NoticeState } from "../../components/Notice";
import { useDemoVersion, useDemoTables } from "../../demo/app/useDemoTables";
import { db } from "../../demo/store/db";
import { newId } from "../../demo/store/ids";
import { newRecipe } from "../../demo/nutrition/seed";
import { nutritionState, saveRecipe, saveFeed, deleteFeed, saveAsFeed, publishProduction } from "../../demo/nutrition/service";
import { recipeBundle, readRecipeBundle, recipeCsv, downloadText } from "../../demo/nutrition/exports";
import { calculateMixerPlan } from "../../demo/nutrition/mixers";
import type { Recipe } from "../../demo/nutrition/model";
import { Tabs } from "../erp/shared";
import { FeedLibrary } from "./FeedLibrary";
import { RecipeEditor, evaluateRecipe } from "./RecipeEditor";
import { Mixers } from "./Mixers";
import { NutritionAnalysis } from "./NutritionAnalysis";
import { RlmExchange } from "./RlmExchange";
import { NutritionReport } from "./NutritionReport";
import { NumericField } from "./NumericField";
import "./nutrition.css";

type Section = "recipe" | "library" | "mixers" | "analysis" | "exchange";
export function NutritionPage() {
  useDemoVersion();
  const tables = useDemoTables();
  const state = nutritionState();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("recipe");
  const [recipe, setRecipe] = useState<Recipe>(() => structuredClone(nutritionState().diets[0] ?? newRecipe()));
  const [notice, setNotice] = useState<NoticeState>(null);
  const [report, setReport] = useState<string | null>(null);
  const [production, setProduction] = useState(false);
  const [product, setProduct] = useState("");
  const [bags, setBags] = useState(25);
  const [reportKind, setReportKind] = useState("technical");
  const jsonInput = useRef<HTMLInputElement>(null);
  const closeReport = useCallback(() => setReport(null), []);
  const evaluation = evaluateRecipe(recipe, state.feeds);
  function notify(text: string, error = false) { setNotice({ kind: error ? "error" : "success", text }); }
  function action(work: () => void) {
    try { work(); } catch (reason) { notify(reason instanceof Error ? reason.message : "Não foi possível concluir.", true); }
  }
  function save() { action(() => { setRecipe(saveRecipe(recipe)); notify("Formulação salva neste navegador."); }); }
  function print() {
    action(() => {
      if (!evaluation.result) throw new Error(evaluation.error);
      if (reportKind === "operational") {
        const plan = calculateMixerPlan(recipe, state.feeds);
        if (plan.warnings.length) throw new Error(plan.warnings.join(" "));
      }
      setReport(reportKind);
    });
  }
  function importJson(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) return notify("Selecione uma formulação de até 2 MB.", true);
    void file.text().then((text) => {
      const bundle = readRecipeBundle(text);
      const feedMap = new Map(bundle.feeds.map((feed) => [feed.id, newId()]));
      const feeds = bundle.feeds.map((feed) => ({ ...feed, id: feedMap.get(feed.id)! }));
      const next: Recipe = {
        ...bundle.recipe, id: newId(),
        ingredients: bundle.recipe.ingredients.map((item) => ({ ...item, feedId: feedMap.get(item.feedId)! })),
        mixer: undefined,
      };
      db.write((current) => {
        const previous = nutritionState();
        current.nutrition = { ...previous, feeds: [...previous.feeds, ...feeds], diets: [...previous.diets, next] };
      });
      setRecipe(next); setSection("recipe"); notify("Formulação e alimentos importados em cadastros próprios.");
    }).catch((reason: Error) => notify(reason.message, true));
  }
  const customer = tables.customers.find((entry) => entry.id === recipe.customerId)?.legal_name;
  return (
    <div className="nutrition-page">
      <Notice notice={notice} />
      <Tabs value={section} onChange={setSection} options={[
        { id: "recipe", label: "Formulações" }, { id: "library", label: "Alimentos" },
        { id: "mixers", label: "Misturadores" }, { id: "analysis", label: "Cenários e versões" },
        { id: "exchange", label: "Arquivos RLM" },
      ]} />
      {section !== "library" && section !== "exchange" && <Panel title="Formulação em trabalho">
        <div className="nutrition-actions">
          <select aria-label="Formulação salva" value={state.diets.some((entry) => entry.id === recipe.id) ? recipe.id : ""}
            onChange={(event) => {
              const selected = state.diets.find((entry) => entry.id === event.target.value);
              if (selected) setRecipe(structuredClone(selected));
            }}>
            <option value="">Em edição</option>{state.diets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          <button type="button" className="secondary-button" onClick={() => setRecipe(newRecipe(newId()))}>Nova formulação</button>
          <button type="button" className="secondary-button" onClick={() => { setRecipe({ ...structuredClone(recipe), id: newId(), name: `${recipe.name} · cópia` }); notify("Cópia em edição. Salve para manter esta versão."); }}>Duplicar</button>
          <button type="button" className="primary-button" onClick={save}>Salvar formulação</button>
        </div>
      </Panel>}
      {section === "recipe" && <RecipeEditor recipe={recipe} feeds={state.feeds} customers={tables.customers.map((entry) => ({ id: entry.id, name: entry.legal_name }))}
        onChange={setRecipe} onNotice={notify} />}
      {section === "library" && <FeedLibrary feeds={state.feeds} onSave={saveFeed} onDelete={deleteFeed} />}
      {section === "mixers" && <Mixers recipe={recipe} feeds={state.feeds} onChange={setRecipe} />}
      {section === "analysis" && <NutritionAnalysis recipe={recipe} feeds={state.feeds} saved={state.diets} onUse={(next) => { setRecipe(next); setSection("recipe"); }} />}
      {section === "exchange" && <RlmExchange onImported={() => {}} onNotice={notify} />}
      {section !== "library" && section !== "exchange" && <Panel title="Relatórios e produção">
        <div className="nutrition-actions">
          <select aria-label="Tipo de relatório" value={reportKind} onChange={(event) => setReportKind(event.target.value)}>
            <option value="technical">Técnico</option><option value="client">Cliente</option><option value="operational">Operacional · pesagem</option>
          </select>
          <button type="button" className="secondary-button" onClick={print}>Imprimir / PDF</button>
          <button type="button" className="secondary-button" onClick={() => action(() => downloadText("formula-qualinutri.csv", recipeCsv(recipe, state.feeds), "text/csv;charset=utf-8"))}>Exportar CSV</button>
          <button type="button" className="secondary-button" onClick={() => action(() => downloadText("formula-qualinutri.json", JSON.stringify(recipeBundle(recipe, state.feeds), null, 2), "application/json"))}>Exportar formulação</button>
          <button type="button" className="secondary-button" onClick={() => jsonInput.current?.click()}>Importar formulação</button>
          <input ref={jsonInput} type="file" accept=".json" hidden onChange={(event) => { importJson(event.target.files?.[0]); event.target.value = ""; }} />
          <button type="button" className="secondary-button" onClick={() => action(() => { saveAsFeed(recipe); notify("Mistura salva como alimento na biblioteca."); })}>Salvar mistura como alimento</button>
          <button type="button" className="primary-button" onClick={() => { setProduct(""); setProduction(true); }}>Gerar ordem de produção</button>
        </div>
      </Panel>}
      {production && <Dialog title="Enviar fórmula para produção" onClose={() => setProduction(false)}>
        <p>As inclusões serão convertidas para matéria natural e a fórmula ficará vinculada à ordem.</p>
        <label className="field nutrition-field">Produto a fabricar<select aria-label="Produto a fabricar" value={product} onChange={(event) => setProduct(event.target.value)}>
          <option value="">Escolha um produto</option>{tables.catalog.products.map((entry) => <option key={entry.name} value={entry.name}>{entry.name} · {entry.weightKg} kg/saca</option>)}
        </select></label>
        <NumericField label="Sacas a produzir" value={bags} onChange={(value) => setBags(value!)} />
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setProduction(false)}>Voltar</button>
          <button type="button" className="primary-button" onClick={() => action(() => {
            publishProduction(recipe, product, bags, tables.catalog.products.find((entry) => entry.name === product)?.weightKg ?? 0);
            setRecipe(saveRecipe(recipe)); setProduction(false); notify("Fórmula e ordem de produção criadas.");
            navigate("production");
          })}>Criar ordem de produção</button></div>
        {notice?.kind === "error" && <p role="alert" className="auth-error">{notice.text}</p>}
      </Dialog>}
      {report && evaluation.result && <NutritionReport recipe={recipe} feeds={state.feeds} result={evaluation.result} kind={report} customer={customer} onDone={closeReport} />}
    </div>
  );
}
