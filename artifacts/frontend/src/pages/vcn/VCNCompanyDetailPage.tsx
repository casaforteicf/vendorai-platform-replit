import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Building2,
  FileText,
  Globe,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";

type VcnCompany = {
  id: string;
  type: string;
  legalName: string;
  brandName: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  website: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  segments: string[] | null;
  categories: string[] | null;
  regions: string[] | null;
  specialties: string[] | null;
  tags: string[] | null;
  languages: string[] | null;
  certificationLevel: string;
  certifications: string[] | null;
  verified: boolean;
  featured: boolean;
  foundedYear: number | null;
  teamSize: string | null;
  productsCount: number;
  specialistsCount: number;
  specificationsCount: number;
  quotationsCount: number;
};

type Specialist = {
  id: string;
  name: string;
  specialistType: string;
  avatarUrl: string | null;
  description: string | null;
  knowledgeTopics: string[] | null;
  languages: string[] | null;
  responseStyle: string | null;
  active: boolean;
  featured: boolean;
};

type Product = {
  id: string;
  name: string;
  line: string | null;
  model: string | null;
  sku: string | null;
  description: string | null;
  coverUrl: string | null;
  imageUrls: string[] | null;
  materials: string[] | null;
  finishes: string[] | null;
  colors: string[] | null;
  price: string | null;
  priceUnit: string | null;
  inStock: boolean;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
  published: boolean;
  featured: boolean;
  category: string | null;
  norms: string[] | null;
  certifications: string[] | null;
};

type KnowledgeDoc = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  productSkus: string[] | null;
  tags: string[] | null;
  indexed: boolean;
  published: boolean;
  language: string | null;
  version: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  MANUFACTURER: "Fabricante",
  DISTRIBUTOR: "Distribuidor",
  RESELLER: "Revendedor",
  REPRESENTATIVE: "Representante",
  SERVICE_PROVIDER: "Prestador de serviço",
  CABINETRY: "Marcenaria",
  LIGHTING: "Iluminação",
  STONE: "Pedras e marmoraria",
  FLOORING: "Pisos",
  WINDOWS: "Esquadrias",
  AUTOMATION: "Automação",
  PAINT: "Tintas",
  FURNITURE: "Mobiliário",
  DECOR: "Decoração",
  OTHER: "Empresa certificada",
};

const SPECIALIST_LABELS: Record<string, string> = {
  TECHNICAL: "Técnico",
  COMMERCIAL: "Comercial",
  INSTALLATION: "Instalação",
  AFTER_SALES: "Pós-venda",
  WARRANTY: "Garantia",
  PROJECTS: "Projetos",
  GENERAL: "Geral",
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Não foi possível carregar os dados da Rede Certificada.");
  }
  return response.json();
}

function formatMoney(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed);
}

