import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, MapPin, Search, ShieldCheck, Star, Users } from "lucide-react";

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
  certifications: string[];
  tier: string;
  status: string;
  featured: boolean;
  totalLeads: number;
  totalOrders: number;
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

const TIER_LABELS: Record<string, string> = {
  basic: "Basic",
  verified: "Verified",
  official: "Official",
  premium: "Premium",
  enterprise: "Enterprise",
};

async function fetchPartners(): Promise<Partner[]> {
  const response = await fetch("/api/partner-hub/partners?status=active");
  if (!response.ok) throw new Error("Não foi possível carregar a rede de parceiros.");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export function PartnerHubPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["partner-hub", "partners"],
    queryFn: fetchPartners,
    staleTime: 60_000,
  });

  const types = useMemo(
    () => Array.from(new Set(data.map((partner) => partner.type))).sort(),
    [data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((partner) => {
      if (type !== "all" && partner.type !== type) return false;
      if (!term) return true;
      const haystack = [
        partner.name,
        partner.brand,
        partner.description,
        partner.city,
        partner.state,
        ...partner.segments,
        ...partner.specialties,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [data, search, type]);

  const featured = data.filter((partner) => partner.featured).length;
  const verified = data.filter((partner) => partner.tier !== "basic").length;

  return (
    <div className="min-h-full bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Users className="h-4 w-4" />
              Ecossistema VendorAI
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Rede de Parceiros</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Empresas cadastradas na rede real de parceiros da plataforma. Os dados abaixo vêm diretamente do cadastro operacional.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="h-4 w-4" /> Parceiros ativos</div>
            <div className="mt-2 text-2xl font-semibold">{data.length}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Verificados ou superiores</div>
            <div className="mt-2 text-2xl font-semibold">{verified}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Star className="h-4 w-4" /> Em destaque</div>
            <div className="mt-2 text-2xl font-semibold">{featured}</div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar parceiro, cidade, segmento ou especialidade..."
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
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando parceiros reais...</div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Falha ao carregar parceiros."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="font-medium">Nenhum parceiro encontrado</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou cadastre parceiros reais antes de utilizar esta área.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((partner) => (
              <button
                key={partner.id}
                type="button"
                onClick={() => navigate(`/partner-hub/${partner.id}`)}
                className="group rounded-xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {partner.logoUrl ? <img src={partner.logoUrl} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="truncate font-semibold">{partner.brand || partner.name}</h2>
                        {partner.brand && <p className="truncate text-xs text-muted-foreground">{partner.name}</p>}
                      </div>
                      {partner.featured && <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{TYPE_LABELS[partner.type] ?? partner.type}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{TIER_LABELS[partner.tier] ?? partner.tier}</span>
                    </div>
                  </div>
                </div>

                {partner.description && <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{partner.description}</p>}

                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {partner.city || partner.state ? [partner.city, partner.state].filter(Boolean).join(" / ") : "Local não informado"}</span>
                  <span className="shrink-0 font-medium text-foreground transition group-hover:text-primary">Ver perfil</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
