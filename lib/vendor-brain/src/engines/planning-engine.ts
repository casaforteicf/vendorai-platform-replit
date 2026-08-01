// ─── Planning Engine ──────────────────────────────────────────────────────────
// Converts Intent + BrainContext into an ExecutionPlan with ordered PlanSteps.
// Template-based planning — no LLM. Each IntentType has a predefined step template.

import type {
  Intent, BrainContext, ExecutionPlan, PlanStep, AgentType,
} from '../types'
import { resolveBrainVerticalProfile } from '../vertical-profiles'

let _seq = 0
function nextId(prefix: string): string { return `${prefix}_${Date.now()}_${++_seq}` }

// ─── Step template ────────────────────────────────────────────────────────────

interface StepTemplate {
  label:        string
  description:  string
  agentType:    AgentType
  estimatedMs:  number
  /** Index-based dependency refs within the same template */
  dependsOnIdx: number[]
}

// ─── Plan templates per intent ────────────────────────────────────────────────

const TEMPLATES: Partial<Record<string, StepTemplate[]>> = {
  CREATE_PROJECT: [
    { label:'Coletar Briefing',      description:'Reunir informações do cliente e escopo do projeto', agentType:'CRM_AI',          estimatedMs:500,  dependsOnIdx:[]  },
    { label:'Montar DNA',            description:'Definir estilo, paleta e atmosfera do projeto',     agentType:'ARCHITECT_AI',    estimatedMs:800,  dependsOnIdx:[0] },
    { label:'Criar Moodboard',       description:'Selecionar referências visuais',                    agentType:'ARCHITECT_AI',    estimatedMs:600,  dependsOnIdx:[1] },
    { label:'Definir Ambientes',     description:'Mapear ambientes e programas de necessidades',       agentType:'ARCHITECT_AI',    estimatedMs:700,  dependsOnIdx:[1] },
    { label:'Selecionar Materiais',  description:'Recomendar materiais alinhados ao DNA',             agentType:'KNOWLEDGE_AI',    estimatedMs:900,  dependsOnIdx:[2] },
    { label:'Gerar Primeiro Render', description:'Produzir render de conceito do ambiente principal', agentType:'RENDER_AI',       estimatedMs:4000, dependsOnIdx:[3,4]},
    { label:'Atualizar CRM',         description:'Registrar projeto e lead no CRM',                  agentType:'CRM_AI',          estimatedMs:300,  dependsOnIdx:[5] },
  ],
  GENERATE_RENDER: [
    { label:'Validar Contexto',      description:'Confirmar projeto, ambiente e prompt existentes',   agentType:'ORCHESTRATOR',    estimatedMs:200,  dependsOnIdx:[]  },
    { label:'Montar Prompt',         description:'Compor prompt otimizado com tradutor IA',            agentType:'ARCHITECT_AI',    estimatedMs:600,  dependsOnIdx:[0] },
    { label:'Executar Render',       description:'Gerar render via motor de imagem',                  agentType:'RENDER_AI',       estimatedMs:5000, dependsOnIdx:[1] },
    { label:'Revisar Resultado',     description:'Análise automática de fidelidade e qualidade',      agentType:'RENDER_AI',       estimatedMs:800,  dependsOnIdx:[2] },
    { label:'Salvar no Projeto',     description:'Persistir render aprovado e atualizar status',      agentType:'ORCHESTRATOR',    estimatedMs:200,  dependsOnIdx:[3] },
  ],
  REVIEW_RENDER: [
    { label:'Carregar Render',       description:'Recuperar render alvo para análise',                agentType:'ORCHESTRATOR',    estimatedMs:100,  dependsOnIdx:[]  },
    { label:'Análise Técnica',       description:'Avaliar fidelidade, iluminação e composição',       agentType:'RENDER_AI',       estimatedMs:1500, dependsOnIdx:[0] },
    { label:'Consultar Knowledge Graph', description:'Verificar alinhamento com DNA e materiais',    agentType:'KNOWLEDGE_AI',    estimatedMs:800,  dependsOnIdx:[0] },
    { label:'Gerar Feedback',        description:'Compilar relatório de revisão com sugestões',       agentType:'ARCHITECT_AI',    estimatedMs:700,  dependsOnIdx:[1,2]},
    { label:'Notificar Arquiteto',   description:'Enviar feedback ao responsável pelo projeto',       agentType:'CRM_AI',          estimatedMs:200,  dependsOnIdx:[3] },
  ],
  CREATE_PROPOSAL: [
    { label:'Recuperar Dados do Projeto', description:'Coletar escopo, materiais e ambientes',       agentType:'ARCHITECT_AI',    estimatedMs:500,  dependsOnIdx:[]  },
    { label:'Calcular Orçamento',    description:'Estimar custos de materiais e serviços',           agentType:'FINANCIAL_AI',    estimatedMs:1200, dependsOnIdx:[0] },
    { label:'Buscar Fornecedores',   description:'Identificar fornecedores qualificados por item',   agentType:'BUYER_AI',        estimatedMs:1000, dependsOnIdx:[0] },
    { label:'Compor Proposta',       description:'Montar documento de proposta comercial',            agentType:'ORCHESTRATOR',    estimatedMs:800,  dependsOnIdx:[1,2]},
    { label:'Registrar no CRM',      description:'Vincular proposta ao deal no CRM',                 agentType:'CRM_AI',          estimatedMs:300,  dependsOnIdx:[3] },
  ],
  CREATE_CAMPAIGN: [
    { label:'Definir Objetivo',      description:'Clarificar meta e público-alvo da campanha',       agentType:'MARKETING_AI',    estimatedMs:500,  dependsOnIdx:[]  },
    { label:'Selecionar Canais',     description:'Escolher canais mais eficazes (WA, IG, Email)',    agentType:'MARKETING_AI',    estimatedMs:400,  dependsOnIdx:[0] },
    { label:'Criar Conteúdo',        description:'Gerar textos, imagens e templates',                agentType:'MARKETING_AI',    estimatedMs:2000, dependsOnIdx:[1] },
    { label:'Agendar Disparos',      description:'Configurar timing de envio',                       agentType:'MARKETING_AI',    estimatedMs:300,  dependsOnIdx:[2] },
    { label:'Ativar Campanha',       description:'Publicar e monitorar primeiros resultados',        agentType:'CRM_AI',          estimatedMs:200,  dependsOnIdx:[3] },
  ],
  CONSULT_CRM: [
    { label:'Identificar Entidade',  description:'Determinar lead, deal ou cliente alvo',            agentType:'CRM_AI',          estimatedMs:200,  dependsOnIdx:[]  },
    { label:'Recuperar Histórico',   description:'Buscar interações e timeline do registro',         agentType:'CRM_AI',          estimatedMs:500,  dependsOnIdx:[0] },
    { label:'Enriquecer com KG',     description:'Consultar Knowledge Graph para contexto adicional',agentType:'KNOWLEDGE_AI',    estimatedMs:600,  dependsOnIdx:[0] },
    { label:'Sumarizar Situação',    description:'Produzir resumo executivo do status atual',        agentType:'ORCHESTRATOR',    estimatedMs:400,  dependsOnIdx:[1,2]},
  ],
  PURCHASE_COMPONENTS: [
    { label:'Listar Itens',          description:'Identificar componentes a adquirir',               agentType:'ARCHITECT_AI',    estimatedMs:300,  dependsOnIdx:[]  },
    { label:'Consultar Fornecedores',description:'Buscar cotações de fornecedores qualificados',     agentType:'BUYER_AI',        estimatedMs:1500, dependsOnIdx:[0] },
    { label:'Comparar Propostas',    description:'Avaliar custo-benefício e prazo de entrega',       agentType:'FINANCIAL_AI',    estimatedMs:800,  dependsOnIdx:[1] },
    { label:'Aprovar Compra',        description:'Aguardar confirmação do responsável',              agentType:'ORCHESTRATOR',    estimatedMs:300,  dependsOnIdx:[2] },
    { label:'Emitir Pedido',         description:'Gerar pedido de compra e notificar fornecedor',   agentType:'BUYER_AI',        estimatedMs:400,  dependsOnIdx:[3] },
  ],
}

