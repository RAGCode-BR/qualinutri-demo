import type {
  DiscountLine,
  JuaraFreightRate,
  PaymentTerm,
  PolicySection,
  Product,
  RegionalFreightRate,
  CommercialData,
} from "../types/commercial";

export const paymentTermLabels = [
  "à vista",
  "30 dd",
  "30/60 ou 45 dd",
  "30/60/90 ou 60 dd",
  "30/60/90/120 ou 75 dd",
  "30/60/90/120/150 ou 90 dd",
] as const;

export const paymentTerms: PaymentTerm[] = [
  { id: "anticipated", label: "À vista antecipado", condition: "Pré-pagamento", notes: "+1,5% sobre o preço à vista. Havendo estoque, a retirada pode ser feita; não havendo, produção em até 15 dias." },
  { id: "cash", label: "À vista", condition: "Pagamento em até 15 dias", notes: "Preço da coluna “à vista” da tabela." },
  { id: "30", label: "A prazo", condition: "30 dias", notes: "Preço conforme coluna da tabela." },
  { id: "45", label: "A prazo", condition: "30/60 ou 45 dias", notes: "Preço conforme coluna da tabela." },
  { id: "60", label: "A prazo", condition: "30/60/90 ou 60 dias", notes: "Preço conforme coluna da tabela." },
  { id: "75", label: "A prazo", condition: "30/60/90/120 ou 75 dias", notes: "Preço conforme coluna da tabela." },
  { id: "90", label: "A prazo", condition: "30/60/90/120/150 ou 90 dias", notes: "Preço conforme coluna da tabela." },
];

export const discountLines: DiscountLine[] = [
  { name: "Qualiphós 80", percentage: 13 },
  { name: "Qualiphós 40/60", percentage: 8 },
  { name: "Linha Adense", percentage: 6 },
  { name: "Qualiphós 130/160 (Concentrados)", percentage: 3 },
  { name: "Linha Top Aditivada", percentage: 3 },
  { name: "Linha Nutripasto / Nutriengorda", percentage: 10 },
  { name: "Rações", percentage: 0 },
  { name: "Núcleos", percentage: 12 },
  { name: "Outro / personalizado", percentage: null },
];

export const rationProducts: Product[] = [
  { group: "Rações", name: "Quali Engorda 160 RM", weightKg: 40, prices: [56.69, 57.82, 58.40, 58.99, 59.56, 60.16] },
  { group: "Rações", name: "Quali Engorda 180 RM", weightKg: 40, prices: [58.19, 59.35, 59.95, 60.55, 61.14, 61.75] },
  { group: "Rações", name: "Quali Leite 200", weightKg: 40, prices: [66.32, 67.65, 68.32, 69.01, 69.68, 70.38] },
  { group: "Rações", name: "Quali Leite 220", weightKg: 40, prices: [68.88, 70.26, 70.96, 71.67, 72.37, 73.10] },
  { group: "Rações", name: "Quali Leite 240", weightKg: 40, prices: [72.55, 74.00, 74.74, 75.49, 76.23, 76.99] },
  { group: "Rações", name: "Quali Creep PR", weightKg: 40, prices: [60.33, 61.54, 62.15, 62.77, 63.39, 64.02] },
  { group: "Rações", name: "Quali Equino PR", weightKg: 40, prices: [58.98, 60.16, 60.76, 61.37, 61.97, 62.59] },
  { group: "Rações", name: "Quali Ovino", weightKg: 40, prices: [55.59, 56.70, 57.27, 57.84, 58.41, 58.99] },
  { group: "Rações", name: "Quali Creep Plus", weightKg: 40, prices: [70.18, 71.58, 72.30, 73.02, 73.74, 74.48] },
  { group: "Energéticos", name: "Nutri Engorda Águas VM", weightKg: 30, prices: [58.05, 59.21, 59.80, 60.40, 60.99, 61.60] },
  { group: "Energéticos", name: "Nutri Engorda Seca VM", weightKg: 30, prices: [58.47, 59.64, 60.24, 60.84, 61.43, 62.05] },
  { group: "Aves", name: "Quali Avi Inicial", weightKg: 40, prices: [78.73, 80.30, 81.11, 81.92, 82.72, 83.55] },
  { group: "Aves", name: "Quali Avi Crescimento", weightKg: 40, prices: [75.74, 77.25, 78.03, 78.81, 79.58, 80.38] },
  { group: "Aves", name: "Quali Avi Final", weightKg: 40, prices: [73.08, 74.54, 75.29, 76.04, 76.79, 77.55] },
  { group: "Aves", name: "Quali Avi Postura", weightKg: 40, prices: [74.48, 75.97, 76.73, 77.50, 78.26, 79.04] },
  { group: "Aves", name: "Quali Avi Conc. Inicial", weightKg: 40, prices: [116.66, 118.99, 120.18, 121.38, 122.57, 123.80] },
  { group: "Aves", name: "Quali Avi Conc. Final", weightKg: 40, prices: [103.47, 105.54, 106.59, 107.66, 108.72, 109.80] },
  { group: "Suínos", name: "Quali Sui Inicial", weightKg: 40, prices: [69.85, 71.25, 71.96, 72.68, 73.39, 74.13] },
  { group: "Suínos", name: "Quali Sui Crescimento", weightKg: 40, prices: [66.61, 67.94, 68.62, 69.31, 69.99, 70.69] },
  { group: "Suínos", name: "Quali Sui Terminação", weightKg: 40, prices: [64.00, 65.28, 65.93, 66.59, 67.24, 67.92] },
  { group: "Suínos", name: "Quali Sui Reprodução", weightKg: 40, prices: [66.66, 67.99, 68.67, 69.36, 70.04, 70.74] },
  { group: "Suínos", name: "Quali Sui Conc. Inicial", weightKg: 40, prices: [83.66, 85.33, 86.19, 87.05, 87.90, 88.78] },
  { group: "Suínos", name: "Quali Sui Conc. Terminação", weightKg: 40, prices: [78.59, 80.16, 80.96, 81.77, 82.57, 83.40] },
];

