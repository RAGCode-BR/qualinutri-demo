import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { useCommercialData } from "../../app/CommercialDataProvider";
import { Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { deactivateProduct } from "../../services/productService";
import type { Product } from "../../types/commercial";
import { ProductEditDialog } from "./ProductEditDialog";
import { ProductPriceTable } from "./ProductPriceTable";

type EditableProduct = Product & { id: string };

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function ProductsPage() {
  const { profile } = useAuth();
  const { data: { mineralProducts, rationProducts, paymentTermIds, paymentTermLabels, priceTableFrom }, source, loading, reload } = useCommercialData();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditableProduct | null>(null);
  const [deleting, setDeleting] = useState<EditableProduct | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = profile?.role === "administrador";
  const canEdit = isAdmin && source === "supabase" && Boolean(paymentTermIds);
  const query = normalize(search.trim());
  const filter = (products: Product[]) => query ? products.filter((product) => normalize(`${product.name} ${product.group}`).includes(query)) : products;
  const rations = filter(rationProducts);
  const minerals = filter(mineralProducts);

  function asEditable(product: Product) {
    return product.id ? product as EditableProduct : null;
  }

  function startDelete(product: Product) {
    setDeleteError("");
    setDeleting(asEditable(product));
  }

  async function confirmDelete() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await deactivateProduct(deleting.id);
      setMessage(`${deleting.name} foi excluído do catálogo.`);
      setDeleting(null);
      reload();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir o produto.");
    } finally {
      setDeletingBusy(false);
    }
  }

  const tableActions = canEdit
    ? { onEdit: (product: Product) => setEditing(asEditable(product)), onDelete: startDelete }
    : {};

  return (
    <>
      <div className="page-toolbar">
        <p className="page-intro">Preços em R$ por saca, por prazo de pagamento.{priceTableFrom && ` Tabela válida a partir de ${priceTableFrom.split("-").reverse().join("/")}.`}</p>
        <div className="search-field">
          <label className="sr-only" htmlFor="productSearch">Buscar produto</label>
          <input id="productSearch" type="search" placeholder="Buscar produto ou linha" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      {isAdmin && !canEdit && !loading && (
        <p className="warning-message page-notice">A edição de produtos fica disponível quando o sistema está conectado ao servidor. Use “Tentar novamente” no topo da página.</p>
      )}
      {message && <p className="form-message page-notice" role="status">{message}</p>}

      {rations.length === 0 && minerals.length === 0 ? (
        <Panel><EmptyState title="Nenhum produto encontrado.">Confira a grafia ou busque pelo nome da linha.</EmptyState></Panel>
      ) : (
        <>
          {rations.length > 0 && (
            <Panel title="Rações" actions={<span className="count-badge">{rations.length} {rations.length === 1 ? "produto" : "produtos"}</span>} flush>
              <ProductPriceTable products={rations} label="Preços de rações" {...tableActions} />
            </Panel>
          )}
          {minerals.length > 0 && (
            <Panel title="Mineral, proteinado e núcleos" actions={<span className="count-badge">{minerals.length} {minerals.length === 1 ? "produto" : "produtos"}</span>} flush>
              <ProductPriceTable products={minerals} label="Preços de mineral, proteinado e núcleos" {...tableActions} />
            </Panel>
          )}
        </>
      )}

      {editing && paymentTermIds && (
        <ProductEditDialog
          product={editing}
          paymentTermIds={paymentTermIds}
          paymentTermLabels={paymentTermLabels}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setMessage(`${name} foi atualizado.`);
            reload();
          }}
        />
      )}

      {deleting && (
        <Dialog
          title={`Excluir ${deleting.name}?`}
          description="O produto sai desta tabela e da Calculadora. Orçamentos já salvos continuam com os valores originais."
          size="small"
          onClose={() => { if (!deletingBusy) setDeleting(null); }}
        >
          {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" disabled={deletingBusy} onClick={() => setDeleting(null)}>Cancelar</button>
            <button type="button" className="primary-button is-danger" disabled={deletingBusy} onClick={() => void confirmDelete()}>{deletingBusy ? "Excluindo…" : "Excluir produto"}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
