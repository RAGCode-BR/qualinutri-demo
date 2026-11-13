import type { DemoTables } from "../store/types";
import { addDays, isoDate, isoDateTime, seededId } from "../store/ids";
import { receivables } from "../kpis/finance";
import { discountTitle, titleKey } from "../erp/finance";
import type { Anticipation, Bank, ErpTables, Formula, Invoice, Material, StatementLine } from "../erp/types";
import { chance, int, pick, round2, type Rng } from "./random";

const drivers = ["Waldir Nunes", "Gilmar Teixeira", "Reginaldo Sá"];
const shops = ["Auto Diesel Juruena", "Pneus Rota MT", "Oficina interna", "Mecânica Pesada Norte"];
const problems = ["Vazamento de óleo no cárter", "Pneu dianteiro com desgaste irregular", "Freio traseiro com ruído", "Troca de embreagem", "Lona da carroceria rasgada", "Alternador falhando"];

export function buildErp({ rng, today, tables }: { rng: Rng; today: Date; tables: DemoTables }): ErpTables {
  const banks: Bank[] = [
    { id: "sicoob", name: "Sicoob", balance: 486_320.55, monthlyRate: 1.79, feePerTitle: 3.9 },
    { id: "itau", name: "Itaú", balance: 213_874.12, monthlyRate: 2.05, feePerTitle: 5.5 },
  ];

  // Antecipações já feitas: alguns títulos futuros descontados (aparecem em outra cor).
  const todayKey = isoDate(today);
  const future = receivables(tables, today).filter((item) => !item.paidAt && item.dueDate > todayKey);
  const anticipations: Anticipation[] = [];
  for (const [index, offset] of [18, 9, 3].entries()) {
    const bank = banks[index % 2];
    const date = isoDate(addDays(today, -offset));
    const chosen = future.filter((item, position) => position % 5 === index && !anticipations.some((a) => a.titles.some((t) => t.key === titleKey(item)))).slice(0, 4);
    if (!chosen.length) continue;
    const titles = chosen.map((item) => discountTitle(item, bank, date));
    const sum = (key: "amount" | "interest" | "iof" | "fee" | "net") => round2(titles.reduce((total, title) => total + title[key], 0));
    anticipations.push({ id: seededId(rng), bank: bank.id, date, titles, gross: sum("amount"), interest: sum("interest"), iof: sum("iof"), fees: sum("fee"), net: sum("net") });
  }

  // Extrato bancário: recebimentos e pagamentos recentes, a maioria já conciliada pelo sistema.
  const statement: StatementLine[] = [];
  const paidRecent = receivables(tables, today).filter((item) => item.paidAt && item.paidAt >= isoDate(addDays(today, -12)));
  for (const item of paidRecent.slice(0, 18)) {
    const matched = chance(rng, 0.78);
    statement.push({ id: seededId(rng), bank: chance(rng, 0.6) ? "sicoob" : "itau", date: item.paidAt!, description: `LIQ BOLETO ${item.customer.toUpperCase().slice(0, 22)}`, amount: item.amount, matched: matched ? titleKey(item) : null, suggestion: matched ? null : titleKey(item) });
  }
  for (const payable of tables.payables.filter((item) => item.paidAt && item.paidAt >= isoDateTime(addDays(today, -12))).slice(0, 8)) {
    statement.push({ id: seededId(rng), bank: chance(rng, 0.5) ? "sicoob" : "itau", date: payable.dueDate, description: `PAG ${payable.supplier.toUpperCase().slice(0, 24)}`, amount: -payable.amount, matched: chance(rng, 0.8) ? payable.id : null, suggestion: payable.id });
  }
  for (const anticipation of anticipations) {
    statement.push({ id: seededId(rng), bank: anticipation.bank, date: anticipation.date, description: "CRED DESCONTO DUPLICATAS", amount: anticipation.net, matched: anticipation.id, suggestion: null });
  }
  statement.push({ id: seededId(rng), bank: "sicoob", date: isoDate(addDays(today, -1)), description: "PIX RECEBIDO SEM IDENTIFICACAO", amount: 3_870, matched: null, suggestion: null });
  statement.push({ id: seededId(rng), bank: "itau", date: isoDate(addDays(today, -2)), description: "TARIFA PACOTE SERVICOS", amount: -189.9, matched: null, suggestion: null });
  statement.sort((a, b) => b.date.localeCompare(a.date));

  // Inscrição estadual (SINTEGRA): ~10% irregular.
  const ie = tables.customers.map((customer, index) => ({
    customerId: customer.id,
    ie: `13.${int(rng, 100, 999)}.${int(rng, 100, 999)}-${int(rng, 1, 9)}`,
    status: (index % 11 === 4 ? "suspensa" : index % 17 === 9 ? "baixada" : "ativa") as "ativa" | "suspensa" | "baixada",
    checkedAt: isoDateTime(addDays(today, -int(rng, 0, 20))),
  }));

  // NF-e emitidas para pedidos aprovados recentes.
  let invoiceNumber = 4810;
  const invoices: Invoice[] = tables.quotes
    .filter((quote) => quote.status === "approved" && quote.approved_at && quote.approved_at >= isoDateTime(addDays(today, -35)))
    .sort((a, b) => (a.approved_at ?? "").localeCompare(b.approved_at ?? ""))
    .map((quote) => {
      invoiceNumber += 1;
      const rejected = chance(rng, 0.06);
      return {
        id: seededId(rng), number: invoiceNumber, quoteId: quote.id, customer: quote.customer_name_snapshot ?? "Consumidor", customerId: quote.customer_id,
        value: quote.grand_total, date: isoDateTime(new Date(new Date(quote.approved_at!).getTime() + 3_600_000)),
        status: rejected ? "rejeitada" : "autorizada", protocol: rejected ? null : `151${int(rng, 100000000, 999999999)}`,
        rejection: rejected ? "Rejeição 539: duplicidade de NF-e com diferença na chave de acesso" : null,
      };
    });

  const mdfe = tables.loads.filter((load) => load.status === "shipped").slice(-10).map((load, index) => ({
    id: seededId(rng), number: 920 + index, loadId: load.id, vehicle: load.vehicle_name_snapshot, plate: load.vehicle_plate_snapshot,
    driver: pick(rng, drivers), invoices: invoices.filter((invoice) => tables.load_items.some((item) => item.load_id === load.id && item.quote_id === invoice.quoteId)).map((invoice) => invoice.number),
    date: load.shipped_at ?? load.created_at, status: (index < 7 ? "encerrado" : "autorizado") as "encerrado" | "autorizado",
  }));

  // Frota: pedidos de conserto com orçamentos e aprovação da gestão.
  const trucks = tables.vehicles.map((vehicle) => vehicle.name);
  const fleetRequests = Array.from({ length: 9 }, (_, index) => {
    const status = index < 2 ? "aguardando" : index < 3 ? "recusado" : index < 6 ? "concluido" : "aprovado";
    const quotes = Array.from({ length: int(rng, 2, 3) }, () => ({ shop: pick(rng, shops), value: int(rng, 9, 160) * 50, days: int(rng, 1, 6) }));
    return {
      id: seededId(rng), vehicle: pick(rng, trucks), date: isoDateTime(addDays(today, -index * int(rng, 3, 9))), problem: pick(rng, problems),
      requestedBy: pick(rng, drivers), quotes, chosen: status === "aguardando" ? null : 0, status: status as "aguardando" | "aprovado" | "recusado" | "concluido",
      decidedBy: status === "aguardando" ? null : "Agnaldo (diretoria)", context: index === 0 ? "3ª quebra após entrega na Fazenda Boa Vista" : null,
    };
  });

  // Viagens (frete cobrado × custo) para rentabilidade por caminhão e por cliente.
  const trips = tables.loads.filter((load) => load.status === "shipped").flatMap((load) => {
    const customers = [...new Set(tables.load_items.filter((item) => item.load_id === load.id).map((item) => tables.quotes.find((quote) => quote.id === item.quote_id)))].filter((quote) => quote);
    return customers.map((quote) => {
      const km = int(rng, 40, 260);
      const tons = round2(tables.load_items.filter((item) => item.load_id === load.id && item.quote_id === quote!.id).reduce((total, item) => total + item.quantity * item.weight_kg_snapshot, 0) / 1000);
      const hard = (quote!.customer_name_snapshot ?? "").includes("Boa Vista") || chance(rng, 0.08);
      return {
        id: seededId(rng), vehicle: load.vehicle_name_snapshot, date: load.shipped_at ?? load.created_at, customer: quote!.customer_name_snapshot ?? "Sem cliente",
        city: pick(rng, ["Vale Verde", "Serra Azul", "Rio Claro", "Boa Esperança", "Nova Aurora"]), km, tons,
        freightCharged: round2(quote!.freight_total || tons * 95), fuel: round2(km * 2 * 2.4), tolls: chance(rng, 0.3) ? int(rng, 20, 80) : 0, driver: pick(rng, drivers),
        incident: hard ? pick(rng, ["Pneu furado na estrada de chão", "Quebra de feixe de mola", "Atolamento na entrada da fazenda"]) : null,
      };
    });
  });

  // Produção e estoque.
  const materials: Material[] = [
    { id: "mp-milho", name: "Milho em grão", unit: "kg", stockKg: 186_400, minKg: 120_000, pricePerKg: 1.12, location: "Silo 01" },
    { id: "mp-soja", name: "Farelo de soja", unit: "kg", stockKg: 48_200, minKg: 60_000, pricePerKg: 2.31, location: "Armazém A" },
    { id: "mp-sorgo", name: "Sorgo", unit: "kg", stockKg: 61_750, minKg: 30_000, pricePerKg: 0.98, location: "Silo 02" },
    { id: "mp-calcario", name: "Calcário calcítico", unit: "kg", stockKg: 22_300, minKg: 15_000, pricePerKg: 0.21, location: "Armazém B" },
    { id: "mp-ureia", name: "Ureia pecuária", unit: "kg", stockKg: 7_850, minKg: 10_000, pricePerKg: 3.84, location: "Armazém B" },
    { id: "mp-premix", name: "Premix mineral", unit: "kg", stockKg: 12_640, minKg: 8_000, pricePerKg: 6.9, location: "Armazém B" },
    { id: "mp-sal", name: "Sal comum", unit: "kg", stockKg: 33_900, minKg: 20_000, pricePerKg: 0.62, location: "Armazém B" },
  ];
  const recipe = (group: string): Formula["ingredients"] => group === "Rações"
    ? [{ material: "Milho em grão", pct: 58 }, { material: "Farelo de soja", pct: 24 }, { material: "Sorgo", pct: 12 }, { material: "Calcário calcítico", pct: 2 }, { material: "Premix mineral", pct: 4 }]
    : group === "Núcleos"
      ? [{ material: "Farelo de soja", pct: 35 }, { material: "Ureia pecuária", pct: 8 }, { material: "Premix mineral", pct: 32 }, { material: "Calcário calcítico", pct: 15 }, { material: "Sal comum", pct: 10 }]
      : [{ material: "Sal comum", pct: 45 }, { material: "Premix mineral", pct: 25 }, { material: "Calcário calcítico", pct: 18 }, { material: "Ureia pecuária", pct: 6 }, { material: "Milho em grão", pct: 6 }];
  const formulas: Formula[] = tables.catalog.products.map((product, index) => ({
    id: seededId(rng), product: product.name, ingredients: recipe(product.group).map((item, position) => ({ ...item, pct: item.pct + (position === 0 ? (index % 3) - 1 : position === 1 ? 1 - (index % 3) : 0) })),
    version: `v${int(rng, 2, 7)}`, updatedAt: isoDateTime(addDays(today, -int(rng, 5, 120))), author: index % 2 ? "Cássio (formulação)" : "Daniel (nutrição)",
  }));
  let orderNumber = 2300;
  const orders = Array.from({ length: 16 }, (_, index) => {
    const product = pick(rng, tables.catalog.products);
    orderNumber += 1;
    const daysAgo = index < 3 ? 0 : index < 5 ? -1 : int(rng, 1, 20);
    return { id: seededId(rng), number: orderNumber, product: product.name, bags: int(rng, 8, 40) * 10, bagKg: product.weightKg, status: (daysAgo < 0 ? "planejada" : index < 3 ? "em_producao" : "concluida") as "planejada" | "em_producao" | "concluida", date: isoDate(addDays(today, -daysAgo)), operator: pick(rng, ["Josué Ramos", "Luana Cardoso", "Cássio"]) };
  }).sort((a, b) => b.date.localeCompare(a.date));
  const finished = tables.catalog.products.map((product) => ({ product: product.name, bags: int(rng, 0, 90) * 10, reserved: int(rng, 0, 30) * 10, location: product.group === "Rações" ? "Galpão 1" : "Galpão 2" }));

  const approvals = [
    { kind: "cadastro" as const, title: "Novo cliente: Agropecuária Três Marias Ltda", detail: "Cadastro enviado por Carla Mendes com ficha, contrato social e IE anexados.", requestedBy: "Carla Mendes" },
    { kind: "desconto" as const, title: "Desconto de R$ 1,00 para arredondar o pedido #1131", detail: "Arredondamento de R$ 25.837,00 para R$ 25.836,00. Abaixo do limite: aprovação automática sugerida.", requestedBy: "Rafael Prado" },
    { kind: "credito" as const, title: "Liberar crédito acima do limite: Fazenda Santa Luzia", detail: "Pedido de R$ 84 mil; limite atual R$ 60 mil; score 78.", requestedBy: "Rafael Prado" },
    { kind: "conserto" as const, title: "Conserto do Graneleiro 02 · 15 t", detail: "Vazamento de óleo no cárter. Menor orçamento: Auto Diesel Juruena.", requestedBy: "Waldir Nunes" },
    { kind: "cadastro" as const, title: "Atualizar IE: Comercial Rural Rio Bonito", detail: "IE reativada no SINTEGRA; comprovante anexado.", requestedBy: "Ana (administrativo)" },
  ].map((item, index) => ({ ...item, id: seededId(rng), date: isoDateTime(addDays(today, -index)), status: "pendente" as const, decidedBy: null, ref: item.kind === "conserto" ? fleetRequests[0].id : null }));

  const chat = [
    { thread: "geral", author: "Rogério (logística)", text: "Graneleiro 03 saindo às 14h com 3 entregas na região de Vale Verde." },
    { thread: "geral", author: "Cibelly (financeiro)", text: "Antecipação do Sicoob creditada, já conciliada no extrato." },
    { thread: "geral", author: "João Henrique (qualidade)", text: "Lote de milho da Cerealista Planalto Norte com umidade 15,2%. Segurei na recepção." },
  ].map((item, index) => ({ ...item, id: seededId(rng), at: isoDateTime(new Date(today.getTime() - (3 - index) * 3_600_000)) }));

  return { banks, anticipations, statement, ie, invoices, mdfe, fleetRequests, trips, materials, formulas, orders, finished, approvals, chat, monthlyGoal: 1_400_000, seq: { invoice: invoiceNumber, mdfe: 930, order: orderNumber } };
}
