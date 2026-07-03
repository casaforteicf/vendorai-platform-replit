// ─── Integration Mock Data ────────────────────────────────────────────────────

import type {
  HubMeta, CrmLead, CrmDeal, ProjectCrmLinkage, AgentSpec,
  WorkflowAutomation, ArqAnalyticsSnapshot, VendorTask, KnowledgeEntry,
  ManagedFile,
} from '../integration-types'

// ─── Hub registry ─────────────────────────────────────────────────────────────

export const HUB_META: HubMeta[] = [
  { id:'CRM',           label:'CRM Hub',           icon:'🤝', description:'Leads, Deals, Contatos, Pipeline',     connected:true  },
  { id:'KNOWLEDGE',     label:'Knowledge Hub',     icon:'📚', description:'Normas, Materiais, Catálogos, FAQs',  connected:true  },
  { id:'AGENTS',        label:'AI Agents',         icon:'🤖', description:'Agentes especializados por vertical',  connected:true  },
  { id:'WORKFLOWS',     label:'Workflow Hub',      icon:'⚡', description:'Automações de projeto e comercial',   connected:true  },
  { id:'MARKETPLACE',   label:'Marketplace',       icon:'🛒', description:'Materiais, Templates, DNA, Prompts',  connected:true  },
  { id:'ANALYTICS',     label:'Analytics Hub',     icon:'📊', description:'Métricas de projeto e render',        connected:true  },
  { id:'FILES',         label:'Files Hub',         icon:'📁', description:'Renders, PBR, PDFs, Catálogos',      connected:true  },
  { id:'NOTIFICATIONS', label:'Notificações',      icon:'🔔', description:'Alertas, Status, Revisões',          connected:true  },
  { id:'TASKS',         label:'Task Hub',          icon:'✅', description:'Tarefas do Copilot na Vendor.ai',    connected:true  },
  { id:'BILLING',       label:'Billing Hub',       icon:'💳', description:'Planos, Uso, Faturas',               connected:false },
]

// ─── CRM ──────────────────────────────────────────────────────────────────────

export const MOCK_CRM_LEAD: CrmLead = {
  id:'lead-001', name:'Carlos Silva', email:'carlos.silva@email.com', phone:'+55 11 99999-0001',
  propensityScore:87, roiEstimate:'R$ 8.400/mês',
}

export const MOCK_CRM_DEAL: CrmDeal = {
  id:'deal-001', name:'Residência Silva — Remodelação Cozinha', value:42000,
  etapa:'proposta', leadId:'lead-001', probability:72,
}

export const MOCK_PROJECT_CRM: ProjectCrmLinkage = {
  projectId:'proj-alpha-001', leadId:'lead-001', dealId:'deal-001',
  lead:MOCK_CRM_LEAD, deal:MOCK_CRM_DEAL,
}

// ─── AI Agents ────────────────────────────────────────────────────────────────

export const MOCK_AGENTS: AgentSpec[] = [
  { id:'agent-01', role:'ARQUITETO_IA',   name:'Arquiteto IA',    icon:'🏛️', vertical:'ARCH', status:'ACTIVE',   model:'gpt-4o',   description:'Copilot de projeto, análise de espaços e condução do briefing',  capabilities:['Análise de projeto','Detecção de elementos','Sugestão de materiais','Briefing IA'] },
  { id:'agent-02', role:'DESIGNER_IA',    name:'Designer IA',     icon:'🎨', vertical:'ARCH', status:'ACTIVE',   model:'claude-3', description:'Curadoria estética, paleta e design intent',                       capabilities:['Curadoria de estilo','Paleta de cores','Design intent','Moodboard'] },
  { id:'agent-03', role:'RENDER_IA',      name:'Render IA',       icon:'🎬', vertical:'ARCH', status:'ACTIVE',   model:'flux-1.1', description:'Traduz o projeto para prompt e conduz o render',                   capabilities:['Geração de prompt','Seleção de tradutor','Análise de render','Correção'] },
  { id:'agent-04', role:'ESPECIFICADOR_IA',name:'Especificador IA',icon:'📋', vertical:'ARCH', status:'INACTIVE', model:'gpt-4o',   description:'Gera memoriais descritivos e especificações técnicas',             capabilities:['Memorial descritivo','Especificação técnica','Normas ABNT','Quantitativos'] },
  { id:'agent-05', role:'COMPRADOR_IA',   name:'Comprador IA',    icon:'🛒', vertical:'ARCH', status:'INACTIVE', model:'gpt-4o',   description:'Pesquisa preços, fornecedores e alternativas de material',         capabilities:['Pesquisa de preços','Fornecedores','Alternativas','Cotação'] },
  { id:'agent-06', role:'COMERCIAL_IA',   name:'Comercial IA',    icon:'💼', vertical:'ARCH', status:'ACTIVE',   model:'gpt-4o',   description:'Vincula o projeto ao CRM, proposta e pipeline',                    capabilities:['CRM integration','Proposta','Pipeline','Fechamento'] },
  { id:'agent-07', role:'MARKETING_IA',   name:'Marketing IA',    icon:'📣', vertical:'ARCH', status:'INACTIVE', model:'gpt-4o',   description:'Portfólio, publicação e campanha a partir do render aprovado',       capabilities:['Portfólio','Instagram','Campanha','Publicação'] },
]

