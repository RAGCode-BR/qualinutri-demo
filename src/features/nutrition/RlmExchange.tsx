import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { useDemoVersion } from "../../demo/app/useDemoTables";
import { db } from "../../demo/store/db";
import { nutritionState, saveRecipe } from "../../demo/nutrition/service";
import { readRlmFile, type RlmArchive } from "../../demo/nutrition/rlmImport";
import { convertImportedDiet, mapRlmArchive, rlmRows } from "../../demo/nutrition/rlmMapping";
import type { SourceNutrient } from "../../demo/nutrition/model";

const PAGE_SIZE = 20;
const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const resultNames: Record<string, string> = {
  RES_CUSTODIA: "Custo por animal/dia", RES_CUSTOMS: "Custo por tonelada de MS",
  RES_CUSTOMO: "Custo por tonelada natural", RES_CONS: "Consumo de MS (kg/dia)", RES_CONSMO: "Consumo natural (kg/dia)",
};

function display(value: string) {
  const numeric = Number(value);
  return value.trim() && Number.isFinite(numeric) ? numberFormat.format(numeric) : value;
}

function dictionaryIdentity(nutrient: SourceNutrient) {
  return nutrient.id.slice(0, nutrient.id.lastIndexOf(":"));
}

function FileTables({ archive }: { archive: RlmArchive }) {
  const [tableName, setTableName] = useState(archive.tables[0]?.name ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const table = archive.tables.find((entry) => entry.name === tableName);
  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return table?.rows.filter((row) => !query || Object.values(row).some((value) => value.toLocaleLowerCase("pt-BR").includes(query))) ?? [];
  }, [search, table]);
  const columns = useMemo(() => Array.from(new Set([
    ...(table?.fields.map((field) => field.name) ?? []), ...(table?.rows.flatMap((row) => Object.keys(row)) ?? []),
  ])), [table]);
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  return <>
    <div className="form-grid">
      <label className="field">Tabela do arquivo<select value={tableName} onChange={(event) => {
        setTableName(event.target.value); setPage(0); setSearch("");
      }}>{archive.tables.map((entry) => <option value={entry.name} key={entry.name}>{entry.name} · {entry.rows.length} registros</option>)}</select></label>
      <label className="field">Buscar no arquivo<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
    </div>
    <p className="field-hint">{rows.length} registros · valores e unidades mantidos como exportados pelo RLM.</p>
    <ScrollableTable><table className="data-table">
      <thead><tr>{columns.map((column) => {
        const metadata = table?.fields.find((field) => field.name === column);
        return <th key={column} title={metadata ? `${metadata.type}${metadata.required ? " · obrigatório" : ""}` : undefined}>{column}</th>;
      })}</tr></thead>
      <tbody>{rows.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE).map((row, index) => <tr key={index}>
        {columns.map((column) => <td key={column} style={{ maxWidth: 380, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row[column] ?? "—"}</td>)}
      </tr>)}</tbody>
    </table></ScrollableTable>
    {!rows.length && <p>Nenhum registro nesta consulta.</p>}
    <div className="loads-toolbar-actions">
      <button type="button" className="secondary-button" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Página anterior</button>
      <span>Página {visiblePage + 1} de {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}</span>
      <button type="button" className="secondary-button" disabled={(visiblePage + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage(visiblePage + 1)}>Próxima página</button>
    </div>
  </>;
}

