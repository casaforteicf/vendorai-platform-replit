// ─── ARQDOR AI Brain — Intent Detector ───────────────────────────────────────
// Lightweight keyword-based intent classification.
// No LLM call — deterministic and instant.
// Upgrade path: replace `detect()` internals with an embedding/classifier call.

import type { IntentCategory } from "./types";

interface IntentRule {
  intent:    IntentCategory;
  keywords:  RegExp;
  weight:    number;           // tie-breaking weight when multiple intents match
}

const RULES: IntentRule[] = [
  {
    intent:   "render_generation",
    weight:   10,
    keywords: /\b(render|renderizar|gerar imagem|gerar render|visualiz|cena|câmera|ângulo|prompt|flux|ai image|imagem 3d|perspectiva|foto-realista|fotorrealismo)\b/i,
  },
  {
    intent:   "material_selection",
    weight:   9,
    keywords: /\b(material|acabamento|textura|revestimento|piso|parede|teto|mármore|madeira|couro|tecido|porcelanato|laminado|mdf|painel|coating|superficie|granito|concreto aparente)\b/i,
  },
  {
    intent:   "lighting_design",
    weight:   9,
    keywords: /\b(luz|luminária|iluminação|lighting|led|kelvin|lux|ponto de luz|spot|pendente|arandela|dimmer|temperatura de cor|ambient|accent|task light)\b/i,
  },
  {
    intent:   "space_planning",
    weight:   8,
    keywords: /\b(espaço|layout|planta|circulação|ergonomia|fluxo|zoneamento|m²|metros quadrados|ambiente|cômodo|área|setorização|organização|disposição|mobiliário)\b/i,
  },
  {
    intent:   "budget_estimation",
    weight:   8,
    keywords: /\b(orçamento|custo|valor|preço|investimento|r\$|financeiro|verba|quanto custa|estimativa|roi|payback|tabela de preços|planilha|itemizar)\b/i,
  },
  {
    intent:   "interior_design",
    weight:   7,
    keywords: /\b(estilo|design de interiores|decoração|paleta|cor|harmonia|minimalista|escandinavo|moderno|clássico|contemporâneo|rústico|industrial|mood|atmosfera|sensação)\b/i,
  },
  {
    intent:   "presentation",
    weight:   7,
    keywords: /\b(memorial|relatório|documento|apresentação|cliente|pdf|proposta|briefing|laudo|descritivo|comunicação|entrega|portfólio)\b/i,
  },
  {
    intent:   "manufacturer_sourcing",
    weight:   7,
    keywords: /\b(fornecedor|fabricante|marca|catálogo|produto|linha|coleção|distribuidor|loja|comprar|adquirir|especificação técnica|ficha técnica)\b/i,
  },
];

export class IntentDetector {
  detect(message: string): IntentCategory {
    let best: IntentRule | null = null;
    let bestScore = 0;

    for (const rule of RULES) {
      const matches = message.match(new RegExp(rule.keywords.source, "gi"));
      if (!matches) continue;

      const score = matches.length * rule.weight;
      if (score > bestScore) {
        bestScore = score;
        best = rule;
      }
    }

    return best?.intent ?? "general";
  }

  // Detect multiple intents (for orchestrator to select several specialists)
  detectAll(message: string, threshold = 0.4): IntentCategory[] {
    const scores: Map<IntentCategory, number> = new Map();

    for (const rule of RULES) {
      const matches = message.match(new RegExp(rule.keywords.source, "gi"));
      if (!matches) continue;
      const score = matches.length * rule.weight;
      scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + score);
    }

    if (scores.size === 0) return ["general"];

    const max = Math.max(...scores.values());
    const cutoff = max * threshold;

    const detected = [...scores.entries()]
      .filter(([, s]) => s >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .map(([intent]) => intent);

    return detected.length > 0 ? detected : ["general"];
  }

  describe(intent: IntentCategory): string {
    const labels: Record<IntentCategory, string> = {
      space_planning:       "Planejamento de Espaço",
      interior_design:      "Design de Interiores",
      lighting_design:      "Design de Iluminação",
      material_selection:   "Seleção de Materiais",
      budget_estimation:    "Estimativa de Orçamento",
      render_generation:    "Geração de Render",
      presentation:         "Apresentação / Memorial",
      manufacturer_sourcing:"Fornecedores / Fabricantes",
      general:              "Consulta Geral",
    };
    return labels[intent];
  }
}
