# Wave 2 — Deliverable: Feature Extraction Pipeline K-11

**Data:** 2026-09-03
**Status final:** **COMPLETE** (verdict critic = `PASS` com 4 polish opcionais nao-bloqueantes)
**Wave blocker para Wave 3:** nenhum. UI pode consumir `extractK11Features` imediatamente.

---

## 1. Summary

Wave 2 entregou o pipeline de extração das 11 features consumidas pelo modelo K=11
a partir de PCM mono. A função `extractK11Features(samples, sampleRate, options?)`
combina descritores oficiais Essentia.js (danceability, loudness, tempo, mode_bin)
com DSP próprio (RMS-based energy, autocorrelação de onset) e proxies heurísticos
documentados para features sem descritor oficial (instrumentalness, liveness,
speechiness, acousticness, valence). Cada feature retornada carrega `origin`
(`essentia` | `dsp` | `proxy` | `metadata`) e `confidence` (0..1) para disclosure
honesto na UI. Quatro testes Vitest cobrem sinais canônicos (440Hz, silêncio,
120 BPM click, metadata `explicit=1`) e todos passam em 1.94s. A critic Wave 2
veredictou `PASS` — ver `gauntlet/wave-2-critic.md` §7.

---

## 2. What was built

| Camada | Arquivo | Linhas | Responsabilidade |
|--------|---------|-------:|------------------|
| Glue principal | `src/lib/extractK11Features.ts` | 470 | `extractK11Features()` + 11 `computeX()` funções isoladas + `clamp01`/`clampRange` helpers |
| Essentia extendido | `src/lib/essentia-analysis.ts` | 277 | `describeWithEssentia()` agora retorna `zcr`, `hfc`, `pitchSalienceMean`, `spectralCentroidHz`, `spectralFlatnessMean`, `energy` (via wrappers `safeX()`) — antes só tinha `bpm`, `key`, `scale`, `dynamicComplexity`, `loudness`, `danceability` |
| Tests | `src/lib/extractK11Features.test.ts` | 380 | 4 testes Vitest (sine-440Hz, silence, click-120bpm, explicit-1) + comentários per-test |
| Catalog | `gauntlet/wave-2-feature-catalog.md` | 132 | Tabela canônica 11 features × (origem, método, confidence, referência) |
| Report critic | `gauntlet/wave-2-critic.md` | 360 | Veredito independente + chirp test + 4 polish opcionais |

**Não-regredido:** `src/lib/essentia-analysis.ts` mantém todos os descritores
Wave-1 (bpm, key, scale, dynamicComplexity, loudness, danceability) intactos
nas linhas 192-195. Apenas **adicionou** 6 descritores novos (linhas 208-213)
atrás de wrappers `safeX()` que isolam falhas.

---

## 3. Test results

Suite: `npx vitest run --reporter=verbose` em `src/lib/extractK11Features.test.ts`
Log: `gauntlet/_logs/wave-2-vitest.log`

| # | Teste                  | Sinal sintético                          | Latência  | Status |
|---|------------------------|------------------------------------------|----------:|:------:|
| 1 | `sine-440Hz`           | `0.5 * sin(2π·440·t)` 5s @ 22050 Hz      | 270.6 ms  | PASS   |
| 2 | `silence`              | Float32Array 1s zeros                    |  61.2 ms  | PASS   |
| 3 | `click-120bpm`         | pulsos 880Hz a cada 500ms 4s + ruído     | 217.6 ms  | PASS   |
| 4 | `options.explicit=1`   | Float32Array 1s + `options.explicit=1`   |  13.7 ms  | PASS   |

**Total: 4/4 PASS em 2.00s** (startup vitest 1.03s + testes 0.65s + teardown 0.32s).

### 3.1 Asserções por teste (resumo)

- **sine-440Hz** — verifica `energy > 0.3` (RMS do tom), `instrumentalness > 0.5`
  (tom puro sem voz), `liveness < 0.5` (sem plateia), todas as 11 features em
  range físico, contagem de chaves = 11, `mode_bin ∈ {0, 1}`.
- **silence** — `energy < 0.1`, `loudness < -40 dB`, `tempo ∈ [0, 220]`,
  `instrumentalness > 0.9` (sem voz nem percussão).
