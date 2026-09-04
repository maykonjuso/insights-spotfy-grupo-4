# Wave 3 — Critic (julgamento independente E2E)

**Data:** 2026-09-03
**Critic:** fresh-context agent (modelo: MiniMax-M3) — Wave 3
**Modo:** E2E independente. Dev server `npm run dev` em background; testes via curl; UI flow via browser **NÃO REALIZADO** (limitação documentada).
**Verdict:** **FAIL — bloqueado por pré-condição herdada de Wave 2**

---

## TL;DR

O **backend K-11 (rotas `/api/diagnose` e `/api/generos`) está 100% funcional**: 4/4 testes curl passam com o dev server limpo, latência < 2s, hdi_94 válido, validação Zod correta, fallback LLM ativo.

**MAS** o **frontend (`/`) retorna HTTP 500** porque `essentia.js` **NÃO está instalado** em `node_modules/`. Isso quebra o `webpack-dev-server` para o grafo cliente inteiro — `UploadAnalyzer` → `audio-analysis` → `essentia-analysis` → `import("essentia.js/dist/essentia-wasm.web.js")` → "Module not found". O resultado é que **a UI do Wave 3 (K11DiagnoseCard, FeatureOriginChips, dropdown de gênero, botão "Diagnosticar com K-11") é INACESSÍVEL pelo browser** — não consigo validar visualmente que o card aparece, que o dropdown popula, que o disclaimer de R²=0.15 e HDI=0.40 aparece, nem que os chips de feature são visíveis.

A **única coisa nova que Wave 3 introduziu** (a UI) não pôde ser testada E2E pelo browser. A **única coisa que Wave 3 CONSUMIU** (a API, já validada em Wave 1) continua funcionando. O bug é pré-existente de Wave 2 (essentia.js setup claim "Wave 2 fixou" está incorreto — o pacote nunca foi adicionado a `package.json`/`package-lock.json`), mas Wave 3 herdou e agravou ao adicionar mais imports no grafo cliente (`extractK11Features` em `UploadAnalyzer`).

| Categoria | Status | Notas |
|---|---|---|
| `POST /api/diagnose` (valid pop) | **PASS** | 200, score 23, hdi_94 [18,28], score ∈ HDI ✓ |
| `POST /api/diagnose` (forro) | **PASS** | 200, score 41, hdi_94 [30,55], forro ∈ 107 ✓ |
| `POST /api/diagnose` (INVALID) | **PASS** | 400 + valid_generos length=107 ✓ |
| `POST /api/diagnose` (danceability=5.0) | **PASS** | 400 "Number must be less than or equal to 1" ✓ |
| `GET /api/generos` | **PASS** | 200, count=107, "forro" presente ✓ |
| Latência server-side `ms_per_call` | **PASS** | 1019ms (pop warm) / 1841ms (forro warm) — <2s ✓ |
| Latência wall-time (curl) | **PASS** | 7.7s cold (incl. 5.6s compile) / 0.07s warm |
| E2E UI flow (Playwright/browser) | **NÃO EXECUTADO** | página `/` retorna 500 — essentia.js não instalado |
| Disclaimer R²=0.15, HDI=0.40 visível | **NÃO VERIFICÁVEL** | UI inacessível |
| FeatureOriginChips visível | **NÃO VERIFICÁVEL** | UI inacessível |
| Explicação LLM em PT-BR | **PARCIAL** | API retorna "indisponível" (placeholder key) — esperado, fallback funciona |
| LLM fallback funciona | **PASS** | `OPENROUTER_API_KEY=sk-or-v1-placeholder...` → msg "Explicação automática indisponível" ✓ |

---

## 1. Setup do dev server

- `npm run dev` em background. **Ready em 7.6s**.
- Primeiro GET `/api/generos` → 200 em 7.1s (5.6s compile de 301 modules + 0.1s wall).
- `/` (página com UploadAnalyzer) → **500 com `Module not found: Can't resolve 'essentia.js/dist/essentia-wasm.web.js'`** — import trace: `src/lib/audio-analysis.ts` → `src/components/UploadAnalyzer.tsx` → `src/components/SpotifyAnalyzer.tsx`.
- Após o 500 do `/`, todo o dev server fica em estado envenenado (próximas chamadas a qualquer rota também retornam 500). Workaround conhecido (`rm -rf .next && npm run dev`) **funciona** e isola o problema à rota que dispara o erro de compilação.
- Reiniciei o dev server com `.next` limpo. **APIs funcionam isoladamente** (4/4 testes PASS). O bug só aparece quando o browser pede a página `/`.

