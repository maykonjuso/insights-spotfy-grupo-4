# Wave 3 Setup — Mapa do `UploadAnalyzer` e plano de integração K-11

**Data:** 2026-09-03
**Agente:** setup (Wave 3)
**Escopo:** mapear o `UploadAnalyzer` existente, confirmar contratos de `extractK11Features` e do endpoint `POST /api/diagnose`, e desenhar o plano de integração do card K-11 — antes das fases `build-upload` / `build-worker` / `build-display` / `build-disclaimers` / `integrator`.

**Pré-condições verificadas:**
- `extractK11Features(samples, sampleRate, options?)` exportado e contrato estável (Wave 2).
- `POST /api/diagnose` 200/400/500 com payload validado por Zod (Wave 1).
- `FEATURE_SAMPLE_RATE = 22050` Hz — `audio-decode.ts` já entrega `monoSamples` nessa taxa (Wave 2 confirmou).
- `essentia.js` instalado (Wave 2 fixou), então `extractK11Features` consegue carregar WASM em runtime.

---

## 1. Mapa do `UploadAnalyzer` atual (350 linhas)

### 1.1 Imports relevantes (linhas 1–13)

```ts
import { analyzeSamples } from "@/lib/audio-analysis";     // Essentia + GTZAN
import { decodeAudioFile } from "@/lib/audio-decode";      // → AudioBuffer + monoSamples@22050
import type { AudioSummary } from "@/lib/audio-features";
import type { EssentiaDescriptors } from "@/lib/essentia-analysis";
import { modelInfo, type GenreScore } from "@/lib/genre-classifier";
import { buildSoundFeatures } from "@/lib/sound-features";
import { PreviewPlayer } from "./PreviewPlayer";
import { SoundFeatureGrid } from "./SoundFeatureGrid";
```

**Imports a adicionar em Wave 3:**
```ts
import { extractK11Features, type K11Features } from "@/lib/extractK11Features";
import { K11DiagnoseCard } from "./K11DiagnoseCard";
// fetch wrapper para /api/diagnose (ou função inline)
```

### 1.2 Tipos e funções puras (linhas 15–167)

- **`UploadResult`** (linha 15): tipo do estado. **Campo novo a adicionar:** `k11: { features, origin, confidence } | null` e `diagnose: DiagnoseResponse | null`.
- **`MODEL`** (linha 36): `modelInfo()` — usado só para o footer dos gêneros GTZAN reconhecidos.
- **`analyzeChannel(channel, duration)`** (linha 62): DSP próprio (RMS, peak, dynamic range, clipping) — **independente do K-11, manter como está.**
- **`buildUploadScore(result)`** (linha 110): heurística do score "Alta chance / Potencial médio / Baixa chance" — **independente do K-11, manter como está.** O score K-11 é independente e roda em paralelo.

### 1.3 Componente `UploadAnalyzer` (linhas 169–349)

