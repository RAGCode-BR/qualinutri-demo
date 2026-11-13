import type { CommercialData } from "../../types/commercial";

/**
 * Lê as linhas de texto de um PDF de tabela (preços, descontos, frete) e monta
 * uma proposta de atualização comparada com o catálogo atual. Não depende de
 * posições fixas: itens cadastrados são reconhecidos pelo nome e os números
 * que vêm depois do nome são os valores.
 */

type Catalog = Pick<
  CommercialData,
  "products" | "paymentTermLabels" | "discountLines" | "juaraFreightRates" | "regionalFreightRates"
>;

export type PriceChange = { termIndex: number; current: number; next: number };

export type ProductUpdate = {
  id: string;
  name: string;
  group: string;
  weight: { current: number; next: number } | null;
  prices: PriceChange[];
  /** Preços completos lidos do PDF, na ordem dos prazos. */
  nextPrices: number[];
  nextWeight: number;
};

export type NewProduct = {
  name: string;
  weightKg: number | null;
  prices: number[];
  /** Categoria sugerida pelo título de seção mais próximo no PDF. */
  category: string | null;
  line: string;
};

export type DiscountUpdate = { id: string; name: string; current: number; next: number };

export type FreightField = "bag25" | "bag30" | "bag40" | "closedPerTon" | "fractionalPerTon";

export type FreightUpdate = {
  table: "juara" | "regional";
  id: string;
  label: string;
  changes: Array<{ field: FreightField; current: number | null; next: number | null }>;
  /** Valores completos depois da atualização, para gravar a faixa inteira. */
  nextRates: Partial<Record<FreightField, number | null>>;
};

export type CatalogUpdateProposal = {
  productUpdates: ProductUpdate[];
  newProducts: NewProduct[];
  /** Produtos cadastrados que não apareceram no PDF (só aviso). */
  missingProducts: Array<{ id: string; name: string; group: string }>;
  discountUpdates: DiscountUpdate[];
  freightUpdates: FreightUpdate[];
  /** Quantos itens foram encontrados no PDF com os mesmos valores do sistema. */
  unchanged: { products: number; discounts: number; freight: number };
  /** Linhas com números que não foram usadas, para conferência. */
  unrecognizedLines: string[];
};

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Número no formato brasileiro (1.234,56), com ponto decimal (1234.56) ou inteiro. */
const NUMBER_PATTERN = /(?<![\w/])(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+\.\d{1,2}(?!\d)|\d+)(?![\w/])/g;

type NumberToken = { value: number; decimal: boolean; percent: boolean };

export function readNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const raw = match[0];
    const after = text.slice((match.index ?? 0) + raw.length);
    const brazilian = raw.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(raw);
    const value = brazilian ? Number(raw.replace(/\./g, "").replace(",", ".")) : Number(raw);
    if (!Number.isFinite(value)) continue;
    tokens.push({ value, decimal: /[.,]\d/.test(raw), percent: /^\s*%/.test(after) });
  }
  return tokens;
}

const same = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.005;

type Entry =
  | { kind: "product"; key: string; index: number }
  | { kind: "discount"; key: string; index: number }
  | { kind: "juara"; key: string; index: number }
  | { kind: "regional"; key: string; index: number };

/** Lê preços (com casas decimais) no fim da linha e, antes deles, o peso da saca. */
function readPriceRun(tokens: NumberToken[], termCount: number) {
  if (tokens.length < termCount) return null;
  const prices = tokens.slice(-termCount);
  if (prices.some((token) => !token.decimal || token.percent)) return null;
  const before = tokens[tokens.length - termCount - 1];
  const weight = before && !before.decimal && before.value >= 5 && before.value <= 100 ? before.value : null;
  return { prices: prices.map((token) => token.value), weight, used: termCount + (weight === null ? 0 : 1) };
}

/** Linha do PDF: texto simples (testes) ou com a posição de cada pedaço. */
export type ParserLine = string | { text: string; pieces: Array<{ text: string; x: number }> };

/** Junta linhas seguidas numa só, ordenando os pedaços pela coluna (posição horizontal). */
function mergeLines(lines: ParserLine[]) {
  if (lines.length === 1) return typeof lines[0] === "string" ? lines[0] : lines[0].text;
  const pieces = lines.flatMap((line, order) =>
    typeof line === "string"
      ? [{ text: line, x: 0, order }]
      : line.pieces.map((piece) => ({ ...piece, order })));
  return pieces
    .sort((a, b) => a.x - b.x || a.order - b.order)
    .map((piece) => piece.text)
    .join(" ");
}