const DEFAULT_TEMPLATE: StepTemplate[] = [
  { label:'Analisar Solicitação', description:'Interpretar e decompor o objetivo solicitado',   agentType:'ORCHESTRATOR', estimatedMs:500,  dependsOnIdx:[] },
  { label:'Executar Tarefa',      description:'Processar com agente mais adequado',             agentType:'ORCHESTRATOR', estimatedMs:1000, dependsOnIdx:[0]},
  { label:'Confirmar Resultado',  description:'Validar saída e registrar resultado',            agentType:'ORCHESTRATOR', estimatedMs:200,  dependsOnIdx:[1]},
]

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPlanningEngine {
  plan(intent: Intent, context: BrainContext): ExecutionPlan
}

export class TemplatePlanningEngine implements IPlanningEngine {
  plan(intent: Intent, context: BrainContext): ExecutionPlan {
    const planId   = nextId('plan')
    const profile = resolveBrainVerticalProfile(context.vertical)
    const baseTemplate = TEMPLATES[intent.type] ?? DEFAULT_TEMPLATE
    const template = context.vertical && profile.key !== 'construction'
      ? baseTemplate.map((step, index) => ({
          ...step,
          description: index === 0
            ? `${step.description}. Contexto: ${profile.focus}`
            : step.description
                .replace(/projeto/gi, profile.operation)
                .replace(/materiais e serviços/gi, profile.offer)
                .replace(/materiais/gi, profile.offer)
                .replace(/cliente/gi, profile.customer),
        }))
      : baseTemplate

    const steps: PlanStep[] = template.map((t, idx) => {
      const stepId = `${planId}_step_${idx}`
      return {
        id:           stepId,
        planId,
        sequence:     idx,
        label:        t.label,
        description:  t.description,
        agentType:    t.agentType,
        status:       t.dependsOnIdx.length === 0 ? 'READY' : 'WAITING',
        dependsOn:    t.dependsOnIdx.map(i => `${planId}_step_${i}`),
        estimatedMs:  t.estimatedMs,
      }
    })

    const totalMs = steps.reduce((acc, s) => acc + s.estimatedMs, 0)

    return {
      id:          planId,
      intentId:    intent.id,
      tenantId:    intent.tenantId,
      goal:        `${intent.type}: ${intent.raw.slice(0, 80)}`,
      steps,
      status:      'PENDING',
      confidence:  intent.confidence,
      estimatedMs: totalMs,
      createdAt:   new Date().toISOString(),
    }
  }
}
