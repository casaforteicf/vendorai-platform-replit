import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routeByPath = new Map((manifest.routes || []).map((route) => [route.pathname, route]));

const pages = [
  ["/segmentos/retail", "CRM com IA para varejo", "unificar atendimento, campanhas, recompra e carteira de clientes sem perder contexto entre canais", ["/produtos/crm","/produtos/marketing","/solucoes/aumentar-recompra"]],
  ["/solucoes/agentes-ia-vendas", "Agentes de IA para vendas", "usar agentes para qualificar, priorizar, responder e acompanhar oportunidades com regras claras e histórico no CRM", ["/produtos/agentes-ia","/solucoes/qualificar-leads-com-ia","/solucoes/automatizar-follow-up"]],
  ["/segmentos/dealerships", "CRM com IA para concessionárias", "acompanhar leads de veículos, origem, modelo de interesse, proposta, test-drive, follow-up e fechamento em um único fluxo", ["/produtos/crm","/solucoes/crm-whatsapp","/solucoes/priorizar-oportunidades"]],
  ["/produtos/prospeccao", "Prospecção com IA", "estruturar descoberta de contas, pesquisa, priorização e abordagem B2B conectadas ao pipeline comercial", ["/solucoes/prospeccao-b2b-ia","/produtos/crm","/solucoes/qualificar-leads-com-ia"]],
  ["/segmentos/industries", "CRM com IA para indústrias", "organizar carteira, representantes, distribuidores, oportunidades, recompra e sinais comerciais em ciclos de venda mais longos", ["/segmentos/distributors","/produtos/revenue-scout","/solucoes/revenue-intelligence"]],
  ["/segmentos/distributors", "CRM com IA para distribuidoras", "integrar carteira, pedidos, representantes, recompra, prospecção e priorização de clientes com maior potencial", ["/produtos/crm","/produtos/revenue-scout","/solucoes/aumentar-recompra"]],
  ["/segmentos/clinics", "CRM com IA para clínicas", "organizar atendimento, agendamento, retorno, relacionamento e oportunidades sem deixar contatos importantes sem acompanhamento", ["/produtos/crm","/solucoes/automatizar-follow-up","/solucoes/reativar-clientes"]],
  ["/segmentos/services", "CRM com IA para empresas de serviços", "transformar contatos, orçamentos, propostas e retornos em um processo comercial rastreável e com próxima ação", ["/produtos/crm","/solucoes/crm-whatsapp","/solucoes/recuperar-leads-parados"]],
  ["/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona", "CRM integrado ao WhatsApp", "entender como conversas viram histórico comercial, tarefas, oportunidades e métricas de vendas", ["/solucoes/crm-whatsapp","/produtos/crm","/solucoes/automatizar-follow-up"]],
  ["/produtos/marketing", "Marketing com IA conectado ao CRM", "ligar campanhas, origem de leads, criativos, públicos e resultados comerciais ao mesmo contexto de receita", ["/produtos/crm","/solucoes/revenue-intelligence","/solucoes/priorizar-oportunidades"]],
  ["/comparar/crm-whatsapp-vs-planilha", "CRM com WhatsApp versus planilha", "comparar controle manual com um processo em que conversas, responsáveis, etapas e próximas ações ficam centralizados", ["/solucoes/crm-whatsapp","/produtos/crm","/comparar/crm-com-ia-vs-crm-tradicional"]],
  ["/solucoes/recuperar-leads-parados", "Recuperação de leads parados", "identificar oportunidades sem atividade, propostas sem retorno e contatos com potencial antes de comprar novos leads", ["/solucoes/automatizar-follow-up","/solucoes/qualificar-leads-com-ia","/produtos/crm"]],
  ["/solucoes/aumentar-recompra", "Aumentar recompra com IA", "usar histórico, frequência, mix, tempo desde a última compra e sinais de queda para gerar oportunidades de retorno", ["/produtos/revenue-scout","/solucoes/reativar-clientes","/solucoes/revenue-intelligence"]],
  ["/solucoes/priorizar-oportunidades", "Priorização de oportunidades", "ordenar o trabalho comercial por intenção, valor, urgência, estágio, histórico e probabilidade de avanço", ["/solucoes/qualificar-leads-com-ia","/solucoes/next-best-action-vendas","/solucoes/revenue-intelligence"]],
  ["/solucoes/qualificar-leads-com-ia", "Qualificação de leads com IA", "combinar perfil, intenção, comportamento e contexto comercial para separar contatos de oportunidades reais", ["/produtos/agentes-ia","/solucoes/priorizar-oportunidades","/produtos/crm"]],
  ["/lp/tecnologia-ti-software", "CRM com IA para tecnologia e software", "acompanhar inbound, demos, propostas, onboarding, expansão e carteira em operações de venda consultiva", ["/produtos/crm","/solucoes/agentes-ia-vendas","/solucoes/revenue-intelligence"]],
  ["/produtos/crm", "CRM com IA", "centralizar leads, clientes, conversas, pipeline, tarefas, automações e inteligência de receita em uma única operação", ["/solucoes/crm-whatsapp","/produtos/agentes-ia","/solucoes/automatizar-follow-up"]],
  ["/produtos/agentes-ia", "Agentes de IA para vendas e atendimento", "automatizar tarefas autorizadas com contexto do CRM, histórico do cliente, regras do negócio e supervisão humana", ["/solucoes/agentes-ia-vendas","/solucoes/qualificar-leads-com-ia","/solucoes/next-best-action-vendas"]],
  ["/solucoes/prospeccao-b2b-ia", "Prospecção B2B com IA", "encontrar contas, pesquisar contexto, priorizar abordagem e levar respostas para o CRM sem quebrar a continuidade", ["/produtos/prospeccao","/produtos/crm","/solucoes/priorizar-oportunidades"]],
  ["/lp/industria-materiais-construcao", "CRM com IA para indústria de materiais de construção", "organizar distribuidores, lojistas, obras, carteira, representantes, recompra e oportunidades por região", ["/segmentos/industries","/segmentos/distributors","/produtos/revenue-scout"]],
  ["/lp/distribuidora-autopecas", "CRM com IA para distribuidora de autopeças", "acompanhar oficinas, varejistas, frotistas, representantes, mix de compra, inatividade e recompra", ["/segmentos/distributors","/produtos/revenue-scout","/solucoes/aumentar-recompra"]],
  ["/solucoes/reativar-clientes", "Reativação de clientes", "detectar queda de frequência, mudança de mix e ausência de compra para priorizar ações de recuperação de receita", ["/produtos/revenue-scout","/solucoes/aumentar-recompra","/solucoes/revenue-intelligence"]],
  ["/solucoes/next-best-action-vendas", "Next Best Action para vendas", "sugerir a próxima melhor ação com base em estágio, histórico, intenção, prazo, risco e potencial de receita", ["/solucoes/priorizar-oportunidades","/solucoes/revenue-intelligence","/produtos/agentes-ia"]],
  ["/comparar/crm-com-ia-vs-crm-tradicional", "CRM com IA versus CRM tradicional", "comparar registro passivo de dados com uma operação que identifica sinais, sugere ações e automatiza tarefas autorizadas", ["/produtos/crm","/produtos/agentes-ia","/solucoes/revenue-intelligence"]],
  ["/solucoes/crm-whatsapp", "CRM com IA para WhatsApp", "conectar conversas, origem, responsável, etapa, próxima ação e receita sem deixar o histórico preso em aparelhos individuais", ["/produtos/crm","/solucoes/automatizar-follow-up","/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona"]],
  ["/lp/distribuidora-materiais-construcao", "CRM com IA para distribuidora de materiais de construção", "organizar carteira, vendedores, obras, lojistas, produtos, regiões, recompra e prospecção em uma operação comercial única", ["/segmentos/distributors","/lp/industria-materiais-construcao","/produtos/revenue-scout"]],
  ["/solucoes/automatizar-follow-up", "Follow-up automático com IA", "garantir próxima ação e prazo para propostas, leads e clientes sem transformar vendas em disparos genéricos", ["/produtos/crm","/solucoes/recuperar-leads-parados","/produtos/agentes-ia"]],
  ["/solucoes/revenue-intelligence", "Revenue Intelligence", "conectar dados de marketing, vendas, carteira e atendimento para apontar riscos, oportunidades e ações recomendadas", ["/produtos/revenue-scout","/solucoes/priorizar-oportunidades","/solucoes/next-best-action-vendas"]],
  ["/produtos/revenue-scout", "Revenue Scout", "monitorar carteira para encontrar recompra, reativação, expansão e sinais de queda antes que a receita desapareça", ["/solucoes/aumentar-recompra","/solucoes/reativar-clientes","/solucoes/revenue-intelligence"]],
];

