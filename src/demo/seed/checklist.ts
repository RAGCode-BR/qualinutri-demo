import type { DemoTables } from "../store/types";
import { addDays, isoDate, isoDateTime, seededId } from "../store/ids";
import { evaluateStatus, targetsFor } from "../checklist/compliance";
import { CHECKLIST_TABS, TAB_BY_ID } from "../checklist/tabs";
import type { ChecklistRecord, ChecklistTables, ChecklistTabId, EvidenceRef, FieldValue } from "../checklist/types";
import { chance, int, pick, round2, type Rng } from "./random";

type Args = { rng: Rng; today: Date; tables: DemoTables };

function registry(rng: Rng): Omit<ChecklistTables, "records"> {
  const id = () => seededId(rng);
  return {
    materials: [
      { id: "mat-milho", name: "Milho em grão", standards: [{ param: "moisture", label: "Umidade", unit: "%", max: 14 }, { param: "protein", label: "Proteína", unit: "%", min: 7 }, { param: "aflatoxin", label: "Aflatoxina", unit: "ppb", max: 20 }, { param: "impurities", label: "Impurezas", unit: "%", max: 1.5 }] },
      { id: "mat-soja", name: "Farelo de soja", standards: [{ param: "moisture", label: "Umidade", unit: "%", max: 12.5 }, { param: "protein", label: "Proteína", unit: "%", min: 45 }, { param: "aflatoxin", label: "Aflatoxina", unit: "ppb", max: 20 }, { param: "impurities", label: "Impurezas", unit: "%", max: 1 }] },
      { id: "mat-sorgo", name: "Sorgo", standards: [{ param: "moisture", label: "Umidade", unit: "%", max: 13 }, { param: "protein", label: "Proteína", unit: "%", min: 8 }, { param: "aflatoxin", label: "Aflatoxina", unit: "ppb", max: 20 }, { param: "impurities", label: "Impurezas", unit: "%", max: 2 }] },
      { id: "mat-calcario", name: "Calcário calcítico", standards: [{ param: "moisture", label: "Umidade", unit: "%", max: 2 }, { param: "impurities", label: "Impurezas", unit: "%", max: 3 }] },
      { id: "mat-ureia", name: "Ureia pecuária", standards: [{ param: "moisture", label: "Umidade", unit: "%", max: 0.5 }, { param: "protein", label: "Equivalente proteico", unit: "%", min: 260 }] },
    ],
    suppliers: [
      { id: "sup-1", name: "Cerealista Planalto Norte", city: "Vale Verde", materials: ["mat-milho", "mat-sorgo"], active: true },
      { id: "sup-2", name: "Grãos Vale do Arinos", city: "Serra Azul", materials: ["mat-milho", "mat-soja"], active: true },
      { id: "sup-3", name: "Agro Sementes Rio Claro", city: "Rio Claro", materials: ["mat-milho"], active: true },
      { id: "sup-4", name: "MinerAgro Insumos", city: "Cuiabá", materials: ["mat-calcario", "mat-ureia"], active: true },
      { id: "sup-5", name: "Cooperativa Boa Esperança", city: "Boa Esperança", materials: ["mat-soja", "mat-sorgo"], active: true },
    ],
    employees: [
      ["Josué Ramos", "Operador de misturador", "Produção"], ["Edinaldo Prates", "Ensacador", "Envase"], ["Cleide Batista", "Analista de qualidade", "Laboratório"],
      ["Waldir Nunes", "Motorista", "Logística"], ["Rosimeire Lopes", "Auxiliar de limpeza", "Serviços gerais"], ["Adilson Moura", "Mecânico", "Manutenção"],
      ["Gilmar Teixeira", "Motorista", "Logística"], ["Tatiane Freitas", "Conferente", "Expedição"], ["Reginaldo Sá", "Operador de empilhadeira", "Expedição"],
      ["Luana Cardoso", "Auxiliar de produção", "Produção"],
    ].map(([name, role, sector]) => ({ id: id(), name, role, sector, active: true })),
    equipment: [
      { id: id(), name: "Misturador horizontal 2 t", kind: "Produção", location: "Galpão de fabricação", active: true },
      { id: id(), name: "Moinho de martelos", kind: "Produção", location: "Galpão de fabricação", active: true },
      { id: id(), name: "Ensacadeira automática", kind: "Envase", location: "Linha de envase", active: true },
      { id: id(), name: "Empilhadeira 2,5 t", kind: "Movimentação", location: "Expedição", active: true },
      { id: id(), name: "Strada · QCB-3D10", kind: "Veículo leve", location: "Comercial", active: true },
      { id: id(), name: "Hilux · QCD-7K44", kind: "Veículo leve", location: "Diretoria", active: true },
    ],
    pestPoints: [
      ...Array.from({ length: 8 }, (_, index) => ({ id: id(), code: `PI-${String(index + 1).padStart(2, "0")}`, kind: "Porta-isca", area: index < 4 ? "Perímetro externo" : "Armazém de grãos", active: true })),
      ...Array.from({ length: 3 }, (_, index) => ({ id: id(), code: `AL-${String(index + 1).padStart(2, "0")}`, kind: "Armadilha luminosa", area: index === 0 ? "Envase" : index === 1 ? "Fabricação" : "Expedição", active: true })),
    ],
    cleaningAreas: [
      { id: id(), name: "Linha de envase", frequencyDays: 1, sanitizer: "Álcool 70% + varredura", active: true },
      { id: id(), name: "Misturador e roscas", frequencyDays: 7, sanitizer: "Flushing com calcário", active: true },
      { id: id(), name: "Armazém de matéria-prima", frequencyDays: 7, sanitizer: "Varredura e aspiração", active: true },
      { id: id(), name: "Expedição e docas", frequencyDays: 3, sanitizer: "Varredura", active: true },
      { id: id(), name: "Laboratório", frequencyDays: 7, sanitizer: "Quaternário de amônio", active: true },
    ],
  };
}