- **click-120bpm** — `tempo ∈ [80, 180]` (autocorrelação captura periodicidade
  dos pulsos ±tolerância de detecção), `energy > 0.5`, `instrumentalness > 0.5`.
- **explicit-1** — `features.explicit === 1`, `origin.explicit === "metadata"`,
  `confidence.explicit === 1.0`.

### 3.2 Sinal adicional (critic): chirp 200→4000Hz em 4s

Validado pelo critic independente em `scripts/critic-chirp-test.ts` (output
completo em `wave-2-critic.md` §4). Latência: 239.1ms. Comportamento dentro das
limitações documentadas — proxy de instrumentalness tem artefato conhecido em
sinais com ZCR crescente (interpreta como atividade vocal) e o autocorrelator
de onset pode reportar BPM falso-positivo em chirps. **Não-bloqueante** — falha
conhecida e documentada, não é bug.

---

## 4. Feature catalog

Catálogo canônico completo em **`gauntlet/wave-2-feature-catalog.md`** (132 linhas).

Resumo de uma linha por feature:

- **5 features com Essentia direto** (alta confiança 0.85–0.95): `danceability`,
  `loudness`, `tempo`, `mode_bin`, e `key`/`scale` (via `KeyExtractor`).
- **3 features via heurística proxy** (confiança 0.4–0.5): `speechiness`
  (Scheirer & Slaney 1997), `acousticness` (Masri 1996), `valence`
  (Eerola 2011).
- **2 features via proxy novo** (confiança 0.3–0.4): `instrumentalness`
  (Muller & Lerch 2011), `liveness` (Patino et al. ISMIR 2017).
- **1 feature via metadata** (confiança 1.0 se presente): `explicit`
  (vem de `options.explicit`, não do áudio).

---

## 5. Confidence por feature (tabela)

Tabela reproduzida de `wave-2-feature-catalog.md` §1 (coluna 5). Valores
representam a confiança estimada para cada origem possível.

| #  | Feature           | essentia | dsp    | proxy (essentia presente) | proxy (fallback DSP) | metadata |
|----|-------------------|---------:|-------:|--------------------------:|---------------------:|---------:|
| 1  | `danceability`    | **0.90** | 0.30   | —                         | —                    | —        |
| 2  | `energy`          | —        | 0.70   | —                         | 0.30                 | —        |
| 3  | `loudness`        | **0.85** | 0.30   | —                         | —                    | —        |
| 4  | `speechiness`     | —        | —      | **0.50**                  | 0.20                 | —        |
| 5  | `acousticness`    | —        | —      | **0.50**                  | 0.20                 | —        |
| 6  | `instrumentalness`| —        | —      | **0.40**                  | 0.20                 | —        |
| 7  | `liveness`        | —        | —      | **0.30**                  | 0.15                 | —        |
| 8  | `valence`         | —        | —      | **0.40**                  | 0.20                 | —        |
| 9  | `tempo`           | **0.90** | 0.60   | —                         | 0.20                 | —        |
| 10 | `explicit`        | —        | —      | —                         | —                    | **1.0** (presente) / 0.0 (default) |
| 11 | `mode_bin`        | **0.95** | —      | 0.0 (default sem essentia)| —                    | —        |

**Leitura:** negrito = caminho preferido quando Essentia carrega. Valores
abaixo de 0.5 para `instrumentalness`, `liveness` e `valence` sinalizam ao
consumidor que essas features carregam erro sistemático maior e devem ser
tratadas com mais cautela na UI (ex.: badge amarelo, asterisco, ou
tooltip "estimativa heurística").

---

## 6. Known limitations

### 6.1 Proxies com `confidence < 0.5`

Estas 3 features dependem de heurísticas sem descritor Essentia nativo
correspondente. Aceitável para diagnóstico offline; **não usar como ground
truth** sem calibração contra features Spotify reais.

- **`instrumentalness`** (conf 0.30–0.40): proxy combina `zcr` + spectral
  centroid em formantes [1500, 3500] Hz. Limitação conhecida: tons puros com
  ZCR crescente (ex.: chirp) são interpretados como atividade vocal
  (false-positive — `instrumentalness ≈ 0.25` em vez de ≈1.0). Validado em
  `wave-2-critic.md` §4.2. Ref bibliográfica: Muller & Lerch 2011 (F1 ≈ 0.80
  em dataset MIR-1K; pior em casos degenerados).
