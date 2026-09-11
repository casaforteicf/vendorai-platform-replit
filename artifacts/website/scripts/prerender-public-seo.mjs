import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const outDir = path.resolve(siteRoot, "dist/public");
const manifestPath = path.resolve(outDir, "seo-manifest.json");
const workerPath = path.resolve(outDir, "_worker.js");
const priorityDepthPath = path.resolve(siteRoot, "src/data/seoPriorityDepth.json");
const prioritySupplementPath = path.resolve(siteRoot, "src/data/seoPrioritySupplement.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const priorityDepth = JSON.parse(fs.readFileSync(priorityDepthPath, "utf8"));
const prioritySupplement = JSON.parse(fs.readFileSync(prioritySupplementPath, "utf8"));
const growthByPath = new Map((manifest.growthPages || []).map((page) => [page.path, page]));
const priorityDepthByPath = new Map((priorityDepth.pages || []).map((page) => [page.path, page]));
const prioritySupplementByPath = new Map((prioritySupplement.pages || []).map((page) => [page.path, page]));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripBrand(value = "") {
  return String(value).replace(/\s*[|—-]\s*VendorAI.*$/i, "").trim();
}

function list(items = []) {
  const safe = items.filter(Boolean);
  if (!safe.length) return "";
  return `<ul>${safe.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function links(items = []) {
  const seen = new Set();
  const safe = items.filter((item) => item?.href && item?.label && !seen.has(item.href) && seen.add(item.href));
  if (!safe.length) return "";
  return `<nav aria-label="Conteúdo relacionado"><ul>${safe.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`).join("")}</ul></nav>`;
}

function faq(items = []) {
  const safe = items.filter((item) => item?.q && item?.a);
  if (!safe.length) return "";
  return `<section><h2>Perguntas frequentes</h2>${safe.map((item) => `<article><h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p></article>`).join("")}</section>`;
}

function esFaq(items = []) {
  const safe = items.filter((item) => item?.q && item?.a);
  if (!safe.length) return "";
  return `<section><h2>Preguntas frecuentes</h2>${safe.map((item) => `<article><h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p></article>`).join("")}</section>`;
}

function commonLinks(spanish = false) {
  return spanish
    ? [
        { href: "/productos", label: "Productos VendorAI" },
        { href: "/solucoes", label: "Soluciones por problema" },
        { href: "/comparar", label: "Comparaciones" },
        { href: "/precos", label: "Precios" },
        { href: "/blog", label: "Contenido y guías" },
      ]
    : [
        { href: "/produtos", label: "Produtos VendorAI" },
        { href: "/solucoes", label: "Soluções por problema" },
        { href: "/comparar", label: "Comparações" },
        { href: "/precos", label: "Preços" },
        { href: "/blog", label: "Conteúdos e guias" },
      ];
}

function priorityDepthHtml(pathname, spanish = false) {
  const entry = priorityDepthByPath.get(pathname);
  if (!entry) return "";
  const copy = spanish ? entry.es : entry.pt;
  if (!copy) return "";
  const supplement = prioritySupplementByPath.get(pathname);
  const extra = supplement ? (spanish ? supplement.es : supplement.pt) : "";
  const checklistTitle = spanish ? "Checklist para evaluar tu operación" : "Checklist para avaliar sua operação";
  return `<section data-vendorai-priority-depth="true"><h2>${escapeHtml(copy.title)}</h2>${(copy.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}${extra ? `<p>${escapeHtml(extra)}</p>` : ""}<h3>${checklistTitle}</h3>${list(copy.checklist)}</section>`;
}

function growthHtml(route, page, spanish = false) {
  const copy = spanish ? page?.es : page?.pt;
  if (!copy) return "";
  const productLinks = (page.products || []).map((item) => ({ href: item.href, label: item.label }));
  const sectionTitle = spanish ? {
    problems: "Problemas que esta solución organiza",
    how: "Cómo funciona",
    opportunities: "Oportunidades que ayuda a identificar",
    benefits: "Beneficios operativos",
    metrics: "Qué medir",
  } : {
    problems: "Problemas que esta solução organiza",
    how: "Como funciona",
    opportunities: "Oportunidades que ajuda a identificar",
    benefits: "Benefícios operacionais",
    metrics: "O que medir",
  };
  return `<article data-vendorai-seo-content="route">
<header><p>${escapeHtml(copy.eyebrow || route.cluster || "VendorAI")}</p><h1>${escapeHtml(copy.headline || stripBrand(spanish ? route.esTitle : route.title))}</h1><p>${escapeHtml(copy.subheadline || (spanish ? route.esDescription : route.description))}</p></header>
<section><h2>${sectionTitle.problems}</h2>${list(copy.problems)}</section>
<section><h2>${sectionTitle.how}</h2>${list(copy.how)}</section>
<section><h2>${sectionTitle.opportunities}</h2>${list(copy.opportunities)}</section>
<section><h2>${sectionTitle.benefits}</h2>${list(copy.benefits)}</section>
${priorityDepthHtml(route.pathname, spanish)}
<section><h2>${sectionTitle.metrics}</h2>${list(copy.metrics)}</section>
${spanish ? esFaq(copy.faq) : faq(copy.faq)}
<section><h2>${spanish ? "Continúa explorando VendorAI" : "Continue explorando o VendorAI"}</h2>${links([...productLinks, ...commonLinks(spanish)])}</section>
<p><a href="/demo">${escapeHtml(copy.cta || (spanish ? "Prueba VendorAI durante 5 días." : "Teste o VendorAI por 5 dias."))}</a></p>
</article>`;
}

function verticalHtml(route, spanish = false) {
  const title = spanish ? (route.esName || stripBrand(route.esTitle || route.title)) : (route.name || stripBrand(route.title));
  const description = spanish ? (route.esDescription || route.description) : route.description;
  const pain = spanish ? route.esCorePain : route.corePain;
  const promise = spanish ? route.esPromise : route.promise;
  const agents = route.priorityAgents || [];
  const keywords = [route.primaryKeyword, ...(route.secondaryKeywords || [])].filter(Boolean);
  const body = spanish
    ? [
        `VendorAI organiza la jornada comercial de ${title} conectando adquisición, atención, CRM, seguimiento, pipeline y oportunidades de ingresos en un mismo historial.`,
        pain || `La operación de ${title} necesita preservar contexto, responsable y próxima acción para que las oportunidades no dependan de memoria o controles aislados.`,
        promise || `El objetivo es convertir señales comerciales en acciones priorizadas, manteniendo trazabilidad desde el origen hasta la venta y el próximo ciclo de relación.`,
        `Los agentes de IA pueden observar, recomendar o ejecutar tareas dentro de las reglas autorizadas por la empresa. La autonomía no elimina el control: organiza el trabajo según etapa, contexto y permisos.`,
        `Revenue Scout complementa el CRM buscando señales de recompra, reactivación, expansión o recuperación cuando existan datos suficientes para explicar la oportunidad.`,
      ]
    : [
        `O VendorAI organiza a jornada comercial de ${title} conectando aquisição, atendimento, CRM, follow-up, pipeline e oportunidades de receita no mesmo histórico.`,
        pain || `A operação de ${title} precisa preservar contexto, responsável e próxima ação para que oportunidades não dependam de memória ou controles isolados.`,
        promise || `O objetivo é transformar sinais comerciais em ações priorizadas, mantendo rastreabilidade da origem até a venda e o próximo ciclo de relacionamento.`,
        `Os agentes de IA podem observar, recomendar ou executar tarefas dentro das regras autorizadas pela empresa. A autonomia não elimina controle: organiza o trabalho conforme etapa, contexto e permissões.`,
        `O Revenue Scout complementa o CRM procurando sinais de recompra, reativação, expansão ou recuperação quando houver dados suficientes para explicar a oportunidade.`,
      ];
  const related = spanish
    ? [
        { href: "/produtos/crm", label: "CRM inteligente" },
        { href: "/produtos/agentes-ia", label: "Agentes de IA" },
        { href: "/produtos/revenue-scout", label: "Revenue Scout" },
        { href: "/solucoes/automatizar-follow-up", label: "Seguimiento con IA" },
      ]
    : [
        { href: "/produtos/crm", label: "CRM Inteligente" },
        { href: "/produtos/agentes-ia", label: "Agentes de IA" },
        { href: "/produtos/revenue-scout", label: "Revenue Scout" },
        { href: "/solucoes/automatizar-follow-up", label: "Follow-up com IA" },
      ];
  return `<article data-vendorai-seo-content="route">
<header><p>VendorAI por segmento</p><h1>${escapeHtml(spanish ? stripBrand(route.esTitle || route.title) : stripBrand(route.title))}</h1><p>${escapeHtml(description)}</p></header>
<section><h2>${spanish ? "Operación comercial conectada" : "Operação comercial conectada"}</h2>${body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>
${agents.length ? `<section><h2>${spanish ? "Agentes prioritarios" : "Agentes prioritários"}</h2>${list(agents)}</section>` : ""}
${keywords.length ? `<section><h2>Temas relacionados</h2>${list(keywords)}</section>` : ""}
${spanish ? "" : faq(route.faq)}
<section><h2>${spanish ? "Soluciones relacionadas" : "Soluções relacionadas"}</h2>${links([...related, ...commonLinks(spanish)])}</section>
<p><a href="/demo">${spanish ? "Probar VendorAI durante 5 días" : "Testar o VendorAI por 5 dias"}</a></p>
</article>`;
}

function collectionHtml(route, spanish = false) {
  const title = stripBrand(spanish ? (route.esTitle || route.title) : route.title);
  const description = spanish ? (route.esDescription || route.description) : route.description;
  const itemLinks = (route.items || []).slice(0, 40).map((item) => ({ href: item.path, label: spanish ? (item.esName || item.name) : item.name }));
  return `<article data-vendorai-seo-content="route">
<header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>
<section><h2>${spanish ? "Explora las opciones" : "Explore as opções"}</h2><p>${spanish ? "Usa esta página para navegar por problemas, comparaciones y soluciones conectadas a CRM, ventas, automatización e inteligencia de ingresos." : "Use esta página para navegar por problemas, comparações e soluções conectadas a CRM, vendas, automação e inteligência de receita."}</p>${links([...itemLinks, ...commonLinks(spanish)])}</section>
</article>`;
}

function genericHtml(route, spanish = false) {
  const title = stripBrand(spanish ? (route.esTitle || route.title) : route.title);
  const description = spanish ? (route.esDescription || route.description) : route.description;
  const productName = route.name || title;
  const related = [...commonLinks(spanish)];
  if (route.type === "product") {
    related.unshift(
      { href: "/solucoes/crm-whatsapp", label: spanish ? "CRM y WhatsApp" : "CRM e WhatsApp" },
      { href: "/solucoes/automatizar-follow-up", label: spanish ? "Seguimiento automático" : "Follow-up automático" },
      { href: "/solucoes/revenue-intelligence", label: "Revenue Intelligence" },
    );
  }
  const paragraphs = spanish
    ? [
        `${productName} forma parte del ecosistema VendorAI, diseñado para que marketing, atención, CRM, ventas, seguimiento y posventa compartan el mismo contexto comercial.`,
        description,
        `En lugar de mantener datos y acciones separados, VendorAI relaciona origen, cliente, oportunidad, responsable, etapa y próxima acción. Así la información puede seguir a la jornada comercial sin depender de controles paralelos.`,
        `La inteligencia artificial puede operar como observadora, asistida o autónoma según las reglas autorizadas. El objetivo es priorizar trabajo y oportunidades manteniendo trazabilidad de lo que fue recomendado o ejecutado.`,
        `Las métricas deben conectarse al resultado de la operación: velocidad de respuesta, cobertura de seguimiento, avance de pipeline, conversión, retención y oportunidades de ingresos cuando correspondan al caso de uso.`,
      ]
    : [
        `${productName} faz parte do ecossistema VendorAI, desenhado para que marketing, atendimento, CRM, vendas, follow-up e pós-venda compartilhem o mesmo contexto comercial.`,
        description,
        `Em vez de manter dados e ações separados, o VendorAI relaciona origem, cliente, oportunidade, responsável, etapa e próxima ação. Assim a informação acompanha a jornada comercial sem depender de controles paralelos.`,
        `A inteligência artificial pode operar como observadora, assistida ou autônoma conforme as regras autorizadas. O objetivo é priorizar trabalho e oportunidades mantendo rastreabilidade do que foi recomendado ou executado.`,
        `Os indicadores devem se conectar ao resultado da operação: velocidade de resposta, cobertura de follow-up, avanço de pipeline, conversão, retenção e oportunidades de receita quando fizerem sentido para o caso de uso.`,
      ];
  return `<article data-vendorai-seo-content="route">
<header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>
<section><h2>${spanish ? "Cómo encaja en la operación" : "Como se encaixa na operação"}</h2>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>
${spanish ? esFaq(route.esFaq) : faq(route.faq)}
<section><h2>${spanish ? "Continúa explorando" : "Continue explorando"}</h2>${links(related)}</section>
</article>`;
}

function buildHtml(route, spanish = false) {
  const growth = growthByPath.get(route.pathname);
  if (growth) return growthHtml(route, growth, spanish);
  if (route.type === "vertical") return verticalHtml(route, spanish);
  if (route.type === "collection") return collectionHtml(route, spanish);
  return genericHtml(route, spanish);
}

for (const route of manifest.routes || []) {
  if (route.indexable === false || route.pathname === "/demo") continue;
  route.staticHtml = buildHtml(route, false);
  route.esStaticHtml = buildHtml(route, true);
  if (!route.staticHtml.includes("<h1") || !route.staticHtml.includes("href=\"/")) {
    throw new Error(`[prerender] semantic HTML incomplete for ${route.pathname}`);
  }
}

const priorityFailures = [];
for (const pathname of priorityDepthByPath.keys()) {
  const route = manifest.routes.find((item) => item.pathname === pathname);
  if (!route?.staticHtml?.includes('data-vendorai-priority-depth="true"')) {
    priorityFailures.push(`${pathname}: priority depth missing`);
    continue;
  }
  const text = route.staticHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean).length;
  if (words < 450) priorityFailures.push(`${pathname}: ${words} words`);
}
if (priorityFailures.length) {
  throw new Error(`[prerender] priority routes below quality gate: ${priorityFailures.join("; ")}`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

let worker = fs.readFileSync(workerPath, "utf8");
const needle = `.on("head", { element(element) { element.append(head, { html: true }); } })\n    .transform(response);`;
const replacement = `.on("head", { element(element) { element.append(head, { html: true }); } })\n    .on("#root", { element(element) {\n      const staticHtml = meta.country === "BR" ? meta.staticHtml : (meta.esStaticHtml || meta.staticHtml);\n      if (staticHtml) {\n        element.setAttribute("data-vendorai-prerender", "edge");\n        element.setInnerContent(staticHtml, { html: true });\n      }\n    } })\n    .transform(response);`;
if (!worker.includes(needle)) {
  throw new Error("[prerender] Cloudflare worker transform hook not found");
}
worker = worker.replace(needle, replacement);
fs.writeFileSync(workerPath, worker);

const strategic = ["/", "/produtos/crm", "/solucoes/crm-whatsapp", "/lp/distribuidora-materiais-construcao", "/comparar/crm-com-ia-vs-crm-tradicional"];
for (const pathname of strategic) {
  const route = manifest.routes.find((item) => item.pathname === pathname);
  if (!route?.staticHtml) throw new Error(`[prerender] missing strategic route ${pathname}`);
  const text = route.staticHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean).length;
  if (words < 120) throw new Error(`[prerender] ${pathname} has only ${words} words in initial HTML`);
}

console.log(`[prerender] semantic initial HTML generated for ${(manifest.routes || []).filter((route) => route.staticHtml).length} routes; ${priorityDepthByPath.size} priority routes >= 450 words`);
