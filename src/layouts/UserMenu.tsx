import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useDemoSession } from "../demo/app/AuthProvider";
import type { ProfileRole } from "../types/auth";

const roleLabels: Record<ProfileRole, string> = { administrador: "Administrador", comercial: "Comercial", consulta: "Consulta" };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function UserMenu() {
  const { profile, switchRole, resetData } = useDemoSession();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const name = profile.displayName || profile.login;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button type="button" className="user-menu-trigger" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>
        <span className="avatar" aria-hidden="true">{initials(name)}</span>
        <span className="user-menu-text"><strong>{name}</strong><small>{roleLabels[profile.role]}</small></span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="user-menu-panel glass" role="menu">
          <p className="user-menu-heading">Ver o sistema como</p>
          {(Object.keys(roleLabels) as ProfileRole[]).map((role) => (
            <button key={role} type="button" role="menuitemradio" aria-checked={profile.role === role} onClick={() => { switchRole(role); setOpen(false); }}>
              <span>{roleLabels[role]}</span>
              {profile.role === role && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setConfirmReset(true); }}>
            <span>Restaurar dados de exemplo</span>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {confirmReset && (
        <ConfirmDialog
          title="Restaurar dados de exemplo?"
          description="Todos os registros criados ou alterados na demonstração serão apagados e os dados fictícios originais voltam."
          confirmLabel="Restaurar"
          danger
          onConfirm={() => { resetData(); setConfirmReset(false); }}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
