import { VendorBackButton } from "@/components/ui/back-button";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Building2, Globe, Mail, MapPin, Package, Phone, ShieldCheck, Star, UserRound } from "lucide-react";

type Partner = {
  id: string;
  name: string;
  brand: string | null;
  type: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  regions: string[];
  segments: string[];
  specialties: string[];
  languages: string[];
  tags: string[];
  certifications: string[];
  tier: string;
  cnpj: string | null;
  socialMedia: Record<string, string>;
  status: string;
  featured: boolean;
  totalLeads: number;
  totalOrders: number;
};

type PartnerProduct = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  collection: string | null;
  price: string | null;
  priceUnit: string | null;
  currency: string | null;
  inStock: boolean;
  leadTimeDays: number | null;
  imageUrl: string | null;
  images: string[];
  active: boolean;
  featured: boolean;
};

type PartnerContact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  whatsapp: string | null;
  active: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  MANUFACTURER: "Fabricante",
  DISTRIBUTOR: "Distribuidor",
  RESELLER: "Revendedor",
  REPRESENTATIVE: "Representante",
  INSTALLER: "Instalador",
  SERVICE_PROVIDER: "Prestador de serviço",
  ARCHITECT: "Arquitetura",
  DESIGNER: "Design",
  CONSTRUCTOR: "Construtora",
  SUPPLIER: "Fornecedor",
  LANDSCAPING: "Paisagismo",
  LIGHTING: "Iluminação",
  MARBLE: "Marmoraria",
  CABINETRY: "Marcenaria",
  AUTOMATION: "Automação",
  CUSTOM: "Parceiro",
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Não foi possível carregar os dados do parceiro.");
  }
  return response.json();
}

function formatMoney(value: string | null, currency = "BRL") {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(parsed);
}

export function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = params.id;

  const partnerQuery = useQuery({
    queryKey: ["partner-hub", "partner", id],
    queryFn: () => fetchJson<Partner>(`/api/partner-hub/partners/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ["partner-hub", "partner", id, "products"],
    queryFn: () => fetchJson<PartnerProduct[]>(`/api/partner-hub/partners/${encodeURIComponent(id)}/products?active=true`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const contactsQuery = useQuery({
    queryKey: ["partner-hub", "partner", id, "contacts"],
    queryFn: () => fetchJson<PartnerContact[]>(`/api/partner-hub/partners/${encodeURIComponent(id)}/contacts`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  if (partnerQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando parceiro real...</div>;
  }

  if (partnerQuery.error || !partnerQuery.data) {
    return (
      <div className="min-h-full bg-background p-6">
        <div className="mx-auto max-w-4xl rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <VendorBackButton to="/partner-hub" label="Voltar para parceiros" className="mb-4" />
          <h1 className="font-semibold text-destructive">Não foi possível abrir este parceiro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {partnerQuery.error instanceof Error ? partnerQuery.error.message : "Parceiro não encontrado."}
          </p>
        </div>
      </div>
    );
  }

  const partner = partnerQuery.data;
  const products = (productsQuery.data ?? []).filter((item) => item.active);
  const contacts = (contactsQuery.data ?? []).filter((item) => item.active);

  return (
    <div className="min-h-full bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <VendorBackButton to="/partner-hub" label="Voltar para parceiros" />

        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-start">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {partner.logoUrl ? <img src={partner.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-8 w-8 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{partner.brand || partner.name}</h1>
                    {partner.featured && <Star className="h-5 w-5 fill-current text-amber-500" />}
                  </div>
                  {partner.brand && <p className="mt-1 text-sm text-muted-foreground">{partner.name}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{TYPE_LABELS[partner.type] ?? partner.type}</span>
                  <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> {partner.tier}</span>
                </div>
              </div>

              {partner.description && <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground md:text-base">{partner.description}</p>}

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {(partner.city || partner.state) && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {[partner.city, partner.state].filter(Boolean).join(" / ")}</span>}
                {partner.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {partner.phone}</span>}
                {partner.email && <a href={`mailto:${partner.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-4 w-4" /> {partner.email}</a>}
                {partner.website && <a href={partner.website.startsWith("http") ? partner.website : `https://${partner.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground"><Globe className="h-4 w-4" /> Site</a>}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Produtos ativos</div><div className="mt-1 text-2xl font-semibold">{products.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Contatos ativos</div><div className="mt-1 text-2xl font-semibold">{contacts.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Leads recebidos</div><div className="mt-1 text-2xl font-semibold">{partner.totalLeads ?? 0}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Pedidos</div><div className="mt-1 text-2xl font-semibold">{partner.totalOrders ?? 0}</div></div>
        </div>

        {(partner.segments.length > 0 || partner.specialties.length > 0 || partner.certifications.length > 0) && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Atuação e certificações</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Segmentos</div><div className="flex flex-wrap gap-2">{partner.segments.map((item) => <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs">{item}</span>)}</div></div>
              <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Especialidades</div><div className="flex flex-wrap gap-2">{partner.specialties.map((item) => <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs">{item}</span>)}</div></div>
              <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Certificações</div><div className="flex flex-wrap gap-2">{partner.certifications.map((item) => <span key={item} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{item}</span>)}</div></div>
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4" /> Produtos do parceiro</h2>
              <p className="mt-1 text-sm text-muted-foreground">Catálogo real cadastrado para esta empresa.</p>
            </div>
          </div>
          {productsQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando produtos...</div>
          ) : productsQuery.error ? (
            <div className="py-8 text-sm text-destructive">Não foi possível carregar os produtos.</div>
          ) : products.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">Nenhum produto ativo cadastrado.</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => {
                const price = formatMoney(product.price, product.currency || "BRL");
                return (
                  <div key={product.id} className="rounded-lg border p-4">
                    <div className="flex gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium">{product.name}</h3>
                          {product.featured && <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{[product.category, product.collection].filter(Boolean).join(" · ") || product.sku || "Produto cadastrado"}</p>
                        {price && <p className="mt-2 text-sm font-semibold">{price}{product.priceUnit ? ` / ${product.priceUnit}` : ""}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{product.inStock ? "Disponível" : product.leadTimeDays ? `Prazo: ${product.leadTimeDays} dias` : "Sob consulta"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" /> Contatos e representantes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pessoas reais vinculadas a este parceiro.</p>
          {contactsQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando contatos...</div>
          ) : contactsQuery.error ? (
            <div className="py-8 text-sm text-destructive">Não foi possível carregar os contatos.</div>
          ) : contacts.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">Nenhum contato ativo cadastrado.</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {contacts.map((contact) => (
                <div key={contact.id} className="rounded-lg border p-4">
                  <div className="font-medium">{contact.name}</div>
                  <div className="text-xs text-muted-foreground">{contact.role || contact.region || "Contato do parceiro"}</div>
                  <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    {contact.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {contact.phone}</div>}
                    {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-foreground"><Mail className="h-3.5 w-3.5" /> {contact.email}</a>}
                    {contact.whatsapp && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> WhatsApp: {contact.whatsapp}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
