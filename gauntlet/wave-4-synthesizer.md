# Wave 4 — Synthesizer (unificação dos 3 critics)

**Date:** 2026-09-04
**Role:** combinação de `wave-4-critic-functional.md`, `wave-4-critic-ux.md`, `wave-4-critic-accuracy.md` para decisão de go/no-go do PR.
**Premissa:** os 3 critics julgaram de forma independente (fresh context, sem ler uns aos outros). Issues idênticas ou sobrepostas foram agregadas com menção aos múltiplos relatores.

---

## Sumário (3 bullets)

- **3 blockers de honestidade** no card K-11 (labels "Alta chance" verde/âmbar/vermelho, HDI 94% sem flag de cobertura empírica 40%, variação por gênero RMSE 4→38 não comunicada) **e 1 blocker de UX** (select com 107 gêneros sem search). Crítico: o produto está **tecnicamente reportando os números certos** mas **comunicando confiança que as métricas não sustentam**.
- **9 majors** cruzando UX, funcional e accuracy — várias com sobreposição (disclaimer escondido, LLM fallback silencioso, ms_per_call displayed, HDI largura ignorada no tom). Esforço total estimado para fechar tudo: **~10-15h** de trabalho de UX/copy/backend.
- **Verdict: NEEDS-FIXES-BEFORE-SHIP.** Não é MAJOR-REWORK (chips de origem, disclaimer, route estável — a infraestrutura existe), mas o total de blockers+majors ultrapassa o limiar de "≤3 majors corrigíveis em <1h". Recomendação: aplicar o pacote **honesty-pass + combobox + disclaimer-upfront** antes do PR; nits e polimentos podem ir para Wave 5.

---

## Issues unificados (ordenados por severidade)

### BLOCKER (impedem PR)

| ID | Severidade | Issue | Arquivo:linha | Esforço | Critic(s) |
|----|------------|-------|---------------|---------|-----------|
| B1 | BLOCKER | "Alta chance" / "Potencial médio" / "Baixa chance" em verde/âmbar/vermelho num modelo R²=0.15 — greenwashing lexical; leigo associa "verde = recomendado" e age na recomendação | `K11DiagnoseCard.tsx:50-54` + `globals.css` (classes `upload-score.high/mid/low`) | 1h (substituir labels + cor condicional à largura do HDI) | **Accuracy H1** |
| B2 | BLOCKER | HDI mostrado como "HDI 94%" sem flag de descalibração — cobertura empírica = 40%; em 60% dos casos o valor real está fora do intervalo. É a feature que deveria comunicar incerteza e está mentindo | `K11DiagnoseCard.tsx:168-198` + `llmExplanation.ts:45-53` (prompt) | 30 min (adicionar texto inline: "Cobertura empírica: 40% (nominal: 94%)") | **Accuracy H2** |
| B3 | BLOCKER | Variação por gênero (RMSE 4.02 → 37.88) **não comunicada**. Usuário de "dance" (RMSE 37.88, inutilizável) recebe mesma confiança que usuário de "forró" (RMSE 4.02, útil) | `route.ts` (não retorna `rmse_g`) + `K11DiagnoseCard.tsx` (não exibe badge) | 2h (adicionar `rmse_g` ao payload + per-genre reliability badge, ou esconder score quando RMSE_g > 25) | **Accuracy H3** |
| B4 | BLOCKER | Select com 107 gêneros sem search/filter/pagination no momento de maior engajamento — fricção real para `trap`, `sertanejo-universitario`, `funk-carioca` | `UploadAnalyzer.tsx:513-538` | 2-4h (combobox custom ou `<datalist>` + filtro client-side + grupo "Populares no Brasil") | **UX B1** |

### MAJOR (vergonha de mandar pro usuário)

