# COMANDO 22 — Motor Preditivo: Fluxo Adaptativo de Prospecção

**Stack:** Node + Drizzle + Supabase · OpenAI · Google Places já integrado  
**Princípio:** NÃO alterar a arquitetura existente. Adicionar uma camada de inteligência ENTRE o Prospector e o SDR.  
**Fluxo novo:** Descoberta → Inteligência → Priorização → SDR contextualizado → Diagnóstico → Closer

```
ANTES:  Prospector encontra → cria lead+deal → dispara SDR (todos na mesma esteira)
DEPOIS: Prospector encontra → Enriquecimento (Growth Radar + Digital Scanner)
        → Propensity Score + ROI estimado → fila priorizada
        → SDR da vertical com contexto econômico → conversa contextualizada
```

---

## FASE 1 — Separar descoberta de contato (mudança de fluxo)

### Alterar o fluxo do botão "Prospectar"

```
1. Prospectar continua criando lead + deal (cmd-10 intacto)
2. REMOVER o disparo automático do SDR na importação
3. Novo status do lead: enrichment_status = 'pending' | 'enriched' | 'scored'
4. SDR só dispara quando: score calculado E lead liberado pela fila de priorização
   (automático para score alto, manual/lote para os demais)
```

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS propensity_score int;          -- 0-100
ALTER TABLE leads ADD COLUMN IF NOT EXISTS roi_estimate jsonb;            -- Fase 3
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_data jsonb;         -- Fase 2
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_reason text;
```

---

## FASE 2 — Camada de Inteligência (Growth Radar + Digital Scanner)

Job assíncrono `enrichLead(leadId)` disparado após a importação:

### 2A · Digital Scanner — maturidade digital (dados já disponíveis + fetch leve)

```
Fontes: dados do Places já salvos + fetch do site (se houver) + heurísticas
Detectar e salvar em enrichment_data.digital:
- tem_site: boolean | site_qualidade: 'nenhum'|'simples'|'profissional'
  (heurística: página única/sem SSL/template genérico = simples)
- responde_whatsapp: reutilizar teste do cmd-16 (tempo de resposta da msg teste)
- tem_agendamento_online / tem_ecommerce: detectar por links no site
- presenca_instagram: buscar link no site/Places
- indicio_crm: procurar no HTML pixels/scripts (RD, HubSpot, Pipedrive) — ausência = sem CRM
```

### 2B · Growth Radar — sinais de expansão

```
Fontes: Places (dados temporais) + busca web opcional
Detectar e salvar em enrichment_data.growth:
- reviews_velocity: reviews novos / 30 dias (surto = demanda crescendo)
- rating_trend: nota subindo ou caindo
- horario_estendido: aberto além do padrão do segmento
- multiplas_unidades: mesmo nome em outros endereços na cidade (Places search)
- contratando: (v2) busca por vagas abertas
- anuncios_ativos: (v2) Meta Ad Library API por nome da empresa
Marcar cada sinal com { sinal, valor, detectado_em }
```

---

## FASE 3 — Propensity Score + ROI antes do SDR

### Cálculo do score (0-100) via IA + regras

```
gpt-4o-mini recebe: dados do Places + digital scanner + growth radar + vertical
e retorna JSON:
{
  "propensity_score": 87,
  "score_breakdown": {
    "dor_operacional": 35,      // sem CRM + WhatsApp manual + reclamações de demora
    "momento_expansao": 30,      // sinais do Growth Radar
    "capacidade_pagamento": 22   // porte, ticket do segmento, múltiplas unidades
  },
  "priority_reason": "Empresa em expansão com alta chance de perda operacional",
  "roi_estimate": {
    "volume_atendimentos_mes": 400,
    "perda_estimada_mes": 8500,       // R$: leads sem resposta × ticket médio segmento
    "ganho_potencial_mes": 6800,
    "ticket_estimado": "PME+"
  }
}
Salvar em leads.propensity_score / roi_estimate / priority_reason.
Tabela de ticket médio por segmento: seeds editáveis em segment_benchmarks
(segmento, ticket_medio, taxa_resposta_padrao, volume_medio_atendimentos).
```

### Fila priorizada no Prospector

```
Nova aba "Fila" no Prospector: leads ordenados por score desc
Card mostra: score (badge 🟢80+ 🟡50-79 🔴<50) + priority_reason +
"Potencial recuperável: R$ 8.500/mês"
Ações: [Disparar SDR] [Disparar top 10] [Descartar]
Config por tenant: auto_dispatch_threshold (default 80 = score ≥80 dispara sozinho)
```

---

## FASE 4 — SDR adaptativo por vertical

```
1. Tabela sdr_vertical_profiles:
   { vertical, tom, vocabulario, dores_tipicas, abertura_padrao, exemplos }
   Seeds: imobiliaria, construcao, saude/clinica, varejo, salao_beleza,
   materiais_construcao, alimentacao (7 perfis iniciais)
