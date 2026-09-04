# Wave 1 — Integração K-11 no app src/

## Estado inicial (antes da wave)
- `src/` é o Next.js canônico (UI rica, 11 componentes, 4 API routes Spotify, design system 1090 linhas)
- `lib/` (root) tem `k11Model.ts`, `artifacts.ts`, `llmExplanation.ts`, `types.ts` (K-11)
- `scripts/k11_pipeline_colab/artifacts/` tem o modelo treinado (`k11_posterior.nc` 90MB, `k11_posterior_samples.json.gz` 12MB, `k11_posterior_summary.json` 57KB, `scaler.json`, `feature_names.json`, `genero_cats.json`)
- `app/` (root) é alucinação (5 placeholders, 138 linhas) — DEVE ser deletado (com backup antes)

## Estado final (após a wave)
- K-11 servido como endpoint REST, com inferência <500ms
- 5 rotas funcionando: 3 existentes (regressão) + 2 novas
- Backup do `app/` em `gauntlet/_backup_app_<ts>/` antes de deletar
- Próxima wave pode construir UI em cima

## Agentes
- Phase 1: Setup (1)
- Phase 2: Build (3 paralelos: files, artifacts, cleanup)
- Phase 3: Verify (test)
- Phase 4: Critic (fresh context)
- Phase 5: Smooth
- Phase 6: Report

## Bar (PASS/FAIL)
1. `next build` exit 0
2. 3 rotas existentes: GET /api/genres (English 27), GET /api/tracks?genre=X (pode falhar sem SPOTIFY_CLIENT_ID — esperado, registrar), GET /api/tracks/[id]
3. 2 rotas novas: GET /api/generos (107 K-11), POST /api/diagnose (11 features + genero)
4. 3 adversariais: genero inválido → 400 valid_generos, feature fora de range → 400 validation, body vazio → 400
5. `app/` deletado, `lib/` movido, `src/lib/` tem os 4 arquivos, `artifacts/` no root, `.env.local` criado
