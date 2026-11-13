import { calculateCurrentOrder } from "../../domain/order/calculateOrder";
import type { FreightSelection } from "../../domain/freight/calculateFreight";
import { createQuoteSnapshot, type QuoteSourceItem } from "../../domain/quotes/createQuoteSnapshot";
import { hasPaymentModeChoice } from "../../domain/payment/paymentTerm";
import type { DemoCatalog, DemoUser, Row } from "../store/types";
import { addDays, isoDateTime, seededId, startOfDay } from "../store/ids";
import { snapshotToRows } from "../quotes/rows";
import { chance, int, pick, type Rng } from "./random";

type BuildArgs = { rng: Rng; today: Date; catalog: DemoCatalog; customers: Row<"customers">[]; users: DemoUser[] };

function timeOn(rng: Rng, day: Date, today: Date): Date {
  const at = startOfDay(day);
  at.setHours(int(rng, 7, 17), int(rng, 0, 59), int(rng, 0, 59), 0);
  if (at > today) return new Date(today.getTime() - int(rng, 5, 90) * 60_000);
  return at;
}

function clamp(date: Date, today: Date) {
  return date > today ? new Date(today) : date;
}

type Plan = { daysAgo: number; status: "draft" | "issued" | "approved" | "cancelled"; approvedToday?: boolean };

function plans(rng: Rng): Plan[] {
  const list: Plan[] = [
    { daysAgo: 2, status: "approved", approvedToday: true },
    { daysAgo: 1, status: "approved", approvedToday: true },
    { daysAgo: 4, status: "approved", approvedToday: true },
    { daysAgo: 0, status: "issued" },
    { daysAgo: 0, status: "draft" },
  ];
  while (list.length < 140) {
    // Mais orçamentos recentes do que antigos.
    const daysAgo = Math.floor(Math.pow(rng(), 1.35) * 120);
    const roll = rng();
    let status: Plan["status"];
    if (daysAgo > 21) status = roll < 0.68 ? "approved" : roll < 0.86 ? "cancelled" : "issued";
    else if (daysAgo > 6) status = roll < 0.5 ? "approved" : roll < 0.8 ? "issued" : roll < 0.9 ? "draft" : "cancelled";
    else status = roll < 0.32 ? "approved" : roll < 0.7 ? "issued" : "draft";
    list.push({ daysAgo, status });
  }
  return list.sort((a, b) => b.daysAgo - a.daysAgo);
}

