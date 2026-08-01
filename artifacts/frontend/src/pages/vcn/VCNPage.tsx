// ─── Vendor Certified Network Hub — FASE 22 ──────────────────────────────────
// Rede oficial de fabricantes e parceiros certificados.

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Shield, Star, CheckCircle2, Building2, Package, Bot, Search, Filter,
  ChevronRight, Plus, Award, MapPin, Globe, Phone, FileText, BookOpen,
  Zap, Layers, Lightbulb, Hammer, Settings, TreePine, Truck, Palette,
  Eye, MessageSquare, TrendingUp, BarChart3,
} from "lucide-react";
import { VCN_COMPANY_TYPES, VCN_CERTIFICATION_LEVELS } from "./vcn-types";
import type { VcnCompany, VcnSpecialist, VcnProduct } from "./vcn-types";

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  MANUFACTURER:    <Building2 size={11} />,
  DISTRIBUTOR:     <Truck size={11} />,
  RESELLER:        <Package size={11} />,
  REPRESENTATIVE:  <MessageSquare size={11} />,
  SERVICE_PROVIDER:<Settings size={11} />,
  CABINETRY:       <Layers size={11} />,
  LIGHTING:        <Lightbulb size={11} />,
  STONE:           <Building2 size={11} />,
  FLOORING:        <Layers size={11} />,
  WINDOWS:         <Building2 size={11} />,
  AUTOMATION:      <Zap size={11} />,
  PAINT:           <Palette size={11} />,
  FURNITURE:       <Package size={11} />,
  DECOR:           <Star size={11} />,
  OTHER:           <Globe size={11} />,
};

const TYPE_LABELS: Record<string, string> = {
  MANUFACTURER:    "Fabricante",
  DISTRIBUTOR:     "Distribuidor",
  RESELLER:        "Revendedor",
  REPRESENTATIVE:  "Representante",
  SERVICE_PROVIDER:"Prestador de Serviço",
  CABINETRY:       "Marcenaria",
  LIGHTING:        "Iluminação",
  STONE:           "Marmoraria",
  FLOORING:        "Pisos",
  WINDOWS:         "Esquadrias",
  AUTOMATION:      "Automação",
  PAINT:           "Tintas",
  FURNITURE:       "Mobiliário",
  DECOR:           "Decoração",
  OTHER:           "Outro",
};

