---
name: Cmd 23 CNPJ multicanal
description: Arquitetura do hub multicanal B2B — fontes, serviço, enriquecimento, crons.
---

## Regra principal

O `cnpjService.ts` centraliza todas as fontes B2B externas do Cmd 23.

**APIs e seus requisitos:**
- `getCompanyByCnpj(cnpj)` → BrasilAPI `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` — gratuita, sem key
- `searchByCnae(params)` → CNPJá API `https://api.cnpja.com/office` — requer `CNPJ_API_KEY`; retorna `apiKeyRequired: true` quando key ausente
- `searchMetaAds(terms, token)` → Meta Ad Library `graph.facebook.com/v21.0/ads_archive` — usa `INSTAGRAM_ACCESS_TOKEN` existente
- `checkGooglePresence(nome, cidade)` → Google Places API — usa `GOOGLE_PLACES_API_KEY`
- `buildLinkedInSearchUrl(razaoSocial, cidade)` → URL helper puro, sem API

**enrichLead agora aceita dois formatos:**
1. Object: `enrichLead({ leadId, tenantId, scoreBoost?, boostReason? })` — usado pelo Cmd 23
2. Posicional: `enrichLead(leadId, tenantId, log?)` — retrocompatível com chamadas do Cmd 22

**Boosts automáticos no scoring:**
- `empresa_recem_aberta` → +20 pts
- `anuncios_ativos` (Meta Ads) → +10 pts
- Sem `presenca_google` (CNPJ source) → +15 pts
- Sem Google + sem CRM → pain score sobe significativamente

**Tabela `cnae_vertical_map`:** seeds com 36 CNAEs em 10 verticais; coluna `prioridade` ordena o dropdown do frontend.

**`prospector_config.cnae_alvo`:** array de CNAEs que o tenant quer monitorar no cron semanal de recém-abertas.

**Why:** QSA da Receita entrega o nome do decisor sem precisar do LinkedIn — `dadosPj.socios[0].nome` já vai para o template SDR como `{dono_nome}`.

**How to apply:** Toda fonte nova (v2: Reclame Aqui, iFood, CRECI) deve seguir o mesmo padrão: serviço no `cnpjService.ts` → rota no `prospector.ts` → tab no `Prospector.tsx` → mesma fila preditiva.
