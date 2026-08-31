"""Build final HTML report with embedded charts."""
import base64
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(_HERE, "charts")
REPORT = os.path.join(_HERE, "report.html")


def b64(name):
    with open(os.path.join(OUT, name), "rb") as f:
        return base64.b64encode(f.read()).decode()


hero = b64("hero_dist.png")
q1 = b64("q1_corr.png")
q2 = b64("q2_genres.png")
q3 = b64("q3_artists.png")
q4 = b64("q4_energy.png")
q5 = b64("q5_valence.png")
q6c = b64("q6_clusters.png")
q6l = b64("q6_lift.png")
q7 = b64("q7_extremes.png")

HTML = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Análise Spotify — Sound Features e Popularidade</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..900,0..100&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root {{
    --bg: #f7f3ec;
    --surface: #ffffff;
    --ink: #1a1814;
    --ink-2: #4a443c;
    --muted: #7a7166;
    --line: #e5dccd;
    --line-2: #efe7d8;
    --accent: #1db954;
    --accent-2: #0d8043;
    --amber: #c8841a;
    --coral: #c44b3e;
    --violet: #7b4fb0;
    --tint-green: #e8f5ec;
    --tint-amber: #fbf2e2;
    --tint-coral: #fbe9e6;
    --tint-violet: #f0e8f7;
  }}
  :root:not([data-theme="light"]) {{
    @media (prefers-color-scheme: dark) {{
      --bg: #100e0c;
      --surface: #181513;
      --ink: #f1ebde;
      --ink-2: #c4bcaa;
      --muted: #80766a;
      --line: #2a2624;
      --line-2: #221f1d;
      --accent: #1db954;
      --accent-2: #4ad97a;
      --amber: #e8a33d;
      --coral: #e85d5d;
      --violet: #b07fe0;
      --tint-green: #14241a;
      --tint-amber: #2a1f10;
      --tint-coral: #2a1614;
      --tint-violet: #1f1426;
    }}
  }}
  :root[data-theme="dark"] {{
    --bg: #100e0c;
    --surface: #181513;
    --ink: #f1ebde;
    --ink-2: #c4bcaa;
    --muted: #80766a;
    --line: #2a2624;
    --line-2: #221f1d;
    --accent: #1db954;
    --accent-2: #4ad97a;
    --amber: #e8a33d;
    --coral: #e85d5d;
    --violet: #b07fe0;
    --tint-green: #14241a;
    --tint-amber: #2a1f10;
    --tint-coral: #2a1614;
    --tint-violet: #1f1426;
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    background: var(--bg);
    color: var(--ink);
    font-family: "Inter", system-ui, -apple-system, sans-serif;
    font-size: 15px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "ss01", "cv11";
  }}
  .page {{
    max-width: 1180px;
    margin: 0 auto;
    padding: 64px 48px 96px;
  }}
  /* ---------- HERO ---------- */
  .eyebrow {{
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 16px;
  }}
  h1 {{
    font-family: "Fraunces", Georgia, serif;
    font-weight: 400;
    font-size: clamp(40px, 6vw, 72px);
    line-height: 1.04;
    letter-spacing: -0.02em;
    margin: 0 0 24px;
    text-wrap: balance;
    font-variation-settings: "opsz" 120, "SOFT" 30;
  }}
  h1 em {{
    font-style: italic;
    color: var(--accent-2);
    font-variation-settings: "opsz" 144, "SOFT" 100;
  }}
  .lede {{
    font-size: 19px;
    line-height: 1.55;
    color: var(--ink-2);
    max-width: 720px;
    margin: 0 0 48px;
    text-wrap: pretty;
  }}
  .meta-row {{
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
    padding: 20px 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    margin-bottom: 64px;
    font-size: 13px;
    color: var(--muted);
  }}
  .meta-row strong {{
    display: block;
    color: var(--ink);
    font-family: "Fraunces", serif;
    font-size: 22px;
    font-weight: 500;
    margin-bottom: 2px;
  }}
  .hero-img {{
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    margin: 0 0 72px;
    box-shadow: 0 1px 0 var(--line), 0 30px 60px -30px rgba(0,0,0,0.25);
  }}
  .hero-img img {{ display: block; width: 100%; height: auto; }}

  /* ---------- TOC ---------- */
  .toc {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    margin: 0 0 80px;
  }}
  .toc a {{
    display: block;
    padding: 18px 16px;
    color: var(--ink-2);
    text-decoration: none;
    border-right: 1px solid var(--line-2);
    border-bottom: 1px solid var(--line-2);
    font-size: 13px;
    transition: background 0.15s, color 0.15s;
  }}
  .toc a:hover {{ background: var(--surface); color: var(--accent-2); }}
  .toc a span {{
    display: block;
    font-family: "Fraunces", serif;
    color: var(--accent);
    font-size: 18px;
    margin-bottom: 2px;
  }}

  /* ---------- SECTION ---------- */
  .question {{
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 48px;
    padding: 56px 0;
    border-top: 1px solid var(--line);
  }}
  .question:first-of-type {{ border-top: 0; padding-top: 0; }}
  .q-side {{
    position: sticky;
    top: 32px;
    align-self: start;
  }}
  .q-num {{
    font-family: "Fraunces", serif;
    font-size: 56px;
    line-height: 1;
    color: var(--accent);
    font-weight: 400;
    margin: 0 0 12px;
    font-variation-settings: "opsz" 144;
  }}
  .q-label {{
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }}
  h2 {{
    font-family: "Fraunces", serif;
    font-weight: 400;
    font-size: 32px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    margin: 0 0 18px;
    text-wrap: balance;
  }}
  h2 em {{ color: var(--accent-2); font-style: italic; }}
  .verdict {{
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0 0 20px;
  }}
  .verdict.yes {{ background: var(--tint-green); color: var(--accent-2); }}
  .verdict.no {{ background: var(--tint-coral); color: var(--coral); }}
  .verdict.weak {{ background: var(--tint-amber); color: var(--amber); }}
  .verdict.partial {{ background: var(--tint-violet); color: var(--violet); }}
  .verdict::before {{
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }}
  p {{ margin: 0 0 14px; text-wrap: pretty; }}
  .lead {{
    font-size: 17px;
    color: var(--ink-2);
    margin-bottom: 28px;
    max-width: 62ch;
  }}
  .chart {{
    width: 100%;
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line);
    margin: 28px 0 18px;
  }}
  .chart img {{ display: block; width: 100%; height: auto; }}
  .chart.two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
  .chart.two > * {{ border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }}
  .caption {{
    font-size: 12px;
    color: var(--muted);
    margin: 0 0 32px;
    font-style: italic;
  }}

  /* ---------- EVIDENCE ---------- */
  .evidence {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    margin: 18px 0 24px;
    background: var(--surface);
  }}
  .evidence .item {{
    padding: 18px 20px;
    border-right: 1px solid var(--line-2);
  }}
  .evidence .item:last-child {{ border-right: 0; }}
  .evidence .k {{
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }}
  .evidence .v {{
    font-family: "Fraunces", serif;
    font-size: 26px;
    line-height: 1.1;
    color: var(--ink);
    font-weight: 500;
    font-variation-settings: "opsz" 100;
  }}
  .evidence .v small {{
    font-family: "Inter", sans-serif;
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
    margin-left: 4px;
  }}

  /* ---------- TABLE ---------- */
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin: 16px 0 24px;
    font-variant-numeric: tabular-nums;
  }}
  th, td {{
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line-2);
  }}
  th {{
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 600;
    background: var(--surface);
  }}
  tr:last-child td {{ border-bottom: 0; }}
  td.num {{ text-align: right; font-family: "JetBrains Mono", monospace; font-size: 12.5px; }}
  td.sig {{ color: var(--accent-2); font-weight: 600; }}
  td.nsig {{ color: var(--muted); }}
  .scroll {{ overflow-x: auto; margin: 0 0 24px; }}
  .table-wrap {{ min-width: 540px; }}

  /* ---------- LIMITATIONS ---------- */
  .limits {{
    background: var(--tint-amber);
    border-left: 3px solid var(--amber);
    border-radius: 4px;
    padding: 18px 22px;
    margin: 24px 0 8px;
    font-size: 13.5px;
  }}
  .limits h4 {{
    font-family: "Fraunces", serif;
    font-size: 14px;
    margin: 0 0 8px;
    color: var(--amber);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }}
  .limits ul {{ margin: 0; padding-left: 18px; color: var(--ink-2); }}
  .limits li {{ margin-bottom: 4px; }}

  /* ---------- SYNTHESIS ---------- */
  .synthesis {{
    margin-top: 80px;
    padding: 56px 0 0;
    border-top: 2px solid var(--ink);
  }}
  .synthesis h2 {{ font-size: 40px; }}
  .callout {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    margin: 32px 0;
  }}
  .callout .cell {{
    padding: 24px 26px;
    border-right: 1px solid var(--line-2);
    background: var(--surface);
  }}
  .callout .cell:last-child {{ border-right: 0; }}
  .callout .cell h5 {{
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 8px;
    font-weight: 600;
  }}
  .callout .cell p {{ margin: 0; font-size: 14px; line-height: 1.5; }}

  footer {{
    margin-top: 80px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    justify-content: space-between;
  }}
  .theme-toggle {{
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink-2);
    width: 38px; height: 38px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 16px;
    z-index: 100;
  }}

  @media (max-width: 760px) {{
    .page {{ padding: 40px 22px 64px; }}
    .question {{ grid-template-columns: 1fr; gap: 16px; padding: 40px 0; }}
    .q-side {{ position: static; display: flex; align-items: baseline; gap: 12px; }}
    .q-num {{ font-size: 36px; margin: 0; }}
    h1 {{ font-size: 38px; }}
    h2 {{ font-size: 24px; }}
    .chart.two {{ grid-template-columns: 1fr; }}
    .lede {{ font-size: 16px; }}
  }}
