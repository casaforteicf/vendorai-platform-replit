import type { BIMElement, BIMModel, ClashItem, ExportJob, ModelVersion, TwinInsight } from "./bimTypes";

export const models: BIMModel[] = [
  {
    id: "model-001",
    name: "Projeto ARQDOR — Modelo Integrado",
    version: "BIM-V04",
    discipline: "Integrado",
    elements: 1248,
    clashes: 6,
    updatedAt: "2026-07-14",
    status: "current",
  },
  {
    id: "model-002",
    name: "Arquitetura — Interiores",
    version: "ARQ-V08",
    discipline: "Arquitetura",
    elements: 684,
    clashes: 2,
    updatedAt: "2026-07-13",
    status: "published",
  },
  {
    id: "model-003",
    name: "Elétrica — Iluminação",
    version: "ELE-V03",
    discipline: "Elétrica",
    elements: 218,
    clashes: 3,
    updatedAt: "2026-07-12",
    status: "review",
  },
  {
    id: "model-004",
    name: "Marcenaria — Produção",
    version: "MAR-V05",
    discipline: "Marcenaria",
    elements: 346,
    clashes: 1,
    updatedAt: "2026-07-13",
    status: "current",
  },
];

export const elements: BIMElement[] = [
  {
    id: "el-001",
    name: "Painel TV MDF Carvalho Claro",
    category: "Marcenaria",
    discipline: "Marcenaria",
    level: "Pavimento 01",
    material: "MDF Carvalho Claro",
    dimensions: "320 x 240 x 4 cm",
    status: "warning",
    linkedSpecification: "SPEC-PAINEL-TV",
    linkedBudget: "BUD-MAR-001",
  },
  {
    id: "el-002",
    name: "Perfil LED Linear",
    category: "Iluminação",
    discipline: "Elétrica",
    level: "Pavimento 01",
    material: "Alumínio + LED",
    dimensions: "300 cm",
    status: "clash",
    linkedSpecification: "SPEC-LED-001",
    linkedBudget: "BUD-ILU-001",
  },
  {
    id: "el-003",
    name: "Bancada Gourmet Quartzo Branco",
    category: "Marmoraria",
    discipline: "Arquitetura",
    level: "Pavimento 01",
    material: "Quartzo Branco",
    dimensions: "280 x 90 x 2 cm",
    status: "ok",
    linkedSpecification: "SPEC-BANCADA",
    linkedBudget: "BUD-MAR-002",
  },
  {
    id: "el-004",
    name: "Cortineiro Sala",
    category: "Gesso",
    discipline: "Arquitetura",
    level: "Pavimento 01",
    material: "Drywall",
    dimensions: "420 x 18 cm",
    status: "updated",
    linkedSpecification: "SPEC-CORTINEIRO",
    linkedBudget: "BUD-GES-001",
  },
];

export const clashes: ClashItem[] = [
  {
    id: "cl-001",
    title: "Perfil LED conflita com estrutura do painel",
    elementA: "Perfil LED Linear",
    elementB: "Painel TV MDF Carvalho Claro",
    disciplineA: "Elétrica",
    disciplineB: "Marcenaria",
    severity: "alto",
    status: "open",
    recommendation: "Ajustar rasgo técnico no painel antes de gerar produção.",
  },
  {
    id: "cl-002",
    title: "Cortineiro invade área de iluminação indireta",
    elementA: "Cortineiro Sala",
    elementB: "Perfil LED Linear",
    disciplineA: "Arquitetura",
    disciplineB: "Elétrica",
    severity: "medio",
    status: "review",
    recommendation: "Revisar afastamento entre cortineiro e canaleta de LED.",
  },
  {
    id: "cl-003",
    title: "Altura do painel divergente da especificação",
    elementA: "Painel TV MDF Carvalho Claro",
    elementB: "Especificação SPEC-PAINEL-TV",
    disciplineA: "Marcenaria",
    disciplineB: "Specification",
    severity: "critico",
    status: "open",
    recommendation: "Bloquear OP até corrigir medida no modelo ou ficha técnica.",
  },
];

export const versions: ModelVersion[] = [
  { id: "ver-001", name: "Modelo Integrado", version: "BIM-V04", author: "AI BIM", date: "2026-07-14", changes: 18, status: "current" },
  { id: "ver-002", name: "Modelo Integrado", version: "BIM-V03", author: "Arquitetura", date: "2026-07-12", changes: 11, status: "archived" },
  { id: "ver-003", name: "Arquitetura Interiores", version: "ARQ-V08", author: "Equipe Projeto", date: "2026-07-13", changes: 7, status: "published" },
  { id: "ver-004", name: "Elétrica Iluminação", version: "ELE-V03", author: "Equipe Elétrica", date: "2026-07-12", changes: 5, status: "review" },
];

export const exportJobs: ExportJob[] = [
  { id: "exp-001", name: "Modelo Integrado BIM-V04.ifc", format: "ifc", status: "ready", size: "48 MB", createdAt: "2026-07-14" },
  { id: "exp-002", name: "Modelo Navegável GLB", format: "glb", status: "done", size: "22 MB", createdAt: "2026-07-14" },
  { id: "exp-003", name: "Relatório Clash Detection.pdf", format: "pdf", status: "ready", size: "1.4 MB", createdAt: "2026-07-14" },
  { id: "exp-004", name: "Modelo AR USDZ", format: "usdz", status: "processing", size: "—", createdAt: "2026-07-14" },
];

export const twinInsights: TwinInsight[] = [
  {
    id: "ins-001",
    title: "Painel TV deve ser bloqueado para produção",
    description: "Existe divergência crítica entre modelo BIM e especificação técnica.",
    impact: "Evita retrabalho",
    action: "Bloquear OP",
  },
  {
    id: "ins-002",
    title: "Sincronizar elétrica e marcenaria",
    description: "Perfil LED conflita com estrutura do painel e precisa ajuste antes da fabricação.",
    impact: "Ação técnica",
    action: "Gerar tarefa",
  },
  {
    id: "ins-003",
    title: "Modelo GLB pronto para portal cliente",
    description: "Arquivo navegável já pode ser disponibilizado para visualização do cliente.",
    impact: "Experiência cliente",
    action: "Publicar no portal",
  },
];
