import { useState } from "react";
import { Plus } from "lucide-react";
import { useDemoTables } from "../../demo/app/useDemoTables";
import { saveRegistryItem } from "../../demo/checklist/service";
import { newId } from "../../demo/store/ids";

type Kind = "suppliers" | "materials" | "employees" | "equipment" | "pestPoints" | "cleaningAreas";

const kinds: Array<{ id: Kind; label: string }> = [
  { id: "suppliers", label: "Fornecedores" }, { id: "materials", label: "Matérias-primas e padrões" }, { id: "employees", label: "Colaboradores" },
  { id: "equipment", label: "Equipamentos" }, { id: "pestPoints", label: "Pontos de pragas" }, { id: "cleaningAreas", label: "Áreas de limpeza" },
];

/** Cadastros próprios do módulo. Veículos, clientes e produtos vêm do sistema e não são alterados aqui. */
export function RegistryView({ canWrite }: { canWrite: boolean }) {
  const tables = useDemoTables();
  const [kind, setKind] = useState<Kind>("suppliers");
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const list = tables.checklist[kind] as Array<Record<string, unknown> & { id: string }>;

  async function add() {
    if (!name.trim()) return;
    const id = newId();
    const item = {
      suppliers: { id, name: name.trim(), city: extra.trim() || "—", materials: [], active: true },
      materials: { id, name: name.trim(), standards: [] },
      employees: { id, name: name.trim(), role: extra.trim() || "Colaborador", sector: "Produção", active: true },
      equipment: { id, name: name.trim(), kind: "Produção", location: extra.trim() || "Fábrica", active: true },
      pestPoints: { id, code: name.trim(), kind: "Porta-isca", area: extra.trim() || "Perímetro", active: true },
      cleaningAreas: { id, name: name.trim(), frequencyDays: Number(extra) || 7, sanitizer: "Varredura", active: true },
    }[kind];
    await saveRegistryItem(kind, item as never);
    setName("");
    setExtra("");
  }

  const describe = (item: Record<string, unknown>) => {
    switch (kind) {
      case "suppliers": return `${item.city} · ${(item.materials as string[]).map((id) => tables.checklist.materials.find((material) => material.id === id)?.name).filter(Boolean).join(", ")}`;
      case "materials": return (item.standards as Array<{ label: string; min?: number; max?: number; unit: string }>).map((standard) => `${standard.label} ${standard.min !== undefined ? `≥ ${standard.min}` : ""}${standard.max !== undefined ? `≤ ${standard.max}` : ""}${standard.unit}`).join(" · ") || "Sem padrões";
      case "employees": return `${item.role} · ${item.sector}`;
      case "equipment": return `${item.kind} · ${item.location}`;
      case "pestPoints": return `${item.kind} · ${item.area}`;
      case "cleaningAreas": return `A cada ${item.frequencyDays} dias · ${item.sanitizer}`;
    }
  };

  return (
    <div className="ck-registry">
      <p className="muted">Veículos, clientes e produtos vêm dos cadastros do sistema e não são alterados por este módulo.</p>
      <div className="segmented-glass ck-seg ck-registry-tabs" role="tablist">
        {kinds.map((item) => <button key={item.id} type="button" role="tab" aria-selected={kind === item.id} aria-checked={kind === item.id} onClick={() => setKind(item.id)}>{item.label}</button>)}
      </div>
      {canWrite && (
        <form className="ck-registry-form dash-card" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <input placeholder={kind === "pestPoints" ? "Código (ex.: PI-12)" : "Nome"} value={name} onChange={(event) => setName(event.target.value)} />
          <input placeholder={kind === "suppliers" ? "Cidade" : kind === "employees" ? "Função" : kind === "cleaningAreas" ? "Frequência (dias)" : kind === "materials" ? "—" : "Local / área"} value={extra} disabled={kind === "materials"} onChange={(event) => setExtra(event.target.value)} />
          <button type="submit" className="primary-button compact-button"><Plus size={16} aria-hidden="true" />&nbsp;Adicionar</button>
        </form>
      )}
      <ul className="ck-registry-list">
        {list.map((item, index) => (
          <li key={item.id} className="dash-card" style={{ animationDelay: `${index * 30}ms` }}>
            <strong>{String(item.name ?? item.code)}</strong>
            <small>{describe(item)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
