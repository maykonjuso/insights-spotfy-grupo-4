# Wave 4 — Critic Accuracy (julgamento independente)

**Crítico:** accuracy-critic (fresh context, sem Wave 1/2/3)
**Data:** 2026-09-04
**Escopo:** Honestidade do produto sobre a precisão do modelo K-11.
**Métricas oficiais lidas em:** `scripts/k11_pipeline_colab/relatorio/analises/resultados/q11_summary.json`
**Variação por gênero lida em:** `scripts/k11_pipeline_colab/relatorio/analises/resultados/q11_per_genre.csv`

---

## TL;DR

O produto reporta os números certos (R²=0.15, HDI coverage=0.40) — isso é mérito real.
Mas o framing em volta desses números ainda é **greenwashing de precisão**: usa linguagem confiante ("Alta chance", verde/âmbar/vermelho, score 0–100 com 1 casa) num modelo que explica 15% da variância e está 54 pontos percentuais descalibrado no HDI. O disclosure de origem das features é honesto. A variação por gênero (RMSE 4.02 → 37.88) **não é comunicada** — usuário de "dance" recebe o mesmo tratamento de "forró".

**Verdict:** `NEEDS-FIXES-BEFORE-SHIP` — não é desonesto, mas a moldura visual e lexical superestima a confiança do modelo de forma sistemática. Leigo vai absorver "Alta chance verde = recomendação" — esse é o anti-pattern a corrigir antes de mostrar pra usuário final.

---

## 1. O que as métricas dizem (fonte primária)

`q11_summary.json` (test split, n=12.564):

| Métrica | Valor | Threshold do projeto | Status |
|---|---|---|---|
| RMSE | 19.12 | < 18 | **FAIL** (1.12 acima) |
| MAE | 12.74 | — | (sem threshold publicado) |
| R² | 0.152 | > 0.30 | **FAIL** (metade do mínimo) |
| log_RMSE | 0.98 | — | — |
| HDI 94% coverage | 0.400 | [0.90, 0.97] | **FAIL** (54 pp abaixo do limite inferior) |
| ECE (calibração) | 6.56 | — | modelo descalibrado |
| Assertions | `passed: false` | todas | **TODAS AS 3 FALHARAM** |

**`q11_per_genre.csv` (top 10 gêneros por N):**

| Gênero | n | RMSE | MAE | Interpretação |
|---|---|---|---|---|
| forro | 162 | **4.02** | 3.15 | útil |
| bluegrass | 159 | 8.46 | 4.69 | razoável |
| club | 157 | 12.82 | 11.05 | fraco |
| anime | 157 | 12.19 | 9.37 | fraco |
| j-idol | 157 | 9.57 | 6.42 | fraco |
| detroit-techno | 156 | 7.11 | 4.39 | razoável |
| french | 154 | 17.54 | 13.80 | ruim |
| iranian | 152 | **4.61** | 2.43 | útil |
| british | 152 | 25.28 | 22.61 | muito ruim |
| dance | 152 | **37.88** | 22.38 | inutilizável |

**Range de RMSE por gênero: 4.02 → 37.88 — variação de 9.4x.**
**Mediana dos 10: ~10. RMSE global (19.12) é puxado por cauda longa de gêneros difíceis.**

`q11_calibration.csv` (binned predictions vs actuals, test): o modelo **sistematicamente subestima** o score em todas as 10 bacias — exemplo, bin onde predito médio = 17.8, valor real médio = 28.4 (delta -10.6); bin predito = 32.7, real = 39.1 (delta -6.4). Modelo não erra aleatoriamente — erra **na mesma direção** (puxa pra baixo, falta poder discriminante nas caudas).

---

## 2. O que o produto MOSTRA (fonte: arquivos lidos)

### 2.1 Disclaimer no card (`K11DiagnoseCard.tsx:243-245`)

```tsx
<p className="upload-note">
  K-11 é experimental (R²=0.15, HDI coverage=0.40). Use como indicação, não predição exata.
</p>
```