**State (linhas 170–175):**
```ts
const inputRef = useRef<HTMLInputElement>(null);
const objectUrls = useRef<string[]>([]);
const [results, setResults] = useState<UploadResult[]>([]);
const [pending, setPending] = useState<string | null>(null);
const [isDragging, setIsDragging] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Novo state a adicionar:**
```ts
const [diagnosePending, setDiagnosePending] = useState<string | null>(null); // result.id
const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
```

**Lifecycle (linhas 179–185):** cleanup de `objectUrls` + `stopPlayback` no unmount. **Sem mudança.**

**`analyzeFile(file)` (linhas 187–220):** ponto de entrada após drop/select.
- `decodeAudioFile(file)` → `buffer` (AudioBuffer estéreo nativo) + `monoSamples` (Float32Array @22050 Hz mono).
- `analyzeChannel(buffer.getChannelData(0), buffer.duration)` → DSP heurístico.
- `analyzeSamples(monoSamples)` → `{ classification, descriptors, descriptorsError, onMainThread }` via worker Essentia.

**Modificação Wave 3:** após `analyzeSamples`, calcular K-11 features uma única vez e cachear no `UploadResult`:
```ts
const k11 = await extractK11Features(monoSamples, 22050);
// → { features, origin, confidence }
// k11 fica pronto para o botão — sem re-extrair no clique.
```

**`analyzeFiles` (linhas 222–226):** loop sequencial sobre `FileList`. **Sem mudança.**

**`clearResults` (linhas 228–234):** zera `results`, libera `objectUrls`, `stopPlayback`. **Atualizar:** também zera `diagnosePending` e `diagnoseError` se quiser estado consistente, mas como `results` zera, o card some naturalmente.

### 1.4 JSX — estrutura do `upload-result` (linhas 283–346)

Ordem atual de cada item de `results.map`:
1. **`<div className="upload-score">`** — score heurístico grande (44px) + label + filename.
2. **`<PreviewPlayer>`** — tocador local.
3. **`<div className="genre-result">`** — top 3 GTZAN genres com barra.
4. **`<SoundFeatureGrid>`** — grupos de features (Dança, Energia, etc.) com bar.
5. **`p className="upload-note"`** — disclaimer Essentia (se falhou).
6. **`<div className="signal-list">`** — sinais textuais do score heurístico.

**Inserção Wave 3:** o card K-11 vai **entre (3) e (4)** — depois do gênero provável GTZAN e antes do grid de features — para criar a leitura: "que som é" (gênero) → "como o modelo K-11 avalia" (novo!) → "detalhes técnicos" (grid). Isso coloca o K-11 como a peça central, sem deslocar o score heurístico (que continua sendo o primeiro destaque).

### 1.5 Design system — variáveis CSS e classes reutilizáveis

Lendo `src/app/globals.css` (1090 linhas), os blocos relevantes para Wave 3:

| Bloco CSS               | Linhas    | Reuso Wave 3 |
|-------------------------|-----------|--------------|
| `:root` (tokens)        | 1–13      | `--green`, `--green-2`, `--amber`, `--red`, `--muted`, `--panel-2`, `--line`. Todos já cobrem o card. |
| `.panel` (base card)    | 56–61, 114–118 | Já tem `border-radius: 8px; padding: 18px; background: rgba(18,18,18,0.88)`. Reusar como wrapper do K11DiagnoseCard. |
| `.album-label` (eyebrow)| 94–103    | Verde uppercase — usar como "DIAGNÓSTICO K-11" no topo do card. |
| `.score-ring` (análise) | 421–466   | **Reusar** o anel conic-gradient para o score grande (0–100), com classes `high`/`mid`/`low` por limiar. |
| `.genre-bar` + `.feature-bar` | 779–847 | Reusar padrão de barra para o HDI (faixa [lo, hi] com marca do score). |
| `.signal-list` (citação)| 496–517   | Reusar como container do disclaimer/pequeno texto explicativo. |
| `.upload-note` (muted)  | 667–672   | Reusar para o disclaimer "modelo treinado em 50k faixas..." |
| `.insight-loading` (estado) | 534–539 | Reusar para "Diagnosticando..." |
| `.error-banner`         | 526–532   | Reusar para erro de /api/diagnose. |
| `.scan-button`          | 701–724   | **Reusar** como botão "Diagnosticar com K-11" — já tem o estilo certo (border verde-claro, bg verde-claro, hover, disabled). |
| `.section-heading`      | 120–130   | Padrão de cabeçalho de seção já usado no `UploadAnalyzer`. |

**Conclusão:** zero CSS novo obrigatório. O design system cobre 100% do card via classes existentes. Se precisar de ajustes finos (espaçamento interno, position do HDI relative ao score), criar 1–2 classes novas `.k11-card` / `.k11-hdi` em globals.css (≤ 30 linhas).

### 1.6 Breakpoints / responsividade

- `app-shell` é `width: min(100%, 1180px); padding: 20px 14px 40px;` — container fluido.
- `score-ring` já usa `width: min(58vw, 172px)` — adapta para mobile.
- `.upload-result` é `display: grid; gap: 14px;` — escala naturalmente.
- Não há media queries específicos para upload-result. **Decisão:** desktop-first como o resto do app; testar em viewport 360px (Tailwind não usado, custom CSS).

---

## 2. Contrato de `extractK11Features` (Wave 2)

Confirmado em `src/lib/extractK11Features.ts`:

```ts
export async function extractK11Features(
  samples: Float32Array,        // mono, normalizado em [-1, 1], 22050 Hz
  sampleRate: number,           // reservado; em prática 22050
  options?: {
    explicit?: 0 | 1;          // metadata; default 0
    genreHint?: string;        // reservado Wave 3; não usado
  },
): Promise<K11Features>;

