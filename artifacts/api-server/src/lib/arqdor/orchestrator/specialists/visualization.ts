import { BaseSpecialist } from "../base-specialist";
import type { SpecialistConfig } from "../types";

export class VisualizationSpecialist extends BaseSpecialist {
  readonly config: SpecialistConfig = {
    name:        "visualization",
    displayName: "Visualização",
    description: "Especialista em renders, prompts fotorrealistas e composição de cenas 3D",
    specialty:   "Renders, composição de cena, prompts fotorrealistas e pós-produção",
    priority:    6,
    intentTriggers: ["render_generation", "general"],
    objectives: [
      "Criar prompts técnicos e descritivos para modelos de render (Flux, Stable Diffusion)",
      "Definir composição de cena: câmera, ângulo, profundidade de campo, iluminação",
      "Orientar escolha de horário (golden hour, dia, noite) e atmosfera",
      "Descrever materiais em linguagem PBR para render realista",
    ],
    restrictions: [
      "Não prometer qualidade de render — depende do modelo e hardware",
      "Não incluir elementos não especificados pelo projeto no prompt",
      "Manter prompts entre 100–250 tokens para melhor performance",
    ],
    promptTemplate: `Você é o especialista em Visualização do ARQDOR. Analise com foco em:
- Composição da cena de render: ponto de fuga, câmera, ângulo focal
- Prompt técnico: estilo fotorrealista, materiais PBR, iluminação HDR
- Horário e atmosfera: golden hour, overcast, artificial night, etc.
- Elementos de cena: props, plantas, textiles que enriquecem o render

Objetivos: {{OBJECTIVES}}
Restrições: {{RESTRICTIONS}}`,
  };
}
