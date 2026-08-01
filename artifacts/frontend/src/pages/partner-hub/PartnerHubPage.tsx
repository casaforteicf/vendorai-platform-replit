// ─── Partner Hub — FASE 20 ────────────────────────────────────────────────────
// Vendor Partner Network: hub central de parceiros comerciais.
// Usado por TODAS as verticais da plataforma.

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Building2, Package, Users, Star, Globe, Phone, Mail, MapPin,
  Plus, Search, Filter, ChevronRight, Verified, Award, ShoppingBag,
  Truck, Wrench, Hammer, Lightbulb, TreePine, Grid3X3,
} from "lucide-react";
import { PARTNER_TYPES, PARTNER_TIERS } from "./vpn-types";
import type { VpnPartner } from "./vpn-types";

// ─── Type icons ──────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  MANUFACTURER:     <Building2 size={14} />,
  DISTRIBUTOR:      <Truck size={14} />,
  RESELLER:         <ShoppingBag size={14} />,
  REPRESENTATIVE:   <Users size={14} />,
  INSTALLER:        <Wrench size={14} />,
  SERVICE_PROVIDER: <Star size={14} />,
  ARCHITECT:        <Grid3X3 size={14} />,
  DESIGNER:         <Lightbulb size={14} />,
  CONSTRUCTOR:      <Hammer size={14} />,
  SUPPLIER:         <Package size={14} />,
  LANDSCAPING:      <TreePine size={14} />,
  LIGHTING:         <Lightbulb size={14} />,
  MARBLE:           <Building2 size={14} />,
  CABINETRY:        <Package size={14} />,
  AUTOMATION:       <Star size={14} />,
  CUSTOM:           <Globe size={14} />,
};

const TYPE_LABELS: Record<string, string> = {
  MANUFACTURER:     "Fabricante",
  DISTRIBUTOR:      "Distribuidor",
  RESELLER:         "Revendedor",
  REPRESENTATIVE:   "Representante",
  INSTALLER:        "Instalador",
  SERVICE_PROVIDER: "Serviço",
  ARCHITECT:        "Arquiteto",
  DESIGNER:         "Designer",
  CONSTRUCTOR:      "Construtora",
  SUPPLIER:         "Fornecedor",
  LANDSCAPING:      "Paisagismo",
  LIGHTING:         "Iluminação",
  MARBLE:           "Mármore/Pedras",
  CABINETRY:        "Marcenaria",
  AUTOMATION:       "Automação",
  CUSTOM:           "Personalizado",
};

const TIER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  enterprise: { label: "Enterprise", color: "#8b5cf6", icon: <Award size={10} /> },
  premium:    { label: "Premium",    color: "#f59e0b", icon: <Star size={10} /> },
  official:   { label: "Official",   color: "#10b981", icon: <Verified size={10} /> },
  verified:   { label: "Verified",   color: "#3b82f6", icon: <Verified size={10} /> },
  basic:      { label: "Basic",      color: "#6b7280", icon: null },
};

// ─── Mock partners (FASE 20 — API conecta na próxima fase) ────────────────────

