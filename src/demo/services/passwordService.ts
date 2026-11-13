import { simulateLatency } from "../store/db";

export class PasswordServiceError extends Error {
  constructor(message = "Não foi possível alterar a senha.") {
    super(message);
    this.name = "PasswordServiceError";
  }
}

/** A demonstração não tem login real: a troca de senha só é simulada. */
export async function changeInitialPassword(password: string): Promise<void> {
  if (password.length < 8) throw new PasswordServiceError("A senha precisa ter ao menos 8 caracteres.");
  await simulateLatency(null);
}
