// ─── Ecosystem Hub — FASE 21 ──────────────────────────────────────────────────
// Vendor Ecosystem Platform: diretório de todas as empresas do ecossistema.

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Building2, Users, Star, Globe, MapPin, Search, Filter, Plus,
  ChevronRight, Award, Verified, Network, Layers, TrendingUp,
  Home, Hammer, Lightbulb, TreePine, Package, Truck, Settings,
  CheckCircle2, Heart, Eye,
} from "lucide-react";
import { VEP_COMPANY_TYPES, VEP_COMPANY_TIERS } from "./vep-types";
import type { VepCompany, VepPortfolioItem } from "./vep-types";

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  ARCHITECTURE:    <Building2 size={12} />,
  INTERIOR_DESIGN: <Layers size={12} />,
  CONSTRUCTION:    <Hammer size={12} />,
  DEVELOPER:       <Home size={12} />,
  CABINETRY:       <Package size={12} />,
  STONE:           <Building2 size={12} />,
  LIGHTING:        <Lightbulb size={12} />,
  AUTOMATION:      <Settings size={12} />,
  PAINT:           <Package size={12} />,
  FLOORING:        <Layers size={12} />,
  WINDOWS:         <Building2 size={12} />,
  PVC:             <Package size={12} />,
  SUPPLIER:        <Package size={12} />,
  MANUFACTURER:    <Building2 size={12} />,
  DISTRIBUTOR:     <Truck size={12} />,
  SERVICE:         <Star size={12} />,
  CONSULTING:      <TrendingUp size={12} />,
  LANDSCAPING:     <TreePine size={12} />,
  OTHER:           <Globe size={12} />,
};

