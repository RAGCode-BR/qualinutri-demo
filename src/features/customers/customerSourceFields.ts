import type { Json } from "../../types/database.types";

export function sourceField(value: Json | null, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}
