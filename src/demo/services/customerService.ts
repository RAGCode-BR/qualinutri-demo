import { validatePhone } from "../../domain/contacts/brazilianPhone";
import { validateDocument } from "../../domain/documents/brazilianDocument";
import type { CustomerInput } from "../../types/customer";
import type { Json } from "../../types/database.types";
import { getDemoViewer } from "../app/session";
import { clone, db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import type { Row } from "../store/types";
import { nowIso, requireSeller } from "./common";

export type Customer = Row<"customers">;

export type CustomerSummary = Pick<Customer, "id" | "legal_name" | "trade_name" | "document" | "phone" | "email" | "active" | "legacy_code"> & {
  city: string | null;
  document_raw: string | null;
};

export class CustomerServiceError extends Error {
  constructor(message = "Não foi possível concluir a operação com o cliente.") {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function field(json: Json | null, key: string): string | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const value = (json as Record<string, Json | undefined>)[key];
  return typeof value === "string" && value.trim() ? value : null;
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

function basePayload(input: CustomerInput) {
  const legalName = input.legalName.trim();
  if (!legalName) throw new CustomerServiceError("Informe o nome ou a razão social do cliente.");
  return {
    legal_name: legalName,
    trade_name: input.tradeName?.trim() || null,
    email: input.email?.trim() || null,
    ...(input.address !== undefined && { address: input.address }),
    notes: input.notes?.trim() || null,
  };
}

function ensureUniqueDocument(document: string | null, exceptId: string | null) {
  if (!document) return;
  const digits = document.replace(/\D/g, "");
  const duplicate = db.read().customers.some((customer) => customer.active && customer.id !== exceptId && customer.document?.replace(/\D/g, "") === digits);
  if (duplicate) throw new CustomerServiceError("Já existe um cliente ativo com este CPF/CNPJ.");
}

export function toSummary(customer: Customer): CustomerSummary {
  return {
    id: customer.id,
    legal_name: customer.legal_name,
    trade_name: customer.trade_name,
    document: customer.document,
    phone: customer.phone,
    email: customer.email,
    active: customer.active,
    legacy_code: customer.legacy_code,
    city: field(customer.address, "city"),
    document_raw: field(customer.legacy_details, "document_raw"),
  };
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  requireSeller(CustomerServiceError);
  const payload = basePayload(input);
  const document = toValidDocument(input.document);
  const phone = toValidPhone(input.phone);
  ensureUniqueDocument(document, null);
  await simulateLatency(null);
  const at = nowIso();
  const customer: Customer = {
    id: newId(), ...payload, address: payload.address ?? null, document, phone, active: true,
    legacy_code: null, legacy_details: null, created_at: at, updated_at: at, created_by: getDemoViewer().id, updated_by: null,
  };
  db.write((tables) => { tables.customers.push(customer); });
  return clone(customer);
}

export async function updateCustomer(id: string, input: CustomerInput, previous?: Pick<Customer, "document" | "phone">): Promise<Customer> {
  requireSeller(CustomerServiceError);
  const payload = {
    ...basePayload(input),
    ...(changed(input.document, previous?.document) && { document: toValidDocument(input.document) }),
    ...(changed(input.phone, previous?.phone) && { phone: toValidPhone(input.phone) }),
  };
  if ("document" in payload) ensureUniqueDocument(payload.document ?? null, id);
  await simulateLatency(null);
  let updated: Customer | undefined;
  db.write((tables) => {
    const index = tables.customers.findIndex((customer) => customer.id === id);
    if (index < 0) return;
    updated = { ...tables.customers[index], ...payload, updated_at: nowIso(), updated_by: getDemoViewer().id };
    tables.customers[index] = updated;
  });
  if (!updated) throw new CustomerServiceError("Cliente não encontrado ou indisponível.");
  return clone(updated);
}

export function listCustomers(includeInactive = false): Promise<CustomerSummary[]> {
  return simulateLatency(() => {
    requireSeller(CustomerServiceError);
    return db.read().customers
      .filter((customer) => includeInactive || customer.active)
      .map(toSummary)
      .sort((a, b) => a.legal_name.localeCompare(b.legal_name, "pt-BR"));
  });
}

export async function getCustomer(id: string): Promise<Customer> {
  return simulateLatency(() => {
    const customer = db.read().customers.find((item) => item.id === id);
    if (!customer) throw new CustomerServiceError("Cliente não encontrado ou indisponível.");
    return clone(customer);
  });
}

export async function deactivateCustomer(id: string): Promise<void> {
  requireSeller(CustomerServiceError);
  await simulateLatency(null);
  db.write((tables) => {
    const customer = tables.customers.find((item) => item.id === id);
    if (customer) { customer.active = false; customer.updated_at = nowIso(); }
  });
}
