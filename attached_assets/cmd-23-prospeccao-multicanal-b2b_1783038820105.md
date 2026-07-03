# COMANDO 23 — Prospecção Multicanal B2B: CNPJ/CNAE, LinkedIn e Novas Fontes

**Stack:** Node + Drizzle + Supabase · integra com cmd-22 (motor preditivo)  
**Objetivo:** expandir o Prospector de 1 fonte (Google Places) para um hub multicanal de descoberta B2B, onde cada fonte alimenta o mesmo pipeline: descoberta → enriquecimento → score → SDR

---

## PANORAMA — as fontes e o que cada uma entrega

| Fonte | O que entrega | Sinal único | Custo | Prioridade |
|---|---|---|---|---|
| **CNPJ/CNAE (Receita)** | TODAS as empresas do Brasil filtráveis por atividade, cidade, porte, data de abertura | 🥇 Empresas RECÉM-ABERTAS (o melhor lead que existe) | Grátis (dados abertos) a R$20-50/mês (API) | **1º** |
| Google Places | Empresas com presença física + reviews | Reputação e reclamações reais | Já integrado | ✅ feito |
| **Cruzamento CNPJ × Places** | Empresa existe na Receita mas NÃO no Google | 🥇 Zero presença digital = dor máxima | Grátis (cruzamento interno) | **2º** |
| **Meta Ad Library** | Empresas anunciando no Instagram/Facebook | Está investindo em marketing = tem verba + demanda | Grátis (API pública) | **3º** |
| **Vagas de emprego** | Empresas contratando (Indeed/Gupy/LinkedIn Jobs públicos) | Expansão de equipe = crescimento | Grátis (scraping leve/RSS) | 4º |
| **LinkedIn** | Decisores por cargo + empresa | Nome do dono/gerente para abordagem | Sales Navigator manual ou APIs de enriquecimento (Proxycurl-like, ~$0,01-0,03/perfil) | 5º |
| Registros profissionais (CRECI, CRO, CRM, CREA) | Imobiliárias, clínicas, escritórios por região | Verticais regulamentadas mapeadas | Grátis (consulta pública) | v2 |
| Reclame Aqui | Empresas com reclamações de atendimento | Dor de atendimento documentada | Scraping cuidadoso | v2 |
| Marketplaces (iFood, Mercado Livre) | Sellers ativos por região | Já vende online mas sem gestão | Scraping | v2 |

---

## FASE 1 — Fonte CNPJ/CNAE (a mina de ouro)

### Provider recomendado

```
Início:  CNPJá API comercial ou CNPJ.ws Premium (filtros por CNAE+cidade+data)
         ~R$ 30-100/mês conforme volume — validação rápida
Escala:  Pipeline próprio com dados abertos da RFB (dump mensal, 60M+ CNPJs)
         → tabela local `empresas_brasil` no Supabase, custo zero por consulta
         → projetos base: OpenCNPJ / minha-receita (ETL pronto)
Secret: CNPJ_API_KEY
```

### Nova aba no Prospector: "Busca CNPJ"

```
Filtros:
- CNAE (dropdown com busca — ex: 4744-0/99 Materiais de construção)
- Cidade/UF
- Data de abertura: [últimos 30d | 90d | 6m | 1 ano | qualquer]  ← O FILTRO DE OURO
- Porte: MEI | ME | EPP | Demais
- Situação: Ativa (fixo)
- Com telefone / com email (dados da Receita)

Resultado por empresa:
razão social, fantasia, CNPJ, CNAE principal+secundários, endereço,
telefone, email, data abertura, porte, sócios (QSA), capital social

Botão [Prospectar] → mesmo fluxo do cmd-10 (lead+deal+briefing)
com metadata.source = 'cnpj' e os dados societários salvos em dados_pj
(a diferenciação PF/PJ já existente recebe CNPJ e sócios automaticamente)
```

### Mapeamento CNAE → vertical (alimenta o SDR adaptativo do cmd-22)

```sql
CREATE TABLE IF NOT EXISTS cnae_vertical_map (
  cnae text PRIMARY KEY, vertical text, prioridade int
);
-- Seeds: 4744* → materiais_construcao | 6822* → imobiliaria |
-- 8630* → saude | 9602* → salao_beleza | 4711/4712 → mercado |
-- 4771 → farmacia | 5611 → alimentacao | 4120 → construcao ...
```

### O play "empresa recém-aberta"

```
Cron semanal: buscar CNPJs abertos nos últimos 30 dias nos CNAEs-alvo da região
→ criar leads com priority_reason = "Empresa aberta há {X} dias — montando operação"
→ boost +20 no propensity score
→ SDR usa template específico:
  "Parabéns pela abertura da {fantasia}! Empresas novas que estruturam o
   atendimento desde o início crescem 2x mais rápido. Posso te mostrar em
   15 min como ter WhatsApp, agenda e orçamentos funcionando sozinhos
   desde o primeiro cliente?"
Empresa nova = sem sistema legado, sem vícios, decisor acessível. Melhor timing possível.
```

---

## FASE 2 — Cruzamento CNPJ × Places (o detector de invisíveis)

