export type LaunchPack = {
  slug: string;
  vertical: string;
  audience: string;
  emoji: string;
  headline: string;
  subheadline: string;
  pains: Array<{ title: string; detail: string }>;
  outcomes: Array<{ title: string; detail: string }>;
  agents: Array<{ name: string; detail: string }>;
};

export const CANONICAL_LAUNCH_PACKS: LaunchPack[] = [
  {
    slug: "imobiliarias",
    vertical: "Imobiliárias",
    audience: "imobiliárias, incorporadoras e corretores",
    emoji: "🏠",
    headline: "Cada lead de imóvel precisa de contexto, velocidade e continuidade.",
    subheadline: "VendorAI centraliza atendimento, qualificação, visitas e follow-up para o corretor entrar na conversa no momento certo.",
    pains: [
      { title: "Lead espalhado em vários canais", detail: "Portais, WhatsApp, Instagram e site geram conversas desconectadas e histórico perdido." },
      { title: "Visita que não vira sequência", detail: "Sem cadência estruturada, o interessado visita um imóvel e desaparece do radar comercial." },
      { title: "Carteira grande, prioridade incerta", detail: "A equipe perde tempo tratando todos os contatos do mesmo jeito, sem distinguir intenção e urgência." },
    ],
    outcomes: [
      { title: "Qualificação automática", detail: "Perfil, faixa de investimento, região, prazo e tipo de imóvel entram no CRM antes do contato humano." },
      { title: "Agenda conectada", detail: "Visitas e retornos ficam organizados com confirmação e próxima ação registrada." },
      { title: "Reativação da base", detail: "Leads antigos podem voltar ao fluxo quando surgem imóveis ou condições compatíveis." },
    ],
    agents: [
      { name: "SDR Imobiliário", detail: "Responde, qualifica e identifica o imóvel ou oportunidade mais compatível." },
      { name: "Agendador", detail: "Coordena visitas e reuniões sem troca manual interminável de mensagens." },
      { name: "Follow-up", detail: "Mantém a negociação viva com contexto de visita, proposta e objeções." },
      { name: "Revenue Scout", detail: "Prioriza oportunidades e sinais de retorno dentro da carteira." },
    ],
  },
  {
    slug: "clinicas",
    vertical: "Clínicas",
    audience: "clínicas médicas, odontológicas e estéticas",
    emoji: "🩺",
    headline: "Atendimento começa antes da consulta e continua depois dela.",
    subheadline: "VendorAI organiza captação, agenda, confirmação, relacionamento e retorno sem misturar o fluxo comercial com orientação clínica.",
    pains: [
      { title: "Agenda depende de mensagens manuais", detail: "Confirmação, remarcação e encaixe consomem a equipe e aumentam o retrabalho." },
      { title: "Contato interessado não vira consulta", detail: "Perguntas de preço, disponibilidade e procedimento podem esfriar antes da recepção responder." },
      { title: "Pós-atendimento fragmentado", detail: "Retornos administrativos e relacionamento ficam sem rotina e sem dono." },
    ],
    outcomes: [
      { title: "Triagem administrativa", detail: "O sistema coleta objetivo, unidade, disponibilidade e preferência antes do agendamento." },
      { title: "Agenda e lembretes", detail: "Confirmações e próximas ações ficam centralizadas, reduzindo esforço operacional." },
      { title: "Relacionamento contínuo", detail: "A base recebe acompanhamento administrativo e oportunidades de retorno conforme regras da clínica." },
    ],
    agents: [
      { name: "Recepção IA", detail: "Atende dúvidas administrativas e encaminha casos que exigem equipe humana." },
      { name: "Agendador", detail: "Organiza consulta, confirmação, remarcação e lembretes." },
      { name: "Relacionamento", detail: "Mantém contato pós-atendimento dentro das regras definidas pela clínica." },
      { name: "CRM de Pacientes", detail: "Centraliza origem, jornada comercial e histórico de relacionamento." },
    ],
  },
  {
    slug: "automotivo",
    vertical: "Automotivo",
    audience: "concessionárias, revendas, oficinas e auto centers",
    emoji: "🚗",
    headline: "Do primeiro interesse ao retorno para a próxima compra ou serviço.",
    subheadline: "VendorAI conecta lead, veículo ou serviço, proposta, test-drive, follow-up e pós-venda em uma única jornada comercial.",
    pains: [
      { title: "Lead pergunta por um veículo e some", detail: "Sem resposta rápida e alternativa compatível, o interessado continua pesquisando em outra loja." },
      { title: "Propostas sem acompanhamento", detail: "Financiamento, avaliação de usado e negociação geram várias etapas que se perdem no WhatsApp." },
      { title: "Pós-venda não volta para o comercial", detail: "Cliente de oficina, revisão ou veículo vendido pode gerar nova receita, mas costuma ficar fora do pipeline." },
    ],
    outcomes: [
      { title: "Busca e qualificação", detail: "Modelo, faixa de preço, entrada, troca e prioridade ficam registrados antes do vendedor assumir." },
      { title: "Test-drive e proposta", detail: "Próximas ações são organizadas por etapa, evitando negociação esquecida." },
      { title: "Ciclo de recompra", detail: "Pós-venda e sinais de nova intenção retornam ao CRM com histórico do cliente." },
    ],
    agents: [
      { name: "SDR Automotivo", detail: "Qualifica compra, troca ou serviço e encaminha a oportunidade correta." },
      { name: "Closer", detail: "Apoia follow-up de proposta, avaliação e condição comercial." },
      { name: "Agendador", detail: "Agenda test-drive, visita, avaliação ou serviço." },
      { name: "Pós-venda", detail: "Mantém o cliente no ciclo de revisão, recompra e indicação." },
    ],
  },
  {
    slug: "distribuidoras",
    vertical: "Distribuidoras",
    audience: "distribuidoras B2B de peças, alimentos, materiais e insumos",
    emoji: "🚚",
    headline: "Pedido recorrente não deveria depender da memória do vendedor.",
    subheadline: "VendorAI organiza prospecção, cotação, pedido, recompra, carteira e oportunidades futuras por cliente.",
    pains: [
      { title: "Cotação chega por todo lado", detail: "Telefone, WhatsApp e vendedor externo criam uma operação difícil de rastrear e medir." },
      { title: "Carteira sem cadência", detail: "Cliente compra quando lembra ou quando o vendedor liga, em vez de existir uma rotina baseada em comportamento." },
      { title: "Mix pouco explorado", detail: "A equipe conhece parte do potencial, mas não enxerga com clareza produtos e categorias que ainda cabem na conta." },
    ],
    outcomes: [
      { title: "Cotação organizada", detail: "Solicitações entram com empresa, itens, volume e contexto para acelerar resposta comercial." },
      { title: "Recompra previsível", detail: "O CRM acompanha frequência e próxima ação da carteira sem depender de planilha paralela." },
      { title: "Oportunidade por mix", detail: "Revenue Scout pode apontar expansão, reativação e categoria aderente com regras aprovadas." },
    ],
    agents: [
      { name: "SDR B2B", detail: "Prospecta e qualifica empresas conforme segmento e potencial." },
      { name: "Follow-up de Cotação", detail: "Mantém propostas e cotações abertas em acompanhamento." },
      { name: "Revenue Scout", detail: "Procura recompra, expansão e reativação dentro da base." },
      { name: "Cobrança", detail: "Organiza avisos financeiros conforme as regras da distribuidora." },
    ],
  },
  {
    slug: "farmacias",
    vertical: "Farmácias",
    audience: "farmácias, redes locais e operações de relacionamento",
    emoji: "💊",
    headline: "Relacionamento de farmácia vai além de responder se um produto está disponível.",
    subheadline: "VendorAI conecta atendimento comercial, campanhas, fidelidade, parcerias com empresas e recompra — sem substituir orientação profissional de saúde.",
    pains: [
      { title: "Atendimento repetitivo ocupa o balcão", detail: "Disponibilidade, horário, entrega, programa de fidelidade e dúvidas comerciais chegam o dia inteiro." },
      { title: "Fidelidade sem inteligência comercial", detail: "Cadastro existe, mas comportamento, retorno e oportunidade de relacionamento ficam pouco aproveitados." },
      { title: "Parcerias B2B difíceis de operar", detail: "Convênios, cartões e benefícios para colaboradores exigem prospecção e acompanhamento fora da rotina da loja." },
    ],
    outcomes: [
      { title: "Atendimento comercial 24/7", detail: "A IA responde questões operacionais e encaminha temas de saúde para o atendimento profissional adequado." },
      { title: "Fidelidade e campanhas", detail: "Segmentos de clientes podem receber comunicação conforme consentimento e regras da operação." },
      { title: "Parcerias com empresas", detail: "Prospecção B2B e acompanhamento de convênios entram no mesmo CRM." },
    ],
    agents: [
      { name: "Atendimento", detail: "Resolve perguntas comerciais e operacionais sem prescrever medicamentos." },
      { name: "Relacionamento", detail: "Trabalha fidelidade, campanhas e retorno conforme consentimento." },
      { name: "SDR B2B", detail: "Prospecta empresas para cartões, convênios e benefícios corporativos." },
      { name: "Revenue Scout", detail: "Identifica oportunidades comerciais permitidas dentro da base." },
    ],
  },
  {
    slug: "escolas-cursos",
    vertical: "Escolas e Cursos",
    audience: "escolas, cursos livres, idiomas e educação profissional",
    emoji: "🎓",
    headline: "Matrícula perdida quase sempre começou como um lead sem sequência.",
    subheadline: "VendorAI organiza interesse, turma, curso, visita, matrícula e nutrição para cada candidato receber a próxima ação correta.",
    pains: [
      { title: "Muitos pedidos de informação, pouca priorização", detail: "Preço, turma, duração e grade chegam por vários canais e competem pela atenção da secretaria." },
      { title: "Interessado adia a decisão", detail: "Sem nutrição estruturada, o lead que não matricula hoje desaparece até a próxima campanha." },
      { title: "Turmas e lançamentos não reativam a base", detail: "Novas datas e cursos poderiam trazer leads antigos de volta, mas o histórico fica disperso." },
    ],
    outcomes: [
      { title: "Qualificação por curso", detail: "Interesse, disponibilidade, modalidade e objetivo ficam registrados no CRM." },
      { title: "Cadência de matrícula", detail: "Visita, aula experimental, documentação e follow-up ganham próximas ações claras." },
      { title: "Reativação por oferta", detail: "Novas turmas e cursos podem recuperar interessados compatíveis com consentimento." },
    ],
    agents: [
      { name: "SDR Educacional", detail: "Responde e qualifica candidatos por curso, turma e objetivo." },
      { name: "Agendador", detail: "Agenda visita, conversa, aula experimental ou reunião." },
      { name: "Follow-up", detail: "Mantém o candidato em acompanhamento até matrícula ou nova janela de interesse." },
      { name: "Reativação", detail: "Reconecta a base com novas turmas e ofertas aderentes." },
    ],
  },
  {
    slug: "varejo",
    vertical: "Varejo",
    audience: "lojas físicas, e-commerce e redes locais",
    emoji: "🛍️",
    headline: "Venda não termina no checkout — e oportunidade não começa só quando o cliente pede ajuda.",
    subheadline: "VendorAI organiza atendimento, catálogo, recuperação, relacionamento e novas oportunidades em todos os pontos de contato.",
    pains: [
      { title: "Perguntas viram fila", detail: "Produto, tamanho, disponibilidade, troca e entrega ocupam vendedores em conversas repetitivas." },
      { title: "Cliente interessado some", detail: "Sem sequência, carrinho, orçamento ou conversa iniciada não volta para a equipe comercial." },
      { title: "Base compra sem estratégia de relacionamento", detail: "Histórico existe, mas campanhas e oportunidades futuras não seguem uma jornada centralizada." },
    ],
    outcomes: [
      { title: "Atendimento conectado ao catálogo", detail: "A IA ajuda o cliente a chegar ao produto certo e transfere quando necessário." },
      { title: "Recuperação de oportunidade", detail: "Interesses interrompidos voltam para uma cadência de acompanhamento." },
      { title: "Relacionamento pós-compra", detail: "A base continua ativa para recompra, novidades e benefícios conforme consentimento." },
    ],
    agents: [
      { name: "Atendimento de Vendas", detail: "Responde perguntas de produto e organiza a intenção de compra." },
      { name: "Follow-up", detail: "Recupera conversas, orçamentos e oportunidades sem próxima ação." },
      { name: "Relacionamento", detail: "Trabalha recompra e novidades conforme regras da marca." },
      { name: "Revenue Scout", detail: "Prioriza clientes e oportunidades com maior potencial comercial." },
    ],
  },
  {
    slug: "industrias-b2b",
    vertical: "Indústrias B2B",
    audience: "indústrias, fabricantes e operações comerciais técnicas",
    emoji: "🏭",
    headline: "Venda técnica precisa de contexto comercial que sobreviva ao ciclo longo.",
    subheadline: "VendorAI conecta prospecção, especificação, proposta, distribuidor, follow-up e expansão de contas sem perder a memória da oportunidade.",
    pains: [
      { title: "Ciclo comercial longo e fragmentado", detail: "Vários contatos, especificações e aprovações tornam fácil perder contexto entre etapas e responsáveis." },
      { title: "Representantes trabalham em silos", detail: "Histórico de cliente, proposta e oportunidade pode ficar fora do CRM ou em controles individuais." },
      { title: "Pós-venda não gera expansão estruturada", detail: "Nova unidade, produto complementar ou recompra aparecem tarde quando a carteira não é acompanhada continuamente." },
    ],
    outcomes: [
      { title: "Memória comercial central", detail: "Conta, contatos, necessidade, produto, proposta e próxima ação permanecem juntos." },
      { title: "Prospecção por ICP", detail: "Segmentos e nichos podem receber cadências específicas de abordagem B2B." },
      { title: "Expansão de contas", detail: "Revenue Scout identifica sinais para cross-sell, reativação e novas unidades." },
    ],
    agents: [
      { name: "SDR Industrial", detail: "Pesquisa e qualifica contas conforme ICP e aplicação do produto." },
      { name: "Closer B2B", detail: "Acompanha proposta, objeções e próximos passos do ciclo técnico-comercial." },
      { name: "Follow-up", detail: "Mantém oportunidades longas ativas sem depender da memória do representante." },
      { name: "Revenue Scout", detail: "Procura expansão, recompra e reativação dentro das contas existentes." },
    ],
  },
];

export function getCanonicalLaunchPack(slug: string): LaunchPack | undefined {
  return CANONICAL_LAUNCH_PACKS.find((pack) => pack.slug === slug);
}
