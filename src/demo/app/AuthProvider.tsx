import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { ProfileRole, UserProfile } from "../../types/auth";
import { db } from "../store/db";
import { getDemoViewer, setDemoRole, subscribeDemoSession } from "./session";

type AuthResult = { success: boolean; message: string };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (login: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Demonstração: sempre "logado"; o perfil pode ser trocado no menu do usuário. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => getDemoViewer());

  useEffect(() => {
    // Só troca o objeto quando o usuário muda de fato (evita redesenhar tudo a cada gravação).
    const refresh = () => setProfile((current) => {
      const next = getDemoViewer();
      return next.id === current.id && next.role === current.role && next.displayName === current.displayName && next.login === current.login ? current : next;
    });
    const offSession = subscribeDemoSession(refresh);
    const offDb = db.subscribe(refresh);
    return () => { offSession(); offDb(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = { id: profile.id, app_metadata: {}, user_metadata: {}, aud: "demo", created_at: "" } as User;
    const session = { user, access_token: "demo", refresh_token: "demo", expires_in: 3600, token_type: "bearer" } as Session;
    return {
      session,
      user,
      profile,
      loading: false,
      signIn: async () => ({ success: true, message: "Acesso realizado com sucesso." }),
      signOut: async () => setDemoRole("administrador"),
      refreshProfile: async () => setProfile((current) => { const next = getDemoViewer(); return next.id === current.id && next.role === current.role ? current : next; }),
    };
  }, [profile]);

  // Trocar de perfil equivale a sair e entrar com outro usuário: o app recomeça do zero com o
  // perfil novo (como no sistema real), sem telas presas ao perfil anterior.
  return <AuthContext.Provider value={value}><Fragment key={`${profile.id}:${profile.role}`}>{children}</Fragment></AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return value;
}

export function useDemoSession(): { profile: UserProfile; switchRole: (role: ProfileRole) => void; resetData: () => void } {
  const { profile } = useAuth();
  return {
    profile: profile ?? getDemoViewer(),
    switchRole: setDemoRole,
    resetData: () => db.reset(),
  };
}
