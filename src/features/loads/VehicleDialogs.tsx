import { useEffect, useState } from "react";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { weightKey, type PalletSettings } from "../../domain/loads/summarizeLoad";
import { deactivateVehicle, listVehicles, savePalletSettings, saveVehicle, type Vehicle } from "../../services/loadService";
import { formatNumber } from "../../utils/formatters";
import { formatKg, formatPlate } from "./loadModel";

/** Número inteiro positivo ou vazio (null); NaN quando inválido. */
function parseWhole(value: string) {
  const trimmed = value.trim().replace(/\./g, "").replace(",", ".");
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

type VehicleForm = { name: string; plate: string; capacity: string; length: string; width: string; height: string };

function toForm(vehicle: Vehicle | null): VehicleForm {
  return {
    name: vehicle?.name ?? "",
    plate: vehicle?.plate ?? "",
    capacity: vehicle ? String(Number(vehicle.capacity_kg)) : "",
    length: vehicle?.body_length_cm ? String(vehicle.body_length_cm) : "",
    width: vehicle?.body_width_cm ? String(vehicle.body_width_cm) : "",
    height: vehicle?.body_height_cm ? String(vehicle.body_height_cm) : "",
  };
}

function VehicleFormView({ vehicle, onCancel, onSaved }: { vehicle: Vehicle | null; onCancel: () => void; onSaved: (message: string) => void }) {
  const [form, setForm] = useState<VehicleForm>(() => toForm(vehicle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = (key: keyof VehicleForm) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const capacity = parseWhole(form.capacity);
    const sizes = [parseWhole(form.length), parseWhole(form.width), parseWhole(form.height)];
    if (!form.name.trim()) return setError("Informe o nome do veículo.");
    if (capacity === null || Number.isNaN(capacity)) return setError("Informe a capacidade em kg, como número inteiro.");
    if (sizes.some((size) => Number.isNaN(size))) return setError("As medidas do baú devem ser números inteiros, em centímetros.");
    setSaving(true);
    setError("");
    try {
      await saveVehicle(vehicle?.id ?? null, {
        name: form.name.trim(),
        plate: form.plate,
        capacityKg: capacity,
        bodyLengthCm: sizes[0],
        bodyWidthCm: sizes[1],
        bodyHeightCm: sizes[2],
      });
      onSaved(vehicle ? `${form.name.trim()} foi atualizado.` : `${form.name.trim()} foi cadastrado.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o veículo.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="vehicleName">Nome</label>
          <input id="vehicleName" maxLength={80} placeholder="Ex.: Truck 14 t" value={form.name} onChange={field("name")} />
        </div>
        <div className="field">
          <label htmlFor="vehiclePlate">Placa (opcional)</label>
          <input id="vehiclePlate" maxLength={8} autoCapitalize="characters" spellCheck={false} placeholder="ABC1D23" value={form.plate} onChange={field("plate")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="vehicleCapacity">Capacidade de carga</label>
        <div className="input-affix">
          <input id="vehicleCapacity" inputMode="numeric" placeholder="Ex.: 14000" value={form.capacity} onChange={field("capacity")} />
          <span aria-hidden="true">kg</span>
        </div>
        <p className="field-hint">Peso máximo de mercadoria que o veículo leva, sem contar o próprio veículo.</p>
      </div>
      <fieldset className="price-fieldset">
        <legend>Medidas internas do baú (opcional)</legend>
        <div className="form-grid compact">
          {([["length", "Comprimento"], ["width", "Largura"], ["height", "Altura"]] as const).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`vehicle-${key}`}>{label}</label>
              <div className="input-affix">
                <input id={`vehicle-${key}`} inputMode="numeric" value={form[key]} onChange={field(key)} />
                <span aria-hidden="true">cm</span>
              </div>
            </div>
          ))}
        </div>
        <p className="field-hint">Serão usadas no desenho da carga dentro do baú.</p>
      </fieldset>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>Voltar</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : vehicle ? "Salvar alterações" : "Cadastrar veículo"}</button>
      </div>
    </form>
  );
}

/** Lista e cadastro de veículos (administrador). */
export function VehiclesDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setLoadError("");
    listVehicles()
      .then(setVehicles)
      .catch(() => setLoadError("Não foi possível carregar os veículos."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await deactivateVehicle(deleting.id);
      setMessage(`${deleting.name} foi excluído.`);
      setDeleting(null);
      onChanged();
      load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o veículo.");
    } finally {
      setBusy(false);
    }
  }

  const title = editing === "new" ? "Novo veículo" : editing ? "Editar veículo" : deleting ? `Excluir ${deleting.name}?` : "Veículos";
  const description = editing ? undefined
    : deleting ? "O veículo sai da lista de escolha das cargas. Cargas já expedidas continuam com os dados dele."
      : "Caminhões usados nas cargas. A capacidade limita o peso de cada carga.";

  return (
    <Dialog title={title} description={description} onClose={() => { if (!busy) onClose(); }}>
      {editing ? (
        <VehicleFormView
          vehicle={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMessage(text); onChanged(); load(); }}
        />
      ) : deleting ? (
        <>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => { setDeleting(null); setError(""); }}>Voltar</button>
            <button type="button" className="primary-button is-danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "Excluindo…" : "Excluir veículo"}</button>
          </div>
        </>
      ) : (
        <>
          {message && <p className="form-message" role="status">{message}</p>}
          {loadError ? (
            <div className="empty-items">
              <p><strong>{loadError}</strong></p>
              <p><button type="button" className="link-button" onClick={load}>Tentar novamente</button></p>
            </div>
          ) : loading ? <p className="panel-loading">Carregando veículos…</p> : vehicles.length === 0 ? (
            <EmptyState title="Nenhum veículo cadastrado.">Cadastre os caminhões com a capacidade de carga de cada um.</EmptyState>
          ) : (
            <ul className="vehicle-list">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <div>
                    <strong>{vehicle.name}</strong>
                    <span>
                      {[formatPlate(vehicle.plate), formatKg(Number(vehicle.capacity_kg)),
                        vehicle.body_length_cm && vehicle.body_width_cm && vehicle.body_height_cm
                          ? `baú ${formatNumber(vehicle.body_length_cm)} × ${formatNumber(vehicle.body_width_cm)} × ${formatNumber(vehicle.body_height_cm)} cm` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="vehicle-actions">
                    <button type="button" className="row-button" onClick={() => { setMessage(""); setEditing(vehicle); }}>Editar<span className="sr-only"> {vehicle.name}</span></button>
                    <button type="button" className="row-button is-danger" onClick={() => { setMessage(""); setError(""); setDeleting(vehicle); }}>Excluir<span className="sr-only"> {vehicle.name}</span></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Fechar</button>
            <button type="button" className="primary-button" onClick={() => { setMessage(""); setEditing("new"); }}>Novo veículo</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Peso do palete vazio e sacas por palete para cada peso de saca (administrador). */
export function PalletSettingsDialog({ settings, onClose, onSaved }: { settings: PalletSettings; onClose: () => void; onSaved: (message: string) => void }) {
  const { data: { products } } = useCommercialData();
  // Pesos dos produtos do catálogo mais os já configurados.
  const weights = [...new Set([...products.map((product) => product.weightKg), ...Object.keys(settings.bagsPerPallet).map(Number)])]
    .filter((weight) => weight > 0)
    .sort((a, b) => a - b);
  const [palletWeight, setPalletWeight] = useState(settings.palletWeightKg === null ? "" : String(settings.palletWeightKg));
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(weights.map((weight) => [weightKey(weight), settings.bagsPerPallet[weightKey(weight)] ? String(settings.bagsPerPallet[weightKey(weight)]) : ""])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const weightText = palletWeight.trim().replace(",", ".");
    const parsedWeight = weightText === "" ? null : Number(weightText);
    if (parsedWeight !== null && (!Number.isFinite(parsedWeight) || parsedWeight < 0 || parsedWeight > 200)) {
      return setError("O peso do palete vazio deve ficar entre 0 e 200 kg.");
    }
    const bagsPerPallet: Record<string, number> = {};
    for (const [key, value] of Object.entries(counts)) {
      const count = parseWhole(value);
      if (count === null) continue;
      if (Number.isNaN(count) || count > 500) return setError(`Sacas por palete de ${key.replace(".", ",")} kg: informe um número inteiro entre 1 e 500.`);
      bagsPerPallet[key] = count;
    }
    setSaving(true);
    setError("");
    try {
      await savePalletSettings({ palletWeightKg: parsedWeight, bagsPerPallet });
      onSaved("Dados de palete atualizados.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar os dados de palete.");
      setSaving(false);
    }
  }

  return (
    <Dialog title="Dados de palete" description="Usados para contar os paletes e somar o peso deles nas cargas paletizadas." size="small" onClose={() => { if (!saving) onClose(); }}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="palletWeight">Peso do palete vazio</label>
          <div className="input-affix">
            <input id="palletWeight" inputMode="decimal" placeholder="Ex.: 25" value={palletWeight} onChange={(event) => setPalletWeight(event.target.value)} />
            <span aria-hidden="true">kg</span>
          </div>
        </div>
        <fieldset className="price-fieldset">
          <legend>Sacas por palete</legend>
          <div className="form-grid compact">
            {weights.map((weight) => {
              const key = weightKey(weight);
              return (
                <div className="field" key={key}>
                  <label htmlFor={`pallet-${key}`}>Saca de {formatNumber(weight)} kg</label>
                  <input id={`pallet-${key}`} inputMode="numeric" value={counts[key] ?? ""} onChange={(event) => setCounts((current) => ({ ...current, [key]: event.target.value }))} />
                </div>
              );
            })}
          </div>
          <p className="field-hint">Deixe vazio o peso que não vai em palete. Sem esse número, a carga mostra as sacas, mas não conta os paletes.</p>
        </fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Dialog>
  );
}
