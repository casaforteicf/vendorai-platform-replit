// ─── Project Opportunity Engine Hub — FASE 23 ────────────────────────────────
// Motor de oportunidades comerciais baseadas em contexto técnico do projeto.
// Toda recomendação é justificada. Nunca baseada em publicidade.

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Cpu, Search, Filter, Plus, ChevronRight, CheckCircle2, AlertTriangle,
  XCircle, ArrowUpCircle, Layers, Package, MessageSquare, FileText,
  BarChart3, TrendingUp, Zap, Shield, Star, Eye, Clock, MapPin,
  Building2, Bot, Send, Check, X, ChevronDown, ChevronUp, Award,
  Lightbulb, Hammer, TreePine, Cog, AlertCircle, DollarSign,
} from "lucide-react";
import type { PoeOpportunity, PoeRecommendation, PoeQuotationRequest } from "./poe-types";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_OPPORTUNITIES: PoeOpportunity[] = [
  {
    id: "o1", tenantId: "t1", projectId: "p1", projectName: "Residência São Paulo — Torre 3",
    type: "missing_category", status: "ready", priority: 9,
    title: "Iluminação não especificada — Cozinha",
    description: "A cozinha não possui especificação de iluminação geral nem de tarefa.",
    environment: "Cozinha", category: "Iluminação",
    itemRef: null,
    justification: "Todo ambiente de preparo de alimentos exige iluminância mínima de 300 lux (NBR 5413) para atividades de tarefa e iluminação de destaque sobre bancadas.",
    technicalBasis: ["NBR 5413", "NBR ISO/CIE 8995-1", "ABNT NBR 5410"],
    tags: ["urgente", "norma"], aiGenerated: true, dismissed: false,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "o2", tenantId: "t1", projectId: "p1", projectName: "Residência São Paulo — Torre 3",
    type: "missing_supplier", status: "detected", priority: 8,
    title: "Porcelanato 120×240cm sem fornecedor definido",
    description: "O revestimento especificado para sala de estar (120×240cm, polido, tom branco) não tem fornecedor atribuído.",
    environment: "Sala de Estar", category: "Revestimentos",
    itemRef: "item_rev_sala_001",
    justification: "Produto de grande formato requer fornecedor com estrutura logística adequada, prazo de entrega mínimo de 15 dias e capacidade de fornecer o lote completo do pedido sem variação de tonalidade (lote único).",
    technicalBasis: ["NBR 15463", "ISO 10545-3"],
    tags: [], aiGenerated: false, dismissed: false,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "o3", tenantId: "t1", projectId: "p1", projectName: "Residência São Paulo — Torre 3",
    type: "incompatible_item", status: "detected", priority: 10,
    title: "Torneira incompatível com a cuba especificada",
    description: "A torneira de bica alta (furo 35mm) é incompatível com a cuba de embutir que possui furo padrão 40mm.",
    environment: "Banheiro Principal", category: "Metais",
    itemRef: "item_metal_ban_001",
    justification: "O diâmetro do furo da torneira (35mm) não é compatível com o furo padrão da cuba selecionada (40mm). Necessário adequar um dos dois itens para evitar retrabalho em obra.",
    technicalBasis: ["NBR 15496"],
    tags: ["incompatibilidade", "crítico"], aiGenerated: true, dismissed: false,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "o4", tenantId: "t1", projectId: "p1", projectName: "Residência São Paulo — Torre 3",
    type: "cross_sell", status: "ready", priority: 6,
    title: "Automação residencial — compatível com projeto",
    description: "O projeto possui múltiplos circuitos de iluminação e persianas motorizadas, que podem ser integrados a um sistema de automação.",
    environment: "Geral", category: "Automação",
    itemRef: null,
    justification: "A complexidade do projeto (12 ambientes, 34 circuitos de iluminação, 8 pontos de persiana) torna viável a implementação de automação residencial com retorno em economia energética estimado em 18-25%.",
    technicalBasis: ["NBR 5410 — Instalações Elétricas de Baixa Tensão"],
    tags: ["cross-sell"], aiGenerated: false, dismissed: false,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "o5", tenantId: "t1", projectId: "p1", projectName: "Residência São Paulo — Torre 3",
    type: "missing_item", status: "detected", priority: 7,
    title: "Acabamentos de piso externo não definidos",
    description: "A área de piscina e deck externo não possui especificação de piso antiderrapante.",
    environment: "Área Externa", category: "Pisos",
    itemRef: null,
    justification: "Áreas molhadas externas exigem piso com índice de deslizamento mínimo R11 (NBR 9050 e EN 13036-4) para segurança dos usuários. A ausência de especificação representa risco de responsabilidade civil.",
    technicalBasis: ["NBR 9050", "EN 13036-4", "ABNT NBR 15575"],
    tags: ["segurança", "norma"], aiGenerated: true, dismissed: false,
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const MOCK_RECOMMENDATIONS: PoeRecommendation[] = [
  {
    id: "r1", opportunityId: "o1", vcnCompanyId: "v2", vcnProductId: null,
    companyName: "Lumini", productName: "Sistema Trilho Monofásico LED",
    productSku: "TRL-M-01", scoreTechnical: 94, scoreAesthetic: 88,
    scoreDimensional: 92, scoreFinancial: 76, scoreRegional: 95,
    scoreLeadTime: 90, scoreOverall: 89,
    justification: "O sistema de trilho monofásico Lumini é compatível com o pé-direito de 2,80m, atinge a iluminância necessária de 300 lux em bancadas com os spots TRL-S-01 (850lm cada), possui IRC >90 recomendado para áreas de cozinha e é compatível com dimmer 0-10V já previsto no projeto elétrico.",
    advantages: ["IRC >90 (fidelidade de cores em alimentos)", "Compatível com dimmer já previsto", "Trilho reconfigurável sem retrabalho elétrico", "Instalação em 1 dia — sem prazo crítico"],
    caveats: ["Requer driver externo 24V — verificar espaço no painel"],
    estimatedPrice: "4800.00", priceUnit: "kit completo", leadTimeDays: 12,
    inStock: true, region: "SP", selected: false, dismissed: false, rank: 1,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "r2", opportunityId: "o2", vcnCompanyId: "v1", vcnProductId: "p1",
    companyName: "Portobello", productName: "Scala Bianco 120×240cm",
    productSku: "SCB120240B", scoreTechnical: 96, scoreAesthetic: 92,
    scoreDimensional: 100, scoreFinancial: 72, scoreRegional: 88,
    scoreLeadTime: 78, scoreOverall: 88,
    justification: "O Scala Bianco 120×240cm possui dimensões exatas ao especificado, acabamento polido compatível com a paleta de cores do projeto (tons neutros quentes), classe PEI 5 adequada para sala de alto tráfego, absorção <0,1% e retificado que garante rejunte mínimo (2mm) conforme desejado pelo arquiteto.",
    advantages: ["Dimensão exata — sem cortes adicionais", "Lote único disponível — sem variação de tonalidade", "BIM e PBR disponíveis para renderização"],
    caveats: ["Prazo de 15 dias — planejar na sequência de obra", "Frete especial para grandes formatos"],
    estimatedPrice: "280.00", priceUnit: "m²", leadTimeDays: 15,
    inStock: true, region: "Nacional", selected: false, dismissed: false, rank: 1,
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const MOCK_QUOTATIONS: PoeQuotationRequest[] = [
  {
    id: "q1", tenantId: "t1", projectId: "p1", projectName: "Residência São Paulo — Torre 3",
    items: [{ opportunityId: "o2", productId: "p1", productName: "Scala Bianco 120×240cm", quantity: 180, unit: "m²" }],
    vcnCompanyId: "v1", companyName: "Portobello",
    contactEmail: "especificacao@portobello.com.br", contactPhone: "(47) 2106-0000",
    region: "SP", deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    notes: "Projeto residencial alto padrão. Lote único obrigatório.", attachments: [],
    status: "sent", leadId: null, opportunityId: "o2", activityId: null,
    sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    createdAt: new Date(), updatedAt: new Date(),
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  missing_item:     { label: "Item Faltante",     icon: <AlertCircle size={11} />, color: "#f59e0b" },
  missing_supplier: { label: "Sem Fornecedor",    icon: <Building2 size={11} />,   color: "#ef4444" },
  incompatible_item:{ label: "Incompatibilidade", icon: <XCircle size={11} />,     color: "#dc2626" },
  cross_sell:       { label: "Cross-sell",        icon: <Layers size={11} />,      color: "#8b5cf6" },
  up_sell:          { label: "Up-sell",           icon: <ArrowUpCircle size={11} />, color: "#3b82f6" },
  missing_category: { label: "Categoria Ausente", icon: <AlertTriangle size={11} />, color: "#f97316" },
  substitutable_item:{ label: "Substituível",     icon: <Cog size={11} />,         color: "#6b7280" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  detected: { label: "Detectado", color: "#f59e0b", bg: "#f59e0b15" },
  analyzing:{ label: "Analisando",color: "#3b82f6", bg: "#3b82f615" },
  ready:    { label: "Pronto",    color: "#10b981", bg: "#10b98115" },
  quoted:   { label: "Cotado",    color: "#8b5cf6", bg: "#8b5cf615" },
  closed:   { label: "Fechado",   color: "#64748b", bg: "#64748b15" },
  dismissed:{ label: "Dispensado",color: "#374151", bg: "#37415115" },
};

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const color = value >= 85 ? "#10b981" : value >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color }}>
        {value}
      </div>
      <span style={{ fontSize: 7, color: "#64748b", textAlign: "center", maxWidth: 42 }}>{label}</span>
    </div>
  );
}

function OpportunityCard({ opp, expanded, onToggle }: { opp: PoeOpportunity; expanded: boolean; onToggle: () => void }) {
  const typeConf   = TYPE_CONFIG[opp.type] ?? TYPE_CONFIG.missing_item;
  const statusConf = STATUS_CONFIG[opp.status] ?? STATUS_CONFIG.detected;
  const priorityColor = opp.priority >= 9 ? "#ef4444" : opp.priority >= 7 ? "#f59e0b" : "#64748b";
  const recs = MOCK_RECOMMENDATIONS.filter(r => r.opportunityId === opp.id);

  return (
    <div style={{ background: "#1a1b23", border: `1px solid ${opp.priority >= 9 ? "#ef444430" : "#2d2e3a"}`, borderRadius: 8, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Priority */}
        <div style={{ width: 24, height: 24, borderRadius: 4, background: `${priorityColor}20`, border: `1px solid ${priorityColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: priorityColor, flexShrink: 0 }}>
          {opp.priority}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${typeConf.color}20`, color: typeConf.color, fontWeight: 700 }}>
              {typeConf.icon} {typeConf.label}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, padding: "1px 6px", borderRadius: 3, background: statusConf.bg, color: statusConf.color, fontWeight: 700 }}>
              {statusConf.label}
            </span>
            {opp.environment && <span style={{ fontSize: 9, color: "#64748b" }}>{opp.environment}</span>}
            {opp.category && <span style={{ fontSize: 9, color: "#64748b" }}>· {opp.category}</span>}
            {opp.aiGenerated && <span style={{ fontSize: 8, color: "#8b5cf6" }}>✦ IA</span>}
          </div>
          <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 700, color: "#fff" }}>{opp.title}</p>
          {!expanded && opp.description && (
            <p style={{ margin: 0, fontSize: 9, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{opp.description}</p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {recs.length > 0 && (
            <span style={{ fontSize: 9, color: "#10b981", padding: "2px 6px", borderRadius: 3, background: "#10b98115", border: "1px solid #10b98130" }}>
              {recs.length} rec.
            </span>
          )}
          {expanded ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #2d2e3a" }}>
          {opp.description && (
            <p style={{ margin: "12px 0 8px", fontSize: 10, color: "#e2e8f0", lineHeight: 1.6 }}>{opp.description}</p>
          )}

          {/* Justification */}
          <div style={{ background: "#10b98108", border: "1px solid #10b98130", borderRadius: 6, padding: "10px 12px", marginBottom: 10 }}>
            <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: "#10b981" }}>💡 JUSTIFICATIVA TÉCNICA</p>
            <p style={{ margin: "0 0 6px", fontSize: 10, color: "#e2e8f0", lineHeight: 1.5 }}>{opp.justification}</p>
            {opp.technicalBasis.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {opp.technicalBasis.map(b => <span key={b} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#10b98120", color: "#10b981" }}>{b}</span>)}
              </div>
            )}
          </div>

          {/* Recommendations */}
          {recs.length > 0 && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: "#64748b" }}>RECOMENDAÇÕES ({recs.length})</p>
              {recs.map(rec => (
                <div key={rec.id} style={{ background: "#0f1117", border: "1px solid #2d2e3a", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "#fff" }}>{rec.productName}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 9, color: "#10b981" }}>{rec.companyName} {rec.productSku ? `— SKU: ${rec.productSku}` : ""}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 9, color: "#94a3b8", lineHeight: 1.5 }}>{rec.justification}</p>
                    </div>
                    {rec.scoreOverall != null && (
                      <div style={{ padding: "6px 10px", borderRadius: 6, background: "#10b98115", border: "1px solid #10b98130", textAlign: "center", flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#10b981" }}>{rec.scoreOverall}</p>
                        <p style={{ margin: 0, fontSize: 7, color: "#64748b" }}>score</p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                    <ScoreBadge label="Técnico"   value={rec.scoreTechnical} />
                    <ScoreBadge label="Estético"  value={rec.scoreAesthetic} />
                    <ScoreBadge label="Dimensional" value={rec.scoreDimensional} />
                    <ScoreBadge label="Financeiro" value={rec.scoreFinancial} />
                    <ScoreBadge label="Regional"  value={rec.scoreRegional} />
                    <ScoreBadge label="Lead Time" value={rec.scoreLeadTime} />
                  </div>

                  {rec.advantages.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      {rec.advantages.map(a => <p key={a} style={{ margin: "0 0 2px", fontSize: 9, color: "#10b981" }}>✓ {a}</p>)}
                    </div>
                  )}
                  {rec.caveats.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {rec.caveats.map(c => <p key={c} style={{ margin: "0 0 2px", fontSize: 9, color: "#f59e0b" }}>⚠ {c}</p>)}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      {rec.estimatedPrice && <span style={{ fontWeight: 700, color: "#10b981" }}>R$ {rec.estimatedPrice}/{rec.priceUnit}</span>}
                      {rec.leadTimeDays && <span style={{ marginLeft: 8 }}>· {rec.leadTimeDays} dias</span>}
                      {rec.inStock && <span style={{ marginLeft: 6, color: "#10b981", fontSize: 8 }}>✓ Em estoque</span>}
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button style={{ padding: "5px 10px", borderRadius: 5, background: "transparent", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 9 }}>
                        🤖 Especialista
                      </button>
                      <button style={{ padding: "5px 10px", borderRadius: 5, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
                        Solicitar Orçamento
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button style={{ padding: "5px 10px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
              <X size={10} /> Dispensar
            </button>
            <button style={{ padding: "5px 10px", borderRadius: 5, background: "#10b98120", border: "1px solid #10b98140", color: "#10b981", cursor: "pointer", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}>
              <Send size={10} /> Solicitar Cotação
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── POEPage ──────────────────────────────────────────────────────────────────

export function POEPage() {
  const [tab, setTab]           = useState<"opportunities" | "quotations" | "analytics" | "rules">("opportunities");
  const [expandedId, setExpanded] = useState<string | null>("o1");
  const [typeFilter, setType]   = useState("all");
  const [statusFilter, setStatus] = useState("all");
  const [search, setSearch]     = useState("");
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const queryClient = useQueryClient();
  const { data: opportunities = [], isLoading } = useQuery<PoeOpportunity[]>({
    queryKey: ["poe-opportunities"],
    queryFn: async () => {
      const response = await fetch("/api/poe/opportunities");
      if (!response.ok) throw new Error("Não foi possível carregar as oportunidades");
      return response.json();
    },
  });
  const { data: quotations = [] } = useQuery<PoeQuotationRequest[]>({
    queryKey: ["poe-quotations"],
    queryFn: async () => {
      const response = await fetch("/api/poe/quotations");
      if (!response.ok) throw new Error("Não foi possível carregar as cotações");
      return response.json();
    },
  });
  const analyze = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/poe/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, notes: projectContext, requirements: projectContext.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Erro ao analisar");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["poe-opportunities"] });
      setShowAnalyzer(false);
      setProjectName("");
      setProjectContext("");
    },
  });

  const filtered = useMemo(() => opportunities.filter(o => {
    if (typeFilter   !== "all" && o.type   !== typeFilter)   return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (q && !o.title.toLowerCase().includes(q) && !(o.category ?? "").toLowerCase().includes(q)) return false;
    return true;
  }), [opportunities, typeFilter, statusFilter, search]);

  const stats = {
    critical: opportunities.filter(o => o.priority >= 9).length,
    total:    opportunities.length,
    ready:    opportunities.filter(o => o.status === "ready").length,
    quotations: quotations.length,
  };
  const categorySummary = useMemo(() => Object.values(opportunities.reduce<Record<string, { label: string; count: number; priority: number }>>((acc, opportunity) => {
    const label = opportunity.category ?? opportunity.environment ?? "Geral";
    const current = acc[label] ?? { label, count: 0, priority: 0 };
    current.count += 1;
    current.priority = Math.max(current.priority, opportunity.priority);
    acc[label] = current;
    return acc;
  }, {})).slice(0, 8), [opportunities]);

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={18} color="#10b981" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>Project Opportunity Engine</h2>
            </div>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Análise de lacunas, riscos, fornecedores e expansão adaptada à vertical</p>
          </div>

          {[
            ["⚡", stats.critical, "críticas"],
            ["🔍", stats.total, "oportunidades"],
            ["✅", stats.ready, "prontas"],
            ["📋", stats.quotations, "cotações"],
          ].map(([e, v, l]) => (
            <div key={l as string} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid #2d2e3a", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: (l === "críticas" && stats.critical > 0) ? "#ef4444" : "#10b981" }}>{e} {v}</p>
              <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{l}</p>
            </div>
          ))}

          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setShowAnalyzer(value => !value)} style={{ padding: "7px 12px", borderRadius: 6, background: "transparent", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <Cpu size={11} /> Analisar Projeto
            </button>
            <button onClick={() => setShowAnalyzer(true)} style={{ padding: "7px 12px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={11} /> Nova Oportunidade
            </button>
          </div>
        </div>

        {/* Banner */}
        <div style={{ marginTop: 10, padding: "6px 12px", borderRadius: 6, background: "#10b98108", border: "1px solid #10b98120", display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={11} color="#10b981" />
          <p style={{ margin: 0, fontSize: 9, color: "#94a3b8" }}>
            <strong style={{ color: "#10b981" }}>Neutralidade técnica garantida.</strong> Toda recomendação é baseada em compatibilidade técnica do projeto.
            Nenhum fabricante é privilegiado por ser parceiro comercial da Vendor.ai.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 12, overflowX: "auto" }}>
          {([
            ["opportunities", "🔍 Oportunidades"],
            ["quotations",    "📋 Cotações"],
            ["analytics",     "📊 Analytics"],
            ["rules",         "⚙️ Regras"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "7px 12px", borderRadius: "6px 6px 0 0", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              background: tab === id ? "#0f1117" : "transparent",
              border: `1px solid ${tab === id ? "#2d2e3a" : "transparent"}`,
              borderBottom: tab === id ? "1px solid #0f1117" : "1px solid #2d2e3a",
              color: tab === id ? "#fff" : "#64748b",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {showAnalyzer && (
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 8, background: "#1a1b23", border: "1px solid #10b98150" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 800, fontSize: 12, color: "#fff" }}>Analisar nova demanda</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Nome do projeto, venda ou operação" style={{ flex: "1 1 220px", padding: 9, borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#fff" }} />
              <textarea value={projectContext} onChange={event => setProjectContext(event.target.value)} placeholder="Descreva o que já está definido: itens, fornecedores, prazos, regiões, ambientes…" rows={3} style={{ flex: "2 1 320px", padding: 9, borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#fff", resize: "vertical" }} />
              <button disabled={!projectName.trim() || analyze.isPending} onClick={() => analyze.mutate()} style={{ alignSelf: "stretch", padding: "9px 16px", borderRadius: 6, border: 0, background: "#10b981", color: "#fff", fontWeight: 800, cursor: "pointer" }}>{analyze.isPending ? "Analisando…" : "Executar análise"}</button>
            </div>
            {analyze.isError && <p style={{ color: "#ef4444", fontSize: 10 }}>{(analyze.error as Error).message}</p>}
          </div>
        )}

        {/* ── OPPORTUNITIES ── */}
        {tab === "opportunities" && (
          <div>
            {/* Filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
                <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar oportunidade…"
                  style={{ width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 6, border: "1px solid #2d2e3a", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
              </div>
              <select value={typeFilter} onChange={e => setType(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 10, outline: "none" }}>
                <option value="all">Todos os tipos</option>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatus(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 10, outline: "none" }}>
                <option value="all">Todos os status</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <span style={{ fontSize: 9, color: "#64748b", alignSelf: "center" }}>{filtered.length} oportunidades</span>
            </div>

            {/* Opportunity Matrix Summary */}
            <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
              {categorySummary.map(({ label, count, priority }) => {
                const c = priority >= 9 ? "#ef4444" : priority >= 7 ? "#f59e0b" : "#10b981";
                return (
                  <div key={label as string} style={{ padding: "8px 10px", borderRadius: 6, background: "#1a1b23", border: `1px solid ${c}30`, textAlign: "center" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = c)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = `${c}30`)}>
                    <p style={{ margin: "0 0 2px", fontSize: 18 }}>🔎</p>
                    <p style={{ margin: "0 0 3px", fontSize: 9, fontWeight: 600, color: "#fff" }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 9, color: c }}>
                      {count} oportunidade{(count as number) !== 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {isLoading ? (
                <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>Carregando oportunidades…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                  <p style={{ fontSize: 32 }}>✅</p><p>Nenhuma oportunidade encontrada com os filtros atuais.</p>
                </div>
              ) : (
                filtered.map(opp => (
                  <OpportunityCard key={opp.id} opp={opp}
                    expanded={expandedId === opp.id}
                    onToggle={() => setExpanded(expandedId === opp.id ? null : opp.id)} />
                ))
              )}
            </div>
          </div>
        )}

        {/* ── QUOTATIONS ── */}
        {tab === "quotations" && (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>FLUXO DE COTAÇÕES</p>

            {/* Flow diagram */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, overflowX: "auto", padding: "10px 0" }}>
              {[["📋","Componentes","Selecionar"],["🏭","Fabricantes","Selecionar"],["📤","Enviar","Solicitação"],
                ["👤","Representante","Routing"],["🏢","Fornecedor","Resposta"],["📊","Comparar","Respostas"],["✅","Escolher","Vencedor"]].map(([e, l, sub], i, arr) => (
                <div key={l as string} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 6, background: "#1a1b23", border: "1px solid #2d2e3a", minWidth: 80 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 16 }}>{e}</p>
                    <p style={{ margin: "0 0 2px", fontSize: 9, fontWeight: 700, color: "#fff" }}>{l}</p>
                    <p style={{ margin: 0, fontSize: 7, color: "#64748b" }}>{sub}</p>
                  </div>
                  {i < arr.length - 1 && <ChevronRight size={14} color="#2d2e3a" />}
                </div>
              ))}
            </div>

            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>COTAÇÕES ABERTAS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {quotations.map(q => (
                <div key={q.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{q.companyName}</p>
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#3b82f615", color: "#3b82f6" }}>
                          {q.status === "sent" ? "📤 Enviada" : q.status === "received" ? "📬 Recebida" : q.status}
                        </span>
                      </div>
                      <p style={{ margin: "0 0 6px", fontSize: 9, color: "#94a3b8" }}>Projeto: {q.projectName}</p>
                      <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#64748b" }}>
                        <span>📦 {q.items.length} item(ns)</span>
                        {q.sentAt && <span>📤 Enviada {new Date(q.sentAt).toLocaleDateString("pt-BR")}</span>}
                        {q.deadline && <span>⏰ Prazo {new Date(q.deadline).toLocaleDateString("pt-BR")}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button style={{ padding: "5px 10px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 9 }}>Ver Detalhe</button>
                    </div>
                  </div>
                </div>
              ))}
              <button style={{ padding: "10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px dashed #2d2e3a", color: "#64748b", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Plus size={12} /> Nova Cotação
              </button>
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === "analytics" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                <p style={{ margin: "0 0 12px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>ANALYTICS PARA PROFISSIONAIS</p>
                {[["Portobello","Revestimentos","⭐ 4.8","94%","15 dias"],
                  ["Lumini","Iluminação","⭐ 4.7","89%","12 dias"],
                  ["Deca","Metais","⭐ 4.9","96%","7 dias"]].map(([n, c, r, apr, lt]) => (
                  <div key={n as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "#0f1117" }}>
                    <div>
                      <p style={{ margin: "0 0 1px", fontSize: 10, fontWeight: 700, color: "#fff" }}>{n}</p>
                      <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{c}</p>
                    </div>
                    <div style={{ display: "flex", gap: 10, fontSize: 8, color: "#94a3b8" }}>
                      <span>{r}</span>
                      <span style={{ color: "#10b981" }}>{apr} aprovação</span>
                      <span>{lt}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                <p style={{ margin: "0 0 12px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>OPORTUNIDADES POR CATEGORIA</p>
                {[["Iluminação",40,"#f59e0b"],["Revestimentos",25,"#10b981"],["Metais",20,"#3b82f6"],["Automação",15,"#8b5cf6"]].map(([cat, pct, color]) => (
                  <div key={cat as string} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 9, width: 80, color: "#94a3b8", textAlign: "right" }}>{cat}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#2d2e3a" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color as string }} />
                    </div>
                    <span style={{ fontSize: 8, color: "#64748b", width: 28 }}>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
              <p style={{ margin: "0 0 12px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>TAXA DE CONVERSÃO POR ETAPA</p>
              <div style={{ display: "flex", alignItems: "center", gap: 0, overflow: "hidden", borderRadius: 6 }}>
                {[["Detectadas","5","100%","#ef4444"],["Analisadas","5","100%","#f59e0b"],
                  ["Prontas","2","40%","#10b981"],["Cotadas","1","20%","#3b82f6"],["Fechadas","0","0%","#8b5cf6"]].map(([label, n, pct, color], i, arr) => (
                  <div key={label as string} style={{ flex: 1, padding: "10px 8px", background: `${color}15`, borderRight: i < arr.length - 1 ? `1px solid ${color}30` : "none", textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 900, color: color as string }}>{n}</p>
                    <p style={{ margin: "0 0 2px", fontSize: 8, color: "#94a3b8" }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 7, color: "#64748b" }}>{pct}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RULES ── */}
        {tab === "rules" && (
          <div>
            <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>MOTOR DE REGRAS — CRITÉRIOS DE RECOMENDAÇÃO</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                ["🔧","Compatibilidade Técnica","Dimensões, normas ABNT, especificações do produto e requisitos do ambiente devem ser compatíveis.","Obrigatório"],
                ["🎨","Compatibilidade Estética","Acabamentos, cores e materiais devem ser coerentes com o DNA estético definido no projeto.","Peso 30%"],
                ["📐","Compatibilidade Dimensional","Produto deve caber no espaço projetado sem necessidade de adaptações estruturais.","Obrigatório"],
                ["💰","Compatibilidade Financeira","Produto deve estar alinhado ao orçamento definido para a categoria no projeto.","Peso 20%"],
                ["📍","Disponibilidade Regional","Fornecedor deve atender a região do projeto em prazo compatível com o cronograma.","Recomendado"],
                ["⏱️","Lead Time","Prazo de entrega deve ser compatível com o cronograma de obra.","Peso 15%"],
                ["🛡️","Neutralidade","Nenhum fabricante é privilegiado por relação comercial com a Vendor.ai.","Inviolável"],
                ["📝","Justificativa Obrigatória","Toda recomendação deve ter justificativa técnica explícita e verificável.","Inviolável"],
              ].map(([e, title, desc, badge]) => (
                <div key={title as string} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{e}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{title}</p>
                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: (badge === "Inviolável") ? "#ef444415" : (badge === "Obrigatório") ? "#f59e0b15" : "#10b98115", color: (badge === "Inviolável") ? "#ef4444" : (badge === "Obrigatório") ? "#f59e0b" : "#10b981" }}>{badge}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