| ID | Severidade | Issue | Arquivo:linha | Esforço | Critic(s) |
|----|------------|-------|---------------|---------|-----------|
| M1 | MAJOR | Disclaimer experimental (R²=0.15, HDI coverage=0.40) é linha discreta no rodapé, depois de score/HDI/features — quem toma decisão pode não ver. "R²=0.15" é jargão que leigo não traduz | `K11DiagnoseCard.tsx:243-245` | 30 min (mover para o topo, traduzir magnitude: "modelo explica só ~15% da variação…") | **UX B2, Accuracy M1** (deduplicado) |
| M2 | MAJOR | Inconsistência: aviso GTZAN diz "sem gêneros brasileiros (sertanejo cai em country, MPB em jazz, funk em hip-hop)" mas K-11 TEM sertanejo, mpb, funk, pagode, samba, forro (107 gêneros) | `UploadAnalyzer.tsx:411-414` + `/api/generos` | 30 min (atualizar disclaimer: "GTZAN não cobre brasileiros; K-11 cobre 107 incluindo sertanejo, mpb, funk, pagode, samba, forro") | **UX M1** |
| M3 | MAJOR | LLM fallback "Explicação automática indisponível" não indica que é temporário/falta de `OPENROUTER_API_KEY` — soa como limitação permanente do modelo. Sem flag programático (`explicacao_source: "llm" | "fallback"`), clientes/dashboards não distinguem sucesso de fallback | `K11DiagnoseCard.tsx:204` + `llmExplanation.ts:65-66` | 30 min (prepend "(sem LLM configurado): …" + adicionar `explicacao_source` ao payload) | **UX M3, Functional M2** (deduplicado) |
| M4 | MAJOR | Botão "Diagnosticar com K-11" é achável mas não convidativo — está embaixo de 6 seções; não há sinal de que existe análise Bayesiana complementar | `UploadAnalyzer.tsx:540-555` | 1-2h (adicionar pill teaser após score heurístico: "Quer uma análise Bayesiana experimental? → Diagnosticar") | **UX M2** |
| M5 | MAJOR | Erro do K-11 some do contexto do card — quando `k11Error` dispara, aparece error-banner global em vez de inline no card de upload. Para produtor com várias faixas, qual delas falhou? | `UploadAnalyzer.tsx:557-562` | 1h (mover error-banner para dentro do `k11-block` do card correspondente) | **UX M4** |
| M6 | MAJOR | LLM blocking request sem timeout explícito — slow OpenRouter upstream (30+s retry) bloqueia toda a resposta HTTP e queima Node worker | `llmExplanation.ts:60-67` | 15-20 min (Adicionar `timeout` no construtor do OpenAI client + `Promise.race` com AbortController) | **Functional M1** |
| M7 | MAJOR | Prompt do LLM não recebe caveat de incerteza — LLM escreve causalidade confiante ("dançabilidade puxa pra cima") como se modelo fosse ground truth, sem hedge | `llmExplanation.ts:45-53` | 30 min (prepend: "LEMBRETE: modelo K-11 tem R²=0.15, HDI coverage=0.40. Use hedge. Se HDI_largo > 30, diga explicitamente que modelo está inseguro.") | **Accuracy M2** |
| M8 | MAJOR | Tom (high/mid/low) determinístico pelo score — ignora largura do HDI. Score 60 com HDI [55, 65] = "Potencial médio" (âmbar confiante); score 60 com HDI [10, 90] = mesmo label. Largura do HDI não muda o tom | `K11DiagnoseCard.tsx:44-48` + cor `scoreTone(score)` | 1h (incorporar largura do HDI: `scoreTone(score, hdiWidth)` — HDI_largo > 30 força cor cinza + ícone ?) | **Accuracy M3** |
| M9 | MAJOR | ECE=6.56 não reportado em lugar nenhum — é a métrica canônica de "modelo sabe o que não sabe", e está ruim | `q11_summary.json` (tem o dado) + `route.ts` (não propaga) | 30 min (adicionar `calibration.ece` ao payload + mostrar no card) | **Accuracy M4** |

### MINOR (polimento desejável)

