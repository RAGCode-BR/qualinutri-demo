import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ProfileRole, UserProfile } from "../types/auth";
import { isValidLogin, loginToInternalEmail } from "../features/auth/login";

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

function asRole(value: string): ProfileRole {
  if (value === "administrador" || value === "comercial") return value;
  return "consulta";
}

/** Perfil do usuário; `undefined` quando a busca falhou (ex.: queda de rede). */
async function fetchProfile(user: User): Promise<UserProfile | null | undefined> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,login,display_name,role,active,must_change_password")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return undefined;
  if (!data) return null;
  return {
    id: data.id,
    login: data.login,
    displayName: data.display_name,
    role: asRole(data.role),
    active: data.active,
    mustChangePassword: data.must_change_password,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function applySession(nextSession: Session | null) {
    setSession(nextSession);
    if (!nextSession) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const fetched = await fetchProfile(nextSession.user);
    // Falha de rede (ex.: na renovação do login a cada hora): mantém o perfil
    // que já estava carregado, para não derrubar a tela e o trabalho aberto.
    setProfile((current) => fetched === undefined
      ? (current?.id === nextSession.user.id ? current : null)
      : fetched);
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) void applySession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) void applySession(nextSession);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn: async (login, password) => {
      if (!supabase) return { success: false, message: "O sistema está sem conexão com o servidor. Contate o administrador." };
      if (!isValidLogin(login)) return { success: false, message: "Informe um login válido." };
      const { error } = await supabase.auth.signInWithPassword({ email: loginToInternalEmail(login), password });
      return error
        ? { success: false, message: "Login ou senha inválidos." }
        : { success: true, message: "Acesso realizado com sucesso." };
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut();
    },
    refreshProfile: async () => {
      if (!session) return;
      const fetched = await fetchProfile(session.user);
      if (fetched !== undefined) setProfile(fetched);
    },
  }), [loading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return value;
}
