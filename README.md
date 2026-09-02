# insights-spotfy-grupo-4

Análise de faixas do Spotify (114.000 registros, 114 gêneros, com features de áudio) +
backend de diagnóstico via modelo Bayesiano (Next.js 15).

## Estrutura

```
dataset2(in).csv                       # dados brutos (entrada) — âncora para resolver a raiz
data/processed/                        # saídas do notebook 01 (não versionado)
notebooks/
  Challenge_0_Spotify_Data_G4.ipynb    # EDA preliminar sobre o dataset bruto
  01_limpeza_dataset.ipynb             # diagnóstico, limpeza e consolidação -> data/processed/
  02_eda_limpo.ipynb                   # EDA aprofundada sobre o dataset limpo
  build_eda.py                         # script gerador do notebook 02
relatorio/
  gen_charts.py                        # gera os 9 gráficos a partir do parquet limpo
  build_report.py                      # monta report.html embutindo os gráficos (base64)
  dicionario_dados.csv                 # descrições das colunas (tooltips do relatório)
  report.html                          # relatório visual compilado (abrir no navegador)
  charts/                              # PNGs usados no relatório
  analises/                            # análises estatísticas, uma por pergunta
    q2_generos.py  q3_artistas.py  q4_energia.py
    q5_valencia.py  q6_clusters.py  q7_extremos.py
    resultados/                        # saídas dos scripts (CSV / JSON / TXT / log)

# Backend (diagnóstico via API)
package.json                           # next 15, react 19, openai 4, zod 3
tsconfig.json                          # strict, alias @/*
next.config.ts                         # typescript strict, sem lint no build
.env.local.example                     # template da chave OpenRouter
app/
  layout.tsx                           # <html lang="pt-BR">
  page.tsx                             # landing
  diagnose/page.tsx                    # placeholder da UI
  api/diagnose/route.ts                # POST — score + HDI + explicacao
  api/generos/route.ts                 # GET — lista de gêneros válidos
lib/
  types.ts                             # tipos do modelo + I/O
  artifacts.ts                         # carrega JSONs do disco
  k11Model.ts                          # predição Bayesiana (1000 samples)
  llmExplanation.ts                    # DeepSeek via OpenRouter (PT-BR)
artifacts/                             # esperado em runtime (NÃO versionado se pesado)
  feature_names.json
  genero_cats.json
  scaler.json
  k11_posterior_summary.json
  k11_posterior_samples.json.gz
```

## Como rodar — Análise (Python)

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m jupyter lab        # abrir notebooks/01_limpeza_dataset.ipynb e 02_eda_limpo.ipynb
```

Ou executar sem abrir a interface:

```bash
# 1. Limpeza e preparação dos dados
.venv/bin/python -m jupyter nbconvert --to notebook --execute --inplace \
  notebooks/01_limpeza_dataset.ipynb

# 2. Análise Exploratória (EDA)
.venv/bin/python -m jupyter nbconvert --to notebook --execute --inplace \
  notebooks/02_eda_limpo.ipynb
```

## Como rodar — Backend (Node.js)

```bash
# Pré-requisitos: Node 20+, pasta artifacts/ com os 5 JSONs do modelo
npm install
cp .env.local.example .env.local       # editar e colar OPENROUTER_API_KEY
npm run dev                            # → http://localhost:3000
```

Endpoints:

- `POST /api/diagnose` — recebe features de áudio + gênero, retorna
  `{ score, hdi_94, explicacao, genero, ms_per_call }`.
- `GET /api/generos` — lista os 114 gêneros válidos.

Detalhes do cálculo do score:

1. Z-score nas features contínuas (usa `mean/std` de `scaler.json`); binárias
   (`explicit`, `mode_bin`) entram sem transformação.
2. Para cada um dos **1000 samples** do posterior Bayesiano:
   - `μ_log = α_g + Σ β_gk · x_k_scaled`
   - `y_pred = max(0, min(100, exp(μ_log) − 1))`  (modelo log-linear)
3. Score = média das 1000 predições; HDI 94% = percentis 3 e 97.
4. Explicação: top-3 features por `|β_gk|` (do sample 0) → DeepSeek (OpenRouter)
   devolve 2-3 frases em PT-BR.

## Dataset gerado

`data/processed/spotify_tracks_limpo.csv` (e `.parquet`) — **89.740 faixas × 32 colunas**,
uma linha por `track_id`.

Partindo das 114.000 linhas brutas:

| Etapa | Linhas removidas |
|---|---|
| Registro sem artista/álbum/nome | 1 |
| Duplicatas exatas | 450 |
| Consolidação faixa × gênero → faixa | 23.809 |

A mesma faixa aparecia no CSV bruto em até 9 gêneros diferentes; a consolidação agrega esses
gêneros em `generos` / `n_generos` em vez de descartá-los. Sentinelas do Spotify
(`tempo == 0`, `time_signature ∈ {0,1}`, `duration_ms == 0`) viram `NaN`; `popularity == 0` é
valor legítimo e foi preservado.

Arquivos auxiliares em `data/processed/`:

- `spotify_tracks_genero_long.parquet` — versão limpa no grão faixa × gênero, para análises por gênero
- `dicionario_dados.csv` — descrição de cada coluna do dataset principal
- `log_limpeza.csv` — log de auditoria das etapas de limpeza

## Relatório visual (relatorio/report.html)

Relatório editorial em HTML/CSS auto-contido (sem dependências externas em runtime) com 9
gráficos embutidos. Responde sete perguntas com evidência estatística e limitações
declaradas:

1. Sound features influenciam na popularidade? — R² = 3,5%
2. Quais gêneros têm maior popularidade? — top 10 (k-pop, pop-film, metal, chill…)
3. Características dos artistas mais populares — perfil Top 10% vs Bottom 10%
4. Músicas mais animadas fazem mais sucesso? — U-invertido
5. Público prefere feliz ou triste? — desprezível (|r| < 0,02)
6. Por que artistas com mesmas features não são famosos? — subgênero decide
7. O que extremos de popularidade têm em comum? — valence, n_artistas, liveness

Para regenerar:

```bash
.venv/bin/python relatorio/gen_charts.py    # gera relatorio/charts/*.png
.venv/bin/python relatorio/build_report.py  # recompõe relatorio/report.html
```

As análises estatísticas por pergunta ficam em `relatorio/analises/`. Cada script imprime
o resultado no stdout; `q3_artistas.py`, `q4_energia.py` e `q6_clusters.py` também gravam
tabelas em `relatorio/analises/resultados/`.

```bash
.venv/bin/python relatorio/analises/q2_generos.py
```

Abrir `relatorio/report.html` em qualquer navegador moderno (light/dark toggle no canto
superior direito).