# Wave 4 — Critic-UX (juiz independente do MVP)

**Data:** 2026-09-04
**Persona:** artista / produtor musical brasileiro querendo entender se a faixa tem potencial em um gênero específico.
**Fresh context:** este crítico NÃO viu Wave 1, 2 ou 3. Lendo os artefatos como se fosse o primeiro contato.

---

## 1. Roteiro percorrido (perspectiva leiga)

### 1.1 Landing (`/`)
A primeira impressão é limpa. O usuário vê:

- Brand row "Popularity Lab" + eyebrow "Spotify · análise musical"
- H1: **"Descubra o que a sua música tem por dentro."**
- Dois CTAs equivalentes:
  - "Analisar música" (primário, seta)
  - "Enviar minha música" (secundário)
- 3 highlights: "Prévia real", "Leitura do áudio", "Tudo no aparelho"

**O usuário entende o que é?** Sim, a copy diz "análise técnica em três passos" e "envie a sua própria música para ser classificada". É claro.

**O usuário sabe que dá pra fazer upload?** Sim — botão "Enviar minha música" é o segundo CTA. Mas o usuário leigo não sabe ainda que ele próprio é o caso de uso prioritário (a copy diz "analisar" antes de "enviar"). Para um **produtor musical** (target do MVP), o CTA "Enviar minha música" deveria ser mais proeminente — está menor e em cinza/secundário.

### 1.2 Etapa "upload" — antes de soltar áudio
A dropzone mostra:
- "Arraste ou selecione seus áudios"
- "MP3, WAV, M4A, OGG ou FLAC · várias de uma vez"

Isso é o **único lugar** onde o usuário vê que MP3 é aceito. Não há copy inicial dizendo "aceito MP3 até 50 MB" — essa limitação só aparece se o usuário **errar**.

**Nota grande abaixo da dropzone:**
> "Gêneros reconhecidos: pop, k-pop, hip-hop, … — os 10 do GTZAN, com X% de acurácia em validação cruzada contra Y% do acaso. O conjunto é norte-americano e não tem gêneros brasileiros: sertanejo cai em country, MPB costuma cair em jazz ou blues e funk em hip-hop. Tom, BPM, dançabilidade e loudness vêm da Essentia em WebAssembly. Tudo roda no seu navegador: nenhum áudio é enviado para servidor."

> **Inconsistência grave detectada** (sinalizei mais adiante): o aviso diz "GTZAN não tem sertanejo/MPB/funk", mas o K-11 **tem** — basta verificar `/api/generos`, retorna 107 gêneros incluindo `sertanejo`, `mpb`, `funk`, `pagode`, `samba`, `forro`, `brazil`. Para um produtor brasileiro, esse aviso é tecnicamente errado e potencialmente confuso depois que ele descobre o K-11.

### 1.3 Após upload — card de resultado heurístico
Para cada faixa processada, o usuário vê, em ordem:

1. Score grande (cor por faixa: verde/âmbar/vermelho) com label
2. Preview player (audio toca localmente — bom)
3. Gênero provável (top-3 barras horizontais com %)
4. Sound feature grid (DSP features: energia, loudness, peak, dynamic range, …)
5. Aviso se Essentia falhou: "Descritores da Essentia indisponíveis"
6. **Lista de "signals"** (4 bullets explicando por que ganhou/perdeu pontos — muito bom para o leigo)
7. ⬇ **Bloco K-11** — abaixo de tudo

**Hierarquia visual**: heurística (familiar, colorida) domina o topo. K-11 fica como apêndice ao final. Para um leigo isso é "primeiro o fácil, depois o opcional" — coerente.

### 1.4 K-11 — bloco novo
Abaixo dos signals, o usuário encontra:

- Label "Diagnóstico K-11" + chip do gênero escolhido (depois de diagnosticar)
- **FeatureOriginChips**: 11 chips coloridos (essentia verde, DSP azul, proxy amarelo, metadata cinza) com PT-BR curto + confiança em % + botão `?` expansível
- Linha de controle:
  - Label "Gênero K-11 (override):"
  - **`<select>` com 107 opções** sem search/filter
  - Botão **"Diagnosticar com K-11"**
- Se a lista de gêneros falhou: error-banner explicando

### 1.5 K-11 — após clicar "Diagnosticar"
O card mostra:

- Score grande (mesma linguagem de cor)
- Label "Alta chance" / "Potencial médio" / "Baixa chance"
- Subline com `Gênero K-11: <code>{genero}</code>`
- HDI bar 94% com caption "Score: X (HDI 94%: lo a hi)" e `<dl>` semântico com limite inferior/superior
- **Explicação LLM** em PT-BR (ou mensagem de fallback "Explicação automática indisponível…")
- Latência do servidor (caption discreto): "{ms_per_call} ms"
- Tabela "Origem das 11 features" (lista as 11 com barra de confiança)
- **Disclaimer**: "K-11 é experimental (R²=0.15, HDI coverage=0.40). Use como indicação, não predição exata."

