import { useMemo, useState } from "react";
import { Link } from "wouter";
import { authorizedLauncherModules, type LauncherAudience, type LauncherModule } from "@/lib/adaptiveModuleLauncher";

/**
 * TAD — selectable ecosystem start screen.
 * Pass ONLY server-verified entitlements and effective permissions.
 * This component deliberately does not infer permissions from a user role.
 * It can be mounted after the entitlement/route integration is audited.
 */
export interface TadCentralProps {
  audience: LauncherAudience;
  enabledModules: readonly LauncherModule[];
  permittedModules: readonly LauncherModule[];
  companyName?: string;
}

const TAD_LABELS: Partial<Record<LauncherModule, { description: string; section: string }>> = {
  crm: { description: "Clientes, oportunidades, pipeline e propostas", section: "Comercial" },
  marketing: { description: "Campanhas, anúncios e conteúdos", section: "Crescimento" },
  omnichannel: { description: "Conversas e atendimento integrado", section: "Comercial" },
  agenda: { description: "Compromissos, tarefas e visitas", section: "Produtividade" },
  arqdor: { description: "Projetos, modelagem, render e especificações", section: "Projetos" },
  obras: { description: "Execução, checklists e assistência", section: "Operação" },
  pdv: { description: "Vendas de balcão", section: "Operação" },
  erp: { description: "Gestão operacional e financeira", section: "Operação" },
  marketplace_casa: { description: "Praça.ai — produtos, serviços e anunciantes", section: "Marketplace" },
  parceiros: { description: "Parceiros e fornecedores", section: "Rede" },
  portal_cliente: { description: "Projetos, pedidos e solicitações", section: "Relacionamento" },
  inteligencia: { description: "Indicadores e insights", section: "Inteligência" },
  agentes_ia: { description: "Vendi e agentes inteligentes", section: "Inteligência" },
  configuracoes: { description: "Usuários, permissões e integrações", section: "Administração" },
};

export default function TadCentral({ audience, enabledModules, permittedModules, companyName }: TadCentralProps) {
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("Todos");
  const authorized = useMemo(
    () => authorizedLauncherModules({ audience, enabledModules, permittedModules }),
    [audience, enabledModules, permittedModules],
  );
  const sections = useMemo(() => ["Todos", ...new Set(authorized.map(m => TAD_LABELS[m.key]?.section ?? "Outros"))], [authorized]);
  const visible = useMemo(() => authorized.filter(m => {
    const label = TAD_LABELS[m.key];
    const matchesSection = section === "Todos" || (label?.section ?? "Outros") === section;
    const matchesSearch = [m.title, label?.description ?? "", label?.section ?? ""]
      .join(" ").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
    return matchesSection && matchesSearch;
  }), [authorized, search, section]);
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8" aria-label="TAD Central">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">TAD • Central do ecossistema</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Escolha seu ambiente de trabalho</h1>
          <p className="mt-1 text-sm text-muted-foreground">{companyName ? `Empresa: ${companyName} • ` : ""}Somente serviços autorizados para seu acesso</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{authorized.length} serviços disponíveis</span>
      </header>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="tad-search">Buscar serviço</label>
        <input id="tad-search" type="search" placeholder="Buscar serviço..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border bg-background px-4 py-2.5 text-sm" />
        <label className="sr-only" htmlFor="tad-section">Filtrar grupo</label>
        <select id="tad-section" value={section} onChange={e => setSection(e.target.value)}
          className="rounded-lg border bg-background px-4 py-2.5 text-sm">
          {sections.map(group => <option key={group} value={group}>{group}</option>)}
        </select>
      </div>
      <section aria-label="Serviços" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(module => {
          const info = TAD_LABELS[module.key];
          const body = (
            <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{info?.section ?? "Serviço"}</span>
                <span className="text-xs text-muted-foreground">{module.route ? "Abrir ↗" : "Em integração"}</span>
              </div>
              <h2 className="text-lg font-semibold">{module.key === "marketplace_casa" ? "Praça.ai" : module.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{info?.description ?? "Ambiente do ecossistema"}</p>
            </>
          );
          const className = "block min-h-[145px] rounded-xl border bg-card p-5 text-card-foreground transition-colors hover:bg-muted/40";
          return module.route
            ? <Link key={module.key} href={module.route} className={className} aria-label={`Abrir ${module.title}`}>{body}</Link>
            : <div key={module.key} className={className} aria-disabled="true">{body}</div>;
        })}
      </section>
      {visible.length === 0 && <p role="status" className="mt-8 text-center text-sm text-muted-foreground">
        Nenhum serviço disponível para esta busca e este perfil.
      </p>}
    </main>
  );
}
