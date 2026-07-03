// ─── Company Detail — FASE 21 ─────────────────────────────────────────────────
// Perfil completo de uma empresa no Vendor Ecosystem Platform.

import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Globe, Phone, Mail, MapPin, ExternalLink,
  Star, Award, CheckCircle2, Users, Eye, Heart, Building2,
  MessageSquare, Plus, Layers, Package, Bot, BarChart3,
  Instagram, Linkedin, Youtube,
} from "lucide-react";
import type { VepCompany, VepProfessional, VepPortfolioItem } from "./vep-types";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_COMPANY: VepCompany = {
  id: "c1", type: "ARCHITECTURE", legalName: "Studio Fernanda Marques Arquitetos Associados",
  tradeName: "FM Arquitetos", logoUrl: null, coverUrl: null,
  description: "Escritório de arquitetura premiado com mais de 20 anos de experiência, atuando em projetos residenciais de alto padrão, espaços corporativos e hotelaria. Reconhecido pelos prêmios ASBEA e Casa Vogue.",
  mission: "Criar espaços que transformam a experiência humana através do design intencional e do uso consciente dos materiais.",
  history: "Fundado em 2003 pela arquiteta Fernanda Marques, o escritório conquistou reconhecimento nacional e internacional com projetos que aliam estética contemporânea à funcionalidade.",
  website: "fmarquitetos.com.br", cnpj: "12.345.678/0001-90",
  phone: "(11) 3063-0000", email: "contato@fmarquitetos.com.br",
  city: "São Paulo", state: "SP", country: "BR", address: "Av. Europa, 1234 — Jardim Europa",
  segments: ["Residencial", "Corporativo", "Hotelaria", "Varejo"],
  specialties: ["Arquitetura de Interiores", "Projeto Executivo", "Paisagismo", "Identidade Visual de Espaços"],
  regions: ["SP", "RJ", "MG", "RS"],
  certifications: ["Vendor Premium", "CAU/SP Ativo", "ASBEA", "Green Building"],
  languages: ["pt-BR", "en", "es"],
  tags: ["luxo", "contemporâneo", "premiado", "sustentável"],
  tier: "premium", foundedYear: 2003, teamSize: "21-100",
  socialMedia: { instagram: "@fernandamarquesarq", linkedin: "fm-arquitetos", youtube: "FMArquitetos" },
  workingHours: { "Seg-Sex": "09:00-18:00" },
  status: "active", featured: true, verified: true,
  followersCount: 1240, projectsCount: 87, portfolioCount: 34, tenantId: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_TEAM: VepProfessional[] = [
  { id: "pr1", companyId: "c1", name: "Fernanda Marques", role: "ARCHITECT", title: "Arquiteta Sócia-Fundadora",
    bio: "Graduada pela FAU-USP, Mestre em Design de Interiores pela Parsons School (NY). Professora convidada da FUPAM.",
    avatarUrl: null, email: "fernanda@fmarquitetos.com.br", phone: null, linkedin: "@fernandamarquesarq", instagram: null,
    specialties: ["Arquitetura de Luxo", "Projeto de Interiores", "Paisagismo"],
    regions: ["SP", "RJ"], languages: ["pt-BR", "en"],
    registerNumber: "A-12345", registerType: "CAU", userId: null,
    active: true, featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: "pr2", companyId: "c1", name: "Ricardo Costa", role: "ARCHITECT", title: "Arquiteto Sócio",
    bio: "Especialista em projetos corporativos e hotelaria de alto padrão. Responsável pelos projetos em MG e RJ.",
    avatarUrl: null, email: "ricardo@fmarquitetos.com.br", phone: null, linkedin: null, instagram: null,
    specialties: ["Hotelaria", "Corporativo"], regions: ["RJ", "MG"], languages: ["pt-BR"],
    registerNumber: "A-67890", registerType: "CAU", userId: null,
    active: true, featured: false, createdAt: new Date(), updatedAt: new Date() },
];

const MOCK_PORTFOLIO: VepPortfolioItem[] = [
  { id: "p1", companyId: "c1", type: "PROJECT", title: "Casa Japandi — Moema",
    description: "Residência de 450m² com conceito Japandi. Materiais naturais, paleta neutra e automação integrada Lutron.",
    coverUrl: null, mediaUrls: [], tags: ["Japandi", "Residencial", "Luxo"],
    style: "Japandi", area: 450, year: 2024, city: "São Paulo", state: "SP",
    partnerIds: ["c2","c3","c6"], viewsCount: 3421, likesCount: 289, savesCount: 87,
    published: true, featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: "p2", companyId: "c1", type: "PROJECT", title: "Penthouse Contemporânea — Itaim",
    description: "Apartamento duplex de 380m² com terraço. Design contemporâneo com elementos artesanais brasileiros.",
    coverUrl: null, mediaUrls: [], tags: ["Contemporâneo", "Residencial", "Duplex"],
    style: "Contemporâneo", area: 380, year: 2023, city: "São Paulo", state: "SP",
    partnerIds: [], viewsCount: 2180, likesCount: 198, savesCount: 62,
    published: true, featured: false, createdAt: new Date(), updatedAt: new Date() },
  { id: "p3", companyId: "c1", type: "PROJECT", title: "Boutique Hotel — Trancoso",
    description: "Hotel boutique de 12 suítes em Trancoso com identidade cultural baiana contemporânea.",
    coverUrl: null, mediaUrls: [], tags: ["Hotelaria", "Trancoso", "Luxo"],
    style: "Tropical Contemporâneo", area: 1200, year: 2023, city: "Trancoso", state: "BA",
    partnerIds: [], viewsCount: 4560, likesCount: 412, savesCount: 134,
    published: true, featured: true, createdAt: new Date(), updatedAt: new Date() },
];

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  enterprise: { label: "Enterprise", color: "#8b5cf6" },
  premium:    { label: "Premium",    color: "#f59e0b" },
  certified:  { label: "Certified",  color: "#10b981" },
  verified:   { label: "Verified",   color: "#3b82f6" },
  basic:      { label: "Basic",      color: "#6b7280" },
};

