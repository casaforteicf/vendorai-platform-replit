// ─── VCN Company Detail — FASE 22 ────────────────────────────────────────────
// Perfil completo de empresa certificada: especialistas, catálogo, knowledge base.

import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Globe, Phone, Mail, MapPin, ExternalLink, Shield, CheckCircle2,
  Star, Package, Bot, FileText, BarChart3, Download, Plus, Award,
  BookOpen, Video, Image, FileSpreadsheet, Zap, ChevronRight, Eye, Search,
  MessageSquare, TrendingUp, Layers, Lightbulb,
} from "lucide-react";
import type { VcnCompany, VcnSpecialist, VcnProduct, VcnKnowledgeDoc } from "./vcn-types";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_COMPANY: VcnCompany = {
  id: "v1", type: "MANUFACTURER", legalName: "Portobello S.A.", brandName: "Portobello",
  logoUrl: null, coverUrl: null,
  description: "Fabricante líder em revestimentos cerâmicos de alto padrão. Mais de 40 anos de inovação e design, com reconhecimento internacional e presença em mais de 60 países.",
  website: "portobello.com.br", cnpj: "83.475.913/0001-72",
  phone: "(47) 2106-0000", email: "especificacao@portobello.com.br",
  city: "Tijucas", state: "SC", country: "BR", address: "Rod. BR-101, km 163 — Tijucas, SC",
  segments: ["Revestimentos", "Pisos", "Fachadas", "Outdoor"],
  categories: ["Cerâmica", "Porcelanato", "Mármore Técnico", "Fachadas Ventiladas", "Slim"],
  regions: ["Nacional"], specialties: ["Grandes Formatos", "Slim", "Retificado", "Retro"],
  tags: ["revestimento", "porcelanato", "premium"],
  languages: ["pt-BR", "en", "es"],
  certificationLevel: "premium", certifications: ["Vendor Premium", "ISO 9001", "LEED", "PBQP-H", "Empresa B"],
  verified: true, featured: true, foundedYear: 1977, teamSize: "100+",
  socialMedia: { instagram: "@portobellodesign", linkedin: "portobello-sa", youtube: "PortobelloDesign" },
  workingHours: { "Seg-Sex": "08:00-18:00", "Sáb": "08:00-12:00" },
  status: "active", productsCount: 847, specificationsCount: 12400,
  quotationsCount: 3200, specialistsCount: 4, tenantId: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_SPECIALISTS: VcnSpecialist[] = [
  { id: "s1", companyId: "v1", name: "Especificação Técnica", specialistType: "TECHNICAL",
    avatarUrl: null, description: "Especialista em normas técnicas, especificação de produtos, dimensionamento e assentamento de revestimentos cerâmicos e porcelanatos.",
    systemPrompt: null, knowledgeTopics: ["Normas ABNT NBR 15463", "Técnicas de Assentamento", "Grandes Formatos", "Manutenção e Limpeza", "Argamassa e Rejunte"],
    languages: ["pt-BR", "en"], responseStyle: "technical", agentConfigId: null,
    active: true, featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: "s2", companyId: "v1", name: "Projetos e Ambientação", specialistType: "PROJECTS",
    avatarUrl: null, description: "Apoio em projetos de design, combinações de coleções, harmonização de ambientes e especificação para diferentes estilos.",
    systemPrompt: null, knowledgeTopics: ["Harmonização de Ambientes", "Estilos de Design", "Coleções Portobello", "Paleta de Cores"],
    languages: ["pt-BR"], responseStyle: "creative", agentConfigId: null,
    active: true, featured: false, createdAt: new Date(), updatedAt: new Date() },
  { id: "s3", companyId: "v1", name: "Suporte Comercial", specialistType: "COMMERCIAL",
    avatarUrl: null, description: "Informações sobre disponibilidade, representantes, revendas autorizadas e processos de cotação.",
    systemPrompt: null, knowledgeTopics: ["Rede de Revendas", "Representantes Regionais", "Prazos de Entrega", "Condições Comerciais"],
    languages: ["pt-BR"], responseStyle: "professional", agentConfigId: null,
    active: true, featured: false, createdAt: new Date(), updatedAt: new Date() },
  { id: "s4", companyId: "v1", name: "Garantia e Pós-venda", specialistType: "WARRANTY",
    avatarUrl: null, description: "Orientações sobre garantia dos produtos, laudos técnicos, processos de reclamação e suporte pós-obra.",
    systemPrompt: null, knowledgeTopics: ["Política de Garantia", "Laudos Técnicos", "Reclamações", "Manutenção Pós-obra"],
    languages: ["pt-BR"], responseStyle: "formal", agentConfigId: null,
    active: true, featured: false, createdAt: new Date(), updatedAt: new Date() },
];

const MOCK_PRODUCTS: VcnProduct[] = [
  { id: "p1", companyId: "v1", name: "Scala Bianco 120×240cm", line: "Scala", model: "SCB120240", sku: "SCB120240B",
    description: "Porcelanato polido premium de grandes formatos com aspecto de mármore bianco natural.",
    coverUrl: null, imageUrls: [], finishes: ["Polido", "Acetinado"], colors: ["Bianco"],
    materials: ["Porcelanato"], dimensions: { largura: "120cm", comprimento: "240cm", espessura: "6mm" },
    compatibility: [], relatedSkus: ["SCB120120B", "SCB060120B"], specs: { absorção: "<0.1%", resistência: "PEI 5", retificado: "Sim" },
    bimUrls: ["/bim/scala-bianco.rfa"], cadUrls: [], pbrUrls: ["/pbr/scala-bianco.zip"], textureUrls: [], manualUrls: [], videoUrls: [],
    price: "280.00", priceUnit: "m²", inStock: true, leadTimeDays: 15, warrantyMonths: 60,
    norms: ["NBR 15463", "ISO 10545-3", "ISO 10545-4"], certifications: ["LEED Eligível", "GreenGuard"],
    specificationsCount: 1240, quotationsCount: 340, viewsCount: 8900,
    published: true, featured: true, category: "Porcelanato", tags: ["grande formato", "mármore", "polido"],
    createdAt: new Date(), updatedAt: new Date() },
  { id: "p2", companyId: "v1", name: "Cement Concrete 60×60cm", line: "Cement", model: "CMC060060", sku: "CMC060060G",
    description: "Cerâmica de superfície cimentícia com efeito concreto. Ideal para projetos industriais e contemporâneos.",
    coverUrl: null, imageUrls: [], finishes: ["Natural", "Polido"], colors: ["Concrete", "Warm Concrete"],
    materials: ["Cerâmica"], dimensions: { largura: "60cm", comprimento: "60cm", espessura: "8mm" },
    compatibility: [], relatedSkus: [], specs: { absorção: "3-6%", resistência: "PEI 4", retificado: "Sim" },
    bimUrls: [], cadUrls: [], pbrUrls: [], textureUrls: [], manualUrls: [], videoUrls: [],
    price: "89.90", priceUnit: "m²", inStock: true, leadTimeDays: 7, warrantyMonths: 36,
    norms: ["NBR 15463"], certifications: [],
    specificationsCount: 890, quotationsCount: 220, viewsCount: 5600,
    published: true, featured: false, category: "Cerâmica", tags: ["concreto", "industrial", "contemporâneo"],
    createdAt: new Date(), updatedAt: new Date() },
];

const MOCK_KNOWLEDGE: VcnKnowledgeDoc[] = [
  { id: "k1", companyId: "v1", type: "CATALOG", title: "Catálogo Completo 2024 — Portobello",
    description: "Catálogo geral com todas as coleções, especificações técnicas e paletas de cores.",
    fileUrl: "/docs/portobello-catalogo-2024.pdf", fileSize: 45000000, mimeType: "application/pdf",
    productSkus: [], tags: ["catálogo", "2024", "completo"],
    indexed: true, indexedAt: new Date(), chunkCount: 342,
    published: true, language: "pt-BR", version: "2024.1",
    createdAt: new Date(), updatedAt: new Date() },
  { id: "k2", companyId: "v1", type: "MANUAL", title: "Manual de Assentamento de Grandes Formatos",
    description: "Guia técnico completo para assentamento de porcelanatos de grandes formatos (acima de 90×90cm).",
    fileUrl: "/docs/manual-assentamento-gf.pdf", fileSize: 8500000, mimeType: "application/pdf",
    productSkus: ["SCB120240B"], tags: ["assentamento", "grandes formatos", "técnico"],
    indexed: true, indexedAt: new Date(), chunkCount: 89,
    published: true, language: "pt-BR", version: "2.1",
    createdAt: new Date(), updatedAt: new Date() },
  { id: "k3", companyId: "v1", type: "BIM", title: "Biblioteca BIM — Coleção Scala",
    description: "Família Revit para a coleção Scala. Inclui todas as dimensões e acabamentos disponíveis.",
    fileUrl: "/bim/portobello-scala.rfa", fileSize: 12000000, mimeType: "application/octet-stream",
    productSkus: ["SCB120240B", "SCB120120B"], tags: ["BIM", "Revit", "Scala"],
    indexed: false, indexedAt: null, chunkCount: null,
    published: true, language: "pt-BR", version: null,
    createdAt: new Date(), updatedAt: new Date() },
  { id: "k4", companyId: "v1", type: "NORM", title: "NBR 15463 — Placas Cerâmicas para Revestimentos",
    description: "Norma ABNT aplicável a todos os produtos cerâmicos Portobello.",
    fileUrl: "/docs/nbr-15463.pdf", fileSize: 2100000, mimeType: "application/pdf",
    productSkus: [], tags: ["norma", "ABNT", "NBR"],
    indexed: true, indexedAt: new Date(), chunkCount: 45,
    published: true, language: "pt-BR", version: "2023",
    createdAt: new Date(), updatedAt: new Date() },
];

const CERT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  enterprise: { label: "Enterprise", icon: "🏆", color: "#8b5cf6" },
  premium:    { label: "Premium",    icon: "⭐", color: "#f59e0b" },
  certified:  { label: "Certified",  icon: "✅", color: "#10b981" },
  official:   { label: "Official",   icon: "🏷️", color: "#3b82f6" },
};

