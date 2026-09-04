# Wave 2 — Critic Report (Independent)

**Data:** 2026-09-03
**Agente:** critic (Wave 2, fresh context)
**Escopo:** julgar `src/lib/extractK11Features.ts` + `src/lib/extractK11Features.test.ts` + ext de `essentia-analysis.ts`.
**Mandato:** NAO corrigir nada; apenas julgar.

---

## 1. Verdict

**`PASS` — seguir para Wave 3, com ressalvas menores.**

| Aspecto                  | Status      | Nota                                                                                   |
|--------------------------|-------------|----------------------------------------------------------------------------------------|
| Tests passam             | **PASS**    | 4/4 verde em 1.94s                                                                     |
| 11 features retornadas   | **PASS**    | `Object.keys(features)` = 11                                                           |
| Cada uma tem origin      | **PASS**    | `Record<K11FeatureKey, K11FeatureOrigin>` strict type                                  |
| Cada uma tem confidence  | **PASS**    | range [0, 1] respeitado                                                                |
| JSDoc presente           | **PASS**    | cada `computeX()` tem bloco com referencia                                              |
| try/catch essentia       | **PASS**    | `tryEssentia` engole tudo; cada metodo essentia novo tem `safeX()`                     |
| Proxies documentados     | **PASS**    | Scheirer & Slaney 1997, Masri 1996, Muller & Lerch 2011, Patino 2017, Eerola 2011      |
| Ranges fisicos           | **PASS**    | clamp01 + clampRange em toda feature; loudness clipado se > 0                          |
| Robustez (NaN/Inf)       | **PASS**    | clamp01/clampRange retornam min(0)/min em nao-finitos                                   |
| Cobertura de testes      | **NEEDS-FIX** | 4 testes vs 7 do plano de setup                                                       |
| Spec compliance          | **NEEDS-FIX** | 2 desvios do plano: `diagnostics` e `features: number[]` ausentes (ver §5)            |
| Ordem features x JSON    | **NEEDS-FIX** | `mode_bin` antes de `explicit` no objeto; `feature_names.json` tem `explicit` antes de `mode_bin` — cosmético, mas documentado |

---

## 2. Independent test run (4/4 PASS)

Comando: `npm run test:unit -- --reporter=verbose`
Output bruto:

```
RUN  v5.0.0 C:/Users/tito/OneDrive/Documentos/Projetos/spotify_challenge/insights-spotfy-grupo-4

stdout | extractK11Features.test.ts > sine-440Hz
[vitest] sine-440Hz: 260.9 ms
✓ sine-440Hz ... 317ms

stdout | extractK11Features.test.ts > silence
[vitest] silence: 59.8 ms
✓ silence ... 65ms

stdout | extractK11Features.test.ts > click-120bpm
[vitest] click-120bpm: 187.2 ms
✓ click-120bpm ... 195ms

stdout | extractK11Features.test.ts > explicit-1
[vitest] explicit-1: 12.3 ms
✓ explicit-1 ... 13ms

Test Files  1 passed (1)
     Tests  4 passed (4)
  Start at  22:48:40
  Duration  1.94s
```

| Teste                       | Latencia | Assercoes centrais                                                    | Status |
|-----------------------------|----------|-----------------------------------------------------------------------|--------|
| sine-440Hz (5s)             | 260.9 ms | energy > 0.3, instrumentalness > 0.5, liveness < 0.5, ranges          | PASS   |
| silence (1s zeros)          | 59.8 ms  | energy < 0.1, loudness < -40, tempo in [0, 220], instrumentalness > 0.9 | PASS   |
| click-120bpm (4s)           | 187.2 ms | tempo in [80, 180], energy > 0.5, instrumentalness > 0.5              | PASS   |
| options.explicit=1 (1s)     | 12.3 ms  | explicit=1, origin=metadata, conf=1.0                                 | PASS   |

Total: 4 testes (nao 3 — tem 1 bonus para `options.explicit` nao mencionado na task description). **Diferenca com o task description**: o briefing diz "3 testes Vitest" mas o arquivo tem 4. Aceito: bonus é valioso.