const cleanLine = (text: string) => text.replace(/R\$\s*/g, "").replace(/\s+/g, " ").trim();

/** Até quantas linhas seguidas uma linha de tabela pode ocupar quando o texto quebra na célula. */
const MAX_WRAPPED_LINES = 3;

export function parseCatalogUpdate(lines: ParserLine[], catalog: Catalog): CatalogUpdateProposal {
  const termCount = catalog.paymentTermLabels.length;
  const entries: Entry[] = [
    ...catalog.products.map((product, index) => ({ kind: "product" as const, key: normalizeText(product.name), index })),
    ...catalog.discountLines.flatMap((line, index) =>
      line.percentage === null ? [] : [{ kind: "discount" as const, key: normalizeText(line.name), index }]),
    ...catalog.juaraFreightRates.map((rate, index) => ({ kind: "juara" as const, key: normalizeText(rate.distance), index })),
    ...catalog.regionalFreightRates.map((rate, index) => ({ kind: "regional" as const, key: normalizeText(rate.location), index })),
  ].sort((a, b) => b.key.length - a.key.length);

  const categories = [...new Set(catalog.products.map((product) => product.group))];
  const categoryByKey = new Map(categories.map((category) => [normalizeText(category), category]));

  const productUpdates = new Map<number, ProductUpdate>();
  const seenProducts = new Set<number>();
  const newProducts = new Map<string, NewProduct>();
  const discountUpdates = new Map<number, DiscountUpdate>();
  const seenDiscounts = new Set<number>();
  const freightUpdates = new Map<string, FreightUpdate>();
  const seenFreight = new Set<string>();
  const unrecognizedLines: string[] = [];
  let currentCategory: string | null = null;

  /** Item cadastrado cujo nome aparece no texto, seguido dos valores. */
  function findEntry(normalized: string) {
    // O nome só conta se depois dele vierem números, não mais palavras:
    // "Quali Engorda 160 RM Plus" não pode ser lido como "Quali Engorda 160 RM".
    return entries.find((candidate) => {
      const start = normalized.indexOf(candidate.key);
      if (candidate.key.length === 0 || start < 0) return false;
      const rest = normalized.slice(start + candidate.key.length);
      const beforeFirstNumber = rest.split(/\d/)[0];
      return candidate.kind !== "product" || !/[a-z]/.test(beforeFirstNumber);
    });
  }

  /** Tenta ler um item já cadastrado. Devolve true se o texto foi usado. */
  function readKnown(text: string): boolean {
    const normalized = normalizeText(cleanLine(text));
    const entry = findEntry(normalized);
    if (!entry) return false;
    const position = normalized.indexOf(entry.key) + entry.key.length;
    const tokens = readNumbers(normalized.slice(position));

    if (entry.kind === "product") {
      if (seenProducts.has(entry.index)) return false;
      const run = readPriceRun(tokens, termCount);
      if (!run) return false;
      seenProducts.add(entry.index);
      const product = catalog.products[entry.index];
      const prices = run.prices
        .map((next, termIndex) => ({ termIndex, current: product.prices[termIndex], next }))
        .filter((change) => !same(change.current, change.next));
      const nextWeight = run.weight ?? product.weightKg;
      const weight = same(product.weightKg, nextWeight) ? null : { current: product.weightKg, next: nextWeight };
      if (product.id && (prices.length > 0 || weight)) {
        productUpdates.set(entry.index, {
          id: product.id, name: product.name, group: product.group, weight, prices,
          nextPrices: run.prices, nextWeight,
        });
      }
      return true;
    }

    if (entry.kind === "discount") {
      if (seenDiscounts.has(entry.index)) return false;
      const percent = tokens.find((token) => token.percent);
      if (!percent) return false;
      seenDiscounts.add(entry.index);
      const discount = catalog.discountLines[entry.index];
      if (discount.id && !same(discount.percentage, percent.value)) {
        discountUpdates.set(entry.index, { id: discount.id, name: discount.name, current: discount.percentage ?? 0, next: percent.value });
      }
      return true;
    }

    if (entry.kind === "juara") {
      if (seenFreight.has(`j${entry.index}`) || tokens.length < 4) return false;
      seenFreight.add(`j${entry.index}`);
      const rate = catalog.juaraFreightRates[entry.index];
      const [bag25, bag30, bag40, closedPerTon] = tokens.slice(-4).map((token) => token.value);
      const nextRates = { bag25, bag30, bag40, closedPerTon };
      const changes = (Object.keys(nextRates) as Array<keyof typeof nextRates>)
        .filter((field) => !same(rate[field], nextRates[field]))
        .map((field) => ({ field, current: rate[field], next: nextRates[field] }));
      if (rate.id && changes.length > 0) {
        freightUpdates.set(`j${entry.index}`, { table: "juara", id: rate.id, label: rate.distance, changes, nextRates });
      }
      return true;
    }

    if (seenFreight.has(`r${entry.index}`) || tokens.length < 1) return false;
    seenFreight.add(`r${entry.index}`);
    const rate = catalog.regionalFreightRates[entry.index];
    // Um valor só: a cidade aceita apenas carga fechada.
    const values = tokens.slice(-2).map((token) => token.value);
    const nextRates = values.length === 2
      ? { fractionalPerTon: values[0], closedPerTon: values[1] }
      : { fractionalPerTon: null, closedPerTon: values[0] };
    const changes = (Object.keys(nextRates) as Array<keyof typeof nextRates>)
      .filter((field) => !same(rate[field], nextRates[field]))
      .map((field) => ({ field, current: rate[field], next: nextRates[field] }));
    if (rate.id && changes.length > 0) {
      freightUpdates.set(`r${entry.index}`, { table: "regional", id: rate.id, label: rate.location, changes, nextRates });
    }
    return true;
  }

  /** Linha com nome seguido de um preço por prazo: produto que não existe no sistema. */
  function readNew(text: string): boolean {
    const line = cleanLine(text);
    // Só um produto cadastrado impede: um nome novo pode conter o nome de um desconto ou cidade.
    if (findEntry(normalizeText(line))?.kind === "product") return false;
    const run = readPriceRun(readNumbers(line), termCount);
    if (!run) return false;
    const name = stripTrailingNumbers(line, run.used);
    const key = normalizeText(name);
    if (name.length < 3 || !/[a-zà-ú]/i.test(name) || newProducts.has(key)) return false;
    newProducts.set(key, { name, weightKg: run.weight, prices: run.prices, category: currentCategory, line });
    return true;
  }

  const lineText = (line: ParserLine) => (typeof line === "string" ? line : line.text).replace(/\s+/g, " ").trim();
  /** Linha que pode completar outra: não traz o nome de outro item nem é título de seção. */
  const canContinue = (line: ParserLine) => {
    const normalized = normalizeText(cleanLine(lineText(line)));
    return !categoryByKey.has(normalized) && !entries.some((entry) => entry.key.length > 0 && normalized.includes(entry.key));
  };

  const consumed = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) continue;
    const text = lineText(lines[index]);
    if (!text) continue;

    const category = categoryByKey.get(normalizeText(cleanLine(text)).replace(/[:\-–]+$/, "").trim());
    if (category) {
      currentCategory = category;
      continue;
    }

    // Janelas de 1 a 3 linhas: o texto de uma célula pode quebrar em várias linhas.
    const windows: number[][] = [];
    for (let size = 1; size <= MAX_WRAPPED_LINES && index + size <= lines.length; size += 1) {
      const range = Array.from({ length: size }, (_, offset) => index + offset);
      if (size > 1 && (consumed.has(range[size - 1]) || !canContinue(lines[range[size - 1]]))) break;
      windows.push(range);
    }
    // Primeiro tenta itens cadastrados em todas as janelas; só depois, produto novo.
    const used = windows.find((range) => readKnown(mergeLines(range.map((position) => lines[position]))))
      ?? windows.find((range) => readNew(mergeLines(range.map((position) => lines[position]))));
    if (used) {
      used.forEach((position) => consumed.add(position));
      continue;
    }

    if (readNumbers(text).length > 0) unrecognizedLines.push(text);
  }

  const missingProducts = catalog.products
    .map((product, index) => ({ product, index }))
    .filter(({ product, index }) => product.id && !seenProducts.has(index))
    .map(({ product }) => ({ id: product.id!, name: product.name, group: product.group }));

  return {
    productUpdates: [...productUpdates.values()],
    newProducts: [...newProducts.values()],
    missingProducts,
    discountUpdates: [...discountUpdates.values()],
    freightUpdates: [...freightUpdates.values()],
    unchanged: {
      products: seenProducts.size - productUpdates.size,
      discounts: seenDiscounts.size - discountUpdates.size,
      freight: seenFreight.size - freightUpdates.size,
    },
    unrecognizedLines,
  };
}

/** Remove da linha os últimos `count` números, deixando só o nome. */
function stripTrailingNumbers(line: string, count: number) {
  let result = line;
  for (let removed = 0; removed < count; removed += 1) {
    result = result.replace(/\s*(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+\.\d{1,2}|\d+)\s*$/, "");
  }
  return result.replace(/[\s:–-]+$/, "").trim();
}
