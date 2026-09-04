import { defineConfig } from 'vitest/config';

// Config para os testes do K-11 (k11Model.test.ts na raiz). Roda rapido,
// sem coverage, sem jsdom (testes sao puros de logica do modelo).
export default defineConfig({
  test: {
    include: ['*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: { enabled: false },
  },
});