function SavedDiets({ archive }: { archive: RlmArchive }) {
  const diets = rlmRows(archive, "Dieta");
  const [index, setIndex] = useState(0);
  const diet = diets[index];
  if (!diet) return null;
  const ingredients = rlmRows(archive, "AlimDieta").filter((row) => row.DIETA_ID === diet.DIETA_ID);
  const foodNames = new Map(rlmRows(archive, "Alim").map((row) => [row.ALIM_ID, row.ALIM_NOME]));
  return <>
    <h3>Resultados salvos no RLM</h3>
    <label className="field">Dieta de origem<select value={index} onChange={(event) => setIndex(Number(event.target.value))}>
      {diets.map((row, position) => <option key={position} value={position}>{row.DIETA_NOME || `Dieta ${row.DIETA_ID}`}</option>)}
    </select></label>
    <p className="field-hint">Estes resultados pertencem à exportação. Os cálculos do módulo Nutrição são apresentados separadamente.</p>
    <ScrollableTable><table className="data-table"><thead><tr><th>Indicador salvo</th><th>Valor</th></tr></thead><tbody>
      {Object.entries(resultNames).filter(([key]) => diet[key] !== undefined).map(([key, label]) => <tr key={key}><td>{label}</td><td>{display(diet[key])}</td></tr>)}
    </tbody></table></ScrollableTable>
    <h4>Composição salva</h4>
    <ScrollableTable><table className="data-table"><thead><tr><th>Alimento</th><th>% natural</th><th>% MS</th><th>Custo/t natural</th><th>Misturador</th></tr></thead><tbody>
      {ingredients.map((row, position) => <tr key={position}><td>{foodNames.get(row.ALIM_ID) || `Alimento ${row.ALIM_ID}`}</td>
        <td>{display(row.ALIMDIETA_PROPMO ?? "")}</td><td>{display(row.ALIMDIETA_PROPMS ?? "")}</td>
        <td>{display(row.ALIMDIETA_CUSTOMO ?? "")}</td><td>{row.ALIMDIETA_MIX || "—"}</td></tr>)}
    </tbody></table></ScrollableTable>
  </>;
}

