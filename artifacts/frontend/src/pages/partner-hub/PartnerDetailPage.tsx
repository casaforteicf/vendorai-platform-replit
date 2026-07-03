// ─── Partner Detail — FASE 20 ─────────────────────────────────────────────────
// Perfil completo de um parceiro: Perfil, Catálogo, Contatos, AI Agent, Analytics

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Globe, Phone, Mail, MapPin, ExternalLink, Package,
  Users, Bot, BarChart3, Star, Award, ShoppingCart, FileText,
  MessageSquare, Plus, ChevronDown, ChevronUp,
} from "lucide-react";
import type { VpnPartner, VpnPartnerProduct } from "./vpn-types";

// ─── Mock data (same as hub page — in FASE 20 loads from API) ─────────────────

const MOCK_PARTNER: VpnPartner = {
  id: "p1", name: "Portobello", brand: "Portobello", type: "MANUFACTURER",
  logoUrl: null, description: "Líder em porcelanato e revestimentos cerâmicos premium. Com mais de 40 anos de mercado, a Portobello oferece coleções exclusivas desenvolvidas em parceria com renomados designers brasileiros e internacionais, combinando estética e alta performance técnica.",
  website: "portobello.com.br", phone: "(11) 4003-0000", email: "comercial@portobello.com.br",
  city: "Tijucas", state: "SC", country: "BR",
  regions: ["SP", "RJ", "SC", "PR", "MG", "RS", "GO", "DF"],
  segments: ["Revestimentos", "Porcelanato", "Cerâmica", "Pedras"],
  specialties: ["Grandes Formatos", "Slim", "Texturizados", "Coleções Exclusivas", "Fachada", "Piscina"],
  certifications: ["Vendor Premium", "ISO 9001", "INMETRO", "GreenBuilding"],
  languages: ["pt-BR", "en", "es"],
  tier: "premium", status: "active", featured: true, cnpj: "12.345.678/0001-90",
  workingHours: { "Seg-Sex": "08:00-18:00", "Sab": "09:00-13:00" },
  socialMedia: { instagram: "@portobello", linkedin: "portobello-sa", youtube: "portobellooficial" },
  tags: ["cerâmica", "porcelanato", "revestimento", "grande formato"],
  totalLeads: 142, totalOrders: 89, createdAt: new Date(), updatedAt: new Date(),
};