// ─── CompanyDetailPage ────────────────────────────────────────────────────────

export function CompanyDetailPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"profile" | "portfolio" | "team" | "network" | "ai" | "analytics">("profile");

  const company = MOCK_COMPANY;
  const tier    = TIER_CONFIG[company.tier] ?? TIER_CONFIG.basic;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => navigate("/ecosystem-hub")} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <ArrowLeft size={14} /> Ecosystem Hub
          </button>
          <span style={{ color: "#2d2e3a" }}>/</span>
          <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{company.tradeName ?? company.legalName}</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: "linear-gradient(135deg, #7c3aed20, #1e40af20)", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>🏢</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#fff" }}>{company.tradeName ?? company.legalName}</h2>
              {company.verified && <CheckCircle2 size={14} color="#3b82f6" />}
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${tier.color}20`, color: tier.color, fontWeight: 700 }}>{tier.label}</span>
              {company.featured && <Star size={12} color="#f59e0b" fill="#f59e0b" />}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
              {company.city && <span style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><MapPin size={10} /> {company.city}, {company.state}</span>}
              {company.email && <span style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><Mail size={10} /> {company.email}</span>}
              {company.foundedYear && <span style={{ fontSize: 10, color: "#64748b" }}>Est. {company.foundedYear}</span>}
              {company.teamSize && <span style={{ fontSize: 10, color: "#64748b" }}>{company.teamSize} pessoas</span>}
              {company.website && (
                <a href={`https://${company.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#7c3aed", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                  <Globe size={10} /> {company.website} <ExternalLink size={8} />
                </a>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "transparent", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <Users size={11} /> + Conectar
            </button>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "transparent", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <MessageSquare size={11} /> Chat IA
            </button>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
              Contatar
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
          {[["👥", company.followersCount, "seguidores"], ["🏗️", company.projectsCount, "projetos"], ["🖼️", company.portfolioCount, "portfólio"]].map(([e, v, l]) => (
            <div key={l as string} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
              <span>{e}</span>
              <span style={{ fontWeight: 700, color: "#a78bfa" }}>{v}</span>
              <span style={{ color: "#64748b" }}>{l}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {company.socialMedia.instagram && (
              <a href={`https://instagram.com/${company.socialMedia.instagram.replace("@","")}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8", textDecoration: "none" }}>
                <Instagram size={11} /> {company.socialMedia.instagram}
              </a>
            )}
            {company.socialMedia.linkedin && (
              <a href={`https://linkedin.com/company/${company.socialMedia.linkedin}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8", textDecoration: "none" }}>
                <Linkedin size={11} /> LinkedIn
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {([
            ["profile",   "👤 Perfil"],
            ["portfolio", "🖼️ Portfólio"],
            ["team",      "👥 Equipe"],
            ["network",   "🔗 Rede"],
            ["ai",        "🤖 AI Agent"],
            ["analytics", "📊 Analytics"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "5px 10px", borderRadius: "6px 6px 0 0", fontSize: 10, fontWeight: 700, cursor: "pointer",
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

        {/* ── PROFILE ── */}
        {tab === "profile" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Section title="SOBRE">
                <p style={{ margin: 0, fontSize: 11, color: "#e2e8f0", lineHeight: 1.7 }}>{company.description}</p>
                {company.mission && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 6, background: "#7c3aed15", border: "1px solid #7c3aed30" }}>
                    <p style={{ margin: "0 0 3px", fontSize: 9, fontWeight: 700, color: "#7c3aed" }}>MISSÃO</p>
                    <p style={{ margin: 0, fontSize: 10, color: "#e2e8f0", fontStyle: "italic" }}>{company.mission}</p>
                  </div>
                )}
              </Section>

              <Section title="ESPECIALIDADES">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {company.specialties.map(s => (
                    <span key={s} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "#7c3aed15", color: "#a78bfa", border: "1px solid #7c3aed30" }}>{s}</span>
                  ))}
                </div>
              </Section>

              <Section title="REGIÕES DE ATUAÇÃO">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {company.regions.map(r => (
                    <span key={r} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#e2e8f0", border: "1px solid #2d2e3a" }}>{r}</span>
                  ))}
                </div>
              </Section>

              <Section title="SEGMENTOS">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {company.segments.map(s => (
                    <span key={s} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid #2d2e3a" }}>{s}</span>
                  ))}
                </div>
              </Section>

              <Section title="CERTIFICAÇÕES">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {company.certifications.map(c => (
                    <span key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "#10b98120", color: "#10b981", border: "1px solid #10b98130" }}>
                      <Award size={10} /> {c}
                    </span>
                  ))}
                </div>
              </Section>
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Section title="CONTATO">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {company.phone   && <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><Phone size={11} color="#64748b" /> {company.phone}</span>}
                  {company.email   && <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><Mail size={11} color="#64748b" /> {company.email}</span>}
                  {company.address && <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={11} color="#64748b" /> {company.address}</span>}
                  {company.website && <a href={`https://${company.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6, color: "#7c3aed", textDecoration: "none" }}><Globe size={11} /> {company.website}</a>}
                </div>
              </Section>

              <Section title="HORÁRIO">
                {Object.entries(company.workingHours).map(([d, h]) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                    <span style={{ color: "#94a3b8" }}>{d}</span>
                    <span style={{ color: "#e2e8f0" }}>{h}</span>
                  </div>
                ))}
              </Section>

              <Section title="IDIOMAS">
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {company.languages.map(l => <span key={l} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.05)", color: "#94a3b8", border: "1px solid #2d2e3a" }}>{l}</span>)}
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab === "portfolio" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#64748b" }}>PORTFÓLIO ({MOCK_PORTFOLIO.length} projetos)</p>
              <button style={{ padding: "6px 12px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={11} /> Publicar Projeto
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {MOCK_PORTFOLIO.map(item => (
                <div key={item.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ height: 140, background: "linear-gradient(135deg, #1e40af20, #7c3aed20)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, position: "relative" }}>
                    🏠
                    {item.featured && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 14 }}>⭐</span>}
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#fff" }}>{item.title}</p>
                    <p style={{ margin: "0 0 8px", fontSize: 9, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</p>
                    <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#64748b", marginBottom: 8 }}>
                      {item.style && <span>{item.style}</span>}
                      {item.area  && <span>{item.area}m²</span>}
                      {item.year  && <span>{item.year}</span>}
                      {item.city  && <span>{item.city}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#94a3b8" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Eye size={9} /> {item.viewsCount.toLocaleString()}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Heart size={9} /> {item.likesCount}</span>
                      {item.partnerIds.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Building2 size={9} /> {item.partnerIds.length} parceiros</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TEAM ── */}
        {tab === "team" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#64748b" }}>EQUIPE ({MOCK_TEAM.length} profissionais)</p>
              <button style={{ padding: "6px 12px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={11} /> Adicionar Profissional
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {MOCK_TEAM.map(prof => (
                <div key={prof.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#7c3aed20", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {prof.featured ? "⭐" : "👤"}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>{prof.name}</p>
                      <p style={{ margin: 0, fontSize: 9, color: "#7c3aed" }}>{prof.title}</p>
                      {prof.registerNumber && <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{prof.registerType}: {prof.registerNumber}</p>}
                    </div>
                  </div>
                  {prof.bio && <p style={{ margin: "0 0 8px", fontSize: 9, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{prof.bio}</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {prof.specialties.slice(0, 3).map(s => <span key={s} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#7c3aed15", color: "#a78bfa" }}>{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── NETWORK ── */}
        {tab === "network" && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[["🏢","Conexões","34"],["🤝","Parcerias","8"],["⭐","Avaliações","47"]].map(([e,l,v]) => (
                <div key={l as string} style={{ padding: 14, borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center" }}>
                  <p style={{ margin: "0 0 2px", fontSize: 24 }}>{e}</p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#a78bfa" }}>{v}</p>
                  <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>{l}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b" }}>PARCEIROS COLABORADORES</p>
            <p style={{ margin: 0, fontSize: 10, color: "#64748b", fontStyle: "italic" }}>Carregando rede de parceiros…</p>
          </div>
        )}

        {/* ── AI AGENT ── */}
        {tab === "ai" && (
          <div style={{ maxWidth: 600 }}>
            <Section title="AGENTE IA DA EMPRESA">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, background: "#7c3aed20", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🤖</div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>Agente {company.tradeName}</p>
                  <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>Responde sobre projetos, equipe, especialidades e portfólio</p>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "#fbbf2420", color: "#fbbf24" }}>FASE 22</span>
              </div>
              <div style={{ background: "#0f1117", borderRadius: 6, padding: 12, border: "1px solid #2d2e3a", marginBottom: 10 }}>
                <p style={{ margin: "0 0 6px", fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
                  "Quais materiais vocês recomendam para um projeto Japandi de alto padrão?"
                </p>
                <div style={{ padding: "8px 10px", borderRadius: 4, background: "#1a1b23", fontSize: 10, color: "#e2e8f0", lineHeight: 1.5 }}>
                  🤖 Para um projeto Japandi de alto padrão, trabalhamos tipicamente com: <strong>madeiras naturais</strong> (freijó, nogueira), <strong>pedras naturais</strong> (quartzito, ardósia), <strong>cimento queimado</strong> e <strong>porcelanato de grandes formatos</strong> com acabamento natural. Posso compartilhar cases com essas combinações?
                </div>
              </div>
              <button style={{ width: "100%", padding: "8px", borderRadius: 6, background: "#7c3aed40", color: "#a78bfa", border: "1px solid #7c3aed", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                🤖 Abrir Chat com Agente (em breve)
              </button>
            </Section>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === "analytics" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {[
              ["Seguidores",    company.followersCount,  "no ecossistema"],
              ["Projetos",      company.projectsCount,   "entregues"],
              ["Portfólio",     company.portfolioCount,  "publicações"],
              ["Visualizações", "12.4k",                 "no portfólio"],
              ["Likes",         "899",                   "em projetos"],
              ["Saves",         "283",                   "itens salvos"],
            ].map(([label, value, sub]) => (
              <div key={label as string} style={{ padding: 14, borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center" }}>
                <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#a78bfa" }}>{value}</p>
                <p style={{ margin: 0, fontSize: 9, color: "#e2e8f0", fontWeight: 600 }}>{label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 8, color: "#64748b" }}>{sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
      <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>{title}</p>
      {children}
    </div>
  );
}
