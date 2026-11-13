import { useEffect, useState } from "react";

const display = (value: number) => value.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 6 });

export function NumericField({ label, value, onChange, optional = false, disabled = false }: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? "" : display(value));
  useEffect(() => {
    if (value === undefined) setText("");
    else if (Number.isFinite(value)) setText((current) => Number(current.replace(",", ".")) === value ? current : display(value));
  }, [value]);
  return (
    <label className="field nutrition-field">
      <span>{label}</span>
      <input type="text" inputMode="decimal" disabled={disabled} value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          onChange(optional && !next.trim() ? undefined :
            /^\d+(?:[.,]\d*)?$/.test(next.trim()) ? Number(next.replace(",", ".")) : Number.NaN);
        }} />
    </label>
  );
}
