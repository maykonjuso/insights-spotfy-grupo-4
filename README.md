# insights-spotfy-grupo-4

Análise de faixas do Spotify (114.000 registros, 114 gêneros, com features de áudio).

## Estrutura

```
dataset2(in).csv                       # dados brutos (entrada)
notebooks/01_limpeza_dataset.ipynb     # diagnóstico, limpeza e geração do dataset
notebooks/02_eda_limpo.ipynb           # análise exploratória de dados aprofundada
notebooks/build_eda.py                 # script gerador do notebook 02
notebooks/Challenge_0_Spotify_Data_G4.ipynb  # notebook final do desafio
data/processed/                        # saídas geradas (não versionadas)
relatorio/                             # relatório HTML + scripts + gráficos
  report.html                          # relatório visual compilado (abrir no navegador)
  gen_charts.py                        # gera os 9 gráficos a partir do parquet limpo
  build_report.py                      # monta o HTML embedando os gráficos
  charts/                              # PNGs usados no relatório
  analysis_q*.py / analise_q*.py       # scripts por pergunta (Q2, Q3, Q5, Q6, Q7)
  q3_*.csv                             # tabelas auxiliares (artistas P90/P10, testes)
```

## Como rodar

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

Abrir `relatorio/report.html` em qualquer navegador moderno (light/dark toggle no canto
superior direito).
