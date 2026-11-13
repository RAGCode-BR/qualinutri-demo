import type { DemoTables } from "../store/types";
import { emptyChecklistTables } from "../checklist/types";
import { isoDateTime } from "../store/ids";
import { buildCatalog } from "./catalog";
import { buildPayables } from "./finance";
import { buildCustomers, buildUsers } from "./people";
import { buildQuotes } from "./quotes";
import { mulberry32 } from "./random";
import { buildOperations } from "./operations";
import { buildChecklist } from "./checklist";
import { buildErp } from "./erp";
import { emptyErp } from "../erp/types";

/** Gera todos os dados fictícios da demonstração, sempre iguais para o mesmo dia. */
export function buildSeed(today: Date): DemoTables {
  const rng = mulberry32(20261113);
  const catalog = buildCatalog();
  const profiles = buildUsers(today);
  const { customers, properties } = buildCustomers(rng, today);
  const { quotes, items, lastNumber } = buildQuotes({ rng, today, catalog, customers, users: profiles });
  const operations = buildOperations({ rng, today, customers, properties, quotes, items, users: profiles });
  const tables: DemoTables = {
    catalog,
    profiles,
    customers,
    customer_properties: properties,
    quotes,
    quote_items: items,
    visits: operations.visits,
    vehicles: operations.vehicles,
    pallet_settings: operations.palletSettings,
    loads: operations.loads,
    load_items: operations.loadItems,
    catalog_imports: [{ id: "import-1", appliedAt: isoDateTime(new Date(today.getTime() - 43 * 86_400_000)), fileName: "tabela-precos-outubro.pdf", kind: "Tabela de preços", changes: 15, appliedBy: "Usuário Demonstração" }],
    payables: buildPayables(rng, today),
    checklist: emptyChecklistTables(),
    erp: emptyErp(),
    seq: { quote: lastNumber, load: operations.lastLoadNumber },
  };
  tables.checklist = buildChecklist({ rng, today, tables });
  tables.erp = buildErp({ rng, today, tables });
  return tables;
}
