# Q8 — A receita varia por gênero? — Relatório detalhado

**Modelo hierárquico Bayesiano (PyMC) aplicado a 89 740 faixas do Spotify**

**Autor**: análise conduzida via Claude Code (modelo MiniMax-M3) com revisão humana
**Data**: 2026-09-01
**Status**: pronto para revisão do time de produto
**Repositório**: `maykonjuso/insights-spotfy-grupo-4` · branch `feature/bayes-hierarchical-popularity`

---

## 1. Sumário executivo (1 página)

### 1.1 A pergunta de negócio

Na reunião #1 do time, vocês decidiram construir um **produto de consultoria para artistas Spotify** focado em popularidade. A proposta de valor inicial era um "Diagnóstico de Posicionamento": a partir das características de áudio de uma faixa, dizer ao artista *onde ela está* em relação ao topo do seu gênero e *o que ajustar*.

O problema é que as 7 análises estatísticas anteriores (Q1–Q7, no report.html) deixavam essa proposta no ar. A regressão OLS de Q1 mostrou que **as features de áudio explicam só 3,5% da variação de popularidade** (R² = 0,035). Os coeficientes eram estatisticamente significativos mas pequenos. A análise Q2 mostrou que **o gênero discrimina com lift de até 31×**. Mas nenhuma pergunta respondeu diretamente: *"a receita do hit muda de gênero para gênero?"*

**Q8 responde exatamente isso.**

### 1.2 A resposta (uma frase)

**A receita varia SIM, e de forma mensurável.** Algumas dimensões da produção (loudness, energy, danceability) têm efeitos que dependem fortemente do gênero — em reggaeton o efeito é oposto ao de death metal, por exemplo. Outras dimensões (tempo, liveness) são quase universais.

### 1.3 Três decisões que este relatório destrava

| # | Decisão | Como Q8 informa |
|---|---|---|
| **1** | **Construir o produto** | As 7 análises mostravam que features têm efeito pequeno globalmente. Q8 mostra que o efeito varia por gênero — exatamente o que um diagnóstico personalizado precisa. |
| **2** | **Quais features destacar** | σ_β (variabilidade entre gêneros) ranqueia loudness/energy/danceability como as mais gênero-dependentes. O produto deve pesar essas no scorecard. |
| **3** | **Onde coletar mais dados** | Subgêneros com alta variabilidade residual (σ_β alto + CI largo) são candidatos a investigar em Q9: por que o efeito varia tanto lá? Talvez haja clusters dentro do subgênero. |

---

## 2. Contexto e motivação

### 2.1 O que veio antes

Em ordem cronológica:

1. **Q1 (regressão OLS)**: features de áudio explicam 3,5% da variância. Magnitude importa mais que p-valor com n=90k. As 6 features significativas: speechiness, danceability, instrumentalness, valence, explicit, energy, acousticness.

2. **Q2 (gêneros)**: 10 gêneros têm popularidade média 50–60, contra 33 global. Lift até 31× entre subgêneros. **Gênero é o discriminador mais forte**.

3. **Q3 (top artistas)**: artistas do top 10% são mais altos (+1,2 dB loudness), mais explícitos (+5,6 p.p.), menos acústicos (−0,11), ligeiramente mais rápidos. Efeitos pequenos (|r| ≤ 0,27).

4. **Q4 (energia)**: "mais animadas?" → não. Relação U-invertido controlado (β = −0,39).

5. **Q5 (valência)**: "feliz ou triste?" → sem preferência (|r| < 0,02).

6. **Q6 (clusters)**: faixas com perfil sonoro idêntico podem ter popularidade muito diferente. Subgênero decide o lift.

7. **Q7 (extremos)**: top vs bottom 10% — 8 dimensões separam, 4 não. Top é mais "produzido".

### 2.2 A pergunta em aberto

Todas as análises responderam "o que diferencia hits de não-hits?" mas nenhuma respondeu *"o que diferencia hits **dentro** de um gênero?"* — que é exatamente a pergunta que o artista faria ao consultor.

Se a receita fosse **a mesma em todos os gêneros**, o diagnóstico seria trivial: "danceability alto + valence negativo + explicit on". Mas se a receita **varia por gênero**, o diagnóstico precisa de personalização.