// ─── Workflows ────────────────────────────────────────────────────────────────

export const MOCK_WORKFLOWS: WorkflowAutomation[] = [
  {
    id:'wf-001', name:'Projeto Aprovado → Comercial', active:true,
    trigger:'PROJECT_APPROVED', triggerLabel:'Projeto aprovado pelo cliente',
    steps:[
      { id:'s1', label:'Gerar memorial descritivo', icon:'📋', hubId:'KNOWLEDGE', action:'generate_memorial' },
      { id:'s2', label:'Gerar orçamento',           icon:'💰', hubId:'CRM',       action:'create_quote'     },
      { id:'s3', label:'Criar proposta',            icon:'📄', hubId:'CRM',       action:'create_proposal'  },
      { id:'s4', label:'Criar task comercial',      icon:'✅', hubId:'TASKS',     action:'create_task'      },
      { id:'s5', label:'Notificar equipe',          icon:'🔔', hubId:'NOTIFICATIONS', action:'notify_team'  },
    ],
  },
  {
    id:'wf-002', name:'Render Aprovado → Marketing', active:true,
    trigger:'RENDER_COMPLETED', triggerLabel:'Render concluído e aprovado',
    steps:[
      { id:'s1', label:'Salvar render no Files Hub', icon:'📁', hubId:'FILES',         action:'save_render'    },
      { id:'s2', label:'Criar campanha marketing',   icon:'📣', hubId:'WORKFLOWS',     action:'create_campaign'},
      { id:'s3', label:'Publicar portfólio',         icon:'🌐', hubId:'MARKETPLACE',   action:'publish_portfolio'},
    ],
  },
  {
    id:'wf-003', name:'Deal Ganho → Execução', active:false,
    trigger:'CRM_DEAL_WON', triggerLabel:'Deal marcado como ganho no CRM',
    steps:[
      { id:'s1', label:'Arquivar proposta',   icon:'📋', hubId:'FILES',   action:'archive_proposal' },
      { id:'s2', label:'Abrir obra no CRM',   icon:'🏗️', hubId:'CRM',     action:'open_project'     },
      { id:'s3', label:'Notificar arquiteto', icon:'🔔', hubId:'NOTIFICATIONS', action:'notify_arch'  },
    ],
  },
]

// ─── Analytics ────────────────────────────────────────────────────────────────