**Visual:** caption pequeno no rodapé do card, cor `--muted` (cinza), mesmo estilo de `Latência do servidor: X ms`. **Não é banner, não é tooltip, não é modal.** É uma linha discreta abaixo de "Latência do servidor".

### 2.2 Tom do score (mesmo arquivo, `scoreTone` linhas 44-54)

```ts
if (score >= 70) return "high";   // classe .upload-score.high (verde)
if (score >= 45) return "mid";    // classe .upload-score.mid   (âmbar)
return "low";                      // classe .upload-score.low   (vermelho)

if (score >= 70) return "Alta chance";
if (score >= 45) return "Potencial médio";
return "Baixa chance";
```

CSS herda de `globals.css` `--green: #1db954` (verde Spotify) / `--amber: #e8a33d` / `--red: #ff5f68`. **Esses são os mesmos tons usados em `UploadAnalyzer` (sistema de "score" do projeto), então o usuário já tem associação visual: verde = bom, vermelho = ruim.**

### 2.3 HDI bar (mesmo arquivo, linhas 168-198)

- `<p>Score: 65 (HDI 94%: 42 a 78)</p>` — mostra score + intervalo.
- Barra horizontal com `width: ${hdiHi}%` (não usa `hdiLo` na geometria — bar vai de 0 até hdiHi, marca visual pode ser enganosa).
- `<dl>` com "Limite inferior" e "Limite superior" como fallback semântico.
- **Nenhuma anotação** sobre o que significa a largura do intervalo. HDI 94% = "94% de chance do valor real estar aqui" é **o que o usuário vai inferir**, mas a cobertura empírica é 0.40 — ou seja, em 60% dos casos o valor real está **fora** do intervalo que o modelo diz ter 94% de confiança.

### 2.4 Chip de origem das features (`FeatureOriginChips.tsx`)

- 11 chips com cor por origem: essentia (verde), dsp (azul), proxy (amarelo), metadata (cinza).
- Tooltip via `title=` HTML: `"Estimativa heurística multi-fonte. Essentia não cobre o conceito (ex.: plateia, valência) — confiança limitada."`
- Help expansível via botão "?" (default fechado): explica as 4 origens, diz explicitamente "Chip amarelo (proxy) é estimativa, não medição — **não trate como verdade**."
- Caption de rodapé: "Cada chip mostra de onde veio o valor e qual a confiança estimada. Chip amarelo (proxy) é estimativa, não medição — não trate como verdade."

**5 features são proxy** (liveness, instrumentalness, valence, speechiness, acousticness) — a maioria dos descritores "subjetivos" do áudio. O usuário vê o chip amarelo **se olhar**, mas o disclosure honesto exige clicar no "?" para ver a explicação completa.

### 2.5 Prompt do LLM (`llmExplanation.ts:45-53`)

```ts
const prompt = `Você explica diagnóstico musical para um usuário leigo em PT-BR. Seja direto, use 2-3 frases curtas, sem jargão estatístico.

Gênero: ${genero}
Score previsto: ${pred.score} (intervalo de credibilidade 94%: ${pred.hdi_lo} a ${pred.hdi_hi})

Top 3 features que mais influenciam este score neste gênero:
${featureList}

Explique de forma acessível o que está puxando o score para cima ou para baixo.`;
```

**O LLM recebe score e HDI sem saber que:**
- R² = 0.15 (modelo explica 15% da variância)
- HDI coverage = 0.40 (intervalo está descalibrado, afirma 94% mas cobre 40%)
- Há 9.4x de variação de RMSE entre gêneros

Resultado: o LLM escreve texto confiante ("essa faixa tem alta dançabilidade e energia, o que aumenta a popularidade") como se o modelo fosse acurado. **Ele é um gerador de explicação causal, não um qualifier de incerteza.** O prompt não pede hedge.

### 2.6 API errors (`route.ts`)

