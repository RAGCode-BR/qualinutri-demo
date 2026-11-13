import type { DemoTables } from "../store/types";
import type { ChatMessage, ChatThread } from "../erp/types";
import { isoDateTime, stableHash } from "../store/ids";
import { customerScore } from "../erp/finance";

export const TEAM = {
  ana: "Ana (administrativo)",
  carla: "Carla Mendes (comercial)",
  rafael: "Rafael Prado (comercial)",
  cibelly: "Cibelly (financeiro)",
  rogerio: "Rogério (logística)",
  cassio: "Cássio (produção)",
  joao: "João Henrique (qualidade)",
  agnaldo: "Agnaldo (diretoria)",
  daniel: "Daniel (comercial)",
} as const;

export const CHANNELS: { id: string; title: string; members: string[] }[] = [
  { id: "geral", title: "Geral", members: Object.values(TEAM) },
  { id: "canal:comercial", title: "Comercial", members: [TEAM.carla, TEAM.rafael, TEAM.daniel, TEAM.ana] },
  { id: "canal:financeiro", title: "Financeiro", members: [TEAM.cibelly, TEAM.ana, TEAM.agnaldo] },
  { id: "canal:logistica", title: "Logística e frota", members: [TEAM.rogerio, TEAM.cassio, TEAM.daniel] },
  { id: "canal:producao", title: "Produção e qualidade", members: [TEAM.cassio, TEAM.joao, TEAM.agnaldo] },
];

/**
 * Cria as conversas de exemplo na primeira leitura (também em dados já salvos de versões
 * anteriores da demo, sem apagar nada). Devolve true quando alterou as tabelas.
 */
