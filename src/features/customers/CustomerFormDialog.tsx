import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { PHONE_MAX_LENGTH, formatPhoneInput, validatePhone } from "../../domain/contacts/brazilianPhone";
import { DOCUMENT_MAX_LENGTH, formatDocumentInput, guessDocumentKind, validateDocument } from "../../domain/documents/brazilianDocument";
import { createCustomer, updateCustomer, type Customer } from "../../services/customerService";
import type { CustomerInput } from "../../types/customer";
import type { Json } from "../../types/database.types";
import { sourceField } from "./customerSourceFields";
import { Select } from "../../components/Select";
import { BRAZILIAN_STATES, formatPostalCodeInput, isValidPostalCode, POSTAL_CODE_MAX_LENGTH } from "../../domain/address/brazilianAddress";

type CustomerFormDialogProps = {
  /** Cliente em edição; ausente para um cadastro novo. */
  customer?: Customer;
  onClose: () => void;
  onSaved: (message: string) => void;
};

function toForm(customer?: Customer): CustomerInput {
  if (!customer) return { legalName: "", tradeName: "", document: "", phone: "", email: "", notes: "" };
  return {
    legalName: customer.legal_name,
    tradeName: customer.trade_name,
    document: customer.document,
    phone: customer.phone,
    email: customer.email,
    notes: customer.notes,
  };
}

function changed(next: string | null | undefined, previous: string | null | undefined) {
  return (next?.trim() || null) !== (previous?.trim() || null);
}

type AddressField = "street" | "complement" | "district" | "city" | "state" | "postal_code";
const addressFields: ReadonlyArray<{ key: AddressField; label: string; maxLength: number }> = [
  { key: "street", label: "Endereço", maxLength: 200 }, { key: "complement", label: "Complemento", maxLength: 120 },
  { key: "district", label: "Bairro", maxLength: 120 }, { key: "city", label: "Cidade", maxLength: 120 },
  { key: "state", label: "UF", maxLength: 2 }, { key: "postal_code", label: "CEP", maxLength: POSTAL_CODE_MAX_LENGTH },
];

function toAddressForm(address: Json | null | undefined): Record<AddressField, string> {
  return Object.fromEntries(addressFields.map(({ key }) => [key, sourceField(address ?? null, key) ?? ""])) as Record<AddressField, string>;
}