- `400 Invalid JSON body` — genérico
- `400 Validation failed` + `details` — técnico (zod flatten)
- `400 Unknown genre: ${genero}` + `valid_generos: [...]` — útil, lista os 107 válidos
- `500 { error: msg }` — leak da mensagem original do modelo (pode expor path do artifact, erro de IO, etc.)

Nada disso fala de precisão.

### 2.7 AGENTS.md

Documentação interna — **nenhuma menção** a R², HDI coverage, RMSE, ou ao fato de o modelo falhar os 3 assertions. O time de devs não está sendo alertado pelo AGENTS.md de que o produto está servindo um modelo que não bate os próprios thresholds.

---

## 3. Tabela: produto diz vs métricas mostram

| O que o produto DIZ | O que as métricas mostram | Gap |
|---|---|---|
| "K-11 é experimental" | 3 de 3 assertions falharam, modelo não bate próprios thresholds | OK — "experimental" é eufemismo mas tecnicamente verdadeiro |
| "(R²=0.15, HDI coverage=0.40)" | R²=0.152, HDI=0.400 | **Exato** — mérito real do time |
| "Use como indicação, não predição exata" | RMSE=19.12 (em escala 0-100, isso é 19% de erro médio absoluto) | Frase honesta mas fraca — não traduz magnitude |
| Score 0-100 com 1 casa (ex: "65") | RMSE=19, ECE=6.56 | **Falsa precisão**: número inteiro sugere medição, modelo erra por ~20 |
| "Alta chance" (verde) | R²=0.15, RMSE=19 | **Greenwashing**: tom confiante para modelo que explica 15% da variância |
| "Potencial médio" (âmbar) | mesma dúvida | OK se for lido como "indicação" — mas o usuário já viu "Alta chance" antes |
| "Baixa chance" (vermelho) | "dance" com score "baixo" pode estar certo (RMSE=37, modelo inútil); ou "forró" com "baixa chance" pode ser falso negativo (RMSE=4) | **Tom vermelho dá falsa confiança**: o usuário acha que é medição |
| HDI 94% (ex: "42 a 78") | Cobertura empírica = 40% (54 pp abaixo do claim) | **Mentira por omissão**: o usuário infere "94% de chance do real estar aqui", mas é 40% |
| LLM explica causa ("dançabilidade puxa pra cima") | Modelo descalibrado, sistemática subestimação | **LLM dá causalidade fictícia**: ele resume betas, não admite incerteza |
| "Modelo Bayesiano hierárquico · 11 features · 107 gêneros" | Mesmos números reais | OK — informação técnica correta, mas a retórica Bayesian soa impressionante e mascara qualidade ruim |
| "Latência do servidor: X ms" | (transparência operacional boa) | **Anti-pattern adjacente**: precisão operacional sugere precisão científica |
| Chips de origem com 5 amarelos (proxy) | liveness, instrumentalness, valence, speechiness, acousticness são estimativas | **Parcialmente honesto**: o chip existe, mas o usuário precisa clicar "?" e hover pra entender |
| "Cada chip mostra... não trate como verdade" | (caption de rodapé dos chips) | OK — texto explícito, mas é fácil de pular |

---

## 4. Issues de honestidade — por severidade

### CRÍTICO (severity: HIGH — vazar pra usuário final faz mal)

**H1. "Alta chance" / "Potencial médio" / "Baixa chance" com cor verde/âmbar/vermelho**
- **Local:** `K11DiagnoseCard.tsx:50-54` + `globals.css` (classes `upload-score.high/mid/low`)
- **Problema:** leigo associa **verde = recomendação**. Modelo com R²=0.15 não dá recomendação — dá chute com 19 pontos de erro médio. O label "Alta chance" implica confiança que o modelo não tem.
- **Impacto:** usuário age na recomendação. Se for A&R, manda faixa pra playlist. Se for artista, decide lançar com base nisso. Decisão de produto rodando em modelo que explica 15% da variância.
- **Anti-pattern:** "AI confidence" genérico — o produto é cúmplice do mesmo problema que监管部门警示 de modelos generativos.

