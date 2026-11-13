import { describe, expect, it } from "vitest";
import { convertImportedDiet, mapRlmArchive, rlmDictionary } from "../../src/demo/nutrition/rlmMapping";
import type { RlmArchive } from "../../src/demo/nutrition/rlmImport";

function sample(withDictionary = true): RlmArchive {
  const tables: RlmArchive["tables"] = [
    { name: "Alim.xml", fields: [], rows: [{ ALIM_ID: "5", ALIM_NOME: "Alimento de teste" }] },
    { name: "NutrAlim.xml", fields: [], rows: [
      { ALIM_ID: "5", NUTR_ID: "1", NUTRALIM_QT: "90" },
      { ALIM_ID: "5", NUTR_ID: "6", NUTRALIM_QT: "18" },
      { ALIM_ID: "5", NUTR_ID: "34", NUTRALIM_QT: "50" },
      { ALIM_ID: "5", NUTR_ID: "90", NUTRALIM_QT: "1.25" },
    ] },
    { name: "Dieta.xml", fields: [], rows: [{ DIETA_ID: "2", DIETA_NOME: "Dieta de teste", RES_CUSTODIA: "12.5", RES_CONS: "10" }] },
    { name: "AlimDieta.xml", fields: [], rows: [{ DIETA_ID: "2", ALIM_ID: "5", ALIMDIETA_CUSTOMO: "800", ALIMDIETA_PROPMO: "100" }] },
  ];
  if (withDictionary) tables.push({ name: "Nutr.xml", fields: [], rows: [
    { NUTR_ID: "1", NUTR_FIELDNAME: "MS", NUTR_NOME: "Matéria seca", NUTR_UNIDARMZ: "0", NUTR_UNID_PTB: "%" },
    { NUTR_ID: "6", NUTR_FIELDNAME: "PB", NUTR_NOME: "Proteína bruta", NUTR_UNIDARMZ: "1", NUTR_UNID_PTB: "% MS" },
    { NUTR_ID: "34", NUTR_FIELDNAME: "PDR_PB", NUTR_NOME: "PDR (%PB)", NUTR_UNIDARMZ: "0", NUTR_UNID_PTB: "% PB" },
    { NUTR_ID: "90", NUTR_FIELDNAME: "ADICIONAL", NUTR_NOME: "Adicional", NUTR_UNIDARMZ: "1", NUTR_UNID_PTB: "mg/kg MS" },
  ] });
  return { fileName: "sample.R3F", tables };
}

