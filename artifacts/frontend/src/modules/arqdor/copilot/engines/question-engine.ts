// ─── Question Engine ──────────────────────────────────────────────────────────
// Generates prioritized questions from project state.
// Never asks what's already answered.

import type { CopilotQuestion, QuestionPriority, QuestionType } from '../copilot-types'
import type { ProjectContext } from '../../engines/aie/aie-types'

let _qid = 0
const q = (
  priority: QuestionPriority,
  type: QuestionType,
  text: string,
  chips: string[],
  impactPrompt: number,
  impactRender: number,
  impactProject: number,
  objectRef?: string,
): CopilotQuestion => ({
  id: `q-${++_qid}`,
  priority, type, text,
  objectRef,
  impactPrompt, impactRender, impactProject,
  status: 'PENDING',
  chips: chips.map(c => ({ label: c, value: c })),
})

export function generateQuestions(ctx: ProjectContext): CopilotQuestion[] {
  _qid = 0
  const questions: CopilotQuestion[] = []

  // ── CRITICAL — render goal ────────────────────────────────────────────────
  if (!ctx.renderGoal) {
    questions.push(q('CRITICAL','OBJETIVO','Qual é o objetivo deste render?',
      ['Fotorrealista','Editorial','Rápido','Apresentação ao cliente','Aprovação de material'],
      90,95,90))
  }

  // ── CRITICAL — objects without material ──────────────────────────────────
  const noMaterial = ctx.objects.filter(o => !o.material && !['PLANT','DECOR','LIGHTING'].includes(o.category))
  for (const obj of noMaterial.slice(0, 3)) {
    questions.push(q('CRITICAL','MATERIAL',
      `Qual material deseja para "${obj.name}"?`,
      ['MDF Freijó', 'Carvalho', 'Porcelanato', 'Mármore', 'Inox', 'Outro'],
      85,90,80,obj.id))
  }
  if (noMaterial.length > 3) {
    questions.push(q('HIGH','MATERIAL',
      `${noMaterial.length - 3} outros objetos também estão sem material. Deseja revisar?`,
      ['Sim, revisar todos','Depois'],80,85,75))
  }

  // ── HIGH — no style ───────────────────────────────────────────────────────
  if (!ctx.style) {
    questions.push(q('HIGH','PROMPT','Qual estilo predomina neste projeto?',
      ['Minimalista','Contemporâneo','Escandinavo','Industrial','Japandi','Outro'],70,80,85))
  }

  // ── HIGH — no DNA ─────────────────────────────────────────────────────────
  if (!ctx.dna) {
    questions.push(q('HIGH','DNA','Deseja gerar o DNA arquitetônico do projeto automaticamente?',
      ['Sim, gerar DNA','Prefiro escrever manualmente'],85,70,80))
  }

  // ── HIGH — no lighting ────────────────────────────────────────────────────
  if (!ctx.lightingType) {
    questions.push(q('HIGH','ILUMINACAO','Qual tipo de iluminação predomina no ambiente?',
      ['Luz natural','Artificial','Mista','Indireta','Spotlight'],75,90,70))
  }

  // ── MEDIUM — no camera ────────────────────────────────────────────────────
  if (!ctx.cameraAngle) {
    questions.push(q('MEDIUM','FOTOGRAFIA','Qual lens deseja utilizar?',
      ['24mm — Wide','28mm — Editorial','35mm — Natural','50mm — Padrão','85mm — Detalhes'],
      65,75,60))
  }

  // ── MEDIUM — materials without manufacturer ──────────────────────────────
  const noMfr = ctx.materials.filter(m => !m.manufacturer)
  if (noMfr.length > 0) {
    questions.push(q('MEDIUM','FABRICANTE',
      `${noMfr.length} material(is) sem fabricante. Deseja selecionar?`,
      ['Portobello','Duratex','Cosentino','Tramontina','Outro'],55,60,65))
  }

  // ── LOW — photography profile ────────────────────────────────────────────
  if (!ctx.photographyProfile) {
    questions.push(q('LOW','FOTOGRAFIA','Qual mood fotográfico deseja para o render?',
      ['Quente e acolhedor','Neutro editorial','Dramático e contrastado','Aéreo e clean'],
      60,70,50))
  }

  return questions.sort((a, b) => {
    const p = { CRITICAL:5, HIGH:4, MEDIUM:3, LOW:2, OPTIONAL:1 }
    return (p[b.priority] ?? 0) - (p[a.priority] ?? 0)
  })
}