const people = ["Cleide Batista", "Adilson Moura", "Tatiane Freitas", "Usuário Demonstração", "Josué Ramos"];
const evidenceLabels: Record<ChecklistTabId, string[]> = {
  maintenance: ["Foto – painel e km", "Nota da oficina", "Foto – pneus"],
  logistics: ["Canhotos assinados", "Cupom de combustível"],
  safety: ["Foto – EPIs completos", "Ficha de EPI assinada"],
  rawMaterials: ["Foto – carga na recepção", "Nota fiscal", "Leitura do determinador"],
  quality: ["Foto da ocorrência", "Relato do cliente"],
  samples: ["Etiqueta da amostra", "Foto – contraamostra"],
  rawAnalyses: ["Leitura NIR", "Kit de aflatoxina"],
  results: ["Laudo do laboratório (PDF)"],
  production: ["Foto do lote afetado", "Registro da balança"],
  pests: ["Foto do porta-isca", "Certificado da empresa"],
  cleaning: ["Foto – área limpa", "MTR do resíduo"],
};

function evidence(rng: Rng, tab: ChecklistTabId): EvidenceRef[] {
  const count = chance(rng, 0.75) ? int(rng, 1, 2) : 0;
  return Array.from({ length: count }, () => {
    const label = pick(rng, evidenceLabels[tab]);
    return { id: seededId(rng), name: `${label}.jpg`, type: "image/jpeg", size: int(rng, 180, 900) * 1024, placeholder: label };
  });
}

function checks(rng: Rng, tab: ChecklistTabId, failChance: number): Record<string, boolean> {
  const list = TAB_BY_ID[tab].checks;
  const failIndex = chance(rng, failChance) && list.length ? int(rng, 0, list.length - 1) : -1;
  return Object.fromEntries(list.map((item, index) => [item, index !== failIndex]));
}

function lot(rng: Rng) {
  return `L${int(rng, 2600, 2699)}-${int(rng, 10, 99)}`;
}

