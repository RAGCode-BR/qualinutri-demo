import type { ProfileRole, UserProfile } from "../../types/auth";
import { db } from "../store/db";
import { DEMO_ADMIN_ID } from "../seed/people";

const ROLE_KEY = "qualinutri-demo:role";
const listeners = new Set<() => void>();

function readRole(): ProfileRole {
  try {
    const value = localStorage.getItem(ROLE_KEY);
    if (value === "administrador" || value === "comercial" || value === "consulta") return value;
  } catch { /* sem armazenamento */ }
  return "administrador";
}

let role: ProfileRole = readRole();

/** Perfil "logado" na demonstração: um usuário fictício de cada papel. */
export function getDemoViewer(): UserProfile {
  const users = db.read().profiles;
  const user = role === "administrador"
    ? users.find((item) => item.id === DEMO_ADMIN_ID)
    : users.find((item) => item.role === role && item.active);
  const chosen = user ?? users.find((item) => item.id === DEMO_ADMIN_ID) ?? users[0];
  return { id: chosen.id, login: chosen.login, displayName: chosen.displayName, role: chosen.role, active: true, mustChangePassword: false };
}

export function setDemoRole(next: ProfileRole) {
  role = next;
  try { localStorage.setItem(ROLE_KEY, next); } catch { /* sem armazenamento */ }
  for (const listener of [...listeners]) listener();
}

export function subscribeDemoSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function viewerName(): string {
  const viewer = getDemoViewer();
  return viewer.displayName || viewer.login;
}