export const mineralProducts: Product[] = [
  { group: "Mineral", name: "Quali phos 40 engorda", weightKg: 30, prices: [99.30, 101.29, 102.30, 103.32, 104.33, 105.38] },
  { group: "Mineral", name: "Quali phos 60 recria", weightKg: 30, prices: [124.68, 127.17, 128.45, 129.73, 131.00, 132.31] },
  { group: "Mineral", name: "Quali phos 80 cria", weightKg: 30, prices: [150.91, 153.93, 155.47, 157.02, 158.56, 160.15] },
  { group: "Mineral", name: "Quali phos 90 cria", weightKg: 30, prices: [166.06, 169.38, 171.08, 172.79, 174.48, 176.22] },
  { group: "Mineral", name: "Quali phos Leite Vit", weightKg: 30, prices: [165.94, 169.26, 170.95, 172.66, 174.35, 176.10] },
  { group: "Mineral", name: "Quali phos 130", weightKg: 25, prices: [184.53, 188.22, 190.10, 192.00, 193.89, 195.82] },
  { group: "Mineral", name: "Quali phos 160", weightKg: 25, prices: [213.40, 217.67, 219.84, 222.04, 224.22, 226.46] },
  { group: "Mineral", name: "Quali phos Equinos", weightKg: 30, prices: [130.88, 133.50, 134.83, 136.18, 137.52, 138.89] },
  { group: "Mineral", name: "Quali phos Ovinos", weightKg: 30, prices: [123.13, 125.59, 126.85, 128.12, 129.37, 130.67] },
  { group: "Mineral Aditivado", name: "Quali phos Engord +", weightKg: 30, prices: [148.92, 151.90, 153.42, 154.95, 156.47, 158.03] },
  { group: "Mineral Adensado", name: "Adense Engorda", weightKg: 30, prices: [102.95, 105.01, 106.06, 107.12, 108.17, 109.25] },
  { group: "Mineral Adensado", name: "Adense Recria", weightKg: 30, prices: [116.43, 118.76, 119.95, 121.15, 122.33, 123.56] },
  { group: "Mineral Adensado", name: "Adense Cria", weightKg: 30, prices: [130.47, 133.08, 134.41, 135.75, 137.08, 138.46] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Águas", weightKg: 30, prices: [66.35, 67.68, 68.35, 69.04, 69.71, 70.41] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Leite", weightKg: 30, prices: [76.49, 78.02, 78.80, 79.59, 80.37, 81.17] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Águas Recria", weightKg: 30, prices: [76.91, 78.45, 79.23, 80.03, 80.81, 81.62] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Águas MC", weightKg: 30, prices: [61.72, 62.95, 63.58, 64.22, 64.85, 65.50] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Engord +", weightKg: 30, prices: [81.24, 82.86, 83.69, 84.53, 85.36, 86.21] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto 30 Seca", weightKg: 30, prices: [71.22, 72.64, 73.37, 74.10, 74.83, 75.58] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto 30 Seca Recria", weightKg: 30, prices: [82.22, 83.86, 84.70, 85.55, 86.39, 87.25] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Seca MC", weightKg: 30, prices: [63.91, 65.19, 65.84, 66.50, 67.15, 67.82] },
  { group: "Proteinado (Nutri pasto)", name: "Nutri pasto Seca Vacada", weightKg: 30, prices: [69.03, 70.41, 71.11, 71.83, 72.53, 73.26] },
  { group: "Núcleos e Concentrados", name: "Quali conf 3 RM", weightKg: 30, prices: [100.86, 102.88, 103.91, 104.95, 105.97, 107.03] },
  { group: "Núcleos e Concentrados", name: "Quali conf Pasto", weightKg: 30, prices: [123.08, 125.54, 126.80, 128.06, 129.32, 130.61] },
  { group: "Núcleos e Concentrados", name: "Quali conf Leite", weightKg: 30, prices: [170.27, 173.68, 175.41, 177.17, 178.90, 180.69] },
  { group: "Núcleos e Concentrados", name: "Quali confina 10", weightKg: 30, prices: [128.63, 131.20, 132.51, 133.84, 135.15, 136.50] },
  { group: "Núcleos e Concentrados", name: "Quali conf 4 pasto", weightKg: 30, prices: [118.47, 120.84, 122.05, 123.27, 124.48, 125.72] },
];

