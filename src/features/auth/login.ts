const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLogin(value: string): boolean {
  return LOGIN_PATTERN.test(normalizeLogin(value));
}

export function loginToInternalEmail(value: string): string {
  return `${normalizeLogin(value)}@login.qualinutri.invalid`;
}
