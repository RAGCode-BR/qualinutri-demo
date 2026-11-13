import type { Payable } from "../store/types";
import { addDays, isoDate, isoDateTime, seededId } from "../store/ids";
import { chance, int, pick, round2, type Rng } from "./random";

const templates: Array<Pick<Payable, "supplier" | "category"> & { description: string; min: number; max: number }> = [
  { supplier: "Cerealista Planalto Norte", category: "Matéria-prima", description: "Milho em grão — lote", min: 38000, max: 92000 },
  { supplier: "Grãos Vale do Arinos", category: "Matéria-prima", description: "Farelo de soja — lote", min: 45000, max: 120000 },
  { supplier: "MinerAgro Insumos", category: "Matéria-prima", description: "Premix mineral", min: 12000, max: 36000 },
  { supplier: "Embalagens Centro-Oeste", category: "Matéria-prima", description: "Sacaria ráfia 25/30/40 kg", min: 6000, max: 18000 },
  { supplier: "Auto Diesel Juruena", category: "Manutenção da frota", description: "Revisão preventiva", min: 1800, max: 9500 },
  { supplier: "Pneus Rota MT", category: "Manutenção da frota", description: "Pneus e alinhamento", min: 2400, max: 14000 },
  { supplier: "Transportadora Sinop Cargas", category: "Frete", description: "Frete terceirizado", min: 3200, max: 11000 },
  { supplier: "Controle Pragas Bio MT", category: "Serviços", description: "Controle integrado de pragas — mensal", min: 1450, max: 1450 },
  { supplier: "LabAgro Análises", category: "Serviços", description: "Laudos de bromatologia e micotoxinas", min: 900, max: 4200 },
  { supplier: "Energisa (simulado)", category: "Energia", description: "Energia elétrica da fábrica", min: 18000, max: 26000 },
];

export function buildPayables(rng: Rng, today: Date): Payable[] {
  const payables: Payable[] = [];
  for (let index = 0; index < 42; index += 1) {
    const template = pick(rng, templates);
    const due = addDays(today, int(rng, -60, 30));
    const overdue = due < today;
    const paid = overdue && !chance(rng, 0.12);
    payables.push({
      id: seededId(rng),
      supplier: template.supplier,
      category: template.category,
      description: `${template.description}${template.category === "Matéria-prima" ? ` ${int(rng, 100, 999)}` : ""}`,
      dueDate: isoDate(due),
      amount: round2(template.min + rng() * (template.max - template.min)),
      paidAt: paid ? isoDateTime(due) : null,
    });
  }
  return payables.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