**H2. HDI mostrado como se fosse intervalo confiável, sem flag de descalibração**
- **Local:** `K11DiagnoseCard.tsx:168-198`
- **Problema:** o usuário vê "HDI 94%: 42 a 78" e infere "94% de probabilidade do valor real estar entre 42 e 78". A **cobertura empírica é 40%** — em 60% dos casos o real está fora. Isso é descalibração severa, não "HDI 94%".
- **Impacto:** o HDI é exatamente a feature que deveria comunicar incerteza, e está comunicando confiança falsa. Pior: a barra horizontal `width: hdiHi%` é desenhada como "quanto da escala foi preenchido", o que reforça leitura de "espaço de acerto".
- **Anti-pattern:** HDI nominal sem teste de calibração empírica = mentir com estatística.

**H3. Variação por gênero (RMSE 4.02 → 37.88) NÃO comunicada**
- **Local:** `route.ts` retorna o score e o gênero mas **não retorna RMSE do gênero** nem nenhum qualifier
- **Problema:** "dance" tem RMSE 37.88 (inutilizável), "forró" tem RMSE 4.02 (útil). Usuário recebe mesma UI, mesma cor, mesma confiança textual. Pode testar uma faixa de dance e receber "Alta chance" sem saber que o modelo é 9.4x pior pra esse gênero.
- **Impacto:** a média global mascara a cauda. Quem usa gêneros de cauda (british, dance) recebe predictions que são, na prática, ruído.
- **Anti-pattern:** summary statistic esconde a distribuição que importa.

### MAJOR (severity: MEDIUM — degrada confiança no produto, mas não causa dano direto)

**M1. Disclaimer é uma linha cinza no rodapé**
- **Local:** `K11DiagnoseCard.tsx:243-245`
- **Problema:** o texto está **correto** mas compete com "Latência do servidor" e o caption de features pelo mesmo espaço visual. Não é banner, não tem ícone, não está perto do score que ele qualifica. Usuário lê "Alta chance" em verde e nem rola até o disclaimer.
- **Magnitude não explicada:** "R²=0.15, HDI coverage=0.40" — usuário leigo não sabe que 0.15 é péssimo (modelo explica 15% da variância, ou seja, 85% do que acontece fica sem explicação) e 0.40 é descalibração (fala 94% mas acerta 40%).

**M2. Prompt do LLM não recebe caveat de incerteza**
- **Local:** `llmExplanation.ts:45-53`
- **Problema:** o LLM é tratado como "explicador do modelo", mas o prompt não diz ao LLM que o modelo é descalibrado. Resultado: explicações como "essa faixa tem alta energia, o que aumenta a popularidade" — escrita como se o modelo fosse ground truth.
- **Anti-pattern:** LLM como amplifier de confiança — humano já confia no número, LLM adiciona narrativa causal, e o resultado vira "o modelo diz, e aqui está o porquê". Sem qualifier.

**M3. Sistema de tom (high/mid/low) é determinístico pelo score, ignora largura do HDI**
- **Local:** `scoreTone(score)` em `K11DiagnoseCard.tsx:44-48`
- **Problema:** score 60 com HDI [55, 65] recebe mesmo "Potencial médio" que score 60 com HDI [10, 90]. A largura do HDI é informação crucial de incerteza, mas **não muda o tom**. HDI largo = "Potencial médio" **ainda é apresentado com cor âmbar confiante**.

**M4. ECE=6.56 não reportado em lugar nenhum**
- **Local:** `q11_summary.json` tem `calibration_test.ece: 6.56` mas nem o card, nem o disclaimer, nem o LLM mencionam
- **Problema:** é a métrica canônica de "o modelo sabe o que não sabe", e está ruim. Não comunicar isso égreenwashing de calibragem.

### MINOR (severity: LOW — polish, não decepcção)

**L1. "Modelo Bayesiano hierárquico · 11 features · 107 gêneros"**
- Retórica técnica impressionante. Não é mentira, mas "Bayesiano hierárquico" soa como "state-of-the-art" — e o modelo falha os próprios thresholds. Vocabulário técnico mascara qualidade ruim.

