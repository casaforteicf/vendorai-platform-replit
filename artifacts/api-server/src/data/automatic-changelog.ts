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
    "id": "pr-272",
    "titulo": "Gestão ERP como add-on de R$ 299/mês",
    "descricao": "cadastra a Gestão ERP como produto `ERP-ADDON-M` por R$ 299/mês revoga o ERP por padrão para tenants atuais e futuros oculta o menu quando o add-on não está contratado bloqueia acesso direto às telas `/erp` e `/erp/captura`",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T21:05:55.000Z",
    "pullRequest": 272
  },
  {
    "id": "pr-271",
    "titulo": "remover jornada duplicada da Central de Trabalho",
    "descricao": "A Central de Trabalho passa a ter uma única Jornada de Atendimento, usando o novo bloco compacto integrado à pipeline, sem duplicidade visual.",
    "tipo": "correcao",
    "publicadoEm": "2026-09-02T20:58:55.000Z",
    "pullRequest": 271
  },
  {
    "id": "pr-269",
    "titulo": "metas globais e por vendedor no Dashboard",
    "descricao": "adiciona botão **Configurar metas** no Dashboard; permite criar metas para **Empresa inteira** ou **Vendedor**; indicadores: Leads novos, Oportunidades ativas, Vendas confirmadas, Receita vendida, Ticket médio e Conversão comercial; periodicidade semanal, mensal, trimestral, anual ou personalizada;",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T20:49:33.000Z",
    "pullRequest": 269
  },
  {
    "id": "pr-268",
    "titulo": "melhorar Central de Trabalho com pipeline e perguntas compactas",
    "descricao": "alinha o fluxo visual da Central de Trabalho à pipeline comercial real (Novo, Qualificado, Orçamento, Negociação, Fechamento, Contrato, Pedido e Perdido) mantém as etapas configuradas pelo tenant e destaca apenas a etapa atual reduz bastante a altura do bloco de perguntas respostas ficam compactas e expandem somente durante a edição",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T20:45:53.000Z",
    "pullRequest": 268
  },
  {
    "id": "pr-252",
    "titulo": "WhatsApp: múltiplos números por tenant e responsável",
    "descricao": "permite vários números WhatsApp por tenant via Meta oficial e QR Code/Evolution vincula cada número a um usuário responsável e permite definir o número padrão registra a conexão usada na conversa e mantém as mensagens na tela Conversas e no card do lead direciona leads, negócios e conversas recebidos ao responsável do número",
    "tipo": "novidade",
    "publicadoEm": "2026-09-02T17:56:05.000Z",
    "pullRequest": 252
  },
  {
    "id": "pr-221",
    "titulo": "fechar atribuição de campanha e otimizar por receita",
    "descricao": "A PR entrega aquisição → trial → ativação → venda → cobrança → assinatura → renovação/churn com atribuição de receita, verticais oficiais, Revenue Scout e guardrails de privacidade/financeiro, preservando a mesma conta testada pelo cliente durante toda a jornada.",
    "tipo": "correcao",
    "publicadoEm": "2026-09-01T22:27:21.000Z",
    "pullRequest": 221
  },
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
