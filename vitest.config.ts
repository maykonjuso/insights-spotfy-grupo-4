import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // Tests devem rodar em <30s total; 3 sinais sinteticos sao rapidos.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sem coverage por enquanto (mantem suite rapida).
    coverage: {
      enabled: false,
    },
  },
});
