# Wave 1 Setup — Validação de pré-condições

Data: 2026-09-03
Agente: setup (Wave 1)
Escopo: validar estado atual do repo antes de Build · files / Build · cleanup.

---

## 1. Estado validado (checklist 1–10)

| # | Pré-condição | Status | Evidência |
|---|--------------|:------:|-----------|
| 1 | `src/app/page.tsx` existe e importa `SpotifyAnalyzer` | ✓ | `src/app/page.tsx:1` — `import { SpotifyAnalyzer } from "@/components/SpotifyAnalyzer";` |
| 2 | `src/app/layout.tsx` existe e importa `globals.css` | ✓ | `src/app/layout.tsx:2` — `import "./globals.css";` |
| 3 | `src/app/api/{genres,tracks,tracks/[id],preview/[id]}/route.ts` | ✓ | 4 arquivos presentes: `genres/route.ts`, `tracks/route.ts`, `tracks/[id]/route.ts`, `preview/[id]/route.ts` |
| 4 | `src/components/` tem 11 arquivos `.tsx` | ✓ | GenreSelector, LandingHero, PlayButton, PopularityInsights, PreviewPlayer, SoundFeatureGrid, SpotifyAnalyzer, TrackList, TrackScanner, UploadAnalyzer, WizardHeader |
| 5 | `src/lib/` tem 12+ arquivos `.ts` | ✓ (12) | audio-analysis, audio-decode, audio-features, essentia-analysis, genre-classifier, genre-model, genres, insights, preview-player, preview-source, sound-features, spotify |
| 6 | `lib/` (root) tem `k11Model.ts`, `artifacts.ts`, `llmExplanation.ts`, `types.ts` | ✓ | Todos os 4 arquivos presentes |
| 7 | `scripts/k11_pipeline_colab/artifacts/` tem os 6 arquivos listados | ✓ | `feature_names.json`, `genero_cats.json`, `k11_posterior.nc`, `k11_posterior_samples.json.gz`, `k11_posterior_summary.json`, `scaler.json` (+ bônus: `split_indices.npz`) |
| 8 | `app/` (root) é ALUCINAÇÃO a deletar | ✓ | Confirmado: `app/{page,layout}.tsx` (2) + `app/api/{diagnose,generos}/route.ts` (2) + `app/diagnose/page.tsx` (1) = 5 arquivos placeholder |
| 9 | `package.json` tem `next ^15`, `openai ^4`, `zod ^3.23` | ✓ | `next ^15.0.0`, `openai ^4.0.0`, `zod ^3.23.0` |
| 10 | `tsconfig.json` tem `"@/*": ["./*"]` | ✓ | Linha 22 — `"@/*": ["./*"]` (funciona tanto para root quanto `src/`) |

**Resultado: 10/10 pré-condições validadas.**

---

## 2. Bloqueios

**Nenhum bloqueio identificado.** Todas as 10 pré-condições passaram.

Observações não-bloqueantes (informativas para o Build):

- `src/components/UploadAnalyzer.tsx` hoje usa um `buildUploadScore()` próprio (DSP simples: duração/energia/dinâmica/pico) — não usa K-11. Esse fluxo coexistirá com o diagnóstico K-11 quando a UI Wave 3 acoplar.
- `lib/artifacts.ts` resolve artefatos via `path.join(process.cwd(), 'artifacts')` (root, não `src/`). Build precisa garantir que `artifacts/` esteja no root e acessível em runtime.
- `lib/llmExplanation.ts` referencia `feature_names` por `await import('./artifacts')` — funciona, mas o `feature_names` importado em `k11Model.ts` já é estático; vale padronizar no Build.
- `lib/k11Model.ts` carrega `posteriorSamples` (12 MB gz) em runtime a cada cold start — o endpoint pode demorar ~1–2 s na primeira chamada. Aceitável, mas vale medir.
- `.env.local.example` existe (1 linha: `OPENROUTER_API_KEY`). Build precisa criar `.env.local` real antes de Verify.
- AGENTS.md alerta: **"This is NOT the Next.js you know"** — leitura de `node_modules/next/dist/docs/` antes de codar rotas.
- `next.config.ts` e `next-env.d.ts` presentes (não lidos aqui, mas existem).
- `.gitignore` já ignora `q9_*.npy`, `q9_*.nc`, `scripts/k11_pipeline/artifacts/`, `public/essentia/` — mas **não ignora** `scripts/k11_pipeline_colab/artifacts/` nem `artifacts/` no root. Build deve checar se o gitignore precisa ser estendido.
- Split-indices `scripts/k11_pipeline_colab/artifacts/split_indices.npz` é bônus (não estava no checklist, mas pode ser útil para Wave 4 — Critic accuracy).

---

## 3. Plano de execução (resumo)

1. **Build · files** (paralelo a cleanup): mover `lib/{k11Model,artifacts,llmExplanation,types}.ts` → `src/lib/`; criar `src/app/api/generos/route.ts` (mirror de `app/api/generos/route.ts`) e `src/app/api/diagnose/route.ts` (mirror de `app/api/diagnose/route.ts`); copiar artefatos de `scripts/k11_pipeline_colab/artifacts/` → `artifacts/` no root (para `process.cwd()` resolver); criar `.env.local` com `OPENROUTER_API_KEY` real.
2. **Build · cleanup** (paralelo a files): fazer backup `app/` → `gauntlet/_backup_app_<ts>/`; deletar `app/` (root); ajustar `.gitignore` para `artifacts/` se necessário.
3. **Verify · test**: `next build` exit 0; smoke test em `GET /api/genres`, `GET /api/generos`, `POST /api/diagnose` (3 adversariais: gênero inválido, feature fora de range, body vazio).
4. **Critic**: revisão independente do estado pós-Build.
5. **Smooth**: ajustes finais.
6. **Report**: PR com diff resumido.

---

## 4. Próximo passo

→ Acionar agentes **Build · files** e **Build · cleanup** em paralelo (Wave 1 fase 2).
