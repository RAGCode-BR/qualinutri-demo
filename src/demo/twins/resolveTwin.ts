/**
 * Regra do redirecionamento da demonstração: um import que resolve para
 * `src/services/x.ts`, `src/app/AuthProvider.tsx` ou `src/lib/supabase.ts`
 * passa a apontar para o gêmeo em `src/demo/...`, quando ele existe.
 * Imports feitos de dentro de `src/demo` não são redirecionados.
 */
const TWINNED = [/^src\/services\/[^/]+\.ts$/, /^src\/app\/(AuthProvider|CommercialDataProvider)\.tsx$/, /^src\/lib\/supabase\.ts$/];

export function resolveTwin(resolvedId: string, importer: string | undefined, root: string, exists: (path: string) => boolean): string | null {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  const id = resolvedId.replace(/\\/g, "/").split("?")[0];
  const from = importer?.replace(/\\/g, "/").split("?")[0] ?? "";
  if (from.startsWith(`${normalizedRoot}/src/demo/`)) return null;
  if (!id.startsWith(`${normalizedRoot}/`)) return null;
  const relative = id.slice(normalizedRoot.length + 1);
  if (!TWINNED.some((pattern) => pattern.test(relative))) return null;
  const twin = `${normalizedRoot}/src/demo/${relative.slice("src/".length)}`;
  return exists(twin) ? twin : null;
}
