import { expect, test } from "vitest";
import { resolveTwin } from "../../src/demo/twins/resolveTwin";

const root = "/p";
const twins = new Set(["/p/src/demo/services/quoteService.ts", "/p/src/demo/app/AuthProvider.tsx", "/p/src/demo/lib/supabase.ts"]);
const has = (p: string) => twins.has(p);

test("redireciona serviço com gêmeo", () => {
  expect(resolveTwin("/p/src/services/quoteService.ts", "/p/src/features/quotes/QuotesPage.tsx", root, has)).toBe("/p/src/demo/services/quoteService.ts");
});
test("redireciona AuthProvider", () => {
  expect(resolveTwin("/p/src/app/AuthProvider.tsx", "/p/src/main.tsx", root, has)).toBe("/p/src/demo/app/AuthProvider.tsx");
});
test("redireciona lib/supabase", () => {
  expect(resolveTwin("/p/src/lib/supabase.ts", "/p/src/app/CommercialDataProvider.tsx", root, has)).toBe("/p/src/demo/lib/supabase.ts");
});
test("ignora query string", () => {
  expect(resolveTwin("/p/src/services/quoteService.ts?v=1", "/p/src/x.ts", root, has)).toBe("/p/src/demo/services/quoteService.ts");
});
test("não redireciona import vindo de src/demo", () => {
  expect(resolveTwin("/p/src/services/quoteService.ts", "/p/src/demo/services/quoteService.ts", root, has)).toBeNull();
});
test("sem gêmeo, mantém", () => {
  expect(resolveTwin("/p/src/services/serviceError.ts", "/p/src/x.ts", root, has)).toBeNull();
});

test("redireciona CommercialDataProvider", () => {
  const withProvider = (p: string) => p === "/p/src/demo/app/CommercialDataProvider.tsx";
  expect(resolveTwin("/p/src/app/CommercialDataProvider.tsx", "/p/src/app/AuthGate.tsx", root, withProvider)).toBe("/p/src/demo/app/CommercialDataProvider.tsx");
});
