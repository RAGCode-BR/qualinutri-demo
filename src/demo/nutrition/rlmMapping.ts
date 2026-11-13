import type { ImportedDiet, Recipe, SourceNutrient } from "./model";
import type { RlmArchive } from "./rlmImport";
import type { NutritionFeed } from "./types";

export type RlmMappedImport = {
  feeds: NutritionFeed[];
  dictionaries: SourceNutrient[];
  diets: ImportedDiet[];
  skippedFeeds: number;
  hasDictionary: boolean;
};

const nutrientKeys: Record<string, string> = {
  PB: "crudeProtein", FDN: "ndf", FDA: "adf", EE: "etherExtract", MM: "ash",
  AMIDO: "starch", CA: "calcium", P: "phosphorus", EM: "metabolizableEnergy",
};

export function rlmRows(archive: RlmArchive, name: string): Record<string, string>[] {
  return archive.tables.find((table) => table.name.toLowerCase() === `${name.toLowerCase()}.xml`)?.rows ?? [];
}

export function rlmDictionary(archive: RlmArchive, sourceId: string): SourceNutrient[] {
  return rlmRows(archive, "Nutr").filter((row) => row.NUTR_ID).map((row) => ({
    id: `rlm:${sourceId}:${row.NUTR_ID}`,
    code: row.NUTR_FIELDNAME ?? "",
    name: row.NUTR_NOME_PTB || row.NUTR_NOME || row.NUTR_ABREV || `Nutriente ${row.NUTR_ID}`,
    unit: row.NUTR_UNID_PTB || row.NUTR_UNID || "Unidade ausente",
    storage: row.NUTR_UNIDARMZ ?? "",
  }));
}

