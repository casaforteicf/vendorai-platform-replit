import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, Bell, HelpCircle, ChevronDown, ArrowRight, CalendarDays, Megaphone, BriefcaseBusiness, HardHat, Package, Store, ChartNoAxesCombined, Bot, Settings, Headphones, Layers3, LogOut, Users, MessageSquare, ShoppingBag, UserRound, ArrowUpRight, ShieldCheck, Plug, SlidersHorizontal, BookOpen, LifeBuoy, GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LAUNCHER_MODULES, authorizedLauncherModules, type LauncherAudience, type LauncherModule } from "@/lib/adaptiveModuleLauncher";

/**
 * TAD — selectable ecosystem start screen (Studio 2.0 dark).
 * Pass ONLY server-verified entitlements and effective permissions.
 * This component deliberately does not infer permissions from a user role.
 */
export interface TadCentralProps {
  audience: LauncherAudience;
  enabledModules: readonly LauncherModule[];
  permittedModules: readonly LauncherModule[];
  previewModules?: readonly LauncherModule[];
  companyName?: string;
  notificationCount?: number;
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
  marketplace_casa: { description: "Produtos, serviços e anunciantes", section: "Marketplace" },
  parceiros: { description: "Parceiros e fornecedores", section: "Rede" },
  portal_cliente: { description: "Projetos, pedidos e solicitações", section: "Relacionamento" },
  inteligencia: { description: "Indicadores e insights de inteligência de negócio", section: "Inteligência" },
  agentes_ia: { description: "Venda e agentes inteligentes para o seu negócio", section: "Inteligência" },
  configuracoes: { description: "Usuários, permissões e integrações", section: "Administração" },
  suporte: { description: "Ajuda, perguntas frequentes e orientação", section: "Suporte" },
};

// Cor do rótulo de categoria por seção — fiel ao mockup aprovado.
const SECTION_TONE: Record<string, string> = {
  Comercial: "text-cyan-300",
  Crescimento: "text-violet-300",
  Produtividade: "text-sky-300",
  Projetos: "text-rose-300",
  Operação: "text-amber-300",
  Marketplace: "text-orange-300",
  Inteligência: "text-fuchsia-300",
  Administração: "text-slate-300",
  Suporte: "text-blue-300",
};

const ICON_MAP: Partial<Record<LauncherModule, typeof Users>> = {
  crm: Users, marketing: Megaphone, omnichannel: MessageSquare, agenda: CalendarDays,
  arqdor: Layers3, obras: HardHat, pdv: ShoppingBag, erp: Package,
  marketplace_casa: Store, parceiros: BriefcaseBusiness, portal_cliente: UserRound,
  inteligencia: ChartNoAxesCombined, agentes_ia: Bot, configuracoes: Settings, suporte: Headphones,
};

const ICON_TILE: Partial<Record<LauncherModule, string>> = {
  crm: "bg-cyan-500/15 text-cyan-300", marketing: "bg-violet-500/15 text-violet-300",
  agenda: "bg-sky-500/15 text-sky-300", arqdor: "bg-rose-500/15 text-rose-300",
  obras: "bg-amber-500/15 text-amber-300", erp: "bg-sky-500/15 text-sky-300",
  marketplace_casa: "bg-orange-500/15 text-orange-300", inteligencia: "bg-fuchsia-500/15 text-fuchsia-300",
  agentes_ia: "bg-indigo-500/15 text-indigo-300", configuracoes: "bg-slate-500/20 text-slate-200",
  suporte: "bg-blue-500/15 text-blue-300", omnichannel: "bg-cyan-500/15 text-cyan-300",
  pdv: "bg-emerald-500/15 text-emerald-300", parceiros: "bg-teal-500/15 text-teal-300",
  portal_cliente: "bg-teal-500/15 text-teal-300",
};

const PHOTO: Partial<Record<LauncherModule, string>> = {
  arqdor: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=760&q=80",
  obras: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=760&q=80",
};