---

## 2. Avaliação por critério

### 2.1 Landing — comunicador?
- ✅ Lead explica o produto em 1 frase.
- ⚠ CTAs equivalentes, mas "Analisar música" (Spotify-track flow) está em destaque sobre "Enviar minha música" (que é o caso de uso do produtor). Para a persona-alvo, **o upload deveria ser o CTA primário**.

### 2.2 Dropzone visível e claro?
- ✅ Label visível, formatos declarados, drag-and-drop funcional.
- ✅ Limite de 50 MB e duração ≥ 5s são tratados: erro amigável por caso (0 bytes, >50MB, <5s, codec não suportado).
- ⚠ Os formatos suportados aparecem só depois que se entra na tela; landing poderia reforçar.

### 2.3 Análise heurística
- ✅ Score grande, gênero provável, features visíveis, signals em linguagem natural.
- ✅ Preview player local (privacidade reforçada).
- ✅ Disclaimer do GTZAN é honesto sobre acurácia e viés norte-americano.

### 2.4 K-11 diagnose
- ⚠ **Boto "Diagnosticar com K-11"**: **está embaixo de 6 seções no card**. Usuário olha o score heurístico, vê "tudo certo", pode fechar o card sem descobrir que existe análise experimental. Não há teaser que diga "tem um diagnóstico Bayesiano também".
- ⚠ **Select com 107 gêneros**: renderiza todos os `<option>` num `<select>` nativo. Sem search, sem agrupamento, sem "top gêneros para começar". Para achar `trap` ou `sertanejo-universitario` o usuário rola muito.
- ✅ Após clicar: card aparece com score grande, HDI visível, gêner no rodapé do score.
- ✅ Score padronizado (mesma cor/label do heurístico — boa consistência).
- ✅ HDI 94% é honesto sobre incerteza do modelo Bayesiano.
- ⚠ **Explicação LLM "indisponível"** (esperado sem `OPENROUTER_API_KEY`): o texto é "Explicação automática indisponível; o score foi calculado, mas a interpretação em texto falhou." — não indica explicitamente que é fallback da LLM, pode soar como limitação permanente do modelo.
- ⚠ **Disclaimer experimental** (R²=0.15, HDI coverage=0.40) está no **rodapé do card**, depois da tabela de features. Usuário pode tomar decisão (publicar a faixa?) antes de ver o disclaimer. R²=0.15 também é jargão estatístico que leigo não entende.
- ✅ Chips de origem funcionam. Botão `?` expansível com legenda PT-BR. Cores distinguem bem (essentia verde, DSP azul, proxy amarelo, metadata cinza). Anel branco para confiança ≤ 0.5 indica "fraco" — bom.

### 2.5 Loading states
- ✅ "Analisando '{nome}'…" durante decode.
- ✅ "Diagnosticando..." no botão K-11 durante fetch.
- ✅ "Analisando com K-11..." no card durante fetch.
- ⚠ **Primeira chamada a `/api/diagnose` no dev**: observei um 404 transitório (rota a ser compilada). Em produção seria instantâneo. Não é bloqueador em prod, mas em dev/QA pode confundir.

### 2.6 Tratamento de erros
- ✅ Erros de upload (0 bytes, >50MB, <5s) são específicos e mostram o arquivo problemático pelo nome.
- ✅ Erro de decode genérico: "Tente enviar um MP3, WAV, M4A, OGG ou FLAC."
- ✅ Falha de `/api/generos`: error-banner explica "diagnóstico fica desabilitado até a lista carregar".
- ✅ Gênero inválido no backend: devolve lista de `valid_generos` (no client não tem como o usuário errar via select, mas a defesa existe).
- ⚠ Erro do K-11 client: cai no estado `error` do `K11DiagnoseCard` (componente) — não na row do card de upload. O usuário vê o card vazio genérico em vez do erro inline. Para um produtor isso quebra a sensação de continuidade.

---

## 3. Issues de UX (ranked)

### BLOCKER

**B1 — Select de 107 gêneros sem search/filter/pagination** — `UploadAnalyzer.tsx:513-538`
- Para o persona (produtor musical brasileiro procurando gênero específico como "trap", "sertanejo-universitario", "funk-carioca") o dropdown nativo é ineficiente: rolar 107 itens num `<select>` é ruim em qualquer SO/navegador.
- Não há agrupamento nem "populares para começar".
- Esforço de fix: ~2-4h (combobox custom ou `datalist` com `<input type="search">` + filtro client-side).

