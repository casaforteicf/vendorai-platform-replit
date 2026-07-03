// ─── Validation Engine ────────────────────────────────────────────────────────
// Runs structured validation rules against the project context.

import type { ProjectContext, ValidationResult, ValidationSummary, ValidationStatus } from '../aie-types'

interface Rule {
  id:   string
  name: string
  run:  (ctx: ProjectContext) => { status: ValidationStatus; message: string; objects?: string[]; resolution?: string }
}

const RULES: Rule[] = [
  {
    id:'VLD-001', name:'Objetos sem material',
    run(ctx) {
      const missing = ctx.objects.filter(o=>!o.material && !['PLANT','DECOR','LIGHTING'].includes(o.category))
      if (missing.length === 0) return { status:'PASS', message:'Todos os objetos têm material definido.' }
      if (missing.length <= 2) return { status:'WARN', message:`${missing.length} objeto(s) sem material: ${missing.map(o=>o.name).join(', ')}`, objects:missing.map(o=>o.name), resolution:'Atribuir material a cada objeto' }
      return { status:'FAIL', message:`${missing.length} objetos sem material. Render genérico obrigatório.`, objects:missing.map(o=>o.name), resolution:'Atribuir material a todos os objetos' }
    },
  },
  {
    id:'VLD-002', name:'Material sem fabricante',
    run(ctx) {
      const withoutMfr = ctx.materials.filter(m=>!m.manufacturer)
      if (withoutMfr.length === 0) return { status:'PASS', message:'Todos os materiais têm fabricante.' }
      return { status:'WARN', message:`${withoutMfr.length} material(is) sem fabricante referenciado.`, objects:withoutMfr.map(m=>m.name), resolution:'Associar fabricante a cada material' }
    },
  },
  {
    id:'VLD-003', name:'Projeto sem estilo definido',
    run(ctx) {
      if (ctx.style) return { status:'PASS', message:`Estilo definido: ${ctx.style.name}.` }
      return { status:'WARN', message:'Nenhum estilo definido. A coerência estética não pode ser validada.', resolution:'Definir o estilo do projeto no ARQ HUB > Estilos' }
    },
  },
  {
    id:'VLD-004', name:'DNA do projeto ausente',
    run(ctx) {
      if (ctx.dna) return { status:'PASS', message:'DNA do projeto definido.' }
      return { status:'WARN', message:'DNA arquitetônico não definido. Prompts serão menos precisos.', resolution:'Gerar DNA no módulo de IA' }
    },
  },
  {
    id:'VLD-005', name:'Objetivo de render ausente',
    run(ctx) {
      if (ctx.renderGoal) return { status:'PASS', message:`Objetivo de render: ${ctx.renderGoal}.` }
      return { status:'FAIL', message:'Nenhum objetivo de render definido. O motor não sabe o que priorizar.', resolution:'Definir objetivo no Prompt Playground' }
    },
  },
  {
    id:'VLD-006', name:'Objetos sem dimensões',
    run(ctx) {
      const noDim = ctx.objects.filter(o=>!o.dimensions && !['PLANT','DECOR','HANDLE','HARDWARE'].includes(o.category))
      if (noDim.length === 0) return { status:'PASS', message:'Todos os objetos principais têm dimensões.' }
      if (noDim.length <= 3) return { status:'WARN', message:`${noDim.length} objeto(s) sem dimensões: ${noDim.map(o=>o.name).join(', ')}`, objects:noDim.map(o=>o.name), resolution:'Adicionar dimensões reais dos produtos' }
      return { status:'FAIL', message:`${noDim.length} objetos sem dimensões. Escala comprometida.`, objects:noDim.map(o=>o.name), resolution:'Adicionar dimensões de todos os objetos' }
    },
  },
  {
    id:'VLD-007', name:'Perfil de iluminação ausente',
    run(ctx) {
      if (ctx.lightingType) return { status:'PASS', message:`Tipo de iluminação: ${ctx.lightingType}.` }
      return { status:'WARN', message:'Perfil de iluminação não definido. Resultado do render imprevisível.', resolution:'Definir tipo de luz e temperatura no Lighting Engine' }
    },
  },
  {
    id:'VLD-008', name:'Objetos sem design intent',
    run(ctx) {
      const noIntent = ctx.objects.filter(o=>!o.designIntent || o.designIntent.length===0)
      if (noIntent.length === 0) return { status:'PASS', message:'Todos os objetos têm design intent.' }
      if (noIntent.length < ctx.objects.length * 0.5) return { status:'WARN', message:`${noIntent.length} de ${ctx.objects.length} objetos sem design intent.`, objects:noIntent.map(o=>o.name) }
      return { status:'FAIL', message:`Maioria dos objetos (${noIntent.length}/${ctx.objects.length}) sem design intent.`, resolution:'Definir intenção de design para cada objeto' }
    },
  },
  {
    id:'VLD-009', name:'Projeto sem materiais cadastrados',
    run(ctx) {
      if (ctx.materials.length > 0) return { status:'PASS', message:`${ctx.materials.length} material(is) cadastrado(s).` }
      return { status:'FAIL', message:'Nenhum material cadastrado no projeto.', resolution:'Adicionar materiais via Material Hub' }
    },
  },
  {
    id:'VLD-010', name:'Perfil de câmera ausente',
    run(ctx) {
      if (ctx.cameraAngle) return { status:'PASS', message:`Câmera: ${ctx.cameraAngle}.` }
      return { status:'WARN', message:'Ângulo de câmera não definido. Composição fotográfica sem controle.', resolution:'Definir perfil de câmera no Photography Engine' }
    },
  },
]

export function runValidationEngine(ctx: ProjectContext): ValidationSummary {
  const results: ValidationResult[] = RULES.map(rule => {
    const { status, message, objects, resolution } = rule.run(ctx)
    return { id:rule.id, rule:rule.name, status, message, affectedObjects:objects, resolution }
  })

  const pass  = results.filter(r=>r.status==='PASS').length
  const warn  = results.filter(r=>r.status==='WARN').length
  const fail  = results.filter(r=>r.status==='FAIL').length

  // Score: 100 base, -10 per warn, -20 per fail
  const score = Math.max(0, Math.min(100, 100 - (warn * 10) - (fail * 20)))

  return { pass, warn, fail, results, score }
}
