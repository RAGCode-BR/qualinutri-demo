import { useAuth } from "../../app/AuthProvider";
import { AuthLayout } from "../../layouts/AuthLayout";

export function PendingAccessPage() {
  const { profile, signOut } = useAuth();
  return (
    <AuthLayout titleId="pendingTitle">
      <h1 id="pendingTitle">Acesso aguardando ativação</h1>
      <p className="auth-lead">A conta <strong>{profile?.login}</strong> foi criada, mas ainda precisa ser ativada por um administrador.</p>
      <button type="button" className="secondary-button auth-submit" onClick={() => void signOut()}>Sair</button>
    </AuthLayout>
  );
}
