import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Os testes da demo montam todos os dados de exemplo; sob carga paralela passam de 5 s.
    testTimeout: 20_000,
  },
});