| ID | Severidade | Issue | Arquivo:linha | Esforço | Critic(s) |
|----|------------|-------|---------------|---------|-----------|
| m1 | MINOR | Latência "{ms_per_call} ms" é ruído dev/ops para usuário final — confusão sem valor | `K11DiagnoseCard.tsx:209-211` | 5 min (mover para tooltip ou remover da UI pública) | **UX m1, Functional n1** (deduplicado) |
| m2 | MINOR | "Gênero K-11 (override):" sugere que K-11 corrige o GTZAN — leigo entende "corrigir gênero errado detectado" | `UploadAnalyzer.tsx:511` | 10 min (renomear para "Gênero-alvo K-11:" ou "Gênero para diagnosticar:") | **UX m2** |
| m3 | MINOR | CTAs da landing priorizam Spotify ("Analisar música") sobre upload ("Enviar minha música"); para persona-alvo (produtor), upload deveria ser o primário | `LandingHero.tsx:37-48` | 15 min (trocar classes `cta-primary`/`cta-secondary`) | **UX m3** |
| m4 | MINOR | Chip "tom" sugere campo musical, mas é `mode_bin` (maior/menor) | `FeatureOriginChips.tsx:61` | 5 min (renomear para "modo" ou "escala") | **UX m4** |
| m5 | MINOR | Zod validation error expõe path interno `"track_features"` — útil para dev, leak para cliente | `route.ts:50-55` | 5 min (mapear Zod errors para PT-BR: "Danceability deve estar entre 0 e 1") | **Functional m1** |
| m6 | MINOR | Module-load error path é opaco — se `k11_posterior_samples.json.gz` está missing, server sobe mas todo `/api/diagnose` retorna 500 sem mensagem clara | `artifacts.ts:14-18` | 10 min (fail-loud no startup com mensagem de erro útil) | **Functional m4** |
| m7 | MINOR | `predict()` clampa por-sample a [0,100] mas `score = mean` é arredondado sem re-clamp — em caso degenerado (N=1 ou clamp quebrado) score poderia quebrar contrato | `k11Model.ts:55-60` | 1 min (1 linha: `score = Math.max(0, Math.min(100, sum / N))`) | **Functional m5** |
| m8 | MINOR | "Modelo Bayesiano hierárquico · 11 features · 107 gêneros" — retórica técnica mascara qualidade ruim (modelo falha 3/3 thresholds) | `K11DiagnoseCard.tsx` (intro/eyebrow) | 15 min (revisar copy para ser informativa, não inflada) | **Accuracy L1** |
| m9 | MINOR | Score com 1 casa decimal (ex: "65.0") sugere precisão que RMSE=19 nega | `K11DiagnoseCard.tsx` (formatação) | 5 min (arredondar para inteiro ou adicionar caveat) | **Accuracy L2** |
| m10 | MINOR | Disclosure dos 5 chips proxy exige clicar "?" — usuário que vê de relance não capta "amarelo = estimativa" | `FeatureOriginChips.tsx` (tooltip + help) | 15 min (adicionar glifo inline "est." ou "≈" no chip amarelo) | **Accuracy L3** |
| m11 | MINOR | AGENTS.md não alerta o time que R²=0.15, HDI=0.40, 3/3 assertions falham — devs futuros não saberão | `AGENTS.md` (58 linhas) | 15 min (adicionar seção "Status do modelo" com métricas e implicações) | **Accuracy L4** |

### NIT (cosmético)

| ID | Issue | Esforço | Critic(s) |
|----|-------|---------|-----------|
| n1 | "Popularity Lab" no brand row é genérico — poderia dizer "Spotify Lab" ou "Popularidade" | 5 min | **UX n1** |
| n2 | Botão `?` dos chips é 18x18px — alvo de toque pequeno em mobile | 15 min | **UX n2** |
| n3 | Disclaimer/gênero como `<code>` monoespaçado, estilizado demais para leigo | 5 min | **UX n3** |
| n4 | Limite de 50 MB só aparece no error path — poderia ser dica no próprio dropzone | 5 min | **UX n4** |
| n5 | `genero` em success body echoes request — redundância, doc-only | 0 min | **Functional m2** |
| n6 | `/` HTML shell 12.8 KB mas UploadAnalyzer (use client) não está no SSR — SEO vê página vazia | 0 min (não bloqueador MVP) | **Functional m3** |
| n7 | Cold first-POST ms=834 em dev é warmup — em prod com Vercel cold start pode ser maior | 0 min (flag for ops) | **Functional n2** |
| n8 | HDI nome `hdi_94` vs `hdi_94_pct` — Math.floor(N*0.03)/floor(N*0.97) dá 94% span em N=1000 | 0 min (doc) | **Functional n3** |
| n9 | `resp.choices[0].message.content ?? 'indisponível'` — fallback interno é unreachable (SDK joga antes) | 0 min | **Functional n4** |
| n10 | `process.cwd() + 'artifacts'` hardcoded — não-portável para edge runtime | 0 min | **Functional n5** |

