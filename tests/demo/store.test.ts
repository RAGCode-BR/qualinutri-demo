import { beforeEach, expect, test, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";

async function loadDb() {
  vi.resetModules();
  return (await import("../../src/demo/store/db")).db;
}

beforeEach(() => { installMemoryStorage(); });

test("inicia com seed quando vazio", async () => {
  const db = await loadDb();
  expect(db.read().customers.length).toBeGreaterThan(0);
});

test("persiste write", async () => {
  const db = await loadDb();
  db.write((t) => { t.seq.quote = 999; });
  const again = await loadDb();
  expect(again.read().seq.quote).toBe(999);
});

test("resemeia quando a versão difere ou o JSON é inválido", async () => {
  const { STORAGE_KEY } = await import("../../src/demo/store/db");
  localStorage.setItem(STORAGE_KEY, "{");
  expect((await loadDb()).read().customers.length).toBeGreaterThan(0);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 0, tables: {} }));
  expect((await loadDb()).read().customers.length).toBeGreaterThan(0);
});

test("funciona sem localStorage", async () => {
  installMemoryStorage({ broken: true });
  const db = await loadDb();
  expect(() => db.write((t) => { t.seq.quote = 5; })).not.toThrow();
  expect(db.read().seq.quote).toBe(5);
});

test("reset volta ao seed", async () => {
  const db = await loadDb();
  const count = db.read().customers.length;
  db.write((t) => { t.customers.pop(); });
  expect(db.read().customers.length).toBe(count - 1);
  db.reset();
  expect(db.read().customers.length).toBe(count);
});

test("subscribe é avisado a cada write", async () => {
  const db = await loadDb();
  const spy = vi.fn();
  const off = db.subscribe(spy);
  db.write(() => {});
  off();
  db.write(() => {});
  expect(spy).toHaveBeenCalledTimes(1);
});
