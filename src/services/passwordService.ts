import { supabase } from "../lib/supabase";

export class PasswordServiceError extends Error {
  constructor(message = "Não foi possível alterar a senha.") {
    super(message);
    this.name = "PasswordServiceError";
  }
}

export async function changeInitialPassword(password: string): Promise<void> {
  if (!supabase) throw new PasswordServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  const { error } = await supabase.functions.invoke("change-initial-password", {
    body: { password },
  });
  if (error) throw new PasswordServiceError();
}