const CERT_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  enterprise: { label: "Enterprise", icon: "🏆", color: "#8b5cf6", bg: "#8b5cf620" },
  premium:    { label: "Premium",    icon: "⭐", color: "#f59e0b", bg: "#f59e0b20" },
  certified:  { label: "Certified",  icon: "✅", color: "#10b981", bg: "#10b98120" },
  official:   { label: "Official",   icon: "🏷️", color: "#3b82f6", bg: "#3b82f620" },
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_COMPANIES: VcnCompany[] = [
  {
    id: "v1", type: "MANUFACTURER", legalName: "Portobello S.A.", brandName: "Portobello",
    logoUrl: null, coverUrl: null,
    description: "Fabricante líder em revestimentos cerâmicos de alto padrão. Mais de 40 anos de inovação e design.",
    website: "portobello.com.br", cnpj: null,
    phone: "(47) 2106-0000", email: "especificacao@portobello.com.br",
    city: "Tijucas", state: "SC", country: "BR", address: null,
    segments: ["Revestimentos", "Pisos", "Fachadas"],
    categories: ["Cerâmica", "Porcelanato", "Mármore Técnico", "Fachadas Ventiladas"],
    regions: ["Nacional"], specialties: ["Grandes Formatos", "Slim", "Retificado"],
    tags: ["revestimento", "porcelanato", "premium"],
    languages: ["pt-BR", "en", "es"],
    certificationLevel: "premium", certifications: ["Vendor Premium", "ISO 9001", "LEED", "PBQP-H"],
    verified: true, featured: true, foundedYear: 1977, teamSize: "100+",
    socialMedia: { instagram: "@portobellodesign", linkedin: "portobello-sa" },
    workingHours: { "Seg-Sex": "08:00-18:00" },
    status: "active", productsCount: 847, specificationsCount: 12400,
    quotationsCount: 3200, specialistsCount: 4, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "v2", type: "MANUFACTURER", legalName: "Lumini Iluminação Ltda", brandName: "Lumini",
    logoUrl: null, coverUrl: null,
    description: "Fabricante brasileiro de luminárias e sistemas de iluminação arquitetural. Design premiado internacionalmente.",
    website: "lumini.com.br", cnpj: null,
    phone: "(31) 3344-0000", email: "projetos@lumini.com.br",
    city: "Belo Horizonte", state: "MG", country: "BR", address: null,
    segments: ["Iluminação", "Automação"],
    categories: ["Luminárias Embutidas", "Trilhos", "Spots", "LED", "Externos"],
    regions: ["Nacional", "América do Sul"], specialties: ["Iluminação Arquitetural", "Residencial Premium", "Hotelaria"],
    tags: ["iluminação", "led", "arquitetural"],
    languages: ["pt-BR", "en"],
    certificationLevel: "certified", certifications: ["Vendor Certified", "ISO 14001"],
    verified: true, featured: true, foundedYear: 1989, teamSize: "100+",
    socialMedia: { instagram: "@luminiiluminacao" }, workingHours: {},
    status: "active", productsCount: 234, specificationsCount: 8900,
    quotationsCount: 2100, specialistsCount: 3, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "v3", type: "MANUFACTURER", legalName: "Deca Metais Sanitários Ltda", brandName: "Deca",
    logoUrl: null, coverUrl: null,
    description: "Fabricante de louças, metais e acessórios para banheiros e cozinhas. Referência em qualidade e design.",
    website: "deca.com.br", cnpj: null,
    phone: "(11) 3066-0000", email: "arquitetos@deca.com.br",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Banheiro", "Cozinha", "Área de Serviço"],
    categories: ["Louças Sanitárias", "Metais", "Acessórios", "Duchas", "Torneiras"],
    regions: ["Nacional"], specialties: ["Metais Premium", "Design Contemporâneo", "Sustentabilidade"],
    tags: ["metais", "louças", "banheiro"],
    languages: ["pt-BR"],
    certificationLevel: "enterprise", certifications: ["Vendor Enterprise", "ISO 9001", "ISO 14001"],
    verified: true, featured: true, foundedYear: 1936, teamSize: "100+",
    socialMedia: { instagram: "@decaofc" }, workingHours: {},
    status: "active", productsCount: 1200, specificationsCount: 18700,
    quotationsCount: 5400, specialistsCount: 5, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "v4", type: "MANUFACTURER", legalName: "Gesso Design Sistemas Drywall", brandName: "Gesso Design",
    logoUrl: null, coverUrl: null,
    description: "Fabricante e distribuidor de sistemas construtivos em drywall, gesso e steel frame.",
    website: "gessodesign.com.br", cnpj: null,
    phone: "(11) 5555-0000", email: "projetos@gessodesign.com.br",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Construção Seca", "Forro"],
    categories: ["Drywall", "Gesso", "Steel Frame", "Forros", "Divisórias"],
    regions: ["SP", "RJ", "MG"], specialties: ["Drywall Premium", "Acústica", "Térmica"],
    tags: ["drywall", "gesso", "construção seca"],
    languages: ["pt-BR"],
    certificationLevel: "official", certifications: ["Vendor Official"],
    verified: false, featured: false, foundedYear: 2005, teamSize: "21-100",
    socialMedia: {}, workingHours: {},
    status: "active", productsCount: 89, specificationsCount: 2100,
    quotationsCount: 780, specialistsCount: 2, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "v5", type: "AUTOMATION", legalName: "Lutron Electronics do Brasil", brandName: "Lutron",
    logoUrl: null, coverUrl: null,
    description: "Líder mundial em controle de iluminação e sombreamento motorizado. Tecnologia americana desde 1961.",
    website: "lutron.com", cnpj: null,
    phone: "(11) 3030-0000", email: "specbrasil@lutron.com",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Automação", "Iluminação", "Cortinas"],
    categories: ["Dimmers", "Keypads", "Processadores", "Persianas Motorizadas", "Sistemas"],
    regions: ["Nacional"], specialties: ["Automação Residencial", "Dimmerização", "Persianas"],
    tags: ["lutron", "automação", "dimmer"],
    languages: ["pt-BR", "en"],
    certificationLevel: "enterprise", certifications: ["Vendor Enterprise", "ISO 9001"],
    verified: true, featured: true, foundedYear: 1961, teamSize: "100+",
    socialMedia: { instagram: "@lutronelectronics" }, workingHours: {},
    status: "active", productsCount: 456, specificationsCount: 9800,
    quotationsCount: 2800, specialistsCount: 4, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "v6", type: "MANUFACTURER", legalName: "Volare Janelas e Sistemas", brandName: "Volare",
    logoUrl: null, coverUrl: null,
    description: "Fabricante de esquadrias de alto desempenho: alumínio, PVC e madeira-alumínio.",
    website: "volare.com.br", cnpj: null,
    phone: "(47) 3333-0000", email: "arq@volare.com.br",
    city: "Joinville", state: "SC", country: "BR", address: null,
    segments: ["Esquadrias", "Fachadas"],
    categories: ["Janelas", "Portas", "Fachadas Estruturais", "Alumínio", "PVC"],
    regions: ["Sul", "Sudeste", "Centro-Oeste"], specialties: ["Alta Performance", "Acústica", "Térmica"],
    tags: ["esquadrias", "alumínio", "pvc"],
    languages: ["pt-BR"],
    certificationLevel: "certified", certifications: ["Vendor Certified", "PBE-Edifica"],
    verified: true, featured: false, foundedYear: 1998, teamSize: "21-100",
    socialMedia: {}, workingHours: {},
    status: "active", productsCount: 178, specificationsCount: 4200,
    quotationsCount: 1300, specialistsCount: 2, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const MOCK_SPECIALISTS: VcnSpecialist[] = [
  { id: "s1", companyId: "v1", name: "Especialista Técnico Portobello", specialistType: "TECHNICAL",
    avatarUrl: null, description: "Especialista em especificação técnica de revestimentos cerâmicos e porcelanatos.",
    systemPrompt: null, knowledgeTopics: ["Normas ABNT", "Técnica de Assentamento", "Grandes Formatos", "Manutenção"],
    languages: ["pt-BR"], responseStyle: "professional", agentConfigId: null,
    active: true, featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: "s2", companyId: "v2", name: "Especialista Lumini Projetos", specialistType: "PROJECTS",
    avatarUrl: null, description: "Apoio técnico em projetos luminotécnicos e especificação de luminárias.",
    systemPrompt: null, knowledgeTopics: ["Luminotécnica", "LED", "Eficiência Energética", "Normas"],
    languages: ["pt-BR", "en"], responseStyle: "technical", agentConfigId: null,
    active: true, featured: true, createdAt: new Date(), updatedAt: new Date() },
];

const MOCK_PRODUCTS: VcnProduct[] = [
  { id: "p1", companyId: "v1", name: "Scala Bianco 120x240cm", line: "Scala", model: "SCB120240",
    sku: "SCB120240B", description: "Porcelanato polido premium de grandes formatos. Aspecto mármore bianco.",
    coverUrl: null, imageUrls: [], finishes: ["Polido", "Acetinado"], colors: ["Bianco"],
    materials: ["Porcelanato"], dimensions: { largura: "120cm", altura: "240cm", espessura: "6mm" },
    compatibility: [], relatedSkus: [], specs: { absorção: "<0.1%", resistência: "PEI 5" },
    bimUrls: [], cadUrls: [], pbrUrls: [], textureUrls: [], manualUrls: [], videoUrls: [],
    price: "280.00", priceUnit: "m²", inStock: true, leadTimeDays: 15, warrantyMonths: 60,
    norms: ["NBR 15463", "ISO 10545"], certifications: ["LEED Eligível"],
    specificationsCount: 1240, quotationsCount: 340, viewsCount: 8900,
    published: true, featured: true, category: "Porcelanato", tags: ["grande formato", "mármore", "polido"],
    createdAt: new Date(), updatedAt: new Date() },
];

// ─── Company Card ─────────────────────────────────────────────────────────────

function VCNCompanyCard({ company, onClick }: { company: VcnCompany; onClick: () => void }) {
  const cert = CERT_CONFIG[company.certificationLevel] ?? CERT_CONFIG.official;
  return (
    <div
      onClick={onClick}
      style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 10, padding: 14, cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column", gap: 10 }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#10b981")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2e3a")}
    >
      {/* Cover */}
      <div style={{ height: 52, borderRadius: 6, background: `linear-gradient(135deg, ${cert.bg}, #1e40af15)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, position: "relative" }}>
        {cert.icon}
        <span style={{ position: "absolute", top: 6, right: 6, fontSize: 8, padding: "2px 5px", borderRadius: 3, background: cert.bg, color: cert.color, fontWeight: 800 }}>{cert.label}</span>
      </div>

      {/* Identity */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 12, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {company.brandName ?? company.legalName}
          </p>
          {company.verified && <CheckCircle2 size={11} color="#10b981" />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8" }}>
            {TYPE_ICONS[company.type]} {TYPE_LABELS[company.type]}
          </span>
          {company.city && <span style={{ fontSize: 9, color: "#64748b" }}>· {company.city}, {company.state}</span>}
        </div>
      </div>

      {/* Description */}
      {company.description && (
        <p style={{ margin: 0, fontSize: 9, color: "#94a3b8", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {company.description}
        </p>
      )}

      {/* Categories */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {company.categories.slice(0, 3).map(c => (
          <span key={c} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#10b98115", color: "#10b981", border: "1px solid #10b98130" }}>{c}</span>
        ))}
        {company.categories.length > 3 && <span style={{ fontSize: 8, color: "#64748b" }}>+{company.categories.length - 3}</span>}
      </div>

      {/* Footer stats */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2d2e3a", paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#64748b" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Package size={9} /> {company.productsCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Bot size={9} /> {company.specialistsCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Eye size={9} /> {(company.specificationsCount / 1000).toFixed(1)}k specs</span>
        </div>
        <ChevronRight size={12} color="#10b981" />
      </div>
    </div>
  );
}

// ─── VCNPage ─────────────────────────────────────────────────────────────────

export function VCNPage() {
  const [, navigate] = useLocation();
  const [tab, setTab]        = useState<"directory" | "catalog" | "specialists" | "dashboard">("directory");
  const [search, setSearch]  = useState("");
  const [typeFilter, setType] = useState("all");
  const [certFilter, setCert] = useState("all");

  const filtered = useMemo(() => MOCK_COMPANIES.filter(c => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (certFilter !== "all" && c.certificationLevel !== certFilter) return false;
    const q = search.toLowerCase();
    if (q && !c.legalName.toLowerCase().includes(q) &&
        !(c.brandName ?? "").toLowerCase().includes(q) &&
        !(c.description ?? "").toLowerCase().includes(q)) return false;
    return true;
  }), [search, typeFilter, certFilter]);

  const stats = useMemo(() => ({
    certified:  MOCK_COMPANIES.filter(c => c.verified).length,
    products:   MOCK_COMPANIES.reduce((s, c) => s + c.productsCount, 0),
    specs:      MOCK_COMPANIES.reduce((s, c) => s + c.specificationsCount, 0),
    specialists:MOCK_COMPANIES.reduce((s, c) => s + c.specialistsCount, 0),
  }), []);

  return (
    <div className="vendor-light-module" style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={18} color="#10b981" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>Vendor Certified Network</h2>
            </div>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Rede oficial de fabricantes e parceiros certificados · FASE 22</p>
          </div>
          {[
            ["🏢", MOCK_COMPANIES.length, "empresas"],
            ["✅", stats.certified, "verificadas"],
            ["📦", stats.products.toLocaleString(), "produtos"],
            ["🤖", stats.specialists, "especialistas"],
            ["📋", `${(stats.specs / 1000).toFixed(0)}k`, "especificações"],
          ].map(([e, v, l]) => (
            <div key={l as string} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid #2d2e3a", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#10b981" }}>{e} {v}</p>
              <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{l}</p>
            </div>
          ))}
          <button
            onClick={() => navigate("/vendor-certified-network/new")}
            style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}
          >
            <Plus size={12} /> Cadastrar Empresa
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {([
            ["directory",   "🏢 Diretório"],
            ["catalog",     "📦 Catálogo"],
            ["specialists", "🤖 Especialistas"],
            ["dashboard",   "📊 Dashboard"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "5px 12px", borderRadius: "6px 6px 0 0", fontSize: 10, fontWeight: 700, cursor: "pointer",
              background: tab === id ? "#0f1117" : "transparent",
              border: `1px solid ${tab === id ? "#2d2e3a" : "transparent"}`,
              borderBottom: tab === id ? "1px solid #0f1117" : "1px solid #2d2e3a",
              color: tab === id ? "#fff" : "#64748b",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Filters (directory + catalog tabs) */}
        {(tab === "directory" || tab === "catalog") && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
              <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar fabricante, produto…"
                style={{ width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 6, border: "1px solid #2d2e3a", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
            </div>
            <select value={typeFilter} onChange={e => setType(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 10, outline: "none" }}>
              <option value="all">Todos os tipos</option>
              {VCN_COMPANY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
            </select>
            <select value={certFilter} onChange={e => setCert(e.target.value)}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 10, outline: "none" }}>
              <option value="all">Todas as certificações</option>
              {VCN_CERTIFICATION_LEVELS.map(l => <option key={l} value={l}>{CERT_CONFIG[l]?.label ?? l}</option>)}
            </select>
            <span style={{ fontSize: 9, color: "#64748b", marginLeft: "auto" }}>
              <Filter size={9} /> {filtered.length} empresa{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* ── DIRECTORY ── */}
          {tab === "directory" && (
            filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                <p style={{ fontSize: 32 }}>🏢</p><p>Nenhuma empresa encontrada.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }}>
                {filtered.map(c => <VCNCompanyCard key={c.id} company={c} onClick={() => navigate(`/vendor-certified-network/${c.id}`)} />)}
              </div>
            )
          )}

          {/* ── CATALOG ── */}
          {tab === "catalog" && (
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>PRODUTOS EM DESTAQUE</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10, marginBottom: 24 }}>
                {MOCK_PRODUCTS.map(p => (
                  <div key={p.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ height: 100, background: "linear-gradient(135deg, #10b98120, #1e40af15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                      {p.category === "Porcelanato" ? "🪨" : p.category === "Luminárias" ? "💡" : "📦"}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "#fff" }}>{p.name}</p>
                      {p.sku && <p style={{ margin: "0 0 4px", fontSize: 8, color: "#64748b" }}>SKU: {p.sku}</p>}
                      <p style={{ margin: "0 0 8px", fontSize: 9, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        {p.finishes.map(f => <span key={f} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#10b98115", color: "#10b981" }}>{f}</span>)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748b" }}>
                        <span>{p.price ? `R$ ${p.price}/${p.priceUnit}` : "Sob consulta"}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Eye size={9} /> {p.specificationsCount.toLocaleString()} specs</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>CATEGORIAS</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                {[["🪨","Porcelanato"],["💡","Iluminação"],["🚿","Metais & Louças"],["🪵","Marcenaria"],["🏠","Esquadrias"],["⚡","Automação"],["🎨","Tintas"],["🛋️","Mobiliário"]].map(([e,l]) => (
                  <div key={l as string} style={{ padding: "12px 10px", borderRadius: 7, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#10b981")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2e3a")}>
                    <p style={{ margin: "0 0 4px", fontSize: 20 }}>{e}</p>
                    <p style={{ margin: 0, fontSize: 9, color: "#e2e8f0", fontWeight: 600 }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SPECIALISTS ── */}
          {tab === "specialists" && (
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>ESPECIALISTAS DIGITAIS OFICIAIS</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {MOCK_SPECIALISTS.map(spec => {
                  const company = MOCK_COMPANIES.find(c => c.id === spec.companyId);
                  return (
                    <div key={spec.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: "#10b98120", border: "1px solid #10b98140", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🤖</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{spec.name}</p>
                          <p style={{ margin: 0, fontSize: 9, color: "#10b981" }}>{company?.brandName ?? "Empresa"}</p>
                          <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{spec.specialistType}</p>
                        </div>
                        <button
                          onClick={() => company && navigate(`/vendor-certified-network/${company.id}`)}
                          style={{ padding: "5px 10px", borderRadius: 5, background: "#10b98120", color: "#10b981", border: "1px solid #10b98140", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>
                          Consultar
                        </button>
                      </div>
                      {spec.description && <p style={{ margin: "0 0 8px", fontSize: 9, color: "#94a3b8", lineHeight: 1.4 }}>{spec.description}</p>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {spec.knowledgeTopics.slice(0, 4).map(t => <span key={t} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#10b98115", color: "#10b981" }}>{t}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 20, padding: 16, borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a" }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#fff" }}>🤖 Como funcionam os Especialistas Digitais</p>
                <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                  Cada Especialista Digital Oficial é treinado exclusivamente com o conhecimento oficial da empresa — catálogos, manuais, normas e FAQs.
                  Eles não são vendidos. Existem para apoiar arquitetos, designers e construtoras na <strong style={{ color: "#10b981" }}>especificação técnica correta</strong> dos produtos.
                </p>
              </div>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>ESPECIFICAÇÕES POR CATEGORIA</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[["Porcelanato", 32, "#10b981"],["Iluminação", 24, "#f59e0b"],["Metais", 18, "#3b82f6"],["Automação", 14, "#8b5cf6"],["Outros", 12, "#64748b"]].map(([cat, pct, color]) => (
                    <div key={cat as string} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 9, width: 80, color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>{cat}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#2d2e3a" }}>
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color as string }} />
                      </div>
                      <span style={{ fontSize: 9, color: "#64748b", width: 28 }}>{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>TOP FABRICANTES POR ESPECIFICAÇÃO</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {MOCK_COMPANIES.sort((a, b) => b.specificationsCount - a.specificationsCount).slice(0, 5).map((c, i) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: "#1a1b23", border: "1px solid #2d2e3a", cursor: "pointer" }} onClick={() => navigate(`/vendor-certified-network/${c.id}`)}>
                      <span style={{ fontSize: 11, width: 16, color: "#64748b", textAlign: "center" }}>#{i+1}</span>
                      <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "#fff" }}>{c.brandName ?? c.legalName}</span>
                      <span style={{ fontSize: 9, color: "#10b981" }}>{c.specificationsCount.toLocaleString()} specs</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>VISÃO GERAL</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {[["📦","Produtos cadastrados", stats.products.toLocaleString()],["📋","Especificações totais",`${(stats.specs/1000).toFixed(1)}k`],["🤖","Especialistas IA",stats.specialists],["✅","Empresas verificadas",stats.certified]].map(([e,l,v]) => (
                    <div key={l as string} style={{ padding: 14, borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center" }}>
                      <p style={{ margin: "0 0 4px", fontSize: 22 }}>{e}</p>
                      <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 900, color: "#10b981" }}>{v}</p>
                      <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