export const products = [...rationProducts, ...mineralProducts];

export const juaraFreightRates: JuaraFreightRate[] = [
  { distance: "Até 25 km", bag25: 1.60, bag30: 1.90, bag40: 2.50, closedPerTon: 25 },
  { distance: "26 a 45 km", bag25: 2.45, bag30: 2.95, bag40: 3.90, closedPerTon: 38 },
  { distance: "46 a 70 km", bag25: 3.50, bag30: 4.20, bag40: 5.60, closedPerTon: 56 },
  { distance: "71 a 100 km", bag25: 3.75, bag30: 4.50, bag40: 6.00, closedPerTon: 85 },
  { distance: "101 a 150 km", bag25: 4.13, bag30: 4.95, bag40: 6.60, closedPerTon: 125 },
  { distance: "151 a 190 km", bag25: 5.00, bag30: 6.00, bag40: 8.00, closedPerTon: 165 },
];

export const regionalFreightRates: RegionalFreightRate[] = [
  { location: "Brasnorte até 35 km", fractionalPerTon: 210, closedPerTon: 185 },
  { location: "Brasnorte 36 a 60 km", fractionalPerTon: 228, closedPerTon: 196 },
  { location: "Brasnorte 61 a 90 km", fractionalPerTon: 255, closedPerTon: 224 },
  { location: "Aripuanã (mín. 10 t)", fractionalPerTon: null, closedPerTon: 446 },
  { location: "Cotriguaçu (mín. 10 t)", fractionalPerTon: null, closedPerTon: 446 },
  { location: "Juína até 35 km", fractionalPerTon: 237, closedPerTon: 182 },
  { location: "Juína 36 a 80 km", fractionalPerTon: 255, closedPerTon: 202 },
  { location: "Juína 81 a 110 km", fractionalPerTon: 283, closedPerTon: 237 },
  { location: "Juína 111 a 140 km", fractionalPerTon: 328, closedPerTon: 269 },
  { location: "Juruena (mín. 9 t)", fractionalPerTon: null, closedPerTon: 283 },
];

