import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "../dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const additions = {
  "/produtos": [
    "Antes de escolher um módulo, vale mapear onde a jornada comercial perde contexto hoje: entrada do lead, atendimento, qualificação, proposta, follow-up, pós-venda ou expansão da carteira. Esse diagnóstico ajuda a priorizar quais produtos devem entrar primeiro e evita implantações baseadas apenas em uma lista extensa de funcionalidades.",
    "Os módulos podem ser combinados conforme a maturidade da operação. Uma equipe pode começar com CRM e atendimento, acrescentar agentes de IA e automações depois e, quando o histórico estiver consistente, usar Revenue Scout, analytics e marketing integrado para ampliar receita e melhorar decisões sobre a carteira.",
  ],
  "/funcionalidades": [
    "A adoção pode ser feita por etapas. Primeiro, a empresa organiza dados, responsáveis, canais e pipeline; depois define quais tarefas podem ser assistidas ou automatizadas. Essa sequência reduz risco e cria uma base melhor para medir se cada funcionalidade está economizando tempo, aumentando cobertura ou ajudando oportunidades a avançar.",
    "Também é importante revisar permissões e qualidade dos dados antes de aumentar a autonomia da IA. Quanto melhor estiver o histórico de clientes, produtos, atividades e resultados, mais úteis tendem a ser recomendações, prioridades e automações geradas sobre a própria operação.",
  ],
};

for (const [pathname, paragraphs] of Object.entries(additions)) {
  const route = (manifest.routes || []).find((item) => item.pathname === pathname);
  if (!route?.staticHtml) throw new Error(`[thin-hubs] missing prerendered route ${pathname}`);
  route.staticHtml += `<section data-vendorai-thin-hub="true">${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}</section>`;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("[thin-hubs] primed /produtos and /funcionalidades before commercial quality gate");