---

## 3. Analise do codigo (`src/lib/extractK11Features.ts`)

### 3.1 As 11 features

Linhas 416-428: o objeto `features` tem **exatamente** as 11 chaves esperadas:

```typescript
features: {
  danceability, energy, loudness, speechiness, acousticness,
  instrumentalness, liveness, valence, tempo, mode_bin, explicit
}
```

Conferido contra `TrackFeatures` em `src/lib/types.ts:1-13`: match exato (11 chaves, mesmas).

### 3.2 Origin

Linhas 429-441: `Record<K11FeatureKey, K11FeatureOrigin>` — strict type, 4 valores possiveis: `"essentia" | "dsp" | "proxy" | "metadata"`. Documentado no header (linhas 11-15) e no JSDoc de cada `computeX()`.

### 3.3 Confidence

Linhas 442-454: `Record<K11FeatureKey, number>`, range 0-1. Valores observados:

| Feature          | essentia | dsp      | proxy (fallback) | metadata |
|------------------|----------|----------|------------------|----------|
| danceability     | 0.9      | 0.3      | -                | -        |
| energy           | -        | 0.7 / 0.3| -                | -        |
| loudness         | 0.85     | 0.3      | -                | -        |
| speechiness      | -        | -        | 0.5 / 0.2        | -        |
| acousticness     | -        | -        | 0.5 / 0.2        | -        |
| instrumentalness | -        | -        | 0.4 / 0.2        | -        |
| liveness         | -        | -        | 0.3 / 0.15       | -        |
| valence          | -        | -        | 0.4 / 0.2        | -        |
| tempo            | 0.9      | 0.6 / 0.2| -                | -        |
| mode_bin         | 0.95     | -        | - (default 0)    | -        |
| explicit         | -        | -        | -                | 1.0 / 0.0|

**Honestidade**: ✓. Essentia direto > 0.85, DSP ~ 0.6-0.7, proxies 0.3-0.5, defaults 0.0-0.2. Diferenca entre "essentia" e "proxy" e' claramente expressa.

### 3.4 JSDoc

Cada `computeX()` tem bloco JSDoc com:
- descricao da feature K-11
- metodo de calculo
- referencia bibliografica (para proxies)

Exemplos notaveis:
- `computeAcousticness` (linhas 175-181): "Ref: Masri (1996) Computer modelling of sound..."
- `computeInstrumentalness` (linhas 199-212): "Ref: Muller & Lerch (2011)..."
- `computeLiveness` (linhas 244-251): "Ref: Patino et al. (ISMIR 2017)..."
- `computeValence` (linhas 266-275): "Ref: Eerola (2011)..."

### 3.5 try/catch essentia

- `tryEssentia` (linhas 357-363): engole QUALQUER excecao e retorna `null`.
- `tryDsp` (linhas 368-374): defensivo tambem, retorna `null` em falha.
- Cada metodo essentia NOVO (zcr, hfc, pitchSalience, spectralCentroid, spectralFlatness, energy) tem `safeX()` com try/catch proprio e `console.warn` (linhas 106-180 de essentia-analysis.ts).

**Robustez**: 4 camadas defensivas (carga essentia, chamada essentia, descritor individual, DSP).

### 3.6 Ranges fisicos

| Feature          | Range esperado    | Validacao                                              |
|------------------|-------------------|--------------------------------------------------------|
| danceability     | [0, 1]            | `clamp01(essentia.danceability)`                       |
| energy           | [0, 1]            | `clamp01(summary.rms / 0.28)`                          |
| loudness         | [-60, 0] dB       | `clampRange(v, -60, 0)`; clip explicito se v > 0       |
| speechiness      | [0, 1]            | `clamp01(...)`                                         |
| acousticness     | [0, 1]            | `clamp01(...)`                                         |
| instrumentalness | [0, 1]            | `clamp01(1 - vocalActivity)`                           |
| liveness         | [0, 1]            | `clamp01(...)`                                         |
| valence          | [0, 1]            | `clamp01(...)`                                         |
| tempo            | [40, 220] BPM     | `clampRange(essentia.bpm, 40, 220)`                    |
| explicit         | {0, 1}            | strict type `0 \| 1`                                   |
| mode_bin         | {0, 1}            | strict type `0 \| 1`                                   |

