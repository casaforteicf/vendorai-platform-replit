import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "../dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routes = new Map((manifest.routes || []).map((route) => [route.pathname, route]));

function esc(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

const pages = [
  {
    path: "/segmentos/dealerships",
    title: "CRM e IA para concessionárias: atendimento, leads e oportunidades",
    paragraphs: [
      "Concessionárias recebem oportunidades por anúncios, WhatsApp, formulários, portais e indicações. Quando esses contatos ficam separados, o gestor perde visão sobre tempo de resposta, origem, modelo de interesse, vendedor responsável e próxima ação.",
      "Uma operação comercial integrada conecta cada lead ao CRM, preserva a origem e registra o contexto do interesse em veículo, troca, financiamento, test-drive e proposta. Isso permite comparar canais e identificar onde o funil realmente perde oportunidades.",
      "No VendorAI, agentes de IA podem ajudar a classificar intenção, priorizar leads, resumir conversas e lembrar o vendedor do próximo contato. O objetivo não é substituir o relacionamento comercial, mas reduzir oportunidades esquecidas e acelerar a resposta ao cliente.",
      "Para medir resultado, acompanhe tempo de primeira resposta, conversão por origem, test-drives agendados, propostas sem retorno, oportunidades por vendedor e vendas atribuídas a cada canal."
    ],
    links: [["/produtos/crm","CRM com IA"],["/solucoes/crm-whatsapp","CRM integrado ao WhatsApp"],["/solucoes/automatizar-follow-up","Follow-up automático"]]
  },
  {
    path: "/produtos/crm",
    title: "CRM com IA para organizar vendas sem perder contexto",
    paragraphs: [
      "Um CRM útil precisa mostrar mais do que uma lista de contatos. Ele deve conectar origem, cliente, oportunidade, responsável, etapa, histórico e próxima ação em uma mesma visão operacional.",
      "Quando WhatsApp, atendimento, pipeline e follow-up compartilham contexto, o vendedor consegue continuar a conversa sem depender de controles paralelos, enquanto o gestor acompanha gargalos e oportunidades em tempo real.",
      "A IA pode observar o funil, resumir interações, sugerir prioridades, detectar negócios parados e executar tarefas autorizadas. Esse modelo transforma o CRM de registro passivo em uma camada ativa de apoio à operação comercial.",
      "Os principais indicadores são cobertura de próxima ação, tempo de resposta, avanço por etapa, conversão, negócios parados, taxa de recuperação e receita por origem."
    ],
    links: [["/solucoes/crm-whatsapp","CRM para WhatsApp"],["/produtos/agentes-ia","Agentes de IA"],["/solucoes/revenue-intelligence","Revenue Intelligence"]]
  },
  {
    path: "/produtos/agentes-ia",
    title: "Agentes de IA para vendas, atendimento e follow-up",
    paragraphs: [
      "Agentes de IA geram mais valor quando atuam com regras claras e acesso ao contexto do negócio. Em vez de responder mensagens isoladas, eles podem usar dados do CRM, etapa da oportunidade, histórico e próxima ação para apoiar decisões.",
      "No VendorAI, a empresa pode definir níveis de autonomia: observação, sugestão assistida ou execução autorizada. Isso permite começar com baixo risco e ampliar automações conforme o processo se torna previsível.",
      "Casos de uso incluem qualificação de leads, resumo de conversas, priorização de oportunidades, follow-up, reativação de clientes, suporte e agendamento.",
      "O desempenho deve ser medido por impacto comercial: velocidade de resposta, oportunidades recuperadas, conversão, cobertura de follow-up e redução de tarefas repetitivas."
    ],
    links: [["/solucoes/agentes-ia-vendas","Agentes de IA para vendas"],["/solucoes/qualificar-leads-com-ia","Qualificação de leads com IA"],["/solucoes/automatizar-follow-up","Automatizar follow-up"]]
  },
  {
    path: "/produtos/marketing",
    title: "Marketing conectado ao CRM para transformar campanha em oportunidade",
    paragraphs: [
      "Marketing perde valor quando a campanha termina no clique. Para entender retorno, a origem do lead precisa continuar visível no CRM até a oportunidade, proposta e venda.",
      "Uma estrutura integrada permite comparar campanhas, canais, criativos e públicos usando métricas comerciais, e não apenas alcance ou volume de leads.",
      "O VendorAI conecta aquisição, atendimento e vendas para que o time identifique quais campanhas geram oportunidades qualificadas, quais leads precisam de resposta rápida e onde existe perda de continuidade.",
      "As métricas prioritárias são custo por oportunidade, conversão por origem, tempo de resposta, receita atribuída e retorno por campanha."
    ],
    links: [["/produtos/crm","CRM com IA"],["/produtos/prospeccao","Prospecção"],["/solucoes/priorizar-oportunidades","Priorizar oportunidades"]]
  },
  {
    path: "/solucoes/qualificar-leads-com-ia",
    title: "Qualificação de leads com IA baseada em intenção e contexto",
    paragraphs: [
      "Qualificar um lead não deve significar apenas preencher um score. A decisão precisa considerar origem, perfil, comportamento, necessidade, urgência e estágio da conversa.",
      "A IA pode reunir esses sinais, explicar por que um lead merece prioridade e sugerir a próxima ação. Isso reduz filas genéricas e ajuda vendedores a concentrar tempo nas oportunidades com maior probabilidade de avanço.",
      "No VendorAI, a qualificação pode compartilhar o mesmo histórico do CRM e do atendimento, evitando que o lead seja avaliado fora do contexto real da jornada.",
      "Acompanhe taxa de contato, reuniões qualificadas, avanço no pipeline, conversão por faixa de prioridade e precisão do critério de qualificação."
    ],
    links: [["/produtos/agentes-ia","Agentes de IA"],["/solucoes/priorizar-oportunidades","Priorizar oportunidades"],["/produtos/crm","CRM com IA"]]
  },
  {
    path: "/segmentos/distributors",
    title: "CRM com IA para distribuidoras, representantes e atacado",
    paragraphs: [
      "Distribuidoras precisam acompanhar carteira, frequência de compra, mix, território, vendedor e oportunidades de recompra. Quando esses dados ficam espalhados, a equipe reage tarde à queda de volume ou ao cliente que deixou de comprar.",
      "Com CRM e inteligência de receita conectados, cada cliente pode ter histórico comercial, próxima ação, potencial de recompra e sinais de risco visíveis para o vendedor.",
      "O VendorAI pode priorizar contas, sugerir reativação, apoiar prospecção B2B e organizar follow-up sem separar essas atividades do histórico do cliente.",
      "Os indicadores mais úteis são frequência, ticket, mix, clientes inativos, oportunidades de recompra, conversão por vendedor e receita recuperada."
    ],
    links: [["/produtos/revenue-scout","Revenue Scout"],["/solucoes/reativar-clientes","Reativar clientes"],["/solucoes/prospeccao-b2b-ia","Prospecção B2B com IA"]]
  }
];

for (const page of pages) {
  const route = routes.get(page.path);
  if (!route?.staticHtml) throw new Error(`[discovered-depth] missing static HTML for ${page.path}`);
  const html = `<section data-vendorai-discovered-depth="${esc(page.path)}"><h2>${esc(page.title)}</h2>${page.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}<h3>Veja também</h3><ul>${page.links.map(([href,label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ul></section>`;
  route.staticHtml += html;
  route.esStaticHtml = route.esStaticHtml || route.staticHtml;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[discovered-depth] enriched ${pages.length} discovered priority pages`);
