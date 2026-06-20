# Briefing para Agente Replit — Vendor.ai Core
## Melhorias Estruturais de Produto — 7 Frentes

---

## CONTEXTO

Auditoria de produto identificou 8 pontos de melhoria estrutural. Decisões tomadas:
- Ponto 1 (i18n) — NÃO fazer agora, fora de escopo
- Pontos 2, 3, 4, 5, 6, 7, 8 — implementar conforme detalhado abaixo

Executar NESTA ORDEM. Rodar testes após cada frente. Não quebrar os 208+ testes existentes.

---

## FRENTE 1 — Plano obrigatório no fechamento + Demo com expiração de 5 dias

### Problema atual
Tenant sem plano atribuído tem acesso liberado a tudo (`fail-open`). Não há vínculo
automático entre o fechamento comercial (deal "won" → contrato/cobrança) e a
atribuição do plano correto ao tenant.

### Objetivo
1. No momento em que um deal é fechado (won) e vira tenant pagante, o plano
   correto deve ser atribuído automaticamente — nunca ficar em modo legacy.
2. Tenants criados como demonstração devem ter login com expiração automática
   de 5 dias.

### Implementação

**1.1 — Vincular plano ao fechamento de deal**

Localizar o orquestrador de fechamento (mencionado no fluxo: won → ZapSign/Asaas
→ pagamento → onboarding). Provavelmente em `server/services/dealClosingService.ts`
ou similar.

Adicionar etapa obrigatória ANTES do onboarding:

```typescript
// server/services/dealClosingService.ts

interface FecharDealParams {
  dealId: string;
  tenantId: string;
  planoContratado: 'starter' | 'growth' | 'enterprise'; // vem da proposta/negociação
  billingCycle: 'mensal' | 'anual';
}

export async function fecharDeal(params: FecharDealParams) {
  const { dealId, tenantId, planoContratado, billingCycle } = params;

  // ETAPA OBRIGATÓRIA — atribuir plano ANTES de qualquer outra ação
  const plano = await db.query.plans.findFirst({
    where: eq(plans.slug, planoContratado)
  });

  if (!plano) {
    throw new Error(`Plano "${planoContratado}" não encontrado. Fechamento abortado.`);
  }

  await db.update(tenants)
    .set({
      planId: plano.id,
      billingCycle: billingCycle,
      planStartedAt: new Date(),
      isDemo: false,        // garante que sai do modo demo se vinha de lá
      demoExpiresAt: null,  // remove expiração se houver
    })
    .where(eq(tenants.id, tenantId));

  // Log obrigatório de auditoria
  await db.insert(planAssignmentLog).values({
    tenantId,
    dealId,
    planId: plano.id,
    assignedBy: 'sistema_fechamento_deal',
    assignedAt: new Date()
  });

  // SÓ DEPOIS de garantir o plano, prosseguir com o fluxo normal:
  // ZapSign / Asaas / onboarding (código existente)
  await processarContratoEPagamento(dealId, tenantId);
}
```

**1.2 — Bloquear fechamento sem plano definido**

No fluxo de criação de proposta/negociação, o campo `planoContratado` deve ser
obrigatório antes de permitir mover o deal para "won" no kanban. Adicionar
validação no endpoint:

```typescript
// PATCH /api/deals/:id/stage
router.patch('/:id/stage', async (req, res) => {
  const { stage } = req.body;
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, req.params.id) });

  if (stage === 'won' && !deal.planoContratado) {
    return res.status(400).json({
      error: 'PLANO_OBRIGATORIO',
      message: 'É necessário definir o plano comercial antes de fechar este deal.'
    });
  }

  // resto do código existente
});
```

**1.3 — Migration: tabela de log de atribuição de plano**

```typescript
// schema.ts (Drizzle)
export const planAssignmentLog = pgTable('plan_assignment_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  dealId: uuid('deal_id'),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  assignedBy: text('assigned_by').notNull(), // 'sistema_fechamento_deal' | 'admin_manual' | nome do admin
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
});
```

**1.4 — Demo com expiração de 5 dias**

Adicionar campos na tabela `tenants` se não existirem:

```typescript
// schema.ts
export const tenants = pgTable('tenants', {
  // ... campos existentes
  isDemo: boolean('is_demo').default(false),
  demoExpiresAt: timestamp('demo_expires_at'),
});
```

Endpoint para criar tenant demo:

