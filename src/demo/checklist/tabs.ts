import {
  Beaker, ClipboardCheck, Bug, ClipboardList, FlaskConical, HardHat, PackageCheck, Route, ShieldAlert, Sparkles, TestTubes, Wrench, type LucideIcon,
} from "lucide-react";
import type { ChecklistTabId } from "./types";

export type FieldType = "text" | "number" | "select" | "date" | "textarea" | "boolean";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  /** Opções vindas dos cadastros. */
  source?: "suppliers" | "materials" | "employees" | "products" | "customers" | "loads" | "samples";
  required?: boolean;
  /** Padrão do insumo (min/max vêm do cadastro da matéria-prima). */
  standardParam?: string;
  /** Somado no custo do registro. */
  cost?: boolean;
  wide?: boolean;
};

export type TargetKind = "vehicle" | "equipment" | "employee" | "pestPoint" | "cleaningArea" | null;

export type TabDef = {
  id: ChecklistTabId;
  label: string;
  short: string;
  icon: LucideIcon;
  description: string;
  target: TargetKind;
  targetLabel?: string;
  /** Frequência esperada por alvo (dias). Sem registro dentro dela = pendente. */
  frequencyDays?: number;
  checks: string[];
  fields: FieldDef[];
  /** Etapas do fluxo (quadro arrastável). A última etapa encerra o registro. */
  stages?: string[];
  /** O que significa "fora de conformidade" nesta aba, em uma frase. */
  rule: string;
};

