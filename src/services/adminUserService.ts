import { supabase } from "../lib/supabase";
import type { ProfileRole } from "../types/auth";

export type CreateManagedUserInput = {
  login: string;
  password: string;
  displayName: string;
  role: ProfileRole;
  active: boolean;
};

export class AdminUserServiceError extends Error {
  constructor(message = "Não foi possível criar o usuário.") {
    super(message);
    this.name = "AdminUserServiceError";
  }
}

export async function createManagedUser(input: CreateManagedUserInput): Promise<void> {
  if (!supabase) throw new AdminUserServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  const { error } = await supabase.functions.invoke("create-user", { body: input });
  if (error) throw new AdminUserServiceError();
}
