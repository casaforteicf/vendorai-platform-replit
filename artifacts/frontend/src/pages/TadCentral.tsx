import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, Bell, HelpCircle, ChevronDown, ArrowUpRight, ArrowRight, CalendarDays, Megaphone, BriefcaseBusiness, HardHat, Package, Store, ChartNoAxesCombined, Bot, Settings, Headphones, Home, LayoutGrid, Layers3, LogOut, Users, MessageSquare, ShoppingBag, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
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
  const iconMap: Partial<Record<LauncherModule, typeof Home>> = {
    crm: Users, marketing: Megaphone, omnichannel: MessageSquare, agenda: CalendarDays,
    arqdor: Layers3, obras: HardHat, pdv: ShoppingBag, erp: Package,
    marketplace_casa: Store, parceiros: BriefcaseBusiness, portal_cliente: UserRound,
    inteligencia: ChartNoAxesCombined, agentes_ia: Bot, configuracoes: Settings, suporte: Headphones,
  };
  const themeMap: Partial<Record<LauncherModule, string>> = {
    crm: "from-cyan-500/20 to-transparent", marketing: "from-violet-500/20 to-transparent",
    agenda: "from-blue-500/20 to-transparent", arqdor: "from-emerald-500/20 to-transparent",
    obras: "from-amber-500/20 to-transparent", erp: "from-sky-500/20 to-transparent",
    marketplace_casa: "from-orange-500/20 to-transparent", inteligencia: "from-pink-500/20 to-transparent",
    agentes_ia: "from-indigo-500/20 to-transparent", configuracoes: "from-slate-500/20 to-transparent",
    suporte: "from-blue-500/20 to-transparent",
  };
  const navigation = [...authorized];
  const architecturalModules = new Set<LauncherModule>(["arqdor", "obras", "marketplace_casa"]);
  const renderIcon = (key: LauncherModule, size = 20) => {
    const Icon = iconMap[key] ?? LayoutGrid;
    return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
  };
  return (
    <main className="flex min-h-screen w-full bg-[#08111c] font-sans text-slate-100" aria-label="TAD Central do ecossistema">
      <aside className="sticky top-0 hidden h-screen w-[214px] shrink-0 flex-col border-r border-white/[.07] bg-[#091521] lg:flex">
        <div className="flex h-[74px] items-center border-b border-white/[.06] px-6">
          <img src="/logo-full-light.svg" alt="Vendor.ai" className="h-9 w-auto max-w-[160px] object-contain" />
        </div>
        <nav aria-label="Ambientes autorizados" className="flex-1 space-y-1 overflow-y-auto p-3 pt-5">
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-teal-400/30 bg-teal-400/10 px-4 py-3 text-sm font-semibold text-teal-200">
            <Home size={19} aria-hidden="true" /> Início
          </div>
          {navigation.map(module => <Link key={module.key} href={module.route ?? "/tad"} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] text-slate-300 transition hover:bg-white/[.06] hover:text-white">{renderIcon(module.key, 18)}<span>{module.key === "marketplace_casa" ? "Praça.ai" : module.title}</span></Link>)}
        </nav>
        <div className="border-t border-white/[.06] p-5 text-[11px] text-slate-500">TAD · Central do ecossistema</div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-[74px] items-center justify-between gap-4 border-b border-white/[.08] bg-[#0a1622] px-4 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img src="/logo-full-light.svg" alt="Vendor.ai" className="h-7 max-w-[115px] object-contain lg:hidden" />
            <div className="relative hidden w-full max-w-[500px] sm:block">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="tad-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no TAD..." aria-label="Buscar serviço" className="w-full rounded-xl border border-white/10 bg-[#142232] py-2.5 pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-teal-400/60" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 md:gap-5">
            {companyName && <div className="hidden max-w-[190px] items-center gap-2 truncate rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 md:flex"><BriefcaseBusiness size={16} className="text-teal-300" /><span className="truncate">{companyName}</span><ChevronDown size={14} /></div>}
            <HelpCircle size={19} className="hidden text-slate-300 sm:block" aria-hidden="true" />
            <Bell size={19} className="text-slate-300" aria-hidden="true" />
            <button type="button" onClick={() => { logout(); setLocation("/"); }} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10" aria-label="Sair da conta"><LogOut size={16} /><span className="hidden md:inline">Sair</span></button>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-6 md:px-8">
          <section className="relative mb-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1d2b] px-6 py-7 md:px-8 md:py-9">
            <img src="/brand/tad-architecture.svg" alt="" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[58%] object-cover object-center opacity-75 md:block" /><div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a1b29] via-[#0a1b29]/95 to-[#0a1b29]/10" />
            <p className="relative text-[11px] font-bold uppercase tracking-[.22em] text-teal-300">TAD · Central do ecossistema</p>
            <h1 className="relative mt-3 text-3xl font-bold tracking-tight text-white md:text-[42px]">Bem-vindo ao <span className="text-teal-300">TAD</span></h1>
            <p className="relative mt-2 text-base font-medium text-slate-100">Tudo que sua empresa precisa, em um só lugar.</p>
            <p className="relative mt-1.5 max-w-2xl text-sm text-slate-400">Escolha um ambiente e continue trabalhando sem menus duplicados.</p>
            <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-teal-400/20 bg-[#081b27]/80 px-3 py-2 text-xs text-slate-300"><Layers3 size={17} className="text-teal-300" /> <strong className="text-white">{authorized.length} serviços autorizados</strong> para seu acesso</div>
          </section>
          <div className="mb-4 flex flex-wrap items-center gap-3 sm:hidden">
            <div className="relative w-full"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar serviço..." className="w-full rounded-xl border border-white/10 bg-[#142232] py-2.5 pl-10 pr-3 text-sm" /></div>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Seus ambientes</h2>
            <select aria-label="Filtrar grupo" value={section} onChange={e => setSection(e.target.value)} className="rounded-lg border border-white/10 bg-[#142232] px-3 py-2 text-xs text-slate-200">{sections.map(group => <option key={group} value={group}>{group}</option>)}</select>
          </div>
          <section aria-label="Serviços" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(module => {
              const info = TAD_LABELS[module.key];
              const canOpen = authorized.some(m => m.key === module.key) && !!module.route;
              const isBrand = module.key === "crm" || module.key === "arqdor";
              const hasArchitecture = architecturalModules.has(module.key);
              const body = <div className={"relative flex min-h-[196px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br bg-[#101f2d] p-5 transition-all hover:-translate-y-0.5 hover:border-teal-400/40 hover:shadow-[0_15px_32px_rgba(0,0,0,.22)] " + (themeMap[module.key] ?? "from-slate-500/10 to-transparent")}>
                
                {hasArchitecture ? <img src="/brand/tad-architecture.svg" alt="" className="pointer-events-none absolute right-0 top-0 h-full w-[63%] object-cover object-center opacity-65" /> : <div className="pointer-events-none absolute right-3 top-12 hidden h-[115px] w-[43%] rotate-[-4deg] overflow-hidden rounded-lg border border-white/10 bg-[#081523]/90 p-2 shadow-2xl sm:block" aria-hidden="true">
                  <div className="mb-2 flex gap-1 border-b border-white/10 pb-1"><i className="h-1.5 w-1.5 rounded-full bg-teal-400/60"/><i className="h-1.5 w-1.5 rounded-full bg-blue-400/60"/><i className="h-1.5 w-1.5 rounded-full bg-violet-400/60"/></div>
                  {module.key === "agenda" ? <div className="grid h-[82px] grid-cols-5 gap-1">{Array.from({length:15},(_,i)=><span key={i} className={"rounded-sm " + (i===6 || i===8 ? "bg-blue-500/75" : i===11 ? "bg-teal-500/60" : "bg-white/[.06]")}/>)}</div> : <div className="flex h-[80px] items-end gap-2">{[32,55,42,72,60,85].map((h,i)=><span key={i} className="flex-1 rounded-t bg-gradient-to-t from-teal-700/40 to-cyan-400/75" style={{height: h + "%"}} />)}</div>}
                </div>}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#101f2d]/95 via-[#101f2d]/80 to-transparent" />
                <div className="relative flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-teal-300">{info?.section ?? "Serviço"}</span><ArrowUpRight size={16} className="text-slate-400" /></div>
                <div className="relative mt-3 flex items-center gap-3">
                  {module.key === "crm" ? <img src="/logo-full-light.svg" alt="Vendor.ai" className="h-9 w-auto max-w-[150px] object-contain object-left" /> :
                   module.key === "arqdor" ? <img src="/brand/arqdor-logo.png" alt="Arqdor" className="h-11 w-auto max-w-[160px] object-contain object-left" /> :
                   <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-teal-300">{renderIcon(module.key, 23)}</span>}
                  {!isBrand && <h3 className="text-xl font-semibold tracking-tight text-white">{module.key === "marketplace_casa" ? "Praça.ai" : module.title}</h3>}
                </div>
                <div className="relative mt-2">
                  {isBrand && <h3 className="text-base font-semibold text-white">{module.title}</h3>}
                  <p className="mt-1 max-w-[190px] text-[13px] leading-relaxed text-slate-400">{info?.description ?? "Ambiente do ecossistema"}</p>
                </div>
                <div className="relative mt-4 inline-flex w-fit items-center gap-3 rounded-full border border-white/20 bg-white/[.055] px-4 py-2 text-xs font-semibold text-white">{canOpen ? "Acessar" : "Acesso em validação"}<ArrowRight size={15} /></div>
              </div>;
              return canOpen
                ? <Link key={module.key} href={module.route} className="block outline-offset-4" aria-label={"Abrir " + module.title}>{body}</Link>
                : <div key={module.key} aria-disabled="true" className="opacity-65">{body}</div>;
            })}
          </section>
          {visible.length === 0 && <p role="status" className="mt-8 text-center text-sm text-slate-400">{listed.length === 0 ? "Nenhum serviço habilitado para este perfil. Solicite acesso ao administrador." : "Nenhum serviço corresponde à sua busca."}</p>}
        </div>
      </div>
    </main>
  );
}
