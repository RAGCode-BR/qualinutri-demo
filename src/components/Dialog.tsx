import { useEffect, useId, useRef, type ReactNode } from "react";

type DialogProps = {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  size?: "small" | "medium";
  /**
   * Fecha ao clicar no fundo. Só para confirmações curtas: em janelas com
   * formulário, um toque fora sem querer perderia o que foi digitado.
   */
  dismissible?: boolean;
  children: ReactNode;
};

/** Janela modal nativa: o navegador cuida do foco, do Esc e do fundo inerte. */
export function Dialog({ title, description, onClose, size = "medium", dismissible = false, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog is-${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      // Só fecha se o clique começou e terminou no fundo (selecionar texto e soltar fora não fecha).
      onPointerDown={(event) => { pressedOnBackdrop.current = event.target === ref.current; }}
      onClick={(event) => {
        if (dismissible && pressedOnBackdrop.current && event.target === ref.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="dialog-body">
        <header className="dialog-header">
          <h2 className="panel-title" id={titleId}>{title}</h2>
          {description && <p className="panel-description" id={descriptionId}>{description}</p>}
        </header>
        {children}
      </div>
    </dialog>
  );
}
