import { isValidLogin } from "../../features/auth/login";
import type { ProfileRole } from "../../types/auth";
import { getDemoViewer } from "../app/session";
import { db, simulateLatency } from "../store/db";
import { newId } from "../store/ids";
import { nowIso } from "./common";

export type CreateManagedUserInput = { login: string; password: string; displayName: string; role: ProfileRole; active: boolean };

export class AdminUserServiceError extends Error {
  constructor(message = "Não foi possível criar o usuário.") {
    super(message);
    this.name = "AdminUserServiceError";
  }
}

/** Na demonstração, a conta é só registrada; a senha não é guardada. */
export async function createManagedUser(input: CreateManagedUserInput): Promise<void> {
  if (getDemoViewer().role !== "administrador") throw new AdminUserServiceError();
  const login = input.login.trim().toLowerCase();
  if (!isValidLogin(login)) throw new AdminUserServiceError("Informe um login válido.");
  if (input.password.length < 8) throw new AdminUserServiceError("A senha temporária precisa ter ao menos 8 caracteres.");
  if (db.read().profiles.some((profile) => profile.login === login)) throw new AdminUserServiceError("Já existe um usuário com este login.");
  await simulateLatency(null);
  db.write((tables) => {
    tables.profiles.push({ id: newId(), login, displayName: input.displayName.trim() || null, role: input.role, active: input.active, mustChangePassword: true, createdAt: nowIso() });
  });
}