```
Para cada empresa da busca CNPJ, verificar se existe no Google Places
(match por nome+endereço):
- EXISTE nos dois → enriquecer com reviews (fluxo atual)
- SÓ NA RECEITA → flag "invisível digital": empresa real, faturando,
  mas sem presença no Google = dor máxima de digitalização
  → priority_reason = "Empresa ativa sem presença digital"
  → argumento de venda: Site Generator + Google presence é entrada perfeita
- SÓ NO PLACES → informal/CNPJ divergente (baixa prioridade B2B)
Salvar em enrichment_data.digital.presenca_google: boolean
```

---

## FASE 3 — Meta Ad Library (quem está anunciando)

```
API pública da Meta Ad Library (grátis, sem review do app para anúncios ativos):
GET https://graph.facebook.com/v21.0/ads_archive
    ?search_terms={nome_empresa}&ad_reached_countries=BR&ad_active_status=ACTIVE

Uso 1 — enriquecimento: no enrichLead (cmd-22), preencher
        growth.anuncios_ativos (era v2, agora implementar)
Uso 2 — descoberta reversa: buscar anunciantes ativos por termo do segmento
        na região → empresas COM verba de marketing e SEM estrutura de
        atendimento = desperdício que a Vendor.ai resolve
        priority_reason = "Investindo em anúncios — atendimento é o gargalo"
        Gancho SDR: "Vi que vocês estão anunciando no Instagram. Quantos
        leads do anúncio ficam sem resposta no WhatsApp?"
```

---

## FASE 4 — Sinal de contratação (vagas abertas)

```
Fonte v1 (simples): busca web "vagas {nome_empresa} {cidade}" via fetch +
parse leve dos agregadores públicos (Indeed RSS quando disponível)
→ growth.contratando = true/false + cargo detectado
→ Se contratando VENDEDOR/ATENDENTE: sinal duplo —
  priority_reason = "Contratando atendimento — a IA custa 1/5 do salário"
  Gancho SDR: "Vi que estão contratando {cargo}. Antes de fechar a vaga,
  vale ver o que a IA resolve por uma fração do custo?"
```

---

## FASE 5 — LinkedIn (decisores, com os pés no chão)

```
⚠️ Realidade: API oficial do LinkedIn é fechada para esse uso; scraping
direto viola os ToS e arrisca bloqueio. Estratégia em 3 camadas seguras:

1. MANUAL ASSISTIDO (imediato, grátis):
   Botão no card do lead: [🔎 Buscar decisor no LinkedIn]
   → abre busca do LinkedIn pré-montada: "{razao_social} {cidade} dono OR
   sócio OR gerente" → vendedor acha em 30s e cola o nome/cargo no lead
   (campo dados_pj.decisor). Simples e 100% dentro das regras.

2. QSA DA RECEITA (automático, grátis):
   Os SÓCIOS já vêm na busca CNPJ (Fase 1) — nome completo do decisor
   sem LinkedIn nenhum. Usar como {dono_nome} nos templates do SDR.
   → Este é o hack: o QSA entrega o que 90% buscam no LinkedIn.

3. ENRIQUECIMENTO VIA API TERCEIRA (v2, pago):
   Providers estilo Proxycurl/Apollo (~$0,01-0,03/perfil) para cargo,
   foto e link do perfil a partir do nome+empresa. Ativar só quando o
   volume justificar. Secret: LINKEDIN_ENRICH_API_KEY.
```

---

## FASE 6 — Hub unificado de fontes no Prospector

```
Prospector ganha abas por fonte:
[🗺 Google Places] [🏢 Busca CNPJ] [📣 Anunciantes] [🆕 Recém-abertas] [📋 Fila]

Todas convergem no MESMO pipeline (cmd-10 → cmd-22):
lead criado com metadata.source = places|cnpj|ad_library|recem_aberta
→ enriquecimento → score → fila priorizada → SDR da vertical

Deduplicação: antes de criar, match por CNPJ (se houver) OU nome+cidade
normalizado → se existe, MERGE dos dados (fontes se complementam:
CNPJ traz sócios, Places traz reviews, Ads traz sinal de verba)

Métricas por fonte em Métricas de IA:
leads por fonte × taxa de resposta × conversão → descobrir empiricamente
qual canal rende mais por segmento/região
```

---

## ORDEM DE IMPLEMENTAÇÃO

```
1º  Fase 1 — Busca CNPJ + CNAE map + play recém-abertas (maior impacto)
2º  Fase 2 — Cruzamento invisíveis digitais (custo zero, usa o que já tem)
3º  Fase 6 — Hub de abas + dedup + métricas por fonte
4º  Fase 3 — Ad Library (enriquecimento + descoberta reversa)
5º  Fase 5.1/5.2 — LinkedIn assistido + QSA como decisor
6º  Fase 4 — sinal de contratação
```

## VALIDAÇÃO

- [ ] Busca por CNAE 4744 + Chapecó + abertas em 90 dias retorna empresas reais
- [ ] Prospectar da aba CNPJ cria lead PJ com sócios preenchidos do QSA
- [ ] Empresa recém-aberta entra com boost e template de parabéns
- [ ] Empresa sem Google Places recebe flag "invisível digital"
- [ ] Anunciante ativo detectado vira gancho na mensagem do SDR
- [ ] {dono_nome} preenchido pelo QSA sem intervenção manual
- [ ] Lead duplicado entre fontes faz merge, não duplica
- [ ] Métricas mostram conversão por fonte
- [ ] Cotas: consultas CNPJ contabilizadas por tenant (padrão cmd-9)