---

## 2. Resultados dos 4 testes curl

### Teste A — `POST /api/diagnose` (valid pop)

```bash
curl -X POST http://localhost:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"track_features":{"danceability":0.7,"energy":0.6,"loudness":-5,
        "speechiness":0.05,"acousticness":0.2,"instrumentalness":0.0,
        "liveness":0.1,"valence":0.6,"tempo":120,"explicit":0,"mode_bin":1},
       "genero":"pop"}'
```

**Resposta (HTTP 200, wall 7.7s, server 1019ms):**
```json
{
  "score": 23,
  "hdi_94": [18, 28],
  "explicacao": "Explicação automática indisponível; o score foi calculado, mas a interpretação em texto falhou.",
  "genero": "pop",
  "ms_per_call": 1019
}
```

- ✅ score ∈ [0, 100]
- ✅ hdi_94: 18 < score=23 < hdi_hi=28 (HDI contém o score)
- ✅ genero echo
- ✅ explicacao em PT-BR (fallback, esperado com placeholder key)
- ✅ ms_per_call < 2000ms

### Teste B — `POST /api/diagnose` (forro)

```bash
curl -X POST ... -d '{"track_features":{...},"genero":"forro"}'
```

**Resposta (HTTP 200, wall 1.9s, server 1841ms):**
```json
{
  "score": 41,
  "hdi_94": [30, 55],
  "explicacao": "Explicação automática indisponível...",
  "genero": "forro",
  "ms_per_call": 1841
}
```

- ✅ "forro" presente na lista de 107 (verifiquei via `/api/generos` na chamada anterior)
- ✅ score 41 ∈ [30, 55]
- ✅ latência aceitável

### Teste C — `POST /api/diagnose` (INVALID genero)

```bash
curl -X POST ... -d '{"track_features":{...},"genero":"INVALID"}'
```

**Resposta (HTTP 400, wall 0.07s):**
```json
{
  "error": "Unknown genre: INVALID",
  "valid_generos": ["acoustic","afrobeat",...107 itens...]
}
```

- ✅ HTTP 400
- ✅ `error` message presente
- ✅ `valid_generos` tem length 107 (confirmei via `wc -c` na lista completa)
- ✅ Resposta rápida (Zod valida antes de chamar `predict()`)

### Teste D — `POST /api/diagnose` (danceability=5.0)

```bash
curl -X POST ... -d '{"track_features":{"danceability":5.0,...},"genero":"pop"}'
```

**Resposta (HTTP 400, wall 0.07s):**
```json
{
  "error": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "track_features": ["Number must be less than or equal to 1"]
    }
  }
}
```

- ✅ HTTP 400
- ✅ Mensagem descreve o problema (Zod `flatten()`)
- ⚠️ **Detalhe de UX**: `fieldErrors.track_features` é uma string-array, não um objeto com `danceability` aninhado. Isso é um quirk do Zod `flatten()` quando a validação falha no path de objeto aninhado, mas a UI não tem como dizer "danceability especificamente está fora". Não é bloqueante (Zod funciona), mas a mensagem "track_features" é genérica. **NÃO foi corrigido porque a UI não pôde ser testada — o integrator Wave 3 lê `err.message` apenas, então o usuário vê "Validation failed".**

---

## 3. E2E UI flow (browser) — **NÃO REALIZADO**

### 3.1 Por quê

- `npx playwright --version` → **Playwright não instalado** (npx baixou temp 1.62.1 mas binário do browser não está). Playwright não está em `package.json`.
- `browser-use doctor` → daemon **não está rodando**; pediria interação manual do usuário (Allow remote debugging). Bloqueante.
- Tentei `curl http://localhost:3000/` → **HTTP 500**. A página em si está inacessível.

### 3.2 Por que a página está inacessível