---

## Cobertura por critic

| Critic | Issues que apontou | Blocker / Major / Minor / Nit |
|--------|--------------------|---------------------------------|
| **Functional** | M1, M2, m1, m2, m3, m4, m5, n1–n5 | 0 / 2 / 5 / 5 |
| **UX** | B1, B2, M1, M2, M3, M4, m1, m2, m3, m4, n1–n4 | 2 / 4 / 4 / 4 |
| **Accuracy** | H1, H2, H3, M1, M2, M3, M4, L1, L2, L3, L4 | 3 / 4 / 4 / 0 |

**Sobreposições (mesma issue, critics diferentes):**
- UX B2 + Accuracy M1 = M1 (disclaimer no rodapé)
- UX M3 + Functional M2 = M3 (LLM fallback silencioso)
- UX m1 + Functional n1 = m1 (ms_per_call display noise)

---

## Verdict final

### **NEEDS-FIXES-BEFORE-SHIP**

**Justificativa numérica:**

| Critério strict | Observado | Match? |
|-----------------|-----------|--------|
| 0 blockers | **4 blockers** | NÃO |
| ≤3 majors corrigíveis em <1h | **9 majors** (4 deles >1h) | NÃO |
| >3 minors | **11 minors** | SIM |
| ≥1 blocker | SIM | SIM (MAJOR-REWORK no critério strict) |

Pela definição estrita, isso seria **MAJOR-REWORK** (≥1 blocker + majors >1h). Mas:
- Accuracy-critic argumentou explicitamente "Não é MAJOR-REWORK porque infraestrutura de disclosure já existe, números estão sendo reportados, é trabalho de UX/copy, não de modelo".
- UX-critic propôs NEEDS-FIXES-BEFORE-SHIP com ~6-10h estimadas.
- Functional-critic deu PASS (com follow-ups para M1+M2).

**Decisão:** **NEEDS-FIXES-BEFORE-SHIP**, borderline. O trabalho é concentrado em UX/copy/backend (sem re-treinamento de modelo, sem nova arquitetura), mas é significativo (~10-15h). Pode ser absorvido num único PR de honesty-pass + UX polish + LLM timeout.

**O que muda se os blockers forem corrigidos:**
- Sem B1 (combobox): produtor desiste no dropdown de 107 itens = produto não usado.
- Sem B2 (HDI flag): usuário confia em intervalo que erra 60% das vezes = decisão ruim.
- Sem B3 (per-genre badge): "dance" recebe mesma UI que "forró" mas é 9.4x pior = erro sistemático.
- Sem B4 (Alta chance verde): leigo age na recomendação de modelo que explica 15% da variância = dano.

---

## Próximos passos concretos (ordenados por impacto)

### Pacote A — Honesty pass no card K-11 (3h, fecha B1+B2+B3+M1+M3+M7+M8+M9)

Ordem sugerida (cada uma é commit-friendly):

1. **Adicionar `rmse_g`, `calibration.ece` ao payload de `/api/diagnose`** (B3, M9) — 30 min. Carregar `q11_per_genre.csv` e `q11_summary.json` no `artifacts.ts`, fazer lookup, retornar no body.
2. **Substituir `scoreTone(score)` por `scoreTone(score, hdiWidth)`** (B1, M8) — 1h. Labels condicionais:
   - `score >= 70 && hdiWidth < 30` → "Possivelmente alta" (verde-claro)
   - `score >= 70 && hdiWidth >= 30` → "Possivelmente alta — modelo incerto" (verde-claro + ⚠)
   - qualquer score com `hdiWidth >= 50` → "Incerto — não recomendado para decisão" (cinza + ⚠)
