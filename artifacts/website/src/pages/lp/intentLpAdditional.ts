import type { WrittenLpSegment } from "./intentLpOverrides";

export const ADDITIONAL_INTENT_LP_SEGMENTS: WrittenLpSegment[] = [
  {
    slug: "academias-studios",
    aliases: ["academias", "studios", "fitness"],
    name: "Academias e Studios",
    audience: "B2C",
    decisionMakers: ["Proprietário", "Gerente", "Comercial"],
    corePain: "Leads de aula experimental, matrículas, renovações e alunos em risco de cancelamento se perdem sem acompanhamento contínuo.",
    promise: "Transformar captação, matrícula, frequência, renovação e reativação em uma jornada comercial previsível.",
    priorityAgents: ["Atendimento", "SDR", "Follow-up", "Agendamento", "Pós-venda", "Revenue Scout"],
    kpis: ["aulas experimentais", "matrículas", "renovações", "churn", "reativação"],
    intents: {
      dor: {
        title: "Sua academia pode estar perdendo alunos antes mesmo da matrícula",
        subtitle: "Leads de aula experimental sem retorno, alunos que reduzem frequência, renovações esquecidas e cancelamentos previsíveis deixam receita escapar todos os meses.",
        sectionTitle: "10 problemas que reduzem matrículas e retenção",
        bullets: [
          "Leads pedem informação e não recebem follow-up no momento certo",
          "Aula experimental acontece, mas a matrícula não é acompanhada",
          "A equipe não sabe quais leads estão mais próximos de fechar",
          "Alunos começam a faltar e ninguém percebe cedo",
          "Renovações dependem de lembretes manuais",
          "Cancelamentos são tratados quando já aconteceram",
          "Ex-alunos ficam esquecidos na base",
          "Campanhas geram contatos, mas a origem não acompanha a venda",
          "O histórico de atendimento fica espalhado entre WhatsApp e planilhas",
          "A gestão vê número de alunos, mas não enxerga claramente o risco de churn"
        ],
        flow: ["Lead", "Aula experimental", "Follow-up", "Matrícula", "Frequência", "Renovação"]
      },
      marketing: {
        title: "Transforme marketing em mais aulas experimentais e matrículas",
        subtitle: "Conteúdo, Meta, Google, landing pages, WhatsApp e CRM conectados para transformar interesse em visita, experiência e matrícula.",
        sectionTitle: "Campanhas para crescer com mais previsibilidade",
        bullets: [
          "Captação para aula experimental",
          "Campanhas por modalidade e objetivo",
          "Meta Ads para descoberta e transformação",
          "Google Ads para quem já procura academia ou studio",
          "Landing pages por modalidade, unidade e campanha",
          "WhatsApp ligado à origem do lead",
          "Reativação de ex-alunos",
          "Campanhas de renovação",
          "Conteúdo com rotina, resultados, professores e estrutura",
          "Medição por visita, matrícula, retenção e receita"
        ],
        flow: ["Conteúdo", "Meta / Google", "Landing Page", "WhatsApp", "Aula experimental", "Matrícula"]
      },
      crm: {
        title: "CRM com IA para Academias e Studios",
        subtitle: "Organize leads, aulas experimentais, matrículas, frequência, renovações, churn, reativação e relacionamento em um único processo.",
        sectionTitle: "CRM para captação, retenção e recorrência",
        bullets: [
          "Pipeline de novos alunos",
          "Aula experimental com próxima ação definida",
          "Follow-up automático e assistido",
          "WhatsApp conectado ao histórico",
          "Sinais de queda de frequência",
          "Alunos em risco de cancelamento",
          "Renovações organizadas",
          "Reativação de ex-alunos",
          "Agentes de IA para atendimento e follow-up",
          "Revenue Scout e inteligência de retenção"
        ],
        flow: ["Lead", "Experiência", "Matrícula", "Engajamento", "Renovação", "Reativação"]
      }
    }
  }
];

export function findAdditionalIntentSegment(slug: string) {
  return ADDITIONAL_INTENT_LP_SEGMENTS.find((segment) => segment.slug === slug || segment.aliases?.includes(slug));
}