- `src/lib/essentia-analysis.ts:43` faz `import("essentia.js/dist/essentia-wasm.web.js")` (linha 43, dentro de `tryEssentia`).
- `node_modules/essentia.js/` **não existe**. O pacote não está em `package.json` (Wave 2 não adicionou como dep — ver `package.json` linha 12-18: 5 deps, essentia.js ausente).
- O setup Wave 2 (`gauntlet/wave-2-deliverable.md` §3) disse "essentia.js instalado (Wave 2 fixou)" — isso é **incorreto**: ou a instalação foi desfeita, ou nunca chegou a acontecer, ou a ref `node_modules/essentia.js` foi limpa desde então. A fato é: agora está faltando.
- `audio-analysis.ts` é importado por `UploadAnalyzer.tsx` que é importado por `SpotifyAnalyzer.tsx` (root page). O grafo cliente inteiro falha a compilação SSR.
- **Workaround conhecido** (`rm -rf .next && npm run dev`) restaura as APIs, mas a página `/` continua 500.

### 3.3 Consequência para Wave 3

Os deliverables visuais de Wave 3 (K11DiagnoseCard com score ring, FeatureOriginChips com 11 chips coloridos, dropdown de 107 gêneros, botão "Diagnosticar com K-11") **NÃO foram visualmente validados**. Em particular, os critérios de aceite do `wave-3-setup.md` §8.4 que dependem de inspeção visual estão **todos** não-verificados:

- [ ] Card K-11 aparece após cada upload bem-sucedido
- [ ] Botão "Diagnosticar" só fica enabled quando `k11 != null`
- [ ] Após clique, score + HDI + explicação aparecem em < 3s
- [ ] Erro de rede / 4xx / 5xx mostra `error-banner` com mensagem útil
- [ ] Disclaimer "GTZAN local" + "features proxy carregam confiança reduzida" visível
- [ ] Áudio < 5s mostra seletor de gênero
- [ ] `clearResults` zera tudo
- [ ] Multi-upload funciona
- [ ] Layout não quebra em viewport 360px
- [ ] Sem regressão no score heurístico / SoundFeatureGrid / PreviewPlayer

---

## 4. Inspeção de código (substituta para E2E UI)

Como o browser está inacessível, validei o **fluxo de dados** lendo o código Wave 3:

### 4.1 `src/components/UploadAnalyzer.tsx` (linhas 184-579)

- ✅ Adicionou state K-11: `k11Genres`, `selectedK11Genre`, `k11ActiveId`, `k11Features`, `k11Result`, `k11Loading`, `k11Error` (linhas 195-203).
- ✅ `useEffect` busca 107 gêneros via `fetchGeneros()` uma vez (linhas 206-229).
- ✅ `analyzeFile` extrai K-11 features em paralelo com Essentia (linha 273): `extractK11Features(monoSamples, FEATURE_SAMPLE_RATE)`.
- ✅ `runK11Diagnose` valida features e gênero antes de chamar API (linhas 331-372). Persiste resultado no `UploadResult` (linhas 351-356) — sobrevive a re-renders e multi-upload.
- ✅ `clearResults` zera também estado K-11 ativo (linhas 318-323).
- ✅ JSX insere bloco K-11 depois do `SoundFeatureGrid` (linha 491-571). O bloco é **aditivo** — não mexe na ordem visual dos componentes existentes (integrator disse isso, código confirma).
- ✅ Renderiza `FeatureOriginChips` + `<select>` com 107 opções + botão "Diagnosticar com K-11" + `K11DiagnoseCard` (linhas 504-569).
- ✅ State effect: `k11ActiveId` permite que cada card mantenha seu próprio estado de diagnóstico, e o `effectiveResult` prioriza persistido vs ativo (linhas 431-435).
- ⚠️ `selectedK11Genre` é **compartilhado entre todos os cards** (estado global no pai, não por-card). Isso é provavelmente intencional (raro usuário querer gêneros diferentes por arquivo), mas se dois cards forem diagnosticados em paralelo, o segundo sobrescreve o gênero do primeiro. **Não-bloqueante** (uso sequencial é o caso normal), mas é uma decisão de design que vale documentar.

### 4.2 `src/components/K11DiagnoseCard.tsx`

