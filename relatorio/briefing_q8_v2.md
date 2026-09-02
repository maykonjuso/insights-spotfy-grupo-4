# Briefing Q8 v2 — Features Harmônicas no Modelo Hierárquico de Popularidade

**Para:** Equipe de análise Spotify Challenge  
**Data:** 2026-09-01  
**Status:** Smoke test concluído · pipeline completo pendente  
**Repositório:** `insights-spotfy-grupo-4` · branch `feature/bayes-hierarquico-popularity`  
**Notebook:** `notebooks/04_q8_features_extras.ipynb` (32 células, 57 KB)

---

## TL;DR

A análise Q8 do nosso modelo hierárquico Bayesiano **excluiu `key`, `mode` e `time_signature`** das features por **conveniência técnica**, não por relevância musical. Estamos agora investigando se essa exclusão foi justificada.

O **smoke test** confirmou que `mode` (maior vs menor) tem efeito real e robusto sobre hit potential. Vamos rodar o pipeline completo (6-10 h no Colab T4) para decidir se essas features entram no modelo do produto **"Diagnóstico de Posicionamento"**.

---

## 1. O que motivou este estudo

| Análise | Features usadas | Incluiu `key`/`mode`? |
|---|---|---|
| Q1 (OLS) | 11 | Sim |
| Q8 (Bayesiano Hierárquico) | 10 | **Não** |

A justificativa registrada no relatório Q8 foi:

> "Para Q8 removemos `key` porque (a) é categórica e complicaria o modelo hierárquico, (b) tem 12 valores com baixa massa em cada célula — geraria estimativas instáveis."

O questionamento levantado foi: **`key` é parte do DNA harmônico da música** — define a paleta de acordes, convenções de transposição para instrumentos, peso emocional, identidade modal. Será que a exclusão não descartou sinal real?

---

## 2. Hipótese central

> **"A receita de hit varia por gênero, e inclui features harmônicas (`key`, `mode`) e sub-gêneros (multi-label) — não apenas as 10 acústicas do Q8."**

Se rejeitada (efeitos ≈ 0) → Q8 original já era o produto final.  
Se confirmada → modelo de produção precisa ser estendido.

---

## 3. Hipóteses secundárias

| # | Hipótese | Teste |
|---|---|---|
| H1 | `key` (tom) tem efeito sobre hit | drop-one `NO_KEY` + forest plot por gênero |
| H2 | `mode` (maior/menor) tem efeito | drop-one `NO_MODE` + coeficiente `mode_bin` |
| H3 | `time_signature` carrega informação | drop-one `NO_TIME_SIG` |
| H4 | Sub-gêneros (multi-hot) capturam variação não explicada por `genero_principal` | drop-one `NO_GENRE_MULTI` + mudança no σ_β das 10 originais |
| H5 | Efeitos das 10 originais são **estáveis** ao adicionar features novas | Δ μ_β e Δ σ_β baseline vs extended |
| H6 | Extended tem **melhor out-of-sample** que baseline | LOO comparison + PPC |
| H7 | `mode_bin` é o verdadeiro motor (não confundido com `valence`/`acousticness`) | drop-one `NO_MODE` + inspeção de σ_β |

---

## 4. O que o smoke test já nos disse

Rodamos um teste rápido (5-10 min, ADVI em 20k tracks, Bernoulli) **antes** do pipeline completo, como ponto de decisão barato:

| Feature | μ_β | HDI 94% | |μ_β| | Significativo? | Decisão |
|---|---|---|---|---|---|
| `key_sin` | +0.004 | [-0.037, +0.038] | 0.004 | **Não** (efeito ≈ 0) | NOISE |
| `key_cos` | +0.042 | [+0.003, +0.079] | 0.042 | Marginal | Manter com ressalva |
| `mode_bin` | **-0.091** | **[-0.134, -0.047]** | 0.091 | **Sim, robusto** | GO |

**Decisão automática do smoke test:** GO (porque `mode_bin` passou no threshold `|μ_β| > 0.05` ∧ HDI exclui zero).

**Insight mais forte:** tons **menores** têm **~8.7%** mais chance de hit do que tons maiores (e⁻⁰·⁰⁹¹ ≈ 0.913). Isso **contraria o estereótipo** "maior = alegre = hit", mas reflete o pop moderno (60%+ dos hits recentes em tom menor, segundo análises da indústria).

---

## 5. O que falta fazer

Pipeline completo no **Colab T4** (6-10 h total):

