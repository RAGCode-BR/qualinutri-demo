import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { NUTRIENTS, type NutritionFeed } from "../../demo/nutrition/types";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const standardKeys = new Set<string>(NUTRIENTS.map((nutrient) => nutrient.key));

function readNumber(text: string) {
  const value = text.trim();
  return /^\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(",", ".")) : Number.NaN;
}

function FeedEditor({ feed, onSave, onClose }: {
  feed: NutritionFeed | null;
  onSave: (feed: NutritionFeed) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(feed?.name ?? "");
  const [dryMatter, setDryMatter] = useState(feed ? String(feed.dryMatterPct) : "");
  const [price, setPrice] = useState(feed && !feed.pricePending ? String(feed.pricePerKgNatural) : "");
  const [category, setCategory] = useState(feed?.category ?? "");
  const [source, setSource] = useState(feed?.source ?? "");
  const [notes, setNotes] = useState(feed?.notes ?? "");
  const [nutrients, setNutrients] = useState<Record<string, string>>(() => Object.fromEntries(
    NUTRIENTS.map(({ key }) => [key, feed?.nutrients[key] === undefined ? "" : String(feed.nutrients[key])]),
  ));
  const [custom, setCustom] = useState(() => Object.entries(feed?.nutrients ?? {})
    .filter(([key]) => !standardKeys.has(key))
    .map(([key, value]) => ({ id: crypto.randomUUID(), key, value: String(value) })));
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const dryMatterPct = readNumber(dryMatter);
    const pricePerKgNatural = readNumber(price);
    if (!name.trim()) return setError("Informe o nome do alimento.");
    if (!Number.isFinite(dryMatterPct) || dryMatterPct < 0.01 || dryMatterPct > 100) {
      return setError("A matéria seca deve estar entre 0,01 e 100%.");
    }
    if (!Number.isFinite(pricePerKgNatural) || pricePerKgNatural < 0) {
      return setError("Informe um preço por kg válido, igual ou maior que zero.");
    }
    const values: Record<string, number> = {};
    for (const nutrient of NUTRIENTS) {
      const text = nutrients[nutrient.key]?.trim() ?? "";
      if (!text) continue;
      const value = readNumber(text);
      const maximum = nutrient.unit === "% MS" && nutrient.key !== "crudeProtein" ? 100 : Number.MAX_SAFE_INTEGER;
      if (!Number.isFinite(value) || value < 0 || value > maximum) {
        return setError(nutrient.unit === "% MS" && nutrient.key !== "crudeProtein"
          ? `${nutrient.label}: informe um valor entre 0 e 100%.`
          : `${nutrient.label}: informe um valor válido, igual ou maior que zero.`);
      }
      values[nutrient.key] = value;
    }
    for (const row of custom) {
      const key = row.key.trim();
      const text = row.value.trim();
      if (!key && !text) continue;
      if (!key) return setError("Informe a chave do nutriente adicional.");
      if (standardKeys.has(key) || Object.hasOwn(values, key)) {
        return setError(`A chave de nutriente ${key} está repetida.`);
      }
      if (!text) continue;
      const value = readNumber(text);
      if (!Number.isFinite(value) || value < 0) return setError(`${key}: informe um valor válido, igual ou maior que zero.`);
      values[key] = value;
    }
    try {
      onSave({
        ...feed,
        id: feed?.id ?? crypto.randomUUID(),
        name: name.trim(),
        dryMatterPct,
        pricePerKgNatural,
        nutrients: values,
        category: category.trim() || undefined,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o alimento.");
    }
  }

  return (
    <Dialog title={feed ? "Editar alimento" : "Novo alimento"} onClose={onClose}>
      <form onSubmit={submit} className="nutrition-feed-form">
        <div className="form-grid">
          <label className="field">Nome do alimento<input type="text" maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field">Categoria<input type="text" maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} /></label>
          <label className="field">Matéria seca (%)<input type="text" inputMode="decimal" value={dryMatter} onChange={(event) => setDryMatter(event.target.value)} /></label>
          <label className="field">Preço por kg natural (R$)<input type="text" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <label className="field">Origem dos dados<input type="text" maxLength={240} value={source} onChange={(event) => setSource(event.target.value)} /></label>
        </div>
        <h3>Composição na matéria seca</h3>
        <p className="field-hint">Deixe em branco os nutrientes sem análise disponível.</p>
        <div className="form-grid compact">
          {NUTRIENTS.map(({ key, label, unit }) => (
            <label className="field" key={key}>{label} ({unit})
              <input type="text" inputMode="decimal" value={nutrients[key] ?? ""}
                onChange={(event) => setNutrients({ ...nutrients, [key]: event.target.value })} />
            </label>
          ))}
        </div>
        <h3>Nutrientes adicionais</h3>
        <p className="field-hint">A chave identifica o campo importado. Use a unidade e a base registradas na origem.</p>
        {custom.map((row, index) => (
          <div className="form-grid nutrition-custom-nutrient" key={row.id}>
            <label className="field">Chave do nutriente {index + 1}<input type="text" value={row.key} maxLength={200}
              onChange={(event) => setCustom(custom.map((entry) => entry.id === row.id ? { ...entry, key: event.target.value } : entry))} /></label>
            <label className="field">Valor do nutriente {index + 1}<input type="text" inputMode="decimal" value={row.value}
              onChange={(event) => setCustom(custom.map((entry) => entry.id === row.id ? { ...entry, value: event.target.value } : entry))} /></label>
            <button type="button" className="row-button is-danger" onClick={() => setCustom(custom.filter((entry) => entry.id !== row.id))}>Retirar nutriente {index + 1}</button>
          </div>
        ))}
        <button type="button" className="secondary-button" onClick={() => setCustom([...custom, { id: crypto.randomUUID(), key: "", value: "" }])}>Adicionar nutriente</button>
        <label className="field">Observações<textarea rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button">Salvar alimento</button>
        </div>
      </form>
    </Dialog>
  );
}

export function FeedLibrary({ feeds, onSave, onDelete }: {
  feeds: NutritionFeed[];
  onSave: (feed: NutritionFeed) => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<NutritionFeed | "new" | null>(null);
  const [deleting, setDeleting] = useState<NutritionFeed | null>(null);
  const [comparison, setComparison] = useState<[string, string]>(["", ""]);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visible = feeds.filter((feed) => `${feed.name} ${feed.category ?? ""} ${feed.source ?? ""}`.toLocaleLowerCase("pt-BR").includes(term));
  const compared = comparison.map((id) => feeds.find((feed) => feed.id === id));

  return (
    <div className="nutrition-feed-library">
      <Panel title="Biblioteca de alimentos" actions={<button type="button" className="primary-button" onClick={() => setEditing("new")}>Novo alimento</button>}>
        <label className="field">Buscar alimento<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, categoria ou origem" /></label>
        <ScrollableTable>
          <table className="data-table">
            <thead><tr><th>Alimento</th><th>Categoria</th><th className="numeric">MS (%)</th><th className="numeric">R$/kg natural</th><th className="numeric">R$/kg MS</th><th>Ações</th></tr></thead>
            <tbody>{visible.map((feed) => (
              <tr key={feed.id}>
                <td><strong>{feed.name}</strong>{feed.source && <span className="cell-sub">{feed.source}</span>}</td>
                <td>{feed.category || "—"}</td>
                <td className="numeric">{numberFormat.format(feed.dryMatterPct)}</td>
                <td className="numeric">{feed.pricePending ? "Preço pendente" : currencyFormat.format(feed.pricePerKgNatural)}</td>
                <td className="numeric">{!feed.pricePending && feed.dryMatterPct > 0 ? currencyFormat.format(feed.pricePerKgNatural / (feed.dryMatterPct / 100)) : "—"}</td>
                <td><button type="button" className="row-button" onClick={() => setEditing(feed)}>Editar<span className="sr-only"> {feed.name}</span></button>
                  <button type="button" className="row-button is-danger" onClick={() => setDeleting(feed)}>Excluir<span className="sr-only"> {feed.name}</span></button></td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollableTable>
        {visible.length === 0 && <p>Nenhum alimento encontrado.</p>}
      </Panel>
      <Panel title="Comparar alimentos">
        <div className="form-grid">
          {comparison.map((selected, index) => (
            <label className="field" key={index}>Alimento {index + 1}
              <select value={selected} onChange={(event) => setComparison(index === 0 ? [event.target.value, comparison[1]] : [comparison[0], event.target.value])}>
                <option value="">Escolha um alimento</option>
                {feeds.filter((feed) => feed.id !== comparison[1 - index]).map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}
              </select>
            </label>
          ))}
        </div>
        {compared[0] && compared[1] && <ScrollableTable>
          <table className="data-table">
            <thead><tr><th>Indicador</th>{compared.map((feed) => <th key={feed!.id}>{feed!.name}</th>)}</tr></thead>
            <tbody>
              <tr><td>Matéria seca (%)</td>{compared.map((feed) => <td key={feed!.id}>{numberFormat.format(feed!.dryMatterPct)}</td>)}</tr>
              <tr><td>Preço por kg natural</td>{compared.map((feed) => <td key={feed!.id}>{feed!.pricePending ? "Preço pendente" : currencyFormat.format(feed!.pricePerKgNatural)}</td>)}</tr>
              <tr><td>Custo por kg MS</td>{compared.map((feed) => <td key={feed!.id}>{!feed!.pricePending && feed!.dryMatterPct > 0 ? currencyFormat.format(feed!.pricePerKgNatural / (feed!.dryMatterPct / 100)) : "—"}</td>)}</tr>
              {NUTRIENTS.flatMap(({ key, label, unit }) => ["dry", "natural"].map((basis) => (
                <tr key={`${key}-${basis}`}><td>{label} ({basis === "dry" ? unit : unit.replace("MS", "natural")})</td>
                  {compared.map((feed) => {
                    const value = feed!.nutrients[key];
                    return <td key={feed!.id}>{value === undefined ? "Sem análise" : numberFormat.format(basis === "dry" ? value : value * feed!.dryMatterPct / 100)}</td>;
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </ScrollableTable>}
      </Panel>
      {editing && <FeedEditor feed={editing === "new" ? null : editing} onSave={onSave} onClose={() => setEditing(null)} />}
      {deleting && <ConfirmDialog title={`Excluir ${deleting.name}?`} description="A exclusão será permitida quando o alimento estiver livre de vínculos com dietas."
        confirmLabel="Excluir alimento" danger onClose={() => setDeleting(null)} onConfirm={() => { onDelete(deleting.id); setDeleting(null); }} />}
    </div>
  );
}