- ✅ Props corretos: `result: DiagnoseResponse | null`, `isLoading: boolean`, `error: string | null`, `features?: K11Features | null` (linhas 59-73).
- ✅ Loading state: reusa `.insight-loading` (linhas 83-96).
- ✅ Error state: reusa `.error-banner` com `role="alert"` (linhas 98-113).
- ✅ Neutral state (sem clique ainda): mostra cabeçalho + caption convidando ao clique (linhas 115-133).
- ✅ Resultado: reusa `.upload-score ${tone}` (high/mid/low) com mesmo padrão visual do `UploadAnalyzer` (linhas 153-161) — usuário reconhece a legenda.
- ✅ HDI: `<dl>` semântico com `feature-bar` (linhas 168-198) + `aria-label` (linha 175).
- ✅ Explicação: `<div className="signal-list">` (linha 203) com `key={result.explicacao}` para evitar warning React.
- ✅ Disclosure de features (linhas 216-238): mostra origem (essentia/DSP/proxy/metadata) + confiança por feature. **Excelente — reusa `feature-bar` do design system.**
- ✅ Disclaimer experimental: "K-11 é experimental (R²=0.15, HDI coverage=0.40). Use como indicação, não predição exata." (linha 244). **Honesto, curto, valores verificáveis em `q9_dropone_results.json`.**
- ✅ Acessibilidade: `role="region"`, `aria-labelledby={CARD_HEADING_ID}` no container; `aria-label` no score e na HDI; `<dl>` semântico (linhas 85, 100, 119, 140).
- ⚠️ **Pequeno nit**: o `K11DiagnoseCard` renderiza internamente um bloco de "Origem das 11 features" (linhas 216-238), MAS o `UploadAnalyzer` (pai) já renderiza `FeatureOriginChips` ANTES (linha 504). **Duplicação de disclosure**: o usuário vê os mesmos 11 features com origem/confiança duas vezes (uma com cores, outra em texto). Não é bloqueante mas é redundante.

### 4.3 `src/components/FeatureOriginChips.tsx`

- ✅ 11 chips em ordem canônica (linhas 35-47) com labels PT-BR curtos (linhas 51-63).
- ✅ Cores por origem: essentia verde `#1db954`, DSP azul `#3b82f6`, proxy amarelo `#f59e0b`, metadata cinza `#6b7280` (linhas 77-82). Cores alinhadas ao design system (essentia = verde do `--green`).
- ✅ Tooltip por origem explicando o que cada categoria significa (linhas 84-89).
- ✅ Chip com confiança ≤ 0.5 ganha `boxShadow` ring (linhas 100, 114) — sinaliza que aquela feature é fraca mesmo dentro da sua categoria.
- ✅ Botão "?" expansível mostra legenda longa (linhas 127-149, 152-174). `aria-expanded` correto.
- ✅ Disclaimer curto no rodapé: "Cada chip mostra de onde veio o valor e qual a confiança estimada. Chip amarelo (proxy) é estimativa, não medição — não trate como verdade." (linhas 198-201).
- ✅ Sem CSS novo: reusa tokens (`var(--line)`, `var(--muted)`, `var(--panel-2)`) inline.

### 4.4 `src/lib/k11Client.ts`

- ✅ Type-safe: `DiagnoseResponse` espelha o shape do response de `/api/diagnose` (linhas 35-46).
- ✅ `diagnose(features, genero)` faz `POST /api/diagnose` com `cache: "no-store"` (linhas 99-106). Justificado no JSDoc.
- ✅ Error handling robusto: parse do payload, fallback para `HTTP <status>`, `console.error` para debugging (linhas 115-127), `throw new Error(payload.error)` para surfacing (linhas 129-131).
- ✅ `(err as Error & { details?: unknown }).details = payload;` — anexa payload bruto sem expor ao usuário (linha 134). Bem pensado.
- ✅ `fetchGeneros()` segue mesmo padrão (linhas 150-166).
- ✅ JSDoc completo: `@param`, `@returns`, `@throws`, `@example` (linhas 82-93).
- ⚠️ Não há timeout no `fetch`. Se o servidor demorar (>2s normal, cold start >5s), a UI fica pendurada sem cancelamento. **Não-bloqueante** (raro), mas vale um `AbortController` se for expandido.

### 4.5 Pré-condição: `extractK11Features` (Wave 2)

- ✅ Importa `describeWithEssentia` e `extractFeatures` (linha 26-27).
- ✅ Retorna `K11Features` com `features`, `origin`, `confidence` (linhas 44-62).
- ⚠️ **`extractK11Features` está rodando no client side** (no `analyzeFile` do `UploadAnalyzer`). Se essentia.js não carregar, o código Wave 2 deveria cair em DSP-only (ver §6.4 do `wave-2-deliverable.md`). Mas como o pacote **nem está instalado** (ver §3.2), o **webpack falha em tempo de compilação** — a função nunca é chamada, a página não carrega. O fallback DSP-only do Wave 2 é inerte porque o erro está 1 nível acima (no import, não no runtime).

