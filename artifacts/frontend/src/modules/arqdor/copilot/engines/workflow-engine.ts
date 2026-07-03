// ─── Workflow Engine ──────────────────────────────────────────────────────────
// Defines the named workflows and resolves current step from project state.

import type { Workflow, WorkflowId, WorkflowStep, WorkflowStepStatus } from '../copilot-types'
import type { ProjectContext } from '../../engines/aie/aie-types'

type RawStep = Omit<WorkflowStep,'status'>

const WORKFLOW_DEFS: Record<WorkflowId, { name: string; steps: RawStep[] }> = {
  INITIAL: {
    name:'Workflow Inicial',
    steps: [
      { id:'w-upload',  label:'Upload',           icon:'📁', description:'Enviar imagem ou iniciar projeto em branco' },
      { id:'w-vision',  label:'Vision',           icon:'👁️', description:'Análise de imagem e extração de elementos' },
      { id:'w-project', label:'Projeto Inteligente', icon:'🏗️', description:'Definir objetos, materiais e intenção' },
      { id:'w-library', label:'Biblioteca',       icon:'📚', description:'Associar componentes reais' },
      { id:'w-prompt',  label:'Prompt',           icon:'⚡', description:'Gerar prompt de render otimizado' },
      { id:'w-render',  label:'Render',           icon:'🎬', description:'Renderizar com tradutor de IA' },
      { id:'w-review',  label:'Review',           icon:'🔍', description:'Comparar render vs projeto' },
    ],
  },
  REVISION: {
    name:'Workflow Revisão',
    steps: [
      { id:'w-upload-render', label:'Upload Render',  icon:'🖼️', description:'Enviar render para análise' },
      { id:'w-compare',       label:'Comparação',     icon:'⚖️',  description:'Comparar render vs especificação' },
      { id:'w-corrections',   label:'Correções',      icon:'🔄', description:'Identificar e detalhar diferenças' },
      { id:'w-new-prompt',    label:'Novo Prompt',    icon:'⚡', description:'Gerar prompt de correção focado' },
    ],
  },
  CATALOG: {
    name:'Workflow Catálogo',
    steps: [
      { id:'w-manufacturer',  label:'Selecionar fabricante', icon:'🏭', description:'Escolher marca do catálogo' },
      { id:'w-line',          label:'Selecionar linha',      icon:'📋', description:'Escolher linha do fabricante' },
      { id:'w-apply',         label:'Aplicar projeto',       icon:'✅', description:'Aplicar seleção ao projeto' },
    ],
  },
  MATERIAL_SELECTION: {
    name:'Seleção de Materiais',
    steps: [
      { id:'w-detect',   label:'Detectar objetos', icon:'🔍', description:'Identificar objetos sem material' },
      { id:'w-suggest',  label:'Sugestões',        icon:'💡', description:'Sugerir materiais compatíveis' },
      { id:'w-confirm',  label:'Confirmar',         icon:'✅', description:'Confirmar seleção e atualizar projeto' },
    ],
  },
  RENDER_PREP: {
    name:'Preparar Render',
    steps: [
      { id:'w-validate',  label:'Validar projeto',    icon:'✔️', description:'Verificar readiness do projeto' },
      { id:'w-lighting',  label:'Iluminação',         icon:'💡', description:'Definir perfil de luz' },
      { id:'w-camera',    label:'Câmera',             icon:'📷', description:'Definir ângulo e composição' },
      { id:'w-prompt',    label:'Gerar prompt',       icon:'⚡', description:'Compilar prompt final' },
      { id:'w-render',    label:'Renderizar',         icon:'🎬', description:'Enviar para renderização' },
    ],
  },
}

function resolveStep(id: WorkflowId, ctx: ProjectContext): number {
  switch (id) {
    case 'INITIAL': {
      if (!ctx.dna && !ctx.style)          return 2  // project
      if (ctx.objects.every(o=>!o.componentId)) return 3 // library
      if (!ctx.renderGoal)                 return 4  // prompt
      if (!ctx.lastRenderUrl)              return 5  // render
      return 6  // review
    }
    case 'RENDER_PREP': {
      if (!ctx.lightingType)   return 1
      if (!ctx.cameraAngle)    return 2
      if (!ctx.renderGoal)     return 3
      return 4
    }
    default: return 0
  }
}

function makeSteps(id: WorkflowId, current: number): WorkflowStep[] {
  return WORKFLOW_DEFS[id].steps.map((s, idx) => ({
    ...s,
    status: (
      idx < current ? 'DONE' :
      idx === current ? 'IN_PROGRESS' :
      'PENDING'
    ) as WorkflowStepStatus,
  }))
}

export function buildWorkflow(id: WorkflowId, ctx: ProjectContext): Workflow {
  const current = resolveStep(id, ctx)
  return { id, name:WORKFLOW_DEFS[id].name, steps:makeSteps(id, current), current }
}

export function getWorkflowDef(id: WorkflowId) {
  return WORKFLOW_DEFS[id]
}

export const ALL_WORKFLOW_IDS: WorkflowId[] = Object.keys(WORKFLOW_DEFS) as WorkflowId[]
