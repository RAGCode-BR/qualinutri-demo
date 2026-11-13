import { validatePhone } from "../domain/contacts/brazilianPhone";
import { validateDocument } from "../domain/documents/brazilianDocument";
import { supabase } from "../lib/supabase";
import type { CustomerInput } from "../types/customer";
import type { Database } from "../types/database.types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

/** Dados resumidos para listas e seletores; a ficha completa vem de getCustomer. */
export type CustomerSummary = Pick<Customer, "id" | "legal_name" | "trade_name" | "document" | "phone" | "email" | "active" | "legacy_code"> & {
  city: string | null;
  /** Documento original do cadastro antigo, quando o CPF/CNPJ não pôde ser validado. */
  document_raw: string | null;
};

const SUMMARY_COLUMNS = "id,legal_name,trade_name,document,phone,email,active,legacy_code,city:address->>city,document_raw:legacy_details->>document_raw";
const LIST_CACHE_MS = 2 * 60_000;
const listCache = new Map<boolean, { at: number; request: Promise<CustomerSummary[]> }>();

/** Esquece a lista guardada; chamada a cada cliente criado, editado ou desativado. */
function invalidateCustomerList() {
  listCache.clear();
}

export class CustomerServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com o cliente.") {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function requireClient() {
  if (!supabase) throw new CustomerServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

/** Erros de validação do banco (22023) já vêm com mensagem para o usuário. */
function toServiceError(error: { code?: string; message?: string } | null) {
  if (error?.code === "23505") return new CustomerServiceError("Já existe um cliente ativo com este CPF/CNPJ.");
  if (error?.code === "22023" && error.message) return new CustomerServiceError(error.message);
  return new CustomerServiceError();
}

function toValidDocument(value: string | null | undefined) {
  const document = validateDocument(value);
  if (!document.valid) throw new CustomerServiceError(document.message);
  return document.formatted;
}

function toValidPhone(value: string | null | undefined) {
  const phone = validatePhone(value);
  if (!phone.valid) throw new CustomerServiceError(phone.message);
  return phone.formatted;
}

function changed(next: string | null | undefined, previous: string | null | undefined) {
  return (next?.trim() || null) !== (previous?.trim() || null);
}

function toCustomerPayload(input: CustomerInput) {
  const legalName = input.legalName.trim();
  if (!legalName) throw new CustomerServiceError("Informe o nome ou a razão social do cliente.");
  return {
    legal_name: legalName,
    trade_name: input.tradeName?.trim() || null,
    email: input.email?.trim() || null,
    // Endereço só é enviado quando vem no formulário, para não apagar o que já existe.
    ...(input.address !== undefined && { address: input.address }),
    notes: input.notes?.trim() || null,
  };
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const client = requireClient();
  const { data, error } = await client
    .from("customers")
    .insert({ ...toCustomerPayload(input), document: toValidDocument(input.document), phone: toValidPhone(input.phone) })
    .select("*")
    .single();
  if (error || !data) throw toServiceError(error);
  invalidateCustomerList();
  return data;
}

/**
 * `previous` traz documento e telefone salvos. Campos que não mudaram não são
 * validados nem enviados: cadastros antigos fora do padrão continuam editáveis.
 */
export async function updateCustomer(
  id: string,
  input: CustomerInput,
  previous?: Pick<Customer, "document" | "phone">,
): Promise<Customer> {
  const client = requireClient();
  const payload = {
    ...toCustomerPayload(input),
    ...(changed(input.document, previous?.document) && { document: toValidDocument(input.document) }),
    ...(changed(input.phone, previous?.phone) && { phone: toValidPhone(input.phone) }),
  };
  const { data, error } = await client
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw toServiceError(error);
  invalidateCustomerList();
  return data;
}

async function fetchCustomerList(includeInactive: boolean): Promise<CustomerSummary[]> {
  const client = requireClient();
  const pageSize = 500;
  const customers: CustomerSummary[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("customers").select(SUMMARY_COLUMNS).order("legal_name").order("id").range(offset, offset + pageSize - 1);
    if (!includeInactive) query = query.eq("active", true);
    const { data, error } = await query;
    if (error || !data) throw new CustomerServiceError();
    customers.push(...(data as unknown as CustomerSummary[]));
    if (data.length < pageSize) return customers;
  }
}

/**
 * Lista resumida de clientes, buscada em páginas de 500 (limite da API).
 * Calculadora, Orçamentos, Visitas e Clientes compartilham a mesma resposta
 * por 2 minutos, em vez de baixar a lista inteira a cada tela.
 */
export function listCustomers(includeInactive = false): Promise<CustomerSummary[]> {
  const cached = listCache.get(includeInactive);
  if (cached && Date.now() - cached.at < LIST_CACHE_MS) return cached.request;
  const request = fetchCustomerList(includeInactive);
  listCache.set(includeInactive, { at: Date.now(), request });
  // Falha não fica guardada: a próxima chamada tenta de novo.
  request.catch(() => { if (listCache.get(includeInactive)?.request === request) listCache.delete(includeInactive); });
  return request;
}

export async function getCustomer(id: string): Promise<Customer> {
  const client = requireClient();
  const { data, error } = await client.from("customers").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new CustomerServiceError("Cliente não encontrado ou indisponível.");
  return data;
}

export async function deactivateCustomer(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("customers").update({ active: false }).eq("id", id);
  if (error) throw new CustomerServiceError();
  invalidateCustomerList();
}
