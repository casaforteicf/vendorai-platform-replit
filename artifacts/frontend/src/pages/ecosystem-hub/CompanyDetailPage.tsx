import { VendorBackButton } from "@/components/ui/back-button";
import { useQuery } from "@tanstack/react-query";
import { Building2, Globe2, Mail, MapPin, Phone, Users } from "lucide-react";
import { useLocation, useParams } from "wouter";
import type { VepCompany, VepPortfolioItem, VepProfessional } from "./vep-types";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Falha ao carregar ${url}`);
  }
  return response.json();
}

export function CompanyDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const companyQuery = useQuery<VepCompany>({
    queryKey: ["ecosystem-company", id],
    enabled: Boolean(id),
    queryFn: () => fetchJson(`/api/ecosystem-hub/companies/${encodeURIComponent(id)}`),
  });

  const professionalsQuery = useQuery<VepProfessional[]>({
    queryKey: ["ecosystem-company-professionals", id],
    enabled: Boolean(id),
    queryFn: () => fetchJson(`/api/ecosystem-hub/companies/${encodeURIComponent(id)}/professionals`),
  });

  const portfolioQuery = useQuery<VepPortfolioItem[]>({
    queryKey: ["ecosystem-company-portfolio", id],
    enabled: Boolean(id),
    queryFn: () => fetchJson(`/api/ecosystem-hub/companies/${encodeURIComponent(id)}/portfolio`),
  });

  if (companyQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando empresa…</div>;
  }

  if (companyQuery.isError || !companyQuery.data) {
    return (
      <div className="p-6">
        <VendorBackButton to="/ecosystem-hub" label="Voltar para o Ecosystem Hub" className="mb-4" />
        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-lg font-semibold">Empresa não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">Não foi possível carregar um cadastro real para este identificador.</p>
        </div>
      </div>
    );
  }

  const company = companyQuery.data;
  const professionals = professionalsQuery.data ?? [];
  const portfolio = portfolioQuery.data ?? [];
  const name = company.tradeName || company.legalName;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <VendorBackButton to="/ecosystem-hub" label="Voltar para o Ecosystem Hub" />

      <section className="overflow-hidden rounded-2xl border bg-card">
        {company.coverUrl && <img src={company.coverUrl} alt="" className="h-44 w-full object-cover" />}
        <div className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {company.logoUrl ? <img src={company.logoUrl} alt={name} className="h-full w-full object-contain" /> : <Building2 className="h-7 w-7 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{name}</h1>
                {company.verified && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600">Verificada</span>}
                <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{company.tier}</span>
              </div>
              {company.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{company.description}</p>}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {(company.city || company.state) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{[company.city, company.state].filter(Boolean).join(" / ")}</span>}
                {company.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" />{company.phone}</span>}
                {company.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4" />{company.email}</span>}
                {company.website && <span className="inline-flex items-center gap-1.5"><Globe2 className="h-4 w-4" />{company.website}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5" /><h2 className="font-semibold">Equipe ({professionals.length})</h2></div>
          {professionalsQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando equipe…</p> : professionals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum profissional real cadastrado para esta empresa.</p> : (
            <div className="space-y-3">
              {professionals.map((professional) => (
                <div key={professional.id} className="rounded-xl border p-3">
                  <div className="font-medium">{professional.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{professional.title || professional.role || "Profissional"}</div>
                  {professional.specialties?.length > 0 && <div className="mt-2 text-xs text-muted-foreground">{professional.specialties.join(" · ")}</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2"><Building2 className="h-5 w-5" /><h2 className="font-semibold">Portfólio ({portfolio.length})</h2></div>
          {portfolioQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando portfólio…</p> : portfolio.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item real de portfólio publicado para esta empresa.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {portfolio.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-xl border">
                  {item.coverUrl && <img src={item.coverUrl} alt={item.title} className="h-28 w-full object-cover" />}
                  <div className="p-3">
                    <div className="font-medium">{item.title}</div>
                    {item.description && <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
