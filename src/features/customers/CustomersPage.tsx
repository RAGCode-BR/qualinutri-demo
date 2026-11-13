import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { ScrollableTable } from "../../components/ScrollableTable";
import { Select } from "../../components/Select";
import { deactivateCustomer, getCustomer, listCustomers, type Customer, type CustomerSummary } from "../../services/customerService";
import { formatNumber } from "../../utils/formatters";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { CustomerDetailDialog } from "./CustomerDetailDialog";
import { failure, Notice, success, type NoticeState } from "../../components/Notice";

/** null: janela fechada; "new": cadastro; Customer: edição. */
type FormTarget = null | "new" | Customer;

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const digitsOf = (text: string | null) => (text ?? "").replace(/\D/g, "");

/** Busca sem acento por nome, código, documento ou cidade; com 3+ dígitos, também por telefone e documento. */
function matchesSearch(customer: CustomerSummary, term: string, digits: string) {
  const texts = [customer.legal_name, customer.trade_name, customer.legacy_code, customer.document, customer.document_raw, customer.city];
  if (texts.some((value) => value && normalize(value).includes(term))) return true;
  return digits.length >= 3 && [customer.phone, customer.document, customer.document_raw].some((value) => digitsOf(value).includes(digits));
}

const pageSizeOptions = [15, 30, 50].map((size) => ({ value: String(size), label: String(size) }));

