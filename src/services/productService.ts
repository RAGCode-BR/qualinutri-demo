import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentTerm, Product } from "../types/commercial";
import type { Database } from "../types/database.types";
import { supabase } from "../lib/supabase";
import { CommercialDataServiceError, ensureData } from "./serviceError";

export type ProductCatalog = {
  paymentTermLabels: string[];
  paymentTermIds: string[];
  rationProducts: Product[];
  mineralProducts: Product[];
  products: Product[];
  /** Início de vigência da tabela de preços ativa (AAAA-MM-DD). */
  priceTableFrom: string;
  priceTableId: string;
  paymentTerms: PaymentTerm[];
};

export async function loadProductCatalog(client: SupabaseClient<Database>): Promise<ProductCatalog> {
  const [categoriesResult, productsResult, termsResult, tableResult] = await Promise.all([
    client.from("product_categories").select("id,name,display_order").eq("active", true).order("display_order"),
    client.from("products").select("id,category_id,name,package_weight_kg,display_order").eq("active", true).order("display_order"),
    client.from("payment_terms").select("id,code,label,description,average_days,display_order").eq("active", true).order("display_order"),
    client.from("price_tables").select("id,effective_from").eq("status", "active").limit(1).maybeSingle(),
  ]);

  const categories = ensureData(categoriesResult.data, categoriesResult.error);
  const productRows = ensureData(productsResult.data, productsResult.error);
  const terms = ensureData(termsResult.data, termsResult.error);
  const activeTable = ensureData(tableResult.data, tableResult.error);
  if (!activeTable || categories.length === 0 || productRows.length === 0 || terms.length === 0) {
    throw new CommercialDataServiceError();
  }

  const pricesResult = await client
    .from("product_prices")
    .select("product_id,payment_term_id,unit_price")
    .eq("price_table_id", activeTable.id);
  const prices = ensureData(pricesResult.data, pricesResult.error);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const priceByProductAndTerm = new Map(
    prices.map((price) => [`${price.product_id}:${price.payment_term_id}`, Number(price.unit_price)]),
  );

  // Produto sem categoria ou sem preço para algum prazo fica fora da lista,
  // em vez de derrubar o catálogo inteiro.
  const products = productRows.flatMap<Product>((product) => {
    const group = categoryNames.get(product.category_id);
    const productPrices = terms.map((term) => priceByProductAndTerm.get(`${product.id}:${term.id}`));
    if (!group || productPrices.some((price) => price === undefined)) {
      console.warn(`Produto ignorado por dados incompletos: ${product.name}`);
      return [];
    }
    return [{
      id: product.id,
      group,
      name: product.name,
      weightKg: Number(product.package_weight_kg),
      prices: productPrices as number[],
    }];
  });

  const rationGroups = new Set(["Rações", "Energéticos", "Aves", "Suínos"]);
  return {
    paymentTermLabels: terms.map((term) => term.label),
    paymentTermIds: terms.map((term) => term.id),
    rationProducts: products.filter((product) => rationGroups.has(product.group)),
    mineralProducts: products.filter((product) => !rationGroups.has(product.group)),
    products,
    priceTableFrom: activeTable.effective_from,
    priceTableId: activeTable.id,
    paymentTerms: terms.map((term) => ({ id: term.code, label: term.label, condition: term.average_days === 0 ? "À vista" : `${term.average_days} dias`, notes: term.description })),
  };
}

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

function requireProductClient() {
  if (!supabase) throw new ProductServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

export async function updateProduct(productId: string, update: ProductUpdate): Promise<void> {
  const { error } = await requireProductClient().rpc("update_product", {
    p_product_id: productId,
    p_name: update.name,
    p_package_weight_kg: update.weightKg,
    p_prices: update.prices.map((price) => ({ payment_term_id: price.paymentTermId, unit_price: price.unitPrice })),
  });
  if (error) throw new ProductServiceError("Não foi possível salvar o produto. Confira os valores e tente novamente.");
}

export async function deactivateProduct(productId: string): Promise<void> {
  const { error } = await requireProductClient().rpc("deactivate_product", { p_product_id: productId });
  if (error) throw new ProductServiceError("Não foi possível excluir o produto.");
}