3. **Adicionar texto inline no HDI bar: "Cobertura empírica: 40% (nominal: 94%)"** (B2) — 15 min.
4. **Adicionar per-genre reliability badge ao lado do gênero** (B3) — 30 min: `rmse_g < 8` verde, `8-15` âmbar, `>25` vermelho, `>25` opcionalmente esconde o score.
5. **Mover disclaimer para o topo e reescrever em linguagem leiga** (M1) — 30 min: "Este modelo explica ~15% da variação real entre hits e não-hits, e erra em média 19 pontos em escala 0-100. Use como sinal fraco, não como predição."
6. **Prepend caveat no prompt do LLM** (M7) — 15 min. Texto do accuracy-critic §5.
7. **Adicionar `explicacao_source: "llm" | "fallback"` ao payload** (M3) — 15 min.
8. **Atualizar disclaimer GTZAN para dizer que K-11 cobre brasileiros** (M2) — 30 min.

### Pacote B — UX polish (4h, fecha B4 + M4 + m1 + m2 + m3 + m4 + m5)

9. **Substituir `<select>` 107-opções por combobox com search** (B4) — 2-4h. Combobox custom (mantém acessibilidade nativa) ou `<datalist>` + `<input type="search">` com filtro client-side + grupo "Populares no Brasil" no topo.
10. **Adicionar pill teaser após score heurístico** (M4) — 1-2h.
11. **Mover error-banner do K-11 para dentro do card correspondente** (M5) — 1h.
12. **Esconder/mover `{ms_per_call}` para tooltip** (m1) — 5 min.
13. **Renomear "Gênero K-11 (override):" → "Gênero-alvo K-11:"** (m2) — 10 min.
14. **Trocar CTAs primário/secundário da landing** (m3) — 15 min.
15. **Renomear chip "tom" → "modo"** (m4) — 5 min.

### Pacote C — Backend hardening (30 min, fecha M6 + m6 + m7)

17. **Adicionar timeout no OpenAI client (10s) + AbortController** (M6) — 15-20 min.
18. **Mapear Zod errors para PT-BR** (m5) — 5 min.
19. **Adicionar fail-loud no startup de `artifacts.ts`** (m6) — 10 min.
20. **Adicionar re-clamp no `score = mean`** (m7) — 1 min.

### Pacote D — Docs & nits (45 min, follow-up opcional)

21. **Atualizar `AGENTS.md` com seção "Status do modelo"** (m11) — 15 min.
22. **Nits**: `n1`-`n10` — ride along em commits separados ou PR de polish.

---

## Estimativa de tempo

| Pacote | Items | Esforço | Pode ir para follow-up? |
|--------|-------|---------|-------------------------|
| Pacote A — Honesty pass | 8 items | **3h** | NÃO — bloqueadores |
| Pacote B — UX polish | 7 items | **4-5h** | Parcial — B4 é bloqueador, resto pode esperar Wave 5 |
| Pacote C — Backend hardening | 4 items | **30 min** | NÃO — M6/M7 são majors |
| Pacote D — Docs & nits | 11 items | **45 min** | SIM — follow-up PR |

**Total crítico (Pacote A + C + B4):** ~7-8h.
**Total antes do PR:** ~7-8h + polish items do Pacote B (~12-15h total).
**Mínimo aceitável para "MVP honesto":** Pacote A + C (~3.5h). Sem B4 o select de 107 gêneros fica friccionado mas não desonesto.

### Recomendação final

- **PR-1 (este PR):** Pacote A + C + B4 (~7-8h) — fecha todos os blockers + todos os majors de honesty/backend. Sem isso o produto é desonesto.
- **PR-2 (Wave 5 polish, opcional):** resto do Pacote B (M4 teaser pill, M5 error inline, m1-m4 copy) — UX polish sem urgência.
- **PR-3 (docs):** Pacote D — follow-up.

**Go/no-go:** **NEEDS-FIXES-BEFORE-SHIP.** Não abrir PR antes de aplicar Pacote A + C + B4.