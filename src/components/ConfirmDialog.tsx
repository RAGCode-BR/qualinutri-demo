import { useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";

type ConfirmDialogProps = {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

/** Confirmação padrão do sistema. Mostra o erro na própria janela se a ação falhar. */
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = "Cancelar", danger = false, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Não foi possível concluir a operação.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} description={description} size="small" dismissible onClose={() => { if (!busy) onClose(); }}>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{cancelLabel}</button>
        <button type="button" className={`primary-button${danger ? " is-danger" : ""}`} disabled={busy} onClick={() => void confirm()}>
          {busy ? "Aguarde…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