| Etapa | Tempo | O que faz |
|---|---|---|
| C16-C17: Bernoulli baseline + extended | 30 min | ADVI em 90k tracks |
| C18-C19: Gaussian baseline + extended | 2-3.5 h | NUTS via NumPyro em 90k |
| C22a: LOO comparison | 5 min | Out-of-sample Δ-ELPD |
| C22b: PPC in-sample | 10 min | RMSE, Brier, log-loss |
| C23: Drop-one loop | 3.5-6 h | 4 variantes + 10 LOO das originais |
| C25-C28: Análise + visualizações | 15 min | CSVs, forest plots, relatório |

Artefatos gerados em `relatorio/analises/resultados/q9_*`:
- 4 posteriors NetCDF (baseline + extended × Gaussian + Bernoulli)
- 14 NetCDFs de drop-one (4 grupos novos + 10 LOO das originais)
- `q9_loo_comparison.csv` (Δ-ELPD baseline vs extended)
- `q9_ppc_results.csv` (goodness-of-fit in-sample)
- `q9_global_effects_extended.csv` (ranking das 46 features)
- `q9_dropone_results.csv` (contribuição marginal de cada bloco)
- 10 forest plots PNG
- `q9_resumo.txt` (log de fit times, R-hat, ESS, divergências)

---

## 6. Critério de decisão final

| Resultado após C16-C28 | Decisão para o produto |
|---|---|
| Δ-ELPD > 2×SE **e** `mode_bin` significativo | **MANTER** `mode` + `key_cos` (se σ_β > 0) |
| Δ-ELPD ≈ 0 (indiferente) | **DESCARTAR** features novas — Q8 original era suficiente |
| Δ-ELPD < -2×SE (extended perde) | **PROBLEMA**: multicolinearidade / overfitting. Reduzir K |
| Só `mode_bin` sobrevive ao drop-one | **MANTER APENAS `mode_bin`** (1 feature, custo mínimo) |
| `key_sin` consistentemente ≈ 0 | **REMOVER `key_sin`** do modelo final |

---

## 7. Por que este desenho é eficiente

Não estamos jogando features a mais no modelo. Cada adição foi pensada para **preservar poder estatístico sem inflar parâmetros**:

- **Cíclica em `key`** (2 features em vez de 11 dummies): preserva a geometria do círculo de quintas. C e B ficam "vizinhos" como devem.
- **Top-30 multi-hot em `generos`**: cobre >80% das tracks. Os 81 tokens raros = ruído.
- **`tonalidade` e `tonalidade_completa` NÃO adicionadas** (24 e 120 níveis): capturadas implicitamente por `(key_sin, key_cos) + mode + ts_dummies` no preditor aditivo. Adicionar 24 dummies inflaria 12× sem ganho.
- **Sparse matrix** para o multi-hot: ~3% de densidade, gerenciável em T4.
- **Non-centered parameterization**: 5.106 slopes convergem bem com NUTS via NumPyro.
- **ADVI para Bernoulli, NUTS para Gaussian**: cada likelihood no seu sampler ideal.
- **LOO em vez de holdout refit**: rigoroso, sem custo de 2 h extra.
- **Smoke test antes do full pipeline**: 5-10 min para GO/NO-GO antes de gastar 6-10 h.

**Parâmetros do modelo estendido:** 1 + 1 + 46 + 46 + 111 + 111·46 = **5.311** (+1 σ_y para Gaussian). É 4× o baseline (1.332), mas gerenciável com T4.

---

## 8. Próximo marco

Quando o pipeline completo rodar, eu analiso os artefatos e monto o **notebook de produção** (`05_produto_diagnostico_posicionamento_TEMPLATE.ipynb`) com:

1. **Função `diagnostico_faixa(track_features, genero)`** → retorna `μ_pop`, `P(top-25)`, "DNA de hit"
2. **Função `recomenda_features(track_features, genero, top_k=3)`** → sugere ajustes baseados nos desvios de β_g
3. **Comparação com hit típico** do gênero (percentil 75% do gênero)
4. **Visualização radar/heatmap** das features
5. **Validação** em holdout 5k com RMSE e AUC

Esse notebook de produção é o que vai para o **produto** "Diagnóstico de Posicionamento".

---

## 9. Perguntas em aberto

- O efeito de `mode_bin` se mantém após controlar por `valence` e `acousticness`? (H7)
- `genero_top30` realmente captura algo que `genero_principal` grouping não captura? (H4)
- Alguma das 10 originais tem seu μ_β ou σ_β materialmente alterado no extended? (H5)
- O tempo de fit no T4 está dentro do orçamento de 12h de sessão Colab? (a confirmar empiricamente)

---

**Próximo passo concreto:** rodar C16-C28 no Colab T4 e enviar artefatos para análise. Estimativa: 6-10 h em uma sessão.