function valuesFor(rng: Rng, tab: ChecklistTabId, tables: DemoTables, base: Omit<ChecklistTables, "records">, date: Date, bad: boolean): Record<string, FieldValue> {
  const supplier = pick(rng, base.suppliers);
  const materialId = pick(rng, supplier.materials);
  const material = base.materials.find((item) => item.id === materialId)!;
  const std = (param: string) => material.standards.find((item) => item.param === param);
  const around = (param: string, normal: () => number, off: () => number) => (std(param) ? round2(bad && chance(rng, 0.7) ? off() : normal()) : null);
  const product = pick(rng, tables.catalog.products);
  switch (tab) {
    case "maintenance": {
      const kind = pick(rng, ["Preventiva", "Preventiva", "Corretiva", "Solicitação"]);
      return { kind, odometer: int(rng, 40, 380) * 1000, workshop: pick(rng, ["Auto Diesel Juruena", "Oficina interna", "Pneus Rota MT"]), parts: kind === "Solicitação" ? null : int(rng, 180, 4200), labor: kind === "Solicitação" ? null : int(rng, 120, 1800), nextDate: kind === "Preventiva" ? isoDate(addDays(date, 90)) : null, nextKm: null };
    }
    case "logistics": {
      const deliveries = int(rng, 1, 5);
      const km = int(rng, 60, 480);
      return { driver: pick(rng, base.employees.filter((item) => item.role === "Motorista")).id, load: null, route: `Juara → ${pick(rng, ["Vale Verde", "Serra Azul", "Rio Claro", "Boa Esperança", "Nova Aurora"])}${deliveries > 2 ? " → Porto Campo" : ""}`, km, deliveries, tons: round2(deliveries * (2 + rng() * 4)), fuel: round2(km * 2.3), tolls: chance(rng, 0.4) ? int(rng, 20, 90) : 0, perDiem: int(rng, 60, 220) };
    }
    case "safety":
      return { ca: String(int(rng, 10000, 49999)), caValidity: isoDate(addDays(date, bad && chance(rng, 0.4) ? -int(rng, 5, 60) : int(rng, 60, 700))), training: !(bad && chance(rng, 0.3)) };
    case "rawMaterials":
      return { supplier: supplier.id, material: material.id, invoice: String(int(rng, 10000, 99999)), plate: `${pick(rng, ["QBA", "RAX", "OBJ", "NJK"])}-${int(rng, 1, 9)}${pick(rng, ["A", "C", "F", "H"])}${int(rng, 10, 99)}`, weight: int(rng, 12, 38) * 1000, moisture: around("moisture", () => (std("moisture")!.max ?? 14) - 0.5 - rng() * 2, () => (std("moisture")!.max ?? 14) + 0.3 + rng() * 1.5), impurities: around("impurities", () => rng() * (std("impurities")!.max ?? 1) * 0.8, () => (std("impurities")!.max ?? 1) + rng()), temperature: int(rng, 24, 34), decision: bad && chance(rng, 0.4) ? "Recusado" : bad ? "Aceito com ressalva" : "Aceito" };
    case "quality":
      return { type: pick(rng, ["Reclamação de cliente", "Desvio de processo", "Auditoria interna", "Fornecedor", "Instalações"]), severity: bad ? "Alta" : pick(rng, ["Baixa", "Média"]), customer: chance(rng, 0.4) ? pick(rng, tables.customers).id : null, product: chance(rng, 0.5) ? product.id ?? null : null, description: pick(rng, ["Cliente relatou sacas com umidade.", "Peso médio do envase abaixo do especificado.", "Lote com coloração diferente do padrão.", "Falha no registro de temperatura do secador.", "Telha danificada sobre o armazém."]), action: pick(rng, ["Reanálise do lote e contato com o cliente.", "Calibração da balança e treinamento.", "Bloqueio do lote até laudo.", ""]), deadline: isoDate(addDays(date, int(rng, 3, 20))) };
    case "samples": {
      const kind = chance(rng, 0.6) ? "Matéria-prima" : "Produto acabado";
      return { code: `AM-${int(rng, 1000, 9999)}`, kind, item: kind === "Matéria-prima" ? material.name : product.name, lot: lot(rng), lab: pick(rng, ["LabAgro Análises", "Laboratório interno", "Univ. Federal (convênio)"]), retention: isoDate(addDays(date, 90)), result: bad ? "Reprovada" : "Aprovada" };
    }
    case "rawAnalyses":
    case "results": {
      const values: Record<string, FieldValue> = {
        supplier: supplier.id, material: material.id, lot: lot(rng),
        protein: around("protein", () => (std("protein")!.min ?? 7) + 0.3 + rng() * 1.5, () => (std("protein")!.min ?? 7) - 0.3 - rng()),
        moisture: around("moisture", () => (std("moisture")!.max ?? 14) - 0.4 - rng() * 2, () => (std("moisture")!.max ?? 14) + 0.2 + rng() * 1.5),
        aflatoxin: around("aflatoxin", () => round2(rng() * 12), () => 21 + rng() * 25),
      };
      if (tab === "rawAnalyses") values.impurities = around("impurities", () => rng() * (std("impurities")!.max ?? 1) * 0.8, () => (std("impurities")!.max ?? 1) + rng());
      else Object.assign(values, { sample: null, report: `LD-${int(rng, 20000, 29999)}`, lab: pick(rng, ["LabAgro Análises", "Laboratório interno", "Univ. Federal (convênio)"]) });
      return values;
    }
    case "production":
      return { type: pick(rng, ["Peso fora do padrão no envase", "Contaminação cruzada", "Rotulagem incorreta", "Mistura errada", "Embalagem danificada"]), product: product.id ?? null, lot: lot(rng), affected: int(rng, 5, 180), cause: pick(rng, ["Balança descalibrada.", "Sequência de produção sem flushing.", "Etiqueta do lote anterior.", "Erro de pesagem do premix."]), action: pick(rng, ["Reembalado e conferido.", "Lote segregado e reprocessado.", "Ajuste de procedimento e treinamento."]) };
    case "pests":
      return { consumption: bad ? int(rng, 25, 80) : int(rng, 0, 15), company: "Controle Pragas Bio MT", certificate: `CP-${int(rng, 100, 999)}` };
    case "cleaning":
      return { sanitizer: pick(rng, ["Álcool 70%", "Quaternário de amônio", "Varredura"]), waste: int(rng, 5, 180), wasteType: pick(rng, ["Varredura de ração", "Sacaria", "Embalagem plástica", "Resíduo orgânico"]), destination: bad && chance(rng, 0.5) ? null : pick(rng, ["Compostagem", "Reciclagem", "Aterro licenciado"]), mtr: chance(rng, 0.5) ? `MTR-${int(rng, 100000, 999999)}` : "" };
  }
}

