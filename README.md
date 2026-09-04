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

App mobile-first que fecha o circuito do projeto: o navegador **ouve** o arquivo de áudio,
mede as features, e o servidor **pontua** essa faixa no modelo bayesiano k=11 treinado
sobre as 89.740 músicas do dataset limpo.

```bash
npm install
cp .env.local.example .env.local   # todas as chaves sao opcionais (ver o arquivo)
npm run dev                        # http://localhost:3000
```

### O caminho principal: "sua música tem cara de hit?"

```
arquivo de audio
   -> decodifica e reamostra para 22,05 kHz mono   (WebAudio, no aparelho)
   -> Essentia WASM + DSP proprio                  (BPM, tom, energia, espectro)
   -> classificador GTZAN                          (genero provavel)
   -> src/lib/model-bridge.ts                      (11 features do modelo)
   -> POST /api/predict                            (modelo k=11, 1.000 amostras)
   -> score 0-100 + intervalo de credibilidade 94%
```

`src/lib/model-bridge.ts` é a peça que liga as duas metades: converte o que o navegador
consegue medir no vetor exato que o modelo espera (`artifacts/feature_names.json`) e
traduz os 10 gêneros do GTZAN para os 107 gêneros que o modelo conhece. Nenhum áudio sai
do aparelho — só as 11 medidas resultantes vão ao servidor.

Na tela de resultado dá para:

- **trocar o gênero da análise** (chips do classificador ou os 107 do modelo) e ver o score
  recalcular — os coeficientes são por gênero, então a mesma faixa vale scores bem
  diferentes dependendo de onde é lançada;
- **simular outra versão da faixa** com os sliders ("e se o andamento fosse 130?"), que
  batem em `/api/predict` a cada arrasto (≈10 ms por consulta);
- **ver a corrida de gêneros**: a mesma música pontuada em doze gêneros de uma vez.

Toda a animação é CSS em `transform`/`opacity`, sem biblioteca de motion, e desligada em
`prefers-reduced-motion`. O primeiro carregamento é de ~124 kB de JS; a Essentia (2 MB de
WASM) só é baixada quando o usuário escolhe um arquivo.

### O caminho secundário: explorar o catálogo do Spotify

Precisa de `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`. O que a tela faz:

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
(acústica, valência, fala, instrumental e ao vivo), estas últimas marcadas como
heurísticas — o Spotify não publica mais essas features e elas não são medíveis
diretamente. `instrumentalness` e `liveness` entram porque o modelo k=11 as exige; são as
duas mais frágeis da leitura e a interface as marca como tal. `time_signature` fica de
fora por não haver sinal defensável e por não entrar no modelo.

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

### Rotas da API

| Rota | O que faz |
|---|---|
| `POST /api/predict` | Pontua um vetor de 11 features em até 24 gêneros de uma vez. Sem LLM, ~10 ms. É o que sustenta os sliders e a corrida de gêneros. |
| `POST /api/diagnose` | Mesmo score, mais a explicação em PT-BR gerada por LLM (precisa de `OPENROUTER_API_KEY`; sem ela devolve o score e avisa). |
| `GET /api/generos` | Os 107 gêneros que o modelo k=11 conhece. |
| `GET /api/genres` | Gêneros sugeridos para a busca no catálogo do Spotify (outra lista, outro propósito). |
| `GET /api/tracks`, `/api/tracks/[id]`, `/api/preview/[id]` | Busca, detalhe e prévia de áudio do catálogo. |

O modelo carrega `artifacts/k11_posterior_samples.json.gz` (12 MB, 1.000 amostras do
posterior) uma vez por processo e o mantém em memória — por isso a pontuação roda no
servidor e não no cliente.

> `essentia.js` é distribuída sob **AGPL-3.0**: se a aplicação for publicada, a licença
> exige disponibilizar o código-fonte do serviço.
