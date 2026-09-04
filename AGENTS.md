<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Project structure (Wave 1, 2026-09)

## Layout

- `src/` is the **only** Next.js App Router. There is no `app/` at the repo root — that was a stale placeholder removed in Wave 1 cleanup.
- `lib/` at the repo root was **consolidated into `src/lib/`**. The old K-11 files (`k11Model.ts`, `artifacts.ts`, `llmExplanation.ts`, `types.ts`) were moved into `src/lib/` so the `tsconfig.json` path alias `@/lib/...` resolves uniformly.
- Model artifacts live in `/artifacts/` at the repo root (read at runtime via `path.join(process.cwd(), 'artifacts')` in `src/lib/artifacts.ts`):
  - `feature_names.json`
  - `genero_cats.json`
  - `k11_posterior.nc` (binary posterior, not loaded at runtime)
  - `k11_posterior_samples.json.gz` (12 MB gz — load takes ~1.8s cold)
  - `k11_posterior_summary.json`
  - `scaler.json`

## API routes (App Router)

- **Spotify (legacy) routes** under `src/app/api/`:
  - `GET /api/genres` — list of 27 English genres
  - `GET /api/tracks?genre=pop` — search 30 candidates, return 10 with preview
  - `GET /api/tracks/[id]` — track detail + audio features + insight
  - `GET /api/preview/[id]` — proxy of 30s mp3 (handles CORS)
- **K-11 (Wave 1) routes** under `src/app/api/`:
  - `POST /api/diagnose` — body `{ track_features: {danceability, energy, ..., explicit, mode_bin}, genero }` → `{ score, hdi_94: [lo, hi], explicacao, genero, ms_per_call }`. Zod-validated ranges. Returns `valid_generos` (array of 107) on unknown genre.
  - `GET /api/generos` — list of 107 K-11 genres from `genero_cats.json`, with `count`.

## Import conventions

- Use `@/lib/...` for cross-folder imports (e.g. `src/app/api/diagnose/route.ts` → `src/lib/k11Model.ts`).
- Use `./...` for same-folder imports inside `src/lib/` or `src/app/api/.../route.ts`.
- `src/components/` uses `./ComponentName` for sibling imports.

## Dev/build gotcha: `.next/` state corruption

If a `next build` is interrupted (SIGKILL, dependency-missing error, OOM) the dev server may serve stale or broken pages for legacy routes (`/api/genres`, `/api/tracks/[id]` show a 500 page-error referencing `webpack-runtime.js`). The fix is:

```sh
rm -rf .next && npm run dev
```

This regenerates the cache and routes return clean responses. K-11 routes (`/api/diagnose`, `/api/generos`) are unaffected because webpack-dev-server compiles them on demand.

## Required env

- `.env.local` with `OPENROUTER_API_KEY` (placeholder is fine — `llmExplanation.ts` falls back to "indisponível" on 401/403). Without `.env.local` Next.js still boots but warns.
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are needed only for `/api/tracks*` and `/api/preview/*`. Missing them returns 500 with "Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET em .env.local." (clean error, not a crash).

## Status do modelo K-11 (Wave 4, 2026-09)

**ATENÇÃO**: o modelo K-11 **NÃO atende** os thresholds definidos em `scripts/k11_pipeline_colab/relatorio/analises/resultados/q11_summary.json` (`assertions_passed: false`):

| Métrica | Valor | Threshold | Status |
|---|---|---|---|
| Test RMSE | 19.12 | < 18 | ❌ Falhou |
| Test R² | 0.152 | > 0.30 | ❌ Falhou |
| HDI 94% coverage | 0.40 | 0.90-0.97 | ❌ Falhou |
| r_hat max | 1.01 | < 1.01 | ✅ Borderline |
| ESS bulk min | 307 | > 400 | ❌ Falhou |
| **ECE** | **6.56** | (baixo = melhor) | ❌ Calibração ruim |

**Implicações para devs futuros:**

- **R²=0.15** significa que o modelo explica só ~15% da variação real entre hits e não-hits. A maioria da variabilidade é de origem não-audio (marketing, playlist placement, fama do artista, timing).
- **HDI coverage=0.40** significa que o intervalo "94% de credibilidade" só cobre 40% dos casos reais. Em 60% das vezes o valor real está fora do intervalo. O modelo está sub-disperso (intervalos estreitos demais).
- **ECE=6.56** significa calibração ruim — o modelo não "sabe o que não sabe" efetivamente.
- **Variação por gênero é ENORME**: RMSE de `forró` é 4.02, RMSE de `dance` é 37.88 (9.4x pior). O modelo é utilizável para alguns gêneros e inutilizável para outros — não trate todos os 107 gêneros como equivalentes.

**O que isso significa na prática:**
- O score é INDICATIVO, não preditivo. Não use para decisões importantes sem supervisão humana.
- Disclaimer visível no card de UI é OBRIGATÓRIO (Wave 4 Wave 4 honesty pass já implementou).
- Tom da UI deve considerar largura do HDI (Wave 4: largura >= 30 força "Modelo incerto"; largura >= 50 força "Incerto — não usar para decisão").
- Antes de re-treinar para melhorar: revisar prior specification, aumentar draws, validar CPU/T4 não-determinístico.

**Re-treino para melhorar (follow-up, não feito nesta PR):**
- `target_accept=0.95` (em vez de 0.9) — leapfrog mais estável
- `tune=2500` (em vez de 1500) — mais warmup
- Idealmente Colab T4 (~30 min) ou local CPU Ryzen 7 8-core (~2-3h)
- Considerar features adicionais que explicam popularity (release_date, artist_fame, playlist_count) — fora do escopo do áudio
- Considerar TensorflowMusiCNN (essentia.js-model) para valence — só heurística hoje

