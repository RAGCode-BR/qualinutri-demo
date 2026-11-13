import type { InputHTMLAttributes } from "react";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

/** Campo de data com o visual do sistema. Clicar em qualquer parte abre o calendário. */
export function DateInput({ value, onChange, className, onClick, ...props }: DateInputProps) {
  return (
    <input
      {...props}
      type="date"
      value={value}
      className={`date-input${value ? "" : " is-empty"}${className ? ` ${className}` : ""}`}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => {
        onClick?.(event);
        try {
          event.currentTarget.showPicker?.();
        } catch {
          // Navegadores sem suporte ou bloqueio: o campo continua editável pelo teclado.
        }
      }}
    />
  );
}
