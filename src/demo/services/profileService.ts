import type { ProfileRole, UserProfile } from "../../types/auth";
import { getDemoViewer } from "../app/session";
import { db, simulateLatency } from "../store/db";

export class ProfileServiceError extends Error {
  constructor(message = "Não foi possível atualizar os usuários.") {
    super(message);
    this.name = "ProfileServiceError";
  }
}

export async function listProfiles(): Promise<UserProfile[]> {
  if (getDemoViewer().role !== "administrador") throw new ProfileServiceError();
  return simulateLatency(() => [...db.read().profiles]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ createdAt: _createdAt, ...profile }) => ({ ...profile })));
}

export async function updateProfileAccess(id: string, role: ProfileRole, active: boolean): Promise<void> {
  if (getDemoViewer().role !== "administrador") throw new ProfileServiceError();
  const profiles = db.read().profiles;
  const target = profiles.find((profile) => profile.id === id);
  if (!target) throw new ProfileServiceError();
  const remainingAdmins = profiles.filter((profile) => profile.id !== id && profile.active && profile.role === "administrador").length;
  if (target.role === "administrador" && target.active && (role !== "administrador" || !active) && remainingAdmins === 0) {
    throw new ProfileServiceError("O último administrador ativo não pode ser desativado nem rebaixado.");
  }
  await simulateLatency(null);
  db.write((tables) => {
    const profile = tables.profiles.find((item) => item.id === id);
    if (profile) { profile.role = role; profile.active = active; }
  });
}
