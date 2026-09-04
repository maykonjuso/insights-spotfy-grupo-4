# Wave 4 — Multi-critic (validação independente do MVP)

## Estado atual (pré-wave)
- src/ é o Next.js canônico com Spotify (legado) + K-11 (Wave 1) + UI (Wave 3)
- src/lib/k11Model.ts: predição Bayesiana
- src/lib/extractK11Features.ts (Wave 2): glue essentia + DSP + proxies
- src/lib/k11Client.ts (Wave 3): wrapper tipado
- src/components/UploadAnalyzer.tsx (Wave 3 modificado): botão K-11 + card
- src/components/K11DiagnoseCard.tsx, FeatureOriginChips.tsx
- /api/diagnose (POST), /api/generos (GET)
- artifacts/ no root (modelo treinado)
- essentia.js instalado + WASM em public/essentia/
- 5 testes curl PASS, UI inacessível antes do fix, agora funcional

## Goal da Wave 4
Validação independente do MVP completo. 3 critics paralelos com lentes diferentes + synthesizer. Cada critic com FRESH CONTEXT (não viu Wave 1-3).

## Agentes
- Phase 1: 3 critics em paralelo (functional, UX, accuracy)
- Phase 2: 1 synthesizer que combina os 3 relatórios

## Bar (PASS/FAIL)
- O synthesizer produz um relatório com:
  - Lista de issues priorizados (blocker / major / minor / nit)
  - Cada issue tem localização (arquivo:linha) e esforço estimado
  - Verdict final: SHIP-READY / NEEDS-FIXES-BEFORE-SHIP / MAJOR-REWORK
- Cada critic:
  - Roda seus próprios testes (curl, leitura de código, raciocínio sobre UX)
  - Julga de forma INDEPENDENTE (não sabe o que os outros acharam)
  - Reporta achados verificáveis

## Pós-Wave 4
PR com a entrega completa (4 waves + blocker fix).