const MOCK_PARTNERS: VpnPartner[] = [
  {
    id: "p1", name: "Portobello", brand: "Portobello", type: "MANUFACTURER",
    logoUrl: null, description: "Líder em porcelanato e revestimentos cerâmicos premium para ambientes residenciais e comerciais.",
    website: "portobello.com.br", phone: "(11) 4003-0000", email: "comercial@portobello.com.br",
    city: "Tijucas", state: "SC", country: "BR",
    regions: ["SP", "RJ", "SC", "PR", "MG"], segments: ["Revestimentos", "Porcelanato"],
    specialties: ["Grandes Formatos", "Slim", "Texturizados", "Coleções Exclusivas"],
    certifications: ["Vendor Premium", "ISO 9001"], languages: ["pt-BR", "en"],
    tier: "premium", status: "active", featured: true, cnpj: null,
    workingHours: { seg_sex: "08:00-18:00" }, socialMedia: { instagram: "@portobello" },
    tags: ["cerâmica", "porcelanato", "revestimento"],
    totalLeads: 142, totalOrders: 89, createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "p2", name: "Dekton by Cosentino", brand: "Dekton", type: "MANUFACTURER",
    logoUrl: null, description: "Superfície ultracompacta de última geração, ideal para bancadas, pisos e fachadas.",
    website: "cosentino.com", phone: "(11) 3003-0000", email: "brazil@cosentino.com",
    city: "São Paulo", state: "SP", country: "BR",
    regions: ["SP", "RJ", "MG", "RS"], segments: ["Superfícies Ultracompactas"],
    specialties: ["Bancadas", "Pisos Externos", "Fachadas", "Resistência ao Fogo"],
    certifications: ["Vendor Official", "NSF 51"], languages: ["pt-BR", "en", "es"],
    tier: "official", status: "active", featured: true, cnpj: null,
    workingHours: {}, socialMedia: {}, tags: ["ultracompacto", "bancada", "externo"],
    totalLeads: 98, totalOrders: 67, createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "p3", name: "Elgin Iluminação", brand: "Elgin", type: "MANUFACTURER",
    logoUrl: null, description: "Soluções completas em iluminação LED para projetos residenciais e comerciais.",
    website: "elgin.com.br", phone: "(11) 4000-0000", email: "iluminacao@elgin.com.br",
    city: "Hortolândia", state: "SP", country: "BR",
    regions: ["SP", "RJ", "MG", "PR", "SC", "RS", "BA"],
    segments: ["Iluminação", "LED", "Automação"],
    specialties: ["LED Downlight", "Fita LED", "Lustres", "Spots"],
    certifications: ["Vendor Verified", "INMETRO"], languages: ["pt-BR"],
    tier: "verified", status: "active", featured: false, cnpj: null,
    workingHours: {}, socialMedia: {}, tags: ["LED", "iluminação", "downlight"],
    totalLeads: 56, totalOrders: 34, createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "p4", name: "Hettich Brasil", brand: "Hettich", type: "DISTRIBUTOR",
    logoUrl: null, description: "Ferragens e sistemas de movimentação para móveis sob medida e marcenaria.",
    website: "hettich.com/pt", phone: "(11) 4130-0000", email: "contato@hettich.com.br",
    city: "Guarulhos", state: "SP", country: "BR",
    regions: ["SP", "RJ", "MG", "PR"], segments: ["Ferragens", "Marcenaria"],
    specialties: ["Dobradiças", "Trilhos", "Puxadores", "Soft-close"],
    certifications: ["Vendor Verified"], languages: ["pt-BR", "de"],
    tier: "verified", status: "active", featured: false, cnpj: null,
    workingHours: {}, socialMedia: {}, tags: ["ferragens", "marcenaria", "móveis"],
    totalLeads: 78, totalOrders: 45, createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "p5", name: "Lutron Electronics", brand: "Lutron", type: "MANUFACTURER",
    logoUrl: null, description: "Sistemas de automação residencial, controle de iluminação e persianas motorizadas.",
    website: "lutron.com/br", phone: "(11) 3003-0000", email: "br@lutron.com",
    city: "São Paulo", state: "SP", country: "BR",
    regions: ["SP", "RJ", "MG", "DF"],
    segments: ["Automação", "Iluminação Inteligente"],
    specialties: ["Dimmers", "Keypad", "Persianas Motorizadas", "Smart Home"],
    certifications: ["Vendor Enterprise", "CE", "UL"], languages: ["pt-BR", "en"],
    tier: "enterprise", status: "active", featured: true, cnpj: null,
    workingHours: {}, socialMedia: {}, tags: ["automação", "smart home", "dimmer"],
    totalLeads: 203, totalOrders: 112, createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "p6", name: "Pedra Viva Mármores", brand: "Pedra Viva", type: "SUPPLIER",
    logoUrl: null, description: "Mármore, granito e quartzito premium importados diretamente da fonte.",
    website: "pedraviva.com.br", phone: "(31) 3333-0000", email: "vendas@pedraviva.com.br",
    city: "Belo Horizonte", state: "MG", country: "BR",
    regions: ["MG", "SP", "RJ"],
    segments: ["Mármore", "Granito", "Pedras Naturais"],
    specialties: ["Calacatta", "Carrara", "Travertino", "Quartzito"],
    certifications: ["Vendor Verified"], languages: ["pt-BR"],
    tier: "verified", status: "active", featured: false, cnpj: null,
    workingHours: {}, socialMedia: {}, tags: ["mármore", "granito", "pedra natural"],
    totalLeads: 34, totalOrders: 28, createdAt: new Date(), updatedAt: new Date(),
  },
];

// ─── Partner Card ─────────────────────────────────────────────────────────────

function PartnerCard({ partner, onClick }: { partner: VpnPartner; onClick: () => void }) {
  const tier   = TIER_CONFIG[partner.tier] ?? TIER_CONFIG.basic;
  const typeLabel = TYPE_LABELS[partner.type] ?? partner.type;
  const typeIcon  = TYPE_ICONS[partner.type];

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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 8, flexShrink: 0,
          background: "linear-gradient(135deg, #7c3aed20, #a78bfa20)",
          border: "1px solid #7c3aed40", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 20,
        }}>
          {partner.logoUrl ? (
            <img src={partner.logoUrl} alt={partner.brand ?? partner.name} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 6 }} />
          ) : (
            <span style={{ fontSize: 18 }}>🏢</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {partner.brand ?? partner.name}
            </p>
            {partner.featured && <span style={{ fontSize: 10 }}>⭐</span>}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8" }}>
              {typeIcon} {typeLabel}
            </span>
            <span style={{
              display: "flex", alignItems: "center", gap: 2,
              fontSize: 9, padding: "1px 5px", borderRadius: 4,
              background: `${tier.color}20`, color: tier.color, fontWeight: 700,
            }}>
              {tier.icon} {tier.label}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {partner.description && (
        <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {partner.description}
        </p>
      )}

      {/* Specialties */}
      {(partner.specialties as string[]).length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(partner.specialties as string[]).slice(0, 3).map((s: string) => (
            <span key={s} style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "#7c3aed15", color: "#a78bfa", border: "1px solid #7c3aed30" }}>
              {s}
            </span>
          ))}
          {(partner.specialties as string[]).length > 3 && (
            <span style={{ fontSize: 8, color: "#94a3b8" }}>+{(partner.specialties as string[]).length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2d2e3a", paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#94a3b8" }}>
          {partner.city && <span style={{ display: "flex", alignItems: "center", gap: 2 }}><MapPin size={9} /> {partner.city}, {partner.state}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#94a3b8" }}>
          <span>{partner.totalLeads} leads</span>
          <span>{partner.totalOrders} pedidos</span>
          <ChevronRight size={12} color="#7c3aed" />
        </div>
      </div>
    </div>
  );
}