export function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [deactivating, setDeactivating] = useState<CustomerSummary | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deactivatingBusy, setDeactivatingBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const visibleCustomers = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return customers;
    const digits = digitsOf(term);
    return customers.filter((customer) => matchesSearch(customer, term, digits));
  }, [customers, search]);
  const pageCount = Math.max(1, Math.ceil(visibleCustomers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;
  const pageCustomers = visibleCustomers.slice(firstIndex, firstIndex + pageSize);

  async function reload() {
    try {
      setCustomers(await listCustomers());
    } catch {
      setNotice(failure("Não foi possível carregar os clientes."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  /** A lista traz só o resumo; a ficha e a edição buscam o cadastro completo. */
  async function openFull(customer: CustomerSummary, then: (full: Customer) => void) {
    if (openingId) return;
    setOpeningId(customer.id);
    setNotice(null);
    try {
      then(await getCustomer(customer.id));
    } catch {
      setNotice(failure(`Não foi possível abrir o cadastro de ${customer.legal_name}.`));
    } finally {
      setOpeningId(null);
    }
  }

  async function confirmDeactivate() {
    if (!deactivating || deactivatingBusy) return;
    setDeactivatingBusy(true);
    setDeactivateError("");
    try {
      await deactivateCustomer(deactivating.id);
      setNotice(success(`${deactivating.legal_name} foi desativado.`));
      setDeactivating(null);
      await reload();
    } catch {
      setDeactivateError("Não foi possível desativar o cliente.");
    } finally {
      setDeactivatingBusy(false);
    }
  }

  const newCustomerButton = (
    <button type="button" className="primary-button compact-button" onClick={() => { setNotice(null); setFormTarget("new"); }}>
      Novo cliente
    </button>
  );

  return <>
    <Notice notice={notice} />
    <Panel
      title="Clientes ativos"
      description={!loading && customers.length > 0 ? `${formatNumber(customers.length)} ${customers.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}` : undefined}
      actions={newCustomerButton}
      flush
    >
      {loading ? <p className="panel-loading">Carregando clientes…</p> : customers.length === 0 ? (
        <EmptyState title="Nenhum cliente cadastrado.">Clique em “Novo cliente” para cadastrar o primeiro.</EmptyState>
      ) : <><div className="customer-search field"><label htmlFor="customerSearch">Buscar por nome, código, documento, telefone ou cidade</label><input id="customerSearch" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar cliente" /></div>{visibleCustomers.length === 0 ? <p className="panel-loading">Nenhum cliente encontrado para esta busca.</p> : <><ScrollableTable><table className="data-table customers-table stack-table">
        <thead><tr>
          <th scope="col">Cliente</th>
          <th scope="col">CPF ou CNPJ</th>
          <th scope="col">Telefone/celular</th>
          <th scope="col">E-mail</th>
          <th scope="col"><span className="sr-only">Ações</span></th>
        </tr></thead>
        <tbody>{pageCustomers.map((customer) => <tr key={customer.id}>
          <td className="cell-primary"><span className="strong">{customer.legal_name}</span>{customer.trade_name && <span className="cell-sub">{customer.trade_name}</span>}{customer.legacy_code && <span className="cell-sub">Código {customer.legacy_code}</span>}</td>
          <td className="nowrap-cell" data-label="CPF ou CNPJ">{customer.document
            || (customer.document_raw
              ? <span className="cell-value"><span>{customer.document_raw}</span><span className="cell-sub invalid-document">Documento inválido</span></span>
              : <span className="muted-cell">—</span>)}</td>
          <td className="nowrap-cell" data-label="Telefone/celular">{customer.phone || <span className="muted-cell">—</span>}</td>
          <td data-label="E-mail">{customer.email || <span className="muted-cell">—</span>}</td>
          <td className="action-cell">
            <button type="button" className="row-button is-primary" disabled={openingId !== null} onClick={() => void openFull(customer, setDetail)}>{openingId === customer.id ? "Abrindo…" : "Ficha"}<span className="sr-only"> de {customer.legal_name}</span></button>
            <button type="button" className="row-button" disabled={openingId !== null} onClick={() => void openFull(customer, setFormTarget)}>Editar<span className="sr-only"> {customer.legal_name}</span></button>
            <button type="button" className="row-button is-danger" onClick={() => { setDeactivateError(""); setDeactivating(customer); }}>Desativar<span className="sr-only"> {customer.legal_name}</span></button>
          </td>
        </tr>)}</tbody>
      </table></ScrollableTable><div className="customer-pagination">
        <span>Exibindo {formatNumber(firstIndex + 1)}–{formatNumber(Math.min(firstIndex + pageSize, visibleCustomers.length))} de {formatNumber(visibleCustomers.length)} {visibleCustomers.length === 1 ? "cliente" : "clientes"}</span>
        <div className="customer-pagination-controls">
          <button type="button" className="row-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {formatNumber(currentPage)} de {formatNumber(pageCount)}</span>
          <button type="button" className="row-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button>
          <div className="customer-page-size"><label htmlFor="customerPageSize">Por página</label><Select id="customerPageSize" className="compact-select" value={String(pageSize)} options={pageSizeOptions} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} /></div>
        </div>
      </div></>}</>}
    </Panel>

    {formTarget && (
      <CustomerFormDialog
        customer={formTarget === "new" ? undefined : formTarget}
        onClose={() => setFormTarget(null)}
        onSaved={(savedMessage) => {
          setFormTarget(null);
          setNotice(success(savedMessage));
          void reload();
        }}
      />
    )}

    {detail && <CustomerDetailDialog customer={detail} onClose={() => setDetail(null)} />}

    {deactivating && (
      <Dialog
        title={`Desativar ${deactivating.legal_name}?`}
        description="O cliente sai da lista e não aparece mais para novos orçamentos. Orçamentos já salvos não mudam."
        size="small"
        onClose={() => { if (!deactivatingBusy) setDeactivating(null); }}
      >
        {deactivateError && <p className="auth-error" role="alert">{deactivateError}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={deactivatingBusy} onClick={() => setDeactivating(null)}>Cancelar</button>
          <button type="button" className="primary-button is-danger" disabled={deactivatingBusy} onClick={() => void confirmDeactivate()}>{deactivatingBusy ? "Desativando…" : "Desativar cliente"}</button>
        </div>
      </Dialog>
    )}
  </>;
}