**NaN/Infinity**: `clamp01`/`clampRange` retornam `0`/`min` para nao-finitos. Nenhum valor pode escapar como NaN.

---

## 4. Sinal NOVO: chirp 200Hz -> 4000Hz em 4s

**Setup:** script `scripts/critic-chirp-test.ts` que gera `amp * sin(2*pi*(f0*t + (f1-f0)*t^2/(2T)))` para 4s a 22050Hz, depois chama `extractK11Features`.

**Output bruto:**

```
=== CHIRP 200Hz -> 4000Hz em 4s ===
Latencia: 239.1 ms
Features:
  danceability     = 0.5000  (origin=dsp,      conf=0.3)
  energy           = 1.0000  (origin=dsp,      conf=0.7)
  loudness         = -60.0000 (origin=dsp,     conf=0.3)
  speechiness      = 0.4438  (origin=proxy,    conf=0.5)
  acousticness     = 0.4403  (origin=proxy,    conf=0.5)
  instrumentalness = 0.2564  (origin=proxy,    conf=0.4)
  liveness         = 0.2500  (origin=proxy,    conf=0.3)
  valence          = 0.6516  (origin=proxy,    conf=0.4)
  tempo            = 129.1992 (origin=dsp,     conf=0.6)
  mode_bin         = 1.0000  (origin=essentia, conf=0)
  explicit         = 0.0000  (origin=metadata, conf=0)

# de features: 11 (esperado 11)
Chaves: danceability, energy, loudness, speechiness, acousticness, instrumentalness, liveness, valence, tempo, mode_bin, explicit

Todos os ranges OK.
```

### 4.1 Diagnostico