export function CustomerFormDialog({ customer, onClose, onSaved }: CustomerFormDialogProps) {
  const [form, setForm] = useState<CustomerInput>(() => toForm(customer));
  const [addressForm, setAddressForm] = useState(() => toAddressForm(customer?.address));
  const [documentError, setDocumentError] = useState("");
  const rawDocument = sourceField(customer?.legacy_details ?? null, "document_raw");
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const documentKind = guessDocumentKind(form.document);
  const nameLabel = documentKind === "cpf" ? "Nome completo" : documentKind === "cnpj" ? "Razão social" : "Nome ou razão social";

  function field<Key extends keyof CustomerInput>(key: Key, value: CustomerInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    // Cadastros antigos fora do padrão só são validados no campo que for alterado.
    const documentCheck = validateDocument(form.document);
    const phoneCheck = validatePhone(form.phone);
    const nextDocumentError = changed(form.document, customer?.document) && !documentCheck.valid ? documentCheck.message : "";
    const nextPhoneError = changed(form.phone, customer?.phone) && !phoneCheck.valid ? phoneCheck.message : "";
    const email = form.email?.trim() ?? "";
    if (!form.legalName.trim()) {
      setError("Informe o nome ou a razão social.");
      document.getElementById("legalName")?.focus();
      return;
    }
    const postalCode = addressForm.postal_code.trim();
    if (changed(postalCode, sourceField(customer?.address ?? null, "postal_code")) && postalCode && !isValidPostalCode(postalCode)) {
      setError("CEP inválido. Use 8 números, no formato 00000-000.");
      document.getElementById("customer-postal_code")?.focus();
      return;
    }
    if (changed(form.email, customer?.email) && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("E-mail inválido. Confira o endereço digitado.");
      document.getElementById("customerEmail")?.focus();
      return;
    }
    setDocumentError(nextDocumentError);
    setPhoneError(nextPhoneError);
    if (nextDocumentError || nextPhoneError) {
      document.getElementById(nextDocumentError ? "document" : "phone")?.focus();
      return;
    }

    setSaving(true);
    setError("");
    try {
      const existingAddress = customer?.address && typeof customer.address === "object" && !Array.isArray(customer.address)
        ? customer.address : {};
      const address = { ...existingAddress, ...Object.fromEntries(addressFields.map(({ key }) => [key, addressForm[key].trim() || null])) };
      const payload: CustomerInput = { ...form, address: Object.values(address).some(Boolean) ? address : null };
      if (customer) {
        await updateCustomer(customer.id, payload, { document: customer.document, phone: customer.phone });
        onSaved(`${form.legalName.trim()} foi atualizado.`);
      } else {
        await createCustomer(payload);
        onSaved(`${form.legalName.trim()} foi cadastrado.`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o cliente.");
      setSaving(false);
    }
  }

  return (
    <Dialog title={customer ? "Editar cliente" : "Novo cliente"} onClose={() => { if (!saving) onClose(); }}>
      {/* Validação feita no código: campos antigos não alterados não são conferidos. */}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="document">CPF ou CNPJ</label>
          <input
            id="document"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={DOCUMENT_MAX_LENGTH}
            aria-invalid={documentError ? true : undefined}
            aria-describedby="documentHint"
            value={form.document ?? ""}
            onChange={(event) => { field("document", formatDocumentInput(event.target.value)); setDocumentError(""); }}
          />
          {documentError
            ? <p className="field-error" id="documentHint" role="alert">{documentError}</p>
            : rawDocument && !form.document
              ? <p className="field-hint invalid-document" id="documentHint">No cadastro antigo: {rawDocument} (inválido ou incompleto). Digite o CPF/CNPJ correto para corrigir.</p>
              : <p className="field-hint" id="documentHint">Opcional. A pontuação é colocada automaticamente.</p>}
        </div>
        <div className="field">
          <label htmlFor="legalName">{nameLabel}</label>
          <input id="legalName" required maxLength={200} value={form.legalName} onChange={(event) => field("legalName", event.target.value)} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="phone">Telefone/celular</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="(00) 00000-0000"
              maxLength={PHONE_MAX_LENGTH}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? "phoneError" : undefined}
              value={form.phone ?? ""}
              onChange={(event) => { field("phone", formatPhoneInput(event.target.value)); setPhoneError(""); }}
            />
            {phoneError && <p className="field-error" id="phoneError" role="alert">{phoneError}</p>}
          </div>
          <div className="field">
            <label htmlFor="customerEmail">E-mail</label>
            <input id="customerEmail" type="email" value={form.email ?? ""} onChange={(event) => field("email", event.target.value)} />
          </div>
        </div>

        <h3 className="customer-form-subtitle">Endereço</h3>
        <div className="form-grid">
          {addressFields.map(({ key, label, maxLength }) => <div className="field" key={key}>
            <label htmlFor={`customer-${key}`}>{label}</label>
            {key === "state" ? (
              <Select
                id="customer-state"
                value={addressForm.state}
                onChange={(value) => setAddressForm((current) => ({ ...current, state: value }))}
                options={[
                  { value: "", label: "—" },
                  // UF fora da lista (cadastro antigo) continua visível até ser trocada.
                  ...(addressForm.state && !(BRAZILIAN_STATES as readonly string[]).includes(addressForm.state) ? [{ value: addressForm.state, label: addressForm.state }] : []),
                  ...BRAZILIAN_STATES.map((state) => ({ value: state, label: state })),
                ]}
              />
            ) : (
              <input
                id={`customer-${key}`}
                maxLength={maxLength}
                inputMode={key === "postal_code" ? "numeric" : undefined}
                placeholder={key === "postal_code" ? "00000-000" : undefined}
                value={addressForm[key]}
                onChange={(event) => {
                  const value = key === "postal_code" ? formatPostalCodeInput(event.target.value) : event.target.value;
                  setAddressForm((current) => ({ ...current, [key]: value }));
                }}
              />
            )}
          </div>)}
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando…" : customer ? "Salvar alterações" : "Cadastrar cliente"}</button>
        </div>
      </form>
    </Dialog>
  );
}