describe("RLM normalized mapping", () => {
  it("supplements a partial embedded dictionary only with an explicit selection", () => {
    const archive = sample();
    archive.tables.find((table) => table.name === "Nutr.xml")!.rows = [{
      NUTR_ID: "90", NUTR_FIELDNAME: "ADICIONAL", NUTR_NOME: "Adicional do arquivo", NUTR_UNIDARMZ: "1", NUTR_UNID_PTB: "mg/kg MS",
    }];
    expect(mapRlmArchive(archive, "source-b").feeds).toHaveLength(0);
    const result = mapRlmArchive(archive, "source-b", rlmDictionary(sample(), "source-a"));
    expect(result.feeds).toHaveLength(1);
    expect(result.dictionaries.find((entry) => entry.id === "rlm:source-b:90")?.name).toBe("Adicional do arquivo");
  });

  it("requires an explicit positive intake when the source saved zero", () => {
    const mapped = mapRlmArchive(sample(), "source-a");
    mapped.diets[0].fields.RES_CONS = "0";
    expect(() => convertImportedDiet(mapped.diets[0], mapped.feeds)).toThrow("consumo de matéria seca positivo");
    expect(convertImportedDiet(mapped.diets[0], mapped.feeds, 5).dryMatterIntakeKg).toBe(5);
    expect(() => convertImportedDiet(mapped.diets[0], mapped.feeds, Number.NaN)).toThrow("consumo de matéria seca positivo");
    expect(mapped.diets[0].fields.RES_CONS).toBe("0");
  });

  it("preserves crude-protein equivalent from source values above 100", () => {
    const archive = sample();
    archive.tables.find((table) => table.name === "NutrAlim.xml")!.rows.find((row) => row.NUTR_ID === "6")!.NUTRALIM_QT = "282";
    const result = mapRlmArchive(archive, "source-a");
    expect(result.feeds[0].nutrients).toHaveProperty("crudeProtein", 282);
  });

  it("creates an editable recipe from known ingredients without copying biological predictions", () => {
    const mapped = mapRlmArchive(sample(), "source-a");
    const recipe = convertImportedDiet(mapped.diets[0], mapped.feeds);
    expect(recipe.ingredients).toEqual([{ feedId: mapped.feeds[0].id, percentage: 100 }]);
    expect(recipe).toMatchObject({ basis: "natural", batchKg: 1000, days: 1, heads: 1, dryMatterIntakeKg: 10, nutrientBounds: [] });
    expect(() => convertImportedDiet(mapped.diets[0], [])).toThrow("Importe primeiro");
  });

  it("does not map an EM field recorded as percent into Mcal/kg energy", () => {
    const archive = sample();
    const definition = archive.tables.find((table) => table.name === "Nutr.xml")!.rows.find((row) => row.NUTR_ID === "6")!;
    definition.NUTR_FIELDNAME = "EM";
    const mapped = mapRlmArchive(archive, "source-a");
    expect(mapped.feeds[0].nutrients).not.toHaveProperty("metabolizableEnergy");
    expect(mapped.feeds[0].nutrients).toHaveProperty("rlm:source-a:6", 18);
  });

  it("maps only compatible dry matter concentrations and converts source cost/t", () => {
    const result = mapRlmArchive(sample(), "source-a");
    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0]).toMatchObject({ dryMatterPct: 90, pricePerKgNatural: 0.8,
      nutrients: { crudeProtein: 18, "rlm:source-a:90": 1.25 } });
    expect(result.feeds[0].nutrients).not.toHaveProperty("rlm:source-a:34");
    expect(result.dictionaries).toHaveLength(4);
    expect(result.diets[0].fields.RES_CUSTODIA).toBe("12.5");
    expect(result.diets[0].tables[0].rows[0].ALIMDIETA_PROPMO).toBe("100");
  });

  it("requires an explicitly supplied dictionary when the export omits Nutr", () => {
    const archive = sample(false);
    const result = mapRlmArchive(archive, "source-b");
    expect(result.feeds).toEqual([]);
    expect(result.skippedFeeds).toBe(1);
    const selected = rlmDictionary(sample(), "source-a");
    const withSelection = mapRlmArchive(archive, "source-b", selected);
    expect(withSelection.feeds).toHaveLength(1);
    expect(withSelection.feeds[0].nutrients).toHaveProperty("rlm:source-b:90", 1.25);
    expect(withSelection.dictionaries[0].id).toBe("rlm:source-b:1");
  });

  it("namespaces equal RLM identifiers from distinct source files", () => {
    const first = mapRlmArchive(sample(), "source-a");
    const second = mapRlmArchive(sample(), "source-b");
    expect(first.feeds[0].id).not.toBe(second.feeds[0].id);
    expect(first.diets[0].id).not.toBe(second.diets[0].id);
  });

  it("leaves price pending when saved diets disagree on the ingredient price", () => {
    const archive = sample();
    archive.tables.find((table) => table.name === "AlimDieta.xml")!.rows.push({ DIETA_ID: "3", ALIM_ID: "5", ALIMDIETA_CUSTOMO: "900" });
    const result = mapRlmArchive(archive, "source-a");
    expect(result.feeds[0].pricePerKgNatural).toBe(0);
    expect(result.feeds[0].notes).toMatch(/Preço pendente/);
  });
});