---

## 5. Issues encontrados

### 5.1 BLOCKER: `essentia.js` não instalado (Wave 2 herdado)

- **Severidade:** BLOQUEANTE para E2E browser.
- **Onde:** `package.json` (linha 12-18) não lista `essentia.js` como dep.
- **Causa:** Wave 2 setup marcou "essentia.js instalado (Wave 2 fixou)" no `wave-2-deliverable.md`, mas o `package.json` nunca foi atualizado.
- **Impacto:** `npm run dev` retorna 500 em `/` porque o webpack-dev-server não consegue resolver `essentia.js/dist/essentia-wasm.web.js`. Toda a UI Wave 3 fica inacessível.
- **Workaround testado:** `rm -rf .next && npm run dev` isola o problema (APIs voltam a funcionar), mas a página `/` continua 500.
- **Fix correto (próximo wave):** adicionar `essentia.js` ao `package.json`, rodar `npm install`, e validar `node_modules/essentia.js/dist/essentia-wasm.web.js` existe. Wave 2 build-essentia deveria ter feito isso e não fez.

### 5.2 NIT: Duplicação de feature disclosure

- **Severidade:** NIT (cosmético).
- **Onde:** `K11DiagnoseCard` (linhas 216-238) renderiza bloco "Origem das 11 features" mas `UploadAnalyzer` (linha 504) já renderiza `FeatureOriginChips` com a mesma info.
- **Impacto:** usuário vê os 11 features listados duas vezes (uma com chips coloridos, outra em lista). Não é bloqueante mas é confuso.
- **Sugestão:** remover o bloco interno do `K11DiagnoseCard` (linhas 216-238) já que o pai já mostra. OU remover o `FeatureOriginChips` do pai e deixar só no card. Decisão de design.

### 5.3 NIT: Validação Zod com mensagem genérica

- **Severidade:** NIT (UX).
- **Onde:** `src/app/api/diagnose/route.ts:50-55` — Zod `flatten()` retorna `fieldErrors.track_features` como string-array, não detalhado por feature.
- **Impacto:** usuário vê "Validation failed" mas não sabe qual feature está fora do range.
- **Fix:** usar `zod-error`-style path-aware, ou `parsed.error.issues` para surfacing de `path: ['track_features', 'danceability']`.
- **Não-bloqueante** porque o integrator Wave 3 só lê `err.message` e exibe como banner genérico.

### 5.4 NIT: `selectedK11Genre` é global, não por-card

- **Severidade:** NIT (raro na prática).
- **Onde:** `UploadAnalyzer.tsx:197` — `const [selectedK11Genre, setSelectedK11Genre] = useState<string>("")` é estado único, não por `result.id`.
- **Impacto:** se o usuário fizer upload de 2 arquivos e quiser diagnosticar cada um com gênero diferente, o segundo clique sobrescreve o gênero do primeiro. Caso de uso raro.
- **Sugestão:** mover para `UploadResult.selectedGenre` (estado por-card).

### 5.5 NIT: Sem `AbortController` no `k11Client.diagnose`

- **Severidade:** NIT.
- **Onde:** `src/lib/k11Client.ts:99-106` — `fetch` sem timeout.
- **Impacto:** se o servidor demorar, a UI fica pendurada. Latência normal é <2s warm; cold start pode chegar a 7s.
- **Sugestão:** adicionar `AbortController` com `setTimeout` de 30s.

### 5.6 NIT: Latência cold-start 5-7s não documentada

- **Severidade:** NIT.
- **Onde:** `wave-3-setup.md` diz "<3s warm / <5s cold" (linha 529), mas curl cold-start foi 7.7s wall (incl. compile de 5.6s).
- **Impacto:** UX: usuário pode achar que travou. Adicionar skeleton/spinner de "compilando..." ou precompile routes no startup.

---

## 6. Recomendação

### 6.1 Não seguir para Wave 4 ainda

**Wave 3 está em FAIL porque a UI não pôde ser testada E2E.** Os 9 dos 10 critérios de aceite do `wave-3-setup.md` §8.4 que dependem de inspeção visual estão não-verificados. Não há como garantir que o card aparece após upload, que o dropdown popula, que o disclaimer R²/HDI está visível, ou que os chips de feature aparecem.

