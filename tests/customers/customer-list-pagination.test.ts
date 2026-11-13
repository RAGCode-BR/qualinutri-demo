import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  customers: Array.from({ length: 1205 }, (_, index) => ({ id: String(index), active: true, legal_name: `Cliente ${index}` })),
}));

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    from: () => {
      let start = 0;
      let end = 0;
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        range: (from: number, to: number) => { start = from; end = to; return query; },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: fixtures.customers.slice(start, end + 1), error: null }).then(resolve, reject),
      };
      return query;
    },
  },
}));

import { listCustomers } from "../../src/services/customerService";

describe("listagem completa de clientes", () => {
  it("busca todas as páginas quando há mais de mil clientes", async () => {
    const customers = await listCustomers();
    expect(customers).toHaveLength(1205);
    expect(customers.at(-1)?.id).toBe("1204");
  });
});
