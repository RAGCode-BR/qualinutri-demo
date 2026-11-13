import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { AuthLayout } from "../../layouts/AuthLayout";

export function AuthPage() {
  const { signIn } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    const result = await signIn(login, password);
    setFeedback(result);
    setSubmitting(false);
  }

  return (
    <AuthLayout titleId="authTitle">
      <h1 id="authTitle">Entrar</h1>
      <p className="auth-lead">Use o login e a senha fornecidos pelo administrador.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="authLogin">Login</label>
          <input id="authLogin" type="text" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="authPassword">Senha</label>
          <input id="authPassword" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </div>
        <button className="primary-button auth-submit" type="submit" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
      {feedback && <p className={feedback.success ? "auth-success" : "auth-error"} role={feedback.success ? "status" : "alert"}>{feedback.message}</p>}
    </AuthLayout>
  );
}