function value(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  const result = Number(text);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function dictionaryRowId(nutrient: SourceNutrient) {
  return nutrient.id.slice(nutrient.id.lastIndexOf(":") + 1);
}

function normalizedUnit(unit: string): string {
  return unit.replace(/\s/g, "").toUpperCase();
}

function compositionKey(nutrient: SourceNutrient, sourceId: string): string | null {
  if (nutrient.storage !== "1") return null;
  const unit = normalizedUnit(nutrient.unit);
  const code = nutrient.code.toUpperCase();
  if (["%MS", "%"].includes(unit)) return (code !== "EM" ? nutrientKeys[code] : undefined) ?? `rlm:${sourceId}:${dictionaryRowId(nutrient)}`;
  if (["MCAL/KGMS", "MCAL/KG"].includes(unit)) {
    return code === "EM" ? "metabolizableEnergy" : `rlm:${sourceId}:${dictionaryRowId(nutrient)}`;
  }
  if (["PPM", "MG/KGMS", "MG/KG", "UI/KGMS", "UI/KG"].includes(unit)) {
    return `rlm:${sourceId}:${dictionaryRowId(nutrient)}`;
  }
  return null;
}

function belongsToDiet(row: Record<string, string>, diet: Record<string, string>): boolean {
  return Boolean(diet.DIETA_GUID && row.DIETA_GUID === diet.DIETA_GUID)
    || Boolean(diet.DIETA_ID && row.DIETA_ID === diet.DIETA_ID);
}

function mapSavedDiets(archive: RlmArchive, sourceId: string, definitions: Map<string, SourceNutrient>): ImportedDiet[] {
  const selectedTables = ["AlimDieta", "NutrDieta", "Leite"];
  return rlmRows(archive, "Dieta").map((diet, index) => ({
    id: `rlm:${sourceId}:diet:${diet.DIETA_GUID || diet.DIETA_ID || index}`,
    name: diet.DIETA_NOME || `Dieta ${diet.DIETA_ID || index + 1}`,
    fileName: archive.fileName,
    fields: { ...diet },
    tables: [
      ...selectedTables.map((name) => ({ name: `${name}.xml`, rows: rlmRows(archive, name).filter((row) => belongsToDiet(row, diet)) })),
      { name: "NutrAlimDieta.xml", rows: rlmRows(archive, "NutrAlimDieta").filter((row) => {
        const definition = definitions.get(row.NUTR_ID);
        return belongsToDiet(row, diet) && (!definition || !compositionKey(definition, sourceId));
      }) },
    ],
  }));
}

/** A dictionary from another file is used only after the user explicitly selects it. */
export function mapRlmArchive(archive: RlmArchive, sourceId: string, selectedDictionary: SourceNutrient[] = []): RlmMappedImport {
  const embedded = rlmDictionary(archive, sourceId);
  const dictionary = [...new Map([
    ...selectedDictionary.map((nutrient) => [dictionaryRowId(nutrient), nutrient] as const),
    ...embedded.map((nutrient) => [dictionaryRowId(nutrient), nutrient] as const),
  ]).values()];
  const definitions = new Map(dictionary.map((nutrient) => [dictionaryRowId(nutrient), nutrient]));
  const dryMatterDefinition = dictionary.find((nutrient) => nutrient.code.toUpperCase() === "MS"
    && normalizedUnit(nutrient.unit) === "%" && nutrient.storage === "0");
  const dryMatterId = dryMatterDefinition && dictionaryRowId(dryMatterDefinition);
  const composition = new Map<string, Record<string, string>[]>();
  for (const row of rlmRows(archive, "NutrAlim")) {
    const rows = composition.get(row.ALIM_ID) ?? [];
    rows.push(row);
    composition.set(row.ALIM_ID, rows);
  }
  const libraries = new Map(rlmRows(archive, "BiblioAlim").map((row) => [row.BIBLIOALIM_ID, row.BIBLIOALIM_NOME]));
  const prices = new Map<string, Set<number>>();
  for (const row of rlmRows(archive, "AlimDieta")) {
    const price = value(row.ALIMDIETA_CUSTOMO);
    if (price === null) continue;
    const values = prices.get(row.ALIM_ID) ?? new Set<number>();
    values.add(price / 1000);
    prices.set(row.ALIM_ID, values);
  }

  const feeds: NutritionFeed[] = [];
  let skippedFeeds = 0;
  for (const row of rlmRows(archive, "Alim")) {
    const analyses = composition.get(row.ALIM_ID) ?? [];
    const dryMatter = value(analyses.find((analysis) => analysis.NUTR_ID === dryMatterId)?.NUTRALIM_QT);
    if (!row.ALIM_ID || !row.ALIM_NOME?.trim() || dryMatter === null || dryMatter <= 0 || dryMatter > 100) {
      skippedFeeds++;
      continue;
    }
    const nutrients: Record<string, number> = {};
    let excluded = 0;
    for (const analysis of analyses) {
      if (analysis.NUTR_ID === dryMatterId) continue;
      const definition = definitions.get(analysis.NUTR_ID);
      const amount = value(analysis.NUTRALIM_QT);
      let key = definition && compositionKey(definition, sourceId);
      if (key && amount !== null && amount > 100 && key !== "crudeProtein" && key !== "metabolizableEnergy" && !key.startsWith("rlm:")) {
        key = `rlm:${sourceId}:${analysis.NUTR_ID}`;
        excluded++;
      }
      if (key && amount !== null) nutrients[key] = amount;
      else excluded++;
    }
    const priceOptions = prices.get(row.ALIM_ID);
    const hasPrice = priceOptions?.size === 1;
    const price = hasPrice ? [...priceOptions!][0] : 0;
    feeds.push({
      id: `rlm:${sourceId}:feed:${row.ALIM_GUID || row.ALIM_ID}`,
      name: row.ALIM_NOME,
      dryMatterPct: dryMatter,
      pricePerKgNatural: price,
      pricePending: !hasPrice,
      category: libraries.get(row.BIBLIOALIM_ID) || "Biblioteca RLM",
      source: `Arquivo ${archive.fileName}`,
      nutrients,
      notes: [row.ALIM_DESC, hasPrice ? "Preço por kg derivado do custo natural salvo na dieta."
        : "Preço pendente: informe o custo atual antes de avaliar custos ou otimizar.",
      excluded ? `${excluded} campos sem base ou unidade compatível foram preservados na consulta do arquivo.` : ""]
        .filter(Boolean).join("\n"),
    });
  }
  const dictionaries = dictionary.map((nutrient) => ({
    ...nutrient, id: `rlm:${sourceId}:${dictionaryRowId(nutrient)}`,
  }));
  return { feeds, dictionaries, diets: mapSavedDiets(archive, sourceId, definitions), skippedFeeds, hasDictionary: Boolean(dryMatterDefinition) };
}

/** Creates editable ingredients from saved proportions. Biological results remain source records. */
export function convertImportedDiet(imported: ImportedDiet, feeds: NutritionFeed[], intakeOverride?: number): Recipe {
  const namespace = imported.id.split(":diet:")[0];
  const rows = imported.tables.find((table) => table.name.toLowerCase() === "alimdieta.xml")?.rows ?? [];
  if (!rows.length) throw new Error("Esta dieta não contém uma composição de alimentos exportada.");
  const proportions = (field: string) => rows.map((row) => value(row[field]));
  const natural = proportions("ALIMDIETA_PROPMO");
  const dry = proportions("ALIMDIETA_PROPMS");
  const sumsToHundred = (values: (number | null)[]) => values.every((amount) => amount !== null)
    && Math.abs(values.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) - 100) <= 0.02;
  const basis = sumsToHundred(dry) ? "dry" : "natural";
  const percentages = basis === "dry" ? dry : natural;
  if (!sumsToHundred(percentages)) throw new Error("A composição exportada não soma 100%. Confira o arquivo antes de criar a formulação.");
  const ingredients = rows.map((row, index) => {
    const expectedId = `${namespace}:feed:${row.ALIM_GUID || row.ALIM_ID}`.toLowerCase();
    const feed = feeds.find((entry) => entry.id.toLowerCase() === expectedId);
    if (!feed) throw new Error(`Importe primeiro o alimento ${row.ALIM_ID || row.ALIM_GUID} com matéria seca válida.`);
    return { feedId: feed.id, percentage: percentages[index]! };
  });
  if (new Set(ingredients.map((entry) => entry.feedId)).size !== ingredients.length) {
    throw new Error("A exportação repete um alimento na mesma dieta. Confira a composição antes de criar a formulação.");
  }
  // Exported percentages may contain only a few decimal places. Normalize this rounding.
  const total = ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0);
  for (const ingredient of ingredients) ingredient.percentage = ingredient.percentage / total * 100;
  const intake = intakeOverride ?? value(imported.fields.RES_CONS);
  if (!intake || !Number.isFinite(intake) || intake <= 0) throw new Error("A dieta exportada não informa consumo de matéria seca positivo.");
  const headsValue = value(imported.fields.DIETA_QTANM);
  const heads = headsValue && Number.isSafeInteger(headsValue) && headsValue > 0 ? headsValue : 1;
  const dairy = imported.tables.find((table) => table.name.toLowerCase() === "leite.xml")?.rows[0];
  const milkKgDay = value(dairy?.LEITE_PRODREAL);
  const milkPrice = value(dairy?.LEITE_PRECO);
  return {
    id: crypto.randomUUID(), name: imported.name, kind: dairy ? "leite" : "usuario", basis,
    ingredients, batchKg: 1000, dryMatterIntakeKg: intake, heads, days: 1, nutrientBounds: [],
    lot: imported.fields.DIETA_LOTE,
    animal: { category: dairy ? "leite" : "outro", bodyWeightKg: value(dairy?.VACA_PV) ?? undefined,
      milkKgDay: milkKgDay ?? undefined },
    economics: dairy && milkKgDay !== null && milkPrice !== null
      ? { milkKgDay, milkPricePerKg: milkPrice, otherCostPerHeadDay: 0 } : undefined,
    notes: `Composição importada de ${imported.fileName}. ${intakeOverride === undefined ? "Consumo e proporções vieram do arquivo." : "Proporções vieram do arquivo e o consumo foi confirmado na importação."} Lote de mistura inicial de 1.000 kg, ${heads} animais e período de 1 dia; confira antes de usar. Restrições nutricionais e de ingredientes devem ser conferidas no arquivo e informadas nesta formulação. Resultados biológicos anteriores permanecem na consulta de origem.`,
  };
}