**B2 — Disclaimer experimental (R²=0.15, HDI=0.40) escondido no rodapé** — `K11DiagnoseCard.tsx:243-245`
- Aparece depois de score, HDI, explicação LLM, latência e tabela de features. Para um produtor prestes a tomar decisão, o disclaimer precisa ser upfront — não no rodapé.
- "R²=0.15" é jargão que leigo não entende.
- Esforço de fix: 30 min (mover disclaimer para o topo, traduzir R²/HDCI em frase simples).

### MAJOR

**M1 — Inconsistência: aviso "GTZAN não tem gêneros brasileiros" coexiste com K-11 que TEM** — `UploadAnalyzer.tsx:411-414` + `/api/generos`
- O disclaimer GTZAN diz "sertanejo cai em country, MPB costuma cair em jazz, funk em hip-hop". Mas o usuário pode, logo abaixo, diagnosticar com K-11 usando exatamente `sertanejo`, `mpb`, `funk`, `pagode`, `samba`, `forro` como gênero de override. Isso é confuso: "se o K-11 tem, por que o heurístico mente?"
- Esforço de fix: 30 min (atualizar disclaimer para mencionar que K-11 cobre brasileiros, GTZAN não).

**M2 — Botão "Diagnosticar com K-11" é achável mas não é convidativo** — `UploadAnalyzer.tsx:540-555`
- Está embaixo de 6 seções (score, player, gênero, features, essentia-note, signals). Usuário olha o score heurístico e fecha o card.
- Não há teaser que sugira o K-11 como "análise complementar".
- Esforço de fix: 1-2h (adicionar pill/teaser logo após o score heurístico: "Quer uma análise Bayesiana experimental? → Diagnosticar").

**M3 — LLM fallback "indisponível" não indica que é fallback temporário** — `K11DiagnoseCard.tsx:204` + `llmExplanation.ts`
- O texto é "Explicação automática indisponível; o score foi calculado, mas a interpretação em texto falhou." — leigo pode interpretar como limitação do modelo, não da configuração de servidor.
- Esforço de fix: 30 min (prepend "Explicação automática indisponível (sem LLM configurado): o score é confiável, mas a interpretação em texto só vem com chave de API configurada.").

**M4 — Erro do K-11 some do contexto do card** — `UploadAnalyzer.tsx:557-562`
- Quando `k11Error` dispara, aparece um error-banner global em vez de inline no card de resultado. Para um produtor que tem 3 arquivos enviados, qual deles falhou? Não fica claro.
- Esforço de fix: 1h (mover o error-banner para dentro do `k11-block` do card correspondente).

### MINOR

**m1 — Latência "{ms_per_call} ms" é ruído dev/ops para usuário final** — `K11DiagnoseCard.tsx:209-211`
- Para um produtor, o número é só confusão. Pode ser interessante para devs.
- Esforço de fix: 5 min (mover para uma tooltip ou simplesmente remover).

**m2 — Copy "Gênero K-11 (override):" sugere que o K-11 corrige o GTZAN** — `UploadAnalyzer.tsx:511`
- O leigo pode entender "override" como "corrigir o gênero errado detectado".
- Esforço de fix: 10 min (renomear para "Gênero K-11 alvo:" ou "Gênero para diagnosticar:").

**m3 — CTAs da landing priorizam o fluxo Spotify sobre o upload** — `LandingHero.tsx:37-48`
- Para um produtor (persona-alvo do MVP), o caminho "Enviar minha música" deveria ser o CTA primário. Hoje é o secundário.
- Esforço de fix: 15 min (trocar as classes `cta-primary` e `cta-secondary`, ou reposicionar).

**m4 — Chip "tom" sugere campo musical, mas é `mode_bin` (maior/menor)** — `FeatureOriginChips.tsx:61`
- Para um leigo, "tom" pode confundir com key (que não está no K-11). Não é bloqueador porque aparece junto com o score/label.
- Esforço de fix: 5 min (renomear para "modo" ou "escala").

### NIT

**n1 — `Popularity Lab` no brand row é genérico; poderia reforçar "sua música"** — `LandingHero.tsx:25`
**n2 — Botão `?` dos chips é só 18x18px; alvo de toque pequeno em mobile** — `FeatureOriginChips.tsx:135-148`
**n3 — Disclaimer e gênero ficam como `<code>` monoespaçado, ótimo para dev mas estilizado demais para leigo** — `K11DiagnoseCard.tsx:159`
**n4 — Limite de 50 MB é decido silenciosamente (no error path), poderia aparecer como dica no dropzone** — `UploadAnalyzer.tsx:406`

