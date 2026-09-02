# PR Description — Q8: Modelo hierárquico Bayesiano

## O que esta PR entrega

Adiciona a **Q8 — "A receita varia por gênero?"** ao relatório, respondendo
com um modelo hierárquico Bayesiano (PyMC) a pergunta que o report original
deixava em aberto: *"efeitos são universais ou específicos de gênero?"*.

### Pipeline

1. **Limpeza de dados**: 89 740 → 74 925 (Gaussian) / 83 959 (Bernoulli) faixas
   - Remove gêneros não-musicais: `sleep`, `study`, `comedy`, `kids`,
     `children`, `new-age` (5 781 faixas onde esses aparecem em qualquer slot
     da lista `generos`)
   - Gaussian: também remove `popularity == 0` (9 019 faixas, "catálogo inativo")
   - Restam **111 gêneros**

2. **Modelagem** (`relatorio/analises/q8_bayes_hierarquico.py`):
   - **M1 Gaussiano**: `popularity ~ α[genero] + β[genero]·x`
   - **M2 Bernoulli**: `top25 ~ α[genero] + β[genero]·x`
   - **Random intercepts + random slopes por gênero** (não-centrado)
   - Hiperpriori fracamente informativos: `μ_α ~ N(0, 10)`, `μ_β ~ N(0, 2.5)`,
     `σ_α, σ_β ~ HalfNormal(2.5/10)`, `σ_y ~ HalfNormal(20)` (Gaussian)
   - Spike ADVI em 20k para validar pipeline
   - NUTS final em **subamostra de 25k** (limitação Windows sem g++;
     shrinkage hierárquico mitiga perda)
   - 4 chains × 1000 draws × 1000 tune, target_accept=0.95

3. **Artefatos salvos em `relatorio/analises/resultados/`**:
   - `q8_model_gaussian.nc`, `q8_model_bernoulli.nc` — posteriors NetCDF
   - `q8_coefs_globais.csv`, `q8_coefs_por_genero.csv` — efeitos com HDI 94%
   - `q8_global_effects_*.png` — ranking de μ_β por modelo
   - `q8_sigma_beta_comparison.png` — variabilidade entre gêneros
   - `q8_forest_top_*.png` — feature mais variável por modelo (forest plot)
   - `q8_forest_<model>_<feature>.png` — 11 forest plots detalhados
   - `q8_resumo.txt` — log de fit + diagnósticos (R-hat, ESS)

4. **Integração no report** (`relatorio/build_report.py`):
   - Seção Q8 entre Q7 e Synthesis (TOC atualizado: 8 perguntas)
   - Charts globais (μ_β com HDI) + σ_β comparando modelos
   - Forest plots da feature mais variável em cada modelo
   - Tabela-resumo da síntese inclui linha Q8
   - **Graceful fallback**: se os artefatos não existirem, mostra placeholder
     com instrução de como rodar (`python q8_bayes_hierarquico.py --mode full`)

5. **Notebook exploratório** (`notebooks/03_bayes_hierarquico.ipynb`):
   - Carrega `.nc` e CSVs salvos (não re-fita)
   - Lista artefatos disponíveis
   - Mostra `az.summary()` dos hiperpriori

### Achados esperados (premissas a validar)

- **μ_β global** deve alinhar com os coefs OLS de Q1 — convergência entre
  métodos frequentista e Bayesiano.
- **σ_β** maior para `loudness`/`danceability` (efeitos de produção variam
  mais por gênero) e menor para `tempo` (efeito mais universal).
- Top-25% (Bernoulli) provavelmente mais discriminante que popularity
  contínua (Gaussian) por eliminar a cauda longa dos zeros.

### Limitacoes conhecidas (documentadas na secao)

- **Subsample 25k** em vez de 90k: Windows sem g++ torna NUTS completo
  inviavel (gradiente puro-Python por ~10s cada).
- **2 chains** inicialmente (substituído por 4 nesta versao para rhat
  robusto — primeira run teve warning de rhat > 1.01 com 2 chains).
- **Sem compilacao C**: ESS pode ficar abaixo do ideal; ESS por chain < 100
  para alguns parametros z_beta de generos pequenos.

### Como rodar

```bash
# Apenas ADVI spike (validacao, ~30s por modelo)
python relatorio/analises/q8_bayes_hierarquico.py --mode spike --model both

# NUTS completo em subamostra 25k (~20-40 min total)
python relatorio/analises/q8_bayes_hierarquico.py --mode full --model both

# Regenerar report.html com Q8 embutida
python relatorio/build_report.py
```

### Mudancas vs report anterior

| Antes | Depois |
|---|---|
| 7 perguntas respondidas | **8 perguntas** |
| Sem modelagem Bayesiana | Hierarquico MCMC (Gaussian + Bernoulli) |
| `n=89 740` analise | **74 925** (Gaussian) / 83 959 (Bernoulli) apos limpeza |
| Apenas coefs globais (OLS) | **Efeitos por genero com shrinkage** |
| Sem incerteza nos coefs | **HDI 94%** (posterior intervals) |

### Checklist

- [x] Branch `feature/bayes-hierarchical-popularity` a partir de `origin/main`
- [x] Commit unico com script + integracao
- [x] Commentarios inline nos pontos de decisao (cleanup de generos,
      subsample, hiperpriori)
- [ ] Run final do NUTS + commit dos artefatos gerados
- [ ] PR review com comentarios nas escolhas metodologicas