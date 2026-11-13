import { useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { failure, Notice, success, type NoticeState } from "../../components/Notice";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { Select } from "../../components/Select";
import { resetUserPassword } from "../../services/adminPasswordService";
import { createManagedUser, type CreateManagedUserInput } from "../../services/adminUserService";
import { listProfiles, updateProfileAccess } from "../../services/profileService";
import type { ProfileRole, UserProfile } from "../../types/auth";

const roleLabels: Record<ProfileRole, string> = {
  administrador: "Administrador",
  comercial: "Comercial",
  consulta: "Consulta",
};

const roleOptions = (Object.keys(roleLabels) as ProfileRole[]).map((role) => ({ value: role, label: roleLabels[role] }));

const emptyUserForm: CreateManagedUserInput = {
  displayName: "",
  login: "",
  password: "",
  role: "consulta",
  active: true,
};

type Access = Pick<UserProfile, "role" | "active">;

function ResetPasswordDialog({ profile, onClose, onDone }: { profile: UserProfile; onClose: () => void; onDone: (message: string) => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (password.length < 6) return setError("A senha temporária precisa ter pelo menos 6 caracteres.");
    setSaving(true);
    setError("");
    try {
      await resetUserPassword(profile.id, password);
      onDone(`Senha de ${profile.login} redefinida. A troca será exigida no próximo acesso.`);
    } catch {
      setError("Não foi possível redefinir a senha temporária.");
      setSaving(false);
    }
  }

  return (
    <Dialog title={`Redefinir senha de ${profile.login}`} description="Informe uma senha temporária. O usuário terá que trocá-la no próximo acesso." size="small" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="resetTemporaryPassword">Nova senha temporária</label>
          <input id="resetTemporaryPassword" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Redefinindo…" : "Redefinir senha"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProfilesPage() {
  const { profile: currentProfile, refreshProfile } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  /** Acesso como está gravado no banco, para marcar alterações não salvas. */
  const [saved, setSaved] = useState<Record<string, Access>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [userForm, setUserForm] = useState<CreateManagedUserInput>(emptyUserForm);
  const [resetProfile, setResetProfile] = useState<UserProfile | null>(null);
  const [confirmSelf, setConfirmSelf] = useState<UserProfile | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  async function reloadProfiles() {
    const rows = await listProfiles();
    setProfiles(rows);
    setSaved(Object.fromEntries(rows.map((row) => [row.id, { role: row.role, active: row.active }])));
  }

  function load() {
    setLoading(true);
    setLoadError("");
    reloadProfiles()
      .catch(() => setLoadError("Não foi possível carregar os usuários."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function userField<Key extends keyof CreateManagedUserInput>(key: Key, value: CreateManagedUserInput[Key]) {
    setUserForm((current) => ({ ...current, [key]: value }));
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      await createManagedUser(userForm);
      setNotice(success(`Usuário ${userForm.login.trim().toLowerCase()} criado com sucesso.`));
      setUserForm(emptyUserForm);
      await reloadProfiles();
    } catch {
      setNotice(failure("Não foi possível criar o usuário. Verifique se o login já existe e tente novamente."));
    } finally {
      setCreating(false);
    }
  }

  function changeProfile(id: string, changes: Partial<Access>) {
    setProfiles((current) => current.map((profile) => profile.id === id ? { ...profile, ...changes } : profile));
  }

  const isPending = (profile: UserProfile) =>
    saved[profile.id] !== undefined && (saved[profile.id].role !== profile.role || saved[profile.id].active !== profile.active);

  /** Tirar o próprio acesso de administrador pede confirmação. */
  function requestSave(profile: UserProfile) {
    const losesAdmin = profile.id === currentProfile?.id && (!profile.active || profile.role !== "administrador");
    if (losesAdmin) setConfirmSelf(profile);
    else void save(profile);
  }

  async function save(profile: UserProfile) {
    if (savingId) return;
    setSavingId(profile.id);
    setNotice(null);
    try {
      await updateProfileAccess(profile.id, profile.role, profile.active);
      setSaved((current) => ({ ...current, [profile.id]: { role: profile.role, active: profile.active } }));
      if (profile.id === currentProfile?.id) await refreshProfile();
      setNotice(success(`Acesso de ${profile.login} atualizado.`));
    } catch {
      // Volta a linha ao que está gravado, para a tela não mostrar algo que não foi salvo.
      const original = saved[profile.id];
      if (original) changeProfile(profile.id, original);
      setNotice(failure("Não foi possível atualizar o acesso. É necessário manter ao menos um administrador ativo."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <Notice notice={notice} />
      <div className="page-columns is-form-first">
        <div className="aside-panel">
          <Panel title="Novo usuário" description="Informe uma senha temporária: o usuário troca por uma senha própria no primeiro acesso.">
            <form onSubmit={createUser}>
              <div className="field"><label htmlFor="newUserName">Nome</label><input id="newUserName" required maxLength={120} autoComplete="off" value={userForm.displayName} onChange={(event) => userField("displayName", event.target.value)} /></div>
              <div className="field"><label htmlFor="newUserLogin">Login</label><input id="newUserLogin" type="text" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" autoComplete="off" aria-describedby="newUserLoginHint" value={userForm.login} onChange={(event) => userField("login", event.target.value)} />
                <p className="field-hint" id="newUserLoginHint">De 3 a 32 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.</p></div>
              <div className="field"><label htmlFor="newUserPassword">Senha temporária</label><input id="newUserPassword" type="password" required minLength={6} autoComplete="new-password" value={userForm.password} onChange={(event) => userField("password", event.target.value)} /></div>
              <div className="field"><label htmlFor="newUserRole">Perfil</label><Select
                id="newUserRole"
                value={userForm.role}
                onChange={(value) => userField("role", value as ProfileRole)}
                options={roleOptions}
              /></div>
              <label className="check-field field-spaced"><input type="checkbox" checked={userForm.active} onChange={(event) => userField("active", event.target.checked)} /><span>Usuário ativo</span></label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={creating}>{creating ? "Criando…" : "Criar usuário"}</button>
              </div>
            </form>
          </Panel>
        </div>
        <Panel title="Usuários e permissões" description="Altere o perfil ou a situação de um acesso e clique em Salvar na mesma linha." flush>
          {loadError ? (
            <div className="empty-items">
              <p><strong>{loadError}</strong></p>
              <p><button type="button" className="link-button" onClick={load}>Tentar novamente</button></p>
            </div>
          ) : loading ? <p className="panel-loading">Carregando usuários…</p> : (
            <ScrollableTable><table className="data-table users-table stack-table">
              <thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">Senha</th><th scope="col">Ativo</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>{profiles.map((profile) => {
                const pending = isPending(profile);
                return (
                  <tr key={profile.id} className={pending ? "is-editing" : undefined}>
                    <td className="cell-primary">
                      <span className="strong">{profile.displayName || "Sem nome"}</span>
                      <span className="cell-sub">{profile.login}{profile.id === currentProfile?.id ? " (você)" : ""}</span>
                      {pending && <span className="status-badge is-warning pending-badge">Não salvo</span>}
                    </td>
                    <td data-label="Perfil"><Select
                      className="compact-select"
                      aria-label={`Perfil de ${profile.login}`}
                      value={profile.role}
                      onChange={(value) => changeProfile(profile.id, { role: value as ProfileRole })}
                      options={roleOptions}
                    /></td>
                    <td data-label="Senha">{profile.mustChangePassword ? <span className="status-badge is-warning">Troca pendente</span> : <span className="status-badge is-approved">Definida</span>}</td>
                    <td data-label="Ativo"><input className="table-checkbox" aria-label={`Ativar ${profile.login}`} type="checkbox" checked={profile.active} onChange={(event) => changeProfile(profile.id, { active: event.target.checked })} /></td>
                    <td className="action-cell">
                      <button type="button" className={`row-button${pending ? " is-primary" : ""}`} disabled={savingId !== null || !pending} onClick={() => requestSave(profile)}>{savingId === profile.id ? "Salvando…" : "Salvar"}<span className="sr-only"> acesso de {profile.login}</span></button>
                      <button type="button" className="row-button" disabled={profile.id === currentProfile?.id} title={profile.id === currentProfile?.id ? "Use outro administrador para redefinir sua senha." : undefined} onClick={() => { setNotice(null); setResetProfile(profile); }}>Redefinir senha<span className="sr-only"> de {profile.login}</span></button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></ScrollableTable>
          )}
        </Panel>
      </div>

      {resetProfile && (
        <ResetPasswordDialog
          profile={resetProfile}
          onClose={() => setResetProfile(null)}
          onDone={(text) => {
            setResetProfile(null);
            setNotice(success(text));
            void reloadProfiles();
          }}
        />
      )}
      {confirmSelf && (
        <ConfirmDialog
          title={!confirmSelf.active ? "Desativar o seu próprio acesso?" : "Deixar de ser administrador?"}
          description="Você perde o acesso de administrador assim que salvar, inclusive a esta página. Só outro administrador poderá desfazer."
          confirmLabel="Salvar mesmo assim"
          cancelLabel="Voltar"
          danger
          onConfirm={async () => { setConfirmSelf(null); await save(confirmSelf); }}
          onClose={() => setConfirmSelf(null)}
        />
      )}
    </>
  );
}