---

## 4. Sugestões concretas (com esforço)

| # | Mudança | Esforço | Impacto |
|---|---------|---------|---------|
| 1 | Substituir `<select>` 107-opções por combobox com search + grupo "Populares no Brasil" | 2-4h | Resolve B1 |
| 2 | Mover disclaimer experimental para o topo do `K11DiagnoseCard`, traduzir R²/HDCI em linguagem leiga ("O modelo explica só ~15% da variação real entre hits e não-hits") | 30 min | Resolve B2 |
| 3 | Atualizar aviso GTZAN para mencionar que K-11 cobre brasileiros (`sertanejo`, `mpb`, `funk`, `pagode`, `samba`, `forro`) | 30 min | Resolve M1 |
| 4 | Adicionar teaser pill após o score heurístico: "Quer uma análise Bayesiana experimental? Ver diagnóstico K-11 ↓" | 1-2h | Resolve M2 |
| 5 | Reescrever fallback LLM para indicar que é fallback de configuração, não limitação do modelo | 30 min | Resolve M3 |
| 6 | Mover `error-banner` do K-11 para dentro do `k11-block` do card correspondente | 1h | Resolve M4 |
| 7 | Trocar CTAs primário/secundário da landing (ou reposicionar) | 15 min | Resolve m3 |
| 8 | Remover ou tooltip-ificar latência `{ms_per_call} ms` | 5 min | Resolve m1 |
| 9 | Renomear "Gênero K-11 (override):" para "Gênero-alvo K-11:" | 10 min | Resolve m2 |
| 10 | Renomear chip "tom" para "modo" | 5 min | Resolve m4 |

**Total estimado para NEEDS-FIXES-BEFORE-SHIP virar SHIP-READY:** ~6-10 horas.

---

## 5. Verdict

**NEEDS-FIXES-BEFORE-SHIP.**

A fundação está sólida: copy em PT-BR, hierarquia visual coerente, erros de upload bem tratados, FeatureOriginChips honesto sobre origem/confiança, HDI Bayesiano exposto, loading states presentes. Mas para a persona-alvo (produtor brasileiro):

1. **107 gêneros sem search** é fricção real no momento de maior engajamento (quando o usuário está curioso pra testar).
2. **Disclaimer R²=0.15** está escondido no rodapé — quem vai tomar decisão pode não ver.
3. **Aviso GTZAN dizendo "sem brasileiros"** enquanto o K-11 tem — quebra confiança.

Esses três pontos são pequenos de corrigir (~6-10h total) mas afetam o "momento da verdade" do MVP. Sem eles, o produto é honesto mas friccionado; com eles, é honesto **e** convidativo.

**Recomendação:** aplicar pelo menos B1 (combobox), B2 (disclaimer upfront) e M1 (corrigir copy do GTZAN) antes de qualquer demo externa. Os outros (M2-M4, m1-m4) podem entrar em Wave 5 de polish.

---

## 6. Apêndice técnico

- HTTP 200 na landing, 12.8 KB de HTML server-side. Copy visível ao primeiro load: "Popularity Lab", "Spotify · análise musical", "Descubra o que a sua música tem por dentro.", "Analisar música", "Enviar minha música", 3 highlights. Não há preview de "MP3" ou "K-11" no HTML inicial — só após o usuário clicar.
- `/api/generos` retorna **107** gêneros incluindo `sertanejo, mpb, funk, brazil, pagode, samba, forro`.
- `/api/diagnose` para `genero=rock`: `{"score":2,"hdi_94":[1,2],"explicacao":"Explicação automática indisponível…","ms_per_call":441}` (HTTP 200).
- `/api/diagnose` para `genero=sertanejo`: `{"score":47,"hdi_94":[39,55],"explicacao":"Explicação automática indisponível…","ms_per_call":169}` (HTTP 200). K-11 distingue sertanejo — bom.
- `/api/diagnose` para gênero inválido: HTTP 400 com `{error, valid_generos:[…107 itens]}`.
- Primeira chamada a `/api/diagnose` após cold-start pode retornar 404 transitório enquanto o dev server compila a rota. Em produção é cacheado; não é bloqueador para prod.

**Arquivos relevantes:**
- `C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\src\app\page.tsx`
- `C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\src\components\SpotifyAnalyzer.tsx`
- `C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\src\components\UploadAnalyzer.tsx`
- `C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\src\components\K11DiagnoseCard.tsx`
- `C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\src\components\FeatureOriginChips.tsx`
- `C:\Users\tito\OneDrive\Documentos\Projetos\spotify_challenge\insights-spotfy-grupo-4\src\components\LandingHero.tsx`