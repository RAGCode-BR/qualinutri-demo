import { supabase } from "../lib/supabase";
import type { ProfileRole, UserProfile } from "../types/auth";

export class ProfileServiceError extends Error {
  constructor(message = "Não foi possível atualizar os usuários.") {
    super(message);
    this.name = "ProfileServiceError";
  }
}

function requireClient() {
  if (!supabase) throw new ProfileServiceError("O sistema está sem conexão com o servidor. Contate o administrador.");
  return supabase;
}

export async function listProfiles(): Promise<UserProfile[]> {
  const { data, error } = await requireClient()
    .from("profiles")
    .select("id,login,display_name,role,active,must_change_password")
    .order("created_at");
  if (error || !data) throw new ProfileServiceError();
  return data.map((profile) => ({
    id: profile.id,
    login: profile.login,
    displayName: profile.display_name,
    role: profile.role as ProfileRole,
    active: profile.active,
    mustChangePassword: profile.must_change_password,
  }));
}

export async function updateProfileAccess(id: string, role: ProfileRole, active: boolean): Promise<void> {
  const { error } = await requireClient().from("profiles").update({ role, active }).eq("id", id);
  if (error) throw new ProfileServiceError();
}
