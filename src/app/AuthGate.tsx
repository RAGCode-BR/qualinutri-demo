import { useAuth } from "./AuthProvider";
import { CommercialDataProvider } from "./CommercialDataProvider";
import { App } from "./App";
import { AuthPage } from "../features/auth/AuthPage";
import { ChangePasswordPage } from "../features/auth/ChangePasswordPage";
import { PendingAccessPage } from "../features/auth/PendingAccessPage";

export function AuthGate() {
  const { loading, user, profile } = useAuth();
  if (loading) return <main className="app-loading"><p>Carregando acesso…</p></main>;
  if (!user) return <AuthPage />;
  if (profile?.mustChangePassword) return <ChangePasswordPage />;
  if (!profile?.active) return <PendingAccessPage />;
  return <CommercialDataProvider><App /></CommercialDataProvider>;
}
