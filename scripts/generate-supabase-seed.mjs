import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const snapshot = JSON.parse(readFileSync("src/data/commercial-snapshot.json", "utf8"));
const { TERMS, LINES, PROD, FJUARA, FREG, POLICY } = snapshot;
if (!TERMS || !LINES || !PROD || !FJUARA || !FREG || !POLICY) {
  throw new Error("O snapshot comercial não contém todas as coleções esperadas.");
}

const uuid = (key) => {
  const hex = createHash("sha256").update(`qualinutri:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

const slug = (value) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const sqlString = (value) => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const number = (value, decimals = 2) => Number(value).toFixed(decimals);
const tuple = (...values) => `  (${values.join(", ")})`;
const insert = (table, columns, rows) => [
  `insert into public.${table} (${columns.join(", ")}) values`,
  `${rows.join(",\n")}\non conflict do nothing;`,
].join("\n");
const uuidList = (ids) => Array.from(ids, sqlString).join(", ");

const categoryNames = [...new Set(PROD.map(([group]) => group))];
const categoryIds = new Map(categoryNames.map((name) => [name, uuid(`category:${name}`)]));
const productIds = new Map(PROD.map(([, name]) => [name, uuid(`product:${name}`)]));
const termCodes = ["cash", "net-30", "net-45", "net-60", "net-75", "net-90"];
const termDays = [0, 30, 45, 60, 75, 90];
const termIds = termCodes.map((code) => uuid(`payment-term:${code}`));
const priceTableId = uuid("price-table:factory-prices:2026-09-03");
const discountTableId = uuid("discount-table:commercial-discounts:2026-02-24");
const juaraTableId = uuid("freight-table:juara:2026-05-06");
const regionalTableId = uuid("freight-table:regional:2026-05-06");
const handlingTableId = uuid("handling-table:handling:2026-05-06");
const policyVersionId = uuid("policy:1.2");

const statements = [
  "-- Gerado a partir de src/data/commercial-snapshot.json.",
  "-- Execute `npm run db:seed:generate` para regenerar este arquivo.",
  "begin;",
  insert("product_categories", ["id", "code", "name", "display_order"], categoryNames.map((name, index) => tuple(
    sqlString(categoryIds.get(name)), sqlString(slug(name)), sqlString(name), index,
  ))),
  insert("products", ["id", "category_id", "code", "name", "package_weight_kg", "display_order"], PROD.map(([group, name, weight], index) => tuple(
    sqlString(productIds.get(name)), sqlString(categoryIds.get(group)), sqlString(slug(name)), sqlString(name), number(weight, 3), index,
  ))),
  insert("payment_terms", ["id", "code", "label", "description", "average_days", "display_order"], TERMS.map((label, index) => tuple(
    sqlString(termIds[index]), sqlString(termCodes[index]), sqlString(label), sqlString(label), termDays[index], index,
  ))),
  insert("price_tables", ["id", "code", "name", "version", "effective_from", "status", "notes", "activated_at"], [tuple(
    sqlString(priceTableId), sqlString("factory-prices"), sqlString("Tabela de preços da fábrica"), sqlString("2026-09-03"), sqlString("2026-09-03"), sqlString("active"), sqlString("Preços em R$ por saca, preservados do sistema legado."), "now()",
  )]),
  insert("product_prices", ["id", "price_table_id", "product_id", "payment_term_id", "unit_price"], PROD.flatMap(([, name, , prices]) => prices.map((price, termIndex) => tuple(
    sqlString(uuid(`price:${name}:${termCodes[termIndex]}`)), sqlString(priceTableId), sqlString(productIds.get(name)), sqlString(termIds[termIndex]), number(price),
  )))),
  insert("discount_tables", ["id", "code", "name", "version", "effective_from", "status"], [tuple(
    sqlString(discountTableId), sqlString("commercial-discounts"), sqlString("Descontos comerciais"), sqlString("2026-02-24"), sqlString("2026-02-24"), sqlString("active"),
  )]),
  insert("discount_rules", ["id", "discount_table_id", "code", "name", "percentage", "allows_custom_percentage", "rule_kind", "display_order"], [
    ...LINES.map(({ n: name, p: percentage }, index) => {
      const code = slug(name);
      const custom = percentage == null;
      return tuple(sqlString(uuid(`discount:${code}`)), sqlString(discountTableId), sqlString(code), sqlString(name), custom ? "null" : number(percentage, 4), custom, sqlString(custom ? "custom" : "line"), index);
    }),
    tuple(sqlString(uuid("discount:anticipated-payment")), sqlString(discountTableId), sqlString("anticipated-payment"), sqlString("À vista antecipado"), number(1.5, 4), false, sqlString("anticipated"), LINES.length),
  ]),
  insert("freight_tables", ["id", "code", "name", "scope_type", "version", "effective_from", "status"], [
    tuple(sqlString(juaraTableId), sqlString("juara"), sqlString("Juara"), sqlString("distance"), sqlString("2026-05-06"), sqlString("2026-05-06"), sqlString("active")),
    tuple(sqlString(regionalTableId), sqlString("regional"), sqlString("Regional"), sqlString("location"), sqlString("2026-05-06"), sqlString("2026-05-06"), sqlString("active")),
  ]),
];

const juaraRanges = [[0, 25], [26, 45], [46, 70], [71, 100], [101, 150], [151, 190]];
const juaraZones = FJUARA.map(([label], index) => ({
  id: uuid(`freight-zone:juara:${label}`), label, code: slug(label), index,
}));
const regionalZones = FREG.map(([label], index) => ({
  id: uuid(`freight-zone:regional:${label}`), label, code: slug(label), index,
}));

statements.push(
  insert("freight_zones", ["id", "freight_table_id", "code", "label", "minimum_distance_km", "maximum_distance_km", "minimum_weight_kg", "display_order"], [
    ...juaraZones.map((zone, index) => tuple(sqlString(zone.id), sqlString(juaraTableId), sqlString(zone.code), sqlString(zone.label), number(juaraRanges[index][0]), number(juaraRanges[index][1]), number(1000, 3), index)),
    ...regionalZones.map((zone) => {
      const minimumWeight = zone.label.includes("10 t") ? 10000 : zone.label.includes("9 t") ? 9000 : null;
      return tuple(sqlString(zone.id), sqlString(regionalTableId), sqlString(zone.code), sqlString(zone.label), "null", "null", minimumWeight == null ? "null" : number(minimumWeight, 3), zone.index);
    }),
  ]),
  insert("freight_rates", ["id", "freight_zone_id", "load_type", "rate_basis", "bag_weight_kg", "amount"], [
    ...FJUARA.flatMap(([, bag25, bag30, bag40, closed], index) => {
      const zone = juaraZones[index];
      return [
        tuple(sqlString(uuid(`freight-rate:${zone.id}:fractional:25`)), sqlString(zone.id), sqlString("fractional"), sqlString("per_bag"), number(25, 3), number(bag25)),
        tuple(sqlString(uuid(`freight-rate:${zone.id}:fractional:30`)), sqlString(zone.id), sqlString("fractional"), sqlString("per_bag"), number(30, 3), number(bag30)),
        tuple(sqlString(uuid(`freight-rate:${zone.id}:fractional:40`)), sqlString(zone.id), sqlString("fractional"), sqlString("per_bag"), number(40, 3), number(bag40)),
        tuple(sqlString(uuid(`freight-rate:${zone.id}:closed:ton`)), sqlString(zone.id), sqlString("closed"), sqlString("per_ton"), "null", number(closed)),
      ];
    }),
    ...FREG.flatMap(([, fractional, closed], index) => {
      const zone = regionalZones[index];
      return [
        ...(fractional == null ? [] : [tuple(sqlString(uuid(`freight-rate:${zone.id}:fractional:ton`)), sqlString(zone.id), sqlString("fractional"), sqlString("per_ton"), "null", number(fractional))]),
        tuple(sqlString(uuid(`freight-rate:${zone.id}:closed:ton`)), sqlString(zone.id), sqlString("closed"), sqlString("per_ton"), "null", number(closed)),
      ];
    }),
  ]),
  insert("handling_rate_tables", ["id", "code", "name", "version", "amount_per_ton", "effective_from", "status"], [tuple(
    sqlString(handlingTableId), sqlString("handling"), sqlString("Descarga"), sqlString("2026-05-06"), number(40), sqlString("2026-05-06"), sqlString("active"),
  )]),
  insert("commercial_policy_versions", ["id", "version", "title", "effective_from", "status"], [tuple(
    sqlString(policyVersionId), sqlString("1.2"), sqlString("Política Comercial da Fábrica"), "null", sqlString("active"),
  )]),
  insert("commercial_policy_sections", ["id", "policy_version_id", "section_number", "title", "content", "is_pending", "display_order"], POLICY.map(([heading, content], index) => {
    const match = heading.match(/^(\d+)\.\s*(.*)$/);
    return tuple(sqlString(uuid(`policy-section:1.2:${index + 1}`)), sqlString(policyVersionId), sqlString(match?.[1] ?? String(index + 1)), sqlString(match?.[2] ?? heading), sqlString(content), content.includes("class='todo'"), index);
  })),
  `do $$
declare
  check_row record;
begin
  for check_row in
    select 'categorias' as entity, ${categoryNames.length}::bigint as expected, count(*) as actual
      from public.product_categories where id in (${uuidList(categoryIds.values())})
    union all select 'produtos', ${PROD.length}, count(*) from public.products where id in (${uuidList(productIds.values())})
    union all select 'condicoes de pagamento', ${TERMS.length}, count(*) from public.payment_terms where id in (${uuidList(termIds)})
    union all select 'precos', ${PROD.length * TERMS.length}, count(*) from public.product_prices where price_table_id = ${sqlString(priceTableId)}
    union all select 'regras de desconto', ${LINES.length + 1}, count(*) from public.discount_rules where discount_table_id = ${sqlString(discountTableId)}
    union all select 'faixas Juara', ${FJUARA.length}, count(*) from public.freight_zones where freight_table_id = ${sqlString(juaraTableId)}
    union all select 'tarifas Juara', ${FJUARA.length * 4}, count(*) from public.freight_rates r join public.freight_zones z on z.id = r.freight_zone_id where z.freight_table_id = ${sqlString(juaraTableId)}
    union all select 'faixas regionais', ${FREG.length}, count(*) from public.freight_zones where freight_table_id = ${sqlString(regionalTableId)}
    union all select 'tarifas regionais', ${FREG.reduce((total, [, fractional]) => total + (fractional == null ? 1 : 2), 0)}, count(*) from public.freight_rates r join public.freight_zones z on z.id = r.freight_zone_id where z.freight_table_id = ${sqlString(regionalTableId)}
    union all select 'taxa de descarga', 1, count(*) from public.handling_rate_tables where id = ${sqlString(handlingTableId)}
    union all select 'versao da politica', 1, count(*) from public.commercial_policy_versions where id = ${sqlString(policyVersionId)}
    union all select 'secoes da politica', ${POLICY.length}, count(*) from public.commercial_policy_sections where policy_version_id = ${sqlString(policyVersionId)}
  loop
    if check_row.actual <> check_row.expected then
      raise exception 'Seed inconsistente em %: esperado %, encontrado %', check_row.entity, check_row.expected, check_row.actual;
    end if;
  end loop;
end;
$$;`,
  "commit;",
  "",
);

writeFileSync("supabase/seed.sql", statements.join("\n\n"));

console.log(JSON.stringify({
  categories: categoryNames.length,
  products: PROD.length,
  paymentTerms: TERMS.length,
  prices: PROD.length * TERMS.length,
  selectableDiscountOptions: LINES.length,
  anticipatedDiscountRules: 1,
  juaraZones: FJUARA.length,
  juaraRates: FJUARA.length * 4,
  regionalZones: FREG.length,
  regionalRates: FREG.reduce((total, [, fractional]) => total + (fractional == null ? 1 : 2), 0),
  handlingRates: 1,
  policyVersions: 1,
  policySections: POLICY.length,
}, null, 2));
