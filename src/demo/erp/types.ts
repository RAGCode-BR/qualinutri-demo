export type BankId = "sicoob" | "itau";

export type Bank = {
  id: BankId;
  name: string;
  balance: number;
  /** Taxa de desconto de duplicatas ao mês (%). */
  monthlyRate: number;
  /** Tarifa fixa por título descontado (R$). */
  feePerTitle: number;
};

/** Título descontado (antecipado) — valor exato, boleto a boleto. */
export type AnticipatedTitle = { key: string; quoteId: string; customer: string; dueDate: string; amount: number; days: number; interest: number; iof: number; fee: number; net: number };
export type Anticipation = { id: string; bank: BankId; date: string; titles: AnticipatedTitle[]; gross: number; interest: number; iof: number; fees: number; net: number };

export type StatementLine = { id: string; bank: BankId; date: string; description: string; amount: number; matched: string | null; suggestion: string | null };

export type IeStatus = "ativa" | "suspensa" | "baixada";
export type IeRecord = { customerId: string; ie: string; status: IeStatus; checkedAt: string };

export type Invoice = {
  id: string;
  number: number;
  quoteId: string;
  customer: string;
  customerId: string | null;
  value: number;
  date: string;
  status: "autorizada" | "rejeitada" | "cancelada";
  protocol: string | null;
  rejection: string | null;
};

export type Mdfe = { id: string; number: number; loadId: string; vehicle: string; plate: string | null; driver: string; invoices: number[]; date: string; status: "autorizado" | "encerrado" | "cancelado" };

export type FleetRequest = {
  id: string;
  vehicle: string;
  date: string;
  problem: string;
  requestedBy: string;
  quotes: { shop: string; value: number; days: number }[];
  chosen: number | null;
  status: "aguardando" | "aprovado" | "recusado" | "concluido";
  decidedBy: string | null;
  context: string | null;
};

export type Trip = { id: string; vehicle: string; date: string; customer: string; city: string; km: number; tons: number; freightCharged: number; fuel: number; tolls: number; driver: string; incident: string | null };

export type Material = { id: string; name: string; unit: "kg"; stockKg: number; minKg: number; pricePerKg: number; location: string };
export type Formula = { id: string; product: string; ingredients: { material: string; pct: number }[]; version: string; updatedAt: string; author: string };
export type ProductionOrder = { id: string; number: number; product: string; bags: number; bagKg: number; status: "planejada" | "em_producao" | "concluida"; date: string; operator: string; formulaIngredients?: { material: string; pct: number }[] };
export type FinishedStock = { product: string; bags: number; reserved: number; location: string };

export type Approval = {
  id: string;
  kind: "cadastro" | "desconto" | "credito" | "conserto";
  title: string;
  detail: string;
  requestedBy: string;
  date: string;
  status: "pendente" | "aprovado" | "recusado";
  decidedBy: string | null;
  ref: string | null;
};

export type ChatMessage = { id: string; thread: string; author: string; text: string; at: string };

export type ErpTables = {
  banks: Bank[];
  anticipations: Anticipation[];
  statement: StatementLine[];
  ie: IeRecord[];
  invoices: Invoice[];
  mdfe: Mdfe[];
  fleetRequests: FleetRequest[];
  trips: Trip[];
  materials: Material[];
  formulas: Formula[];
  orders: ProductionOrder[];
  finished: FinishedStock[];
  approvals: Approval[];
  chat: ChatMessage[];
  monthlyGoal: number;
  seq: { invoice: number; mdfe: number; order: number };
};

export function emptyErp(): ErpTables {
  return { banks: [], anticipations: [], statement: [], ie: [], invoices: [], mdfe: [], fleetRequests: [], trips: [], materials: [], formulas: [], orders: [], finished: [], approvals: [], chat: [], monthlyGoal: 0, seq: { invoice: 0, mdfe: 0, order: 0 } };
}
