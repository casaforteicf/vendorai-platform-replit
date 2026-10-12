import { useMemo, useState } from "react";
import { Link } from "wouter";
import { LAUNCHER_MODULES, authorizedLauncherModules, type LauncherAudience, type LauncherModule } from "@/lib/adaptiveModuleLauncher";

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
  previewModules?: readonly LauncherModule[];
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
  suporte: { description: "Ajuda, perguntas frequentes e orientação", section: "Suporte" },
};

export default function TadCentral({ audience, enabledModules, permittedModules, previewModules = [], companyName }: TadCentralProps) {
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("Todos");
  const authorized = useMemo(
    () => authorizedLauncherModules({ audience, enabledModules, permittedModules }),
    [audience, enabledModules, permittedModules],
  );
  // Preview is only informational; authorization determines clickable links.
  const listed = useMemo(() => {
    const available = new Set(authorized.map(m => m.key));
    const preview = new Set(previewModules);
    const enabled = new Set(enabledModules);
    return [
      ...authorized,
      ...LAUNCHER_MODULES.filter(m => !available.has(m.key) && preview.has(m.key) && enabled.has(m.key) && m.audiences.includes(audience)),
    ];
  }, [authorized, previewModules, enabledModules, audience]);
  const sections = useMemo(() => ["Todos", ...new Set(listed.map(m => TAD_LABELS[m.key]?.section ?? "Outros"))], [listed]);
  const visible = useMemo(() => listed.filter(m => {
    const label = TAD_LABELS[m.key];
    const matchesSection = section === "Todos" || (label?.section ?? "Outros") === section;
    const matchesSearch = [m.title, label?.description ?? "", label?.section ?? ""]
      .join(" ").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
    return matchesSection && matchesSearch;
  }), [listed, search, section]);
  return (
    <main className="min-h-screen w-full bg-[#10141b] px-4 py-7 text-slate-100 md:px-8 lg:px-12" aria-label="TAD Central">
      <header className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-400">TAD • Central do ecossistema</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">Escolha seu ambiente de trabalho</h1>
          <p className="mt-1 text-sm text-slate-400">{companyName ? `Empresa: ${companyName} • ` : ""}Somente serviços autorizados para seu acesso</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{authorized.length} serviços autorizados</span>
      </header>
      <div className="mx-auto mb-6 max-w-7xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-[#192c2b] via-[#182434] to-[#10151e] p-5 md:p-8">
        <p className="text-xs font-medium uppercase tracking-[.18em] text-emerald-300">Seu espaço de trabalho</p>
        <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">Tudo que sua empresa precisa, em um só lugar.</h2>
        <p className="mt-2 text-sm text-slate-300">Escolha um ambiente e continue trabalhando sem menus duplicados.</p>
      </div>
      <div className="mx-auto mb-5 flex max-w-7xl flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="tad-search">Buscar serviço</label>
        <input id="tad-search" type="search" placeholder="Buscar serviço..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500" />
        <label className="sr-only" htmlFor="tad-section">Filtrar grupo</label>
        <select id="tad-section" value={section} onChange={e => setSection(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#202834] px-4 py-2.5 text-sm text-white">
          {sections.map(group => <option key={group} value={group}>{group}</option>)}
        </select>
      </div>
      <section aria-label="Serviços" className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map(module => {
          const info = TAD_LABELS[module.key];
          const canOpen = authorized.some(m => m.key === module.key) && !!module.route;
          const body = (
            <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-emerald-300">{info?.section ?? "Serviço"}</span>
                <span className="text-xs text-slate-400">{canOpen ? "Abrir ↗" : "Acesso em validação"}</span>
              </div>
              {module.key === "crm" && <img src="/logo-full-light.svg" alt="Vendor.ai" className="mb-3 h-7 max-w-[160px] object-contain object-left" />}
              {module.key === "arqdor" && <img src="/brand/arqdor-logo.png" alt="Arqdor" className="mb-3 h-9 max-w-[160px] object-contain object-left" />}
              <h2 className="text-lg font-semibold text-white">{module.key === "marketplace_casa" ? "Praça.ai" : module.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{info?.description ?? "Ambiente do ecossistema"}</p>
            </>
          );
          const className = "block min-h-[162px] rounded-2xl border border-white/10 bg-[#1a212b] p-5 text-slate-100 shadow-lg shadow-black/10 transition-colors hover:border-emerald-400/40 hover:bg-[#212b35]";
          return canOpen
            ? <Link key={module.key} href={module.route} className={className} aria-label={`Abrir ${module.title}`}>{body}</Link>
            : <div key={module.key} className={className} aria-disabled="true">{body}</div>;
        })}
      </section>
      {visible.length === 0 && <p role="status" className="mt-8 text-center text-sm text-slate-400">
        Nenhum serviço disponível para esta busca e este perfil.
      </p>}
    </main>
  );
}