function esc(v="") { return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;"); }

for (const [pathname, title, intent, related] of pages) {
  const route = routeByPath.get(pathname);
  if (!route?.staticHtml) throw new Error(`[all-tracked-depth] missing static HTML for ${pathname}`);

  const links = related.map((href) => {
    const target = routeByPath.get(href);
    const label = target?.title?.replace(/ \| VendorAI.*$/i, "") || href.split("/").filter(Boolean).pop()?.replace(/-/g," ") || href;
    return `<li><a href="${esc(href)}">${esc(label)}</a></li>`;
  }).join("");

  const section = `<section data-vendorai-indexing-depth="all-tracked"><h2>${esc(title)}: como aplicar na operação</h2><p>${esc(`Esta página foi estruturada para responder de forma direta à intenção de quem procura ${title.toLowerCase()}. O objetivo é ${intent}. No VendorAI, esse fluxo usa os mesmos dados de CRM, conversas, atividades e histórico comercial para evitar ferramentas desconectadas e decisões sem contexto.`)}</p><p>${esc(`Na prática, a implantação deve começar por um processo real da empresa, definir responsável, etapa, próxima ação, prazo e critérios de sucesso. Depois, a automação e a inteligência entram para reduzir trabalho manual, identificar exceções e priorizar o que merece atenção. O valor não está em gerar mais atividade, mas em aumentar continuidade, visibilidade e conversão.`)}</p><h3>O que acompanhar</h3><ul><li>percentual de oportunidades com responsável, etapa e próxima ação;</li><li>tempo até primeira resposta e tempo entre interações;</li><li>taxa de avanço, recuperação, recompra ou conversão conforme o objetivo da página;</li><li>receita e oportunidades atribuídas ao fluxo;</li><li>tarefas sugeridas ou automatizadas com contexto suficiente para auditoria.</li></ul><h3>Conteúdos relacionados</h3><ul>${links}</ul></section>`;

  if (!route.staticHtml.includes('data-vendorai-indexing-depth="all-tracked"')) route.staticHtml += section;
  if (!route.esStaticHtml) route.esStaticHtml = route.staticHtml;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[all-tracked-depth] enriched ${pages.length} tracked pages`);