function ImportedSources({ onImported, onNotice }: { onImported: () => void; onNotice: (message: string, error?: boolean) => void }) {
  const state = nutritionState();
  const [selectedId, setSelectedId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [intakes, setIntakes] = useState<Record<string, string>>({});
  const selected = state.imported.find((diet) => diet.id === selectedId) ?? state.imported[0];
  if (!selected) return null;
  const storedIntake = Number(selected.fields.RES_CONS);
  const intake = intakes[selected.id] ?? (Number.isFinite(storedIntake) && storedIntake > 0 ? String(storedIntake) : "");
  const numericIntake = /^\d+(?:[.,]\d+)?$/.test(intake.trim()) ? Number(intake.replace(",", ".")) : Number.NaN;
  const namespace = selected.id.split(":diet:")[0];
  const definitions = new Map(state.sourceNutrients.filter((entry) => entry.id.startsWith(`${namespace}:`))
    .map((entry) => [entry.id.slice(entry.id.lastIndexOf(":") + 1), entry]));
  const nutrients = selected.tables.find((table) => table.name.toLowerCase() === "nutrdieta.xml")?.rows ?? [];
  return <section>
    <h3>Dietas de origem guardadas neste navegador</h3>
    <label className="field">Dieta importada<select aria-label="Dieta importada" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setExpanded(false); }}>
      {state.imported.map((diet) => <option key={diet.id} value={diet.id}>{diet.name} · {diet.fileName}</option>)}
    </select></label>
    <p className="field-hint">Os resultados abaixo foram salvos no arquivo de origem. Use a composição importada para criar uma formulação e calcular com os dados deste módulo.</p>
    <ScrollableTable><table className="data-table"><thead><tr><th>Resultado de origem</th><th>Valor salvo</th></tr></thead><tbody>
      {Object.entries(resultNames).filter(([key]) => selected.fields[key] !== undefined).map(([key, label]) => <tr key={key}>
        <td>{label}</td><td>{display(selected.fields[key])}</td>
      </tr>)}
    </tbody></table></ScrollableTable>
    <label className="field">Consumo para nova formulação (kg MS/cabeça/dia)
      <input type="text" inputMode="decimal" value={intake} onChange={(event) => setIntakes({ ...intakes, [selected.id]: event.target.value })} />
    </label>
    {!Number.isFinite(numericIntake) || numericIntake <= 0 ? <p className="field-hint">Informe o consumo para criar a formulação. O valor salvo no arquivo de origem será preservado.</p> : null}
    <div className="nutrition-actions">
      <button type="button" className="primary-button" disabled={!Number.isFinite(numericIntake) || numericIntake <= 0} onClick={() => {
        try {
          const recipe = convertImportedDiet(selected, state.feeds, numericIntake);
          saveRecipe(recipe);
          onNotice(`Formulação “${recipe.name}” criada. Abra Formulações e selecione-a na lista de formulações salvas.`);
          onImported();
        } catch (reason) {
          onNotice(reason instanceof Error ? reason.message : "Não foi possível criar a formulação.", true);
        }
      }}>Criar formulação editável</button>
      <button type="button" className="secondary-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Ocultar dados de origem" : "Ver dados de origem"}
      </button>
    </div>
    {expanded && <>
      {nutrients.length > 0 && <>
        <h4>Nutrientes da dieta na exportação</h4>
        <ScrollableTable><table className="data-table"><thead><tr><th>Nutriente de origem</th><th>Unidade</th><th>Valor salvo</th></tr></thead><tbody>
          {nutrients.map((row, index) => {
            const definition = definitions.get(row.NUTR_ID);
            return <tr key={index}><td>{definition?.name || `Nutriente ${row.NUTR_ID}`}</td><td>{definition?.unit || "Unidade ausente"}</td>
              <td>{display(row.NUTRDIETA_QT ?? "")}</td></tr>;
          })}
        </tbody></table></ScrollableTable>
      </>}
      {selected.tables.some((table) => table.name === "NutrAlimDieta.xml" && table.rows.length > 0) && <>
        <h4>Análises de ingredientes preservadas na base de origem</h4>
        <ScrollableTable><table className="data-table"><thead><tr><th>Alimento de origem</th><th>Nutriente</th><th>Unidade</th><th>Valor salvo</th></tr></thead><tbody>
          {selected.tables.filter((table) => table.name === "NutrAlimDieta.xml").flatMap((table) => table.rows.map((row, index) => {
            const definition = definitions.get(row.NUTR_ID);
            return <tr key={index}><td>{row.ALIM_ID || row.ALIMDIETA_ID || "—"}</td>
              <td>{definition?.name || `Nutriente ${row.NUTR_ID}`}</td><td>{definition?.unit || "Unidade ausente"}</td>
              <td>{display(row.NUTRALIMDIETA_QT ?? "")}</td></tr>;
          }))}
        </tbody></table></ScrollableTable>
      </>}
      <h4>Campos e parâmetros originais</h4>
      <ScrollableTable><table className="data-table"><thead><tr><th>Campo</th><th>Valor exportado</th></tr></thead><tbody>
        {Object.entries(selected.fields).map(([key, value]) => <tr key={key}><td>{key}</td><td>{value}</td></tr>)}
        {selected.tables.filter((table) => table.name.toLowerCase() === "leite.xml").flatMap((table) => table.rows.flatMap((row, index) =>
          Object.entries(row).map(([key, value]) => <tr key={`${index}-${key}`}><td>Leite · {key}</td><td>{value}</td></tr>)))}
      </tbody></table></ScrollableTable>
    </>}
  </section>;
}

