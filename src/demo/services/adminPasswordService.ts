import { getDemoViewer } from "../app/session";
import { db, simulateLatency } from "../store/db";

export class AdminPasswordServiceError extends Error {
  constructor(message = "Não foi possível redefinir a senha.") {
    super(message);
    this.name = "AdminPasswordServiceError";
  }
}

export async function resetUserPassword(userId: string, temporaryPassword: string): Promise<void> {
  if (getDemoViewer().role !== "administrador") throw new AdminPasswordServiceError();
  if (temporaryPassword.length < 8) throw new AdminPasswordServiceError("A senha temporária precisa ter ao menos 8 caracteres.");
  await simulateLatency(null);
  db.write((tables) => {
    const profile = tables.profiles.find((item) => item.id === userId);
    if (profile) profile.mustChangePassword = true;
  });
}
