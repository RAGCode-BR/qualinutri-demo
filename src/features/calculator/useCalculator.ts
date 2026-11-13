import { useEffect, useMemo, useRef, useState } from "react";
import { hasPaymentModeChoice, type PaymentMode } from "../../domain/payment/paymentTerm";
import { useCommercialData } from "../../app/CommercialDataProvider";
import {
  calculateCurrentOrder,
  type FreightSelection,
} from "../../domain";
import type { FreightFormState, ItemFormState, OrderItem } from "./calculator.types";
import { quoteToCalculatorState } from "./quoteToCalculatorState";
import { remapCatalogSelections, remapFreightSelection } from "./remapCatalogSelections";
import type { SavedQuoteDetail } from "../../services/quoteService";
import type { QuoteCustomerSnapshot } from "../../types/customer";

/** Orçamento salvo aberto para edição na calculadora. */
export type EditingQuote = {
  id: string;
  number: number;
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerDocument: string | null;
};

const initialItemForm: ItemFormState = {
  productIndex: "",
  paymentTermIndex: "",
  tableUnitPrice: "",
  discountLineIndex: "",
  customDiscountPercentage: "",
  quantity: "1",
  // Só usado no preço manual; precisa ser escolhido (sem peso presumido).
  bagWeightKg: "",
};

const initialFreightForm: FreightFormState = {
  table: "",
  rangeIndex: "",
  loadType: "fractional",
};

function numberOrZero(value: string) {
  return Number.parseFloat(value) || 0;
}