// K11Features = {
//   features:  { danceability, energy, loudness, speechiness, acousticness,
//                instrumentalness, liveness, valence, tempo, mode_bin, explicit },
//   origin:    Record<K11FeatureKey, "essentia" | "dsp" | "proxy" | "metadata">,
//   confidence:Record<K11FeatureKey, number>,  // 0..1
// }
```

- **Não lança** — todos os fallbacks (DSP-only, etc.) estão capturados internamente.
- **Idempotente** — chamar 2× com o mesmo `samples` retorna o mesmo objeto.
- **Custo:** ~200–500 ms (depende da duração; roda Essentia WASM + DSP local). Aceitável no `analyzeFile` (que já é assíncrono).
- **Resultado cabe em `UploadResult.k11`** sem transformação adicional.

**Sem mudanças no `extractK11Features.ts`.** O contrato está estável e Wave 3 só consome.

---

## 3. Contrato de `POST /api/diagnose` (Wave 1)

Confirmado em `src/app/api/diagnose/route.ts`:

**Request:**
```json
POST /api/diagnose
Content-Type: application/json
{
  "track_features": {
    "danceability": 0.0..1.0,
    "energy":       0.0..1.0,
    "loudness":    -60..0,         // dB
    "speechiness":  0.0..1.0,
    "acousticness": 0.0..1.0,
    "instrumentalness": 0.0..1.0,
    "liveness":     0.0..1.0,
    "valence":      0.0..1.0,
    "tempo":        0..250,        // BPM
    "explicit":     0 | 1,
    "mode_bin":     0 | 1          // 1=major, 0=minor
  },
  "genero": "pop"                  // string, 1..50 chars; validado contra 107 do genero_cats
}
```

**Response 200:**
```json
{
  "score": 42,                      // int 0..100
  "hdi_94": [38, 47],               // intervalo de credibilidade 94%
  "explicacao": "Texto PT-BR 2-3 frases...",
  "genero": "pop",
  "ms_per_call": 1876               // server-side
}
```

**Response 400:** `{ error: "Validation failed", details: ... }` ou `{ error: "Unknown genre: ...", valid_generos: [...] }` (107 itens).

**Response 500:** `{ error: "..." }` (raro; só se o predict/loadGz falhar).

**Latência:** 1876 ms cold / 655 ms warm. UI precisa de estado `pending` explícito.

### 3.1 Decisão: como escolher o `genero`?

O usuário envia um MP3 qualquer. O GTZAN classifica em 10 gêneros (blues, classical, country, disco, hiphop, jazz, metal, pop, reggae, rock). O K-11 espera um dos **107 gêneros** do `genero_cats.json` (lidos via `GET /api/generos`).

**Decisão Wave 3 (v1):** mapear o top-1 GTZAN para o K-11 usando a interseção óbvia. Tabela (hardcoded em `lib/genreBridge.ts`):

| GTZAN top-1 | K-11 `genero` |
|-------------|---------------|
| `pop`       | `pop`         |
| `rock`      | `rock`        |
| `hiphop`    | `hip-hop`     |
| `jazz`      | `jazz`        |
| `classical` | `classical`   |
| `country`   | `country`     |
| `blues`     | `blues`       |
| `disco`     | `disco`       |
| `reggae`    | `reggae`      |
| `metal`     | `metal`       |

**Limitação conhecida (v1):** sertanejo cai em `country`, MPB em `jazz`/`blues`, funk em `hip-hop`, eletrônica em `pop`/`disco`. **A Wave 3 documenta isso no disclaimer do card.** Wave 4+ (futuro) pode usar `genreHint` ou um dropdown de override.

**Fallback:** se o áudio for < 5s e `result.genres` for vazio, **mostra o card com um seletor de gênero** (dropdown com os 107 do `/api/generos`) antes do botão "Diagnosticar". Isso evita bloqueio total.

---

## 4. Plano de integração

### 4.1 Mudanças no estado (`UploadAnalyzer.tsx`)

```ts
type UploadResult = {
  // ...campos atuais...
  k11: K11Features | null;        // populado em analyzeFile
  diagnose: DiagnoseResponse | null;   // populado no clique do botão
  diagnoseError?: string;         // erro do /api/diagnose
};