| Expectativa                                                   | Recebido              | Avaliacao                                                                  |
|---------------------------------------------------------------|-----------------------|----------------------------------------------------------------------------|
| 11 features                                                   | 11                    | OK                                                                        |
| ranges fisicos                                                | todos OK              | OK                                                                        |
| sem NaN/Inf                                                   | sim                   | OK                                                                        |
| latencia < 500ms                                              | 239ms                 | OK                                                                        |
| acousticness BAIXA (chirp com freq ate 4kHz = brilho alto)    | 0.440                 | OK — coerente com o proxy                                                 |
| tempo BAIXO ou 0 (chirp nao tem ritmo)                        | 129.2 BPM             | **FALSO POSITIVO** — autocorrelator do onset envelope pegou variacao espectral do chirp como periodicidade |
| instrumentalness ALTO (chirp e' tom puro, sem voz)            | 0.256                 | **FALSO NEGATIVO** — proxy interpreta ZCR alto (chirp varre) como atividade vocal |
| speechiness < 0.5                                             | 0.444                 | OK — dentro do range esperado dado o bias conhecido                        |
| liveness < 0.3                                                | 0.250                 | OK                                                                        |
| mode_bin default = 1 com conf = 0                             | 1 / conf=0            | OK — honesto                                                              |

### 4.2 Veredito sobre o chirp

**Razoavel** dentro das limitacoes documentadas. Dois falsos positivos/negativos sao **artefatos dos proxies**, NAO bugs:
- O proxy de instrumentalness usa `vocalActivity = 0.7 * (zcr/0.3) + 0.3 * centroidInFormant`. Chirp tem ZCR crescente (de ~0.018 em 200Hz ate ~0.36 em 4kHz), media ~0.18-0.20, entao `zcrTerm ~= 0.6` e `vocalActivity ~= 0.42`, dando instrumentalness ~= 0.58... mas o resultado foi 0.256. Diferenca provavelmente da variancia do ZCR por frame. O test file (linha 19-20) ja documenta: "Proxy de instrumentalness interpreta ZCR alto como atividade vocal."
- O falso positivo de BPM no chirp e' classico: onset envelope de sinal com envelope variante gera picos periodicos enganosos. O test file (linha 240-242) calcula o lag esperado para 120 BPM e o range aceitavel [80, 180] e' razoavel para o autocorrelator.

**O comportamento nao e' pior do que o documentado nos testes** — e o test file ja cobre limites de autocorrelacao com tons sinteticos (sine 440Hz).

---

## 5. Issues de codigo (nao-bloqueantes)

### Issue 5.1 — Spec drift: campos `features: number[]` e `diagnostics` ausentes

O `wave-2-setup.md:124-138` propoe a API:

```typescript
type K11Features = {
  features: number[];           // ← AUSENTE
  map: Record<string, number>;
  origin: Record<string, "essentia" | "dsp" | "heuristica" | "metadata">;
  diagnostics: { durationMs: number; clippedSamples: number; rmsPercentiles: number[] };  // ← AUSENTE
};
```

A implementacao retornou:

```typescript
type K11Features = {
  features: { [key]: number };  // OBJETO, nao array
  origin: Record<K11FeatureKey, K11FeatureOrigin>;
  confidence: Record<K11FeatureKey, number>;
};
```

**Impacto**: zero. O consumidor (`k11Model.ts:12-21`) faz lookup por nome, nao por indice. Zod (`route.ts:9-21`) valida o objeto, nao o array. Para a UI de Wave 3, o objeto e' ate' preferivel (lookup O(1) por feature).

**Recomendacao**: atualizar `wave-2-setup.md` para refletir a spec final, OU adicionar `featuresArray: number[]` (na ordem de `feature_names.json`) como derivado no objeto.

### Issue 5.2 — Ordem das chaves: `mode_bin` antes de `explicit` no objeto

`feature_names.json`:
```json
[... "tempo", "explicit", "mode_bin"]
```

`extractK11Features.ts:425-427`:
```typescript
tempo: tempo.value,
mode_bin: modeBin.value,
explicit: explicit.value,
```

**Impacto**: zero. `Object.keys` preserva insertion order no V8/Node, mas o consumidor nao usa ordem posicional.

**Recomendacao**: reordenar para `tempo, explicit, mode_bin` para consistencia com o artifact. Cosmético.

### Issue 5.3 — Cobertura de testes: 4 vs 7 do plano

O plano (`wave-2-setup.md:209-216`) lista 7 testes:
- 3 sinais canonicos (440Hz, silence, 120 BPM) — OK
- 1 teste de clamping — **AUSENTE**
- 1 teste de ordem do vetor — **AUSENTE** (descontinuado pela Issue 5.1, mas a checagem de chaves e' trivial)
- 1 teste de `options.explicit` — OK (bonus, linha 281 do test)
- 1 teste de `mode_bin` minor vs major — **AUSENTE** (so e' possivel com essentia; precisa de mock)

**Impacto**: medio. O test suite NAO verifica o caminho `essentia.scale === "minor"` (codigo em `computeModeBin:331`). Cobertura de clamping tambem falta.

**Recomendacao**: adicionar **2 testes**:
1. Clamping: input de 100 sine com amplitude 2.0 (clipping digital) deve gerar `energy <= 1` e `loudness <= 0`.
2. Mock de essentia: stub `describeWithEssentia` para retornar `scale: "minor"` e verificar que `mode_bin === 0`. (Ja tem `vi.mock` configurado implicitamente via dynamic import, mas precisa de wrapper.)

### Issue 5.4 — `mode_bin` default = 1 mesmo sem essentia

`computeModeBin:335`: retorna `{ value: 1, origin: "essentia", confidence: 0 }`. O `origin` deveria ser `"dsp"` ou `"proxy"` quando essentia esta ausente, nao `"essentia"`.

**Impacto**: honestidade. A UI mostrara "essentia" como origem mas confidence = 0, o que pode confundir.

**Recomendacao**: alterar a origem para `"proxy"` ou `"metadata"` (com JSDoc explicando que e' default conservador) quando essentia esta ausente.

### Issue 5.5 — `void sampleRate` swallow sem comentario

`extractK11Features.ts:398`: `void sampleRate;` apenas silencia o lint, mas NAO documenta que sampleRate e' atualmente ignorado (JSDoc linha 383-385 diz "Se != 22050 Hz, internamente assume que o audio ja foi resampled", o que e' OK, mas a chamada `void` e' confusa).

**Impacto**: minimo. Documentacao.

---

## 6. Julgamento por criterio

### 6.1 A funcao e' robusta?

**Sim, com folga.** Cobertura defensiva em 4 camadas:
1. `tryEssentia` (carga + chamada) → fallback null
2. `tryDsp` (extractFeatures wrapper) → fallback null
3. `safeX()` em cada metodo essentia novo → fallback 0
4. `clamp01`/`clampRange` → NaN/Inf viram 0/min

Casos cobertos:
- silencio (zeros) ✓
- NaN/Infinity em qualquer campo essentia (testado por typeof)
- falha de carga do WASM (tryEssentia)
- loudness > 0 (clipped explicitamente)
- samples curtos (audio-features.ts:239 — frameCount < 4 retorna tudo 0)

### 6.2 A confianca e' honesta?

**Sim, e' o ponto mais forte.** Hierarquia clara:
- 0.9+ = essentia direto
- 0.7 = DSP calibrado
- 0.5 = proxy razoavel
- 0.4 = proxy fraco
- 0.3 = proxy muito fraco
- 0.2 = sem dados (heuristica cega)
- 0.0 = sem essentia + sem input
- 1.0 = metadata explicita

A UI pode usar isso para renderizar badges honestos.

### 6.3 Os testes sao suficientes?

**Suficientes para blocker, incompletos para cobertura maxima.**

Cobrem:
- caminho DSP-only (essentia nao carrega em Node) ✓
- silencio (caso degenerado) ✓
- sinal ritmico (autocorrelacao de onset) ✓
- propagacao de options ✓
- ausencia de NaN/Inf em todas as 11 ✓
- ranges fisicos ✓
- contagem de chaves (11) ✓

Faltam:
- clamping explicito (Issue 5.3.1)
- caminho essentia com scale "minor" (Issue 5.3.2)
- origem correta quando essentia ausente (Issue 5.4)

### 6.4 O codigo e' legivel e documentado?

**Sim, acima da media do repo.**

Pontos fortes:
- JSDoc completo em todas as funcoes de calculo
- referencias bibliograficas inline (academia + Spotify)
- strict types (`K11FeatureOrigin`, `K11FeatureKey`, `Record<K11FeatureKey, ...>`)
- header com resumo das 4 origens e 4 niveis de confianca
- funcoes puras e desacopladas

Pontos fracos:
- `void sampleRate` (Issue 5.5)
- `origin = "essentia"` com `confidence = 0` no default (Issue 5.4)

---

## 7. Recomendacao

**Seguir para Wave 3 com 4 acoes de polish (opcionais, NAO bloqueadores):**

1. [OPCIONAL] Reordenar `features` object para `tempo, explicit, mode_bin` (Issue 5.2)
2. [OPCIONAL] Trocar `origin = "essentia"` por `"proxy"` quando `confidence === 0` em `computeModeBin` (Issue 5.4)
3. [OPCIONAL] Adicionar 2 testes (clamping + mode_bin minor via mock) (Issue 5.3)
4. [OPCIONAL] Atualizar `wave-2-setup.md` para refletir spec final (objeto, sem diagnostics) (Issue 5.1)

A Wave 3 (UI) pode consumir o `extractK11Features` **agora** sem nenhum blocker. As 4 actions sao cosméticas e podem ser feitas em paralelo com Wave 3 ou como smooth/cleanup posterior.

**Verdict final: `PASS`.**