**L2. Score com 1 casa (ex: 65) sugere precisão**
- RMSE = 19. A casa decimal é falsa precisão. Mostrar 65 vs 65.4 vs 64.8 não tem significado quando o erro é 19.

**L3. Disclosure de proxy exige interação**
- Os 5 chips amarelos são visíveis, mas o help detalhado exige clicar "?" e/ou hover. Usuário que só olha de relance vê "amarelo = alguma coisa" sem saber que é estimativa.

**L4. AGENTS.md não alerta o time**
- Devs que olharem o AGENTS.md não vão ver que R²=0.15, HDI=0.40, e 3/3 assertions falham. Documentação interna não reflete a realidade do modelo.

---

## 5. Sugestões de texto mais honesto (apenas referência, não vou aplicar)

### Substituir o caption de rodapé do card

**Atual (cinza, 1 linha, rodapé):**
> "K-11 é experimental (R²=0.15, HDI coverage=0.40). Use como indicação, não predição exata."

**Proposta 1 (curta, ao lado do score):**
> "Score 0–100 com margem de erro típica de ±19. Veja barra abaixo para o intervalo estimado."

**Proposta 2 (com explicação de magnitude):**
> "Este modelo explica ~15% da variação de popularidade (R²=0.15) e erra em média 19 pontos. Use como sinal fraco, não como recomendação. Veja `?` para detalhes."

### Substituir o tom "Alta chance"

**Atual:**
- score >= 70: "Alta chance" (verde)
- score >= 45: "Potencial médio" (âmbar)
- score < 45: "Baixa chance" (vermelho)

**Proposta (qualifier de incerteza):**
- score >= 70 e HDI_largo < 30: "Possivelmente alta (modelo incerto)" (verde-claro + ícone ?)
- score >= 70 e HDI_largo >= 30: "Possivelmente alta — modelo pouco confiante" (verde-claro + ícone ?)
- qualquer score com HDI_largo >= 50: "Incerto — não recomendado para decisão" (cinza + ícone ⚠)

### Adicionar disclaimer do LLM

No prompt, prepend:
```
LEMBRETE: o modelo K-11 tem R²=0.15 e HDI coverage=0.40 (erro médio de 19 pontos em escala 0-100, descalibrado). 
Sempre que descrever causa, adicione hedge ("pode indicar", "sugere", "não é garantia"). 
Se a largura do HDI for > 30, diga explicitamente que o modelo está inseguro.
```

### Adicionar per-genre reliability badge

No card, ao lado do nome do gênero, mostrar:
- "rmse_g=4.0" (verde, modelo útil) para forró, iranian
- "rmse_g=12.8" (âmbar, modelo fraco) para club, anime, j-idol
- "rmse_g=25+" (vermelho, modelo inutilizável) para british, dance

Ou: esconder o score se RMSE_gênero > 25, mostrando "K-11 ainda não tem dados suficientes para avaliar este gênero com confiança".

---

## 6. Resposta direta às 7 perguntas da task

**(a) Disclaimer menciona R²=0.15 e HDI coverage=0.40 EXATAMENTE?**
Sim. Valoresbatim: "R²=0.15, HDI coverage=0.40". Mérito real do time de Wave 3 (não é arredondamento, não é cherry-pick).

**(b) Disclaimer explica o que SIGNIFICA?**
Parcialmente. "Use como indicação, não predição exata" é direção certa mas não traduz magnitude. Usuário leigo não sabe ler R²=0.15 como "péssimo" nem HDI=0.40 como "descalibrado". Falta pedagogia do número.

**(c) Os 5 chips "proxy" deixam claro que são estimativas?**
Sim, no disclosure completo. **Não** no primeiro olhar: o chip amarelo sozinho não carrega "isso é estimativa" — exige ler o help (?/hover) ou o caption. Para um disclosure honesto, o amarelo precisa de glifo ou texto inline (não só cor), porque daltonismo e scroll rápido existem.