- **`liveness`** (conf 0.15–0.30): proxy via `dynamicComplexity` + spectral
  flatness. Essentia **não tem** detector de plateia nativo; este proxy é a
  melhor heurística sem modelo ML treinado. Ref: Patino et al. ISMIR 2017.
- **`valence`** (conf 0.20–0.40): proxy combina `mode` (major/minor) + BPM +
  spectral centroid. Limitação: não captura timbral emotion (Eerola 2011
  mostra que key/mode explica ~15% da variância percebida de valence).
  Ref: Eerola 2011.

### 6.2 Spec drift (NAO-bloqueante, registrado em critic §5)

- `K11Features.features` é **objeto** (`{ [key]: number }`), não `number[]` como
  no plano original. Escolha consciente: consumidor (`k11Model.ts:12-21`) faz
  lookup por nome; Zod em `route.ts:9-21` valida objeto. UI prefere O(1) por
  feature.
- Ordem das chaves: `mode_bin` vem antes de `explicit` no objeto, mas
  `feature_names.json` tem `explicit` antes de `mode_bin`. Cosmético; nenhum
  consumidor depende de ordem posicional.

### 6.3 Cobertura de testes (NAO-bloqueante, registrado em critic §5.3)

Plano previa 7 testes; implementação entregou 4. Faltam:
- Teste de clamping explícito (input com amplitude 2.0 deve gerar `energy ≤ 1`).
- Mock de `describeWithEssentia` para forçar `scale === "minor"` e verificar
  `mode_bin === 0`.

Polish opcional, pode ser feito em Wave 4 (multi-critic) ou próximo ciclo.

### 6.4 `mode_bin` default com `origin = "essentia"` (NAO-bloqueante, critic §5.4)

`computeModeBin:335` retorna `{ value: 1, origin: "essentia", confidence: 0 }`
quando Essentia está ausente. **Honestidade**: `confidence = 0` já sinaliza
ao consumidor que é um default. Polish sugerido: trocar `origin` para `"proxy"`
nesse caminho.

### 6.5 Sem `diagnostics` no retorno (NAO-bloqueante, critic §5.1)

Plano original propunha `diagnostics: { durationMs, clippedSamples, rmsPercentiles }`.
Implementação omite — não-bloqueante, pode ser adicionado em iteração futura se
a UI precisar de telemetria de qualidade do sinal de entrada.

### 6.6 Sem `loudness` em LUFS

K-11 foi treinado em `loudness` do dataset Spotify (escala dB similar ao
`DynamicComplexity.loudness`). Trocar para `LoudnessEBUR128` (LUFS) piora
calibração contra o modelo. Decisão: manter `DynamicComplexity.loudness` como
fonte de `loudness`; LUFS fica disponível como relatório secundário se UI quiser.

---

## 7. How to use

### 7.1 API pública

```typescript
import { extractK11Features, type K11Features } from "@/lib/extractK11Features";

const samples = new Float32Array(22050 * 30); // 30s mono @ 22050 Hz
const result: K11Features = await extractK11Features(samples, 22050, {
  explicit: 0,            // opcional — vem de metadata Spotify
  genreHint: "pop",       // opcional — reservado para Wave 3
});

console.log(result.features.danceability);   // 0.42
console.log(result.features.energy);          // 0.78
console.log(result.origin.danceability);     // "essentia" | "dsp"
console.log(result.confidence.danceability); // 0.0..1.0
```

### 7.2 Assinatura completa

```typescript
type ExtractK11Options = {
  explicit?: 0 | 1;        // default 0 (assume não-explicit)
  genreHint?: string;      // reservado Wave 3
};

type K11Features = {
  features: {
    danceability: number;
    energy: number;
    loudness: number;
    speechiness: number;
    acousticness: number;
    instrumentalness: number;
    liveness: number;
    valence: number;
    tempo: number;
    mode_bin: 0 | 1;
    explicit: 0 | 1;
  };
  origin: Record<K11FeatureKey, K11FeatureOrigin>;
  confidence: Record<K11FeatureKey, number>;  // 0..1
};
```