const MOCK_PRODUCTS: VpnPartnerProduct[] = [
  {
    id: "prod1", partnerId: "p1", name: "Bianco Carrara Polido 120×60", sku: "POC12060BC",
    description: "Porcelanato polido com efeito mármore Carrara. Alta resistência e brilho duradouro.",
    category: "Porcelanato", subcategory: "Polido", collection: "Stones",
    price: "89.90" as unknown as null, priceUnit: "m²", currency: "BRL",
    inStock: true, leadTimeDays: 7, minOrderQty: 10,
    imageUrl: null, images: [],
    specs: { formato: "120×60cm", espessura: "10mm", resistencia: "PEI 5", absorcao: "≤0.5%", retificado: true },
    certifications: ["INMETRO", "ISO 13006"], colors: ["Branco", "Cinza"], finishes: ["Polido"],
    dimensions: { largura: 120, altura: 60, espessura: 10 },
    active: true, featured: true, totalQuotes: 87, totalOrders: 43,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "prod2", partnerId: "p1", name: "Cimento Bege Natural 60×60", sku: "PON6060CB",
    description: "Efeito cimento queimado em formato 60×60. Versátil para ambientes modernos e industriais.",
    category: "Porcelanato", subcategory: "Natural", collection: "Urban",
    price: "64.50" as unknown as null, priceUnit: "m²", currency: "BRL",
    inStock: true, leadTimeDays: 5, minOrderQty: 5,
    imageUrl: null, images: [],
    specs: { formato: "60×60cm", espessura: "9mm", resistencia: "PEI 4", absorcao: "≤0.5%" },
    certifications: ["INMETRO"], colors: ["Bege", "Cinza Claro"], finishes: ["Natural", "Acetinado"],
    dimensions: { largura: 60, altura: 60, espessura: 9 },
    active: true, featured: false, totalQuotes: 54, totalOrders: 31,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "prod3", partnerId: "p1", name: "Madeira Teca Rústico 120×30", sku: "PON12030MT",
    description: "Porcelanato com efeito madeira teca. Textura realística e resistente.",
    category: "Porcelanato", subcategory: "Wood", collection: "Teak",
    price: "72.00" as unknown as null, priceUnit: "m²", currency: "BRL",
    inStock: false, leadTimeDays: 21, minOrderQty: 10,
    imageUrl: null, images: [],
    specs: { formato: "120×30cm", espessura: "10mm", resistencia: "PEI 4" },
    certifications: ["INMETRO"], colors: ["Marrom", "Mel"], finishes: ["Rústico"],
    dimensions: { largura: 120, altura: 30, espessura: 10 },
    active: true, featured: false, totalQuotes: 32, totalOrders: 12,
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  enterprise: { label: "Enterprise", color: "#8b5cf6" },
  premium:    { label: "Premium",    color: "#f59e0b" },
  official:   { label: "Official",   color: "#10b981" },
  verified:   { label: "Verified",   color: "#3b82f6" },
  basic:      { label: "Basic",      color: "#6b7280" },
};

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: VpnPartnerProduct }) {
  const [expanded, setExpanded] = useState(false);
  const price = product.price ? Number(product.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Consultar";

  return (
    <div style={{ background: "#0f1117", border: "1px solid #2d2e3a", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 6, background: "#1a1b23", border: "1px solid #2d2e3a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
          🏗️
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{product.name}</p>
            {product.featured && <Star size={10} color="#f59e0b" fill="#f59e0b" />}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            {product.category && <span style={{ fontSize: 8, color: "#94a3b8" }}>{product.category}</span>}
            {product.collection && <span style={{ fontSize: 8, color: "#7c3aed" }}>{product.collection}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "#a78bfa" }}>{price}</p>
          <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>/{product.priceUnit}</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 8, padding: "1px 6px", borderRadius: 3, fontWeight: 700,
          background: product.inStock ? "#10b98120" : "#ef444420",
          color: product.inStock ? "#10b981" : "#ef4444",
        }}>
          {product.inStock ? "Em estoque" : `Lead time: ${product.leadTimeDays}d`}
        </span>
        {product.minOrderQty && product.minOrderQty > 1 && (
          <span style={{ fontSize: 8, color: "#64748b" }}>Mín.: {product.minOrderQty} {product.priceUnit}</span>
        )}
        {product.sku && <span style={{ fontSize: 8, color: "#64748b" }}>SKU: {product.sku}</span>}
      </div>

      {product.description && (
        <p style={{ margin: "6px 0 0", fontSize: 9, color: "#94a3b8", lineHeight: 1.4 }}>
          {product.description}
        </p>
      )}

      {/* Specs expand */}
      {Object.keys(product.specs as Record<string, unknown>).length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#7c3aed", padding: 0 }}
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? "Ocultar especificações" : "Ver especificações"}
          </button>
          {expanded && (
            <div style={{ marginTop: 6, padding: 8, background: "#1a1b23", borderRadius: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {Object.entries(product.specs as Record<string, unknown>).map(([k, v]) => (
                <div key={k}>
                  <p style={{ margin: 0, fontSize: 8, color: "#64748b" }}>{k}</p>
                  <p style={{ margin: 0, fontSize: 9, color: "#e2e8f0", fontWeight: 600 }}>{String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button style={{ flex: 1, padding: "5px 8px", borderRadius: 5, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <FileText size={10} /> Solicitar Cotação
        </button>
        <button style={{ padding: "5px 8px", borderRadius: 5, background: "transparent", color: "#94a3b8", border: "1px solid #2d2e3a", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", gap: 4 }}>
          <ShoppingCart size={10} /> Pedir
        </button>
      </div>
    </div>
  );
}

// ─── PartnerDetailPage ────────────────────────────────────────────────────────

export function PartnerDetailPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<"profile" | "catalog" | "contacts" | "ai" | "analytics">("profile");

  const partner = MOCK_PARTNER;
  const tier    = TIER_CONFIG[partner.tier] ?? TIER_CONFIG.basic;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #2d2e3a", background: "#1a1b23", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate("/partner-hub")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            <ArrowLeft size={14} /> Partner Hub
          </button>
          <span style={{ color: "#2d2e3a" }}>/</span>
          <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{partner.brand ?? partner.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 10, background: "linear-gradient(135deg, #7c3aed20, #a78bfa20)", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
            🏢
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#fff" }}>{partner.brand ?? partner.name}</h2>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${tier.color}20`, color: tier.color, fontWeight: 700 }}>
                {tier.label}
              </span>
              {partner.featured && <Star size={12} color="#f59e0b" fill="#f59e0b" />}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
              {partner.city && <span style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><MapPin size={10} /> {partner.city}, {partner.state}</span>}
              {partner.email && <span style={{ fontSize: 10, color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}><Mail size={10} /> {partner.email}</span>}
              {partner.website && <a href={`https://${partner.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#7c3aed", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}><Globe size={10} /> {partner.website} <ExternalLink size={8} /></a>}
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "transparent", border: "1px solid #2d2e3a", color: "#94a3b8", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <MessageSquare size={11} /> Chat IA
            </button>
            <button style={{ padding: "7px 12px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <FileText size={11} /> Solicitar Cotação
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 12 }}>
          {([
            ["profile",   "👤 Perfil"],
            ["catalog",   "📦 Catálogo"],
            ["contacts",  "👥 Contatos"],
            ["ai",        "🤖 AI Agent"],
            ["analytics", "📊 Analytics"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "5px 10px", borderRadius: "6px 6px 0 0", fontSize: 10, fontWeight: 700, cursor: "pointer",
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
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {/* ── PROFILE ── */}
        {tab === "profile" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>SOBRE</p>
                <p style={{ margin: 0, fontSize: 11, color: "#e2e8f0", lineHeight: 1.6 }}>{partner.description}</p>
              </div>

              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>ESPECIALIDADES</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(partner.specialties as string[]).map((s: string) => (
                    <span key={s} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "#7c3aed15", color: "#a78bfa", border: "1px solid #7c3aed30" }}>{s}</span>
                  ))}
                </div>
              </div>

              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>REGIÕES DE COBERTURA</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(partner.regions as string[]).map((r: string) => (
                    <span key={r} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#e2e8f0", border: "1px solid #2d2e3a" }}>{r}</span>
                  ))}
                </div>
              </div>

              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>CERTIFICAÇÕES</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(partner.certifications as string[]).map((c: string) => (
                    <span key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "#10b98120", color: "#10b981", border: "1px solid #10b98130" }}>
                      <Award size={10} /> {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar card */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>CONTATO RÁPIDO</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {partner.phone && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}><Phone size={12} color="#64748b" /> {partner.phone}</div>}
                  {partner.email && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}><Mail size={12} color="#64748b" /> {partner.email}</div>}
                  {partner.website && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}><Globe size={12} color="#64748b" /> {partner.website}</div>}
                </div>
              </div>

              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>HORÁRIO</p>
                {Object.entries(partner.workingHours as Record<string, string>).map(([d, h]) => (
                  <div key={d} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4 }}>
                    <span style={{ color: "#94a3b8" }}>{d}</span>
                    <span style={{ color: "#e2e8f0" }}>{h}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 14 }}>
                <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>ESTATÍSTICAS</p>
                {[["Leads gerados", partner.totalLeads], ["Pedidos realizados", partner.totalOrders]].map(([label, value]) => (
                  <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 6 }}>
                    <span style={{ color: "#94a3b8" }}>{label}</span>
                    <span style={{ color: "#a78bfa", fontWeight: 700 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CATALOG ── */}
        {tab === "catalog" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#64748b" }}>CATÁLOGO DE PRODUTOS ({MOCK_PRODUCTS.length})</p>
              <button style={{ padding: "6px 12px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={11} /> Adicionar Produto
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {MOCK_PRODUCTS.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        {/* ── CONTACTS ── */}
        {tab === "contacts" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#64748b" }}>REPRESENTANTES E CONTATOS</p>
              <button style={{ padding: "6px 12px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={11} /> Adicionar Contato
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {[
                { name: "Carlos Mendes", role: "Representante SP/RJ", phone: "(11) 99999-0001", region: "SP, RJ" },
                { name: "Ana Ribeiro", role: "Gerente Comercial", phone: "(47) 99999-0002", region: "SC, PR" },
                { name: "Roberto Lima", role: "Suporte Técnico", phone: "(11) 4003-0001", region: "Nacional" },
              ].map(contact => (
                <div key={contact.name} style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#7c3aed20", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                      👤
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{contact.name}</p>
                      <p style={{ margin: 0, fontSize: 9, color: "#7c3aed" }}>{contact.role}</p>
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={9} /> {contact.phone}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={9} /> {contact.region}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI AGENT ── */}
        {tab === "ai" && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 20, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "#7c3aed20", border: "1px solid #7c3aed40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>Agente IA — {partner.brand}</p>
                  <p style={{ margin: 0, fontSize: 9, color: "#64748b" }}>Responde apenas com o contexto deste parceiro</p>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "#fbbf2420", color: "#fbbf24" }}>FASE 21</span>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 10, color: "#94a3b8" }}>
                O agente conhece: coleções, produtos, especificações, garantias, representantes, campanhas, estoque e lead time.
              </p>
              <div style={{ background: "#0f1117", borderRadius: 6, padding: 12, border: "1px solid #2d2e3a" }}>
                <p style={{ margin: 0, fontSize: 10, color: "#64748b", fontStyle: "italic" }}>
                  "Qual porcelanato possui maior coeficiente de atrito para área externa?"
                </p>
                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 4, background: "#1a1b23", fontSize: 10, color: "#e2e8f0", lineHeight: 1.5 }}>
                  🤖 Para áreas externas, recomendo o <strong>Ciment Rústico 60×60</strong> (PEI 5, C.A. ≥ 0.4) da coleção Urban. Disponível em 3 tons e com certificação INMETRO para piso molhado. Lead time: 5 dias úteis. Posso solicitar cotação?
                </div>
              </div>
              <button style={{ marginTop: 12, width: "100%", padding: "8px", borderRadius: 6, background: "#7c3aed40", color: "#a78bfa", border: "1px solid #7c3aed", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>
                🤖 Abrir Chat com Agente {partner.brand} (em breve)
              </button>
            </div>

            <div style={{ background: "#1a1b23", border: "1px solid #2d2e3a", borderRadius: 8, padding: 16 }}>
              <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>KNOWLEDGE BASE DO AGENTE</p>
              <p style={{ margin: "0 0 10px", fontSize: 10, color: "#94a3b8" }}>Arquivos indexados no Knowledge Graph</p>
              {["Catálogo Portobello 2024.pdf", "Manual Técnico de Assentamento.pdf", "FAQ Garantias.pdf"].map(file => (
                <div key={file} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4, background: "#0f1117", marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>📄</span>
                  <span style={{ fontSize: 10, color: "#e2e8f0", flex: 1 }}>{file}</span>
                  <span style={{ fontSize: 8, color: "#10b981" }}>✓ indexado</span>
                </div>
              ))}
              <button style={{ marginTop: 8, width: "100%", padding: "6px", borderRadius: 5, background: "transparent", color: "#7c3aed", border: "1px dashed #7c3aed40", cursor: "pointer", fontSize: 10 }}>
                + Adicionar arquivo ao Knowledge Base
              </button>
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === "analytics" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              ["Total de Leads",    partner.totalLeads,  "leads gerados na plataforma"],
              ["Pedidos Realizados",partner.totalOrders, "pedidos via Partner Hub"],
              ["Produtos no Catálogo", MOCK_PRODUCTS.length, "produtos ativos"],
              ["Regiões Cobertas",  (partner.regions as string[]).length, "estados"],
              ["Taxa de Conversão", "62%", "leads → pedidos"],
              ["Ticket Médio",      "R$ 4.800", "por pedido"],
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