/** Gera cadastros e 90 dias de histórico do módulo, com algumas pendências e não conformidades recentes. */
export function buildChecklist({ rng, today, tables }: Args): ChecklistTables {
  const base = registry(rng);
  const records: ChecklistRecord[] = [];
  const draftTables = { ...tables, checklist: { ...base, records } } as DemoTables;

  const push = (tab: ChecklistTabId, date: Date, targetId: string | null, targetLabel: string | null, bad: boolean) => {
    const def = TAB_BY_ID[tab];
    const values = valuesFor(rng, tab, draftTables, base, date, bad);
    const recordChecks = checks(rng, tab, bad ? 0.75 : 0);
    const ageDays = (today.getTime() - date.getTime()) / 86_400_000;
    let stage: string | null = null;
    if (def.stages) {
      const last = def.stages.length - 1;
      stage = ageDays > 12 ? def.stages[last] : def.stages[Math.min(last, int(rng, 0, last))];
      if (tab === "maintenance" && values.kind !== "Solicitação") stage = def.stages[last];
    }
    const at = isoDateTime(date);
    records.push({
      id: seededId(rng), tab, date: at, responsible: pick(rng, people), stage, targetId, targetLabel, values, checks: recordChecks,
      status: evaluateStatus(tab, { checks: recordChecks, values, stage }, draftTables, today),
      notes: bad ? pick(rng, ["Comunicado ao responsável.", "Aguardando ação corretiva.", ""]) : "", evidence: evidence(rng, tab), createdAt: at, updatedAt: at,
    });
  };

  const timeOn = (daysAgo: number) => {
    const date = addDays(today, -daysAgo);
    date.setHours(int(rng, 7, 17), int(rng, 0, 59), 0, 0);
    return date > today ? new Date(today.getTime() - int(rng, 10, 120) * 60_000) : date;
  };

  for (const tab of CHECKLIST_TABS) {
    const targets = targetsFor(tab.id, draftTables);
    if (tab.frequencyDays && targets.length) {
      for (const target of targets) {
        const frequency = tab.target === "cleaningArea" ? base.cleaningAreas.find((area) => area.id === target.id)!.frequencyDays : tab.frequencyDays;
        // Alguns alvos ficam atrasados de propósito (pendências do painel).
        const late = chance(rng, 0.18) ? frequency + int(rng, 1, Math.max(2, frequency)) : int(rng, 0, Math.max(0, frequency - 1));
        for (let daysAgo = late; daysAgo <= 90; daysAgo += frequency) {
          push(tab.id, timeOn(daysAgo), target.id, target.label, chance(rng, daysAgo < 20 ? 0.14 : 0.08));
        }
      }
      if (tab.id === "maintenance") {
        for (let index = 0; index < 4; index += 1) {
          const target = pick(rng, targets);
          push(tab.id, timeOn(int(rng, 0, 8)), target.id, target.label, chance(rng, 0.3));
        }
      }
      continue;
    }
    const perWeek = { logistics: 6, rawMaterials: 5, quality: 1.2, samples: 3, rawAnalyses: 4, results: 2.5, production: 0.8 }[tab.id as string] ?? 2;
    const total = Math.round((perWeek * 90) / 7);
    for (let index = 0; index < total; index += 1) {
      const daysAgo = int(rng, 0, 90);
      const target = tab.target ? pick(rng, targets) : null;
      const badChance = tab.id === "production" ? 1 : tab.id === "quality" ? 0.25 : 0.1;
      push(tab.id, timeOn(daysAgo), target?.id ?? null, target?.label ?? null, chance(rng, badChance));
    }
  }
  return { ...base, records: records.sort((a, b) => b.date.localeCompare(a.date)) };
}