export function ensureChat(tables: DemoTables, now: Date): boolean {
  if (tables.erp.threads) return false;
  const at = (hoursAgo: number) => isoDateTime(new Date(now.getTime() - hoursAgo * 3_600_000));
  const threads: ChatThread[] = CHANNELS.map((channel) => ({ id: channel.id, kind: "canal", title: channel.title, customerId: null, ref: null, members: channel.members, createdBy: TEAM.agnaldo, createdAt: at(24 * 30) }));
  const messages: Omit<ChatMessage, "id">[] = [];
  const say = (thread: string, author: string, text: string, hoursAgo: number, attachments?: ChatMessage["attachments"]) => messages.push({ thread, author, text, at: at(hoursAgo), ...(attachments ? { attachments } : {}) });

  say("canal:comercial", TEAM.carla, "Bom dia! Fechei 3 pedidos ontem na região de Novo Horizonte, já estão em Orçamentos.", 26);
  say("canal:comercial", TEAM.rafael, "Show. Alguém sabe se a tabela nova de frete Regional já está valendo?", 25);
  say("canal:comercial", TEAM.ana, "Está sim, desde segunda. A Calculadora já puxa os valores novos.", 24.5);
  say("canal:financeiro", TEAM.cibelly, "Borderô do Itaú de hoje: 6 títulos, valor exato batendo com o banco. 👍", 20);
  say("canal:financeiro", TEAM.agnaldo, "Ótimo. Me manda o resumo do faturado × antecipado do mês quando puder.", 19);
  say("canal:logistica", TEAM.rogerio, "Graneleiro 02 voltou da oficina, liberado para amanhã.", 30);
  say("canal:logistica", TEAM.cassio, "Produção do Engorda fecha às 15h, dá pra carregar no fim da tarde.", 6);
  say("canal:producao", TEAM.joao, "Recepção: milho da Cerealista com 15,2% de umidade, segurei o lote.", 9, [{ id: null, name: "laudo-umidade-milho.pdf", type: "application/pdf", size: 182_000 }]);
  say("canal:producao", TEAM.cassio, "Beleza, uso o lote anterior na fórmula de hoje.", 8.5);

  // Conversas sobre clientes: um com atraso (crédito) e um com entrega marcada.
  const active = tables.customers.filter((customer) => customer.active);
  const scored = active.map((customer) => ({ customer, score: customerScore(tables, customer.id, now) })).sort((a, b) => a.score.score - b.score.score);
  const late = scored[0]?.customer;
  const delivery = (() => {
    const load = tables.loads.find((item) => item.status === "planned") ?? tables.loads[0];
    const quoteId = tables.load_items.find((item) => item.load_id === load?.id)?.quote_id;
    const customerId = tables.quotes.find((quote) => quote.id === quoteId)?.customer_id;
    return { load, customer: active.find((customer) => customer.id === customerId) ?? scored[scored.length - 1]?.customer };
  })();
  const nameOf = (customer: { legal_name: string; trade_name?: string | null } | undefined) => customer ? customer.trade_name || customer.legal_name : "Cliente";

  if (late) {
    const id = `cliente:${late.id}`;
    threads.push({ id, kind: "cliente", title: nameOf(late), customerId: late.id, ref: null, members: [TEAM.ana, TEAM.cibelly, TEAM.rafael], createdBy: TEAM.ana, createdAt: at(50) });
    say(id, TEAM.rafael, `${nameOf(late)} quer fechar um pedido novo de 200 sacas. Posso seguir?`, 49);
    say(id, TEAM.cibelly, "Segura um pouco: tem boleto vencido há mais de 5 dias. O score já está vermelho.", 48);
    say(id, TEAM.ana, "Liguei para eles, prometeram pagar até sexta. Anexei o print da conversa.", 47, [{ id: null, name: "print-whatsapp-cliente.png", type: "image/png", size: 96_000 }]);
    say(id, TEAM.rafael, "Combinado, deixo o orçamento como rascunho até o pagamento cair.", 3);
  }
  if (delivery.customer) {
    const id = `cliente:${delivery.customer.id}`;
    if (!threads.some((thread) => thread.id === id)) {
      threads.push({ id, kind: "cliente", title: nameOf(delivery.customer), customerId: delivery.customer.id, ref: null, members: [TEAM.rogerio, TEAM.carla], createdBy: TEAM.carla, createdAt: at(30) });
      say(id, TEAM.carla, "O cliente pediu para entregar antes das 10h, a porteira fecha no almoço.", 28);
      say(id, TEAM.rogerio, "Anotado, coloco como 1ª entrega do roteiro.", 27);
    }
  }

  // Conversas por assunto, ligadas a orçamento e carga.
  const quote = tables.quotes.filter((item) => item.status === "issued").sort((a, b) => b.quote_number - a.quote_number)[0];
  if (quote) {
    const id = `assunto:desconto-${quote.quote_number}`;
    threads.push({ id, kind: "assunto", title: `Desconto no orçamento #${quote.quote_number}`, customerId: quote.customer_id, ref: { type: "quote", id: quote.id, label: `Orçamento #${quote.quote_number}` }, members: [TEAM.carla, TEAM.agnaldo], createdBy: TEAM.carla, createdAt: at(5) });
    say(id, TEAM.carla, `O cliente do #${quote.quote_number} pediu 2% a mais de desconto para fechar hoje. Dá?`, 5);
    say(id, TEAM.agnaldo, "Se for à vista, pode dar. Parcelado, mantém a tabela.", 1.5);
  }
  if (delivery.load) {
    const id = `assunto:carga-${delivery.load.load_number}`;
    threads.push({ id, kind: "assunto", title: `Saída da carga #${delivery.load.load_number}`, customerId: null, ref: { type: "load", id: delivery.load.id, label: `Carga #${delivery.load.load_number}` }, members: [TEAM.rogerio, TEAM.cassio, TEAM.daniel], createdBy: TEAM.rogerio, createdAt: at(12) });
    say(id, TEAM.rogerio, `Carga #${delivery.load.load_number} no ${delivery.load.vehicle_name_snapshot}: ${Math.round(delivery.load.total_weight_kg / 100) / 10} t. Falta separar algum produto?`, 12);
    say(id, TEAM.cassio, "Tudo separado no pátio. Só falta o romaneio impresso.", 2);
  }
  threads.push({ id: "assunto:conserto-graneleiro-02", kind: "assunto", title: "Conserto do Graneleiro 02", customerId: null, ref: null, members: [TEAM.rogerio, TEAM.agnaldo], createdBy: TEAM.rogerio, createdAt: at(72) });
  say("assunto:conserto-graneleiro-02", TEAM.rogerio, "Vazamento no cárter. Pedi 3 orçamentos, o menor é da Auto Diesel Juruena.", 72, [{ id: null, name: "orcamento-auto-diesel.pdf", type: "application/pdf", size: 240_000 }]);
  say("assunto:conserto-graneleiro-02", TEAM.agnaldo, "Aprovado. Manda fazer.", 70);

  tables.erp.chat.push(...messages.map((message, index) => ({ ...message, id: `chat-seed-${index}-${stableHash(message.thread + message.text) % 100000}` })));
  tables.erp.threads = threads;
  // Já lido até 4 horas atrás: as mensagens mais novas aparecem como não lidas.
  tables.erp.chatReads = Object.fromEntries([...threads.map((thread) => thread.id), "geral"].map((id) => [id, at(4)]));
  return true;
}