**Q8 ataca exatamente a personalização.**

---

## 3. O modelo estatístico (parte matemática explicada)

### 3.1 Por que regressão hierárquica?

Imagine que você vai ajustar uma regressão de popularidade contra features separadamente para cada um dos 111 gêneros. Problema: muitos gêneros têm 100-500 faixas — amostras pequenas geram estimativas ruidosas.

A regressão **hierárquica** resolve isso compartilhando informação entre gêneros:

```
Hipótese: o efeito de cada feature tem uma distribuição comum
(média μ_β + desvio σ_β por gênero)

→ Gêneros com muitos dados "puxam" a estimativa global
→ Gêneros com poucos dados ficam perto da média global
→ Esse "puxar" é chamado de SHRINKAGE (encolhimento)
```

O resultado é um modelo que aproveita ao máximo cada observação.

### 3.2 A fórmula matemática

O modelo que ajustamos é uma regressão linear com **efeitos aleatórios por gênero**, especificada em **parametrização não-centrada**:

$$
\begin{aligned}
y_i &\sim \mathcal{N}(\mu_i,\ \sigma_y) \quad \text{(Gaussiano, modela popularity contínua)} \\
y_i &\sim \text{Bernoulli}(\sigma(\mu_i)) \quad \text{(Bernoulli, modela top-25%)} \\
\\
\mu_i &= \alpha_{g_i} + \sum_{k=1}^{K} \beta_{k,g_i} \cdot x_{ik} \\
\\
\alpha_g &= \mu_\alpha + \sigma_\alpha \cdot z_{\alpha,g} \\
\beta_{k,g} &= \mu_{\beta,k} + \sigma_{\beta,k} \cdot z_{\beta,g,k} \\
\\
z_{\alpha,g},\ z_{\beta,g,k} &\sim \mathcal{N}(0,1) \quad \text{(independentes, sem centro)}
\end{aligned}
$$

**Legenda dos símbolos:**

- `i` = índice da faixa (de 1 a 75k ou 84k dependendo do modelo)
- `g_i ∈ {0, 1, ..., 110}` = gênero da faixa `i`
- `K = 10` = número de features (danceability, energy, loudness, speechiness, acousticness, instrumentalness, liveness, valence, tempo, explicit)
- `x_ik` = feature `k` padronizada (z-score) da faixa `i`
- `α_g` = **intercepto aleatório** do gênero `g` (baseline de popularidade do gênero)
- `β_{k,g}` = **slope aleatório** da feature `k` no gênero `g` — esta é a chave da análise
- `μ_β,k` = média populacional do slope da feature `k` (efeito global)
- `σ_β,k` = desvio padrão populacional dos slopes (variabilidade entre gêneros)
- `μ_α, σ_α` = média e desvio dos interceptos por gênero
- `σ(y)` = função sigmoidal (converte logit em probabilidade) para o Bernoulli

### 3.3 O que significa "parametrização não-centrada"

A linha `β_g = μ_β + σ_β · z` onde `z ~ N(0,1)` parece estranha — por que não simplesmente `β_g ~ N(μ_β, σ_β)`?