const MARKETPLACE_TILES = [
  { label: "Apartamentos", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=320&q=70" },
  { label: "Casas", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=320&q=70" },
  { label: "Terrenos", image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=320&q=70" },
];

const CONFIG_ITEMS = [
  { icon: Users, label: "Usuários" },
  { icon: ShieldCheck, label: "Permissões" },
  { icon: Plug, label: "Integrações" },
  { icon: SlidersHorizontal, label: "Personalização" },
];

const SUPPORT_ACTIONS = [
  { icon: BookOpen, label: "Tutoriais" },
  { icon: GraduationCap, label: "Base de Conhecimento" },
  { icon: LifeBuoy, label: "Falar com o Suporte" },
];

export default function TadCentral({ audience, enabledModules, permittedModules, previewModules = [], companyName, notificationCount = 0 }: TadCentralProps) {
  const { user, logout, isEffectiveAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("Todos");
  const [menuOpen, setMenuOpen] = useState(false);

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

  const renderIcon = (key: LauncherModule, size = 20) => {
    const Icon = ICON_MAP[key] ?? Layers3;
    return <Icon size={size} strokeWidth={1.9} aria-hidden="true" />;
  };
  const titleFor = (m: LauncherModule, fallback: string) => (m === "marketplace_casa" ? "Praça.ai" : fallback);

  const initials = ((user?.name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("")) || "U";
  const roleLabel = isEffectiveAdmin ? "Administrador" : "Usuário";

  // Mini-preview à direita de cada card (decorativo; nunca substitui a ação real).
  const renderPreview = (key: LauncherModule) => {
    if (PHOTO[key]) {
      return <img src={PHOTO[key]} alt="" loading="lazy" className="h-full w-full rounded-xl object-cover opacity-90" />;
    }
    if (key === "agenda") {
      const days = Array.from({ length: 21 }, (_, i) => i + 2);
      return (
        <div className="flex h-full w-full flex-col rounded-xl border border-white/10 bg-[#0b1726] p-3 text-[10px] text-slate-400">
          <div className="mb-2 flex items-center justify-between text-slate-200"><ChevronDown size={12} className="rotate-90" /><span className="font-semibold">Este mês</span><ChevronDown size={12} className="-rotate-90" /></div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i} className="text-slate-500">{d}</span>)}
            {days.map(d => <span key={d} className={"rounded py-0.5 " + (d === 12 ? "bg-sky-500 font-bold text-white" : "text-slate-300")}>{d}</span>)}
          </div>
        </div>
      );
    }
    if (key === "marketplace_casa") {
      return (
        <div className="grid h-full w-full grid-cols-3 gap-1.5">
          {MARKETPLACE_TILES.map(t => (
            <div key={t.label} className="relative overflow-hidden rounded-lg border border-white/10">
              <img src={t.image} alt="" loading="lazy" className="h-full w-full object-cover opacity-90" />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] font-medium text-white">{t.label}</span>
            </div>
          ))}
        </div>
      );
    }
    if (key === "configuracoes") {
      return (
        <div className="flex h-full w-full flex-col justify-center gap-1.5 rounded-xl border border-white/10 bg-[#0b1726] p-3">
          {CONFIG_ITEMS.map(item => (
            <div key={item.label} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/5">
              <span className="flex items-center gap-2"><item.icon size={13} className="text-slate-400" />{item.label}</span>
              <ArrowRight size={11} className="text-slate-500" />
            </div>
          ))}
        </div>
      );
    }
    if (key === "suporte") {
      return (
        <div className="flex h-full w-full flex-col justify-center gap-2 rounded-xl border border-white/10 bg-[#0b1726] p-3">
          {SUPPORT_ACTIONS.map(a => (
            <div key={a.label} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-[11px] text-slate-200">
              <a.icon size={13} className="text-blue-300" />{a.label}
            </div>
          ))}
        </div>
      );
    }
    if (key === "agentes_ia") {
      return (
        <div className="flex h-full w-full flex-col justify-center gap-2 rounded-xl border border-white/10 bg-[#0b1726] p-3">
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-indigo-500/25 px-3 py-2 text-[11px] text-slate-100">Como posso ajudar sua equipe hoje?</div>
          <div className="mr-auto flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white/[.06] px-3 py-2 text-[11px] text-slate-300"><Bot size={13} className="text-indigo-300" />Analisando oportunidades…</div>
        </div>
      );
    }
    // Default: mini-gráfico de barras (dashboard).
    const bars = key === "erp" ? [38, 46, 41, 58, 70, 86] : [28, 44, 36, 62, 54, 80];
    const positive = key === "erp" || key === "inteligencia" || key === "marketing";
    return (
      <div className="flex h-full w-full flex-col rounded-xl border border-white/10 bg-[#0b1726] p-3">
        {positive && <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-400"><ArrowUpRight size={13} />{key === "erp" ? "+18%" : "+32%"}</div>}
        <div className="flex flex-1 items-end gap-1.5">
          {bars.map((h, i) => <span key={i} className="flex-1 rounded-t bg-gradient-to-t from-sky-600/40 to-cyan-400/90" style={{ height: h + "%" }} />)}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen w-full bg-[#060d16] font-sans text-slate-100" aria-label="TAD Central do ecossistema">
      {/* ── Barra superior ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between gap-3 border-b border-white/[.07] bg-[#070f1a]/95 px-4 backdrop-blur md:px-7">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <img src="/logo-full-light.svg" alt="Vendor.ai" className="h-7 w-auto max-w-[130px] shrink-0 object-contain" />
          <div className="relative hidden w-full max-w-[520px] md:block">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="tad-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no TAD..." aria-label="Buscar serviço" className="w-full rounded-xl border border-white/10 bg-[#101d2e] py-2.5 pl-11 pr-16 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/60" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[.04] px-2 py-0.5 text-[10px] font-medium text-slate-400">Ctrl + K</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {companyName && (
            <div className="hidden max-w-[200px] items-center gap-2 truncate rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-slate-200 md:flex">
              <BriefcaseBusiness size={15} className="shrink-0 text-cyan-300" /><span className="truncate">{companyName}</span><ChevronDown size={13} className="shrink-0 text-slate-400" />
            </div>
          )}
          <button type="button" className="hidden rounded-lg p-2 text-slate-300 hover:bg-white/5 sm:block" aria-label="Ajuda"><HelpCircle size={18} /></button>
          <button type="button" className="relative rounded-lg p-2 text-slate-300 hover:bg-white/5" aria-label={notificationCount > 0 ? `Notificações: ${notificationCount} não lidas` : "Notificações"}>
            <Bell size={18} />
            {notificationCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#070f1a]">{notificationCount > 99 ? "99+" : notificationCount}</span>}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen(o => !o)} className="flex items-center gap-2 rounded-xl border border-white/10 py-1.5 pl-1.5 pr-2 hover:bg-white/5" aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">{initials}</span>
              <span className="hidden text-left leading-tight md:block"><span className="block max-w-[140px] truncate text-xs font-semibold text-white">{user?.name ?? "Usuário"}</span><span className="block text-[10px] text-slate-400">{roleLabel}</span></span>
              <ChevronDown size={14} className="hidden text-slate-400 md:block" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-[calc(100%+8px)] w-48 overflow-hidden rounded-xl border border-white/10 bg-[#0c1829] shadow-xl">
                <div className="border-b border-white/10 px-4 py-3"><p className="truncate text-sm font-semibold text-white">{user?.name ?? "Usuário"}</p><p className="truncate text-[11px] text-slate-400">{roleLabel}</p></div>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); logout(); setLocation("/"); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5"><LogOut size={15} /> Sair</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1520px] px-4 pb-12 pt-5 md:px-7">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <section className="relative mb-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1a28]">
          <img src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=85" alt="" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[62%] object-cover object-center opacity-90 md:block" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#081521] via-[#081521]/92 via-42% to-transparent" />
          <div className="relative z-10 flex flex-col gap-6 px-6 py-8 md:flex-row md:items-start md:justify-between md:px-9 md:py-11">
            <div className="max-w-xl">
              <p className="text-[11px] font-bold uppercase tracking-[.24em] text-cyan-300">TAD · Central do ecossistema</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-[44px] md:leading-[1.05]">Bem-vindo ao <span className="text-cyan-300">TAD</span></h1>
              <p className="mt-3 text-base font-semibold text-slate-100">Tudo que sua empresa precisa, em um só lugar.</p>
              <p className="mt-1 text-sm text-slate-300">Escolha um ambiente e continue trabalhando sem menus duplicados.</p>
            </div>
div>
          </div>
        </section>

        {/* ── Busca (mobile) + filtro ────────────────────────────────── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:hidden">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar serviço..." className="w-full rounded-xl border border-white/10 bg-[#101d2e] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          </div>
          <h2 className="text-sm font-semibold text-white">Seus ambientes</h2>
          <select aria-label="Filtrar grupo" value={section} onChange={e => setSection(e.target.value)} className="rounded-lg border border-white/10 bg-[#101d2e] px-3 py-2 text-xs text-slate-200 outline-none">
            {sections.map(group => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>

        {/* ── Grade de serviços ──────────────────────────────────────── */}
        <section aria-label="Serviços" className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(module => {
            const info = TAD_LABELS[module.key];
            const sectionName = info?.section ?? "Serviço";
            const canOpen = authorized.some(m => m.key === module.key) && !!module.route;
            const body = (
              <div className="group flex min-h-[148px] gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1a2a] p-3.5 transition-all sm:min-h-[186px] sm:gap-4 sm:p-5 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:shadow-[0_16px_34px_rgba(0,0,0,.28)]">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={"text-[11px] font-semibold uppercase tracking-wide " + (SECTION_TONE[sectionName] ?? "text-slate-300")}>{sectionName}</span>
                  <div className="mt-2 flex items-center gap-2 sm:gap-3">
                    <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 " + (ICON_TILE[module.key] ?? "bg-white/10 text-cyan-300")}>{renderIcon(module.key, 22)}</span>
                    <h3 className="truncate text-base font-semibold tracking-tight text-white sm:text-xl">{titleFor(module.key, module.title)}</h3>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-slate-400 sm:mt-2 sm:text-[13px] sm:leading-relaxed">{info?.description ?? "Ambiente do ecossistema"}</p>
                  <div className="mt-auto pt-2 sm:pt-4">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.05] px-4 py-2 text-xs font-semibold text-white transition group-hover:border-cyan-400/50 group-hover:text-cyan-200">
                      {canOpen ? "Acessar" : "Acesso em validação"}<ArrowRight size={14} />
                    </span>
                  </div>
                </div>
                <div className="w-[34%] max-w-[230px] shrink-0 overflow-hidden rounded-xl sm:w-[42%]">{renderPreview(module.key)}</div>
              </div>
            );
            return canOpen
              ? <Link key={module.key} href={module.route ?? "/tad"} className="block rounded-2xl outline-offset-4" aria-label={"Abrir " + module.title}>{body}</Link>
              : <div key={module.key} aria-disabled="true" className="cursor-not-allowed opacity-60">{body}</div>;
          })}
        </section>
        {visible.length === 0 && <p role="status" className="mt-10 text-center text-sm text-slate-400">{listed.length === 0 ? "Nenhum serviço habilitado para este perfil. Solicite acesso ao administrador." : "Nenhum serviço corresponde à sua busca."}</p>}
      </div>
    </main>
  );
}
