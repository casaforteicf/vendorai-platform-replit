export interface AutomaticChangelogEntry {
  id: string;
  titulo: string;
  descricao: string;
  tipo: "novidade" | "melhoria" | "correcao";
  publicadoEm: string;
  pullRequest: number;
}

// Este arquivo é atualizado automaticamente após cada PR incorporado à main.
// A edição manual continua disponível para comunicados que não nascem de uma entrega.
export const automaticChangelogEntries: AutomaticChangelogEntry[] = [
  {
    "id": "pr-216",
    "titulo": "remover excluídos da pipeline e dashboard",
    "descricao": "Leads excluídos deixam de aparecer na pipeline e nos indicadores do dashboard.",
    "tipo": "correcao",
    "publicadoEm": "2026-08-31T16:19:51.000Z",
    "pullRequest": 216
  },
  {
    "id": "pr-214",
    "titulo": "Remove contatos Não lead da pipeline comercial",
    "descricao": "contatos classificados como **Não lead** deixam de aparecer imediatamente na pipeline a quantidade de negócios passa a considerar apenas oportunidades comerciais alertas de tempo esgotado não são mais gerados visualmente para esses contatos o histórico permanece preservado no banco e na área de Não leads",
    "tipo": "novidade",
    "publicadoEm": "2026-08-31T12:35:39.000Z",
    "pullRequest": 214
  },
  {
    "id": "pr-202",
    "titulo": "Todos os atendimentos agora têm protocolo e status",
    "descricao": "Toda conversa com o suporte fica registrada na tela de Suporte, inclusive quando o agente resolve sozinho. O cliente acompanha protocolo, status e responsável pela resolução.",
    "tipo": "melhoria",
    "publicadoEm": "2026-08-30T22:12:37.000Z",
    "pullRequest": 202
  },
  {
    "id": "pr-201",
    "titulo": "Ajuda contextual em cada módulo",
    "descricao": "A Central de Ajuda identifica a tela atual e prioriza as orientações relacionadas à tarefa do cliente, sem exigir conhecimento técnico.",
    "tipo": "melhoria",
    "publicadoEm": "2026-08-30T22:01:04.000Z",
    "pullRequest": 201
  },
  {
    "id": "pr-200",
    "titulo": "Central de Ajuda ampliada para 100 dúvidas",
    "descricao": "A FAQ agora cobre implantação, CRM, integrações, marketing, anúncios, agentes, ERP, segmentos e inteligência, com busca simples, benefícios e atalhos para cada ferramenta.",
    "tipo": "novidade",
    "publicadoEm": "2026-08-30T21:55:27.000Z",
    "pullRequest": 200
  },
  {
    "id": "pr-199",
    "titulo": "Fluxo operacional de anúncios completo",
    "descricao": "Campanhas passam a registrar atribuição de leads, histórico, alertas, recomendações e falhas de pagamento ou publicação, preservando a confirmação humana para orçamento e ativação.",
    "tipo": "melhoria",
    "publicadoEm": "2026-08-30T20:36:58.000Z",
    "pullRequest": 199
  },
  {
    "id": "pr-198",
    "titulo": "Central executiva de resultados de anúncios",
    "descricao": "A empresa acompanha investimento, gasto, leads, vendas, receita, CPL e ROAS, além de alertas e histórico auditável das campanhas.",
    "tipo": "novidade",
    "publicadoEm": "2026-08-30T20:22:56.000Z",
    "pullRequest": 198
  }
];
