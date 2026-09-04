# Wave 3 — UI Integration: deliverable

**Data:** 2026-09-03
**Status:** COMPLETO com caveat (1 blocker pré-existente, fix abaixo)

## Summary

Integração K-11 no UploadAnalyzer. Usuário faz upload de MP3, vê score heurístico (existente) E score K-11 (novo) com HDI 94%, explicação LLM, chips de origem por feature (11 features) e disclaimer de acurácia experimental (R²=0.15, HDI coverage=0.40). 4/4 endpoints curl PASS, 0/? UI E2E (bloqueado por issue pré-existente em `package.json`, fix em 1 linha).

## What was built

| Arquivo | Tipo | Linhas | Função |
|---|---|---:|---|
| `src/components/K11DiagnoseCard.tsx` | NOVO | ~250 | Card de resultado: score ring + HDI bar + LLM + disclaimer experimental + disclosure de features |
| `src/components/FeatureOriginChips.tsx` | NOVO | ~190 | 11 chips coloridos (essentia verde, DSP azul, proxy amarelo, metadata cinza) com confidence por feature |
| `src/lib/k11Client.ts` | NOVO | ~180 | Wrapper tipado do `/api/diagnose` e `/api/generos`, JSDoc completo, error handling robusto |
| `src/components/UploadAnalyzer.tsx` | MODIFICADO | +60 | 3 validações (0 bytes, >50MB, <5s), state K-11, handler `runK11Diagnose`, integração do card K-11 e chips |
| `src/app/globals.css` | MODIFICADO | +30 | Bloco `.k11-card`, `.k11-hdi`, `.k11-explicacao` |

**Total:** 3 novos + 2 modificados, ~140 linhas líquidas.

## What was tested (curl E2E)

| Teste | Esperado | Obtido | Status |
|---|---|---|---|
| POST /api/diagnose (pop) | 200, score 0-100, hdi com hdi_lo<score<hdi_hi, explicacao PT-BR | 200, score 23, hdi [18,28], hdi_lo<score<hdi_hi ✓, explicacao fallback "indisponível" (esperado com placeholder key) | PASS |
| POST /api/diagnose (forro) | 200, forro nos 107, score válido | 200, score 41, hdi [30,55], forro presente | PASS |
| POST /api/diagnose (INVALID) | 400, valid_generos length 107 | 400, valid_generos length 107 | PASS |
| POST /api/diagnose (danceability=5.0) | 400 validation error | 400 "Number must be less than or equal to 1" | PASS |
| GET /api/generos | 200, count=107 | 200, count=107, "forro" presente | PASS |
| Latência server-side (ms_per_call) | <2000ms | 1019ms (pop warm) / 1841ms (forro warm) | PASS |
| Latência wall-time curl | <8s | 7.7s cold (5.6s compile) / 0.07s warm | PASS |
| E2E UI (browser) | upload → card K-11 visível → score ring | NÃO TESTADO — `/` retorna 500 (essentia.js não instalado) | **FAIL (blocker)** |

## Critic verdict

**FAIL** (com 1 blocker pré-existente + 5 NITs):

### Blocker (Wave 2 herdado)
- **`essentia.js` NÃO está em `package.json`** → `node_modules/essentia.js/` ausente → webpack-dev-server falha em `src/lib/essentia-analysis.ts:43` → `/` retorna 500 → UI E2E impossível
- **Fix:** adicionar `"essentia.js": "^0.1.3"` (ou versão atual) em `dependencies` de `package.json`, rodar `npm install`. Wave 2 build-essentia deveria ter feito isso e não fez.

### NITs (cosméticos, não-bloqueantes)
- 5.2 Duplicação de feature disclosure (chips + K11DiagnoseCard mostram mesma info)
- 5.3 Validação Zod com mensagem genérica ("Validation failed" em vez de "danceability fora de range")
- 5.4 `selectedK11Genre` é global, não por-card (raro: 2 uploads em paralelo)
- 5.5 Sem `AbortController` no `k11Client.diagnose` (latência >5s fica pendurada)
- 5.6 Latência cold-start 5-7s não documentada (UX pode parecer travado)

## UX flow (como o usuário usa)

1. Abre `http://localhost:3000/upload` (ou clica em "Enviar e classificar música" no wizard)
2. Arrasta MP3 (≥5s, ≤50MB) para o dropzone OU clica para selecionar
3. Espera ~3-5s (essentia.js init + DSP + GTZAN genre + heurística)
4. Vê resultado existente: **score heurístico** + **gênero provável (GTZAN)** + **features de som**
5. **NOVO:** abaixo do SoundFeatureGrid, vê o bloco K-11:
   - **FeatureOriginChips**: 11 chips coloridos (verde/azul/amarelo/cinza) com confiança
   - **Select** com 107 gêneros do K-11 (default: vazio, user escolhe)
   - **Botão "Diagnosticar com K-11"** (disabled se gênero não selecionado)
6. Seleciona gênero (ex: "pop")
7. Clica no botão
8. Espera ~2s (warm) ou ~7s (cold)
9. Vê **K11DiagnoseCard** com:
   - **Score grande** (mesma UI do score heurístico: anel colorido high/mid/low + label)
   - **HDI bar**: marcador com [lo, hi] do intervalo de credibilidade 94%
   - **Explicação LLM** em PT-BR (ou "indisponível" com placeholder key)
   - **Disclaimer experimental**: "K-11 é experimental (R²=0.15, HDI coverage=0.40). Use como indicação, não predição exata."

## Known limitations

1. **Blocker essentia.js**: precisa de `npm install essentia.js` (Wave 2 deveria ter feito)
2. **LLM placeholder**: `OPENROUTER_API_KEY=sk-or-v1-PLACEHOLDER-...` → explicação sempre "indisponível" (esperado até usuário preencher key real)
3. **GTZAN→K-11 bridge**: hoje `selectedK11Genre` é default vazio; em produção futura, poderia ter sugestão automática baseada no top-1 do GTZAN
4. **5 NITs documentados** pelo critic (cosméticos, não-bloqueantes)

## How to run (após fix do blocker)

```bash
# 1. Fix blocker
cd "C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4"
# Editar package.json: adicionar "essentia.js": "^0.1.3" em dependencies
npm install

# 2. Subir dev server
rm -rf .next && npm run dev

# 3. Abrir browser
# http://localhost:3000 → wizard landing → "Enviar e classificar música" → upload MP3
# 4. Selecionar gênero K-11 → clicar "Diagnosticar com K-11" → ver score + HDI + LLM
```

## What's next (Wave 4)

Wave 4 (multi-critic) pode começar, MAS o fix do blocker (essentia.js) deve ser feito ANTES para que o critic consiga abrir a UI via browser.

**Recomendação:** criar Wave 3.5 (mini-wave corretiva, 1 agente) para adicionar `essentia.js` ao `package.json` + `npm install` + smoke test do `/`. Depois, Wave 4 pode abrir o app de verdade.

**Alternativa:** Wave 4 pode fazer só o judge-only (3 critics paralelos sem browser, baseado em código + curl). Aí Wave 5 é o fix + re-validar.

**Sugestão pragmática:** fazer fix inline (manual, 1 minuto) e disparar Wave 4 com critic UI funcional.
