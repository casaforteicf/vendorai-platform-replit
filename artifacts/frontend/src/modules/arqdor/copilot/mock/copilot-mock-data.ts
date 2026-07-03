// ─── Copilot Mock Data ────────────────────────────────────────────────────────

import type { CopilotMessage } from '../copilot-types'

function now(minutesAgo = 0): string {
  return new Date(Date.now() - minutesAgo * 60000).toISOString()
}

export const INITIAL_MESSAGES: CopilotMessage[] = [
  {
    id:'msg-001', role:'COPILOT', timestamp:now(45),
    text:'Olá! Sou o ARQ Copilot, seu assistente de projeto. Estou analisando o "Apartamento Alpha — Cozinha + Sala".',
  },
  {
    id:'msg-002', role:'COPILOT', timestamp:now(44),
    text:'Detectei uma cozinha integrada com sala de estar. Confiança: 98%.\n\nDeseja iniciar a análise completa do projeto?',
    actions:[
      { label:'Sim, analisar', value:'analyze', variant:'PRIMARY', icon:'▶' },
      { label:'Mais tarde',    value:'later',   variant:'GHOST' },
    ],
    metadata:{ category:'VISION', confidence:98 },
  },
  {
    id:'msg-003', role:'USER', timestamp:now(43),
    text:'Sim, analisar',
  },
  {
    id:'msg-004', role:'COPILOT', timestamp:now(42),
    text:'✓ Análise concluída!\n\nEncontrei 12 objetos. A marcenaria parece ser MDF. Deseja escolher um fabricante?',
    chips:[
      { label:'Guararapes',  value:'Guararapes'  },
      { label:'Duratex',     value:'Duratex'     },
      { label:'Arauco',      value:'Arauco'      },
      { label:'Todeschini',  value:'Todeschini'  },
      { label:'Florense',    value:'Florense'    },
      { label:'Outro',       value:'outro'       },
    ],
    metadata:{ category:'MATERIAL', objectRef:'obj-001' },
  },
  {
    id:'msg-005', role:'USER', timestamp:now(41),
    text:'Duratex',
  },
  {
    id:'msg-006', role:'COPILOT', timestamp:now(40),
    text:'✓ Duratex selecionada para a marcenaria.\n\nA bancada parece uma pedra clara. Qual deseja utilizar?',
    chips:[
      { label:'Dekton Laurent',    value:'Dekton Laurent'    },
      { label:'Calacatta Gold',    value:'Calacatta Gold'    },
      { label:'Branco Paraná',     value:'Branco Paraná'     },
      { label:'Silestone Eternal', value:'Silestone Eternal' },
      { label:'Outro',             value:'outro'             },
    ],
    metadata:{ category:'MATERIAL', confidence:85, objectRef:'obj-002' },
  },
  {
    id:'msg-007', role:'USER', timestamp:now(38),
    text:'Dekton Laurent',
  },
  {
    id:'msg-008', role:'COPILOT', timestamp:now(37),
    text:'✓ Dekton Laurent definida para a bancada.\n\nOs eletrodomésticos podem ser substituídos por componentes reais da biblioteca para maior fidelidade de render.\n\nDeseja abrir a biblioteca?',
    actions:[
      { label:'Abrir biblioteca', value:'library', variant:'PRIMARY', icon:'📚' },
      { label:'Não agora',        value:'skip',    variant:'GHOST' },
    ],
    metadata:{ category:'BIBLIOTECA' },
  },
  {
    id:'msg-009', role:'SYSTEM', timestamp:now(15),
    text:'Análise AIE concluída. Overall Score: 74/100. 3 itens bloqueantes para render.',
    metadata:{ category:'AI_INTEL' },
  },
  {
    id:'msg-010', role:'COPILOT', timestamp:now(14),
    text:'🔍 Detectei algumas pendências importantes:\n\n• Objetivo de render não definido\n• Perfil de iluminação ausente\n• Cooktop sem material\n\nDeseja resolver agora?',
    actions:[
      { label:'Resolver pendências', value:'resolve',  variant:'PRIMARY', icon:'✓' },
      { label:'Ver no AI Intel',     value:'ai-intel', variant:'SECONDARY', icon:'🧠' },
    ],
    metadata:{ category:'VALIDATION' },
  },
]

export const WELCOME_MESSAGE: CopilotMessage = {
  id:'msg-welcome', role:'COPILOT', timestamp:now(),
  text:'👋 Olá! Sou o ARQ Copilot.\n\nEstou acompanhando seu projeto e vou sugerir próximos passos, detectar pendências e fazer perguntas apenas quando necessário.\n\nComo posso ajudar?',
  chips:[
    { label:'Ver pendências',   value:'pendencias'  },
    { label:'Próximo passo',    value:'next'        },
    { label:'Análise completa', value:'analyze'     },
    { label:'Ajuda',            value:'help'        },
  ],
}