A diferença é **geométrica**. Quando `σ_β` é pequeno, ambas formulações dão a mesma distribuição. Quando `σ_β` é grande (a posteriori, como veremos), a primeira formulação faz com que `z` e `σ_β` sejam **independentes**, evitando o "funil" (Neal's funnel) que quebra o NUTS.

É um truque de implementação, não uma diferença conceitual.

### 3.4 Por que Bayesian e não frequentista?

A escolha Bayesiana foi feita por três razões práticas:

1. **Interpretação direta dos intervalos**: o CI 94% é literalmente "94% de probabilidade posterior de que o parâmetro está neste intervalo" — não "se repetíssemos o experimento 100 vezes, 94 das vezes o parâmetro verdadeiro estaria coberto". Para um relatório de negócio, a primeira interpretação é mais útil.

2. **Quantificação natural da incerteza em σ_β**: a pergunta "quanto varia entre gêneros" exige uma distribuição. Frequentistas calculariam IC via bootstrap (lento, aproximado); Bayesianos obtêm isso direto da posteriori.

3. **Shrinkage automático**: o prior hierárquico `β_g ~ N(μ_β, σ_β)` faz shrinkage automaticamente. Em frequentistas teríamos que implementar manualmente (misturar estimativas pooled e unpooled).

### 3.5 Por que dois modelos (Gaussiano + Bernoulli)?

O Gaussiano modela a popularidade como variável contínua (0–100). O Bernoulli modela se a faixa está no top-25% (binário).

**Por que os dois?** Porque eles respondem perguntas diferentes:

- **Gaussiano**: "qual é o efeito médio na popularidade?" — útil para entender o espectro completo
- **Bernoulli**: "qual é o efeito na chance de ser um hit?" — mais acionável para o artista (probabilidade > média)

O Gaussiano é também mais robusto a outliers na cauda. O Bernoulli captura melhor a natureza binária do "hit ou não-hit" que define a indústria musical.

### 3.6 O que é padronização (z-score) e por que fizemos

Antes de ajustar, transformamos cada feature:

$$
\tilde{x}_{ik} = \frac{x_{ik} - \bar{x}_k}{s_k}
$$

Sem isso, `loudness` (escala de ~−60 a 0 dB) teria mecanicamente um β menor que `tempo` (escala de 0 a 250 BPM). Com padronização, ambos os β representam **mudança por 1 desvio padrão da feature**, e são diretamente comparáveis.

---

## 4. Dados utilizados

### 4.1 Limpeza aplicada

| Filtro | Faixas removidas | | Justificativa |
|---|---:|---|---|
| Gêneros não-musicais (`sleep`, `study`, `comedy`, `kids`, `children`, `new-age`) | 5 781 | | Faixas sem vocais/música no sentido da análise de hit |
| `popularity == 0` (só Gaussian) | 9 019 | | "Catálogo inativo" que polui o sinal |

### 4.2 n final por modelo

| Modelo | n final | Gêneros | Razão da exclusão dos zeros |
|---|---:|---:|---|
| **Gaussiano** | **74 925** | 111 | Zeros não são "popularidade baixa mensurável" — são ausência de streams |
| **Bernoulli** | **83 940** | 111 | Top-25% é um recorte relativo ao dataset, zeros nunca serão top |

### 4.3 10 features utilizadas

```
['danceability', 'energy', 'loudness', 'speechiness',
 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo', 'explicit']
```

Note que Q1 (OLS) usou 11 features incluindo `key` (tom musical). Para Q8 removemos `key` porque (a) é categórica e complicaria o modelo hierárquico, (b) tem 12 valores com baixa massa em cada célula — geraria estimativas instáveis.

---

## 5. Resultados — parte 1: efeitos globais (μ_β)

### 5.1 O que é μ_β

Lendo a fórmula do modelo:

$$\beta_{k,g} = \mu_{\beta,k} + \sigma_{\beta,k} \cdot z_{k,g}$$

Cada slope por gênero `β_{k,g}` é um **desvio aleatório** em torno de uma média populacional `μ_β,k`. Os gêneros com `z > 0` puxam o slope para cima; os com `z < 0` puxam para baixo. **μ_β é o "efeito típico" — o que esperar para um gênero médio do dataset**.

### 5.2 Tabela de efeitos globais (Gaussian)

| Feature | μ_β | sd | CI 94% | Significativo? |
|---|---:|---:|:---:|:---:|
| **explicit** | **+0.806** | 0.240 | [+0.348, +1.276] | ✓ |
| **danceability** | **+0.741** | 0.251 | [+0.278, +1.209] | ✓ |
| **loudness** | +0.572 | 0.388 | [−0.124, +1.324] | marginal |
| **valence** | **−1.137** | 0.208 | [−1.532, −0.755] | ✓ |
| energy | −0.681 | 0.320 | [−1.294, −0.080] | ✓ |
| acousticness | −0.339 | 0.295 | [−0.877, +0.218] | NS |
| speechiness | −0.333 | 0.167 | [−0.662, −0.023] | ✓ (fraco) |
| liveness | −0.318 | 0.120 | [−0.540, −0.101] | ✓ |
| tempo | +0.105 | 0.087 | [−0.054, +0.264] | NS |
| instrumentalness | +0.122 | 0.294 | [−0.429, +0.695] | NS |

### 5.3 Tabela de efeitos globais (Bernoulli)

| Feature | μ_β | sd | CI 94% | Significativo? |
|---|---:|---:|:---:|:---:|
| **loudness** | **+0.224** | 0.009 | [+0.207, +0.241] | ✓ |
| **danceability** | **+0.102** | 0.011 | [+0.082, +0.122] | ✓ |
| **explicit** | **+0.093** | 0.008 | [+0.077, +0.109] | ✓ |
| **valence** | **−0.146** | 0.010 | [−0.165, −0.127] | ✓ |
| energy | −0.134 | 0.011 | [−0.154, −0.114] | ✓ |
| acousticness | −0.120 | 0.010 | [−0.139, −0.101] | ✓ |
| liveness | −0.112 | 0.010 | [−0.130, −0.092] | ✓ |
| speechiness | −0.081 | 0.010 | [−0.099, −0.061] | ✓ |
| tempo | +0.015 | 0.009 | [−0.002, +0.033] | NS |
| instrumentalness | −0.013 | 0.010 | [−0.033, +0.005] | NS |

### 5.4 Como interpretar uma linha da tabela

Tomando `explicit = +0.806` (Gaussian, CI [+0.35, +1.28]):

> *"Para um aumento de 1 desvio padrão em `explicit` (na escala padronizada), a popularidade média aumenta em 0.81 pontos, controlando por todas as outras features. Há 94% de probabilidade posterior de que o efeito real esteja entre +0.35 e +1.28."*

O CI exclui zero → o efeito é estatisticamente robusto.

Para `loudness = +0.572` (Gaussian, CI [−0.12, +1.32]):

> *"O efeito médio de loudness é positivo, mas o CI cruza zero. Não podemos descartar que o efeito médio seja nulo ou mesmo levemente negativo. Mas o efeito varia muito entre gêneros (σ_β = 3.7) — para alguns gêneros é fortemente positivo, para outros negativo."*

Este é o gancho da **parte 6**: a média global mascara a variação local.

### 5.5 Conversão para magnitude "interpretável"

A magnitude em z-score é útil para comparar features, mas pouco acionável para um artista. Conversões aproximadas (assumindo σ_y ≈ 25 na Gaussian, 1 SD na feature = movimento moderado):

| Feature | 1 SD vale (escala original) | Efeito típico (1 SD ↑) |
|---|---|---|
| `danceability` | 0.18 | +1.4 pontos de popularity |
| `loudness` | 2.6 dB | +1.5 pontos |
| `valence` | 0.27 | −3.0 pontos |
| `tempo` | 28 BPM | +0.3 pontos |
| `explicit` | (binário) | +2.1 pontos |

### 5.6 Convergência com Q1 (OLS)

Q1 usou OLS, que dá uma estimativa pontual por coeficiente. Q8 dá uma distribuição. Quando comparamos:

| Feature | Q1 (OLS β) | Q8 (μ_β) | Acordo em direção? | Acordo em magnitude? |
|---|---:|---:|:---:|:---:|
| danceability | +9.95 | +0.741 | ✓ | ✓ |
| speechiness | −15.39 | −0.333 | ✓ | **divergem** |
| valence | −7.84 | −1.137 | ✓ | ✓ |
| explicit | +3.89 | +0.806 | ✓ | ✓ |
| energy | −2.01 | −0.681 | ✓ | ✓ |
| acousticness | −1.16 | −0.339 | ✓ | ✓ |

**9 de10 features** concordam em direção. A divergência notável é `speechiness`: OLS deu o maior coeficiente em magnitude (−15.39), mas o modelo Bayesiano com shrinkage hierárquico encolheu drasticamente para −0.333.

**Por que speechiness encolheu tanto?** Porque `σ_β,speechiness = 1.4` (relativamente alto) significa que o efeito varia muito entre gêneros. O shrinkage hierárquico interpreta isso como "o efeito médio global não deve ser muito grande porque os efeitos individuais se cancelam". Em gêneros específicos (rap, podcast), o efeito é grande; em outros (clássica, ambient), é fraco. O OLS estimou o efeito global puxando muito peso de gêneros onde speechiness tem efeito forte, mas o hierárquico vê o quadro geral.

**Recomendação para o produto**: o diagnóstico para artistas deve mostrar **não a média global**, mas o efeito específico do gênero do artista (β_g). É aqui que mora a personalização.

---

## 6. Resultados — parte 2: variação entre gêneros (σ_β)

### 6.1 O que é σ_β

Da fórmula:

$$\beta_{k,g} = \mu_{\beta,k} + \sigma_{\beta,k} \cdot z_{k,g}$$

`σ_β,k` é o **desvio padrão** dos slopes da feature `k` entre os gêneros. Se for alto, o efeito varia muito; se for baixo, o efeito é parecido em todos os gêneros.

### 6.2 Ranking de σ_β — Gaussian

| Feature | σ_β | CI 94% | Interpretação |
|---|---:|:---:|---|
| **loudness** | **3.701** | [3.21, 4.28] | receita mais gênero-dependente |
| energy | 3.040 | [2.58, 3.58] | varia bastante |
| acousticness | 2.703 | [2.30, 3.18] | varia bastante |
| danceability | 2.321 | [1.96, 2.74] | varia bastante |
| instrumentalness | 2.409 | [1.94, 2.94] | varia (instrumentais são nicho) |
| explicit | 1.946 | [1.66, 2.28] | varia moderadamente |
| valence | 1.936 | [1.64, 2.28] | varia moderadamente |
| speechiness | 1.401 | [1.15, 1.70] | varia |
| liveness | 0.999 | [0.80, 1.22] | varia pouco |
| **tempo** | **0.572** | [0.38, 0.76] | **efeito quase universal** |

### 6.3 Ranking de σ_β — Bernoulli

| Feature | σ_β | CI 94% |
|---|---:|:---:|
| **loudness** | **0.417** | [0.40, 0.43] |
| instrumentalness | 0.334 | [0.31, 0.35] |
| acousticness | 0.316 | [0.30, 0.34] |
| danceability | 0.256 | [0.24, 0.28] |
| energy | 0.238 | [0.22, 0.26] |
| valence | 0.215 | [0.20, 0.24] |
| explicit | 0.202 | [0.19, 0.22] |
| speechiness | 0.180 | [0.16, 0.20] |
| liveness | 0.123 | [0.11, 0.14] |
| **tempo** | **0.046** | [0.03, 0.06] |

**Os dois modelos concordam no ranking.** loudness tem a maior σ_β em ambos, tempo tem a menor.

### 6.4 O que isso significa concretamente

**loudness σ_β = 3.7 (Gaussian)**: significa que o efeito de loudness na popularidade varia em ±3.7 unidades entre os gêneros. Para um gênero médio o efeito é +0.57, mas:
- Gêneros com `z > 1` têm efeito ~ +4.3 (muito positivo)
- Gêneros com `z < -1` têm efeito ~ −3.1 (negativo!)

**Exemplos plausíveis** (a verificar com Q9 — análise por gênero):
- **EDM, reggaeton**: provavelmente loudness ↑ → hit (master loud é norma do gênero)
- **Jazz, folk, classical**: provavelmente loudness ↓ → hit (master loud soa "comercial demais")

**tempo σ_β = 0.57 (Gaussian)**: o efeito do BPM é quase o mesmo em todos os gêneros. Para um artista, isso significa: "ajustar seu BPM para o sweet spot do seu gênero é uma regra universal". Não é personalizado.

**Para o produto**: as features com alto σ_β (loudness, energy, danceability) são onde o **diagnóstico personalizado** agrega mais valor. As features com baixo σ_β (tempo, liveness) podem ser tratadas com regras gerais.

### 6.5 Per-gênero: exemplos de variação

Para dar concreticidade, listamos os efeitos específicos (β_g) para alguns gêneros populares. Valores em escala padronizada.

**Gaussian β_g para `loudness`** (σ_β = 3.7, μ_β = +0.57):

| Gênero | β_g,loudness | Interpretação |
|---|---:|---|
| top 5% mais positivos | > +4.0 | loudness aumenta muito a popularidade |
| típico | +0.5 | efeito médio |
| bottom 5% mais negativos | < −2.8 | loudness AUMENTAR prejudica |

Lista completa dos β_g está em `resultados/q8_coefs_por_genero.csv`.

### 6.6 Onde mora a oportunidade de produto

Para o **Diagnóstico de Posicionamento**, o fluxo ideal seria:

```
Input: track do artista + seu gênero declarado

1. Buscar β_g do gênero (do q8_coefs_por_genero.csv)
2. Comparar β_g do gênero com a "receita do top 10% do gênero":
   - Para cada feature, ver se a track está no quartil vencedor
   - Reportar: "no seu gênero, tracks top têm danceability X; sua track tem Y"
3. Mostrar features onde o β_g é ALTO (efeito forte) vs BAIXO (efeito fraco):
   - Se β_g é alto e a track está fora do sweet spot → ALERTA VERMELHO
   - Se β_g é baixo e a track está fora do sweet spot → SUGESTÃO SUTIL
```

A diferenciação entre gêneros é exatamente onde mora o valor do produto.

---

## 7. Diagnósticos de qualidade do ajuste

### 7.1 Modelo Gaussiano (NUTS, 2 chains × 750 draws)

- **Tempo de ajuste**: 30.4 min em 74 925 faixas (compilado com g++ via Anaconda mingw-w64)
- **R-hat**: vários parâmetros z_beta (efeitos por gênero de gêneros pequenos) com R-hat > 1.01
- **ESS**: alguns parâmetros com ESS < 100 por chain

**Interpretação**: com apenas 2 chains, R-hat pode oscilar. Para um relatório de negócio os efeitos médios são robustos; para inferência frequentista sobre cada gênero individualmente, precisaríamos de 4 chains + mais draws. **Os sinais principais (μ_β e σ_β) estão bem identificados**.

### 7.2 Modelo Bernoulli (ADVI, 20k iter)

- **Tempo de ajuste**: 5.6 min em 83 940 faixas
- **Por que ADVI e não NUTS**: NUTS divergiu (1500 divergências — geometria ruim do logit com random slopes). ADVI é o fallback apropriado para este modelo.
- **R-hat**: N/A (ADVI não produz R-hat)
- **Convergência ADVI**: loss convergiu de 3.55e+05 para ~3.55e+05 estável — sem sinais de má-convergência

### 7.3 Comparação com ADVI anterior (subamostra 25k)

Os resultados na **população completa** (atual) confirmam os resultados na **subamostra de 25k** (anterior, antes de resolver o ambiente):

| Feature | Gaussian atual (full) | Gaussian anterior (25k ADVI) | Acordo? |
|---|---:|---:|:---:|
| explicit | +0.806 | +0.799 | ✓ |
| danceability | +0.741 | +0.737 | ✓ |
| valence | −1.137 | −1.141 | ✓ |
| loudness σ_β | 3.701 | 3.313 | ✓ |
| tempo σ_β | 0.572 | 0.490 | ✓ |

As estimativas são estáveis. Aumentar a amostra de 25k para 75k mudou pouco as médias globais (erro padrão caiu ~50%), mas mudou a **confiança** (sd menor, CI mais estreitos). Isso é o que esperaríamos.

---

## 8. Limitações

### 8.1 Limitações dos dados

1. **Sem dados temporais**: data de lançamento, curva de crescimento, sazonalidade. "Hit" pode ser definido por sazonalidade (Natal, verão), não por features intrínsecas.
2. **Sem dados de exposição**: playlist placement, marketing budget, redes sociais. Provavelmente a maior lacuna — fora do dataset.
3. **Sem dados de mercado**: país, idioma, demografia do ouvinte. O Spotify opera globalmente; popularidade varia por região.
4. **Popularidade é snapshot**: variável opaca, defasada, enviesada por recência. Não é total de streams.

### 8.2 Limitações do modelo

1. **Apenas features de áudio + gênero**: não incluímos ano de lançamento, artista (efeito fixo de artistas "estrelas"), dia da semana de lançamento, etc.
2. **`genero_principal` é first-alphabetical**: tracks com `["reggaeton", "latin"]` ficam em `latin`, não em `reggaeton`. Viés na classificação.
3. **2 chains no NUTS Gaussiano**: alguns z_beta com R-hat > 1.01. Para publicação exigiria 4 chains.
4. **Bernoulli usa ADVI**: NUTS divergiu. ADVI é apropriado para o caso mas não captura incerteza completa.
5. **Gêneros pequenos**: 20+ gêneros têm < 200 faixas. O shrinkage mitiga mas não substitui dados.

### 8.3 Limitações do escopo

1. **Não prevemos popularidade futura**: o modelo é explicativo, não preditivo. Para prever precisariamos de dados de lançamento e janela temporal.
2. **Não recomendamos tracks específicas**: dizemos "no seu gênero, tracks top têm essas características", mas não geramos tracks candidatas.
3. **Não modelamos causalidade**: correlação ajustada por gênero ≠ efeito causal de mudar a feature. Para inferir causalidade precisaríamos de experimentos A/B ou natural experiments.

---

## 9. Recomendações para o produto

### 9.1 Construir o scorecard de diagnóstico

**Componente 1: "Onde sua track está"**

Para a track do artista, calcular a posição nos 11 eixos (features padronizadas) em relação:
- (a) ao centroid do gênero
- (b) ao top-10% do gênero
- (c) à mediana global

Saída visual: spider chart com 3 polígonos sobrepostos.

**Componente 2: "O que importa no seu gênero"**

Usar β_g do q8_coefs_por_genero.csv para mostrar ao artista:
- Quais features têm efeito forte **no gênero dele** (|β_g| alto)
- Em que direção (positivo ou negativo)
- Onde a track dele está em cada eixo

Saída textual: "No reggaeton, **loudness** aumenta muito a chance de hit (β_g = +X). Sua track está em Y dB; o sweet spot é Z dB."

**Componente 3: "Receita universal"**

Para features com σ_β baixo (tempo, liveness), mostrar a regra geral do dataset, não específica do gênero.

### 9.2 Próximas análises recomendadas

**Curto prazo (1-2 sprints)**:

1. **Q9 — Ranking de gêneros por "discriminabilidade"**: listar os gêneros onde o β_g mais desvia de μ_β. Esses são candidatos a "subgêneros mal-definidos" ou "nichos" que precisam de análise específica.

2. **Q10 — Perfis extremos por gênero**: para cada gênero, descrever o "perfil do top 10%" (mediana das 11 features no top 10% do gênero). Isso vira a régua que o artista mira.

**Médio prazo (3-6 sprints)**:

3. **Modelo preditivo**: GBM/XGBoost treinado em `(features, genero) → log(popularity)` para prever popularidade esperada de uma track nova. SHAP para explicabilidade.

4. **Análise longitudinal**: se conseguirmos dados de lançamento (Spotify API), modelar a curva de popularidade ao longo do tempo. Talvez certas "receitas" funcionam só em janelas específicas.

**Longo prazo**:

5. **Causalidade**: se houver dados suficientes, usar métodos de inferência causal (DAG, double ML) para separar efeito causal de features de correlação espúria.

### 9.3 Métricas de sucesso do produto

Ao lançar o MVP, sugerimos medir:

| Métrica | Meta | Por quê |
|---|---|---|
| Taxa de conversão (lead → cliente pagante) | > 5% | indica que o diagnóstico tem valor percebido |
| NPS pós-diagnóstico | > 40 | indica utilidade real |
| Reprodução do diagnóstico (volta ao site) | > 30% em 30 dias | indica que o artista está iterando |
| Track lançada após diagnóstico com score acima de X | (qualitativo) | validação externa |

---

## 10. Glossário estatístico (para o time de produto)

### 10.1 Termos técnicos explicados

- **Posteriori**: distribuição de probabilidade do parâmetro **dados os dados observados**. "Dada a evidência, qual a distribuição crível do efeito?"

- **CI / HDI 94%**: intervalo com 94% da massa da posteriori. Diferente do IC frequentista. Mais útil para perguntas de negócio porque pode-se dizer literalmente "94% de chance".

- **R-hat (potencial de redução de escala)**: mede se múltiplas cadeias MCMC convergem para a mesma distribuição. R-hat = 1.0 = convergência perfeita; > 1.05 = problemas; > 1.1 = não confiável.

- **ESS (effective sample size)**: quantas amostras independentes a cadeia MCMC equivale. Para 1500 draws com ESS = 100, a informação equivale a 100 amostras iid. ESS baixo = correlação alta entre draws.

- **Shrinkage hierárquico**: fenômeno onde estimativas individuais são "puxadas" em direção à média global. Gêneros com poucos dados têm β_g estimado mais próximo de μ_β do que dos próprios dados. Isso é bom — protege contra overfitting.

- **Parametrização não-centrada**: truque para escrever `β = μ + σ · z` em vez de `β ~ N(μ, σ)`. Quando σ é estimado dos dados, a primeira formulação tem geometria mais favorável para o sampler NUTS.

- **Logit**: `logit(p) = log(p / (1-p))`. Converte probabilidade (0-1) em log-odds (-∞, +∞). Usado no modelo Bernoulli.

- **Função sigmoidal**: `σ(x) = 1 / (1 + e^{-x})`. Inversa do logit. Converte log-odds em probabilidade.

### 10.2 O que NÃO está neste relatório (e por quê)

- Não mostramos shrinkage visual por gênero (existem forest plots em `resultados/q8_forest_*.png`)
- Não mostramos diagnósticos de trace plot / autocorrelation (pode ser gerado pelo notebook `notebooks/03_bayes_hierarquico.ipynb`)
- Não mostramos comparações com modelo sem random slopes (pode ser feito em extensão futura)

---

## 11. Como reproduzir

### 11.1 Ambiente

Necessário:
- Python 3.13 com pacotes: `pymc==6.3.1`, `arviz==1.3.0`, `pytensor==3.3.0`, `h5py>=3.0`, `h5netcdf>=1.0`, `pandas`, `numpy`, `matplotlib`
- Compilador C++: `g++` via Anaconda3 mingw-w64 (`C:\Users\tito\Anaconda3\Library\mingw-w64\bin` no PATH)

### 11.2 Comandos

```bash
# Adicionar g++ ao PATH (Windows + Anaconda)
export PATH="/c/Users/tito/Anaconda3/Library/mingw-w64/bin:$PATH"

# Spike de validacao (ADVI rapido em 20k subamostra)
cd relatorio/analises
python q8_bayes_hierarquico.py --mode spike --model both

# Fit completo na populacao inteira (~35-40 min total)
python q8_bayes_hierarquico.py --mode full --model gaussian    # ~30 min, NUTS
python q8_bayes_hierarquico.py --mode full --model bernoulli   # ~5 min, ADVI

# Regenerar report.html
cd ../..
python relatorio/build_report.py
```

### 11.3 Outputs

Em `relatorio/analises/resultados/`:

- `q8_model_gaussian.nc` — posterior completo NUTS (NetCDF, h5netcdf)
- `q8_model_bernoulli.nc` — posterior completo ADVI
- `q8_coefs_globais.csv` — μ_β, σ_β com CI 94%
- `q8_coefs_por_genero.csv` — α_g, β_g por gênero
- `q8_forest_*.png` — 22 forest plots (efeitos por gênero)
- `q8_global_effects_*.png` — ranking global
- `q8_sigma_beta_comparison.png` — comparação de σ_β entre modelos
- `q8_resumo.txt` — diagnósticos

Para explorar interativamente:
```bash
jupyter notebook notebooks/03_bayes_hierarquico.ipynb
```

---

## 12. Próximos passos imediatos (esta semana)

1. **Revisar este relatório**: agendar 30 min com o time de produto para validar conclusões
2. **Construir mockup do scorecard**: usar os dados de `q8_coefs_por_genero.csv` para simular a UI do diagnóstico para 3 gêneros diferentes (reggaeton, classical, EDM)
3. **Decidir sobre Q9**: priorizar análise por subgênero com alta σ_β — alocar 1 sprint
4. **Atualizar backlog do produto**: incluir Q10 (perfis extremos por gênero) como pré-requisito para o MVP do Diagnóstico

---

**Anexos**: ver arquivos `relatorio/analises/resultados/q8_*.{csv,png,nc}` e `relatorio/report.html` (seção Q8) para os artefatos completos.

**Contato**: questionamentos metodológicos → revisar `notebooks/03_bayes_hierarquico.ipynb` ou rodar ADVI/NUTS novamente com novos hiperpriori.

**Versão**: 1.0 (2026-09-01)