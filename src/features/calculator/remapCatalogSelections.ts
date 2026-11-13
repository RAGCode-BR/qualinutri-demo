import type { CommercialData } from "../../types/commercial";
import type { FreightFormState, ItemFormState, OrderItem } from "./calculator.types";

type Catalog = Pick<CommercialData, "products" | "paymentTermLabels" | "discountLines">;

function remapIndex<T>(index: string, previous: readonly T[], next: readonly T[], key: (entry: T) => string) {
  if (index === "") return "";
  const entry = previous[Number(index)];
  if (!entry) return "";
  const found = next.findIndex((candidate) => key(candidate) === key(entry));
  return found >= 0 ? String(found) : "";
}

/**
 * A calculadora guarda produto, prazo e linha de desconto pela posição na
 * lista. Quando o catálogo é atualizado, as posições podem mudar; aqui cada
 * seleção é reencontrada pelo nome. Valores já adicionados ao pedido (preço,
 * peso, percentual) não mudam.
 */
export function remapCatalogSelections(
  previous: Catalog,
  next: Catalog,
  items: OrderItem[],
  itemForm: ItemFormState,
): { items: OrderItem[]; itemForm: ItemFormState } {
  const productKey = (product: Catalog["products"][number]) => product.name;
  const termKey = (term: string) => term;
  const lineKey = (line: Catalog["discountLines"][number]) => line.name;
  const customLineIndex = next.discountLines.findIndex((line) => line.percentage === null);

  const remappedItems = items.map((item) => {
    let discountLineIndex = remapIndex(item.discountLineIndex, previous.discountLines, next.discountLines, lineKey);
    let customDiscountPercentage = item.customDiscountPercentage;
    // A linha do item foi excluída: o item mantém o percentual como personalizado.
    if (discountLineIndex === "" && item.discountLineIndex !== "" && item.lineDiscountPercentage > 0 && customLineIndex >= 0) {
      discountLineIndex = String(customLineIndex);
      customDiscountPercentage = item.lineDiscountPercentage;
    }
    return {
      ...item,
      productIndex: remapIndex(item.productIndex, previous.products, next.products, productKey),
      paymentTermIndex: remapIndex(item.paymentTermIndex, previous.paymentTermLabels, next.paymentTermLabels, termKey),
      discountLineIndex,
      customDiscountPercentage,
    };
  });

  return {
    items: remappedItems,
    itemForm: {
      ...itemForm,
      productIndex: remapIndex(itemForm.productIndex, previous.products, next.products, productKey),
      paymentTermIndex: remapIndex(itemForm.paymentTermIndex, previous.paymentTermLabels, next.paymentTermLabels, termKey),
      discountLineIndex: remapIndex(itemForm.discountLineIndex, previous.discountLines, next.discountLines, lineKey),
    },
  };
}

type FreightCatalog = Pick<CommercialData, "juaraFreightRates" | "regionalFreightRates">;

/** A faixa ou cidade de frete escolhida é reencontrada pelo nome; se sumiu, o frete é desmarcado. */
export function remapFreightSelection(previous: FreightCatalog, next: FreightCatalog, form: FreightFormState): FreightFormState {
  if (form.table === "" || form.rangeIndex === "") return form;
  const rangeIndex = form.table === "juara"
    ? remapIndex(form.rangeIndex, previous.juaraFreightRates, next.juaraFreightRates, (rate) => rate.distance)
    : remapIndex(form.rangeIndex, previous.regionalFreightRates, next.regionalFreightRates, (rate) => rate.location);
  return rangeIndex === "" ? { ...form, table: "", rangeIndex: "" } : { ...form, rangeIndex };
}
