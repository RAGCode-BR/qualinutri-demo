const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

export function formatNumber(value: number) {
  return numberFormatter.format(value || 0);
}

export function formatPercentage(value: number) {
  return `${Math.round(value * 100) / 100}`.replace(".", ",") + "%";
}
