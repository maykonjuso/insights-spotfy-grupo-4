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

### As telas

Uma tela por pergunta, resposta antes do detalhe, ação principal sempre na
metade de baixo (onde o polegar alcança).

```
Abertura ─ Início ─┬─ Procurar no Spotify ─┐
                   └─ Enviar a minha música ┴─ Analisando ─ Resultado
```

A abertura não é enfeite: ela dura pouco mais de dois segundos e, enquanto roda,
o app já busca as músicas do primeiro estilo e a lista de gêneros do modelo
(`src/lib/catalogo.ts`). Quando a tela de busca aparece, a lista está em
memória e não há esqueleto de carregamento. Tocar num chip de estilo também
adianta a busca dele.

| Arquivo | Papel |
|---|---|
| `src/components/App.tsx` | máquina de estados das telas e navegação |
| `src/components/telas/Abertura.tsx` | apresentação animada que cobre o carregamento inicial |
| `src/components/telas/Inicio.tsx` | dois caminhos, um toque cada |
| `src/lib/catalogo.ts` | cache de músicas por estilo, preenchido durante a abertura |
| `src/components/telas/EnviarMusica.tsx` | arquivo do aparelho |
| `src/components/telas/BuscarMusica.tsx` | estilos e lista do Spotify na mesma tela |
| `src/components/telas/Analisando.tsx` | espera com passos e curiosidades do estudo |
| `src/components/telas/Resultado.tsx` | nota, explicação e detalhe sob demanda |
| `src/components/ui/` | barra do topo, folha inferior e bloco de revelar |

Os dois caminhos de entrada terminam no **mesmo** objeto `Musica`
(`src/lib/analisar.ts`), então existe uma única tela de resultado. Quem usa não
aprende duas interfaces.

### Do áudio até a nota

```
música (arquivo ou trecho do Spotify)
   -> decodifica e reamostra para 22,05 kHz mono   (WebAudio, no aparelho)
   -> Essentia WASM + DSP proprio                  (BPM, tom, energia, espectro)
   -> classificador GTZAN                          (estilo provavel)
   -> src/lib/model-bridge.ts                      (11 features do modelo)
   -> POST /api/predict                            (modelo k=11, 1.000 amostras)
   -> nota 0-100 + intervalo de credibilidade 94%
```

`src/lib/model-bridge.ts` é a peça que liga as duas metades do projeto:
converte o que o navegador consegue medir no vetor exato que o modelo espera
(`artifacts/feature_names.json`) e traduz os 10 estilos do GTZAN para os 107 que
o modelo conhece. Nenhum áudio sai do aparelho: só as 11 medidas vão ao servidor.

Na tela de resultado dá para trocar o estilo (folha inferior com os 107),
simular outra versão da faixa com os sliders, e ver a mesma música pontuada em
doze estilos de uma vez. Cada gesto refaz a conta em cerca de 10 ms.

### Decisões de interface

Vieram das skills `mobile-principles` e `apple-design` (HIG), instaladas em
`.agents/skills/`:

- alvo de toque nunca abaixo de 48px, com 10px de folga entre vizinhos;
- nenhuma pista de interface depende de `:hover`, que vive num
  `@media (hover: hover) and (pointer: fine)` no fim do CSS;
- ação principal na zona do polegar, presa no rodapé com `env(safe-area-inset-bottom)`;
- detalhe sob demanda: a nota aparece inteira, o resto abre se a pessoa quiser;
- a espera mostra progresso e ensina algo do estudo, em vez de só girar;
- texto em português comum, verbo no botão, sem sigla nem campo vazio na tela;
- só `transform` e `opacity` animam, e tudo cede a `prefers-reduced-motion`.

Sem biblioteca de animação: o primeiro carregamento é de ~123 kB de JS, e a
Essentia (2 MB de WASM) só é baixada quando a pessoa escolhe uma música.

### Rotas da API

| Rota | O que faz |
|---|---|
| `POST /api/predict` | Pontua um vetor de 11 features em até 24 gêneros de uma vez. Sem LLM, ~10 ms. É o que sustenta os sliders e a corrida de gêneros. |
| `POST /api/diagnose` | Mesma nota, mais a explicação em PT-BR gerada por LLM. Devolve `explicacao_status` (`ok`, `sem-chave`, `chave-recusada`, `sem-credito`, `limite`, `falhou`) para a tela dizer o que resolver. Precisa de uma `OPENROUTER_API_KEY` de verdade em `.env.local`: o valor de exemplo passa em qualquer checagem de "variável existe" e só falha depois, com 401. |
| `GET /api/generos` | Os 107 gêneros que o modelo k=11 conhece. |
| `GET /api/genres` | Gêneros sugeridos para a busca no catálogo do Spotify (outra lista, outro propósito). |
| `GET /api/tracks`, `/api/tracks/[id]`, `/api/preview/[id]` | Busca, detalhe e prévia de áudio do catálogo. |

O modelo carrega `artifacts/k11_posterior_samples.json.gz` (12 MB, 1.000 amostras do
posterior) uma vez por processo e o mantém em memória, por isso a pontuação roda no
servidor e não no cliente. O carregamento é **preguiçoso**: se acontecesse no import do
módulo, a etapa `Collecting page data` do `next build` importaria todas as rotas em
vários workers ao mesmo tempo, cada um expandindo mais de um milhão de números, e o
build morria com erros enganosos (`Cannot find module './331.js'`, `/_document` não
encontrado). Ver `src/lib/model/artifacts.ts`.

> `essentia.js` é distribuída sob **AGPL-3.0**: se a aplicação for publicada, a licença
> exige disponibilizar o código-fonte do serviço.
