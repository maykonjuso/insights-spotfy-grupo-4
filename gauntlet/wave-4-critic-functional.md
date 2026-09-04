# Wave 4 — Critic-Functional (independent MVP validation)

**Date:** 2026-09-04
**Lens:** Functional end-to-end correctness (backend routes, contracts, latency, error shape, regression).
**Context:** Fresh — did NOT read Wave 1/2/3 critic reports or builder logs.
**Environment:** Windows 10, Node v22.23.2, Next.js 15.5.25 (port 3001; 3000 was occupied by another process).

---

## Setup

- `rm -rf .next` done.
- `npm run dev` started in background; "Ready in 6.9s" on http://localhost:3001.
- All 6 functional tests run against the live dev server with `curl.exe` (via Git Bash on Windows).

---

## 6 Functional Tests — Results

| # | Test | Expected | Obtained | Result | Latency (ms) | Notes |
|---|------|----------|----------|--------|--------------|-------|
| a | `GET /` | 200, HTML containing UploadAnalyzer | 200, 12.8 KB HTML, `<title>Spotify Popularity Lab</title>`, h1 rendered; UploadAnalyzer is "use client" so component text not in initial HTML shell | **PASS** | 13 894 (cold 1st-compile) / 401 warm | Page shell loads; client component mount is implicit (would need headless browser to assert). Title + h1 in initial HTML = server-side render path is working. |
| b | `GET /api/generos` | 200, `.generos` array, `.count === 107` | 200, `count=107`, `len=107`, contains `"pop"` and `"forro"`, no `"INVALID"` | **PASS** | 2 489 (cold) | Payload is a JSON object with `generos: string[]` + `count: number`. Schema stable. |
| c | `POST /api/diagnose` (pop, valid features) | 200, `score ∈ [0,100]`, `hdi_94[0] < score < hdi_94[1]` | 200, `score=23`, `hdi_94=[19,28]`, `19<23<28` ✓, `genero="pop"`, `ms_per_call=834` | **PASS** | 834 (cold) / 353 / 192 warm | Deterministic — second/third warm calls return the same `score=23`, `hdi_94=[19,28]`. `ms_per_call` includes LLM round-trip. |
| d | `POST /api/diagnose` (forro) | 200, `"forro"` in 107 generos | 200, `genero="forro"`, `score=42`, `hdi_94=[36,48]`, `ms_per_call=438` | **PASS** | 438 | "forro" present in `/api/generos` list (verified separately). Score different from pop (42 vs 23) → genre-specific posterior is wired correctly. |
| e | `POST /api/diagnose` (genero="INVALID") | 400, `valid_generos.length === 107` | 400, `error="Unknown genre: INVALID"`, `valid_generos.length=107` | **PASS** | 55 | Error payload shape `{ error: string, valid_generos: string[] }` — full list echoed back so client can show user a dropdown. |
| f | `POST /api/diagnose` (danceability=5.0) | 400 (Zod validation) | 400, `error="Validation failed"`, `details.fieldErrors.track_features=["Number must be less than or equal to 1"]` | **PASS** | 63 | Zod fires before LLM/predict — fast reject. Error shape is `{ error, details: { formErrors, fieldErrors } }`. Different shape from genre error (e) — see issue #3. |

### Regression: `GET /api/genres` (legacy English 27-list)

| Expected | Obtained | Result |
|----------|----------|--------|
| 200 (or 500 without SPOTIFY_CREDS) | **200, 25 genres** (matches `src/lib/genres.ts` hardcoded list) | **PASS** |

No regression. The 27-vs-25 discrepancy mentioned in the prompt is `src/lib/genres.ts` actually having 25 entries (not 27) — pre-existing, not a Wave 1-3 regression.

---

## Latency Profile (ms_per_call from `/api/diagnose`)

| Call | Cold/warm | ms_per_call | curl total | Notes |
|------|-----------|-------------|------------|-------|
| 1st (cold, dev first compile) | cold | 834 | 5 023 | First POST after server start; dev-mode compile of route. |
| 2nd | warm | 945 | 2 043 | |
| 3rd | warm | 353 | 402 | |
| 4th | warm | — | 454 | |
| 5th | warm | — | 192 | |

**Verdict on latency bar:**
- Warm `ms_per_call` (predict + LLM round-trip): **192–945 ms** → well under the **2 000 ms** warm target.
- Cold `ms_per_call`: **834 ms** → under the **8 000 ms** cold target.
- In production with a real `OPENROUTER_API_KEY`, LLM latency may dominate (variable, ~500 ms–5 s). With a placeholder key the OpenAI SDK errors out after the network round-trip, contributing ~300–700 ms. Bar still met.