**(d) Prompt do LLM inclui gênero e score corretamente?**
Sim, ambos estão lá com os valores corretos. **Mas falta**: o R², o HDI coverage, o RMSE do gênero, e instrução de hedge. O LLM é incentivado a soar confiante.

**(e) Produto esconde a incerteza em algum lugar?**
Sim:
- HDI é mostrado nominal ("94%") sem flag de descalibração empírica
- Score 0–100 com 1 casa sugere precisão que RMSE=19 nega
- Tom high/mid/low é determinístico pelo score, ignora largura do HDI
- LLM não tem caveat de incerteza no prompt
- ECE=6.56 não é comunicada

**(f) Score borderline (40 vs 60), HDI deixa claro?**
Parcialmente. O número do HDI está visível, mas:
- Não há sinal visual de "HDI largo = incerto"
- O tom (âmbar) é o mesmo para borderline e para meio-do-caminho
- Não há texto explicando "quando o intervalo cruza o limiar de categoria, a recomendação é fraca"

**(g) Variação por gênero comunicada?**
**Não.** A API retorna score, HDI, gênero, ms_per_call. Não retorna RMSE do gênero, ECE do gênero, nem flag de "gênero com modelo fraco". O usuário de "dance" recebe o mesmo UI que o de "forró" — e dance tem RMSE 9.4x pior.

---

## 7. Verdict

**`NEEDS-FIXES-BEFORE-SHIP`**

**Justificativa:**

O disclosure de origem das features (Wave 2 + Wave 3) é genuinamente honesto — chips com cor, help text, caption, e o texto literal "não trate como verdade". Isso é trabalho de qualidade e merece reconhecimento.

**Mas três problemas críticos impedem o ship:**

1. **"Alta chance" verde** em R²=0.15 é greenwashing lexical. Substituir por "Possivelmente alta" + qualifier de HDI largura.
2. **HDI 94% sem flag de descalibração** (cobertura real 40%) é a feature de incerteza do produto, e está mentindo. Adicionar texto inline: "Cobertura empírica deste intervalo: 40% (nominal: 94%). Trate como orientação fraca."
3. **Variação por gênero não comunicada** (RMSE 4.02 → 37.88). Adicionar per-genre reliability badge ou esconder o score quando RMSE_g > threshold.

Sem essas três correções, o produto está tecnicamente reportando os números mas **comunicando confiança que as métricas não sustentam**. Leigo vai absorver "verde = recomendado", e isso é exatamente o que o modelo R²=0.15 não pode oferecer.

**Não é MAJOR-REWORK** porque:
- A infraestrutura de disclosure já existe (chips, caption, HDI bar, disclaimer)
- Os números estão sendo reportados, falta só contextualizar
- É trabalho de UX/copy, não de modelo

**Não é SHIP-READY** porque:
- Os 3 problemas acima são o suficiente pra um usuário real tomar decisão ruim
- O LLM está sendo tratado como amplificador de confiança em vez de amplificador de incerteza
- Documentação interna (AGENTS.md) não alerta o time do estado do modelo

---

## 8. Apêndice — arquivos lidos para este julgamento

- `scripts/k11_pipeline_colab/relatorio/analises/resultados/q11_summary.json` (métricas oficiais, test split)
- `scripts/k11_pipeline_colab/relatorio/analises/resultados/q11_per_genre.csv` (top 10 gêneros)
- `src/components/K11DiagnoseCard.tsx` (disclaimer, tom do score, HDI bar — 251 linhas)
- `src/components/FeatureOriginChips.tsx` (chips de origem, help text, tooltip — 207 linhas)
- `src/lib/llmExplanation.ts` (prompt do LLM — 67 linhas)
- `src/app/api/diagnose/route.ts` (validação, error messages — 92 linhas)
- `AGENTS.md` (documentação interna — 58 linhas, sem menção a R²/HDI/RMSE)

Fresh context: não li Wave 1/2/3 critic, setup, ou deliverable. Julgamento independente baseado apenas no estado atual do código + métricas oficiais.