type DiagnoseResponse = {
  score: number;
  hdi_94: [number, number];
  explicacao: string;
  genero: string;
  ms_per_call: number;
};
```

**Novos hooks:**
```ts
const [diagnosePending, setDiagnosePending] = useState<string | null>(null);
```

**`analyzeFile` ganha uma linha** após o `analyzeSamples`:
```ts
const k11 = await extractK11Features(monoSamples, 22050);
```
e o `setResults` passa a incluir `k11`.

### 4.2 Handler `runDiagnose(resultId)` (novo, inline no componente)

```ts
async function runDiagnose(resultId: string) {
  const target = results.find((r) => r.id === resultId);
  if (!target || !target.k11) return;

  setDiagnosePending(resultId);
  setDiagnoseError(null);

  // Resolve gênero (bridge GTZAN → K-11; v1 hardcoded)
  const genero = target.genres[0]?.genre
    ? bridgeGenre(target.genres[0].genre)
    : null;

  if (!genero) {
    setDiagnoseError("Gênero não reconhecido. Áudio curto ou fora dos 10 GTZAN.");
    setDiagnosePending(null);
    return;
  }

  try {
    const resp = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_features: target.k11.features,
        genero,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${resp.status}`);
    }
    const data: DiagnoseResponse = await resp.json();
    setResults((current) =>
      current.map((r) => (r.id === resultId ? { ...r, diagnose: data } : r)),
    );
  } catch (err) {
    setDiagnoseError(err instanceof Error ? err.message : "Erro desconhecido");
  } finally {
    setDiagnosePending(null);
  }
}
```

### 4.3 Botão no JSX (entre `genre-result` e `SoundFeatureGrid`)

```tsx
{/* K-11 diagnose — Wave 3 */}
<K11DiagnoseCard
  result={result}
  pending={diagnosePending === result.id}
  onDiagnose={() => runDiagnose(result.id)}
/>
```

O componente `K11DiagnoseCard` cuida de mostrar:
- Se `result.k11 == null` → "Extraindo features..." com spinner.
- Se `result.diagnose == null && pending` → botão disabled com texto "Diagnosticando...".
- Se `result.diagnose != null` → score grande, barra de HDI, explicação LLM, disclaimer.
- Se `result.diagnoseError` → `error-banner` com o erro.
- Se áudio < 5s (sem `genres[0]`) → seletor de gênero opcional antes do botão.

### 4.4 JSX final do item de resultado (após integração)

```
1. <div className="upload-score">           ← score heurístico (inalterado)
2. <PreviewPlayer />                        ← tocador (inalterado)
3. <div className="genre-result">           ← top 3 GTZAN (inalterado)
4. <K11DiagnoseCard />                      ← NOVO: card K-11
5. <SoundFeatureGrid />                     ← grid de features (inalterado)
6. <p className="upload-note">              ← disclaimer Essentia (inalterado)
7. <div className="signal-list">            ← sinais heurísticos (inalterado)
```

---

## 5. Design do componente `K11DiagnoseCard`

### 5.1 Props

```ts
type K11DiagnoseCardProps = {
  result: UploadResult;            // só usamos k11, diagnose, diagnoseError, genres
  pending: boolean;                // vindo do pai (diagnosePending === result.id)
  onDiagnose: () => void;          // dispara POST /api/diagnose
};
```

### 5.2 Estrutura JSX

```tsx
<section className="panel k11-card">
  <p className="album-label">Diagnóstico K-11</p>

  {!result.k11 ? (
    <p className="insight-loading">Extraindo 11 features do áudio...</p>
  ) : result.diagnose ? (
    <>
      {/* Score grande com anel conic-gradient (reusar .score-ring) */}
      <div className={`score-ring ${scoreTone(result.diagnose.score)}`}
           style={{ "--score": result.diagnose.score } as React.CSSProperties}>
        <span>{result.diagnose.score}</span>
        <strong>Score K-11</strong>
        <small>{result.diagnose.genero}</small>
      </div>

      {/* Barra de HDI: marca [lo, hi] em escala 0..100 */}
      <div className="k11-hdi">
        <div className="k11-hdi-bar">
          <i style={{
            marginLeft: `${result.diagnose.hdi_94[0]}%`,
            width:     `${result.diagnose.hdi_94[1] - result.diagnose.hdi_94[0]}%`,
          }} />
        </div>
        <span>{result.diagnose.hdi_94[0]}–{result.diagnose.hdi_94[1]} (94%)</span>
      </div>

      {/* Explicação LLM */}
      <p className="k11-explicacao">{result.diagnose.explicacao}</p>

      {/* Disclaimer honesto */}
      <p className="upload-note">
        Modelo K-11 treinado em ~50k faixas do Spotify (2010–2019). Gênero resolvido
        pelo classificador GTZAN local ({result.genres[0]?.genre ?? "desconhecido"}).
        Features com origem <em>proxy</em> carregam confiança reduzida — o score é
        indicativo, não determinístico. Latência: {result.diagnose.ms_per_call} ms.
      </p>
    </>
  ) : (
    <>
      {/* Botão "Diagnosticar" — reusar .scan-button */}
      <button
        type="button"
        className="scan-button"
        onClick={onDiagnose}
        disabled={pending || !result.k11}
      >
        {pending ? "Diagnosticando..." : "Diagnosticar com K-11"}
      </button>
      <p className="scan-descriptors">
        Envia as 11 features extraídas do seu áudio para o modelo Bayesiano
        K-11 e devolve um score de 0–100 com explicação em PT-BR.
      </p>
    </>
  )}

  {result.diagnoseError ? (
    <p className="error-banner">{result.diagnoseError}</p>
  ) : null}
</section>
```

### 5.3 Estados visuais

| Estado | Visual |
|--------|--------|
| `k11 == null` (extraindo) | `<p className="insight-loading">` com texto "Extraindo 11 features..." |
| `k11 != null` e `diagnose == null` (pronto) | Botão `.scan-button` ativo + linha descritiva |
| `k11 != null` e `pending` (chamando API) | Botão disabled com texto "Diagnosticando..." (cursor progress) |
| `diagnose != null` (resultado) | Anel de score + barra HDI + texto LLM + disclaimer |
| `diagnoseError != null` | `.error-banner` em vermelho |
| Áudio < 5s (`genres` vazio) | Mostrar seletor `<select>` com os 107 do `/api/generos` antes do botão (fallback) |

### 5.4 CSS novo necessário (mínimo, ≤ 30 linhas em globals.css)

```css
/* K-11 diagnose card — Wave 3 */
.k11-card {
  display: grid;
  gap: 14px;
}
.k11-hdi {
  display: grid;
  gap: 6px;
}
.k11-hdi-bar {
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: var(--panel-3);
}
.k11-hdi-bar i {
  position: absolute;
  top: 0; bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--green), var(--green-2));
}
.k11-hdi span {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.k11-explicacao {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}
```

Tudo o mais reusa `.score-ring`, `.scan-button`, `.insight-loading`, `.error-banner`, `.upload-note`, `.album-label`, `.panel` — **zero duplicação de design system.**

---

## 6. Lista de novos arquivos

| Arquivo | Tamanho estimado | Função |
|---------|------------------|--------|
| `src/components/K11DiagnoseCard.tsx` | ~120 linhas | Componente que renderiza o card, recebe props do pai, chama `onDiagnose` no clique. **Não conhece o estado do pai.** |
| `src/lib/genreBridge.ts` | ~30 linhas | `bridgeGenre(gtzan: string): string \| null` — mapeia top-1 GTZAN para K-11. Comentário com a limitação v1. |

**Total:** 2 arquivos novos, ~150 linhas.

---

## 7. Lista de arquivos a modificar

| Arquivo | Mudança | Linhas estimadas |
|---------|---------|-------------------|
| `src/components/UploadAnalyzer.tsx` | (a) Importar `extractK11Features` + `K11DiagnoseCard` + `bridgeGenre`. (b) Adicionar campo `k11` e `diagnose` em `UploadResult`. (c) Calcular `k11` em `analyzeFile`. (d) Novo state `diagnosePending`. (e) Handler `runDiagnose`. (f) Inserir `<K11DiagnoseCard />` no JSX entre `genre-result` e `SoundFeatureGrid`. (g) Resetar `diagnosePending` em `clearResults`. | +60 linhas |
| `src/app/globals.css` | Adicionar bloco `.k11-card` / `.k11-hdi` / `.k11-explicacao` (~30 linhas). Posicionar perto de `.upload-result` para coesão. | +30 linhas |

**Total:** 2 arquivos modificados, +90 linhas.

**Arquivos NÃO modificados (verificado):**
- `src/lib/extractK11Features.ts` — contrato estável, só consumido.
- `src/lib/audio-analysis.ts`, `audio-decode.ts`, `essentia-analysis.ts` — já entregam o que `extractK11Features` precisa.
- `src/app/api/diagnose/route.ts` — API já validada; Wave 3 só consome.
- `src/components/SoundFeatureGrid.tsx`, `PreviewPlayer.tsx` — independentes.

---

## 8. Como testar e2e

### 8.1 Pré-condições

```sh
# Em C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4
rm -rf .next       # workaround documentado em AGENTS.md
npm run dev
# Aguardar ~20s o "Ready in" aparecer
```

Acessar `http://localhost:3000` no navegador (Chrome ou Firefox mais recente — Web Audio API + WebAssembly obrigatórios).

### 8.2 Smoke test manual (5 min)

1. **Verificar baseline:** o card K-11 ainda não está visível porque nada foi enviado. Deve ver o dropzone + o footer de gêneros GTZAN.
2. **Upload:** arrastar um MP3 (≥ 5s, idealmente 30s) para o dropzone.
3. **Aguardar:** texto "Analisando ..." aparece; depois ~1–2s, score heurístico + GTZAN genres + ESSENTIA descriptors.
4. **Verificar pré-condição K-11:** novo card "Diagnóstico K-11" deve aparecer com botão "Diagnosticar com K-11" (não com score ainda).
5. **Clicar "Diagnosticar":** botão fica disabled com "Diagnosticando...". Aguardar ~2s cold / ~700ms warm.
6. **Resultado:** anel de score + barra HDI + texto PT-BR + disclaimer aparecem.
7. **Erro (teste adversarial):** colocar `OPENROUTER_API_KEY=invalid` em `.env.local`, reiniciar, repetir. Deve mostrar `error-banner` com "Explicação automática indisponível; ..." OU erro HTTP se o `/api/diagnose` falhar.
8. **Áudio < 5s:** enviar um MP3 de 3s. `result.genres` fica vazio; card mostra seletor de gênero; usuário escolhe um e clica "Diagnosticar".
9. **Clear:** clicar "Limpar 1 análise". Card some, estado zera.
10. **Multi-upload:** arrastar 3 MP3s. Cada um ganha seu próprio card K-11 independente. Estado `diagnosePending` isola cada um pelo `result.id`.

### 8.3 Teste automatizado (Playwright, opcional Wave 3)

Cenário cobível:
- Subir `npm run dev`.
- `page.goto('http://localhost:3000')`.
- `page.locator('input[type="file"]').setInputFiles('fixtures/short-clip.mp3')`.
- `page.locator('text=Diagnosticar com K-11').click()`.
- `page.locator('.k11-explicacao').waitFor()`.
- `expect(page.locator('.score-ring span').textContent()).toMatch(/^[0-9]{1,3}$/)`.

**Caveat:** o teste Playwright requer `fixtures/short-clip.mp3` no repo (CC0/domínio público) e configuração de Web Audio no browser headless. **Recomendação:** fazer smoke test manual na Wave 3; Playwright fica como deliverable opcional da Wave 4.

### 8.4 Critérios de aceite (para a fase `critic`)

- [ ] Card K-11 aparece após cada upload bem-sucedido.
- [ ] Botão "Diagnosticar" só fica enabled quando `k11 != null`.
- [ ] Após clique, score + HDI + explicação aparecem em < 3s (warm) / < 5s (cold).
- [ ] Erro de rede / 4xx / 5xx mostra `error-banner` com mensagem útil.
- [ ] Disclaimer "GTZAN local" + "features proxy carregam confiança reduzida" visível.
- [ ] Áudio < 5s mostra seletor de gênero (não trava).
- [ ] `clearResults` zera tudo.
- [ ] Multi-upload funciona (3 cards independentes).
- [ ] Layout não quebra em viewport 360px.
- [ ] Sem regressão no score heurístico / SoundFeatureGrid / PreviewPlayer.

---

## 9. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| `extractK11Features` lança exceção em algum áudio | Baixa (Wave 2 cobriu com try/catch) | Card trava em "Extraindo..." | `analyzeFile` envolve em try/catch; `k11 = null` → mostra "Indisponível" |
| `/api/diagnose` retorna 500 por cold start lento | Média | Latência ruim | Botão disabled durante pending; texto "Diagnosticando..." no botão |
| Gênero GTZAN não bate com o `genero_cats` do K-11 | Alta (apenas 10 mapeamentos em 107) | Diagnóstico enviesado | **Documentar no disclaimer** + oferecer seletor manual no v1 (fallback áudio curto) |
| Latência total > 5s (essentia + DSP + diagnose) | Média | UX ruim | Mostrar passos em sequência ("Extraindo..." → "Diagnosticando...") para feedback contínuo |
| Erro de hydration em SSR | Nula (componente já é `"use client"`) | — | — |

---

## 10. Resumo do plano

**Novos arquivos:** 2 (`K11DiagnoseCard.tsx`, `genreBridge.ts`).
**Modificados:** 2 (`UploadAnalyzer.tsx`, `globals.css`).
**Linhas adicionadas:** ~150 (90 de código + 30 de CSS + 30 de testes/JSDoc).
**Dependências externas:** zero — só reusa libs já presentes.
**Bloqueios:** nenhum — pré-condições verificadas.
**Próxima fase:** `build-upload` (modificar `UploadAnalyzer.tsx`) → `build-display` (criar `K11DiagnoseCard.tsx`) → `build-disclaimers` (CSS + textos) → `integrator` (montar tudo) → `critic` (validar) → `report`.
