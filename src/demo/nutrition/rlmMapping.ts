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
    if (code === "MONENSINA" && ["PPM", "MG/KGMS", "MG/KG"].includes(unit)) return "monensin";
    return `rlm:${sourceId}:${dictionaryRowId(nutrient)}`;
  }
  return null;
}

function belongsToDiet(row: Record<string, string>, diet: Record<string, string>): boolean {
  return Boolean(diet.DIETA_GUID && row.DIETA_GUID === diet.DIETA_GUID)
    || Boolean(diet.DIETA_ID && row.DIETA_ID === diet.DIETA_ID);
}

function mapSavedDiets(archive: RlmArchive, sourceId: string): ImportedDiet[] {
  const selectedTables = ["AlimDieta", "NutrDieta", "Leite"];
  return rlmRows(archive, "Dieta").map((diet, index) => ({
    id: `rlm:${sourceId}:diet:${diet.DIETA_GUID || diet.DIETA_ID || index}`,
    name: diet.DIETA_NOME || `Dieta ${diet.DIETA_ID || index + 1}`,
    fileName: archive.fileName,
    fields: { ...diet },
    tables: [
      ...selectedTables.map((name) => ({ name: `${name}.xml`, rows: rlmRows(archive, name).filter((row) => belongsToDiet(row, diet)) })),
      { name: "NutrAlimDieta.xml", rows: rlmRows(archive, "NutrAlimDieta").filter((row) => belongsToDiet(row, diet)) },
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
      if (key && amount !== null && amount > 100 && key !== "crudeProtein" && key !== "metabolizableEnergy" && key !== "monensin" && !key.startsWith("rlm:")) {
        key = `rlm:${sourceId}:${analysis.NUTR_ID}`;
        excluded++;
      }
      if (key && amount !== null) nutrients[key] = amount;
      else excluded++;
    }
    const priceOptions = prices.get(row.ALIM_ID);
    const libraryPrice = value(row.ALIM_PRECO);
    const dietPrice = priceOptions?.size === 1 ? [...priceOptions][0] : undefined;
    const price = libraryPrice === null ? dietPrice : libraryPrice / 1000;
    feeds.push({
      id: `rlm:${sourceId}:feed:${row.ALIM_GUID || row.ALIM_ID}`,
      name: row.ALIM_NOME,
      dryMatterPct: dryMatter,
      pricePerKgNatural: price ?? 0,
      pricePending: price === undefined,
      category: libraries.get(row.BIBLIOALIM_ID) || "Biblioteca RLM",
      source: `Arquivo ${archive.fileName}`,
      nutrients,
      notes: [row.ALIM_DESC, price !== undefined ? "Preço por kg convertido do valor por tonelada natural no RLM."
        : "Preço pendente: informe o custo atual antes de avaliar custos ou otimizar.",
      excluded ? `${excluded} campos sem base ou unidade compatível foram preservados na consulta do arquivo.` : ""]
        .filter(Boolean).join("\n"),
    });
  }
  const dictionaries = dictionary.map((nutrient) => ({
    ...nutrient, id: `rlm:${sourceId}:${dictionaryRowId(nutrient)}`, fileName: archive.fileName,
  }));
  return { feeds, dictionaries, diets: mapSavedDiets(archive, sourceId), skippedFeeds, hasDictionary: Boolean(dryMatterDefinition) };
}

/** Creates editable ingredients from saved proportions. Biological results remain source records. */
export function convertImportedDiet(imported: ImportedDiet, feeds: NutritionFeed[], intakeOverride?: number, dictionary: SourceNutrient[] = []): Recipe {
  const namespace = imported.id.split(":diet:")[0];
  const rows = imported.tables.find((table) => table.name.toLowerCase() === "alimdieta.xml")?.rows ?? [];
  if (!rows.length) throw new Error("Esta dieta não contém uma composição de alimentos exportada.");
  const proportions = (field: string) => rows.map((row) => value(row[field]));
  const natural = proportions("ALIMDIETA_PROPMO");
  const dry = proportions("ALIMDIETA_PROPMS");
  const sumsToHundred = (values: (number | null)[]) => values.every((amount) => amount !== null)
    && Math.abs(values.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) - 100) <= 0.02;
  const factoryBatch = imported.fields.DIETA_TIPO === "3";
  const basis = factoryBatch && sumsToHundred(natural) ? "natural" : sumsToHundred(dry) ? "dry" : "natural";
  const percentages = basis === "dry" ? dry : natural;
  if (!sumsToHundred(percentages)) throw new Error("A composição exportada não soma 100%. Confira o arquivo antes de criar a formulação.");
  const definitions = new Map(dictionary.filter((item) => item.id.startsWith(namespace + ":"))
    .map((item) => [dictionaryRowId(item), item]));
  const sourceId = namespace.slice(4);
  const analyses = imported.tables.find((table) => table.name === "NutrAlimDieta.xml")?.rows ?? [];
  const ingredients = rows.map((row, index) => {
    const expectedId = `${namespace}:feed:${row.ALIM_GUID || row.ALIM_ID}`.toLowerCase();
    const feed = feeds.find((entry) => entry.id.toLowerCase() === expectedId);
    if (!feed) throw new Error(`Importe primeiro o alimento ${row.ALIM_ID || row.ALIM_GUID} com matéria seca válida.`);
    const price = value(row.ALIMDIETA_CUSTOMO);
    const foodRows = analyses.filter((item) => item.ALIMDIETA_ID && item.ALIMDIETA_ID === row.ALIMDIETA_ID);
    const nutrients = foodRows.length && definitions.size ? {} as Record<string, number> : { ...feed.nutrients };
    let dryMatterPct = feed.dryMatterPct;
    for (const item of foodRows) {
      const definition = definitions.get(item.NUTR_ID);
      const amount = value(item.NUTRALIMDIETA_QT);
      if (!definition || amount === null) continue;
      if (definition.code.toUpperCase() === "MS" && amount > 0 && amount <= 100) dryMatterPct = amount;
      const key = compositionKey(definition, sourceId);
      if (key && (amount <= 100 || key.startsWith("rlm:") || key === "crudeProtein" || key === "metabolizableEnergy" || key === "monensin")) {
        nutrients[key] = amount;
      }
    }
    const limits = factoryBatch && basis === "natural" && row.ALIMDIETA_RESTR === "T"
      ? { minPct: value(row.ALIMDIETA_MIN) ?? undefined, maxPct: value(row.ALIMDIETA_MAX) ?? undefined } : {};
    return {
      feedId: feed.id, percentage: percentages[index]!, ...limits,
      ...(dictionary.length || factoryBatch ? {
        analysis: { dryMatterPct, nutrients, pricePerKgNatural: price === null ? 0 : price / 1000, pricePending: price === null },
      } : {}),
    };
  });
  if (new Set(ingredients.map((entry) => entry.feedId)).size !== ingredients.length) {
    throw new Error("A exportação repete um alimento na mesma dieta. Confira a composição antes de criar a formulação.");
  }
  // Exported percentages may contain only a few decimal places. Normalize this rounding.
  const total = ingredients.reduce((sum, ingredient) => sum + ingredient.percentage, 0);
  for (const ingredient of ingredients) ingredient.percentage = ingredient.percentage / total * 100;
  const intake = factoryBatch ? 0 : intakeOverride ?? value(imported.fields.RES_CONS);
  if (intake === null || !Number.isFinite(intake) || (!factoryBatch && intake <= 0)) throw new Error("A dieta exportada não informa consumo de matéria seca positivo.");
  const headsValue = value(imported.fields.DIETA_QTANM);
  const heads = headsValue && Number.isSafeInteger(headsValue) && headsValue > 0 ? headsValue : 1;
  const dairy = imported.tables.find((table) => table.name.toLowerCase() === "leite.xml")?.rows[0];
  const milkKgDay = value(dairy?.LEITE_PRODREAL);
  const milkPrice = value(dairy?.LEITE_PRECO);
  const nutrientBounds = (imported.tables.find((table) => table.name === "NutrDieta.xml")?.rows ?? []).flatMap((row) => {
    const definition = definitions.get(row.NUTR_ID);
    const key = definition && compositionKey(definition, sourceId);
    const min = value(row.NUTRDIETA_EXIGUSRMIN);
    const max = value(row.NUTRDIETA_EXIGUSRMAX);
    // The recorded concentrate uses unit 1 for its natural-basis targets.
    if (!factoryBatch || !key || row.NUTRDIETA_EXIGUSR !== "T" || row.NUTRDIETA_UNIDEXIG !== "1" || (min === null && max === null)) return [];
    return [{ nutrient: key, min: min ?? undefined, max: max ?? undefined, basis: "natural" as const }];
  });
  return {
    id: crypto.randomUUID(), name: imported.name, kind: factoryBatch ? "concentrado" : dairy ? "leite" : "usuario", basis,
    ...(factoryBatch ? { factoryBatch: true, costBasis: "natural" as const } : {}),
    rlmReference: {
      fileName: imported.fileName, costPerTonNatural: value(imported.fields.RES_CUSTOMO) ?? undefined,
      dryMatterPct: value(imported.tables.find((table) => table.name === "NutrDieta.xml")?.rows.find((row) => definitions.get(row.NUTR_ID)?.code.toUpperCase() === "MS")?.NUTRDIETA_QT) ?? undefined,
    },
    ingredients, batchKg: 1000, dryMatterIntakeKg: intake, heads, days: 1, nutrientBounds,
    lot: imported.fields.DIETA_LOTE,
    animal: { category: dairy ? "leite" : "outro", bodyWeightKg: value(dairy?.VACA_PV) ?? undefined,
      milkKgDay: milkKgDay ?? undefined },
    economics: dairy && milkKgDay !== null && milkPrice !== null
      ? { milkKgDay, milkPricePerKg: milkPrice, otherCostPerHeadDay: 0 } : undefined,
    notes: factoryBatch ? `Concentrado importado de ${imported.fileName}. Confira as metas originais, análises, preços e o peso da batida antes de produzir.` : `Composição importada de ${imported.fileName}. ${intakeOverride === undefined ? "Consumo e proporções vieram do arquivo." : "Proporções vieram do arquivo e o consumo foi confirmado na importação."} Lote de mistura inicial de 1.000 kg, ${heads} animais e período de 1 dia; confira antes de usar. Restrições nutricionais e de ingredientes devem ser conferidas no arquivo e informadas nesta formulação. Resultados biológicos anteriores permanecem na consulta de origem.`,
  };
}