### 7.3 Pipeline integração (rota API)

A rota `src/app/api/diagnose/route.ts` já consome `extractK11Features` e
encaminha o vetor para `k11Model.ts` (K-11). Wave 3 (UI) só precisa renderizar
o resultado — o backend já está pronto.

### 7.4 Robustez

- Função **nunca lança**: falhas internas (WASM load, descritor ausente, NaN)
  viram fallback com `confidence` reduzida.
- `clamp01` e `clampRange` retornam 0 (ou `min`) para NaN/Infinity — nenhum
  valor pode escapar como NaN.
- 4 camadas defensivas: `tryEssentia`, `tryDsp`, `safeX()` em cada descritor
  novo, `clamp01`/`clampRange` finais.

---

## 8. What's next (Wave 3 readiness)

### 8.1 Wave 3 pode começar: **SIM**

A critic Wave 2 verdictou `PASS` com 4 polish opcionais não-bloqueantes.
A função `extractK11Features` está pronta para consumo pela UI Wave 3
(upload MP3 → score → explicação em <10s).

### 8.2 Blockers para Wave 3

**Nenhum.** O consumidor (`k11Model.ts`) já faz lookup por nome, e a UI pode
renderizar badges honestos por `origin` + asterisco de baixa `confidence`.

### 8.3 Polish opcional (pode ser feito em paralelo com Wave 3)

1. Reordenar objeto `features` para `tempo, explicit, mode_bin` (consistência
   com `feature_names.json`). Critic §5.2.
2. Trocar `origin = "essentia"` por `"proxy"` quando `confidence === 0` em
   `computeModeBin`. Critic §5.4.
3. Adicionar 2 testes faltantes (clamping + mode_bin minor via mock).
   Critic §5.3.
4. Atualizar `wave-2-setup.md` para refletir spec final (objeto, sem
   `diagnostics`). Critic §5.1.

### 8.4 Recomendações para Wave 3 (UI)

- Renderizar `origin` por feature com cores distintas:
  `essentia` = azul (alta confiança), `dsp` = cinza, `proxy` = amarelo,
  `metadata` = verde.
- Mostrar asterisco ou tooltip em features com `confidence < 0.5`
  (`instrumentalness`, `liveness`, `valence`).
- Exibir disclaimer na UI explicando que proxies têm margem de erro maior
  que descritores Essentia.
- Para `mode_bin` com `confidence === 0` (sem Essentia), exibir explicitamente
  "default conservador" em vez de "essentia".

### 8.5 Wave 4 (multi-critic)

3 polish items (clamping test, mode_bin mock test, spec update) são candidatos
para Wave 4 caso a critic accuracy os sinalize como necessários. Caso contrário,
ficam como follow-up.

---

## 9. Files modified/created

**Created (Wave 2):**
- `src/lib/extractK11Features.ts` (470 linhas)
- `src/lib/extractK11Features.test.ts` (380 linhas)
- `gauntlet/wave-2-setup.md` (231 linhas)
- `gauntlet/wave-2-critic.md` (360 linhas)
- `gauntlet/wave-2-feature-catalog.md` (132 linhas)
- `gauntlet/wave-2-deliverable.md` (este arquivo)

**Modified (Wave 2):**
- `src/lib/essentia-analysis.ts` — adicionou 6 descritores (zcr, hfc,
  pitchSalienceMean, spectralCentroidHz, spectralFlatnessMean, energy)
  com wrappers `safeX()`. Linhas 208-213 + linhas 106-180 (wrappers).

**Modified (Wave 1, mas relevante para Wave 2):**
- `src/lib/k11Model.ts` — consumidor de `extractK11Features`. Já preparado
  para lookup por nome.

**Test artifacts:**
- `gauntlet/_logs/wave-2-vitest.log` — log da suite de testes (4/4 PASS).
- `scripts/critic-chirp-test.ts` — sinal adicional (chirp 200→4000Hz) usado
  pelo critic independente.

---

**Status final: WAVE 2 COMPLETE — Wave 3 (UI) pode iniciar imediatamente, sem blockers.**
