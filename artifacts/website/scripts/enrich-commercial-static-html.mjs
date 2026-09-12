import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wordCount(html = "") {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

function relatedLinks(items = []) {
  return `<nav aria-label="Conteúdo relacionado"><ul>${items.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`).join("")}</ul></nav>`;
}

const COMMON = [
  { href: "/produtos/crm", label: "CRM com IA" },
  { href: "/produtos/agentes-ia", label: "Agentes de IA" },
  { href: "/produtos/revenue-scout", label: "Revenue Scout" },
  { href: "/solucoes/crm-whatsapp", label: "CRM e WhatsApp" },
  { href: "/solucoes/automatizar-follow-up", label: "Follow-up automático" },
  { href: "/blog", label: "Guias e conteúdos" },
];

const upgrades = {
  "/produtos": {
    heading: "Uma plataforma para a jornada comercial inteira",
    paragraphs: [
      "Os produtos VendorAI foram organizados para trabalhar sobre o mesmo contexto comercial. CRM, agentes de IA, prospecção, atendimento, marketing, agenda, propostas, analytics e Revenue Scout não precisam manter cadastros separados ou disputar qual é a versão correta de um cliente. A ideia é que origem, histórico, oportunidade, responsável, próxima ação e resultado continuem conectados conforme a jornada avança.",
      "O CRM funciona como núcleo operacional: concentra leads, clientes, oportunidades, pipeline, atividades e conversas. A partir desse histórico, os agentes de IA podem apoiar recepção, qualificação, follow-up, negociação, agendamento, suporte e pós-venda. Quando a empresa autoriza mais autonomia, as ações continuam limitadas por regras, permissões e etapas definidas, preservando rastreabilidade sobre o que foi recomendado ou executado.",
      "Marketing e prospecção acrescentam demanda ao mesmo ciclo. Campanhas, conteúdo, landing pages, origem do lead e prospecção B2B podem ser relacionados ao avanço comercial, permitindo comparar não apenas cliques ou volume de contatos, mas também qualidade, conversão e receita. Isso aproxima marketing da operação de vendas e reduz o trabalho de conciliar dados entre ferramentas isoladas.",
      "Depois da primeira venda, o Revenue Scout procura sinais de recompra, reativação, upsell, cross-sell e expansão. Analytics e JARVIS ajudam a transformar esses sinais em leitura executiva, enquanto agenda, catálogo, propostas, financeiro e automações mantêm a execução ligada à mesma conta. A empresa pode começar pelos módulos mais importantes e ampliar o uso sem reconstruir a jornada em outro sistema.",
    ],
  },
  "/funcionalidades": {
    title: "Funcionalidades de CRM e IA | VendorAI",
    heading: "Funcionalidades ligadas a resultado, não a telas isoladas",
    paragraphs: [
      "As funcionalidades do VendorAI cobrem aquisição, atendimento, vendas, relacionamento e gestão da próxima oportunidade. O objetivo é reduzir pontos em que a informação se perde entre anúncio, WhatsApp, vendedor, agenda, planilha e pós-venda. Cada recurso deve preservar contexto suficiente para que uma ação feita hoje continue compreensível quando o cliente voltar amanhã ou quando outra pessoa assumir o atendimento.",
      "No início da jornada, recursos de sites, landing pages, campanhas, conteúdo e rastreamento ajudam a identificar origem, intenção e comportamento. Quando o contato vira lead, o CRM organiza responsável, etapa, histórico, tarefas e próxima ação. Agentes de IA podem auxiliar na resposta, qualificação e follow-up utilizando esses dados, em vez de operar como um chatbot desconectado do processo comercial.",
      "Na fase de decisão, agenda, catálogo, propostas, automações e integrações ajudam a manter velocidade sem perder controle. Depois da venda, suporte, pós-venda, reputação e Revenue Scout mantêm o relacionamento ativo e procuram sinais de retorno, recompra ou expansão. Analytics conecta os eventos da jornada para mostrar gargalos, conversão e oportunidades com contexto operacional.",
      "Uma funcionalidade só é útil quando reduz trabalho ou melhora uma decisão. Por isso vale medir tempo de resposta, cobertura de follow-up, oportunidades sem próxima ação, conversão por etapa, tempo de ciclo, clientes reativados e receita associada às origens de demanda. Esses indicadores ajudam a escolher quais automações devem observar, recomendar ou executar em cada operação.",
    ],
  },
  "/solucoes": {
    title: "Soluções de CRM e Vendas com IA | VendorAI",
    description: "Soluções VendorAI para CRM, WhatsApp, follow-up, recuperação de leads, prospecção, retenção, recompra e inteligência de receita com IA.",
    heading: "Escolha pelo problema comercial que precisa resolver",
    paragraphs: [
      "A área de soluções organiza o VendorAI por problemas de negócio, não apenas por módulos. Uma empresa pode chegar procurando CRM integrado ao WhatsApp, recuperação de leads parados, follow-up automático, prospecção B2B, reativação de clientes ou inteligência de receita. Cada caminho mostra quais dados precisam estar conectados, quais ações podem ser automatizadas e quais métricas indicam se o processo realmente melhorou.",
      "Para problemas de aquisição e resposta, a prioridade é preservar origem, velocidade de atendimento e contexto do contato. Para problemas de pipeline, entram responsável, etapa, atividade, proposta e próxima ação. Em retenção e expansão, o histórico de compra, tempo sem contato e sinais da carteira ajudam a identificar oportunidades de recompra, reativação, upsell e cross-sell.",
      "As soluções compartilham a mesma base porque os problemas também se conectam. Um lead recuperado precisa voltar ao pipeline; uma venda precisa alimentar o pós-venda; uma campanha precisa ser comparada ao resultado comercial; uma oportunidade encontrada pelo Revenue Scout precisa ter responsável e ação seguinte. A integração evita que cada melhoria crie uma nova ilha de dados.",
    ],
  },
  "/comparar": {
    heading: "Comparações para escolher a operação mais adequada",
    paragraphs: [
      "As páginas de comparação ajudam a avaliar decisões como CRM com IA versus CRM tradicional, follow-up automático versus processo manual e prospecção assistida por IA versus pesquisa convencional. O objetivo não é declarar que uma abordagem serve para todos os casos, mas mostrar diferenças de processo, dados necessários, nível de automação, controle humano e indicadores que devem ser observados antes de adotar uma ferramenta.",
      "Um CRM tradicional pode organizar cadastro e pipeline com eficiência, enquanto um CRM com IA acrescenta capacidade de observar histórico, sugerir prioridade e executar tarefas autorizadas. Da mesma forma, follow-up automático pode aumentar cobertura, mas precisa respeitar contexto, frequência e regras comerciais para não transformar automação em contato repetitivo sem relevância.",
      "Na comparação entre ferramentas integradas e sistemas separados, o principal custo escondido costuma estar na reconciliação de dados. Quando marketing, atendimento, vendas e pós-venda usam bases diferentes, a equipe perde tempo procurando histórico e a gestão perde capacidade de relacionar origem, atividade e resultado. Uma operação integrada reduz esse atrito, desde que mantenha permissões, rastreabilidade e qualidade de dados.",
      "Use as comparações para definir critérios objetivos: velocidade de resposta, cobertura de follow-up, facilidade de adoção, qualidade do histórico, capacidade de integração, governança da IA, conversão, retenção e custo operacional. A melhor escolha é a que melhora esses indicadores dentro do processo real da empresa, e não a que simplesmente oferece a maior lista de recursos.",
    ],
  },
  "/blog": {
    heading: "Conteúdo para melhorar vendas, CRM, marketing e receita",
    paragraphs: [
      "O Blog VendorAI reúne guias sobre CRM, inteligência artificial, WhatsApp, follow-up, prospecção, marketing, atendimento, retenção e inteligência de receita. Os artigos são organizados para responder dúvidas operacionais e conectar cada tema a decisões que uma equipe comercial precisa tomar: como responder mais rápido, como evitar oportunidades sem próxima ação, como medir uma campanha além do clique e como trabalhar a base depois da primeira venda.",
      "Os conteúdos também ajudam a entender quando uma automação faz sentido. IA pode observar sinais, resumir histórico, recomendar prioridade e executar tarefas, mas a qualidade depende de dados consistentes, regras claras e métricas adequadas. Por isso os guias combinam conceitos com exemplos de processo, indicadores e perguntas que podem ser usadas para revisar a operação atual.",
      "Para pesquisa e SEO, o blog funciona junto das páginas comerciais: um conteúdo informacional aprofunda o problema e direciona para a solução relacionada quando existe correspondência real. Isso cria uma navegação mais útil para quem está aprendendo e também ajuda mecanismos de busca a compreender os temas em que o VendorAI possui cobertura e contexto.",
    ],
  },
  "/precos": {
    title: "Preços VendorAI: CRM e IA para Empresas",
    heading: "Como avaliar o investimento no VendorAI",
    paragraphs: [
      "O preço de uma plataforma comercial precisa ser comparado ao processo que ela substitui ou melhora. No VendorAI, o valor não está apenas no acesso a um CRM, mas na possibilidade de conectar atendimento, follow-up, agentes de IA, marketing, prospecção, pós-venda e inteligência de receita. A comparação correta considera quantas ferramentas paralelas existem hoje, quanto trabalho manual elas geram e quais oportunidades deixam de ser acompanhadas.",
      "Antes de contratar, vale mapear número de usuários, canais de atendimento, volume de leads, necessidade de integrações, complexidade do pipeline e nível de automação desejado. Empresas que precisam apenas organizar contatos têm uma necessidade diferente de operações que querem prospecção B2B, atendimento omnichannel, agentes autônomos, geração de conteúdo ou Revenue Scout trabalhando sobre uma carteira extensa.",
      "O teste serve para validar uso real, não apenas navegar pelas telas. A equipe deve conectar ou simular uma jornada, acompanhar entrada de lead, responsável, próxima ação, follow-up e indicadores. Esse processo ajuda a identificar quais recursos geram valor imediato e quais podem ser ativados depois, evitando implantações que tentam mudar toda a operação no primeiro dia.",
    ],
  },
  "/produtos/crm": {
    heading: "CRM com IA para manter cada oportunidade em movimento",
    paragraphs: [
      "O CRM VendorAI centraliza lead, cliente, origem, responsável, pipeline, tarefas, conversas e próxima ação. A proposta é reduzir o cenário em que uma parte do histórico fica no WhatsApp, outra em uma planilha e outra depende da memória do vendedor. Quando o contexto permanece unido, a equipe consegue entender rapidamente o que aconteceu, o que está pendente e quem precisa agir.",
      "A inteligência artificial usa esse histórico para apoiar prioridade e execução. Pode identificar oportunidades sem próxima ação, leads esfriando, retornos vencidos e mudanças de comportamento. Conforme as permissões da empresa, a IA pode apenas observar, sugerir uma ação ou executar tarefas específicas, sempre preservando a relação entre ação, cliente, oportunidade e responsável.",
      "Para medir resultado, acompanhe tempo de primeira resposta, cobertura de follow-up, negócios sem atividade futura, conversão entre etapas, tempo de ciclo e motivos de perda. Esses indicadores mostram se o CRM está apenas armazenando dados ou realmente ajudando a equipe a avançar oportunidades com mais consistência.",
    ],
  },
  "/produtos/agentes-ia": {
    title: "Agentes de IA para Vendas e Atendimento | VendorAI",
    heading: "Agentes de IA trabalhando com o contexto do CRM",
    paragraphs: [
      "Os agentes de IA do VendorAI cobrem etapas como recepção, SDR, qualificação, follow-up, fechamento, agendamento, suporte, cobrança e pós-venda. Eles não precisam atuar como bots independentes: recebem contexto do cliente, da oportunidade, do histórico e das regras da empresa para que a conversa e a ação façam sentido dentro da jornada comercial.",
      "A autonomia pode variar por tarefa. Em modo observador, o agente identifica sinais e recomenda ações. No modo assistido, prepara respostas ou próximos passos para validação humana. Em rotinas autorizadas, pode executar automaticamente ações repetitivas, mantendo registro do que fez. Esse desenho permite aumentar automação sem abrir mão de controle em negociações ou situações sensíveis.",
      "O desempenho deve ser medido por resultado operacional: tempo de resposta, taxa de qualificação, cobertura de follow-up, agendamentos concluídos, oportunidades recuperadas e satisfação no atendimento. Volume de mensagens por si só não mostra se um agente está ajudando a vender ou atender melhor.",
    ],
  },
  "/produtos/revenue-scout": {
    title: "Revenue Scout: Recompra e Reativação com IA | VendorAI",
    heading: "Encontre a próxima oportunidade dentro da carteira",
    paragraphs: [
      "Revenue Scout analisa sinais da base para encontrar oportunidades que não dependem de um novo lead. O foco pode ser recompra, cliente inativo, produto complementar, expansão de mix, renovação, upsell ou cross-sell. Cada sinal precisa estar ligado a um cliente e a um motivo compreensível para que a equipe saiba por que aquela oportunidade merece atenção.",
      "Em uma distribuidora, por exemplo, frequência e mix podem revelar uma categoria que o cliente ainda não compra ou uma queda anormal de pedidos. Em uma concessionária, histórico de compra e tempo podem sugerir revisão, acessórios ou futura troca. Em serviços recorrentes, a oportunidade pode vir de renovação, nova necessidade ou expansão do contrato.",
      "O valor do Revenue Scout aparece quando a oportunidade vira execução. Por isso os sinais podem alimentar CRM, responsável, tarefa, agenda ou automação, mantendo histórico do contato e resultado. Métricas como clientes reativados, oportunidades criadas na base, receita de recompra e taxa de conversão ajudam a avaliar a qualidade das recomendações.",
    ],
  },
  "/produtos/omnichannel": {
    title: "Omnichannel com IA para WhatsApp e Instagram | VendorAI",
    heading: "Atendimento unificado sem perder o histórico do cliente",
    paragraphs: [
      "O Omnichannel VendorAI reúne conversas de canais como WhatsApp e Instagram para que atendimento humano e agentes de IA compartilhem o mesmo contexto. A meta é evitar que o cliente precise repetir informações ao mudar de canal ou de atendente e impedir que uma oportunidade fique invisível porque a conversa aconteceu fora do CRM.",
      "Cada interação pode ser relacionada ao contato, empresa, oportunidade, responsável e etapa comercial. Isso facilita roteamento, continuidade, supervisão e análise de tempo de resposta. Quando a IA participa, ela pode usar o histórico disponível para responder ou sugerir ações dentro das regras autorizadas, em vez de tratar cada mensagem como um atendimento novo.",
      "Indicadores importantes incluem tempo até primeira resposta, conversas sem responsável, transferências, resolução, leads criados por canal e avanço comercial após o atendimento. O objetivo de unificar canais é melhorar continuidade e resultado, não apenas colocar várias caixas de entrada na mesma tela.",
    ],
  },
  "/produtos/prospeccao": {
    heading: "Prospecção B2B com contexto antes do primeiro contato",
    paragraphs: [
      "A prospecção B2B do VendorAI ajuda a organizar empresas-alvo por segmento, região e sinais disponíveis antes que elas entrem no pipeline. Em vez de entregar apenas uma lista extensa, o processo pode enriquecer dados, aplicar critérios de prioridade e registrar por que um prospect combina com a estratégia comercial definida pela empresa.",
      "Quando um prospect é aprovado, ele entra no mesmo CRM usado pelos leads inbound. Isso permite atribuir responsável, registrar tentativas, criar próxima ação, medir resposta e acompanhar avanço sem manter planilhas paralelas. A IA pode ajudar na pesquisa, contextualização e preparação da abordagem, respeitando regras de contato e qualidade dos dados.",
      "Para avaliar prospecção, acompanhe taxa de contatos válidos, resposta, reuniões, oportunidades qualificadas, conversão e valor por segmento ou origem. Quantidade de empresas encontradas é apenas o início; o objetivo é melhorar a proporção de contas que realmente avançam no processo comercial.",
    ],
  },
  "/produtos/marketing": {
    heading: "Marketing com IA conectado ao que acontece no CRM",
    paragraphs: [
      "O módulo de Marketing conecta planejamento, conteúdo, criativos, campanhas, landing pages e rastreamento ao contexto comercial. A diferença principal está em acompanhar o que acontece depois do clique: se o contato virou lead, recebeu atendimento, avançou no pipeline, recebeu proposta e gerou venda ou receita ao longo da jornada.",
      "A IA pode apoiar calendário, textos, roteiros, imagens, páginas e plano de mídia usando informações da empresa e dos segmentos atendidos. Essa produção precisa manter identidade, proposta de valor e objetivo de campanha, evitando conteúdo genérico desconectado do que a equipe comercial realmente vende e das dúvidas que os clientes apresentam.",
      "A leitura de performance deve combinar métricas de mídia com indicadores de negócio. CPL pode ser útil, mas precisa ser analisado junto de qualificação, conversão, ticket e receita. Quando campanha e CRM compartilham contexto, a empresa consegue priorizar fontes que geram melhores oportunidades, mesmo que não sejam as que entregam o clique mais barato.",
    ],
  },
  "/solucoes/agentes-ia-vendas": {
    title: "Agentes de IA para Vendas e Follow-up | VendorAI",
    heading: "Onde agentes de IA ajudam no processo de vendas",
    paragraphs: [
      "Agentes de IA podem atuar em momentos diferentes da venda: receber um novo contato, entender intenção, qualificar informações, lembrar uma próxima ação, retomar uma conversa, apoiar proposta e continuar o relacionamento depois do fechamento. Para funcionar bem, cada agente precisa acessar o contexto necessário e saber quais ações estão dentro do seu nível de autonomia.",
      "O CRM fornece essa base comum. Assim, uma qualificação feita pelo SDR não se perde quando a oportunidade chega ao closer, e um follow-up pode considerar o que já foi discutido em vez de repetir perguntas. Regras de negócio, horários, responsáveis e limites de ação ajudam a manter a automação coerente com a operação da empresa.",
      "A avaliação deve olhar para velocidade, cobertura e resultado: tempo de resposta, leads qualificados, follow-ups executados, oportunidades retomadas, reuniões, conversão e satisfação. O objetivo é aumentar consistência sem transformar a jornada em uma sequência automática de mensagens sem contexto.",
    ],
  },
};

for (const [pathname, upgrade] of Object.entries(upgrades)) {
  const route = (manifest.routes || []).find((item) => item.pathname === pathname);
  if (!route?.staticHtml) throw new Error(`[commercial-depth] missing prerendered route ${pathname}`);
  if (upgrade.title) route.title = upgrade.title;
  if (upgrade.description) route.description = upgrade.description;
  const section = `<section data-vendorai-commercial-depth="true"><h2>${escapeHtml(upgrade.heading)}</h2>${upgrade.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<h3>Continue explorando</h3>${relatedLinks(COMMON.filter((item) => item.href !== pathname))}</section>`;
  route.staticHtml += section;
  const words = wordCount(route.staticHtml);
  if (words < 350) throw new Error(`[commercial-depth] ${pathname} has only ${words} words`);
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[commercial-depth] enriched ${Object.keys(upgrades).length} commercial routes; all >= 350 words`);
