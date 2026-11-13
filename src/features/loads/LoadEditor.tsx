import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DateInput } from "../../components/DateInput";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { Select } from "../../components/Select";
import { summarizeLoad, type LoadLine, type Packing, type PalletSettings } from "../../domain/loads/summarizeLoad";
import { listLoadCandidates, saveLoad, type LoadCandidate, type Vehicle } from "../../services/loadService";
import { formatNumber } from "../../utils/formatters";
import { formatDate, formatKg, formatPlate, MIN_DELIVERY_KG, packingLabels } from "./loadModel";

export type OrderSelection = { packing: Packing; quantities: Record<string, string> };

/** Estado da montagem; guardado ao sair da página para não se perder. */
export type EditorState = {
  loadId: string | null;
  loadNumber: number | null;
  vehicleId: string;
  plannedDate: string;
  notes: string;
  /** Pedidos na carga, por id do orçamento. */
  orders: Record<string, OrderSelection>;
  /** Ordem de entrega: chaves de cliente, a primeira é a 1ª parada. */
  stops: string[];
};

export const emptyEditorState: EditorState = { loadId: null, loadNumber: null, vehicleId: "", plannedDate: "", notes: "", orders: {}, stops: [] };

type CandidateItem = { quoteItemId: string; productName: string; weightKg: number; sold: number; available: number };
type CandidateOrder = {
  quoteId: string;
  quoteNumber: number;
  customerKey: string;
  customerName: string;
  approvedAt: string | null;
  items: CandidateItem[];
};

/** Pedidos do mesmo cliente formam uma parada; pedido sem cliente é uma parada própria. */
export function customerKeyOf(quoteId: string, customerId: string | null) {
  return customerId ?? `pedido:${quoteId}`;
}

