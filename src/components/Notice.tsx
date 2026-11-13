export type NoticeState = { kind: "success" | "error"; text: string } | null;

export const success = (text: string): NoticeState => ({ kind: "success", text });
export const failure = (text: string): NoticeState => ({ kind: "error", text });

/** Aviso no topo da página: verde para sucesso, vermelho para erro. */
export function Notice({ notice, className = "page-notice" }: { notice: NoticeState; className?: string }) {
  if (!notice) return null;
  return notice.kind === "error"
    ? <p className={`auth-error ${className}`} role="alert">{notice.text}</p>
    : <p className={`form-message ${className}`} role="status">{notice.text}</p>;
}
