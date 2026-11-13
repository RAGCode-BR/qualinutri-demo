import type { DiscountLine, JuaraFreightRate, PaymentTerm, Product, RegionalFreightRate } from "../../types/commercial";
import type { DemoCatalog } from "../store/types";

/** Catálogo 100% fictício da demonstração. Nenhum nome ou valor vem da tabela real. */
const paymentTermLabels = ["À vista", "30 dd", "30/60 ou 45 dd", "30/60/90 ou 60 dd"] as const;
const paymentTermIds = ["term-cash", "term-30", "term-30-60", "term-30-60-90"];
const markup = [1, 1.025, 1.04, 1.06];

function product(id: string, group: string, name: string, weightKg: number, cashPrice: number): Product {
  return { id, group, name, weightKg, prices: markup.map((factor) => Math.round(cashPrice * factor * 100) / 100) };
}

const rationProducts: Product[] = [
  product("prd-01", "Rações", "Ração Inicial Bezerros 22%", 40, 118.9),
  product("prd-02", "Rações", "Ração Crescimento 18%", 40, 96.5),
  product("prd-03", "Rações", "Ração Terminação Confinamento", 40, 89.9),
  product("prd-04", "Rações", "Ração Vaca Leiteira 20%", 40, 104.3),
  product("prd-05", "Rações", "Ração Equinos Performance", 30, 92.4),
  product("prd-06", "Rações", "Ração Suínos Engorda", 40, 84.7),
  product("prd-07", "Rações", "Ração Aves Postura", 25, 61.2),
];
const mineralProducts: Product[] = [
  product("prd-08", "Minerais", "Mineral Cria Plus 80", 30, 142.0),
  product("prd-09", "Minerais", "Mineral Recria Seca", 30, 128.5),
  product("prd-10", "Minerais", "Mineral Proteinado Águas", 30, 98.6),
  product("prd-11", "Minerais", "Mineral Ureado Seca 40", 30, 87.3),
  product("prd-12", "Minerais", "Sal Mineral Reprodução", 25, 115.8),
  product("prd-13", "Núcleos", "Núcleo Confinamento 100", 25, 176.4),
  product("prd-14", "Núcleos", "Núcleo Leite Alta Produção", 25, 189.9),
  product("prd-15", "Núcleos", "Núcleo Semiconfinamento", 25, 158.2),
];

const paymentTerms: PaymentTerm[] = [
  { id: "term-cash", label: "À vista", condition: "Pagamento na emissão do pedido", notes: "Base para todos os descontos de linha." },
  { id: "term-30", label: "30 dd", condition: "Boleto único em 30 dias", notes: "Sujeito à análise de crédito." },
  { id: "term-30-60", label: "30/60 ou 45 dd", condition: "Parcelado em 2x ou boleto único em 45 dias", notes: "Mesmo preço nas duas formas." },
  { id: "term-30-60-90", label: "30/60/90 ou 60 dd", condition: "Parcelado em 3x ou boleto único em 60 dias", notes: "Pedido mínimo de 2 toneladas." },
];

const discountLines: DiscountLine[] = [
  { id: "disc-01", name: "Linha Rações Bovinos", percentage: 3 },
  { id: "disc-02", name: "Linha Minerais Cria", percentage: 4 },
  { id: "disc-03", name: "Linha Núcleos", percentage: 2.5 },
  { id: "disc-04", name: "Campanha Seca 2026", percentage: 5 },
  { id: "disc-05", name: "Cliente fidelidade", percentage: 1.5 },
  { id: "disc-99", name: "Outro / personalizado", percentage: null },
];

const juaraFreightRates: JuaraFreightRate[] = [
  { id: "fz-j1", distance: "Até 30 km", bag25: 2.1, bag30: 2.5, bag40: 3.3, closedPerTon: 70 },
  { id: "fz-j2", distance: "31 a 60 km", bag25: 3.2, bag30: 3.8, bag40: 5.0, closedPerTon: 105 },
  { id: "fz-j3", distance: "61 a 100 km", bag25: 4.4, bag30: 5.2, bag40: 6.9, closedPerTon: 145 },
  { id: "fz-j4", distance: "101 a 150 km", bag25: 5.9, bag30: 7.0, bag40: 9.3, closedPerTon: 190 },
];

const regionalFreightRates: RegionalFreightRate[] = [
  { id: "fz-r1", location: "Vale Verde", fractionalPerTon: 210, closedPerTon: 165 },
  { id: "fz-r2", location: "Serra Azul", fractionalPerTon: 245, closedPerTon: 190 },
  { id: "fz-r3", location: "Rio Claro", fractionalPerTon: 280, closedPerTon: 215 },
  { id: "fz-r4", location: "Boa Esperança (só fechada)", fractionalPerTon: null, closedPerTon: 240 },
];

const policySections = [
  { title: "1. Objetivo", content: "Esta política fictícia orienta a equipe comercial da demonstração na formação de preços, concessão de descontos e condições de pagamento." },
  { title: "2. Pedido mínimo", content: "O pedido mínimo é de 1 tonelada e a entrega mínima é de 1.000 kg por cliente." },
  { title: "3. Descontos", content: "Os descontos de linha incidem sobre o preço de tabela. O pagamento à vista antecipado concede 1,5% adicional; a acumulação exige aprovação do gestor comercial." },
  { title: "4. Prazos de pagamento", content: "Prazos parcelados ou diretos têm o mesmo preço. A forma escolhida deve constar no orçamento para o faturamento." },
  { title: "5. Frete e chapa", content: "Frete e chapa são cobrados à parte e não recebem desconto. Algumas cidades aceitam apenas carga fechada." },
  { title: "6. Retirada na fábrica", content: "Compras para retirada podem ficar na fábrica por até 6 meses. Depois disso, cobra-se armazenagem mensal por saca." },
];

export function buildCatalog(): DemoCatalog {
  return {
    paymentTermLabels: [...paymentTermLabels],
    paymentTermIds,
    paymentTerms,
    discountLines,
    rationProducts,
    mineralProducts,
    products: [...rationProducts, ...mineralProducts],
    priceTableFrom: "2026-10-01",
    priceTableId: "price-table-demo",
    discountTableId: "discount-table-demo",
    freightTableIds: { juara: "freight-juara-demo", regional: "freight-regional-demo" },
    handlingRateTableId: "handling-demo",
    policyVersionId: "policy-demo",
    juaraFreightRates,
    regionalFreightRates,
    handlingRatePerTon: 40,
    policyVersion: "2026.2 (demonstração)",
    policySections,
    anticipatedPercentage: 1.5,
    changeLog: [],
  };
}