</style>
</head>
<body>
<button class="theme-toggle" onclick="document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'">◐</button>

<div class="page">

  <div class="eyebrow">Análise de dados · Spotify tracks</div>
  <h1>Por que algumas músicas <em>vingam</em><br>e outras somem no ruído?</h1>
  <p class="lede">
    Sete perguntas sobre o que separa o hit do catálogo adormecido. Cada resposta
    traz a evidência numérica — correlações, testes não-paramétricos, regressões e
    correção por comparações múltiplas — e o que o dataset <em>não</em> permite concluir.
  </p>

  <div class="meta-row">
    <div><strong>89 740</strong>faixas analisadas</div>
    <div><strong>17 648</strong>artistas únicos</div>
    <div><strong>114</strong>gêneros catalogados</div>
    <div><strong>7</strong>perguntas respondidas</div>
    <div><strong>10,4%</strong>faixas com popularity = 0</div>
  </div>

  <div class="hero-img">
    <img src="data:image/png;base64,{hero}" alt="Distribuição de popularidade">
  </div>
  <p class="caption">Figura 0 · A popularidade é um snapshot do Spotify, com 10,4% das faixas zeradas (catálogo inativo ou nunca streamado) e cauda longa até 100. P10 = 0, mediana = 33, P90 = 60.</p>

  <nav class="toc">
    <a href="#q1"><span>Q1</span>Features de áudio</a>
    <a href="#q2"><span>Q2</span>Gêneros</a>
    <a href="#q3"><span>Q3</span>Top artistas</a>
    <a href="#q4"><span>Q4</span>Energia</a>
    <a href="#q5"><span>Q5</span>Valência</a>
    <a href="#q6"><span>Q6</span>Mesma "cara", fama diferente</a>
    <a href="#q7"><span>Q7</span>Top vs Bottom</a>
  </nav>

  <!-- ============ Q1 ============ -->
  <section class="question" id="q1">
    <aside class="q-side">
      <div class="q-num">01</div>
      <div class="q-label">Features<br>de áudio</div>
    </aside>
    <div>
      <span class="verdict weak">Sim, mas fraco</span>
      <h2>Sound features <em>influenciam</em> a popularidade?</h2>
      <p class="lead">
        Existe efeito estatisticamente detectável, mas a regressão múltipla
        explica apenas <strong>3,5% da variância</strong> (R² = 0,0346). As features
        ajudam pouco isoladas.
      </p>

      <div class="chart"><img src="data:image/png;base64,{q1}" alt="Correlações"></div>
      <p class="caption">Figura 1.1 · Correlação de Spearman entre cada feature e `popularity`. Mesmo significativas, magnitudes são pequenas (|ρ| ≤ 0,125).</p>

      <div class="evidence">
        <div class="item"><div class="k">R² do modelo</div><div class="v">3,46<small>%</small></div></div>
        <div class="item"><div class="k">Maior |ρ|</div><div class="v">−0,125<small>instrumentalness</small></div></div>
        <div class="item"><div class="k">β danceability</div><div class="v">+9,95</div></div>
        <div class="item"><div class="k">β explicit</div><div class="v">+3,89</div></div>
      </div>

      <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:24px 0 8px;">Preditores significativos (FDR p &lt; 0,01)</h3>
      <div class="scroll"><div class="table-wrap"><table>
        <thead><tr><th>Variável</th><th>Coef. OLS</th><th>Direção</th><th>p_FDR</th></tr></thead>
        <tbody>
          <tr><td>speechiness</td><td class="num">−15,39</td><td>Quanto mais "fala", menos popular</td><td class="num sig">≈ 0</td></tr>
          <tr><td>danceability</td><td class="num">+9,95</td><td>Mais dançante → mais popular</td><td class="num sig">≈ 0</td></tr>
          <tr><td>instrumentalness</td><td class="num">−8,81</td><td>Mais instrumental → menos popular</td><td class="num sig">≈ 0</td></tr>
          <tr><td>valence</td><td class="num">−7,84</td><td>Mais "feliz" → menos popular</td><td class="num sig">1,3e-125</td></tr>
          <tr><td>explicit</td><td class="num">+3,89</td><td>Conteúdo explícito ajuda</td><td class="num sig">3,7e-50</td></tr>
          <tr><td>energy</td><td class="num">−2,01</td><td>Efeito negativo controlado</td><td class="num sig">5,6e-4</td></tr>
          <tr><td>acousticness</td><td class="num">−1,16</td><td>Mais acústico → menos popular</td><td class="num sig">5,6e-4</td></tr>
          <tr><td>liveness</td><td class="num">—</td><td>Sem efeito</td><td class="num nsig">0,15</td></tr>
        </tbody>
      </table></div></div>

      <div class="limits">
        <h4>Limitações</h4>
        <ul>
          <li><strong>R² muito baixo</strong> — 96,5% da variação fica fora do modelo.</li>
          <li>Sem dados temporais (data de lançamento, janela de medição).</li>
          <li>Sem marketing, playlist placement, fama do artista, redes sociais.</li>
          <li>Variável `popularity` é opaca e defasada.</li>
          <li>n ≈ 90 000 infla significância: p &lt; 0,01 é trivial, o que importa é a magnitude.</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ Q2 ============ -->
  <section class="question" id="q2">
    <aside class="q-side">
      <div class="q-num">02</div>
      <div class="q-label">Gêneros<br>musicais</div>
    </aside>
    <div>
      <span class="verdict yes">Sim, com força</span>
      <h2>Quais gêneros <em>vingam</em>?</h2>
      <p class="lead">
        Kruskal-Wallis global rejeita a hipótese de distribuições idênticas entre
        114 gêneros (<strong>H = 31 813, p ≈ 0</strong>). Os 10 gêneros abaixo
        têm IC 95% que <em>não inclui</em> a mediana global (33).
      </p>

      <div class="chart"><img src="data:image/png;base64,{q2}" alt="Top gêneros"></div>
      <p class="caption">Figura 2.1 · Top 10 gêneros por popularidade média (apenas n ≥ 100). Barras com IC 95%; linha pontilhada = mediana global.</p>

      <div class="scroll"><div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Gênero</th><th>n</th><th>Média</th><th>IC 95%</th><th>p_FDR</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>k-pop</td><td class="num">916</td><td class="num">59,4</td><td class="num">58,6 – 60,2</td><td class="num sig">7,7e-310</td></tr>
          <tr><td>2</td><td>pop-film</td><td class="num">635</td><td class="num">56,7</td><td class="num">55,9 – 57,6</td><td class="num sig">3,8e-206</td></tr>
          <tr><td>3</td><td>metal</td><td class="num">232</td><td class="num">56,4</td><td class="num">54,0 – 58,9</td><td class="num sig">1,0e-61</td></tr>
          <tr><td>4</td><td>chill</td><td class="num">972</td><td class="num">53,8</td><td class="num">52,8 – 54,7</td><td class="num sig">7,1e-237</td></tr>
          <tr><td>5</td><td>latino</td><td class="num">398</td><td class="num">51,8</td><td class="num">49,2 – 54,4</td><td class="num sig">1,6e-50</td></tr>
          <tr><td>6</td><td>sad</td><td class="num">564</td><td class="num">51,1</td><td class="num">50,1 – 52,1</td><td class="num sig">2,3e-110</td></tr>
          <tr><td>7</td><td>grunge</td><td class="num">862</td><td class="num">50,6</td><td class="num">49,6 – 51,6</td><td class="num sig">3,9e-149</td></tr>
          <tr><td>8</td><td>indian</td><td class="num">733</td><td class="num">49,8</td><td class="num">48,9 – 50,6</td><td class="num sig">1,3e-124</td></tr>
          <tr><td>9</td><td>pop</td><td class="num">596</td><td class="num">49,6</td><td class="num">47,1 – 52,2</td><td class="num sig">2,4e-62</td></tr>
          <tr><td>10</td><td>anime</td><td class="num">995</td><td class="num">48,8</td><td class="num">48,1 – 49,5</td><td class="num sig">1,7e-148</td></tr>
        </tbody>
      </table></div></div>

      <div class="limits">
        <h4>Limitações</h4>
        <ul>
          <li>Gêneros atribuídos pelo Spotify — não mutuamente exclusivos.</li>
          <li>`genero_principal` definido por ordem alfabética (atribuição arbitrária).</li>
          <li>Reflete popularidade <em>na amostra do Spotify</em>, não no consumo global.</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ Q3 ============ -->
  <section class="question" id="q3">
    <aside class="q-side">
      <div class="q-num">03</div>
      <div class="q-label">Top<br>artistas</div>
    </aside>
    <div>
      <span class="verdict partial">Perfil misto</span>
      <h2>O que caracteriza os <em>artistas mais populares</em>?</h2>
      <p class="lead">
        Definição: <strong>Top 10%</strong> (média de popularidade ≥ 55,13, 466 artistas) vs
        <strong>Bottom 10%</strong> (≤ 11,75, 467 artistas), filtrados para ≥ 5 faixas.
        Cinco diferenças significativas — todas com efeito pequeno em magnitude.
      </p>

      <div class="chart"><img src="data:image/png;base64,{q3}" alt="Top vs Bottom artistas"></div>
      <p class="caption">Figura 3.1 · Diferenças significativas (Mann-Whitney, FDR p &lt; 0,01). r = rank-biserial. |r| &lt; 0,3 = efeito pequeno.</p>

      <div class="evidence">
        <div class="item"><div class="k">Artistas P90</div><div class="v">466</div></div>
        <div class="item"><div class="k">Artistas P10</div><div class="v">467</div></div>
        <div class="item"><div class="k">Maior |r|</div><div class="v">0,27<small>n_generos</small></div></div>
        <div class="item"><div class="k">χ² (gênero)</div><div class="v">4 504<small>p &lt; 1e-300</small></div></div>
      </div>

      <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:24px 0 8px;">O que os populares têm</h3>
      <ul>
        <li><strong>Música mais alta (loudness):</strong> −7,67 dB vs −9,37 dB — produção "loudness war" do pop/hip-hop mainstream.</li>
        <li><strong>Menos instrumental:</strong> 0,076 vs 0,209 — vocais dominantes vendem mais que faixas longas sem voz.</li>
        <li><strong>Mais explícito:</strong> 16,3% vs 8,6% — quase o dobro, puxado por hip-hop/pop contemporâneo.</li>
        <li><strong>Ligeiramente mais diverso em gênero:</strong> 1,40 vs 1,35 gêneros por artista.</li>
        <li><strong>Liveness marginalmente maior</strong> (efeito muito pequeno).</li>
      </ul>

      <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:24px 0 8px;">O que NÃO diferencia</h3>
      <p>Danceability, energy, valence, tempo, speechiness, acousticness e n_artistas — todos sem diferença significativa entre P90 e P10.</p>

      <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:24px 0 8px;">A assinatura de gênero é quase categórica</h3>
      <p>χ² ≈ 4 505 (p &lt; 1e-300). Gêneros como <em>iranian, romance, detroit-techno, classical, chicago-house</em> aparecem quase exclusivamente no P10, enquanto <em>pop-film, k-pop, chill, british</em> dominam o P90. <strong>O gênero é um discriminador mais forte que qualquer feature de áudio.</strong></p>

      <div class="limits">
        <h4>Limitações</h4>
        <ul>
          <li>Efeitos pequenos (|r| ≤ 0,27) — distribuições se sobrepõem em quase toda parte.</li>
          <li>Filtro ≥ 5 faixas exclui one-hit wonders.</li>
          <li>Sem correção por gênero nos testes numéricos (confounding).</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ Q4 ============ -->
  <section class="question" id="q4">
    <aside class="q-side">
      <div class="q-num">04</div>
      <div class="q-label">Energia<br>musical</div>
    </aside>
    <div>
      <span class="verdict no">Não</span>
      <h2>Músicas mais <em>animadas</em> fazem mais sucesso?</h2>
      <p class="lead">
        Padrão em <strong>U-invertido</strong>: o pico de popularidade está em Q2
        (energia média), e Q1 ≈ Q4. Controlando por outras features, mais energia
        está associada a <em>menos</em> popularidade.
      </p>

      <div class="chart"><img src="data:image/png;base64,{q4}" alt="Energia vs popularidade"></div>
      <p class="caption">Figura 4.1 · Popularidade média por quartil de energia. Pico em Q2 (0,46–0,68). β logística controlado: −0,386 (p ≈ 0).</p>

      <div class="evidence">
        <div class="item"><div class="k">Spearman ρ</div><div class="v">−0,016</div></div>
        <div class="item"><div class="k">β logístico</div><div class="v">−0,39<small>controlado</small></div></div>
        <div class="item"><div class="k">Pico em</div><div class="v">Q2<small>35,4 média</small></div></div>
        <div class="item"><div class="k">KW p</div><div class="v">3,9e-183</div></div>
      </div>

      <p>Comparações Mann-Whitney par a par (FDR): Q1×Q2, Q1×Q3, Q2×Q3, Q2×Q4, Q3×Q4 — todos p &lt; 0,01. Apenas Q1×Q4 não significativo (p = 0,017).</p>

      <div class="limits">
        <h4>Limitações</h4>
        <ul>
          <li>Multicolinearidade energy ↔ loudness.</li>
          <li>`energy` é feature engenheirada do Spotify.</li>
          <li>Regressão linear capta apenas a tendência média — a relação real é em U.</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ Q5 ============ -->
  <section class="question" id="q5">
    <aside class="q-side">
      <div class="q-num">05</div>
      <div class="q-label">Valência<br>(humor)</div>
    </aside>
    <div>
      <span class="verdict no">Não</span>
      <h2>Público prefere <em>feliz</em> ou <em>triste</em>?</h2>
      <p class="lead">
        As correlações são estatisticamente detectáveis, mas a magnitude é
        desprezível (|r| &lt; 0,02). Curiosamente, o sinal vai na direção
        <em>oposta</em> à hipótese popular.
      </p>

      <div class="chart"><img src="data:image/png;base64,{q5}" alt="Valência vs popularidade"></div>
      <p class="caption">Figura 5.1 · Popularidade por quartil de valência. Pico em Q2 (valência baixa-média), Q1 ≈ Q4. β controlado: −0,184.</p>

      <div class="evidence">
        <div class="item"><div class="k">Pearson r</div><div class="v">−0,012</div></div>
        <div class="item"><div class="k">Spearman ρ</div><div class="v">−0,011</div></div>
        <div class="item"><div class="k">β logístico</div><div class="v">−0,18</div></div>
        <div class="item"><div class="k">Rank-biserial</div><div class="v">0,034<small>efeito trivial</small></div></div>
      </div>

      <p>Quando se comparam extremos (valence ≥ 0,6 vs ≤ 0,4) ou se controla por outras features, o efeito vai na direção <strong>contrária</strong>: valência mais alta → chance ligeiramente <em>menor</em> de top 25% popular. O preditor mais forte é <code>danceability</code> (β = +0,229), não <code>valence</code>.</p>

      <div class="limits">
        <h4>Limitações</h4>
        <ul>
          <li>`valence` é algorítmica do Spotify, não emoção humana percebida.</li>
          <li>`popularity` ≠ consumo real (streams totais, tempo de escuta).</li>
          <li>n ≈ 90 000 infla p-valores — efeito real é trivial.</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ Q6 ============ -->
  <section class="question" id="q6">
    <aside class="q-side">
      <div class="q-num">06</div>
      <div class="q-label">Mesma<br>cara, fama<br>diferente</div>
    </aside>
    <div>
      <span class="verdict partial">Subgênero decide</span>
      <h2>Por que <em>artistas parecidos</em> não ficam famosos?</h2>
      <p class="lead">
        Clusterização K-Means (k=5) agrupou 4 655 artistas por perfil acústico.
        Dentro de cada cluster, comparamos top 25% vs bottom 25% por popularidade.
        O fator nº1 que separa é o <strong>subgênero</strong>.
      </p>

      <div class="chart"><img src="data:image/png;base64,{q6c}" alt="Clusters KMeans"></div>
      <p class="caption">Figura 6.1 · Centroides das 9 features por cluster (K-Means, k=5, silhueta = 0,213).</p>

      <div class="chart"><img src="data:image/png;base64,{q6l}" alt="Lift por subgênero"></div>
      <p class="caption">Figura 6.2 · Subgêneros com maior lift (proporção no top 25% / proporção no bottom 25%) dentro de cada cluster. Escala log.</p>

      <p>Resultados por cluster (Mann-Whitney / χ², FDR p &lt; 0,01):</p>
      <ul>
        <li><strong>Cluster pop/eletrônico:</strong> subgêneros <em>deep-house (31×), sad (20×), electronic (14×), emo (13×)</em>. Mais colaborações, mais explícito.</li>
        <li><strong>Cluster acústico:</strong> <em>acoustic (10,5×), world-music (5×), british (4,5×)</em>. Maior diversidade de gênero ajuda.</li>
        <li><strong>Cluster instrumental:</strong> obras solo (colaboração inverte o sinal). Gêneros raros (<em>study, sleep</em>).</li>
        <li><strong>Cluster alta energia:</strong> <em>metalcore (25×), garage (7×), punk (7×), death-metal (6,5×)</em>. Mais colaborativo, mais diverso.</li>
        <li><strong>Cluster spoken word:</strong> amostra pequena (n=59), sem poder estatístico.</li>
      </ul>

      <p>Em 4 de 5 clusters, o qui-quadrado rejeita a hipótese de distribuição homogênea de subgêneros com p_FDR na ordem de 1e-47 a 1e-70.</p>

      <div class="limits">
        <h4>Limitações críticas — o que falta para responder "por quê"</h4>
        <ul>
          <li><strong>Playlist placement</strong> (provável causa #1 de popularidade no Spotify).</li>
          <li>Data de lançamento, janela de medição, marketing/selo/distribuidor.</li>
          <li>Redes sociais (Instagram, TikTok, YouTube, Shazam).</li>
          <li>Métricas de skip/save/completion rate por faixa.</li>
          <li>Histórico temporal de popularidade (max vs. evergreens vs. one-hit).</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ Q7 ============ -->
  <section class="question" id="q7">
    <aside class="q-side">
      <div class="q-num">07</div>
      <div class="q-label">Top vs<br>Bottom</div>
    </aside>
    <div>
      <span class="verdict partial">Comum e diferente</span>
      <h2>O que <em>extremos</em> de popularidade têm em comum?</h2>
      <p class="lead">
        Top = popularity ≥ 60 (P90, n=9 810). Bottom = popularity = 0 (P10, n=9 347).
        Quatro dimensões <strong>não</strong> separam os dois grupos; oito sim, com
        efeito pequeno mas altamente significativo pelo n.
      </p>

      <div class="chart"><img src="data:image/png;base64,{q7}" alt="Magnitude das diferenças"></div>
      <p class="caption">Figura 7.1 · Magnitude (|r|) das diferenças entre Top 10% e Bottom 10%. Verde = significativo (FDR p &lt; 0,01); cinza = sem diferença.</p>

      <div class="evidence">
        <div class="item"><div class="k">Faixas Top</div><div class="v">9 810</div></div>
        <div class="item"><div class="k">Faixas Bottom</div><div class="v">9 347</div></div>
        <div class="item"><div class="k">Maior |r|</div><div class="v">0,165<small>acousticness</small></div></div>
        <div class="item"><div class="k">Em comum</div><div class="v">4<small>features</small></div></div>
      </div>

      <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:24px 0 8px;">O que TÊM EM COMUM (sem diferença significativa)</h3>
      <ul>
        <li><strong>Valence</strong> (p = 0,64) — humor musical idêntico.</li>
        <li><strong>n_artistas</strong> (p = 0,37) — colaborações iguais (mediana 1).</li>
        <li><strong>Liveness</strong> (p = 0,07) — sem diferença real.</li>
        <li><strong>Speechiness</strong> (p = 0,04) — efeito mínimo.</li>
      </ul>

      <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:18px;margin:24px 0 8px;">O que DIFERE (efeitos pequenos)</h3>
      <p>Top é mais <strong>"produzido"</strong>: mais alto (+1,2 dB), mais enérgico, mais dançante, menos acústico, ligeiramente mais rápido, mais longo, menor diversidade de gêneros (+5,6 p.p. de explícito, +0,13 mais dB em loudness, −0,11 em acousticness).</p>

      <div class="limits">
        <h4>Limitações</h4>
        <ul>
          <li>Bottom = popularity = 0 (limite duro) — pode misturar catálogo inativo com nicho legítimo.</li>
          <li>Sem dados temporais ou demográficos.</li>
          <li>Efeitos pequenos apesar de p-valores extremos (n inflado).</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- ============ SYNTHESIS ============ -->
  <section class="synthesis">
    <h2>Em uma <em>frase</em></h2>
    <p class="lede">
      Features de áudio explicam menos de 4% da popularidade — o que decide é o
      <strong>gênero</strong>, a <strong>produção (loud/explicit/dançante)</strong> e, fora do dataset, o
      <strong>playlist placement</strong>.
    </p>

    <div class="callout">
      <div class="cell">
        <h5>O que o som faz</h5>
        <p>R² = 3,5%. Energia, valência, dançabilidade explicam muito pouco. Nenhuma feature, isolada, serve como preditor.</p>
      </div>
      <div class="cell">
        <h5>O que o gênero faz</h5>
        <p>É o discriminador mais forte — funciona quase como variável categórica. 10 gêneros têm popularidade média 50–60, contra 33 global.</p>
      </div>
      <div class="cell">
        <h5>O que a produção faz</h5>
        <p>Música mais alta, mais explícita e menos acústica está associada ao top. Hip-hop/pop mainstream define o perfil.</p>
      </div>
      <div class="cell">
        <h5>O que está fora do dataset</h5>
        <p>Playlist placement, marketing, redes sociais e janela temporal — provavelmente o que mais explica a cauda.</p>
      </div>
    </div>

    <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:22px;margin:48px 0 8px;">Cruzando as respostas</h3>
    <div class="scroll"><div class="table-wrap"><table>
      <thead><tr><th>Pergunta</th><th>Veredito</th><th>Magnitude</th></tr></thead>
      <tbody>
        <tr><td>Q1 — Features influenciam?</td><td>Sim, com R² = 0,035</td><td>Fraca</td></tr>
        <tr><td>Q2 — Gêneros top?</td><td>k-pop, pop-film, metal, chill, latino…</td><td>Forte (IC fora da mediana global)</td></tr>
        <tr><td>Q3 — Top artistas?</td><td>Loud + explícito + menos instrumental + gênero certo</td><td>Pequena (|r| ≤ 0,27)</td></tr>
        <tr><td>Q4 — Mais animadas?</td><td>Não (U-invertido, β = −0,39 controlado)</td><td>Modesta</td></tr>
        <tr><td>Q5 — Feliz ou triste?</td><td>Não há preferência (|r| &lt; 0,02)</td><td>Trivial</td></tr>
        <tr><td>Q6 — Mesma cara, fama diferente?</td><td>Subgênero decide (lift até 31×)</td><td>Forte (χ² p &lt; 1e-47)</td></tr>
        <tr><td>Q7 — Comum entre extremos?</td><td>valence, n_artistas, liveness, speechiness</td><td>—</td></tr>
      </tbody>
    </table></div></div>

    <h3 style="font-family:Fraunces,serif;font-weight:500;font-size:22px;margin:48px 0 8px;">Limitações globais dos dados</h3>
    <ul style="color:var(--ink-2);max-width:62ch;">
      <li><strong>Popularidade</strong> é snapshot do Spotify (defasado, opaco, enviesado por recência).</li>
      <li><strong>Sem temporalidade</strong>: data de lançamento, curva de crescimento, sazonalidade.</li>
      <li><strong>Sem exposição</strong>: playlist placement, marketing, redes sociais, skip/completion rate.</li>
      <li><strong>Sem mercado</strong>: país, idioma, demografia do ouvinte.</li>
      <li><strong>n ≈ 90 000</strong> infla significância — toda diferença, por menor que seja, atinge p &lt; 0,01; portanto <em>magnitude</em> importa mais que p-valor.</li>
    </ul>
  </section>

  <footer>
    <span>Fonte: <code>insights-spotfy-grupo-4/data/processed/spotify_tracks_limpo.parquet</code> · 89 740 faixas · 7 sub-agentes paralelos</span>
    <span>Testes: Mann-Whitney U, Kruskal-Wallis, χ², OLS, logística, K-Means · Correção: FDR Benjamini-Hochberg (α = 0,01)</span>
  </footer>

</div>
</body>
</html>
"""

with open(REPORT, "w", encoding="utf-8") as f:
    f.write(HTML)
print("Report written to", REPORT)
print("Size:", os.path.getsize(REPORT), "bytes")
