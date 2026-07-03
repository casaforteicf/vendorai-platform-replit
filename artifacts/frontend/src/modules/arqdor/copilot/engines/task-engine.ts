// ─── Task Engine ──────────────────────────────────────────────────────────────
// Generates SmartTask list and Checklist from project context + AIE state.

import type { SmartTask, ChecklistItem, ChecklistStatus, TaskPriority, ProjectHealthResult } from '../copilot-types'
import type { ProjectContext } from '../../engines/aie/aie-types'

let _tid = 0
const task = (
  label: string,
  priority: TaskPriority,
  category: SmartTask['category'],
  objectRef?: string,
): SmartTask => ({
  id: `task-${++_tid}`,
  label, priority, category,
  status: 'PENDING',
  autoGen: true,
  objectRef,
})

export function generateTasks(ctx: ProjectContext): SmartTask[] {
  _tid = 0
  const tasks: SmartTask[] = []

  if (!ctx.renderGoal)  tasks.push(task('Definir objetivo do render', 'CRITICAL', 'OBJETIVO'))
  if (!ctx.style)       tasks.push(task('Escolher estilo do projeto', 'HIGH', 'PROMPT'))
  if (!ctx.lightingType) tasks.push(task('Definir tipo de iluminação', 'HIGH', 'ILUMINACAO'))
  if (!ctx.cameraAngle)  tasks.push(task('Escolher ângulo de câmera', 'MEDIUM', 'FOTOGRAFIA'))
  if (!ctx.dna)          tasks.push(task('Gerar DNA arquitetônico', 'HIGH', 'DNA'))

  for (const obj of ctx.objects.filter(o=>!o.material && !['PLANT','DECOR'].includes(o.category))) {
    tasks.push(task(`Escolher material: ${obj.name}`, obj.visualWeight && obj.visualWeight >= 70 ? 'CRITICAL' : 'HIGH', 'MATERIAL', obj.id))
  }

  const noMfr = ctx.materials.filter(m=>!m.manufacturer)
  if (noMfr.length > 0) tasks.push(task(`Confirmar fabricante em ${noMfr.length} material(is)`, 'MEDIUM', 'FABRICANTE'))

  const noComponents = ctx.objects.filter(o=>!o.componentId && !['PLANT','DECOR','LIGHTING'].includes(o.category))
  if (noComponents.length > 2) tasks.push(task(`Associar componentes reais (${noComponents.length} objetos)`, 'MEDIUM', 'BIBLIOTECA'))

  if (!ctx.photographyProfile) tasks.push(task('Definir perfil de fotografia', 'LOW', 'FOTOGRAFIA'))
  if (!ctx.lastRenderUrl) tasks.push(task('Renderizar projeto', 'LOW', 'RENDER'))

  return tasks
}

// ─── Checklist ────────────────────────────────────────────────────────────────

function status(score: number): ChecklistStatus {
  if (score >= 80) return 'DONE'
  if (score >= 40) return 'PARTIAL'
  return 'MISSING'
}