export function buildQuotes({ rng, today, catalog, customers, users }: BuildArgs) {
  const quotes: Row<"quotes">[] = [];
  const items: Row<"quote_items">[] = [];
  const sellers = users.filter((user) => user.role !== "consulta");
  const activeCustomers = customers.filter((customer) => customer.active);
  // Alguns clientes compram com frequência.
  const frequent = activeCustomers.slice(0, 12);
  let number = 1000;

  for (const plan of plans(rng)) {
    const customer = chance(rng, 0.92) ? (chance(rng, 0.55) ? pick(rng, frequent) : pick(rng, activeCustomers)) : null;
    const termIndex = int(rng, 0, catalog.paymentTermLabels.length - 1);
    const anticipatedPayment = termIndex === 0 && chance(rng, 0.25);
    const productIndexes = new Set<number>();
    const itemCount = int(rng, 1, 4);
    while (productIndexes.size < itemCount) productIndexes.add(int(rng, 0, catalog.products.length - 1));

    const source: QuoteSourceItem[] = [...productIndexes].map((productIndex) => {
      const product = catalog.products[productIndex];
      const discountIndex = chance(rng, 0.55) ? int(rng, 0, catalog.discountLines.length - 2) : null;
      return {
        name: product.name,
        productIndex: String(productIndex),
        paymentTermIndex: String(termIndex),
        tableUnitPrice: product.prices[termIndex],
        quantity: int(rng, 2, 14) * 10,
        weightKg: product.weightKg,
        lineDiscountPercentage: discountIndex === null ? 0 : catalog.discountLines[discountIndex].percentage ?? 0,
        ...(discountIndex !== null && { discountLineIndex: String(discountIndex) }),
      };
    });

    let freight: FreightSelection = { table: "none" };
    let freightContext: { tableName: string | null; zone: string | null; loadType: "fractional" | "closed" | null } = { tableName: null, zone: null, loadType: null };
    if (chance(rng, 0.6)) {
      if (chance(rng, 0.5)) {
        const rate = pick(rng, catalog.juaraFreightRates);
        const loadType = chance(rng, 0.75) ? "fractional" : "closed";
        freight = { table: "juara", loadType, rates: rate };
        freightContext = { tableName: "Juara", zone: rate.distance, loadType };
      } else {
        const rate = pick(rng, catalog.regionalFreightRates);
        const loadType = rate.fractionalPerTon === null || chance(rng, 0.3) ? "closed" : "fractional";
        freight = { table: "regional", loadType, rates: { fractionalPerTon: rate.fractionalPerTon, closedPerTon: rate.closedPerTon } };
        freightContext = { tableName: "Regional", zone: rate.location, loadType };
      }
    }
    const handlingEnabled = chance(rng, 0.45);
    const handlingRatePerTon = handlingEnabled ? catalog.handlingRatePerTon : 0;
    const calculation = calculateCurrentOrder(source, { anticipatedPayment, freight, handlingEnabled, handlingRatePerTon });
    const termLabel = catalog.paymentTermLabels[termIndex];
    const snapshot = createQuoteSnapshot({
      items: source,
      calculation,
      products: catalog.products,
      paymentTermLabels: catalog.paymentTermLabels,
      catalog,
      anticipatedPayment,
      handlingRatePerTon,
      freight: freightContext,
      customer: customer ? { id: customer.id, name: customer.legal_name, document: customer.document } : null,
      notes: chance(rng, 0.2) ? pick(rng, ["Entregar pela manhã.", "Cliente pediu paletizado.", "Retirada na fábrica.", "Confirmar data de entrega por telefone."]) : null,
      paymentMode: hasPaymentModeChoice(termLabel) ? (chance(rng, 0.6) ? "installments" : "single") : null,
    });

    const created = plan.approvedToday
      ? timeOn(rng, addDays(today, -plan.daysAgo), today)
      : timeOn(rng, addDays(today, -plan.daysAgo), today);
    const seller = pick(rng, sellers);
    const id = seededId(rng);
    number += 1;
    const rows = snapshotToRows({ ...snapshot, status: "draft" }, {
      id,
      quoteNumber: number,
      createdAt: isoDateTime(created),
      createdBy: seller.id,
      itemId: () => seededId(rng),
    });
    const quote = rows.quote;
    quote.status = plan.status;
    if (plan.status !== "draft") {
      const issued = clamp(new Date(created.getTime() + int(rng, 10, 60 * 30) * 60_000), today);
      if (plan.status !== "cancelled" || chance(rng, 0.6)) quote.issued_at = isoDateTime(issued);
      if (plan.status === "approved") {
        const approved = plan.approvedToday
          ? new Date(Math.max(startOfDay(today).getTime() + 60_000, today.getTime() - int(rng, 5, 120) * 60_000))
          : clamp(new Date(issued.getTime() + int(rng, 1, 6) * 86_400_000), today);
        quote.approved_at = isoDateTime(approved);
        quote.updated_at = quote.approved_at;
      }
      if (plan.status === "cancelled") {
        quote.cancelled_at = isoDateTime(clamp(new Date(issued.getTime() + int(rng, 1, 9) * 86_400_000), today));
        quote.updated_at = quote.cancelled_at;
      }
    }
    quotes.push(quote);
    items.push(...rows.items);
  }
  return { quotes, items, lastNumber: number };
}
