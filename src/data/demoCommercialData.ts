import { buildCatalog } from "../demo/seed/catalog";
import type { CommercialData } from "../types/commercial";

/** Catálogo fictício da demonstração (o mesmo que o banco local semeia). */
export const demoCommercialData: CommercialData = buildCatalog();