export function RlmExchange({ onImported, onNotice }: { onImported: () => void; onNotice: (message: string, error?: boolean) => void }) {
  useDemoVersion();
  const state = nutritionState();
  const [archive, setArchive] = useState<RlmArchive | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [dictionaryId, setDictionaryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const dictionaries = new Map<string, SourceNutrient[]>();
  for (const nutrient of state.sourceNutrients) {
    const identity = dictionaryIdentity(nutrient);
    const rows = dictionaries.get(identity) ?? [];
    rows.push(nutrient);
    dictionaries.set(identity, rows);
  }
  const mapped = useMemo(() => archive ? mapRlmArchive(archive, sourceId, state.sourceNutrients.filter((nutrient) => dictionaryIdentity(nutrient) === dictionaryId)) : null,
    [archive, sourceId, dictionaryId, state.sourceNutrients]);
  const embeddedNutrientIds = new Set(archive ? rlmRows(archive, "Nutr").map((row) => row.NUTR_ID) : []);
  const dictionaryIncomplete = archive && rlmRows(archive, "NutrAlim").some((row) => !embeddedNutrientIds.has(row.NUTR_ID));

  async function open(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const current = ++request.current;
    setBusy(true); setError(""); setArchive(null); setDictionaryId("");
    try {
      const parsed = await readRlmFile(file);
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      if (request.current !== current) return;
      setSourceId(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
      setArchive(parsed);
    } catch (reason) {
      if (request.current === current) setError(reason instanceof Error ? reason.message : "Não foi possível abrir o arquivo.");
    } finally {
      if (request.current === current) setBusy(false);
    }
  }

  function saveImport() {
    if (!mapped || !archive || busy) return;
    try {
      if (!mapped.feeds.length && !mapped.diets.length && !mapped.dictionaries.length) throw new Error("Selecione um dicionário compatível antes de importar a biblioteca.");
      const next = {
        feeds: [...state.feeds.filter((feed) => !mapped.feeds.some((entry) => entry.id === feed.id)), ...mapped.feeds],
        sourceNutrients: [...state.sourceNutrients.filter((nutrient) => !mapped.dictionaries.some((entry) => entry.id === nutrient.id)), ...mapped.dictionaries],
        imported: [...state.imported.filter((diet) => !mapped.diets.some((entry) => entry.id === diet.id)), ...mapped.diets],
      };
      if (JSON.stringify(next).length > 2_500_000) throw new Error("A importação excede o espaço reservado à biblioteca local. Consulte os dados nesta tela ou reduza a exportação.");
      db.write((tables) => { tables.nutrition = { ...state, ...next }; });
      onNotice(`${mapped.feeds.length} alimentos e ${mapped.diets.length} dietas de origem importados. Confira os custos dos alimentos antes de calcular.`);
      onImported();
    } catch (reason) {
      onNotice(reason instanceof Error ? reason.message : "Não foi possível importar os dados.", true);
    }
  }

  return <Panel title="Arquivos do RLM">
    <label className="field">Abrir biblioteca ou dieta do RLM<input type="file" accept=".r3a,.r3f,.xml" onChange={(event) => void open(event)} disabled={busy} /></label>
    <p className="field-hint">Arquivos R3A, R3F ou XML DATAPACKET, até 32 MB. A leitura e a importação acontecem neste navegador.</p>
    {busy && <p role="status">Lendo e conferindo a integridade do arquivo…</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    <ImportedSources onImported={onImported} onNotice={onNotice} />
    {archive && mapped && <>
      <h3>{archive.fileName}</h3>
      <p>{archive.tables.length} tabelas · {mapped.feeds.length} alimentos compatíveis · {mapped.diets.length} dietas salvas.</p>
      {dictionaryIncomplete && <>
        <label className="field">Dicionário de nutrientes do arquivo<select value={dictionaryId} onChange={(event) => setDictionaryId(event.target.value)}>
          <option value="">Selecione um dicionário compatível</option>
          {[...dictionaries].map(([identity, rows]) => <option key={identity} value={identity}>Dicionário {identity.slice(4, 16)} · {rows.length} nutrientes</option>)}
        </select></label>
        <p className="warning-message">O dicionário deste arquivo está incompleto. Para complementar a composição, selecione explicitamente um dicionário da mesma versão. Os campos brutos continuam disponíveis para consulta.</p>
      </>}
      {mapped.skippedFeeds > 0 && <p className="warning-message">{mapped.skippedFeeds} alimentos sem matéria seca positiva ou dicionário compatível serão mantidos somente na consulta do arquivo.</p>}
      {mapped.feeds.some((feed) => feed.pricePerKgNatural === 0) && <p className="warning-message">Há alimentos com preço pendente. Atualize o custo no cadastro antes da avaliação econômica.</p>}
      <button type="button" className="primary-button" onClick={saveImport} disabled={!mapped.feeds.length && !mapped.diets.length && !mapped.dictionaries.length}>Importar biblioteca e dietas</button>
      <SavedDiets key={sourceId} archive={archive} />
      <h3>Tabelas e metadados do arquivo</h3>
      <FileTables key={sourceId} archive={archive} />
    </>}
  </Panel>;
}
