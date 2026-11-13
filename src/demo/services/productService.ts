import type { PaymentTerm, Product } from "../../types/commercial";
import { clone, db, simulateLatency } from "../store/db";
import type { DemoCatalog } from "../store/types";
import { logCatalogChange, requireAdmin } from "./common";

export type ProductCatalog = {
  paymentTermLabels: string[];
  paymentTermIds: string[];
  rationProducts: Product[];
  mineralProducts: Product[];
  products: Product[];
  priceTableFrom: string;
  priceTableId: string;
  paymentTerms: PaymentTerm[];
};

export type ProductUpdate = {
  name: string;
  weightKg: number;
  prices: Array<{ paymentTermId: string; unitPrice: number }>;
};

export class ProductServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductServiceError";
  }
}

export function catalogProducts(catalog: DemoCatalog): ProductCatalog {
  return {
    paymentTermLabels: [...catalog.paymentTermLabels],
    paymentTermIds: [...(catalog.paymentTermIds ?? [])],
    rationProducts: catalog.rationProducts,
    mineralProducts: catalog.mineralProducts,
    products: catalog.products,
    priceTableFrom: catalog.priceTableFrom ?? "",
    priceTableId: catalog.priceTableId ?? "",
    paymentTerms: catalog.paymentTerms,
  };
}

export async function loadProductCatalog(_client?: unknown): Promise<ProductCatalog> {
  return simulateLatency(() => clone(catalogProducts(db.read().catalog)));
}

function rebuild(catalog: DemoCatalog) {
  catalog.products = [...catalog.rationProducts, ...catalog.mineralProducts];
}

export async function updateProduct(productId: string, update: ProductUpdate): Promise<void> {
  requireAdmin(ProductServiceError);
  const name = update.name.trim();
  if (!name || !(update.weightKg > 0) || update.prices.some((price) => !(price.unitPrice > 0))) {
    throw new ProductServiceError("Não foi possível salvar o produto. Confira os valores e tente novamente.");
  }
  await simulateLatency(null);
  let previousName = "";
  db.write(({ catalog }) => {
    for (const list of [catalog.rationProducts, catalog.mineralProducts]) {
      const index = list.findIndex((product) => product.id === productId);
      if (index < 0) continue;
      const current = list[index];
      previousName = current.name;
      const ids = catalog.paymentTermIds ?? [];
      const prices = ids.map((termId, termIndex) => update.prices.find((price) => price.paymentTermId === termId)?.unitPrice ?? current.prices[termIndex]);
      list[index] = { ...current, name, weightKg: update.weightKg, prices };
    }
    rebuild(catalog);
  });
  if (!previousName) throw new ProductServiceError("Produto não encontrado.");
  logCatalogChange(`Produto "${previousName}" atualizado`);
}

export async function deactivateProduct(productId: string): Promise<void> {
  requireAdmin(ProductServiceError);
  await simulateLatency(null);
  let removed = "";
  db.write(({ catalog }) => {
    for (const key of ["rationProducts", "mineralProducts"] as const) {
      const product = catalog[key].find((item) => item.id === productId);
      if (product) removed = product.name;
      catalog[key] = catalog[key].filter((item) => item.id !== productId);
    }
    rebuild(catalog);
  });
  if (!removed) throw new ProductServiceError("Não foi possível excluir o produto.");
  logCatalogChange(`Produto "${removed}" excluído`);
}
