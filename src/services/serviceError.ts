export class CommercialDataServiceError extends Error {
  constructor(message = "Não foi possível carregar os dados comerciais.") {
    super(message);
    this.name = "CommercialDataServiceError";
  }
}

export function ensureData<T>(data: T | null, error: unknown): T {
  if (error || data === null) throw new CommercialDataServiceError();
  return data;
}