// ─── PartnerHubPage ───────────────────────────────────────────────────────────

export function PartnerHubPage() {
  const [, navigate]   = useLocation();
  const [search,  setSearch]  = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [tab,     setTab]     = useState<"partners" | "marketplace">("partners");

  const filtered = useMemo(() => {
    return MOCK_PARTNERS.filter(p => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (tierFilter !== "all" && p.tier !== tierFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
          !(p.brand ?? "").toLowerCase().includes(search.toLowerCase()) &&
          !(p.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [search, typeFilter, tierFilter]);

  const stats = useMemo(() => ({
    total:      MOCK_PARTNERS.length,
    enterprise: MOCK_PARTNERS.filter(p => p.tier === "enterprise").length,
    premium:    MOCK_PARTNERS.filter(p => p.tier === "premium").length,
    featured:   MOCK_PARTNERS.filter(p => p.featured).length,
  }), []);

  return (
    <div className="vendor-light-module" style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff" }}>🤝 Partner Hub</h2>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Vendor Partner Network · FASE 20 · Todas as verticais</p>
          </div>

          {/* Stats */}
          {[
            ["Parceiros",  stats.total],
            ["Enterprise", stats.enterprise],
            ["Premium",    stats.premium],
            ["Destaque",   stats.featured],
          ].map(([label, value]) => (
            <div key={label as string} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid #2d2e3a", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#a78bfa" }}>{value}</p>
              <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>{label}</p>
            </div>
          ))}

          <button
            onClick={() => navigate("/partner-hub/new")}
            style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}
          >
            <Plus size={12} /> Novo Parceiro
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {([["partners", "🤝 Parceiros"], ["marketplace", "🛍️ Marketplace"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "5px 12px", borderRadius: "6px 6px 0 0", fontSize: 10, fontWeight: 700, cursor: "pointer",
                background: tab === id ? "#0f1117" : "transparent",
                border: `1px solid ${tab === id ? "#2d2e3a" : "transparent"}`,
                borderBottom: tab === id ? "1px solid #0f1117" : "1px solid #2d2e3a",
                color: tab === id ? "#fff" : "#64748b",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Filters bar */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar parceiros…"
              style={{ width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 6, border: "1px solid #2d2e3a", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 11, outline: "none" }}
          >
            <option value="all">Todos os tipos</option>
            {PARTNER_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>

          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid #2d2e3a", background: "#0f1117", color: "#e2e8f0", fontSize: 11, outline: "none" }}
          >
            <option value="all">Todos os tiers</option>
            {PARTNER_TIERS.map(t => (
              <option key={t} value={t}>{TIER_CONFIG[t]?.label ?? t}</option>
            ))}
          </select>

          <span style={{ fontSize: 10, color: "#64748b", marginLeft: "auto" }}>
            <Filter size={10} /> {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── TAB: PARTNERS ── */}
        {tab === "partners" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
                <p style={{ fontSize: 32 }}>🤝</p>
                <p>Nenhum parceiro encontrado com os filtros aplicados.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                {filtered.map(partner => (
                  <PartnerCard
                    key={partner.id}
                    partner={partner}
                    onClick={() => navigate(`/partner-hub/${partner.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: MARKETPLACE ── */}
        {tab === "marketplace" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>CATEGORIAS EM DESTAQUE</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
              {[
                ["🏗️", "Revestimentos"],
                ["💡", "Iluminação"],
                ["🪵", "Marcenaria"],
                ["🪨", "Pedras Naturais"],
                ["🤖", "Automação"],
                ["🚿", "Metais e Louças"],
                ["🌿", "Paisagismo"],
                ["🔧", "Ferragens"],
              ].map(([emoji, label]) => (
                <div
                  key={label}
                  style={{ padding: "14px 10px", borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center", cursor: "pointer" }}
                >
                  <p style={{ margin: "0 0 4px", fontSize: 22 }}>{emoji}</p>
                  <p style={{ margin: 0, fontSize: 10, color: "#e2e8f0", fontWeight: 600 }}>{label}</p>
                </div>
              ))}
            </div>

            <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>PARCEIROS EM DESTAQUE</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {MOCK_PARTNERS.filter(p => p.featured).map(partner => (
                <PartnerCard
                  key={partner.id}
                  partner={partner}
                  onClick={() => navigate(`/partner-hub/${partner.id}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