const TYPE_LABELS: Record<string, string> = {
  ARCHITECTURE:    "Arquitetura",
  INTERIOR_DESIGN: "Design de Interiores",
  CONSTRUCTION:    "Construção",
  DEVELOPER:       "Incorporadora",
  CABINETRY:       "Marcenaria",
  STONE:           "Marmoraria",
  LIGHTING:        "Iluminação",
  AUTOMATION:      "Automação",
  PAINT:           "Pintura",
  FLOORING:        "Pisos",
  WINDOWS:         "Esquadrias",
  PVC:             "PVC",
  SUPPLIER:        "Fornecedor",
  MANUFACTURER:    "Fabricante",
  DISTRIBUTOR:     "Distribuidor",
  SERVICE:         "Serviço",
  CONSULTING:      "Consultoria",
  LANDSCAPING:     "Paisagismo",
  OTHER:           "Outro",
};

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  enterprise: { label: "Enterprise", color: "#8b5cf6" },
  premium:    { label: "Premium",    color: "#f59e0b" },
  certified:  { label: "Certified",  color: "#10b981" },
  verified:   { label: "Verified",   color: "#3b82f6" },
  basic:      { label: "Basic",      color: "#6b7280" },
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_COMPANIES: VepCompany[] = [
  {
    id: "c1", type: "ARCHITECTURE", legalName: "Studio Fernanda Marques Arquitetos", tradeName: "FM Arquitetos",
    logoUrl: null, coverUrl: null,
    description: "Escritório de arquitetura premiado com atuação em projetos residenciais de alto padrão e espaços corporativos.",
    mission: "Criar espaços que transformam a experiência humana.", history: null, website: "fmarquitetos.com.br",
    cnpj: null, phone: "(11) 3063-0000", email: "contato@fmarquitetos.com.br",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Residencial", "Corporativo", "Hotelaria"],
    specialties: ["Arquitetura de Interiores", "Projeto Executivo", "Paisagismo"],
    regions: ["SP", "RJ", "MG"], certifications: ["Vendor Premium", "CAU Ativo"],
    languages: ["pt-BR", "en"], tags: ["luxo", "contemporâneo", "premiado"],
    tier: "premium", foundedYear: 2003, teamSize: "21-100",
    socialMedia: { instagram: "@fmarquitetos", linkedin: "fm-arquitetos" },
    workingHours: {}, status: "active", featured: true, verified: true,
    followersCount: 1240, projectsCount: 87, portfolioCount: 34, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "c2", type: "CABINETRY", legalName: "Madeirama Móveis Planejados Ltda", tradeName: "Madeirama",
    logoUrl: null, coverUrl: null,
    description: "Marcenaria premium especializada em projetos sob medida para arquitetos e construtoras.",
    mission: null, history: null, website: "madeirama.com.br",
    cnpj: null, phone: "(11) 4444-0000", email: "comercial@madeirama.com.br",
    city: "Guarulhos", state: "SP", country: "BR", address: null,
    segments: ["Marcenaria", "Móveis"], specialties: ["Armários", "Cozinhas", "Home Theater", "Closet"],
    regions: ["SP", "ABC Paulista"], certifications: ["Vendor Verified"],
    languages: ["pt-BR"], tags: ["marcenaria", "planejado", "premium"],
    tier: "verified", foundedYear: 2010, teamSize: "21-100",
    socialMedia: { instagram: "@madeirama" }, workingHours: {},
    status: "active", featured: false, verified: true,
    followersCount: 456, projectsCount: 312, portfolioCount: 58, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "c3", type: "STONE", legalName: "Marmoraria Elegance Pedras Naturais Ltda", tradeName: "Elegance Stones",
    logoUrl: null, coverUrl: null,
    description: "Especialistas em mármore, granito e quartzito para projetos de alto padrão.",
    mission: null, history: null, website: "elegancestones.com.br",
    cnpj: null, phone: "(11) 5555-0000", email: "vendas@elegancestones.com.br",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Pedras Naturais", "Mármore"],
    specialties: ["Calacatta", "Carrara", "Quartzito", "Bancadas", "Escadas"],
    regions: ["SP", "RJ"], certifications: ["Vendor Verified"],
    languages: ["pt-BR"], tags: ["mármore", "granito", "quartzito"],
    tier: "verified", foundedYear: 2005, teamSize: "6-20",
    socialMedia: {}, workingHours: {},
    status: "active", featured: false, verified: false,
    followersCount: 234, projectsCount: 189, portfolioCount: 42, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "c4", type: "LIGHTING", legalName: "Luminotécnica Studio de Iluminação", tradeName: "Luminotécnica",
    logoUrl: null, coverUrl: null,
    description: "Consultoria e projeto de iluminação para arquitetura residencial, comercial e hotelaria.",
    mission: null, history: null, website: "luminotecnica.com.br",
    cnpj: null, phone: "(11) 3333-0000", email: "projetos@luminotecnica.com.br",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Iluminação", "Consultoria"], specialties: ["Iluminação Residencial", "Cenografia", "LED", "Automação"],
    regions: ["SP", "RJ", "MG"], certifications: ["Vendor Certified"],
    languages: ["pt-BR", "en"], tags: ["iluminação", "projeto", "led"],
    tier: "certified", foundedYear: 2008, teamSize: "6-20",
    socialMedia: { instagram: "@luminotecnica_studio" }, workingHours: {},
    status: "active", featured: true, verified: true,
    followersCount: 789, projectsCount: 245, portfolioCount: 67, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "c5", type: "CONSTRUCTION", legalName: "Construtora Vitória Empreendimentos", tradeName: "Vitória",
    logoUrl: null, coverUrl: null,
    description: "Construtora com 20 anos de experiência em obras residenciais e comerciais de alto padrão.",
    mission: null, history: null, website: "construtorVitoria.com.br",
    cnpj: null, phone: "(11) 2222-0000", email: "obras@cVitoria.com.br",
    city: "Campinas", state: "SP", country: "BR", address: null,
    segments: ["Construção", "Reforma"], specialties: ["Alto Padrão", "Retrofit", "Industrial"],
    regions: ["Interior SP", "Campinas"], certifications: ["Vendor Verified", "ISO 9001"],
    languages: ["pt-BR"], tags: ["construção", "alto padrão", "retrofit"],
    tier: "verified", foundedYear: 2003, teamSize: "100+",
    socialMedia: {}, workingHours: {},
    status: "active", featured: false, verified: true,
    followersCount: 345, projectsCount: 67, portfolioCount: 23, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "c6", type: "AUTOMATION", legalName: "SmartHome Brasil Automação Residencial", tradeName: "SmartHome BR",
    logoUrl: null, coverUrl: null,
    description: "Projetos e instalação de automação residencial integrada: iluminação, climatização, som e segurança.",
    mission: null, history: null, website: "smarthomebr.com.br",
    cnpj: null, phone: "(11) 6666-0000", email: "projetos@smarthomebr.com.br",
    city: "São Paulo", state: "SP", country: "BR", address: null,
    segments: ["Automação", "Smart Home"],
    specialties: ["Lutron", "Control4", "KNX", "Crestron", "Som Ambiente"],
    regions: ["SP", "RJ", "MG", "DF"], certifications: ["Vendor Premium"],
    languages: ["pt-BR", "en"], tags: ["automação", "smart home", "lutron"],
    tier: "premium", foundedYear: 2012, teamSize: "21-100",
    socialMedia: { instagram: "@smarthomebr" }, workingHours: {},
    status: "active", featured: true, verified: true,
    followersCount: 923, projectsCount: 156, portfolioCount: 48, tenantId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const MOCK_PORTFOLIO: VepPortfolioItem[] = [
  {
    id: "p1", companyId: "c1", type: "PROJECT", title: "Casa Japandi — Moema",
    description: "Residência de 450m² com conceito Japandi, materiais naturais e automação integrada.",
    coverUrl: null, mediaUrls: [], tags: ["Japandi", "Residencial", "Luxo"],
    style: "Japandi", area: 450, year: 2024, city: "São Paulo", state: "SP", partnerIds: ["c2","c3","c6"],
    viewsCount: 3421, likesCount: 289, savesCount: 87, published: true, featured: true, createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "p2", companyId: "c4", type: "PROJECT", title: "Iluminação Hotel Fasano — RJ",
    description: "Projeto completo de iluminação para as suítes e áreas comuns do Hotel Fasano Rio.",
    coverUrl: null, mediaUrls: [], tags: ["Hotelaria", "Luxo", "LED"],
    style: "Contemporâneo", area: 2800, year: 2023, city: "Rio de Janeiro", state: "RJ", partnerIds: [],
    viewsCount: 2140, likesCount: 178, savesCount: 54, published: true, featured: true, createdAt: new Date(), updatedAt: new Date(),
  },
];

// ─── Company Card ─────────────────────────────────────────────────────────────

function CompanyCard({ company, onClick }: { company: VepCompany; onClick: () => void }) {
  const tier = TIER_CONFIG[company.tier] ?? TIER_CONFIG.basic;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 10,
        padding: 16, cursor: "pointer", transition: "border-color 0.15s",
        display: "flex", flexDirection: "column", gap: 10,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#7c3aed")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2e3a")}
    >
      {/* Cover strip */}
      <div style={{ height: 60, borderRadius: 6, background: "linear-gradient(135deg, #7c3aed20, #1e40af20)", marginBottom: 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
        {company.logoUrl ? <img src={company.logoUrl} alt="" style={{ height: 40, objectFit: "contain" }} /> : "🏢"}
      </div>

      {/* Identity */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {company.tradeName ?? company.legalName}
          </p>
          {company.verified && <CheckCircle2 size={12} color="#3b82f6" fill="#3b82f620" />}
          {company.featured  && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8" }}>
            {TYPE_ICONS[company.type]} {TYPE_LABELS[company.type] ?? company.type}
          </span>
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${tier.color}20`, color: tier.color, fontWeight: 700 }}>
            {tier.label}
          </span>
        </div>
      </div>

      {/* Description */}
      {company.description && (
        <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {company.description}
        </p>
      )}

      {/* Specialties */}
      {company.specialties.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {company.specialties.slice(0, 3).map(s => (
            <span key={s} style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "#7c3aed15", color: "#a78bfa", border: "1px solid #7c3aed30" }}>{s}</span>
          ))}
          {company.specialties.length > 3 && <span style={{ fontSize: 8, color: "#64748b" }}>+{company.specialties.length - 3}</span>}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2d2e3a", paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}>
          {company.city && <><MapPin size={9} /> {company.city}, {company.state}</>}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#94a3b8" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Users size={9} /> {company.followersCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Eye size={9} /> {company.portfolioCount}</span>
          <ChevronRight size={12} color="#7c3aed" />
        </div>
      </div>
    </div>
  );
}

// ─── Portfolio Preview Card ───────────────────────────────────────────────────

function PortfolioCard({ item, onClick }: { item: VepPortfolioItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, overflow: "hidden", cursor: "pointer" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#7c3aed")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#2d2e3a")}
    >
      <div style={{ height: 120, background: "linear-gradient(135deg, #1e40af20, #7c3aed20)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
        {item.type === "PROJECT" ? "🏠" : item.type === "RENDER" ? "✨" : "📷"}
      </div>
      <div style={{ padding: "10px 12px" }}>
        <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "#fff" }}>{item.title}</p>
        <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#64748b" }}>
          {item.style && <span>{item.style}</span>}
          {item.area && <span>{item.area}m²</span>}
          {item.year && <span>{item.year}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 9, color: "#94a3b8" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Eye size={9} /> {item.viewsCount.toLocaleString()}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}><Heart size={9} /> {item.likesCount}</span>
        </div>
      </div>
    </div>
  );
}

// ─── EcosystemHubPage ─────────────────────────────────────────────────────────

export function EcosystemHubPage() {
  const [, navigate]   = useLocation();
  const [search,  setSearch]  = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [tab, setTab] = useState<"directory" | "portfolio" | "network" | "smartmatch">("directory");

  const filtered = useMemo(() => MOCK_COMPANIES.filter(c => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (tierFilter !== "all" && c.tier !== tierFilter) return false;
    if (search && !c.legalName.toLowerCase().includes(search.toLowerCase()) &&
        !(c.tradeName ?? "").toLowerCase().includes(search.toLowerCase()) &&
        !(c.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [search, typeFilter, tierFilter]);

  const stats = useMemo(() => ({
    total:     MOCK_COMPANIES.length,
    verified:  MOCK_COMPANIES.filter(c => c.verified).length,
    premium:   MOCK_COMPANIES.filter(c => c.tier === "premium" || c.tier === "enterprise").length,
    portfolio: MOCK_COMPANIES.reduce((s, c) => s + c.portfolioCount, 0),
  }), []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>🌐 Ecosystem Hub</h2>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Vendor Ecosystem Platform · FASE 21 · Cadeia completa da construção</p>
          </div>
          {[["Empresas", stats.total], ["Verificadas", stats.verified], ["Premium+", stats.premium], ["Portfólios", stats.portfolio]].map(([l, v]) => (
            <div key={l as string} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid #2d2e3a", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#a78bfa" }}>{v}</p>
              <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>{l}</p>
            </div>
          ))}
          <button
            onClick={() => navigate("/ecosystem-hub/new")}
            style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}
          >
            <Plus size={12} /> Cadastrar Empresa
          </button>
        </div>

        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {([
            ["directory",  "🏢 Diretório"],
            ["portfolio",  "🖼️ Portfólios"],
            ["network",    "🔗 Business Network"],
            ["smartmatch", "🎯 Smart Match"],
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

        {/* Filters (directory tab) */}
        {tab === "directory" && (
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
              <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresas…"
                style={{ width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 6, border: "1px solid #2d2e3a", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 11, outline: "none" }}>
              <option value="all">Todos os tipos</option>
              {VEP_COMPANY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
            </select>
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 11, outline: "none" }}>
              <option value="all">Todos os tiers</option>
              {VEP_COMPANY_TIERS.map(t => <option key={t} value={t}>{TIER_CONFIG[t]?.label ?? t}</option>)}
            </select>
            <span style={{ fontSize: 10, color: "#64748b", marginLeft: "auto" }}>
              <Filter size={10} /> {filtered.length} empresa{filtered.length !== 1 ? "s" : ""}
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {filtered.map(c => <CompanyCard key={c.id} company={c} onClick={() => navigate(`/ecosystem-hub/${c.id}`)} />)}
              </div>
            )
          )}

          {/* ── PORTFOLIO ── */}
          {tab === "portfolio" && (
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>PORTFÓLIOS EM DESTAQUE ({MOCK_PORTFOLIO.length})</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {MOCK_PORTFOLIO.map(item => (
                  <PortfolioCard key={item.id} item={item} onClick={() => navigate(`/ecosystem-hub/${item.companyId}`)} />
                ))}
              </div>
              <p style={{ marginTop: 20, fontSize: 11, fontWeight: 700, color: "#64748b" }}>CATEGORIAS</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginTop: 10 }}>
                {[["🏠","Projetos Residenciais"],["🏢","Projetos Comerciais"],["✨","Renders 3D"],["🪵","Marcenaria"],["🪨","Pedras Naturais"],["💡","Iluminação"]].map(([e, l]) => (
                  <div key={l as string} style={{ padding: "12px 10px", borderRadius: 7, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center", cursor: "pointer" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 20 }}>{e}</p>
                    <p style={{ margin: 0, fontSize: 9, color: "#e2e8f0", fontWeight: 600 }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BUSINESS NETWORK ── */}
          {tab === "network" && (
            <div style={{ maxWidth: 700 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                {[["🏢", "Empresas conectadas", "47"],["🤝", "Parcerias ativas", "12"],["⭐", "Recomendações", "89"]].map(([e, l, v]) => (
                  <div key={l as string} style={{ padding: 16, borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 28 }}>{e}</p>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#a78bfa" }}>{v}</p>
                    <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>{l}</p>
                  </div>
                ))}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>SUGESTÕES DE CONEXÃO</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {MOCK_COMPANIES.filter(c => !c.featured).map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#7c3aed20", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏢</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{c.tradeName ?? c.legalName}</p>
                      <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>{TYPE_LABELS[c.type]} · {c.city}, {c.state}</p>
                    </div>
                    <button style={{ padding: "5px 10px", borderRadius: 5, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 9, fontWeight: 700 }}>+ Conectar</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SMART MATCH ── */}
          {tab === "smartmatch" && (
            <div style={{ maxWidth: 640 }}>
              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: "#7c3aed20", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎯</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#fff" }}>Smart Match Engine</p>
                    <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>Recomendações inteligentes baseadas no projeto</p>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "#fbbf2420", color: "#fbbf24" }}>FASE 22</span>
                </div>
                <p style={{ margin: "0 0 14px", fontSize: 10, color: "#94a3b8" }}>
                  Informe o estilo e segmentos do projeto para receber recomendações dos melhores parceiros do ecossistema.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input placeholder="Estilo do projeto (ex: Japandi, Minimalista…)" style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#fff", fontSize: 11, outline: "none" }} />
                  <button style={{ padding: "8px 16px", borderRadius: 6, background: "#7c3aed40", color: "#a78bfa", border: "1px solid #7c3aed", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>🎯 Match</button>
                </div>
              </div>

              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>EXEMPLO — Projeto Japandi</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { segment: "Marcenaria",    company: "Madeirama", match: 97 },
                  { segment: "Iluminação",    company: "Luminotécnica Studio", match: 94 },
                  { segment: "Automação",     company: "SmartHome BR", match: 91 },
                  { segment: "Marmoraria",    company: "Elegance Stones", match: 88 },
                ].map(({ segment, company, match }) => (
                  <div key={segment} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>{segment}</p>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{company}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#10b981" }}>{match}%</p>
                      <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>match</p>
                    </div>
                    <div style={{ width: 60, height: 4, borderRadius: 2, background: "#2d2e3a", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${match}%`, background: "#10b981", borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
