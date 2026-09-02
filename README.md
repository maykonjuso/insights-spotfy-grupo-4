# insights-spotfy-grupo-4

Análise de faixas do Spotify (114.000 registros, 114 gêneros, com features de áudio).

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

As análises estatísticas por pergunta ficam em `relatorio/analises/`. Cada script imprime
o resultado no stdout; `q3_artistas.py`, `q4_energia.py` e `q6_clusters.py` também gravam
tabelas em `relatorio/analises/resultados/`.

```bash
.venv/bin/python relatorio/analises/q2_generos.py
```

Abrir `relatorio/report.html` em qualquer navegador moderno (light/dark toggle no canto
superior direito).

## Aplicação Next (`src/`)

Interface mobile-first que consome a Spotify Web API e roda toda a análise de áudio
dentro do navegador.

```bash
npm install
cp .env.local.example .env.local   # preencher SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
npm run dev                        # http://localhost:3000
```

O que a tela faz:

- **Ouvir a faixa exibida** — o painel de análise embute o player oficial do Spotify (faixa
  inteira para quem está logado, prévia para os demais) e, quando existe prévia de 30 s,
  também um player próprio com barra de progresso.
- **Escanear a faixa do Spotify** — o botão "Escanear áudio da faixa" baixa a prévia pela
  rota `/api/preview/[id]`, decodifica no navegador e devolve gênero, tom, BPM e
  dançabilidade.
- **Enviar músicas para classificação** — arraste um ou vários arquivos (MP3, WAV, M4A,
  OGG, FLAC). Cada faixa é tocada localmente e analisada por inteiro.

### De onde vem o áudio das faixas do Spotify

A API do Spotify parou de preencher `preview_url` para credenciais criadas depois de
nov/2024 — sem isso não há áudio para analisar, só metadados. `src/lib/preview-source.ts`
resolve a prévia em cascata: `preview_url` do Spotify → busca pública do Deezer → busca
pública da Apple, sempre casando artista **e** título normalizados antes de aceitar o
resultado. A rota `/api/preview/[id]` serve esse mp3 na mesma origem (evita CORS) e a
interface só mostra o botão de scan quando o servidor confirma que há áudio; caso
contrário explica que a faixa só pode ser avaliada por metadados.

### Análise de áudio no navegador

Duas engines, cada uma no que faz melhor:

- **Essentia (WebAssembly)** — `essentia.js` roda `RhythmExtractor2013`, `KeyExtractor`,
  `Danceability` e `DynamicComplexity`, os mesmos algoritmos de
  `scripts/classificar_genero.py`, então BPM, tom e dançabilidade da tela batem com o
  pipeline offline. O binário é copiado de `node_modules` para `public/essentia/` no
  `prebuild`/`predev`.
- **Classificador de gênero próprio** — `src/lib/audio-features.ts` extrai 70 descritores
  por janela de 30 s (20 MFCC média/desvio, 12 chroma, 7 bandas de contraste espectral,
  centroide, rolloff, largura de banda, ZCR, RMS e andamento por autocorrelação da
  envoltória de onsets). Faixas longas viram até 3 janelas e as probabilidades são médias.

A tela lista todas as features em três blocos: **medidas da Essentia** (BPM e confiança,
tom, modo, força do tom, dançabilidade, loudness, complexidade dinâmica), **descritores
espectrais** do extrator próprio (energia/RMS, centroide, rolloff 85%, largura de banda,
cruzamentos por zero, planicidade, contraste espectral, pico) e **estimativas**
(acústica, valência e fala), estas últimas marcadas como heurísticas — o Spotify não
publica mais essas features e elas não são medíveis diretamente. `instrumentalness`,
`liveness` e `time_signature` ficam de fora por não haver sinal defensável para elas.

Tudo isso roda num Web Worker (`src/workers/audio-analysis.worker.ts`), então a interface
não trava durante os segundos de processamento; se o worker não subir, a análise cai para
a thread principal.

O ponto do desenho: o **mesmo** código TypeScript extrai as features no treino e na
inferência, o que elimina a divergência clássica de treinar com uma implementação (librosa)
e inferir com outra.

```bash
# 1. extrai as features dos 1.000 clipes do GTZAN com o extrator do browser (~7 min)
npm run features:gtzan

# 2. treina a regressão logística e exporta src/lib/genre-model.ts
.venv/bin/python scripts/treinar_classificador_web.py
```

Resultado atual: **63,5% de acurácia em validação cruzada 5x** (±2,9) em 10 gêneros, contra
10% do acaso; 73,6% no holdout de 25%. O modelo exportado é só escalonador + matriz de
pesos avaliada com um softmax — sem runtime de ML no cliente e sem enviar áudio a servidor
algum. `scripts/classificar_genero.py` continua sendo a referência offline mais completa
(librosa + Essentia nativos, com Random Forest).

> `essentia.js` é distribuída sob **AGPL-3.0**: se a aplicação for publicada, a licença
> exige disponibilizar o código-fonte do serviço.
