// Conteudo da landing do projeto, uma secao por slide da apresentacao.
//
// Todo numero daqui saiu de um arquivo do repositorio, e a origem esta anotada
// em cada bloco. Nada foi arredondado para soar melhor: o modelo acerta pouco
// em termos absolutos, e a pagina diz isso.

export type Metrica = {
  valor: string;
  rotulo: string;
  fonte?: string;
};

export type Aprofundamento = {
  titulo: string;
  resumo: string;
  corpo: string[];
};

export type Secao = {
  id: string;
  /** cor que a tela assume quando a seção entra */
  tom: string;
  /** ícone animado da seção */
  icone:
    | "onda"
    | "duvida"
    | "passos"
    | "duplo"
    | "alvo"
    | "perguntas"
    | "funil"
    | "dispersao"
    | "curva"
    | "bandeira";
  /** numero do slide correspondente no PDF da apresentacao */
  slide: number;
  etiqueta: string;
  titulo: string;
  linha: string;
  paragrafos?: string[];
  metricas?: Metrica[];
  lista?: { titulo: string; texto: string }[];
  aprofundamentos?: Aprofundamento[];
  /** minigame embutido nesta secao, se houver */
  jogo?: "generos" | "nota" | "feature";
};

export const SECOES: Secao[] = [
  {
    id: "abertura",
    tom: "#1ed760",
    icone: "onda",
    slide: 1,
    etiqueta: "Popularity Lab",
    titulo: "Essa música tem cara de hit?",
    linha:
      "Um indicativo de popularidade para artistas e produtores avaliarem o potencial antes do lançamento.",
    paragrafos: [
      "O app escuta o áudio dentro do próprio navegador, mede o que dá para medir e pergunta a um modelo estatístico que nota aquela música tiraria em popularidade, no estilo em que ela for lançada.",
      "Esta página conta como chegamos lá: o que analisamos, o que treinamos, o que construímos e o que não funcionou.",
    ],
    metricas: [
      { valor: "89.740", rotulo: "faixas analisadas", fonte: "data/processed" },
      { valor: "107", rotulo: "estilos no modelo", fonte: "artifacts/genero_cats.json" },
      { valor: "11", rotulo: "medidas por música", fonte: "artifacts/feature_names.json" },
    ],
  },
  {
    id: "problema",
    tom: "#ff6b6b",
    icone: "duvida",
    slide: 2,
    etiqueta: "O problema",
    titulo: "Muita decisão ainda é feita no achismo.",
    linha:
      "Antes de investir em divulgação, o artista precisa saber se a música tem sinais competitivos.",
    lista: [
      {
        titulo: "Comparar é difícil",
        texto: "Não existe uma forma simples de colocar a sua faixa ao lado de referências reais do estilo.",
      },
      {
        titulo: "Dado existe, decisão não",
        texto: "Os números musicais estão por aí, mas raramente viram uma escolha prática de lançar, ajustar ou promover.",
      },
      {
        titulo: "Priorizar custa caro",
        texto: "Produtores precisam decidir em qual faixa colocar verba de campanha, e erram caro quando decidem no feeling.",
      },
    ],
  },
  {
    id: "solucao",
    tom: "#3ba9ff",
    icone: "passos",
    slide: 3,
    etiqueta: "A solução",
    titulo: "Uma leitura rápida do potencial da música.",
    linha: "Dados do Spotify combinados com análise técnica do áudio, no mesmo lugar.",
    lista: [
      { titulo: "1. Escolher", texto: "Um estilo do catálogo, ou o arquivo da sua própria música." },
      { titulo: "2. Escutar", texto: "O navegador decodifica o áudio e mede ritmo, tom, energia e espectro." },
      { titulo: "3. Traduzir", texto: "As medidas viram o vetor de 11 números que o modelo espera receber." },
      { titulo: "4. Pontuar", texto: "O modelo devolve uma nota de 0 a 100 com a margem de incerteza junto." },
    ],
    aprofundamentos: [
      {
        titulo: "Por que o áudio não sai do seu aparelho",
        resumo: "Decodificação, medição e classificação rodam no navegador",
        corpo: [
          "A decodificação usa a WebAudio API e reamostra para 22,05 kHz mono, que é a taxa em que o classificador foi treinado.",
          "A Essentia roda em WebAssembly dentro de um Web Worker, então a interface não trava durante os segundos de processamento. Se o worker não subir, a análise cai para a thread principal em vez de falhar.",
          "Só as 11 medidas resultantes viajam até o servidor. O arquivo em si nunca sobe.",
        ],
      },
    ],
  },
  {
    id: "produto",
    tom: "#8b7bff",
    icone: "duplo",
    slide: 4,
    etiqueta: "O produto",
    titulo: "Duas análises no mesmo lugar.",
    linha: "Os dois caminhos de entrada terminam na mesma tela de resultado.",
    lista: [
      {
        titulo: "Catálogo do Spotify",
        texto: "Busca por nome ou por estilo, lista de referências com trecho para ouvir, e a nota da faixa escolhida.",
      },
      {
        titulo: "Música própria",
        texto: "Envio de um arquivo com leitura de andamento, tom, energia, dinâmica e risco de clipping.",
      },
    ],
    aprofundamentos: [
      {
        titulo: "As bibliotecas que sustentam isso",
        resumo: "Essentia, Next.js, PyMC e um classificador próprio",
        corpo: [
          "Essentia.js em WebAssembly: RhythmExtractor2013 para o andamento, KeyExtractor para o tom, Danceability e DynamicComplexity. São os mesmos algoritmos do pipeline offline em Python, então o número da tela bate com o da análise.",
          "Extrator próprio em TypeScript: 70 descritores por janela de 30 segundos, incluindo 20 MFCCs com média e desvio, 12 chroma, 7 bandas de contraste espectral, centroide, rolloff, largura de banda, ZCR, RMS e andamento por autocorrelação.",
          "Next.js 15 com App Router para a interface e as rotas de API. Zod valida todo vetor que chega ao modelo.",
          "PyMC para o modelo bayesiano, exportado como amostras do posterior e avaliado em TypeScript no servidor.",
        ],
      },
      {
        titulo: "O detalhe que evita o erro clássico",
        resumo: "O mesmo código extrai as features no treino e na inferência",
        corpo: [
          "O classificador de estilo foi treinado sobre a saída do extrator TypeScript, e não do librosa. Isso elimina a divergência mais comum em projetos assim: treinar com uma implementação e inferir com outra, e nunca entender por que a acurácia caiu em produção.",
          "O script scripts/ts/extrair_gtzan.mts roda o mesmo código do navegador sobre os mil clipes do GTZAN, em Node.",
        ],
      },
    ],
  },
  {
    id: "valor",
    tom: "#1ed760",
    icone: "alvo",
    slide: 5,
    etiqueta: "Valor",
    titulo: "Menos achismo, mais indicativo.",
    linha: "O objetivo nunca foi adivinhar o futuro, e sim dar uma referência antes do lançamento.",
    lista: [
      { titulo: "Priorizar", texto: "Ajuda a escolher em qual faixa colocar a verba de campanha." },
      { titulo: "Ajustar", texto: "Mostra o efeito de mexer no andamento, na energia ou no estilo antes de gravar de novo." },
      { titulo: "Traduzir", texto: "Transforma medida técnica em frase que qualquer pessoa entende." },
    ],
  },
  {
    id: "perguntas",
    tom: "#ffb340",
    icone: "perguntas",
    slide: 6,
    etiqueta: "Análise",
    titulo: "Partimos de perguntas, não de um modelo.",
    linha: "As perguntas orientadoras é que transformaram dado musical em critério de produto.",
    lista: [
      { titulo: "Padrões", texto: "Quais padrões aparecem nas músicas mais populares?" },
      { titulo: "Estilos", texto: "Estilos diferentes se comportam de formas diferentes?" },
      { titulo: "Features", texto: "Energia, duração e dançabilidade ajudam a explicar desempenho?" },
      { titulo: "Produto", texto: "Como virar um número simples sem mentir sobre a incerteza?" },
    ],
  },
  {
    id: "processo",
    tom: "#ffb340",
    icone: "funil",
    slide: 7,
    etiqueta: "Processo",
    titulo: "Limpar, comparar e transformar em critério.",
    linha: "De 114 mil linhas brutas até 89.740 faixas utilizáveis.",
    metricas: [
      { valor: "114.000", rotulo: "linhas no CSV bruto" },
      { valor: "23.809", rotulo: "removidas na consolidação" },
      { valor: "89.740", rotulo: "faixas no dataset limpo" },
    ],
    paragrafos: [
      "A mesma música aparecia no arquivo bruto em até nove estilos diferentes. Em vez de descartar, a consolidação agregou esses estilos em duas colunas e manteve uma linha por faixa.",
      "Sentinelas do Spotify viraram valor ausente em vez de zero: tempo igual a zero, compasso 0 ou 1, duração zerada. Popularidade zero foi preservada, porque ali o zero é legítimo.",
    ],
    aprofundamentos: [
      {
        titulo: "O que foi removido, e por quê",
        resumo: "Um registro sem artista, 450 duplicatas exatas, 23.809 na consolidação",
        corpo: [
          "1 registro sem artista, álbum ou nome de faixa.",
          "450 duplicatas exatas, byte a byte.",
          "23.809 linhas absorvidas ao consolidar faixa por estilo em uma linha por faixa. Não são perdas: viraram as colunas generos e n_generos.",
          "Todo o log de limpeza ficou em data/processed/log_limpeza.csv, para qualquer etapa poder ser auditada depois.",
        ],
      },
    ],
  },
  {
    id: "achado",
    tom: "#ff6b6b",
    icone: "dispersao",
    slide: 8,
    etiqueta: "O achado",
    titulo: "Nenhuma característica isolada explica o sucesso.",
    linha:
      "Juntas, todas as features de áudio explicam 3,5% da variação de popularidade. O estilo pesa muito mais.",
    jogo: "generos",
    metricas: [
      { valor: "3,5%", rotulo: "R² das features sozinhas", fonte: "relatorio, Q1" },
      { valor: "-0,125", rotulo: "maior correlação (instrumental)", fonte: "q1_correlacoes.csv" },
      { valor: "|r| < 0,02", rotulo: "feliz ou triste vs popularidade", fonte: "relatorio, Q5" },
    ],
    paragrafos: [
      "A correlação mais forte que encontramos, entre onze características, foi -0,125: quanto mais instrumental, menos popular. É um efeito real e estatisticamente significativo, mas pequeno demais para decidir qualquer coisa sozinho.",
      "Foi esse resultado que definiu a arquitetura do modelo. Se a característica sozinha não explica, o caminho é olhar para ela dentro do estilo.",
    ],
    aprofundamentos: [
      {
        titulo: "As correlações, uma a uma",
        resumo: "Spearman contra popularidade, nas 89.740 faixas",
        corpo: [
          "Instrumental: -0,125. Fala: -0,067. Loudness: +0,068. Dançabilidade: +0,056. Explícito: +0,050.",
          "Energia: -0,015. Ao vivo: -0,012. Valência: -0,010. Andamento: +0,009, e este nem passou no teste de significância após correção para múltiplas comparações.",
          "Com 89.740 faixas, quase tudo dá significativo. Por isso o relatório prioriza a magnitude do efeito em vez do valor de p: significativo e irrelevante não são a mesma coisa.",
        ],
      },
    ],
  },
  {
    id: "modelo",
    tom: "#3ba9ff",
    icone: "curva",
    slide: 9,
    etiqueta: "O modelo",
    titulo: "Um modelo por estilo, e não um modelo só.",
    linha:
      "Um bayesiano hierárquico com coeficientes próprios para cada um dos 107 estilos. O R² sobe de 3,5% para 15,2%.",
    jogo: "nota",
    metricas: [
      { valor: "15,2%", rotulo: "R² no conjunto de teste", fonte: "q11_summary.json" },
      { valor: "12,7", rotulo: "erro médio absoluto, em pontos", fonte: "q11_summary.json" },
      { valor: "1.000", rotulo: "amostras do posterior por consulta" },
    ],
    paragrafos: [
      "Cada estilo ganha o próprio conjunto de onze coeficientes, mas todos são puxados na direção de uma média comum. Estilos com poucas faixas tomam emprestado do comportamento geral em vez de inventar um padrão a partir de meia dúzia de exemplos.",
      "Como o modelo é bayesiano, ele não devolve um número: devolve mil. A nota que aparece na tela é a média dessas mil, e o intervalo é onde 94% delas caíram.",
    ],
    aprofundamentos: [
      {
        titulo: "O que o modelo ainda erra",
        resumo: "Cobertura do intervalo em 39,9%, quando deveria ser 94%",
        corpo: [
          "O intervalo de credibilidade de 94% deveria conter o valor real em 94% dos casos. Na prática ele contém em 39,9%. Ou seja: os intervalos estão estreitos demais, e a confiança que o modelo declara é maior que a que ele merece.",
          "A causa provável é o modelo capturar só a variação explicável pelas features e pelo estilo, ignorando tudo o que decide popularidade fora do áudio: marketing, playlist editorial, momento cultural, quem é o artista.",
          "Está documentado assim de propósito. Um score de produto que esconde a própria margem de erro é pior que nenhum score.",
          "RMSE de 19,1 pontos no teste. Numa escala de 0 a 100, é muito. Por isso a tela chama o resultado de indicativo, e não de previsão.",
        ],
      },
      {
        titulo: "Onde ele acerta bem",
        resumo: "Estilos com comportamento concentrado erram pouco",
        corpo: [
          "Forró: erro médio de 3,1 pontos em 162 faixas de teste. Bluegrass: 4,7 pontos em 159 faixas.",
          "São estilos com distribuição de popularidade estreita: as faixas se parecem entre si em desempenho, e aí o modelo tem pouco espaço para errar.",
          "O contrário vale para pop, onde convivem faixas de 5 e de 95 pontos com características de áudio quase idênticas.",
        ],
      },
    ],
  },
  {
    id: "resultado",
    tom: "#1ed760",
    icone: "bandeira",
    slide: 10,
    etiqueta: "Resultado",
    titulo: "A análise virou um aplicativo.",
    linha: "E o aplicativo carrega as limitações da análise na cara, em vez de escondê-las.",
    jogo: "feature",
    lista: [
      {
        titulo: "É indicativo",
        texto: "Não é previsão de sucesso. O número vem com a margem ao lado justamente para lembrar disso.",
      },
      {
        titulo: "Próximos passos",
        texto: "Comparar o upload com o estilo escolhido lado a lado e exportar um relatório da faixa.",
      },
    ],
    aprofundamentos: [
      {
        titulo: "O que aprendemos construindo",
        resumo: "Os erros que só aparecem quando o código roda de verdade",
        corpo: [
          "Um clamp comum deixa NaN passar: Math.max(0, Math.min(1, NaN)) devolve NaN. A Essentia devolve NaN em trechos curtos, e uma única medida inválida derrubava o vetor inteiro no servidor.",
          "Carregar 12 MB de amostras no import do módulo fazia o build da Vercel morrer, porque a etapa de coleta de páginas importa todas as rotas em vários processos ao mesmo tempo. Virou carregamento preguiçoso.",
          "Um ancestral com transform vira o ponto de referência de um filho com position fixed. Isso quebrou a tela de abertura e a barra de score, nos dois casos com o mesmo sintoma: o elemento preso na coluna do app em vez de cobrir a tela.",
          "Animar altura com grid-template-rows de 0fr a 1fr resolve a transição de acordeão sem medir nada em JavaScript, mas o elemento continua sendo item do grid pai, e o gap do pai continua sendo aplicado em volta dele.",
        ],
      },
    ],
  },
];

export const TOTAL_SECOES = SECOES.length;
