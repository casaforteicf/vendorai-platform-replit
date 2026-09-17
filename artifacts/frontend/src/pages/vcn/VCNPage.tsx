import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BadgeCheck, Building2, MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";

type VcnCompany = {
  id: string;
  type: string;
  legalName: string;
  brandName: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  segments: string[] | null;
  categories: string[] | null;
  regions: string[] | null;
  specialties: string[] | null;
  certificationLevel: string;
  certifications: string[] | null;
  verified: boolean;
  featured: boolean;
  productsCount: number;
  specialistsCount: number;
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

const CERT_LABELS: Record<string, string> = {
  official: "Oficial",
  certified: "Certificada",
  premium: "Premium",
  enterprise: "Enterprise",
};

async function fetchCompanies(): Promise<VcnCompany[]> {
  const response = await fetch("/api/vcn/companies");
  if (!response.ok) throw new Error("Não foi possível carregar a Rede Certificada.");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export function VCNPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["vcn", "companies"],
    queryFn: fetchCompanies,
    staleTime: 60_000,
  });

  const types = useMemo(() => Array.from(new Set(data.map((item) => item.type))).sort(), [data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((company) => {
      if (type !== "all" && company.type !== type) return false;
      if (!term) return true;
      const haystack = [
        company.legalName,
        company.brandName,
        company.description,
        company.city,
        company.state,
        ...(company.segments ?? []),
        ...(company.categories ?? []),
        ...(company.specialties ?? []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [data, search, type]);

  const verified = data.filter((item) => item.verified).length;
  const featured = data.filter((item) => item.featured).length;
  const products = data.reduce((sum, item) => sum + (item.productsCount ?? 0), 0);

  return (
    <div className="min-h-full bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <BadgeCheck className="h-4 w-4" /> Vendor Certified Network
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Rede Certificada</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Fabricantes, distribuidores e fornecedores cadastrados na rede oficial, com especialistas, produtos e documentação técnica reais.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Empresas ativas</div><div className="mt-1 text-2xl font-semibold">{data.length}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Verificadas</div><div className="mt-1 text-2xl font-semibold">{verified}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Destaques</div><div className="mt-1 text-2xl font-semibold">{featured}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Produtos oficiais</div><div className="mt-1 text-2xl font-semibold">{products}</div></div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa, segmento, categoria ou especialidade..."
              className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            />
          </label>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring md:min-w-56"
          >
            <option value="all">Todos os tipos</option>
            {types.map((item) => <option key={item} value={item}>{TYPE_LABELS[item] ?? item}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando empresas certificadas reais...</div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Falha ao carregar a Rede Certificada."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <BadgeCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="font-medium">Nenhuma empresa certificada encontrada</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou cadastre empresas reais antes de utilizar a rede.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => navigate(`/vendor-certified-network/${company.id}`)}
                className="group overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                {company.coverUrl && <img src={company.coverUrl} alt="" className="h-28 w-full object-cover" />}
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                      {company.logoUrl ? <img src={company.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="truncate font-semibold">{company.brandName || company.legalName}</h2>
                          {company.brandName && <p className="truncate text-xs text-muted-foreground">{company.legalName}</p>}
                        </div>
                        {company.verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{TYPE_LABELS[company.type] ?? company.type}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{CERT_LABELS[company.certificationLevel] ?? company.certificationLevel}</span>
                      </div>
                    </div>
                  </div>

                  {company.description && <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{company.description}</p>}

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>{company.productsCount ?? 0} produtos</span>
                    <span>{company.specialistsCount ?? 0} especialistas</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[company.city, company.state].filter(Boolean).join(" / ") || "Local não informado"}</span>
                    <span className="font-medium text-foreground group-hover:text-primary">Ver empresa</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
