import type { Json } from "./database.types";

export type CustomerInput = {
  legalName: string;
  tradeName?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: Json | null;
  notes?: string | null;
};

export type QuoteCustomerSnapshot = {
  id: string;
  name: string;
  document: string | null;
};