```typescript
// POST /api/admin/tenants/demo
router.post('/demo', requireSuperAdmin, async (req, res) => {
  const { nomeEmpresa, emailContato } = req.body;

  const [tenant] = await db.insert(tenants).values({
    nome: nomeEmpresa,
    emailContato,
    isDemo: true,
    demoExpiresAt: addDays(new Date(), 5),
    planId: null, // demo não consome plano real
  }).returning();

  // Popular com dados fake (ver FRENTE 6)
  await popularTenantComDadosFake(tenant.id);

  res.json({ tenant, loginUrl: `https://vendorai.replit.app/login?tenant=${tenant.subdomainSlug}` });
});
```

**1.5 — Job de expiração de demos**

Criar job agendado (a cada hora) que verifica e desativa demos expiradas:

```typescript
// server/jobs/demoExpirationJob.ts
import { CronJob } from 'cron'; // ou node-cron, conforme padrão já usado no projeto

export const demoExpirationJob = new CronJob('0 * * * *', async () => {
  const demosExpiradas = await db.query.tenants.findMany({
    where: and(
      eq(tenants.isDemo, true),
      lt(tenants.demoExpiresAt, new Date()),
      eq(tenants.suspended, false)
    )
  });

  for (const tenant of demosExpiradas) {
    await db.update(tenants)
      .set({ suspended: true, suspendedReason: 'demo_expirada' })
      .where(eq(tenants.id, tenant.id));

    logger.info(`Demo expirada e suspensa: ${tenant.id}`);
  }
});
```

**1.6 — Bloquear login de demo expirada com mensagem clara**

No middleware de auth, ao detectar `suspendedReason === 'demo_expirada'`:

```typescript
if (tenant.suspended && tenant.suspendedReason === 'demo_expirada') {
  return res.status(403).json({
    error: 'DEMO_EXPIRADA',
    message: 'Este período de demonstração expirou. Entre em contato para continuar usando o Vendor.ai.',
    contato: 'https://wa.me/5548999999999'
  });
}
```

---

## FRENTE 2 — Atribuição manual de tenant a plano (Admin)

### Objetivo
Permitir que super_admin atribua ou altere plano de qualquer tenant manualmente,
fora do fluxo automático de fechamento de deal (já existe endpoint `PATCH
/admin/tenants/:id/plan` — confirmar que ele já loga em `plan_assignment_log`
com `assignedBy: 'admin_manual'`).

### Implementação

Atualizar o endpoint existente para usar o mesmo log de auditoria criado na Frente 1:

```typescript
// PATCH /admin/tenants/:id/plan
router.patch('/:id/plan', requireSuperAdmin, async (req, res) => {
  const { planId } = req.body;
  const adminUser = req.user;

  await db.update(tenants)
    .set({ planId, planStartedAt: new Date() })
    .where(eq(tenants.id, req.params.id));

  await db.insert(planAssignmentLog).values({
    tenantId: req.params.id,
    planId,
    assignedBy: `admin_manual:${adminUser.email}`,
    assignedAt: new Date()
  });

  res.json({ success: true });
});
```

Adicionar tela no painel super_admin (se ainda não existir) para listar tenants
sem plano e atribuir rapidamente — uma lista simples com botão "Atribuir plano".

---

## FRENTE 3 — Rollback / Recuperação de Deals Travados no Fechamento

### Problema
Fluxo won → ZapSign/Asaas → pagamento → onboarding não tem tratamento para
estados intermediários travados (ex: contrato gerado mas cobrança falhou,
ou cobrança criada mas webhook de confirmação nunca chegou).

### Implementação

**3.1 — Máquina de estados explícita para o fechamento**

```typescript
// schema.ts
export const dealClosingStatus = pgTable('deal_closing_status', {
  id: uuid('id').defaultRandom().primaryKey(),
  dealId: uuid('deal_id').notNull().references(() => deals.id),
  tenantId: uuid('tenant_id').notNull(),
  
  etapaAtual: text('etapa_atual').notNull(), 
  // 'plano_atribuido' | 'contrato_pendente' | 'contrato_assinado' | 
  // 'cobranca_pendente' | 'pagamento_confirmado' | 'onboarding_disparado' | 
  // 'concluido' | 'travado_erro'
  
  contratoZapsignId: text('contrato_zapsign_id'),
  contratoStatus: text('contrato_status'), // 'enviado' | 'assinado' | 'erro'
  cobrancaAsaasId: text('cobranca_asaas_id'),
  cobrancaStatus: text('cobranca_status'), // 'criada' | 'paga' | 'vencida' | 'erro'
  
  ultimoErro: text('ultimo_erro'),
  tentativas: integer('tentativas').default(0),
  
  criadoEm: timestamp('criado_em').defaultNow(),
  atualizadoEm: timestamp('atualizado_em').defaultNow(),
});
```

**3.2 — Cada etapa atualiza o status, nunca pula direto**

```typescript
export async function processarContratoEPagamento(dealId: string, tenantId: string) {
  const [registro] = await db.insert(dealClosingStatus).values({
    dealId, tenantId, etapaAtual: 'plano_atribuido'
  }).returning();

  try {
    // Gerar contrato
    const contrato = await zapsignService.criarContrato(dealId);
    await db.update(dealClosingStatus)
      .set({ etapaAtual: 'contrato_pendente', contratoZapsignId: contrato.id, contratoStatus: 'enviado' })
      .where(eq(dealClosingStatus.id, registro.id));

  } catch (error) {
    await db.update(dealClosingStatus)
      .set({ etapaAtual: 'travado_erro', ultimoErro: String(error), tentativas: sql`tentativas + 1` })
      .where(eq(dealClosingStatus.id, registro.id));
    
    // Disparar alerta (ver 3.4)
    await alertarFalhaCríticaFechamento(registro.id, 'contrato');
    throw error;
  }

  // Lógica similar para cobrança e onboarding, cada uma atualizando o status
}
```

**3.3 — Tela de "Deals travados" no painel admin/comercial**

Criar página `DealsTravados.tsx`:

```tsx
const DealsTravados = () => {
  const { data } = useQuery({
    queryKey: ['deals-travados'],
    queryFn: () => api.get('/api/deals/travados')
    // backend: SELECT * FROM deal_closing_status WHERE etapa_atual = 'travado_erro'
    //          OR (etapa_atual NOT IN ('concluido') AND atualizado_em < NOW() - INTERVAL '2 hours')
  });

  return (
    <div className="page-container">
      <h1>⚠️ Deals travados no fechamento</h1>
      <p>Deals que estão há mais de 2h sem progredir ou com erro registrado.</p>
      <table>
        <thead>
          <tr><th>Deal</th><th>Etapa</th><th>Erro</th><th>Tentativas</th><th>Ação</th></tr>
        </thead>
        <tbody>
          {data?.map(d => (
            <tr key={d.id}>
              <td>{d.dealNome}</td>
              <td><EtapaBadge etapa={d.etapaAtual} /></td>
              <td>{d.ultimoErro || '—'}</td>
              <td>{d.tentativas}</td>
              <td>
                <button onClick={() => retentar(d.id)}>Tentar novamente</button>
                <button onClick={() => resolverManualmente(d.id)}>Marcar resolvido</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

**3.4 — Alerta automático para deal travado**

```typescript
async function alertarFalhaCríticaFechamento(registroId: string, etapa: string) {
  // Enviar notificação para o admin do tenant via e-mail (Resend) 
  // e/ou criar registro em uma tabela de alertas visível no dashboard
  await resendService.enviarEmail({
    to: process.env.ADMIN_ALERT_EMAIL,
    subject: `⚠️ Falha no fechamento de deal — etapa: ${etapa}`,
    body: `O fechamento travou na etapa "${etapa}". Verificar painel de Deals Travados.`
  });
}
```

**3.5 — Endpoint de retry manual**

```typescript
// POST /api/deals/:id/retry-fechamento
router.post('/:id/retry-fechamento', requireAdmin, async (req, res) => {
  const status = await db.query.dealClosingStatus.findFirst({
    where: eq(dealClosingStatus.dealId, req.params.id)
  });

  // Retomar da etapa onde travou, não do zero
  switch (status.etapaAtual) {
    case 'travado_erro':
      if (!status.contratoZapsignId) {
        await processarContratoEPagamento(req.params.id, status.tenantId);
      } else if (!status.cobrancaAsaasId) {
        await criarCobranca(req.params.id);
      }
      break;
  }

  res.json({ success: true });
});
```

---

## FRENTE 4 — OpenAI key própria do tenant (BYOK) + alerta de créditos

### Objetivo
Permitir que cada tenant cadastre sua própria `OPENAI_API_KEY`. Quando configurada,
o sistema usa a key do tenant (consumindo créditos dele) ao invés da key global
do Vendor.ai. A key da Anthropic (Claude) permanece sempre como a key global
do Vendor.ai (compromisso fixo seu, não do tenant).

### Implementação

**4.1 — Adicionar campo seguro para a key do tenant**

```typescript
// schema.ts — tabela agent_configs ou tenants
export const tenants = pgTable('tenants', {
  // ... campos existentes
  openaiApiKeyEncrypted: text('openai_api_key_encrypted'), // criptografada, nunca em texto puro
  openaiKeyConfiguredAt: timestamp('openai_key_configured_at'),
  openaiKeyStatus: text('openai_key_status').default('nao_configurada'), 
  // 'nao_configurada' | 'ativa' | 'invalida' | 'sem_creditos'
});
```

**4.2 — Criptografia da key (nunca salvar em texto puro)**

```typescript
// server/lib/crypto.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET = process.env.ENCRYPTION_SECRET!; // 32 bytes, gerar e salvar nos Secrets

export function encryptApiKey(plainKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(encryptedData: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  const decipher = crypto.createDecipheriv(
    ALGORITHM, 
    Buffer.from(SECRET, 'hex'), 
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')), 
    decipher.final()
  ]).toString('utf8');
}
```

Gerar o `ENCRYPTION_SECRET` uma vez e salvar nos Secrets do Replit:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**4.3 — Endpoint para o tenant cadastrar sua key**

```typescript
// PATCH /api/tenants/:tenantId/openai-key
router.patch('/:tenantId/openai-key', requireTenantAdmin, async (req, res) => {
  const { apiKey } = req.body;

  // Validar a key fazendo uma chamada de teste simples
  const valida = await validarOpenAIKey(apiKey);
  
  if (!valida) {
    return res.status(400).json({ error: 'API key inválida ou sem créditos.' });
  }

  const encrypted = encryptApiKey(apiKey);

  await db.update(tenants)
    .set({
      openaiApiKeyEncrypted: encrypted,
      openaiKeyConfiguredAt: new Date(),
      openaiKeyStatus: 'ativa'
    })
    .where(eq(tenants.id, req.params.tenantId));

  res.json({ success: true });
});

async function validarOpenAIKey(key: string): Promise<boolean> {
  try {
    const testClient = new OpenAI({ apiKey: key });
    await testClient.models.list(); // chamada leve só para validar
    return true;
  } catch {
    return false;
  }
}
```

**4.4 — Resolver qual key usar em cada chamada de IA**

Criar uma função central que decide qual key usar (tenant ou global):

```typescript
// server/lib/openaiClientResolver.ts
export async function getOpenAIClientForTenant(tenantId: string): Promise<OpenAI> {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });

  if (tenant?.openaiApiKeyEncrypted && tenant.openaiKeyStatus === 'ativa') {
    const key = decryptApiKey(tenant.openaiApiKeyEncrypted);
    return new OpenAI({ apiKey: key });
  }

  // Fallback: key global do Vendor.ai (seu compromisso fixo)
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
```

**IMPORTANTE:** Substituir TODAS as instâncias de `new OpenAI(...)` espalhadas
pelo código (Whisper, Vision, DALL-E, GPT) para usar `getOpenAIClientForTenant(tenantId)`
ao invés da key global direto. Isso garante que o consumo vá para a key certa.

**4.5 — Claude permanece sempre na key global**

Não alterar a integração Anthropic — ela continua usando `process.env.ANTHROPIC_API_KEY`
sempre, independente do tenant. Confirmar que nenhuma chamada Claude foi
acidentalmente migrada para BYOK.

**4.6 — Detectar créditos esgotados e avisar o tenant**

```typescript
// Envolver chamadas OpenAI com tratamento de erro de créditos
export async function chamarOpenAIComTratamento(tenantId: string, fn: (client: OpenAI) => Promise<any>) {
  const client = await getOpenAIClientForTenant(tenantId);
  
  try {
    return await fn(client);
  } catch (error: any) {
    if (error?.status === 429 || error?.code === 'insufficient_quota') {
      
      const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
      
      // Só alertar se for key própria do tenant (não a global)
      if (tenant?.openaiApiKeyEncrypted) {
        await db.update(tenants)
          .set({ openaiKeyStatus: 'sem_creditos' })
          .where(eq(tenants.id, tenantId));

        await criarAlertaParaTenant({
          tenantId,
          tipo: 'creditos_openai_esgotados',
          mensagem: 'Seus créditos da OpenAI acabaram. Adicione mais créditos para continuar usando os agentes de IA.',
          urgente: true
        });
      }
      
      throw new Error('CREDITOS_OPENAI_ESGOTADOS');
    }
    throw error;
  }
}
```

**4.7 — Tabela de alertas e exibição no dashboard**

```typescript
// schema.ts
export const tenantAlerts = pgTable('tenant_alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  tipo: text('tipo').notNull(),
  mensagem: text('mensagem').notNull(),
  urgente: boolean('urgente').default(false),
  lido: boolean('lido').default(false),
  criadoEm: timestamp('criado_em').defaultNow(),
});
```

No frontend, criar um banner fixo no topo do dashboard quando houver alerta urgente
não lido:

```tsx
const AlertaCreditosOpenAI = () => {
  const { data: alertas } = useQuery({
    queryKey: ['tenant-alerts'],
    queryFn: () => api.get('/api/tenant/alerts?urgente=true&lido=false')
  });

  if (!alertas?.length) return null;

  return (
    <div className="banner-alerta-urgente">
      ⚠️ {alertas[0].mensagem}
      <a href="/configuracoes/openai">Adicionar créditos →</a>
    </div>
  );
};
```

**4.8 — Tela de configuração no painel do tenant**

Criar `ConfiguracaoOpenAI.tsx`:
- Campo para colar a própria API key da OpenAI
- Botão "Validar e salvar"
- Indicador de status: Ativa ✅ / Sem créditos ⚠️ / Não configurada
- Texto explicativo: "Ao cadastrar sua própria key, o consumo de IA (textos,
  imagens, transcrição de áudio) usa seus créditos OpenAI diretamente. O
  Claude (geração de sites e outras funções) continua incluso no seu plano Vendor.ai."

---

## FRENTE 6 — Tenant de demonstração com dados fake

### Objetivo
Função que popula um tenant novo com dados realistas e fake para demonstração
comercial, sem precisar configurar nada manualmente.

### Implementação

```typescript
// server/services/demoSeedService.ts

export async function popularTenantComDadosFake(tenantId: string) {
  
  // 1. Produtos fake (catálogo)
  const produtosFake = [
    { sku: 'DEMO-001', descricao: 'Implantação Sistema Premium', preco: 5000, unidade: 'unidade' },
    { sku: 'DEMO-002', descricao: 'Plano Mensal Growth', preco: 1000, unidade: 'mês' },
    { sku: 'DEMO-003', descricao: 'Consultoria de Onboarding', preco: 1500, unidade: 'unidade' },
  ];
  await db.insert(produtos).values(produtosFake.map(p => ({ ...p, tenantId, ativo: true })));

  // 2. Leads fake com variedade de status e scores
  const nomesFake = ['Construtora Horizonte', 'Distribuidora Sul', 'Mercado Bom Preço', 
                      'Auto Peças Central', 'Confecções Maria'];
  const leadsFake = nomesFake.map((nome, i) => ({
    tenantId,
    nome: `Contato ${nome}`,
    empresa: nome,
    telefone: `5548999${String(900 + i).padStart(4, '0')}`,
    status: ['novo', 'qualificado', 'proposta', 'negociacao', 'ganho'][i % 5],
    score: [45, 72, 88, 65, 95][i],
    classificacao: ['frio', 'morno', 'quente', 'morno', 'quente'][i],
    churnRisk: [20, 15, 5, 60, 2][i],
    diasSemResposta: [2, 0, 0, 9, 0][i],
    criadoEm: subDays(new Date(), 30 - i * 5),
  }));
  const leadsCriados = await db.insert(leads).values(leadsFake).returning();

  // 3. Conversas fake com histórico realista
  for (const lead of leadsCriados) {
    await db.insert(conversations).values({
      tenantId, leadId: lead.id, channel: 'whatsapp', status: 'aberta',
      ultimaMensagemEm: new Date()
    });
  }

  // 4. Deals fake no pipeline
  const dealsFake = leadsCriados.slice(0, 3).map((lead, i) => ({
    tenantId,
    leadId: lead.id,
    nome: `Proposta — ${lead.empresa}`,
    valor: [5000, 8500, 12000][i],
    estagio: ['proposta', 'negociacao', 'qualificado'][i],
    criadoEm: subDays(new Date(), 10 - i * 2),
  }));
  await db.insert(deals).values(dealsFake);

  // 5. Uma venda fechada (para o dashboard mostrar "ganhos do mês" com dado real)
  await db.insert(vendas).values({
    tenantId,
    leadId: leadsCriados[4].id,
    valor: 6000,
    dataFechamento: subDays(new Date(), 3),
    status: 'pago'
  });

  // 6. Marcar tenant como demo seedado
  await db.update(tenants)
    .set({ demoSeeded: true })
    .where(eq(tenants.id, tenantId));
}
```

Adicionar campo `demoSeeded: boolean('demo_seeded').default(false)` na tabela `tenants`.

Reutilizar essa função no endpoint de criação de demo já criado na Frente 1 (`POST
/api/admin/tenants/demo`).

---

## FRENTE 7 — Explicabilidade de decisões da IA para o usuário final

### Objetivo
Cada decisão automática importante (score, churn risk, classificação de lead,
orçamento gerado) deve ter uma explicação em linguagem simples visível para
o usuário do tenant — não só o log técnico interno.

### Implementação

**7.1 — Adicionar campo de explicação nas tabelas relevantes**

```typescript
// schema.ts — adicionar campo onde aplicável
export const leads = pgTable('leads', {
  // ... campos existentes
  scoreExplicacao: text('score_explicacao'),       // ex: "Score alto porque respondeu rápido e mencionou orçamento definido"
  churnRiskExplicacao: text('churn_risk_explicacao'), // ex: "Risco alto porque não responde há 9 dias e último assunto foi preço"
});
```

**7.2 — Atualizar o prompt do agente de análise para sempre retornar explicação**

Localizar o agente de Customer Intelligence (Churn Risk / Score) e ajustar o
prompt para retornar, junto com o número, uma explicação curta:

```typescript
const systemPrompt = `... (prompt existente) ...

IMPORTANTE: Além do score numérico, retorne SEMPRE um campo "explicacao" 
com 1 frase curta e simples explicando o motivo, em linguagem que o dono 
de uma pequena empresa entenda (sem jargão técnico).

Exemplo de boa explicação: "Risco alto porque não responde há 9 dias e a 
última mensagem foi sobre preço — pode ter ido para o concorrente."

Exemplo de explicação ruim (não usar): "churnRisk calculado com base em 
recência, frequência e sentimento ponderado."

Retorne em JSON:
{
  "score": 0-100,
  "classificacao": "frio|morno|quente",
  "churnRisk": 0-100,
  "explicacao": "frase curta e simples"
}`;
```

**7.3 — Salvar a explicação junto com a análise**

```typescript
// No serviço de análise de IA (Customer Intelligence)
const resultado = await analisarLead(lead);

await db.update(leads)
  .set({
    score: resultado.score,
    classificacao: resultado.classificacao,
    churnRisk: resultado.churnRisk,
    scoreExplicacao: resultado.explicacao,
    churnRiskExplicacao: resultado.explicacao,
  })
  .where(eq(leads.id, lead.id));
```

**7.4 — Explicação também no orçamento gerado**

No fluxo de orçamento automático (já implementado em briefing anterior), ao
montar a resposta para o cliente, incluir explicação quando algum item não
estiver disponível ou tiver condição especial — isso já estava parcialmente
coberto, reforçar o padrão.

**7.5 — Exibir no frontend**

Em qualquer lugar que mostre score ou churn risk, adicionar um ícone de
informação (ⓘ) com tooltip mostrando a explicação:

```tsx
const ScoreBadge = ({ score, explicacao }: { score: number; explicacao?: string }) => (
  <div className="score-badge">
    <span className={`score-valor score-${getScoreColor(score)}`}>{score}</span>
    {explicacao && (
      <Tooltip content={explicacao}>
        <InfoIcon size={14} />
      </Tooltip>
    )}
  </div>
);
```

```tsx
const ChurnRiskBadge = ({ risco, explicacao }: { risco: number; explicacao?: string }) => (
  <div className="churn-badge" title={explicacao}>
    {risco > 70 ? '🔴' : risco > 40 ? '🟡' : '🟢'} {risco}%
    {explicacao && <p className="explicacao-texto">{explicacao}</p>}
  </div>
);
```

---

## FRENTE 8 — Medidor de uso de IA visível em tempo real

### Objetivo
O tenant deve sempre saber, sem precisar pedir, quanto já consumiu do limite
mensal de tokens/uso de IA — evitando "fatura surpresa" ou parada inesperada
do agente.

### Implementação

**8.1 — Endpoint de consumo atual**

```typescript
// GET /api/tenant/uso-ia
router.get('/uso-ia', requireAuth, async (req, res) => {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, req.user.tenantId)
  });

  const percentualUsado = tenant.monthlyTokenLimit
    ? Math.round((tenant.tokensUsedCurrentMonth / tenant.monthlyTokenLimit) * 100)
    : 0;

  res.json({
    tokensUsados: tenant.tokensUsedCurrentMonth,
    tokensLimite: tenant.monthlyTokenLimit,
    percentualUsado,
    statusKeyOpenAI: tenant.openaiKeyStatus, // 'ativa' | 'sem_creditos' | 'nao_configurada'
    usaKeyPropria: !!tenant.openaiApiKeyEncrypted,
    diasRestantesCiclo: diasAteFimDoMes(),
  });
});
```

**8.2 — Componente de medidor no dashboard**

```tsx
const MedidorUsoIA = () => {
  const { data } = useQuery({
    queryKey: ['uso-ia'],
    queryFn: () => api.get('/api/tenant/uso-ia'),
    refetchInterval: 60_000 // atualiza a cada minuto
  });

  if (!data) return null;

  const corBarra = data.percentualUsado > 90 ? 'vermelho' 
                  : data.percentualUsado > 70 ? 'amarelo' 
                  : 'verde';

  return (
    <div className="medidor-uso-ia">
      <div className="medidor-header">
        <span>Uso de IA este mês</span>
        <span>{data.percentualUsado}%</span>
      </div>
      <div className="medidor-barra">
        <div 
          className={`medidor-progresso medidor-${corBarra}`} 
          style={{ width: `${Math.min(data.percentualUsado, 100)}%` }}
        />
      </div>
      <div className="medidor-footer">
        {data.usaKeyPropria 
          ? <span>Usando sua própria key OpenAI</span>
          : <span>{data.tokensUsados.toLocaleString()} / {data.tokensLimite.toLocaleString()} tokens</span>
        }
      </div>
      {data.percentualUsado > 90 && (
        <div className="medidor-alerta">
          ⚠️ Você está perto do limite mensal. 
          {data.usaKeyPropria 
            ? ' Adicione créditos na sua conta OpenAI.' 
            : ' Considere fazer upgrade de plano.'}
        </div>
      )}
    </div>
  );
};
```

**8.3 — Posicionar no Dashboard principal**

Adicionar este componente fixo no topo ou na lateral do Dashboard (próximo aos
7 cards clicáveis já implementados), sempre visível, não escondido em uma
tela de configurações.

---

## RESUMO DE EXECUÇÃO — ORDEM E DEPENDÊNCIAS

| # | Frente | Depende de | Esforço estimado |
|---|--------|-----------|-------------------|
| 1 | Plano obrigatório + demo 5 dias | — | 3-4h |
| 2 | Atribuição manual de plano | Frente 1 (tabela de log) | 1h |
| 3 | Rollback de deals travados | Frente 1 (máquina de estados) | 4-5h |
| 4 | OpenAI BYOK + alerta créditos | — | 4-5h |
| 6 | Demo com dados fake | Frente 1 (endpoint de demo) | 2h |
| 7 | Explicabilidade IA | — | 2-3h |
| 8 | Medidor de uso visível | Frente 4 (campos de status) | 2h |

**Total estimado: 18-22 horas de desenvolvimento**

---

## REGRAS GERAIS PARA TODAS AS FRENTES

- NÃO quebrar os 208+ testes existentes — rodar `pnpm --filter @workspace/api-server run test` após cada frente
- Usar Drizzle ORM (não Prisma) — sintaxe `db.query`, `db.insert`, `db.update` com `eq()`
- Toda query DEVE filtrar por `tenant_id`
- Nunca salvar API keys em texto puro — sempre usar `encryptApiKey`/`decryptApiKey`
- Seguir o padrão de logs estruturados com Pino existente (nunca `console.log`)
- Multi-tenant: super_admin pode ver tudo, tenant_admin só o próprio tenant
- Gerar migration Drizzle para cada alteração de schema, nunca editar tabela direto
