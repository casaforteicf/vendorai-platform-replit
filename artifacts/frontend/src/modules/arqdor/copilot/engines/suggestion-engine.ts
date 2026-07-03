// ─── Suggestion Engine ────────────────────────────────────────────────────────
// Generates proactive suggestions based on what the project currently has.
// Every suggestion explains WHY it was generated.

import type { CopilotSuggestion } from '../copilot-types'
import type { ProjectContext } from '../../engines/aie/aie-types'

let _sid = 0
const sug = (
  text: string,
  why: string[],
  category: CopilotSuggestion['category'],
  impact: number,
  chips: string[],
): CopilotSuggestion => ({
  id: `sug-${++_sid}`,
  text, why, category, impact,
  status: 'PENDING',
  chips: chips.map(c => ({ label: c, value: c })),
})

// Auto-complete map: when brand X is present, suggest related brands/products
const BRAND_AUTOCOMPLETE: Record<string, { suggestions: string[]; why: string[] }> = {
  'Todeschini': {
    suggestions:['Ferragens Blum','Puxadores Todeschini Premium','Acabamento Ultramate'],
    why:['Compatível com linha Todeschini','Mesmo padrão construtivo do projeto','Maior fidelidade de material'],
  },
  'Portobello': {
    suggestions:['Rejunte Portobello','Rodapé cerâmico','Acabamento Matte Full'],
    why:['Linha completa Portobello','Mesma família de produto','Garante uniformidade de acabamento'],
  },
  'Cosentino': {
    suggestions:['Dekton Laurent','Silestone Calacatta','Dekton Keon'],
    why:['Família Cosentino mantém paleta coerente','Resistência superior para áreas molhadas'],
  },
  'Docol': {
    suggestions:['Linha Lorenzetti Duo','Torneira Docol Essence','Chuveiro Docol Air'],
    why:['Mesmo ecossistema metálico','Acabamento inox escovado compatível'],
  },
  'Tramontina': {
    suggestions:['Linha Tramontina Splendore','Inox Tramontina 304','Cuba Tramontina'],
    why:['Fabricante de referência em inox','Compatível com acabamentos existentes'],
  },
}

export function generateSuggestions(ctx: ProjectContext): CopilotSuggestion[] {
  _sid = 0
  const suggestions: CopilotSuggestion[] = []

  // Brand autocomplete suggestions
  const brands = new Set(ctx.materials.map(m => m.manufacturer).filter(Boolean))
  for (const brand of brands) {
    const autocomplete = BRAND_AUTOCOMPLETE[brand]
    if (autocomplete) {
      suggestions.push(sug(
        `Posso aplicar produtos complementares ${brand}?`,
        autocomplete.why,
        'FABRICANTE',
        75,
        autocomplete.suggestions,
      ))
    }
  }

  // Hardware suggestion if cabinetry exists
  const hasCabinetry = ctx.objects.some(o => o.category === 'CABINETRY')
  const hasHandle    = ctx.objects.some(o => o.category === 'HANDLE' || o.category === 'HARDWARE')
  if (hasCabinetry && !hasHandle) {
    suggestions.push(sug(
      'Posso adicionar ferragens Blum para a marcenaria?',
      ['Padrão de mercado para marcenaria de qualidade','Compatível com o perfil do projeto','Ferragens definem acabamento final'],
      'FERRAGEM', 70, ['Sim, adicionar','Outra marca','Sem ferragens'],
    ))
  }

  // Lighting suggestion
  if (!ctx.lightingType) {
    suggestions.push(sug(
      'Posso aplicar iluminação 3000K para este ambiente?',
      ['Temperatura ideal para ambientes residenciais acolhedores','Compatível com materiais quentes do projeto','Diferença visível no render'],
      'ILUMINACAO', 80, ['Sim, aplicar','Prefiro 4000K','Prefiro 5000K','Escolher depois'],
    ))
  }

  // Photography suggestion
  if (!ctx.photographyProfile) {
    suggestions.push(sug(
      'Posso utilizar fotografia editorial padrão 35mm?',
      ['Lens mais utilizada em projetos residenciais contemporâneos','Preserva proporções naturais do ambiente','Resultado próximo ao que o cliente espera'],
      'FOTOGRAFIA', 65, ['Sim, usar 35mm','Prefiro 28mm','Prefiro 24mm','Decidir depois'],
    ))
  }

  // Library suggestion
  const hasNoComponents = ctx.objects.every(o => !o.componentId)
  if (hasNoComponents && ctx.objects.length > 3) {
    suggestions.push(sug(
      'Posso substituir objetos genéricos por componentes reais da biblioteca?',
      ['Componentes reais aumentam fidelidade do render','Fabricantes e especificações reais geram melhores prompts','Reduz ambiguidades de interpretação'],
      'BIBLIOTECA', 85, ['Sim, abrir biblioteca','Depois','Não por agora'],
    ))
  }

  // DNA suggestion if missing
  if (!ctx.dna && ctx.style) {
    suggestions.push(sug(
      `Posso gerar o DNA do projeto baseado no estilo ${ctx.style.name}?`,
      ['DNA gera prompts muito mais precisos','Reduz iterações de render','Captura a essência do projeto em texto'],
      'DNA', 80, ['Sim, gerar DNA','Prefiro escrever'],
    ))
  }

  return suggestions.sort((a,b) => b.impact - a.impact)
}