const DOC_ICONS: Record<string, React.ReactNode> = {
  PDF:          <FileText size={14} color="#ef4444" />,
  CATALOG:      <BookOpen size={14} color="#3b82f6" />,
  MANUAL:       <FileText size={14} color="#f59e0b" />,
  NORM:         <FileText size={14} color="#6b7280" />,
  BIM:          <Layers size={14} color="#8b5cf6" />,
  VIDEO:        <Video size={14} color="#ef4444" />,
  SPEC_SHEET:   <FileSpreadsheet size={14} color="#10b981" />,
  PRESENTATION: <Image size={14} color="#f59e0b" />,
};

const SPECIALIST_TYPE_LABELS: Record<string, string> = {
  TECHNICAL:    "Técnico",
  COMMERCIAL:   "Comercial",
  INSTALLATION: "Instalação",
  AFTER_SALES:  "Pós-venda",
  WARRANTY:     "Garantia",
  PROJECTS:     "Projetos",
  GENERAL:      "Geral",
};

// ─── Section helper ────────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#64748b" }}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── VCNCompanyDetailPage ─────────────────────────────────────────────────────

export function VCNCompanyDetailPage() {
  const [, navigate] = useLocation();
  const [tab, setTab]          = useState<"overview" | "products" | "specialists" | "knowledge" | "analytics">("overview");
  const [productSearch, setPS] = useState("");

  const company = MOCK_COMPANY;
  const cert    = CERT_CONFIG[company.certificationLevel] ?? CERT_CONFIG.official;

  const filteredProducts = MOCK_PRODUCTS.filter(p => {
    const q = productSearch.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => navigate("/vendor-certified-network")} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            <ArrowLeft size={14} /> Certified Network
          </button>
          <span style={{ color: "#2d2e3a" }}>/</span>
          <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{company.brandName ?? company.legalName}</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: `linear-gradient(135deg, ${cert.color}20, #1e40af20)`, border: `1px solid ${cert.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
            {cert.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#fff" }}>{company.brandName ?? company.legalName}</h2>
              {company.verified && <CheckCircle2 size={14} color="#10b981" />}
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${cert.color}20`, color: cert.color, fontWeight: 700 }}>
                <Shield size={8} style={{ display: "inline", marginRight: 3 }} />{cert.label}
              </span>
              {company.featured && <Star size={12} color="#f59e0b" fill="#f59e0b" />}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
              {company.city && <span style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><MapPin size={10} /> {company.city}, {company.state}</span>}
              {company.email && <span style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><Mail size={10} /> {company.email}</span>}
              {company.foundedYear && <span style={{ fontSize: 10, color: "#64748b" }}>Est. {company.foundedYear}</span>}
              {company.website && (
                <a href={`https://${company.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#10b981", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
                  <Globe size={10} /> {company.website} <ExternalLink size={8} />
                </a>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "transparent", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <FileText size={11} /> Solicitar Orçamento
            </button>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <MessageSquare size={11} /> Falar com Especialista
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          {[["📦", company.productsCount, "produtos"], ["🤖", company.specialistsCount, "especialistas"], ["📋", company.specificationsCount.toLocaleString(), "especificações"], ["💬", company.quotationsCount.toLocaleString(), "cotações"]].map(([e, v, l]) => (
            <div key={l as string} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
              <span>{e}</span>
              <span style={{ fontWeight: 700, color: "#10b981" }}>{v}</span>
              <span style={{ color: "#64748b" }}>{l}</span>
            </div>
          ))}
          {company.certifications.map(c => (
            <span key={c} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, padding: "2px 6px", borderRadius: 3, background: "#10b98120", color: "#10b981", border: "1px solid #10b98130" }}>
              <Award size={8} /> {c}
            </span>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {([
            ["overview",     "📋 Visão Geral"],
            ["products",     "📦 Catálogo"],
            ["specialists",  "🤖 Especialistas"],
            ["knowledge",    "📚 Base de Conhecimento"],
            ["analytics",    "📊 Analytics"],
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

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Section title="SOBRE A EMPRESA">
                <p style={{ margin: 0, fontSize: 11, color: "#e2e8f0", lineHeight: 1.7 }}>{company.description}</p>
              </Section>
              <Section title="SEGMENTOS E CATEGORIAS">
                <div style={{ marginBottom: 8 }}>
                  <p style={{ margin: "0 0 5px", fontSize: 9, color: "#64748b" }}>Segmentos</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {company.segments.map(s => <span key={s} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#e2e8f0", border: "1px solid #2d2e3a" }}>{s}</span>)}
                  </div>
                </div>
                <div>
                  <p style={{ margin: "0 0 5px", fontSize: 9, color: "#64748b" }}>Categorias de Produto</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {company.categories.map(c => <span key={c} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "#10b98115", color: "#10b981", border: "1px solid #10b98130" }}>{c}</span>)}
                  </div>
                </div>
              </Section>
              <Section title="REGIÕES DE ATENDIMENTO">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {company.regions.map(r => <span key={r} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid #2d2e3a" }}>{r}</span>)}
                </div>
              </Section>
              <Section title="ESPECIALIDADES">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {company.specialties.map(s => <span key={s} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "#10b98115", color: "#10b981", border: "1px solid #10b98130" }}>{s}</span>)}
                </div>
              </Section>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Section title="CONTATO">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {company.phone && <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><Phone size={11} color="#64748b" /> {company.phone}</span>}
                  {company.email && <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><Mail size={11} color="#64748b" /> {company.email}</span>}
                  {company.address && <span style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={11} color="#64748b" /> {company.address}</span>}
                  {company.website && <a href={`https://${company.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6, color: "#10b981", textDecoration: "none" }}><Globe size={11} /> {company.website}</a>}
                </div>
              </Section>
              <Section title="HORÁRIO">
                {Object.entries(company.workingHours).map(([d, h]) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                    <span style={{ color: "#94a3b8" }}>{d}</span><span style={{ color: "#e2e8f0" }}>{h}</span>
                  </div>
                ))}
              </Section>
              <Section title="CERTIFICAÇÕES">
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {company.certifications.map(c => (
                    <span key={c} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, padding: "4px 8px", borderRadius: 4, background: "#10b98115", color: "#10b981", border: "1px solid #10b98130" }}>
                      <Award size={10} /> {c}
                    </span>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* ── CATALOG ── */}
        {tab === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
                <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input value={productSearch} onChange={e => setPS(e.target.value)} placeholder="Buscar produto, SKU…"
                  style={{ width: "100%", paddingLeft: 28, paddingRight: 8, paddingTop: 7, paddingBottom: 7, borderRadius: 6, border: "1px solid #2d2e3a", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box" }} />
              </div>
              <span style={{ fontSize: 10, color: "#64748b" }}>{filteredProducts.length} produtos</span>
              <button style={{ padding: "7px 12px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={11} /> Adicionar Produto
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filteredProducts.map(product => (
                <div key={product.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ height: 100, background: "linear-gradient(135deg, #10b98115, #1e40af15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🪨</div>
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{product.name}</p>
                      {product.featured && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
                    </div>
                    {product.sku && <p style={{ margin: "0 0 6px", fontSize: 8, color: "#64748b" }}>SKU: {product.sku}</p>}
                    <p style={{ margin: "0 0 8px", fontSize: 9, color: "#94a3b8", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{product.description}</p>

                    <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                      {product.finishes.map(f => <span key={f} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#10b98115", color: "#10b981" }}>{f}</span>)}
                      {product.colors.map(c => <span key={c} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>{c}</span>)}
                    </div>

                    <div style={{ display: "flex", gap: 6, fontSize: 8, color: "#64748b", marginBottom: 8 }}>
                      {Object.entries(product.dimensions).slice(0, 2).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981" }}>
                        {product.price ? `R$ ${product.price}/${product.priceUnit}` : "Sob consulta"}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {product.bimUrls.length > 0 && <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 3, background: "#8b5cf620", color: "#8b5cf6" }}>BIM</span>}
                        {product.pbrUrls.length > 0 && <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b" }}>PBR</span>}
                        <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 8, color: "#64748b" }}><Eye size={8} /> {product.specificationsCount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SPECIALISTS ── */}
        {tab === "specialists" && (
          <div>
            <div style={{ background: "#10b98115", border: "1px solid #10b98130", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Shield size={14} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "#10b981" }}>Especialistas Digitais Oficiais {company.brandName}</p>
                <p style={{ margin: 0, fontSize: 9, color: "#94a3b8", lineHeight: 1.5 }}>
                  Treinados exclusivamente com conhecimento oficial da empresa. Apoiam arquitetos e designers na especificação técnica correta dos produtos.
                  Nunca substituem produtos automaticamente — toda sugestão inclui justificativa técnica.
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {MOCK_SPECIALISTS.map(spec => (
                <div key={spec.id} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: "#10b98120", border: "1px solid #10b98140", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🤖</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>{spec.name}</p>
                      <p style={{ margin: 0, fontSize: 9, color: "#10b981" }}>{SPECIALIST_TYPE_LABELS[spec.specialistType]}</p>
                    </div>
                    {spec.featured && <Star size={12} color="#f59e0b" fill="#f59e0b" />}
                  </div>
                  {spec.description && <p style={{ margin: "0 0 10px", fontSize: 9, color: "#94a3b8", lineHeight: 1.4 }}>{spec.description}</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                    {spec.knowledgeTopics.map(t => <span key={t} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#10b98115", color: "#10b981" }}>{t}</span>)}
                  </div>
                  <button style={{ width: "100%", padding: "7px", borderRadius: 6, background: "#10b98120", color: "#10b981", border: "1px solid #10b98140", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                    💬 Iniciar Consulta
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── KNOWLEDGE BASE ── */}
        {tab === "knowledge" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#64748b" }}>BASE DE CONHECIMENTO ({MOCK_KNOWLEDGE.length} documentos)</p>
              <button style={{ padding: "6px 12px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={11} /> Adicionar Documento
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MOCK_KNOWLEDGE.map(doc => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a" }}>
                  <div style={{ flexShrink: 0 }}>{DOC_ICONS[doc.type] ?? <FileText size={14} color="#64748b" />}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, color: "#fff" }}>{doc.title}</p>
                    {doc.description && <p style={{ margin: "0 0 4px", fontSize: 9, color: "#94a3b8" }}>{doc.description}</p>}
                    <div style={{ display: "flex", gap: 8, fontSize: 8, color: "#64748b" }}>
                      <span style={{ textTransform: "uppercase" }}>{doc.type}</span>
                      {doc.version && <span>v{doc.version}</span>}
                      {doc.fileSize && <span>{(doc.fileSize / 1000000).toFixed(1)}MB</span>}
                      {doc.language && <span>{doc.language}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {doc.indexed
                      ? <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: "#10b98120", color: "#10b981" }}>✓ Indexado ({doc.chunkCount} chunks)</span>
                      : <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b" }}>Pendente</span>
                    }
                    {doc.fileUrl && (
                      <button style={{ padding: "4px 8px", borderRadius: 4, background: "rgba(255,255,255,0.05)", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 8, display: "flex", alignItems: "center", gap: 3 }}>
                        <Download size={9} /> Baixar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === "analytics" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                ["📦", "Produtos", company.productsCount],
                ["📋", "Especificações", company.specificationsCount.toLocaleString()],
                ["💬", "Cotações", company.quotationsCount.toLocaleString()],
                ["🤖", "Especialistas", company.specialistsCount],
                ["🔄", "Conversão", `${Math.round((company.quotationsCount / company.specificationsCount) * 100)}%`],
                ["📚", "Docs indexados", MOCK_KNOWLEDGE.filter(d => d.indexed).length],
              ].map(([e, l, v]) => (
                <div key={l as string} style={{ padding: 14, borderRadius: 8, background: "#1a1b23", border: "1px solid #2d2e3a", textAlign: "center" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 22 }}>{e}</p>
                  <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 900, color: "#10b981" }}>{v}</p>
                  <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{l}</p>
                </div>
              ))}
            </div>
            <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
              <p style={{ margin: "0 0 12px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>PRODUTOS MAIS ESPECIFICADOS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {MOCK_PRODUCTS.sort((a, b) => b.specificationsCount - a.specificationsCount).map((p, i) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, background: "#0f1117", border: "1px solid #2d2e3a" }}>
                    <span style={{ fontSize: 11, color: "#64748b", width: 16, textAlign: "center" }}>#{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "#fff" }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: "#10b981" }}>{p.specificationsCount.toLocaleString()} specs</span>
                    <div style={{ width: 60, height: 4, borderRadius: 2, background: "#2d2e3a" }}>
                      <div style={{ width: `${(p.specificationsCount / MOCK_PRODUCTS[0].specificationsCount) * 100}%`, height: "100%", borderRadius: 2, background: "#10b981" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