const CHECKLIST_TABS_ALL: TabDef[] = [
  {
    id: "maintenance", label: "Manutenção Preventiva", short: "Manutenção", icon: Wrench,
    description: "Checklist por veículo ou equipamento, custo acumulado, solicitações e lembrete de revisão.",
    target: "vehicle", targetLabel: "Veículo / equipamento", frequencyDays: 90,
    checks: ["Óleo do motor e filtros", "Pneus e calibragem", "Freios", "Luzes e sinalização", "Correias e mangueiras", "Arrefecimento", "Documentação em dia"],
    fields: [
      { key: "kind", label: "Tipo", type: "select", options: ["Preventiva", "Corretiva", "Solicitação"], required: true },
      { key: "odometer", label: "Km / horímetro", type: "number", unit: "km" },
      { key: "workshop", label: "Oficina / responsável técnico", type: "text" },
      { key: "parts", label: "Peças e serviços", type: "number", unit: "R$", cost: true },
      { key: "labor", label: "Mão de obra", type: "number", unit: "R$", cost: true },
      { key: "nextDate", label: "Próxima revisão (data)", type: "date" },
      { key: "nextKm", label: "Próxima revisão (km)", type: "number", unit: "km" },
    ],
    stages: ["Aberta", "Em execução", "Concluída"],
    rule: "Item do checklist reprovado ou revisão vencida.",
  },
  {
    id: "logistics", label: "Logística", short: "Logística", icon: Route,
    description: "Viagens, rotas e frota, com custo por entrega e por veículo.",
    target: "vehicle", targetLabel: "Veículo",
    checks: ["Carga conferida na saída", "Canhotos assinados", "Sem avarias na entrega"],
    fields: [
      { key: "driver", label: "Motorista", type: "select", source: "employees", required: true },
      { key: "load", label: "Carga vinculada", type: "select", source: "loads" },
      { key: "route", label: "Rota / cidades", type: "text", required: true, wide: true },
      { key: "km", label: "Km rodados", type: "number", unit: "km" },
      { key: "deliveries", label: "Entregas", type: "number", required: true },
      { key: "tons", label: "Toneladas", type: "number", unit: "t" },
      { key: "fuel", label: "Combustível", type: "number", unit: "R$", cost: true },
      { key: "tolls", label: "Pedágios", type: "number", unit: "R$", cost: true },
      { key: "perDiem", label: "Diárias e alimentação", type: "number", unit: "R$", cost: true },
    ],
    rule: "Avaria, canhoto faltando ou carga não conferida.",
  },
  {
    id: "safety", label: "Segurança do Trabalho", short: "EPIs", icon: HardHat,
    description: "Checklist mensal de EPIs por colaborador, com CA e validade.",
    target: "employee", targetLabel: "Colaborador", frequencyDays: 30,
    checks: ["Capacete", "Botina de segurança", "Luvas", "Protetor auricular", "Máscara PFF2", "Óculos de proteção", "Uniforme"],
    fields: [
      { key: "ca", label: "Nº do CA principal", type: "text" },
      { key: "caValidity", label: "Validade do CA", type: "date" },
      { key: "training", label: "Treinamento NR em dia", type: "boolean" },
    ],
    rule: "EPI ausente, CA vencido ou treinamento pendente.",
  },
  {
    id: "rawMaterials", label: "Matérias-Primas", short: "Recepção", icon: PackageCheck,
    description: "Entrada e avaliação na recepção (umidade, impurezas, aspecto) por fornecedor.",
    target: null,
    checks: ["Nota fiscal confere", "Lacre íntegro", "Sem odor estranho", "Sem presença de insetos"],
    fields: [
      { key: "supplier", label: "Fornecedor", type: "select", source: "suppliers", required: true },
      { key: "material", label: "Matéria-prima", type: "select", source: "materials", required: true },
      { key: "invoice", label: "Nota fiscal", type: "text" },
      { key: "plate", label: "Placa do caminhão", type: "text" },
      { key: "weight", label: "Peso recebido", type: "number", unit: "kg", required: true },
      { key: "moisture", label: "Umidade", type: "number", unit: "%", standardParam: "moisture" },
      { key: "impurities", label: "Impurezas", type: "number", unit: "%", standardParam: "impurities" },
      { key: "temperature", label: "Temperatura", type: "number", unit: "°C" },
      { key: "decision", label: "Decisão", type: "select", options: ["Aceito", "Aceito com ressalva", "Recusado"], required: true },
    ],
    rule: "Fora do padrão do insumo, checklist reprovado ou carga recusada.",
  },
  {
    id: "quality", label: "Qualidade", short: "Qualidade", icon: ShieldAlert,
    description: "Ocorrências com evidências, ação corretiva e relatório em tempo real.",
    target: null,
    checks: [],
    fields: [
      { key: "type", label: "Tipo", type: "select", options: ["Reclamação de cliente", "Desvio de processo", "Auditoria interna", "Fornecedor", "Instalações"], required: true },
      { key: "severity", label: "Gravidade", type: "select", options: ["Baixa", "Média", "Alta"], required: true },
      { key: "customer", label: "Cliente (se houver)", type: "select", source: "customers" },
      { key: "product", label: "Produto (se houver)", type: "select", source: "products" },
      { key: "description", label: "Descrição", type: "textarea", required: true, wide: true },
      { key: "action", label: "Ação corretiva", type: "textarea", wide: true },
      { key: "deadline", label: "Prazo", type: "date" },
    ],
    stages: ["Aberta", "Em tratamento", "Encerrada"],
    rule: "Ocorrência de gravidade alta ainda não encerrada ou prazo vencido.",
  },
  {
    id: "samples", label: "Produtos para Análises", short: "Amostras", icon: TestTubes,
    description: "Registro e rastreio das amostras até o laudo, com contraamostra.",
    target: null,
    checks: ["Identificada com etiqueta", "Lacrada", "Contraamostra guardada"],
    fields: [
      { key: "code", label: "Código da amostra", type: "text", required: true },
      { key: "kind", label: "Tipo", type: "select", options: ["Matéria-prima", "Produto acabado"], required: true },
      { key: "item", label: "Produto / insumo", type: "text", required: true },
      { key: "lot", label: "Lote", type: "text", required: true },
      { key: "lab", label: "Laboratório", type: "select", options: ["LabAgro Análises", "Laboratório interno", "Univ. Federal (convênio)"] },
      { key: "retention", label: "Reter até", type: "date" },
      { key: "result", label: "Resultado", type: "select", options: ["Aguardando", "Aprovada", "Reprovada"] },
    ],
    stages: ["Coletada", "Enviada", "Em análise", "Concluída"],
    rule: "Amostra reprovada ou sem identificação/contraamostra.",
  },
  {
    id: "rawAnalyses", label: "Controle de Análises de Matérias-Primas", short: "Análises MP", icon: FlaskConical,
    description: "Qualidade de entrada dos insumos por lote e fornecedor, com alerta fora do padrão.",
    target: null,
    checks: [],
    fields: [
      { key: "supplier", label: "Fornecedor", type: "select", source: "suppliers", required: true },
      { key: "material", label: "Insumo", type: "select", source: "materials", required: true },
      { key: "lot", label: "Lote", type: "text", required: true },
      { key: "protein", label: "Proteína bruta", type: "number", unit: "%", standardParam: "protein" },
      { key: "moisture", label: "Umidade", type: "number", unit: "%", standardParam: "moisture" },
      { key: "aflatoxin", label: "Aflatoxina", type: "number", unit: "ppb", standardParam: "aflatoxin" },
      { key: "impurities", label: "Impurezas", type: "number", unit: "%", standardParam: "impurities" },
    ],
    rule: "Algum parâmetro fora do padrão cadastrado para o insumo.",
  },
  {
    id: "results", label: "Controle dos Resultados das Análises", short: "Resultados", icon: Beaker,
    description: "Laudos vinculados a amostra, lote e fornecedor, com histórico por parâmetro.",
    target: null,
    checks: [],
    fields: [
      { key: "sample", label: "Amostra", type: "select", source: "samples" },
      { key: "report", label: "Nº do laudo", type: "text", required: true },
      { key: "lab", label: "Laboratório", type: "select", options: ["LabAgro Análises", "Laboratório interno", "Univ. Federal (convênio)"] },
      { key: "supplier", label: "Fornecedor", type: "select", source: "suppliers" },
      { key: "material", label: "Insumo / produto", type: "select", source: "materials" },
      { key: "lot", label: "Lote", type: "text" },
      { key: "protein", label: "Proteína bruta", type: "number", unit: "%", standardParam: "protein" },
      { key: "moisture", label: "Umidade", type: "number", unit: "%", standardParam: "moisture" },
      { key: "aflatoxin", label: "Aflatoxina", type: "number", unit: "ppb", standardParam: "aflatoxin" },
    ],
    rule: "Resultado do laudo fora do padrão do insumo/produto.",
  },
  {
    id: "production", label: "Envase, Contaminação Cruzada e Erros de Produção", short: "Produção", icon: ClipboardList,
    description: "Não conformidades de produção com causa, ação e encerramento.",
    target: null,
    checks: [],
    fields: [
      { key: "type", label: "Tipo", type: "select", options: ["Peso fora do padrão no envase", "Contaminação cruzada", "Rotulagem incorreta", "Mistura errada", "Embalagem danificada"], required: true },
      { key: "product", label: "Produto", type: "select", source: "products", required: true },
      { key: "lot", label: "Lote", type: "text", required: true },
      { key: "affected", label: "Sacas afetadas", type: "number" },
      { key: "cause", label: "Causa provável", type: "textarea", wide: true },
      { key: "action", label: "Ação tomada", type: "textarea", wide: true },
    ],
    stages: ["Aberta", "Em tratamento", "Encerrada"],
    rule: "Toda não conformidade aberta conta como fora de conformidade até ser encerrada.",
  },
  {
    id: "pests", label: "Controle de Pragas", short: "Pragas", icon: Bug,
    description: "Checklist semanal por ponto de isca, armadilha e luminosa.",
    target: "pestPoint", targetLabel: "Ponto de controle", frequencyDays: 7,
    checks: ["Isca/armadilha íntegra", "Sem sinais de roedores", "Sem insetos rasteiros", "Área ao redor limpa"],
    fields: [
      { key: "consumption", label: "Consumo de isca", type: "number", unit: "%" },
      { key: "company", label: "Empresa / técnico", type: "text" },
      { key: "certificate", label: "Nº do certificado", type: "text" },
    ],
    rule: "Sinal de praga, isca danificada ou consumo acima de 20%.",
  },
  {
    id: "cleaning", label: "Controle de Descarte (Limpeza)", short: "Limpeza", icon: Sparkles,
    description: "Rotinas de limpeza por área e descarte de resíduos com destino e MTR.",
    target: "cleaningArea", targetLabel: "Área", frequencyDays: 7,
    checks: ["Limpeza realizada", "Sanitizante aplicado", "Resíduos segregados", "Área liberada"],
    fields: [
      { key: "sanitizer", label: "Produto / sanitizante", type: "text" },
      { key: "waste", label: "Resíduo descartado", type: "number", unit: "kg" },
      { key: "wasteType", label: "Tipo de resíduo", type: "select", options: ["Varredura de ração", "Sacaria", "Embalagem plástica", "Resíduo orgânico", "Óleo / lubrificante"] },
      { key: "destination", label: "Destino", type: "select", options: ["Compostagem", "Reciclagem", "Aterro licenciado", "Coleta especial"] },
      { key: "mtr", label: "Nº do MTR", type: "text" },
    ],
    rule: "Etapa da limpeza não feita ou resíduo sem destino.",
  },
  {
    id: "fleetCheck", label: "Conferência de Frota", short: "Frota", icon: ClipboardCheck,
    description: "Conferência do veículo na saída e no retorno: item por item, com km, motorista e fotos.",
    target: "vehicle", targetLabel: "Veículo", frequencyDays: 7,
    checks: ["Pneus (calibragem e desgaste)", "Freios", "Luzes, setas e faróis", "Óleo e água no nível", "Sem vazamentos", "Extintor e triângulo", "Documentos (CRLV, ANTT)", "Cinto e tacógrafo", "Carroceria e lona", "Carroceria limpa (sem resto de carga)"],
    fields: [
      { key: "moment", label: "Momento", type: "select", options: ["Saída", "Retorno"], required: true },
      { key: "driver", label: "Motorista / condutor", type: "select", source: "employees", required: true },
      { key: "odometer", label: "Km / horímetro", type: "number", unit: "km", required: true },
      { key: "fuel", label: "Combustível", type: "select", options: ["Reserva", "1/4", "1/2", "3/4", "Cheio"] },
    ],
    rule: "Qualquer item reprovado na conferência.",
  },
];

/** Abas fora da demonstração (o motor continua suportando). */
const HIDDEN_TABS = new Set(["pests"]);
export const ALL_CHECKLIST_TABS = CHECKLIST_TABS_ALL;

export const CHECKLIST_TABS: TabDef[] = CHECKLIST_TABS_ALL.filter((tab) => !HIDDEN_TABS.has(tab.id));

export const TAB_BY_ID = Object.fromEntries(CHECKLIST_TABS_ALL.map((tab) => [tab.id, tab])) as Record<ChecklistTabId, TabDef>;