function groupCandidates(rows: LoadCandidate[]): CandidateOrder[] {
  const orders = new Map<string, CandidateOrder>();
  for (const row of rows) {
    let order = orders.get(row.quote_id);
    if (!order) {
      order = {
        quoteId: row.quote_id,
        quoteNumber: row.quote_number,
        customerKey: customerKeyOf(row.quote_id, row.customer_id),
        customerName: row.customer_name || "Sem cliente vinculado",
        approvedAt: row.approved_at,
        items: [],
      };
      orders.set(row.quote_id, order);
    }
    order.items.push({
      quoteItemId: row.quote_item_id,
      productName: row.product_name,
      weightKg: Number(row.weight_kg),
      sold: row.quantity,
      available: row.quantity - row.allocated,
    });
  }
  return [...orders.values()];
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function parseQuantity(value: string) {
  if (value.trim() === "") return 0;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
}

const ordinal = (position: number) => `${position}ª entrega`;

type LoadEditorProps = {
  initial: EditorState;
  vehicles: Vehicle[];
  pallet: PalletSettings;
  onChange: (state: EditorState) => void;
  onClose: (savedMessage?: string) => void;
};

export function LoadEditor({ initial, vehicles, pallet, onChange, onClose }: LoadEditorProps) {
  const [state, setState] = useState<EditorState>(initial);
  const [candidates, setCandidates] = useState<CandidateOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const savedSnapshot = useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(state) !== savedSnapshot.current;

  useEffect(() => { onChange(state); }, [state]);

  function loadCandidates() {
    setLoading(true);
    setLoadError("");
    listLoadCandidates(state.loadId)
      .then((rows) => setCandidates(groupCandidates(rows)))
      .catch(() => setLoadError("Não foi possível carregar os pedidos a enviar."))
      .finally(() => setLoading(false));
  }
  useEffect(loadCandidates, []);

  const vehicle = vehicles.find((entry) => entry.id === state.vehicleId) ?? null;
  const ordersById = useMemo(() => new Map(candidates.map((order) => [order.quoteId, order])), [candidates]);
  const included = candidates.filter((order) => state.orders[order.quoteId]);

  const lines: LoadLine[] = included.flatMap((order) => order.items.map((item) => ({
    quoteId: order.quoteId,
    weightKg: item.weightKg,
    quantity: parseQuantity(state.orders[order.quoteId].quantities[item.quoteItemId] ?? "") || 0,
    packing: state.orders[order.quoteId].packing,
  })));
  const summary = summarizeLoad(lines, vehicle ? Number(vehicle.capacity_kg) : 0, pallet);

  const orderWeight = (order: CandidateOrder) => order.items.reduce((total, item) =>
    total + (parseQuantity(state.orders[order.quoteId]?.quantities[item.quoteItemId] ?? "") || 0) * item.weightKg, 0);

  const stopGroups = state.stops
    .map((key) => ({ key, orders: included.filter((order) => order.customerKey === key) }))
    .filter((group) => group.orders.length > 0);
  const lightStops = stopGroups.filter((group) => {
    const weight = group.orders.reduce((total, order) => total + orderWeight(order), 0);
    return weight > 0 && weight < MIN_DELIVERY_KG;
  });

  const term = normalize(search.trim().replace(/^#/, ""));
  const available = candidates
    .filter((order) => !state.orders[order.quoteId] && order.items.some((item) => item.available > 0))
    .filter((order) => !term || normalize(order.customerName).includes(term) || String(order.quoteNumber).includes(term));

  function update(changes: Partial<EditorState>) {
    setState((current) => ({ ...current, ...changes }));
    setError("");
  }

  function addOrder(order: CandidateOrder) {
    setState((current) => ({
      ...current,
      orders: {
        ...current.orders,
        [order.quoteId]: {
          packing: "loose",
          quantities: Object.fromEntries(order.items.map((item) => [item.quoteItemId, String(Math.max(item.available, 0))])),
        },
      },
      stops: current.stops.includes(order.customerKey) ? current.stops : [...current.stops, order.customerKey],
    }));
    setError("");
  }

  function removeOrder(order: CandidateOrder) {
    setState((current) => {
      const orders = { ...current.orders };
      delete orders[order.quoteId];
      const stillUsed = Object.keys(orders).some((quoteId) => ordersById.get(quoteId)?.customerKey === order.customerKey);
      return { ...current, orders, stops: stillUsed ? current.stops : current.stops.filter((key) => key !== order.customerKey) };
    });
  }

  function setOrder(quoteId: string, changes: Partial<OrderSelection>) {
    setState((current) => ({ ...current, orders: { ...current.orders, [quoteId]: { ...current.orders[quoteId], ...changes } } }));
    setError("");
  }

  function moveStop(index: number, direction: -1 | 1) {
    const keys = stopGroups.map((group) => group.key);
    const target = index + direction;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    update({ stops: keys });
  }

  /** Confere a montagem; devolve a mensagem do primeiro problema. */
  function validate() {
    if (!vehicle) return "Escolha o veículo da carga.";
    if (included.length === 0) return "Adicione pelo menos um pedido à carga.";
    for (const order of included) {
      let orderBags = 0;
      for (const item of order.items) {
        const quantity = parseQuantity(state.orders[order.quoteId].quantities[item.quoteItemId] ?? "");
        if (Number.isNaN(quantity)) return `Pedido #${order.quoteNumber}, ${item.productName}: informe um número inteiro de sacas.`;
        if (quantity > item.available) return `Pedido #${order.quoteNumber}, ${item.productName}: só faltam ${formatNumber(item.available)} sacas a enviar.`;
        orderBags += quantity;
      }
      if (orderBags === 0) return `Pedido #${order.quoteNumber}: informe as sacas que vão nesta carga ou retire o pedido.`;
    }
    if (summary.level === "over") return `A carga passa da capacidade do veículo em ${formatKg(-summary.remainingKg)}.`;
    return "";
  }

  async function save() {
    if (saving) return;
    const problem = validate();
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const items = stopGroups.flatMap((group, index) => group.orders.flatMap((order) => order.items
        .map((item) => ({ item, quantity: parseQuantity(state.orders[order.quoteId].quantities[item.quoteItemId] ?? "") }))
        .filter(({ quantity }) => quantity > 0)
        .map(({ item, quantity }) => ({ quoteItemId: item.quoteItemId, quantity, packing: state.orders[order.quoteId].packing, stopOrder: index + 1 }))));
      const saved = await saveLoad(state.loadId, { vehicleId: state.vehicleId, plannedDate: state.plannedDate || null, notes: state.notes.trim() || null }, items);
      onClose(state.loadId ? `Carga #${saved.load_number} atualizada.` : `Carga #${saved.load_number} criada como planejada.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a carga.");
      setSaving(false);
      // O saldo pode ter mudado por outra carga salva ao mesmo tempo.
      loadCandidates();
    }
  }

  const percent = Math.round(summary.fillRatio * 100);
  const vehicleOptions = [
    { value: "", label: "Escolha o veículo" },
    ...vehicles.map((entry) => ({ value: entry.id, label: [entry.name, formatPlate(entry.plate), formatKg(Number(entry.capacity_kg))].filter(Boolean).join(" · ") })),
  ];
  const levelText = !vehicle ? "Escolha o veículo para ver a ocupação."
    : summary.level === "over" ? `Passou da capacidade em ${formatKg(-summary.remainingKg)}.`
      : summary.level === "warning" ? "Quase cheio."
        : summary.level === "empty" ? "Carga vazia." : "Ainda cabe mais carga.";

  return (
    <div className="calculator-layout load-editor">
      <div className="calculator-work">
        <div className="editing-banner" role="status">
          <div>
            <strong>{state.loadNumber ? `Editando a carga #${state.loadNumber}` : "Nova carga"}</strong>
            <span>Escolha o veículo e adicione os pedidos aprovados. Ao salvar, a carga fica como planejada.</span>
          </div>
          <button type="button" className="secondary-button" onClick={() => (dirty ? setConfirmLeave(true) : onClose())}>Voltar às cargas</button>
        </div>

        <Panel title="Veículo e saída">
          {vehicles.length === 0 ? (
            <p className="warning-message">Nenhum veículo cadastrado. Peça a um administrador para cadastrar em Cargas › Veículos.</p>
          ) : (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="loadVehicle">Veículo</label>
                <Select id="loadVehicle" value={state.vehicleId} onChange={(value) => update({ vehicleId: value })} options={vehicleOptions} />
              </div>
              <div className="field">
                <label htmlFor="loadDate">Saída prevista (opcional)</label>
                <DateInput id="loadDate" value={state.plannedDate} onChange={(value) => update({ plannedDate: value })} />
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="loadNotes">Observações (opcional)</label>
            <textarea id="loadNotes" rows={2} maxLength={500} placeholder="Ex.: motorista, horário de carregamento" value={state.notes} onChange={(event) => update({ notes: event.target.value })} />
          </div>
        </Panel>

        <Panel
          title="Pedidos na carga"
          description="Cada cliente é uma entrega. A 1ª entrega é carregada por último, perto da porta."
          actions={<span className="count-badge">{included.length} {included.length === 1 ? "pedido" : "pedidos"}</span>}
        >
          {loadError ? null : included.length === 0 ? (
            <EmptyState title="Nenhum pedido na carga.">Adicione pedidos na lista “Pedidos a enviar”, abaixo.</EmptyState>
          ) : (
            <ol className="load-stops">
              {stopGroups.map((group, index) => {
                const weight = group.orders.reduce((total, order) => total + orderWeight(order), 0);
                const light = weight > 0 && weight < MIN_DELIVERY_KG;
                return (
                  <li key={group.key} className="load-stop">
                    <div className="load-stop-head">
                      <span className="load-stop-number">{ordinal(index + 1)}</span>
                      <strong>{group.orders[0].customerName}</strong>
                      <span className={light ? "load-stop-weight is-light" : "load-stop-weight"}>{formatKg(weight)}</span>
                      <span className="load-stop-move">
                        <button type="button" className="row-button" disabled={index === 0} onClick={() => moveStop(index, -1)} aria-label={`Entregar ${group.orders[0].customerName} antes`}>↑</button>
                        <button type="button" className="row-button" disabled={index === stopGroups.length - 1} onClick={() => moveStop(index, 1)} aria-label={`Entregar ${group.orders[0].customerName} depois`}>↓</button>
                      </span>
                    </div>
                    {light && <p className="field-hint load-stop-hint">Abaixo da entrega mínima de {formatKg(MIN_DELIVERY_KG)} por cliente.</p>}
                    {group.orders.map((order) => {
                      const selection = state.orders[order.quoteId];
                      return (
                        <div key={order.quoteId} className="load-order">
                          <div className="load-order-head">
                            <strong>Pedido #{order.quoteNumber}</strong>
                            <div className="segmented compact-segmented" role="group" aria-label={`Tipo de carga do pedido ${order.quoteNumber}`}>
                              {(["loose", "pallet"] as const).map((packing) => (
                                <button key={packing} type="button" aria-pressed={selection.packing === packing} className={selection.packing === packing ? "is-selected" : undefined} onClick={() => setOrder(order.quoteId, { packing })}>
                                  {packingLabels[packing]}
                                </button>
                              ))}
                            </div>
                            <button type="button" className="row-button is-danger" onClick={() => removeOrder(order)}>Retirar<span className="sr-only"> pedido {order.quoteNumber}</span></button>
                          </div>
                          <table className="load-order-items">
                            <colgroup><col /><col className="load-col-number" /><col className="load-col-input" /><col className="load-col-number" /></colgroup>
                            <thead><tr><th scope="col">Produto</th><th scope="col" className="numeric">A enviar</th><th scope="col" className="numeric">Nesta carga</th><th scope="col" className="numeric">Peso</th></tr></thead>
                            <tbody>
                              {order.items.map((item) => {
                                const value = selection.quantities[item.quoteItemId] ?? "";
                                const quantity = parseQuantity(value);
                                const invalid = Number.isNaN(quantity) || quantity > item.available;
                                return (
                                  <tr key={item.quoteItemId}>
                                    <td>
                                      <span className="strong">{item.productName}</span>
                                      <span className="cell-sub">Saca de {formatNumber(item.weightKg)} kg{item.sold !== item.available ? ` · ${formatNumber(item.sold)} vendidas` : ""}</span>
                                    </td>
                                    <td className="numeric">{formatNumber(item.available)}</td>
                                    <td className="numeric">
                                      <label className="sr-only" htmlFor={`qty-${item.quoteItemId}`}>Sacas de {item.productName} nesta carga</label>
                                      <input
                                        id={`qty-${item.quoteItemId}`}
                                        className="load-quantity"
                                        type="number"
                                        min="0"
                                        max={item.available}
                                        step="1"
                                        inputMode="numeric"
                                        aria-invalid={invalid || undefined}
                                        value={value}
                                        onChange={(event) => setOrder(order.quoteId, { quantities: { ...selection.quantities, [item.quoteItemId]: event.target.value } })}
                                      />
                                    </td>
                                    <td className="numeric">{formatKg((Number.isNaN(quantity) ? 0 : quantity) * item.weightKg)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="Pedidos a enviar" description="Orçamentos aprovados com sacas ainda não colocadas em nenhuma carga.">
          {loadError ? (
            <div className="empty-items">
              <p><strong>{loadError}</strong></p>
              <p><button type="button" className="link-button" onClick={loadCandidates}>Tentar novamente</button></p>
            </div>
          ) : loading ? <p className="panel-loading">Carregando pedidos…</p> : (
            <>
              <div className="field load-search">
                <label className="sr-only" htmlFor="loadSearch">Buscar pedido</label>
                <input id="loadSearch" type="search" placeholder="Buscar por cliente ou número do pedido" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              {available.length === 0 ? (
                <EmptyState title={term ? "Nenhum pedido encontrado." : "Nenhum pedido a enviar."}>
                  {term ? "Confira o nome ou o número digitado." : "Só orçamentos aprovados, com sacas ainda não colocadas em carga, aparecem aqui."}
                </EmptyState>
              ) : (
                <ul className="load-candidates">
                  {available.map((order) => {
                    const bags = order.items.reduce((total, item) => total + Math.max(item.available, 0), 0);
                    const weight = order.items.reduce((total, item) => total + Math.max(item.available, 0) * item.weightKg, 0);
                    const partial = order.items.some((item) => item.available < item.sold);
                    return (
                      <li key={order.quoteId}>
                        <div>
                          <strong>#{order.quoteNumber} · {order.customerName}</strong>
                          <span>
                            {formatNumber(bags)} sacas, {formatKg(weight)} a enviar
                            {partial ? " (parte já está em outra carga)" : ""}
                            {order.approvedAt ? ` · aprovado em ${formatDate(order.approvedAt)}` : ""}
                          </span>
                        </div>
                        <button type="button" className="secondary-button compact-secondary" onClick={() => addOrder(order)}>Adicionar<span className="sr-only"> pedido {order.quoteNumber}</span></button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Panel>
      </div>

      <aside id="loadTicket" className="calculator-ticket" aria-label="Resumo da carga">
        <section className={`order-summary load-summary is-${vehicle ? summary.level : "empty"}`} aria-labelledby="loadWeightTitle">
          <div className="summary-head">
            <h2 className="summary-label" id="loadWeightTitle">Peso da carga</h2>
            <p className="summary-total">{formatKg(summary.totalWeightKg)}</p>
            <p className="summary-caption">{vehicle ? `de ${formatKg(summary.capacityKg)} · ${vehicle.name}` : "Nenhum veículo escolhido"}</p>
            <div
              className="load-meter"
              role="meter"
              aria-label="Ocupação do peso"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={vehicle ? Math.min(percent, 100) : 0}
              aria-valuetext={vehicle ? `${percent}% da capacidade` : "Sem veículo"}
            >
              <span style={{ width: `${vehicle ? Math.min(percent, 100) : 0}%` }} />
            </div>
            <p className="load-meter-text">{vehicle ? `${percent}% da capacidade. ` : ""}{levelText}</p>
          </div>

          <dl className="summary-load">
            <div><dt>Sacas</dt><dd>{formatNumber(summary.bags)}</dd></div>
            <div><dt>Paletes</dt><dd>{formatNumber(summary.pallets)}</dd></div>
            <div><dt>Entregas</dt><dd>{stopGroups.length}</dd></div>
          </dl>

          <div className="summary-tear" aria-hidden="true" />

          <dl className="summary-lines">
            <div><dt>Peso das sacas</dt><dd>{formatKg(summary.bagsWeightKg)}</dd></div>
            <div><dt>Paletes vazios</dt><dd>{formatKg(summary.palletsWeightKg)}</dd></div>
            <div className={summary.remainingKg < 0 ? "load-excess" : undefined}>
              <dt>{summary.remainingKg < 0 ? "Excesso" : "Capacidade restante"}</dt>
              <dd>{vehicle ? formatKg(Math.abs(summary.remainingKg)) : "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="save-quote-panel" aria-label="Salvar carga">
          {(summary.missingPalletWeights.length > 0 || lightStops.length > 0) && (
            <ul className="load-warnings">
              {summary.missingPalletWeights.length > 0 && (
                <li>Sem “sacas por palete” para saca de {summary.missingPalletWeights.map((weight) => `${formatNumber(weight)} kg`).join(", ")}: esses paletes não foram contados.</li>
              )}
              {lightStops.length > 0 && <li>{lightStops.length === 1 ? "Uma entrega está" : `${lightStops.length} entregas estão`} abaixo de {formatKg(MIN_DELIVERY_KG)}.</li>}
            </ul>
          )}
          <button type="button" className="primary-button" disabled={saving || summary.level === "over"} onClick={() => void save()}>
            {saving ? "Salvando…" : state.loadNumber ? `Salvar carga #${state.loadNumber}` : "Salvar carga"}
          </button>
          {error && <p role="alert" className="auth-error">{error}</p>}
        </section>
      </aside>

      <div className="ticket-bar">
        <div>
          <span>Peso da carga</span>
          <strong>{formatKg(summary.totalWeightKg)}{vehicle ? ` · ${percent}%` : ""}</strong>
        </div>
        <a href="#loadTicket">Ver resumo</a>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="Sair sem salvar a carga?"
          description="As alterações desta montagem serão descartadas."
          confirmLabel="Sair sem salvar"
          cancelLabel="Continuar montando"
          danger
          onConfirm={async () => { setConfirmLeave(false); onClose(); }}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