2. O SDR carrega o perfil pela vertical do lead (inferida do Places types
   ou definida manualmente) e injeta no system prompt
3. Templates do cmd-16 ganham variante por vertical (fallback: template global)
4. A mensagem usa o contexto da inteligência:
   "Olá! Percebemos que empresas em expansão normalmente enfrentam aumento no
   volume de atendimento. {gancho específico do sinal detectado}..."
   Variáveis novas: {sinal_growth_principal}, {perda_estimada}, {dor_digital}
```

---

## FASE 5 — Memória de objeções (aprendizado contínuo)

```sql
CREATE TABLE IF NOT EXISTS prospecting_objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento text,
  objecao text,                 -- normalizada pela IA ("Já temos CRM")
  frequencia int DEFAULT 1,
  respostas jsonb DEFAULT '[]', -- [{texto, usos, conversoes}]
  taxa_conversao numeric,
  updated_at timestamptz DEFAULT now()
);
```

```
Pipeline de aprendizado (cron diário):
1. IA varre conversas do SDR das últimas 24h e extrai objeções (classificação)
2. Normaliza e incrementa frequência por segmento
3. Registra qual resposta foi dada e o desfecho do lead
   (agendou = conversão | sumiu = não)
4. Recalcula taxa_conversao por resposta → a melhor vira "resposta vencedora"
5. O SDR consulta a tabela ANTES de responder objeção:
   se existe resposta vencedora para (segmento, objeção) → usa como base
6. Painel em Métricas de IA: top objeções por segmento + resposta vencedora
   + evolução da taxa de conversão
```

---

## FASE 6 — Micro-eventos automáticos

```
Cron semanal re-escaneia leads ativos (não convertidos, não descartados):
- reviews_velocity saltou → evento "📈 30 avaliações em 7 dias — demanda em alta"
- site novo detectado / anúncio ativo (v2) → evento correspondente
Ação do evento:
1. Lead sobe ao topo da fila (boost temporário no score +15 por 7 dias)
2. Notificação in-app ao vendedor com o motivo
3. SDR pode usar o evento como gancho de reabordagem natural
Tabela lead_events: { lead_id, tipo, descricao, score_boost, expires_at }
Respeitar cota Places do tenant (cmd-9) no re-scan.
```

---

## ORDEM DE IMPLEMENTAÇÃO (impacto)

```
1º  Fase 1 + 2 — inteligência antes do SDR (separar descoberta de contato)
2º  Fase 3 — Propensity Score + ROI + fila priorizada
3º  Fase 4 — SDR por vertical
4º  Fase 5 — memória de objeções
5º  Fase 6 — micro-eventos
```

## VALIDAÇÃO

- [ ] Prospectar NÃO dispara SDR imediato — lead entra como 'pending'
- [ ] Enriquecimento roda assíncrono e preenche digital + growth
- [ ] Score 0-100 com breakdown e priority_reason legível
- [ ] ROI interno visível no card: "Potencial recuperável: R$ X/mês"
- [ ] Score ≥ threshold dispara SDR sozinho; demais aguardam na fila
- [ ] SDR de clínica fala diferente do SDR de construtora (perfis por vertical)
- [ ] Primeira mensagem usa o sinal detectado como gancho
- [ ] Objeção repetida passa a receber a resposta vencedora automaticamente
- [ ] Surto de reviews gera evento, boost na fila e notificação
- [ ] Fluxos existentes (cmd-10/15/16/21) continuam funcionando sem regressão