export const MOCK_ANALYTICS: ArqAnalyticsSnapshot = {
  tenantId:'tenant-arq-001', period:'Junho 2025',
  projectsCreated:14, avgRenderReady:68, avgFidelityScore:81,
  topMaterials:['MDF Freijó','Dekton Laurent','Inox Escovado','Porcelanato Cimento'],
  topManufacturers:['Portobello','Todeschini','Cosentino','Tramontina'],
  rendersGenerated:38, avgProjectTime:'4h 12min',
  metrics:[
    { key:'projects_created',   label:'Projetos criados',       value:14,       trend:'UP',   trendPct:27 },
    { key:'avg_render_ready',   label:'Render Readiness médio', value:'68%',    trend:'UP',   trendPct:12 },
    { key:'avg_fidelity',       label:'Fidelity Score médio',   value:'81/100', trend:'STABLE' },
    { key:'renders_generated',  label:'Renders gerados',        value:38,       trend:'UP',   trendPct:41 },
    { key:'avg_project_time',   label:'Tempo médio por projeto',value:'4h 12min', trend:'DOWN', trendPct:15 },
    { key:'materials_added',    label:'Materiais cadastrados',  value:127,      trend:'UP',   trendPct:18 },
  ],
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const MOCK_VENDOR_TASKS: VendorTask[] = [
  { id:'vt-001', title:'Escolher material bancada Residência Silva', sourceType:'COPILOT_RECOMMENDATION', priority:'CRITICAL', status:'TODO',        projectId:'proj-alpha-001', tenantId:'tenant-arq-001', createdAt:'2025-06-01T10:15:00Z' },
  { id:'vt-002', title:'Confirmar MDF da marcenaria com cliente',   sourceType:'COPILOT_RECOMMENDATION', priority:'HIGH',     status:'IN_PROGRESS', projectId:'proj-alpha-001', tenantId:'tenant-arq-001', createdAt:'2025-06-01T10:17:00Z' },
  { id:'vt-003', title:'Definir fotografia — lens e ângulo',        sourceType:'AIE_ALERT',             priority:'MEDIUM',   status:'TODO',        projectId:'proj-alpha-001', tenantId:'tenant-arq-001', createdAt:'2025-06-01T11:00:00Z' },
  { id:'vt-004', title:'Escolher fabricante dos eletrodomésticos',  sourceType:'COPILOT_RECOMMENDATION', priority:'MEDIUM',   status:'TODO',        projectId:'proj-alpha-001', tenantId:'tenant-arq-001', createdAt:'2025-06-01T11:20:00Z' },
  { id:'vt-005', title:'Enviar proposta ao cliente Carlos Silva',   sourceType:'MANUAL',                priority:'HIGH',     status:'DONE',        projectId:'proj-alpha-001', tenantId:'tenant-arq-001', createdAt:'2025-05-30T09:00:00Z' },
]

// ─── Knowledge ────────────────────────────────────────────────────────────────

export const MOCK_KNOWLEDGE: KnowledgeEntry[] = [
  { id:'kb-001', category:'NORMAS',        title:'NBR 9050 — Acessibilidade',            summary:'Requisitos de acessibilidade para ambientes residenciais e comerciais.',            tags:['acessibilidade','norma','ABNT'], relevance:45 },
  { id:'kb-002', category:'MATERIAIS',     title:'Guia: Porcelanatos para Cozinhas',     summary:'Seleção, especificação e aplicação de porcelanatos em ambientes molhados.',         tags:['porcelanato','cozinha','material'], relevance:92 },
  { id:'kb-003', category:'BOAS_PRATICAS', title:'Iluminação para Renderização 3D',     summary:'Temperaturas de cor, intensidades e HDRI para renders fotorrealistas.',             tags:['iluminação','render','3D'], relevance:88 },
  { id:'kb-004', category:'CATALOGOS',     title:'Catálogo Portobello 2025',            summary:'Linha completa de porcelanatos, revestimentos e acabamentos Portobello.',           tags:['portobello','catálogo','2025'], relevance:75 },
  { id:'kb-005', category:'GUIAS_TECNICOS',title:'Especificação de MDF e Madeirite',   summary:'Espessuras, acabamentos, umidade máxima e aplicações em marcenaria.',             tags:['mdf','madeira','marcenaria'], relevance:80 },
  { id:'kb-006', category:'MEMORIAIS',     title:'Template Memorial Descritivo Arch',  summary:'Modelo de memorial descritivo para projetos de arquitetura de interiores.',         tags:['memorial','template','interiores'], relevance:65 },
]

// ─── Files ────────────────────────────────────────────────────────────────────

export const MOCK_FILES: ManagedFile[] = [
  { id:'f-001', name:'Render_Alpha_v1.jpg',       category:'RENDER',      url:'', sizeKb:2840, projectId:'proj-alpha-001', uploadedAt:'2025-06-01T14:00:00Z', uploadedBy:'user-arch-001' },
  { id:'f-002', name:'Freijó_PBR_Diffuse.png',   category:'PBR_TEXTURE', url:'', sizeKb:1240, projectId:'proj-alpha-001', uploadedAt:'2025-06-01T09:30:00Z', uploadedBy:'user-arch-001' },
  { id:'f-003', name:'Portobello_Catalogo.pdf',  category:'CATALOG',     url:'', sizeKb:8400, projectId:'proj-alpha-001', uploadedAt:'2025-05-30T11:00:00Z', uploadedBy:'user-arch-001' },
  { id:'f-004', name:'Referencia_Cozinha_01.jpg',category:'REFERENCE',   url:'', sizeKb:980,  projectId:'proj-alpha-001', uploadedAt:'2025-05-29T16:00:00Z', uploadedBy:'user-arch-001' },
]
