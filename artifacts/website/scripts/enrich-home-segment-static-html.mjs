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

function nav(items = [], label = "Conteúdo relacionado") {
  return `<nav aria-label="${escapeHtml(label)}"><ul>${items.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`).join("")}</ul></nav>`;
}

const homePt = {
  title: "VendorAI — CRM com IA para Vendas e Marketing",
  description: "CRM com IA que conecta marketing, WhatsApp, atendimento, follow-up, pipeline, pós-venda e Revenue Scout para transformar demanda em receita.",
  heading: "CRM com IA para conectar marketing, atendimento e vendas",
  paragraphs: [
    "VendorAI é uma plataforma de CRM com inteligência artificial criada para empresas que precisam acompanhar o cliente do primeiro contato à próxima oportunidade de receita. Em vez de separar anúncio, WhatsApp, atendimento, pipeline, tarefas, propostas e pós-venda em ferramentas desconectadas, a operação compartilha o mesmo contexto comercial. Isso permite saber de onde o lead veio, quem respondeu, em qual etapa ele está, qual é a próxima ação e quais sinais merecem prioridade.",
    "O CRM organiza leads, clientes, oportunidades, responsáveis, atividades, agenda e histórico de conversas. Os agentes de IA trabalham sobre esse contexto para apoiar recepção, qualificação, follow-up, fechamento, suporte, agendamento e pós-venda. A empresa pode definir níveis de autonomia para observar, recomendar ou executar ações, mantendo rastreabilidade e regras de negócio. O objetivo não é substituir o processo comercial por respostas genéricas, mas reduzir atrasos, tarefas esquecidas e perda de contexto entre canais e pessoas.",
    "No marketing, o VendorAI conecta planejamento, conteúdo, criativos, campanhas, landing pages e origem dos leads ao resultado comercial. Assim, a análise deixa de terminar em clique ou custo por lead e passa a acompanhar avanço no funil, propostas, vendas e receita. O sistema também reúne dados de Search Console, rastreamento de visitantes e outras fontes para ajudar a identificar quais páginas, campanhas, termos e segmentos estão atraindo demanda com maior potencial.",
    "O Revenue Scout amplia o uso do CRM depois da primeira venda. Ele procura sinais de recompra, reativação, upsell, cross-sell, renovação e expansão na carteira de clientes. A oportunidade pode surgir de histórico de compras, tempo sem contato, produto complementar, mudança de comportamento ou outro sinal disponível na operação. Quando existe evidência suficiente, o sistema organiza a oportunidade, explica o motivo e direciona a próxima ação para a equipe ou para uma automação autorizada.",
    "A plataforma atende operações B2B e B2C em segmentos como varejo, clínicas, concessionárias, distribuidoras, serviços profissionais e indústrias. Cada mercado possui jornadas, dados e prioridades diferentes. Por isso o VendorAI usa páginas, fluxos e perfis por segmento em vez de tratar todas as empresas como se vendessem da mesma maneira. Uma concessionária precisa acompanhar lead, veículo, proposta, test-drive e próxima troca; uma distribuidora precisa observar carteira, frequência, mix, recompra e share of wallet; uma clínica precisa organizar atendimento, agenda, retorno e continuidade do relacionamento.",
    "Para avaliar um CRM com IA, vale observar cinco pontos: capacidade de preservar histórico entre canais, velocidade para definir a próxima ação, cobertura real de follow-up, conexão entre marketing e receita e possibilidade de aprender com a própria operação. Também é importante que automações tenham limites claros, que dados permaneçam ligados ao cliente correto e que os indicadores mostrem avanço de pipeline, conversão, retenção e oportunidades futuras em vez de apenas volume de atividades.",
  ],
};

const homeEs = {
  title: "VendorAI — CRM con IA para Ventas y Marketing",
  description: "CRM con IA que conecta marketing, WhatsApp, atención, seguimiento, pipeline, posventa y Revenue Scout para transformar demanda en ingresos.",
  heading: "CRM con IA para conectar marketing, atención y ventas",
  paragraphs: [
    "VendorAI es una plataforma de CRM con inteligencia artificial para empresas que necesitan acompañar al cliente desde el primer contacto hasta la próxima oportunidad de ingresos. En lugar de separar anuncios, WhatsApp, atención, pipeline, tareas, propuestas y posventa en herramientas desconectadas, la operación comparte el mismo contexto comercial. Así es posible saber de dónde llegó el lead, quién respondió, en qué etapa se encuentra, cuál es la próxima acción y qué señales merecen prioridad.",
    "El CRM organiza leads, clientes, oportunidades, responsables, actividades, agenda e historial de conversaciones. Los agentes de IA utilizan ese contexto para apoyar recepción, calificación, seguimiento, cierre, soporte, agenda y posventa. La empresa puede definir niveles de autonomía para observar, recomendar o ejecutar acciones, manteniendo trazabilidad y reglas de negocio. El objetivo es reducir demoras, tareas olvidadas y pérdida de contexto entre canales y personas.",
    "En marketing, VendorAI conecta planificación, contenido, creatividades, campañas, landing pages y origen de los leads con el resultado comercial. El análisis deja de terminar en clics o costo por lead y pasa a acompañar avance en el embudo, propuestas, ventas e ingresos. El sistema también puede reunir datos de Search Console, seguimiento de visitantes y otras fuentes para mostrar qué páginas, campañas, términos y segmentos atraen demanda con mayor potencial.",
    "Revenue Scout amplía el uso del CRM después de la primera venta. Busca señales de recompra, reactivación, upsell, cross-sell, renovación y expansión en la cartera de clientes. Cuando existe evidencia suficiente, organiza la oportunidad, explica el motivo y dirige la próxima acción al equipo o a una automatización autorizada.",
    "La plataforma atiende operaciones B2B y B2C en retail, clínicas, concesionarias, distribuidoras, servicios profesionales e industrias. Cada mercado tiene jornadas, datos y prioridades diferentes, por eso VendorAI utiliza perfiles por segmento en lugar de tratar a todas las empresas de la misma forma.",
    "Para evaluar un CRM con IA conviene observar la preservación del historial entre canales, la velocidad para definir la próxima acción, la cobertura real de seguimiento, la conexión entre marketing e ingresos y la capacidad de aprender de la propia operación. Las automatizaciones también deben tener límites claros y métricas ligadas a conversión, retención y crecimiento.",
  ],
};

const segmentProfiles = {
  retail: {
    name: "Lojas e Varejo",
    ptTitle: "CRM com IA para Lojas e Varejo | VendorAI",
    ptDescription: "CRM com IA para lojas e varejo: atendimento, WhatsApp, recompra, campanhas, fidelização, pós-venda e oportunidades de receita em uma operação conectada.",
    esTitle: "CRM con IA para Tiendas y Retail | VendorAI",
    esDescription: "CRM con IA para tiendas y retail: atención, WhatsApp, recompra, campañas, fidelización, posventa y oportunidades de ingresos.",
    ptFocus: "No varejo, velocidade de resposta, histórico de compra, preferência de produto e frequência de retorno ajudam a transformar contatos isolados em relacionamento. O VendorAI conecta atendimento, campanhas, CRM e pós-venda para que a equipe consiga acompanhar novos clientes, recompra, recuperação de clientes inativos e ações de fidelização sem depender de listas paralelas.",
    esFocus: "En retail, la velocidad de respuesta, el historial de compra, la preferencia de producto y la frecuencia ayudan a transformar contactos aislados en relación. VendorAI conecta atención, campañas, CRM y posventa para acompañar nuevos clientes, recompra y reactivación.",
  },
  clinics: {
    name: "Clínicas e Saúde",
    ptTitle: "CRM com IA para Clínicas e Saúde | VendorAI",
    ptDescription: "CRM com IA para clínicas: atendimento administrativo, WhatsApp, agenda, retorno, relacionamento, campanhas e acompanhamento da jornada do paciente.",
    esTitle: "CRM con IA para Clínicas y Salud | VendorAI",
    esDescription: "CRM con IA para clínicas: atención administrativa, WhatsApp, agenda, retorno, relación y campañas conectadas a la jornada del paciente.",
    ptFocus: "Em clínicas, o foco comercial e administrativo está em responder com rapidez, organizar agenda, registrar origem do contato, acompanhar retornos e preservar o histórico de relacionamento. O VendorAI conecta esses pontos sem substituir decisões clínicas: a inteligência atua sobre atendimento, comunicação, agenda, relacionamento e gestão da oportunidade administrativa.",
    esFocus: "En clínicas, el foco comercial y administrativo está en responder rápido, organizar agenda, registrar el origen del contacto, acompañar retornos y preservar el historial de relación. VendorAI conecta esos puntos sin sustituir decisiones clínicas.",
  },
  dealerships: {
    name: "Concessionárias e Automotivo",
    ptTitle: "CRM com IA para Concessionárias e Automotivo | VendorAI",
    ptDescription: "CRM, chatbot e BI para concessionárias: organize leads, WhatsApp, veículos, propostas, test-drive, follow-up, vendas e próxima troca com IA.",
    esTitle: "CRM con IA para Concesionarias y Automotriz | VendorAI",
    esDescription: "CRM, chatbot y BI para concesionarias: leads, WhatsApp, vehículos, propuestas, test-drive, seguimiento, ventas y próxima renovación con IA.",
    ptFocus: "Para concessionárias, o VendorAI reúne CRM, atendimento por WhatsApp, agente de IA, chatbot comercial e BI de vendas em torno da mesma jornada. O lead pode ser relacionado ao veículo de interesse, origem, campanha, vendedor, proposta, test-drive, negociação e motivo de perda ou ganho. Depois da venda, o histórico continua útil para revisão, recompra, indicação, acessórios e futura troca do veículo.",
    esFocus: "Para concesionarias, VendorAI reúne CRM, atención por WhatsApp, agente de IA, chatbot comercial y BI de ventas alrededor de la misma jornada. El lead puede relacionarse con vehículo, origen, campaña, vendedor, propuesta, test-drive, negociación y futura renovación.",
  },
  distributors: {
    name: "Distribuidoras e Atacado",
    ptTitle: "CRM com IA para Distribuidoras e Atacado | VendorAI",
    ptDescription: "CRM com IA para distribuidoras: carteira, prospecção B2B, frequência de compra, mix, recompra, follow-up, vendedores e Revenue Scout.",
    esTitle: "CRM con IA para Distribuidoras y Mayoristas | VendorAI",
    esDescription: "CRM con IA para distribuidoras: cartera, prospección B2B, frecuencia, mix, recompra, seguimiento, vendedores y Revenue Scout.",
    ptFocus: "Em distribuidoras, o valor está em entender carteira, frequência de compra, mix, potencial por cliente e cobertura do vendedor. O VendorAI organiza prospecção B2B, pedidos e histórico comercial para identificar clientes que pararam de comprar, categorias ainda não exploradas, oportunidades de recompra e contas que merecem uma ação antes de perder participação.",
    esFocus: "En distribuidoras, el valor está en entender cartera, frecuencia de compra, mix, potencial por cliente y cobertura del vendedor. VendorAI organiza prospección B2B e historial comercial para detectar reactivación, recompra y expansión.",
  },
  services: {
    name: "Serviços Profissionais",
    ptTitle: "CRM com IA para Serviços Profissionais | VendorAI",
    ptDescription: "CRM com IA para empresas de serviços: leads, diagnóstico, proposta, agenda, follow-up, contratos, pós-venda e expansão de clientes.",
    esTitle: "CRM con IA para Servicios Profesionales | VendorAI",
    esDescription: "CRM con IA para servicios profesionales: leads, diagnóstico, propuesta, agenda, seguimiento, contratos, posventa y expansión.",
    ptFocus: "Em serviços profissionais, cada oportunidade costuma depender de diagnóstico, proposta, agenda, aprovação e acompanhamento. O VendorAI preserva essas etapas em um único histórico e ajuda a impedir que propostas sem resposta, retornos prometidos e oportunidades de expansão desapareçam da rotina da equipe.",
    esFocus: "En servicios profesionales, cada oportunidad suele depender de diagnóstico, propuesta, agenda, aprobación y seguimiento. VendorAI preserva esas etapas en un historial único y ayuda a evitar que propuestas y retornos se pierdan.",
  },
  industries: {
    name: "Indústrias e B2B",
    ptTitle: "CRM com IA para Indústrias e Vendas B2B | VendorAI",
    ptDescription: "CRM com IA para indústrias e vendas B2B: prospecção, contas, especificações, cotações, follow-up, pipeline, recompra e inteligência de receita.",
    esTitle: "CRM con IA para Industrias y Ventas B2B | VendorAI",
    esDescription: "CRM con IA para industrias y ventas B2B: prospección, cuentas, especificaciones, cotizaciones, seguimiento, pipeline e inteligencia de ingresos.",
    ptFocus: "Em indústrias e vendas B2B, ciclos mais longos exigem memória de conta, histórico técnico, cotações, responsáveis e próximas ações claras. O VendorAI conecta prospecção, CRM, follow-up e inteligência de receita para acompanhar oportunidades complexas, reduzir perda de contexto e encontrar novas demandas dentro de clientes já conhecidos.",
    esFocus: "En industrias y ventas B2B, los ciclos más largos exigen memoria de cuenta, historial técnico, cotizaciones, responsables y próximas acciones claras. VendorAI conecta prospección, CRM, seguimiento e inteligencia de ingresos.",
  },
};

function homeDepth(copy, spanish = false) {
  const links = spanish
    ? [
        { href: "/produtos/crm", label: "CRM con IA" },
        { href: "/produtos/agentes-ia", label: "Agentes de IA" },
        { href: "/produtos/revenue-scout", label: "Revenue Scout" },
        { href: "/produtos/marketing", label: "Marketing con IA" },
        { href: "/solucoes/crm-whatsapp", label: "CRM y WhatsApp" },
        { href: "/segmentos/dealerships", label: "Concesionarias" },
        { href: "/segmentos/distributors", label: "Distribuidoras" },
        { href: "/blog", label: "Guías y contenidos" },
      ]
    : [
        { href: "/produtos/crm", label: "CRM com IA" },
        { href: "/produtos/agentes-ia", label: "Agentes de IA" },
        { href: "/produtos/revenue-scout", label: "Revenue Scout" },
        { href: "/produtos/marketing", label: "Marketing com IA" },
        { href: "/solucoes/crm-whatsapp", label: "CRM e WhatsApp" },
        { href: "/segmentos/dealerships", label: "Concessionárias" },
        { href: "/segmentos/distributors", label: "Distribuidoras" },
        { href: "/blog", label: "Guias e conteúdos" },
      ];
  return `<section data-vendorai-seo-depth="home"><h2>${escapeHtml(copy.heading)}</h2>${copy.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<h3>${spanish ? "Explora las áreas principales" : "Explore as áreas principais"}</h3>${nav(links, spanish ? "Áreas principales" : "Áreas principais")}</section>`;
}

function segmentDepth(route, key, profile, spanish = false) {
  const verticals = Object.values(manifest.verticals || {})
    .filter((vertical) => vertical.macrosegment === key)
    .slice(0, 12)
    .map((vertical) => ({ href: `/lp/${vertical.slug}`, label: vertical.title }));
  const focus = spanish ? profile.esFocus : profile.ptFocus;
  const paragraphs = spanish
    ? [
        focus,
        "El CRM reúne origen, contacto, responsable, etapa, actividades y próxima acción. Con ese contexto, los agentes de IA pueden ayudar a responder, calificar, hacer seguimiento, agendar y priorizar trabajo sin crear un historial paralelo para cada canal.",
        "Marketing y ventas comparten la misma lectura del embudo. Campañas, páginas y conversaciones pueden relacionarse con oportunidades y resultados, lo que facilita comparar calidad de demanda, velocidad de respuesta, avance comercial y conversión por fuente.",
        "Revenue Scout observa la cartera después de la primera venta para encontrar señales de reactivación, recompra, expansión o recuperación. La recomendación debe explicar qué señal originó la oportunidad y qué acción es coherente con el historial disponible.",
        "Una implementación útil comienza con datos básicos bien conectados: responsables correctos, etapas claras, reglas de seguimiento, catálogo o servicios cuando corresponda y canales integrados. La IA gana calidad cuando trabaja sobre información consistente y una jornada comercial definida.",
        "Los indicadores más útiles combinan actividad y resultado: tiempo de primera respuesta, oportunidades sin próxima acción, cobertura de seguimiento, conversión por etapa, tiempo de ciclo, clientes reactivados y nuevas oportunidades identificadas en la base.",
      ]
    : [
        focus,
        "O CRM reúne origem, contato, responsável, etapa, atividades e próxima ação. Com esse contexto, os agentes de IA podem ajudar a responder, qualificar, fazer follow-up, agendar e priorizar trabalho sem criar um histórico paralelo para cada canal. WhatsApp, Instagram, site e outras entradas deixam de funcionar como caixas isoladas quando o cliente e a oportunidade são reconhecidos na mesma jornada.",
        "Marketing e vendas passam a compartilhar a mesma leitura do funil. Campanhas, páginas e conversas podem ser relacionadas a oportunidades e resultados, facilitando comparar qualidade da demanda, velocidade de resposta, avanço comercial e conversão por origem. Isso torna o BI mais útil porque o indicador deixa de medir apenas volume e passa a explicar o que avançou, travou ou virou receita.",
        "O Revenue Scout observa a carteira depois da primeira venda para encontrar sinais de reativação, recompra, expansão ou recuperação. A recomendação deve explicar qual sinal originou a oportunidade, qual cliente está envolvido e qual ação combina com o histórico disponível. A equipe continua podendo validar prioridades, limites e responsáveis antes de automatizar etapas sensíveis.",
        "Uma implantação útil começa com dados básicos bem conectados: responsáveis corretos, etapas claras, regras de follow-up, catálogo ou serviços quando necessário e canais integrados. A IA ganha qualidade quando trabalha sobre informações consistentes e uma jornada comercial definida, porque consegue relacionar comportamento recente com contexto histórico em vez de responder de forma genérica.",
        "Os indicadores mais úteis combinam atividade e resultado: tempo de primeira resposta, oportunidades sem próxima ação, cobertura de follow-up, conversão por etapa, tempo de ciclo, clientes reativados, oportunidades de recompra e novas oportunidades identificadas na base. Esses sinais ajudam a equipe a decidir onde atuar antes que o negócio esfrie ou o cliente seja esquecido.",
      ];
  const related = spanish
    ? [
        { href: "/produtos/crm", label: "CRM con IA" },
        { href: "/produtos/agentes-ia", label: "Agentes de IA" },
        { href: "/produtos/revenue-scout", label: "Revenue Scout" },
        { href: "/solucoes/automatizar-follow-up", label: "Seguimiento automático" },
        { href: "/solucoes/revenue-intelligence", label: "Revenue Intelligence" },
      ]
    : [
        { href: "/produtos/crm", label: "CRM com IA" },
        { href: "/produtos/agentes-ia", label: "Agentes de IA" },
        { href: "/produtos/revenue-scout", label: "Revenue Scout" },
        { href: "/solucoes/automatizar-follow-up", label: "Follow-up automático" },
        { href: "/solucoes/revenue-intelligence", label: "Revenue Intelligence" },
      ];
  return `<section data-vendorai-seo-depth="segment"><h2>${spanish ? "Cómo funciona VendorAI en este segmento" : "Como o VendorAI funciona neste segmento"}</h2>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<h3>${spanish ? "Soluciones relacionadas" : "Soluções relacionadas"}</h3>${nav(related, spanish ? "Soluciones relacionadas" : "Soluções relacionadas")}${verticals.length ? `<h3>${spanish ? "Operaciones específicas" : "Operações específicas"}</h3>${nav(verticals, spanish ? "Operaciones específicas" : "Operações específicas")}` : ""}</section>`;
}

const homeRoute = (manifest.routes || []).find((route) => route.pathname === "/");
if (!homeRoute?.staticHtml) throw new Error("[seo-depth] home route not prerendered");
homeRoute.title = homePt.title;
homeRoute.description = homePt.description;
homeRoute.esTitle = homeEs.title;
homeRoute.esDescription = homeEs.description;
homeRoute.staticHtml += homeDepth(homePt, false);
homeRoute.esStaticHtml = (homeRoute.esStaticHtml || homeRoute.staticHtml) + homeDepth(homeEs, true);

const segmentFailures = [];
for (const route of manifest.routes || []) {
  if (!route.pathname?.startsWith("/segmentos/")) continue;
  const key = route.pathname.split("/").pop();
  const profile = segmentProfiles[key];
  if (!profile || !route.staticHtml) {
    segmentFailures.push(`${route.pathname}: missing profile/staticHtml`);
    continue;
  }
  route.name = profile.name;
  route.title = profile.ptTitle;
  route.description = profile.ptDescription;
  route.esTitle = profile.esTitle;
  route.esDescription = profile.esDescription;
  route.staticHtml += segmentDepth(route, key, profile, false);
  route.esStaticHtml = (route.esStaticHtml || route.staticHtml) + segmentDepth(route, key, profile, true);
  if (wordCount(route.staticHtml) < 450) segmentFailures.push(`${route.pathname}: ${wordCount(route.staticHtml)} words`);
}

const homeWords = wordCount(homeRoute.staticHtml);
if (homeWords < 550) throw new Error(`[seo-depth] home has only ${homeWords} words`);
if (segmentFailures.length) throw new Error(`[seo-depth] segment quality gate failed: ${segmentFailures.join("; ")}`);

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[seo-depth] home ${homeWords} words; segment pages enriched and validated >= 450 words`);