export function useCalculator() {
  const { data } = useCommercialData();
  const { discountLines, juaraFreightRates, products, regionalFreightRates } = data;
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);
  const [freightForm, setFreightForm] = useState<FreightFormState>(initialFreightForm);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [anticipatedPayment, setAnticipatedPayment] = useState(false);
  const [handlingEnabled, setHandlingEnabled] = useState(false);
  const [handlingRatePerTon, setHandlingRatePerTon] = useState(String(data.handlingRatePerTon));
  const [editingQuote, setEditingQuote] = useState<EditingQuote | null>(null);
  const [customer, setCustomer] = useState<QuoteCustomerSnapshot | null>(null);
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  /** Prazo de pagamento do orçamento inteiro; define a coluna de preço dos produtos. */
  const [paymentTermIndex, setPaymentTermIndex] = useState("");
  // Coluna "à vista" da tabela, usada até o prazo ser escolhido.
  const baseTermIndex = Math.max(0, data.paymentTermLabels.findIndex((label) => label.trim().toLowerCase() === "à vista"));
  const [itemError, setItemError] = useState<{ field: "tablePrice" | "quantity" | "bagWeight"; message: string } | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ item: OrderItem; index: number } | null>(null);
  const nextId = useRef(1);
  const previousCatalog = useRef(data);
  // Catálogo atual para funções chamadas depois de respostas assíncronas (ex.: abrir orçamento).
  const latestData = useRef(data);
  latestData.current = data;

  // Cidade que só aceita carga fechada: a carga fracionada daria frete zero.
  useEffect(() => {
    if (freightForm.table !== "regional" || freightForm.loadType !== "fractional") return;
    const rate = regionalFreightRates[Number(freightForm.rangeIndex)];
    if (rate && rate.fractionalPerTon === null) setFreightForm((current) => ({ ...current, loadType: "closed" }));
  }, [freightForm, regionalFreightRates]);

  // O catálogo pode ser atualizado com a calculadora aberta: as seleções são
  // reencontradas pelo nome para não apontarem para outro produto ou linha.
  useEffect(() => {
    const previous = previousCatalog.current;
    previousCatalog.current = data;
    if (previous === data) return;
    setItems((current) => remapCatalogSelections(previous, data, current, initialItemForm).items);
    const previousTerm = paymentTermIndex;
    const nextTerm = previousTerm === "" ? "" : String(data.paymentTermLabels.indexOf(previous.paymentTermLabels[Number(previousTerm)] ?? ""));
    const remappedTerm = nextTerm === "-1" ? "" : nextTerm;
    setPaymentTermIndex(remappedTerm);
    setItemForm((current) => {
      const remapped = remapCatalogSelections(previous, data, [], current).itemForm;
      if (current.productIndex === "") return remapped;
      // Só atualiza preço e peso se o campo ainda tinha o valor vindo do catálogo.
      const previousColumn = previousTerm === "" ? Math.max(0, previous.paymentTermLabels.findIndex((label) => label.trim().toLowerCase() === "à vista")) : Number(previousTerm);
      const previousPrice = previous.products[Number(current.productIndex)]?.prices[previousColumn];
      const autoFilled = previousPrice !== undefined && current.tableUnitPrice === previousPrice.toFixed(2);
      return autoFilled ? fillProductPrice(remapped, remappedTerm) : remapped;
    });
    setFreightForm((current) => remapFreightSelection(previous, data, current));
    // Valor padrão da chapa mudou: atualiza, a menos que o vendedor tenha digitado outro.
    setHandlingRatePerTon((current) => current === String(previous.handlingRatePerTon) ? String(data.handlingRatePerTon) : current);
  }, [data]);

  const freightSelection = useMemo<FreightSelection>(() => {
    if (freightForm.table === "juara") {
      const rate = juaraFreightRates[Number(freightForm.rangeIndex)];
      if (!rate) return { table: "none" };
      return {
        table: "juara",
        loadType: freightForm.loadType,
        rates: {
          bag25: rate.bag25,
          bag30: rate.bag30,
          bag40: rate.bag40,
          closedPerTon: rate.closedPerTon,
        },
      };
    }

    if (freightForm.table === "regional") {
      const rate = regionalFreightRates[Number(freightForm.rangeIndex)];
      if (!rate) return { table: "none" };
      return {
        table: "regional",
        loadType: freightForm.loadType,
        rates: {
          fractionalPerTon: rate.fractionalPerTon,
          closedPerTon: rate.closedPerTon,
        },
      };
    }

    return { table: "none" };
  }, [freightForm, juaraFreightRates, regionalFreightRates]);

  const calculation = useMemo(
    () => calculateCurrentOrder(items, {
      anticipatedPayment,
      freight: freightSelection,
      handlingEnabled,
      handlingRatePerTon: numberOrZero(handlingRatePerTon),
    }),
    [anticipatedPayment, freightSelection, handlingEnabled, handlingRatePerTon, items],
  );

  /**
   * Preço de tabela do produto no prazo do orçamento. Enquanto o prazo não foi
   * escolhido, usa o preço à vista (base da tabela): o vendedor vê o total
   * primeiro e escolhe a condição depois, e os preços se ajustam.
   */
  function tablePrice(productIndex: string, term: string) {
    if (productIndex === "") return undefined;
    const column = term === "" ? baseTermIndex : Number(term);
    return products[Number(productIndex)]?.prices[column];
  }

  function fillProductPrice(nextForm: ItemFormState, term = paymentTermIndex) {
    if (nextForm.productIndex === "") return nextForm;
    const product = products[Number(nextForm.productIndex)];
    if (!product) return nextForm;
    const price = tablePrice(nextForm.productIndex, term);
    return {
      ...nextForm,
      tableUnitPrice: price === undefined ? "" : price.toFixed(2),
      bagWeightKg: String(product.weightKg),
    };
  }

  function changeProduct(productIndex: string) {
    // Ao passar para preço manual, o peso da saca precisa ser escolhido de novo.
    setItemForm((current) => fillProductPrice({ ...current, productIndex, ...(productIndex === "" && { bagWeightKg: "" }) }));
  }

  /**
   * Troca o prazo do orçamento: todos os itens passam a esse prazo, e os que
   * usam preço da tabela recebem o preço da nova coluna. Preço digitado fica.
   */
  function changePaymentTerm(term: string) {
    const previousTerm = paymentTermIndex;
    setPaymentTermIndex(term);
    setItems((current) => current.map((item) => {
      const price = item.priceFromTable ? tablePrice(item.productIndex, term) : undefined;
      return { ...item, paymentTermIndex: term, ...(price !== undefined && { tableUnitPrice: price }) };
    }));
    setItemForm((current) => {
      if (current.productIndex === "") return current;
      const previousPrice = tablePrice(current.productIndex, previousTerm);
      const autoFilled = current.tableUnitPrice === "" || (previousPrice !== undefined && current.tableUnitPrice === previousPrice.toFixed(2));
      return autoFilled ? fillProductPrice(current, term) : current;
    });
  }

  function changeItemField<Key extends keyof ItemFormState>(key: Key, value: ItemFormState[Key]) {
    setItemForm((current) => ({ ...current, [key]: value }));
    if (itemError) setItemError(null);
  }

  function changeFreightTable(table: FreightFormState["table"]) {
    setFreightForm((current) => ({
      ...current,
      table,
      rangeIndex: table === "" ? "" : "0",
    }));
  }

  function changeFreightField<Key extends keyof FreightFormState>(
    key: Key,
    value: FreightFormState[Key],
  ) {
    setFreightForm((current) => ({ ...current, [key]: value }));
  }

  function resetItemForm() {
    setItemForm(initialItemForm);
  }

  function submitItem() {
    const tableUnitPrice = numberOrZero(itemForm.tableUnitPrice);
    const quantity = Number.parseInt(itemForm.quantity, 10) || 0;

    if (tableUnitPrice <= 0) {
      setItemError({ field: "tablePrice", message: "Informe o preço de tabela (escolha o produto, ou digite o preço)." });
      document.getElementById("tablePrice")?.focus();
      return;
    }
    if (quantity < 1) {
      setItemError({ field: "quantity", message: "Informe uma quantidade de pelo menos 1 saca." });
      document.getElementById("quantity")?.focus();
      return;
    }
    const product = itemForm.productIndex === ""
      ? undefined
      : products[Number(itemForm.productIndex)];
    // Produto do catálogo traz o peso do cadastro; no preço manual o peso é obrigatório.
    const weightKg = product?.weightKg ?? numberOrZero(itemForm.bagWeightKg);
    if (weightKg <= 0) {
      setItemError({ field: "bagWeight", message: "Escolha o peso da saca do produto com preço manual." });
      document.getElementById("bagWeight")?.focus();
      return;
    }
    setItemError(null);
    setLastRemoved(null);

    const discountLine = itemForm.discountLineIndex === ""
      ? undefined
      : discountLines[Number(itemForm.discountLineIndex)];
    const customDiscountPercentage = numberOrZero(itemForm.customDiscountPercentage);
    const lineDiscountPercentage = discountLine?.percentage === null
      ? customDiscountPercentage
      : discountLine?.percentage ?? 0;
    // Item de produto que não está mais no catálogo (renomeado ou excluído):
    // ao editar, mantém o nome e a categoria originais.
    const previous = editingIndex === null ? undefined : items[editingIndex];
    const keepOriginal = !product && previous && previous.productIndex === "" && previous.name !== "Preço informado manualmente";

    const orderItem: OrderItem = {
      id: editingIndex === null ? nextId.current++ : items[editingIndex].id,
      name: product?.name ?? (keepOriginal ? previous.name : "Preço informado manualmente"),
      productIndex: itemForm.productIndex,
      paymentTermIndex,
      priceFromTable: tablePrice(itemForm.productIndex, paymentTermIndex)?.toFixed(2) === tableUnitPrice.toFixed(2),
      tableUnitPrice,
      quantity,
      weightKg,
      lineDiscountPercentage,
      discountLineIndex: itemForm.discountLineIndex,
      customDiscountPercentage,
      categoryName: product?.group ?? (keepOriginal ? previous.categoryName ?? null : null),
    };

    if (editingIndex === null) {
      setItems((current) => [...current, orderItem]);
    } else {
      setItems((current) => current.map((item, index) => index === editingIndex ? orderItem : item));
      setEditingIndex(null);
    }
    resetItemForm();
  }

  function editItem(index: number) {
    const item = items[index];
    if (!item) return;
    setEditingIndex(index);
    setItemForm({
      productIndex: item.productIndex,
      paymentTermIndex: "",
      tableUnitPrice: String(item.tableUnitPrice),
      discountLineIndex: item.discountLineIndex,
      customDiscountPercentage: item.customDiscountPercentage
        ? String(item.customDiscountPercentage)
        : "",
      quantity: String(item.quantity),
      bagWeightKg: String(item.weightKg),
    });
    document.getElementById("addItemButton")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function removeItem(index: number) {
    const removed = items[index];
    if (removed) setLastRemoved({ item: removed, index });
    setItems((current) => current.filter((_, currentIndex) => currentIndex !== index));
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && index < editingIndex) setEditingIndex(editingIndex - 1);
  }

  /** Desfaz a última remoção, devolvendo o item à mesma posição. */
  function undoRemove() {
    if (!lastRemoved) return;
    setItems((current) => {
      const next = [...current];
      next.splice(Math.min(lastRemoved.index, next.length), 0, lastRemoved.item);
      return next;
    });
    setLastRemoved(null);
  }

  function cancelEditing() {
    setEditingIndex(null);
    resetItemForm();
  }

  /** Carrega um orçamento salvo, com os preços originais, para edição. */
  function loadQuote({ quote, items: quoteItems }: SavedQuoteDetail) {
    const state = quoteToCalculatorState(quote, quoteItems, latestData.current, nextId.current);
    nextId.current += state.items.length;
    setItems(state.items);
    setPaymentTermIndex(state.paymentTermIndex);
    setEditingIndex(null);
    resetItemForm();
    setFreightForm(state.freightForm);
    setAnticipatedPayment(state.anticipatedPayment);
    setHandlingEnabled(state.handlingEnabled);
    setHandlingRatePerTon(state.handlingRatePerTon);
    setNotes(quote.notes ?? "");
    setPaymentMode(quote.payment_mode === "installments" || quote.payment_mode === "single" ? quote.payment_mode : "");
    setCustomer(quote.customer_id
      ? { id: quote.customer_id, name: quote.customer_name_snapshot ?? "Cliente", document: quote.customer_document_snapshot }
      : null);
    setEditingQuote({
      id: quote.id,
      number: quote.quote_number,
      status: quote.status,
      customerId: quote.customer_id,
      customerName: quote.customer_name_snapshot,
      customerDocument: quote.customer_document_snapshot,
    });
  }

  /** Volta a calculadora ao estado inicial, para começar um novo pedido. */
  function resetOrder() {
    setLastRemoved(null);
    setItemError(null);
    setEditingQuote(null);
    setCustomer(null);
    setNotes("");
    setPaymentMode("");
    setPaymentTermIndex("");
    setItems([]);
    setEditingIndex(null);
    resetItemForm();
    setFreightForm(initialFreightForm);
    setAnticipatedPayment(false);
    setHandlingEnabled(false);
    setHandlingRatePerTon(String(data.handlingRatePerTon));
  }

  const showManualWeight = itemForm.productIndex === "";

  return {
    data,
    itemForm,
    freightForm,
    items,
    editingIndex,
    anticipatedPayment,
    handlingEnabled,
    handlingRatePerTon,
    calculation,
    showManualWeight,
    changeProduct,
    changePaymentTerm,
    changeItemField,
    changeFreightTable,
    changeFreightField,
    setAnticipatedPayment,
    setHandlingEnabled,
    setHandlingRatePerTon,
    submitItem,
    editItem,
    removeItem,
    cancelEditing,
    resetOrder,
    editingQuote,
    loadQuote,
    customer,
    setCustomer,
    notes,
    setNotes,
    paymentMode,
    setPaymentMode,
    paymentTermIndex,
    /** O prazo do orçamento tem as duas formas (parcelado ou direto). */
    needsPaymentMode: paymentTermIndex !== "" && hasPaymentModeChoice(data.paymentTermLabels[Number(paymentTermIndex)]),
    itemError,
    lastRemoved,
    undoRemove,
    /** Há trabalho que se perderia ao começar outro pedido. */
    hasWork: items.length > 0 || editingQuote !== null || notes.trim() !== "",
  };
}

export type CalculatorController = ReturnType<typeof useCalculator>;