export function generateChecklist(ctx: ProjectContext): ChecklistItem[] {
  const matCoverage  = ctx.objects.length > 0
    ? Math.round((ctx.objects.filter(o=>o.material).length / ctx.objects.length) * 100) : 0
  const intentScore  = ctx.objects.length > 0
    ? Math.round((ctx.objects.filter(o=>o.designIntent?.length).length / ctx.objects.length) * 100) : 0
  const compScore    = ctx.objects.every(o=>o.componentId) ? 90 : ctx.objects.some(o=>o.componentId) ? 50 : 10
  const promptScore  = ctx.renderGoal ? (ctx.dna ? 90 : 60) : 20
  const lightScore   = ctx.lightingType ? 80 : 25
  const renderScore  = ctx.lastRenderUrl ? 100 : 0

  return [
    { area:'PROJETO',   icon:'🏗️', label:'Projeto',   status:status(intentScore),  score:intentScore,  detail:`${ctx.objects.length} objetos, ${Math.round(intentScore)}% com intenção` },
    { area:'VISION',    icon:'👁️', label:'Vision',    status:status(ctx.style?85:20), score:ctx.style?85:20, detail:ctx.style?`Estilo: ${ctx.style.name}`:'Nenhum upload processado' },
    { area:'OBJETOS',   icon:'📦', label:'Objetos',   status:status(ctx.objects.length>0?75:0), score:ctx.objects.length>0?75:0, detail:`${ctx.objects.length} objeto(s) no projeto` },
    { area:'MATERIAIS', icon:'🪵', label:'Materiais', status:status(matCoverage), score:matCoverage, detail:`${matCoverage}% de cobertura` },
    { area:'BIBLIOTECA',icon:'📚', label:'Biblioteca',status:status(compScore),   score:compScore,   detail:compScore>50?'Componentes associados':'Nenhum componente real' },
    { area:'PROMPT',    icon:'⚡', label:'Prompt',    status:status(promptScore), score:promptScore, detail:ctx.renderGoal?`Objetivo: ${ctx.renderGoal}`:'Prompt não configurado' },
    { area:'RENDER',    icon:'🎬', label:'Render',    status:status(ctx.lightingType?lightScore:20), score:lightScore, detail:ctx.lightingType?`Luz: ${ctx.lightingType}`:'Perfil não definido' },
    { area:'REVIEW',    icon:'🔍', label:'Review',    status:status(renderScore), score:renderScore, detail:ctx.lastRenderUrl?'Render disponível para review':'Aguardando primeiro render' },
  ]
}

// ─── Project Health ──────────────────────────────────────────────────────────

export function computeProjectHealth(ctx: ProjectContext): ProjectHealthResult {
  const matCoverage = ctx.objects.length > 0
    ? (ctx.objects.filter(o=>o.material).length / ctx.objects.length) * 100 : 0
  const score = Math.round(
    (ctx.renderGoal  ? 15 : 0) +
    (ctx.style       ? 15 : 0) +
    (ctx.lightingType? 10 : 0) +
    (ctx.dna         ? 10 : 0) +
    (ctx.cameraAngle ? 10 : 0) +
    matCoverage * 0.4
  )

  const alerts: string[] = []
  const reasons: string[] = []

  if (!ctx.renderGoal)    alerts.push('Objetivo de render não definido')
  if (!ctx.lightingType)  alerts.push('Perfil de iluminação ausente')
  if (matCoverage < 60)   alerts.push(`${Math.round(100-matCoverage)}% dos objetos sem material`)
  if (!ctx.dna)           alerts.push('DNA arquitetônico não gerado')
  if (ctx.materials.length === 0) alerts.push('Nenhum material cadastrado')

  if (score >= 85) reasons.push('Projeto bem estruturado com alta cobertura de material e intenção definida')
  else if (score >= 70) reasons.push('Boa base de projeto, alguns itens precisam de atenção')
  else if (score >= 50) reasons.push('Projeto em desenvolvimento, vários itens pendentes')
  else reasons.push('Projeto inicial, muitas informações ainda são necessárias')

  return {
    health: score >= 85 ? 'EXCELENTE' : score >= 70 ? 'BOM' : score >= 50 ? 'REGULAR' : 'NECESSITA_AJUSTES',
    score, reasons, alerts,
  }
}

export function computeProgress(ctx: ProjectContext): number {
  const checks = [
    ctx.objects.length > 0,
    ctx.materials.length > 0,
    !!ctx.style,
    !!ctx.renderGoal,
    !!ctx.lightingType,
    !!ctx.cameraAngle,
    !!ctx.dna,
    ctx.objects.filter(o=>o.material).length > ctx.objects.length * 0.7,
    ctx.objects.some(o=>o.componentId),
    !!ctx.lastRenderUrl,
  ]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
}