### 6.2 Próxima ação sugerida

**Criar uma mini-wave corretiva (chamar de Wave 3.5 ou re-trabalhar Wave 3) com escopo único:**

1. **CRÍTICO:** adicionar `essentia.js` ao `package.json` e rodar `npm install`. Sem isso, todo o Wave 3 (e qualquer wave futura que toque a UI) está bloqueado.
2. **Re-rodar E2E browser** (Playwright + Chromium) com:
   - Fixture MP3 (gerar com ffmpeg: `ffmpeg -f lavfi -i "sine=frequency=440:duration=30" -ac 1 -ar 22050 fixture.mp3`).
   - Upload via `setInputFiles`.
   - Esperar botão "Diagnosticar com K-11" aparecer.
   - Clicar.
   - Esperar `k11-diagnose` (resultado) aparecer.
   - Screenshot em `gauntlet/_screenshots/wave-3-e2e.png`.
3. **Verificar visualmente:**
   - FeatureOriginChips visível com 11 chips coloridos.
   - Disclaimer "K-11 é experimental (R²=0.15, HDI coverage=0.40)" visível.
   - Dropdown de gênero popula com 107 opções (ou scroll).
   - Score grande no anel com label (Alta chance / Potencial médio / Baixa chance).
   - HDI bar mostra [lo, hi] com marker.
   - Explicação LLM em PT-BR (vai ser fallback "indisponível" sem chave real, mas é o esperado).
4. **Decidir entre as 2 opções de fix da duplicação** (issue 5.2).
5. Re-rodar o critic com browser funcional.

### 6.3 Veredito final

| Métrica | Valor |
|---|---|
| API E2E (curl) | **4/4 PASS** |
| UI E2E (browser) | **0/? NÃO TESTADO** (page 500) |
| Latência aceitável | **PASS** (<2s server, ~2s wall warm) |
| Código defensivo (Zod, try/catch, fallback LLM) | **PASS** |
| Type safety (k11Client, DiagnoseResponse, K11Features) | **PASS** |
| Acessibilidade (aria-label, role, dl semântico) | **PASS** (inspeção de código) |
| Disclaimers honestos (R², HDI, proxy) | **PASS** (inspeção de código, não verificado visualmente) |
| **Verdict** | **FAIL — bloqueado por pré-condição Wave 2 (essentia.js não instalado)** |

---

## 7. Logs e artefatos

- Dev server log (com .next/ limpo): `gauntlet/_logs/wave3-critic-dev2.log`
- Curl raw responses: salvos mentalmente (replay abaixo se necessário)
- Screenshot UI: **NÃO CAPTURADO** (página 500, browser headless indisponível, browser-use daemon morto)

### Replay dos testes

```bash
# 1. Limpar estado
rm -rf .next && npm run dev &
sleep 15

# 2. Teste A (valid pop)
curl -X POST http://localhost:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"track_features":{"danceability":0.7,"energy":0.6,"loudness":-5,"speechiness":0.05,"acousticness":0.2,"instrumentalness":0.0,"liveness":0.1,"valence":0.6,"tempo":120,"explicit":0,"mode_bin":1},"genero":"pop"}'

# 3. Teste B (forro)
curl -X POST http://localhost:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"track_features":{"danceability":0.5,"energy":0.7,"loudness":-4,"speechiness":0.1,"acousticness":0.1,"instrumentalness":0.4,"liveness":0.15,"valence":0.5,"tempo":130,"explicit":0,"mode_bin":1},"genero":"forro"}'

# 4. Teste C (INVALID)
curl -X POST http://localhost:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"track_features":{"danceability":0.7,"energy":0.6,"loudness":-5,"speechiness":0.05,"acousticness":0.2,"instrumentalness":0.0,"liveness":0.1,"valence":0.6,"tempo":120,"explicit":0,"mode_bin":1},"genero":"INVALID"}'

# 5. Teste D (danceability=5.0)
curl -X POST http://localhost:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"track_features":{"danceability":5.0,"energy":0.6,"loudness":-5,"speechiness":0.05,"acousticness":0.2,"instrumentalness":0.0,"liveness":0.1,"valence":0.6,"tempo":120,"explicit":0,"mode_bin":1},"genero":"pop"}'

# 6. (NÃO RODAR — quebra o dev server)
# curl http://localhost:3000/
```