export const policySections: PolicySection[] = [
  { title: "1. Objetivo", content: "Regras comerciais das vendas diretas da fábrica Qualinutri: condições de pagamento, descontos por linha, prazos de produção e entrega, retirada, crédito, frete e logística. Objetivo: padronizar o atendimento e assegurar rentabilidade e previsibilidade." },
  { title: "2. Abrangência", content: "Toda a equipe comercial, administrativa, de produção e de logística, e todas as vendas diretas da fábrica. Cumprimento obrigatório." },
  { title: "3. Tabela de preços", content: "Preços conforme as Tabelas vigentes — Rações e Mineral/Proteinado/Núcleos (a partir de 03/09/2026), em R$ por saca. O preço “à vista” é a base para descontos e antecipações. Prevalece a tabela vigente na data do pedido." },
  { title: "4. Condições de pagamento", content: "À vista antecipado: +1,5% sobre o preço à vista. Havendo estoque, a retirada pode ser feita; não havendo, produção em até 15 dias. À vista: até 15 dias. A prazo: 30; 30/60 ou 45; 30/60/90 ou 60; 30/60/90/120 ou 75; 30/60/90/120/150 ou 90 dias — conforme a tabela." },
  { title: "5. Descontos por linha", content: "Ver a tabela de descontos. Aplicado sobre o preço de tabela, independente do pagamento. Frete e descarga sem desconto. Promoções podem mudar a qualquer momento. Acúmulo do 1,5% com o desconto de linha: só com aprovação do Gestor Comercial e da Diretoria." },
  { title: "6. Política de crédito", content: "Sem política de crédito oficializada. Novos clientes: à vista/antecipado até formar histórico; prazo caso a caso. A definir: critérios/limites, documentação e alçadas.", pending: true },
  { title: "7. Pedido mínimo", content: "O pedido mínimo é de 1 tonelada." },
  { title: "8. Pedidos e confirmação", content: "Pedidos por telefone e WhatsApp. Pedido por telefone confirmado por escrito no WhatsApp. Faturamento após confirmação e validação de cadastro." },
  { title: "9. Produção e prazos de entrega", content: "Em estoque: expedição conforme programação. Sem estoque: produção em até 15 dias. Prazos informados na confirmação." },
  { title: "10. Retirada de produtos (compra de retirada)", content: "Na compra de retirada, o cliente tem até 6 meses para retirar o produto na fábrica. Após os 6 meses, para manter armazenado, cobra-se R$ 1,00 por saco ao mês." },
  { title: "11. Frete e logística", content: "Fácil acesso: freteiro terceirizado. Difícil acesso: frota própria. Os valores seguem as Tabelas de Frete vigentes (Juara e Regional — 06/05/2026), na aba “Frete”. Frete e descarga sem desconto. Carga fechada = uma única entrega (10/18/28 t); fracionada = mais de uma entrega. Descarga por conta do cliente; produto descarregado acresce R$ 40,00/tonelada. Entrega mínima 1.000 kg por cliente. Conversão: ração = 25 sacos/t; mineral/proteico/núcleos = 33,33 sacos/t; concentrado 130/160 = 40 sacos/t." },
  { title: "12. Devoluções e trocas", content: "Solicitações com nota fiscal; avarias registradas no recebimento. Prazo para solicitação.", pending: true },
  { title: "13. Responsabilidades", content: "Gestor Comercial/Diretoria: aprovações, alçadas e casos omissos. Comercial: cadastro, pedidos e aplicação de tabela/descontos. Cibelly: estoque e custo de frete/margens. Rogério: compras e manutenção da frota. Produção: prazo de 15 dias e controle das retiradas." },
  { title: "14. Vigência e revisão", content: "Em vigor a partir da aprovação, por prazo indeterminado. Revisão a cada mudança de tabela/condições ou, no mínimo, anual. Aprovada pelo Gestor Comercial e pela Diretoria." },
];

export const localCommercialData: CommercialData = {
  paymentTermLabels,
  paymentTerms,
  discountLines,
  rationProducts,
  mineralProducts,
  products,
  juaraFreightRates,
  regionalFreightRates,
  handlingRatePerTon: 40,
  policyVersion: "1.2",
  policySections,
};