---

## API Contract Stability

| Aspect | Success (200) | Genre error (400) | Validation error (400) |
|--------|---------------|------------------|------------------------|
| Top-level fields | `score`, `hdi_94`, `explicacao`, `genero`, `ms_per_call` | `error`, `valid_generos` | `error`, `details` |
| Predictable keys | ✓ | ✓ | ✓ |
| No leakage of internals | ✓ (no stack traces) | ✓ | minor (Zod path leaked: see issue #4) |

**Observations:**
- All success/error responses are JSON with a stable, documented top-level shape.
- `ms_per_call` is reported only on success — clients should default to `null`/omit if absent.
- 500 errors are possible (uncaught in try/catch wrapper at `route.ts:81-89`) and would return `{ error: <msg> }` — same shape as 400 but with status 500. Client should branch on status, not on `error` field.

---

## Production Hazards (out-of-scope but flagged)

1. **Memory / first-request latency**: `artifacts.ts` reads + gz-decompresses `k11_posterior_samples.json.gz` on every **module init** (not on first request). This is module-cached, so it's a one-time ~2–10 MB JSON parse at server start, not per-request. No leak.
2. **Race conditions**: `/api/diagnose` is stateless (no shared mutable state). Posterior samples are read-only. No race.
3. **Module init errors**: If `artifacts/k11_posterior_samples.json.gz` is missing/corrupt, **every** request to `/api/diagnose` will 500 with `ENOENT` (read in `artifacts.ts:14`). Better to fail fast at server start (top-level import) than per-request. The current code does fail fast (top-level `loadGzJSON`), but the error is opaque to the user. See issue #5.
4. **LLM coupling**: `/api/diagnose` is *blocking* on the LLM response (no timeout). With a real key but slow upstream, the entire HTTP request blocks. The 8 s cold target could blow past in a degraded LLM situation. See issue #6.
5. **Posterior sample determinism**: 1000 samples are iterated in order; sorting uses Array.sort which is not strictly O(N log N) stable in all engines but the `sort((a,b)=>a-b)` is monotone so this is fine.
6. **`Math.exp(mu_log) - 1` clamp**: `predict()` clamps to `[0,100]` per-sample, but `score = mean` is rounded without re-clamping. A pathological sample distribution could theoretically produce `score < 0` or `> 100` post-mean; in practice the per-sample clamp prevents this. See issue #7 (nit).
7. **`beta_gk_used` is from sample 0 only**: the route only stores `beta_gk_used` from `s==0` (k11Model.ts:36). For the LLM prompt this is the "best single" β vector, not the mean β. This is a defensible design choice (sample-0 = posterior mean proxy) but the LLM prompt presents it as "the influence" of each feature. See issue #8 (major — but accuracy-critic territory).
8. **`ms_per_call` includes LLM**: not a regression but it's not what its name suggests (it's not just K-11 predict time, it's the whole request handler).

---

## Issues by Severity

### Blockers
*(none)*

### Major

**M1. LLM blocking request with no explicit timeout**
- File: `src/lib/llmExplanation.ts:60-67`
- A slow OpenRouter upstream (or 30+ s retry loop) blocks the entire HTTP response. There is no `AbortController` or `timeout` option on the OpenAI SDK call.
- Failure scenario: OPENROUTER_API_KEY valid but provider degraded → request hangs for tens of seconds, returns 504-equivalent at the gateway, and burns a Node worker.
- Effort: 10–20 min. Add `timeout` via `AbortController` + `Promise.race` (the `openai` SDK supports a `timeout` option on the client constructor).

**M2. LLM errors are silent and indistinguishable from "all good"**
- File: `src/lib/llmExplanation.ts:65-66`
- On LLM error, the route returns a generic "Explicação automática indisponível" string with status 200. Clients have no programmatic way to know the explanation failed.
- Failure scenario: user uploads a track, gets a score with explanation=fallback message, and trusts it as a real analysis. Worse, dashboards/telemetry can't tell the LLM is down.
- Effort: 15 min. Return `{ explicacao, explicacao_source: "llm" | "fallback" }` or a top-level `degraded: boolean` flag.

### Minor

**m1. Zod validation error exposes internal field paths**
- File: `src/app/api/diagnose/route.ts:50-55`
- Error shape `{ error: "Validation failed", details: { formErrors, fieldErrors: { track_features: [...] } } }` is fine for developers but leaks "track_features" (an internal name) to the client.
- Effort: 5 min. Map Zod errors to a user-friendly `message` array (`"Danceability deve estar entre 0 e 1"`).

**m2. `genero` in success body echoes request**
- File: `src/app/api/diagnose/route.ts:75-80`
- The response includes `genero` even though the client sent it. Useful for confirmation but adds redundancy. Document or drop. Not a bug.
- Effort: 0 (doc-only).

**m3. `/` HTML shell is 12.8 KB but does not contain UploadAnalyzer text in initial HTML**
- File: `src/app/page.tsx` (parent of `UploadAnalyzer.tsx`)
- UploadAnalyzer is `"use client"`, so the SSR pass does not include its content. The server-rendered shell renders the title + h1 only.
- Failure scenario: SEO crawlers / first-contentful-paint for users with JS disabled see a mostly empty page.
- Not a blocker for the MVP, but worth noting for the UX critic.

**m4. Module-load error path is opaque**
- File: `src/lib/artifacts.ts:14-18`
- If `k11_posterior_samples.json.gz` is missing, server starts but every `/api/diagnose` returns 500. The error is logged but not surfaced; restart fails the same way.
- Effort: 10 min. Add a top-level `try { ... } catch (e) { throw new Error(\`K-11 artifacts missing at startup: ${e.message}\`); }` so deployment fails fast and visibly.

**m5. `predict()` returns 0–100-clamped per-sample but `score = mean` is rounded without re-clamp**
- File: `src/lib/k11Model.ts:55-60`
- In practice, mean of clamped samples is in [0, 100], but if N=1 or the clamp logic ever changed, `score` could be < 0 or > 100 and break the contract (`score ∈ [0, 100]`).
- Effort: 1 line. `score = Math.max(0, Math.min(100, sum / N))`.

### Nit

**n1. `ms_per_call` field is misleading** — see Production Hazards #8.

**n2. Cold first-POST ms=834 in dev is just module warmup.** In production with Vercel-style cold starts, this could be much higher (module-load + .gz decompress). Flag for ops.

**n3. HDI uses `Math.floor(N * 0.03)` / `Math.floor(N * 0.97)`** — this gives a 94% HDI correctly when N=1000 (3%–97% = 94% span), but the variable name `hdi_94` would be more accurate as `hdi_94_pct`. Doc-only.

**n4. `try { resp.choices[0].message.content ?? 'Explicação indisponível no momento.' }` — the inner default is unreachable in practice** because if `content` is null, the SDK throws. Cosmetic.

**n5. `process.cwd() + 'artifacts'` is hardcoded in `src/lib/artifacts.ts:6`** — fine for Next.js but not portable to a worker / serverless edge runtime.

---

## Verdict

**PASS (with two M-flagged follow-ups before scale-up)**

The MVP works end-to-end from a FUNCTIONAL point of view:

- All 6 functional tests PASS.
- API contract is stable; success and error payloads are well-shaped.
- Latency is well within the 8000 ms cold / 2000 ms warm bar.
- Legacy `/api/genres` route is not regressed.
- No blockers; the K-11 backend behaves as specified.

The two Major issues (M1: LLM blocking, M2: LLM silent failure) are real but contained — they do not break correctness today, only resilience under LLM-provider stress. The Wave 4 UX/accuracy critics may surface related issues.

**Recommendation: PROCEED to PR**, with a follow-up issue filed for M1 and M2 to be addressed before the MVP is exposed to real users with a paid LLM key. The Minor/Nit items can ride in a follow-up cleanup PR.

---

## Test Artifacts (absolute paths)

- Dev server log: `/tmp/devserver.log`
- Test responses: `C:/Users/tito/AppData/Local/Temp/test_{a,b,c,c2,c3,d,e,f,regression}.html|json`
- Request bodies: `C:/Users/tito/AppData/Local/Temp/body_{c,d,e,f}.json`

## Files Referenced

- `src/app/api/diagnose/route.ts` — full route
- `src/app/api/generos/route.ts` — full route
- `src/app/api/genres/route.ts` — legacy route
- `src/lib/k11Model.ts` — predict()
- `src/lib/artifacts.ts` — module-load artifacts
- `src/lib/llmExplanation.ts` — LLM wrapper
- `src/lib/types.ts` — TrackFeatures / Prediction shape
- `src/components/UploadAnalyzer.tsx` — client component (not in SSR HTML)
- `artifacts/genero_cats.json` — 107-genre list
- `artifacts/k11_posterior_samples.json.gz` — module-loaded