function formatFileSize(value: number | null) {
  if (!value || value <= 0) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function VCNCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = params.id;

  const companyQuery = useQuery({
    queryKey: ["vcn", "company", id],
    queryFn: () => fetchJson<VcnCompany>(`/api/vcn/companies/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const specialistsQuery = useQuery({
    queryKey: ["vcn", "company", id, "specialists"],
    queryFn: () => fetchJson<Specialist[]>(`/api/vcn/companies/${encodeURIComponent(id)}/specialists`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ["vcn", "company", id, "products"],
    queryFn: () => fetchJson<Product[]>(`/api/vcn/companies/${encodeURIComponent(id)}/products`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const knowledgeQuery = useQuery({
    queryKey: ["vcn", "company", id, "knowledge"],
    queryFn: () => fetchJson<KnowledgeDoc[]>(`/api/vcn/companies/${encodeURIComponent(id)}/knowledge`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  if (companyQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando empresa certificada real...</div>;
  }

  if (companyQuery.error || !companyQuery.data) {
    return (
      <div className="min-h-full bg-background p-6">
        <div className="mx-auto max-w-4xl rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <button type="button" onClick={() => navigate("/vendor-certified-network")} className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Voltar para Rede Certificada
          </button>
          <h1 className="font-semibold text-destructive">Não foi possível abrir esta empresa</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {companyQuery.error instanceof Error ? companyQuery.error.message : "Empresa não encontrada."}
          </p>
        </div>
      </div>
    );
  }

  const company = companyQuery.data;
  const specialists = (specialistsQuery.data ?? []).filter((item) => item.active);
  const products = (productsQuery.data ?? []).filter((item) => item.published);
  const docs = (knowledgeQuery.data ?? []).filter((item) => item.published);

  return (
    <div className="min-h-full bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <button type="button" onClick={() => navigate("/vendor-certified-network")} className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Rede Certificada
        </button>

        <section className="overflow-hidden rounded-2xl border bg-card">
          {company.coverUrl && <img src={company.coverUrl} alt="" className="h-44 w-full object-cover" />}
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-start">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {company.logoUrl ? <img src={company.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-8 w-8 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{company.brandName || company.legalName}</h1>
                    {company.verified && <ShieldCheck className="h-5 w-5 text-primary" />}
                    {company.featured && <Star className="h-5 w-5 fill-current text-amber-500" />}
                  </div>
                  {company.brandName && <p className="mt-1 text-sm text-muted-foreground">{company.legalName}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{TYPE_LABELS[company.type] ?? company.type}</span>
                  <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"><BadgeCheck className="h-3.5 w-3.5" /> {company.certificationLevel}</span>
                </div>
              </div>

              {company.description && <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground md:text-base">{company.description}</p>}

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {(company.city || company.state) && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {[company.city, company.state].filter(Boolean).join(" / ")}</span>}
                {company.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {company.phone}</span>}
                {company.email && <a href={`mailto:${company.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-4 w-4" /> {company.email}</a>}
                {company.website && <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground"><Globe className="h-4 w-4" /> Site oficial</a>}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Produtos publicados</div><div className="mt-1 text-2xl font-semibold">{products.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Especialistas ativos</div><div className="mt-1 text-2xl font-semibold">{specialists.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Documentos oficiais</div><div className="mt-1 text-2xl font-semibold">{docs.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Cotações registradas</div><div className="mt-1 text-2xl font-semibold">{company.quotationsCount ?? 0}</div></div>
        </div>

        {((company.categories ?? []).length > 0 || (company.specialties ?? []).length > 0 || (company.certifications ?? []).length > 0) && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Escopo e certificações</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Categorias</div><div className="flex flex-wrap gap-2">{(company.categories ?? []).map((item) => <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs">{item}</span>)}</div></div>
              <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Especialidades</div><div className="flex flex-wrap gap-2">{(company.specialties ?? []).map((item) => <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs">{item}</span>)}</div></div>
              <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Certificações</div><div className="flex flex-wrap gap-2">{(company.certifications ?? []).map((item) => <span key={item} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{item}</span>)}</div></div>
            </div>
          </section>
        )}

        <section className="rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" /> Especialistas digitais</h2>
          <p className="mt-1 text-sm text-muted-foreground">Especialistas reais configurados para esta empresa certificada.</p>
          {specialistsQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando especialistas...</div>
          ) : specialistsQuery.error ? (
            <div className="py-8 text-sm text-destructive">Não foi possível carregar os especialistas.</div>
          ) : specialists.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">Nenhum especialista ativo cadastrado.</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {specialists.map((specialist) => (
                <div key={specialist.id} className="rounded-lg border p-4">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                      {specialist.avatarUrl ? <img src={specialist.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{specialist.name}</h3>
                          <p className="text-xs text-muted-foreground">{SPECIALIST_LABELS[specialist.specialistType] ?? specialist.specialistType}</p>
                        </div>
                        {specialist.featured && <Star className="h-4 w-4 fill-current text-amber-500" />}
                      </div>
                      {specialist.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{specialist.description}</p>}
                      {(specialist.knowledgeTopics ?? []).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{(specialist.knowledgeTopics ?? []).slice(0, 4).map((topic) => <span key={topic} className="rounded-full bg-muted px-2 py-0.5 text-xs">{topic}</span>)}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4" /> Produtos oficiais</h2>
          <p className="mt-1 text-sm text-muted-foreground">Catálogo publicado pela empresa dentro da Rede Certificada.</p>
          {productsQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando produtos...</div>
          ) : productsQuery.error ? (
            <div className="py-8 text-sm text-destructive">Não foi possível carregar os produtos.</div>
          ) : products.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">Nenhum produto publicado.</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => {
                const price = formatMoney(product.price);
                return (
                  <div key={product.id} className="rounded-lg border p-4">
                    <div className="flex gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {product.coverUrl ? <img src={product.coverUrl} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium">{product.name}</h3>
                          {product.featured && <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{[product.line, product.model, product.category].filter(Boolean).join(" · ") || product.sku || "Produto oficial"}</p>
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
          <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" /> Base técnica oficial</h2>
          <p className="mt-1 text-sm text-muted-foreground">Catálogos, manuais, normas e documentos reais publicados pela empresa.</p>
          {knowledgeQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Carregando documentos...</div>
          ) : knowledgeQuery.error ? (
            <div className="py-8 text-sm text-destructive">Não foi possível carregar a base técnica.</div>
          ) : docs.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">Nenhum documento publicado.</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {docs.map((doc) => (
                <div key={doc.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><FileText className="h-5 w-5 text-muted-foreground" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><h3 className="font-medium">{doc.title}</h3>{doc.indexed && <BadgeCheck className="h-4 w-4 text-primary" />}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{[doc.type, doc.version, formatFileSize(doc.fileSize)].filter(Boolean).join(" · ")}</p>
                      {doc.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{doc.description}</p>}
                      {doc.fileUrl && <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">Abrir documento</a>}
                    </div>
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
