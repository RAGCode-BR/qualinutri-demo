import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { changeInitialPassword } from "../../services/passwordService";
import { AuthLayout } from "../../layouts/AuthLayout";

export function ChangePasswordPage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (password !== confirmation) {
      setMessage("As senhas informadas não conferem.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await changeInitialPassword(password);
      await refreshProfile();
    } catch {
      setMessage("Não foi possível salvar a nova senha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout titleId="passwordTitle">
      <h1 id="passwordTitle">Defina sua senha</h1>
      <p className="auth-lead">Olá, {profile?.displayName || profile?.login}. Troque a senha temporária para acessar o sistema.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="newPassword">Nova senha</label>
          <input id="newPassword" type="password" required minLength={6} autoComplete="new-password" aria-describedby="newPasswordHint" value={password} onChange={(event) => setPassword(event.target.value)} />
          <p className="field-hint" id="newPasswordHint">Mínimo de 6 caracteres.</p>
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirmar nova senha</label>
          <input id="confirmPassword" type="password" required minLength={6} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </div>
        <button type="submit" className="primary-button auth-submit" disabled={saving}>{saving ? "Salvando…" : "Salvar nova senha"}</button>
      </form>
      {message && <p className="auth-error" role="alert">{message}</p>}
      <button type="button" className="text-button" onClick={() => void signOut()}>Sair</button>
    </AuthLayout>
  );
}
