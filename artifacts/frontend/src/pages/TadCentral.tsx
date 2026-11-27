import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Radar, HelpCircle, ChevronDown, ChevronLeft, ChevronRight, ArrowRight, CalendarDays, Megaphone, BriefcaseBusiness, HardHat, Package, Store, ChartNoAxesCombined, Bot, Settings, Headphones, Layers3, LogOut, Users, MessageSquare, ShoppingBag, UserRound, ShieldCheck, Plug, SlidersHorizontal, BookOpen, CircleHelp, Building2, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NovidadesBell } from "@/components/NovidadesBell";
import { Input } from "@/components/ui/input";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { resolveTadLauncherModules, type LauncherAudience, type LauncherModule } from "@/lib/adaptiveModuleLauncher";

/**
 * TAD — Central de Ambientes no shell padrão do sistema.
 * Tenant users receive only verified entitlements and effective permissions.
 * Platform Superadmin may inspect the full launcher catalog. This is a UI
 * navigation rule, not a bypass for authorization checks in destination APIs.
 */
export interface TadCentralProps {
  audience: LauncherAudience;
  enabledModules: readonly LauncherModule[];
  permittedModules: readonly LauncherModule[];
  previewModules?: readonly LauncherModule[];
  companyName?: string;
}

const DISPLAY = "font-['Sora',_'Inter',_sans-serif]";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300";
const TOKEN_KEY = "vendorai_token";

const TAD_LABELS: Partial<Record<LauncherModule, { description: string; section: string }>> = {
  prospector: { description: "Pesquisa de empresas e qualificação por IA", section: "Comercial" },
  crm: { description: "Clientes, oportunidades, pipeline e propostas", section: "Comercial" },
  marketing: { description: "Campanhas, anúncios e conteúdos", section: "Crescimento" },
  omnichannel: { description: "Conversas e atendimento integrado", section: "Comercial" },
  agenda: { description: "Compromissos, tarefas e visitas", section: "Produtividade" },
  arqdor: { description: "Projetos, modelagem, render e especificações", section: "Projetos" },
  hotelaria: { description: "Recepção, reservas, quartos, hóspedes e operações", section: "Operação" },
  obras: { description: "Processos, equipes e entregas por segmento", section: "Operação" },
  pdv: { description: "Vendas de balcão", section: "Operação" },
  erp: { description: "Gestão operacional e financeira", section: "Operação" },
  marketplace_casa: { description: "Produtos, serviços e anunciantes", section: "Marketplace" },
  parceiros: { description: "Parceiros e fornecedores", section: "Rede" },
  portal_cliente: { description: "Projetos, pedidos e solicitações", section: "Relacionamento" },
  inteligencia: { description: "Indicadores e insights de inteligência do negócio", section: "Inteligência" },
  agentes_ia: { description: "Vendas e agentes inteligentes para o seu negócio", section: "Inteligência" },
  configuracoes: { description: "Usuários, permissões e integrações", section: "Administração" },
  suporte: { description: "Ajuda, perguntas frequentes e orientação", section: "Suporte" },
};

const ICON_MAP: Partial<Record<LauncherModule, typeof Users>> = {
  crm: Users, prospector: Radar, marketing: Megaphone, omnichannel: MessageSquare, agenda: CalendarDays,
  arqdor: Layers3, hotelaria: Building2, obras: HardHat, pdv: ShoppingBag, erp: Package,
  marketplace_casa: Store, parceiros: BriefcaseBusiness, portal_cliente: UserRound,
  inteligencia: ChartNoAxesCombined, agentes_ia: Bot, configuracoes: Settings, suporte: Headphones,
};

type Tone = { label: string; tile: string; card: string; bar: string };
// Classes completas (estáticas) para o Tailwind gerar o CSS de cada tom neon.
const TONES = {
  blue: { label: "text-blue-300", tile: "from-blue-400 to-blue-600 shadow-[0_0_24px_-4px_rgba(59,130,246,.45)]", card: "from-blue-500/[.13] border-blue-400/25 hover:border-blue-300/70 hover:shadow-[0_0_36px_-10px_rgba(59,130,246,.4)]", bar: "from-blue-700/40 to-blue-300" },
}

const MODULE_TONE: Partial<Record<LauncherModule, Tone>> = {
  crm: TONES.blue, prospector: TONES.blue, marketing: TONES.blue, omnichannel: TONES.blue,
  agenda: TONES.blue, arqdor: TONES.blue, hotelaria: TONES.blue, obras: TONES.blue, pdv: TONES.blue,
  erp: TONES.blue, marketplace_casa: TONES.blue, parceiros: TONES.blue, portal_cliente: TONES.blue,
  inteligencia: TONES.blue, agentes_ia: TONES.blue, configuracoes: TONES.blue, suporte: TONES.blue,
};

const PHOTO: Partial<Record<LauncherModule, string>> = {
  arqdor: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=760&q=80",
};

const MARKETPLACE_TILES = [
  { label: "Apartamentos", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=320&q=70" },
  { label: "Casas", image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=320&q=70" },
  { label: "Terrenos", image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=320&q=70" },
];

const CONFIG_LINKS = [
  { icon: Users, label: "Usuários", href: "/usuarios" },
  { icon: ShieldCheck, label: "Equipe e permissões", href: "/configuracoes/equipe" },
  { icon: Plug, label: "Integrações", href: "/configuracoes/integracoes" },
  { icon: SlidersHorizontal, label: "Todas as configurações", href: "/configuracoes" },
];

const SUPPORT_LINKS = [
  { icon: CircleHelp, label: "Perguntas frequentes", href: "/faq" },
  { icon: BookOpen, label: "Base de conhecimento", href: "/base-conhecimento" },
];

const PIPELINE_STAGES = ["Novo", "Negociação", "Fechado"];
const WIDE_MODULES = new Set<LauncherModule>(["suporte"]);

function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  return ref;
}

interface SwitchableTenantsResponse {
  currentTenant: { id: string; name: string } | null;
  tenants: { id: string; name: string }[];
}

/** Seletor de empresa: troca real via /api/auth/switch-tenant (mesmo fluxo do StoreSwitcher). */
function CompanySwitcher({ companyName }: { companyName?: string }) {
  const { token, tenantOverride, clearTenantOverride } = useAuth();
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useMemo(() => () => setOpen(false), []);
  const ref = useDismiss(open, close);

  const { data } = useQuery<SwitchableTenantsResponse>({
    queryKey: ["auth", "switchable-tenants"],
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/auth/switchable-tenants", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { currentTenant: null, tenants: [] };
      return r.json() as Promise<SwitchableTenantsResponse>;
    },
  });

  const others = data?.tenants ?? [];
  const name = companyName ?? data?.currentTenant?.name;
  if (!name) return null;
  // Em preview de tenant (super-admin) o nome exibido não é o tenant do JWT; não oferecer troca.
  const canSwitch = others.length > 0 && !tenantOverride;

  async function handleSwitch(targetTenantId: string) {
    if (switchingTo || !token) return;
    setSwitchingTo(targetTenantId);
    setError(null);
    try {
      const r = await fetch("/api/auth/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetTenantId }),
      });
      if (!r.ok) throw new Error(`switch-tenant ${r.status}`);
      const { token: newToken } = (await r.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, newToken);
      clearTenantOverride();
      window.location.href = "/tad";
    } catch {
      setSwitchingTo(null);
      setError("Não foi possível trocar de empresa. Tente novamente.");
    }
  }

  const label = (
    <>
      <Building2 size={15} className="shrink-0 text-cyan-300" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </>
  );
  const shell = "flex max-w-[150px] items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-2.5 py-2 text-xs text-slate-100 sm:max-w-[220px] sm:px-3";

  if (!canSwitch) return <div className={shell} title="Empresa atual">{label}</div>;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={shell + " hover:border-cyan-400/50 " + FOCUS} aria-haspopup="menu" aria-expanded={open} aria-label={`Empresa atual: ${name}. Trocar de empresa`}>
        {label}
        {switchingTo ? <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" /> : <ChevronDown size={13} className="shrink-0 text-slate-400" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#0c1829] py-1 shadow-2xl">
          <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trocar de empresa</p>
          <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-white"><Check size={15} className="text-cyan-300" /><span className="truncate">{name}</span></div>
          <div className="my-1 border-t border-white/10" />
          {others.map(t => (
            <button key={t.id} type="button" role="menuitem" disabled={!!switchingTo} onClick={() => handleSwitch(t.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50">
              {switchingTo === t.id ? <Loader2 size={15} className="animate-spin text-slate-400" /> : <Building2 size={15} className="text-slate-400" />}
              <span className="truncate">{t.name}</span>
            </button>
          ))}
          {error && <p role="alert" className="border-t border-white/10 px-4 py-2.5 text-xs text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

function CurrentWeeksCalendar() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 7);
  const days = Array.from({ length: 21 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const month = today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-white/10 bg-[#081322]/90 p-3 text-[10px] text-slate-400" aria-hidden="true">
      <div className="mb-2 flex items-center justify-between text-slate-200"><ChevronLeft size={12} /><span className="font-semibold capitalize">{month}</span><ChevronRight size={12} /></div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i} className="text-slate-500">{d}</span>)}
        {days.map(d => {
          const isToday = d.toDateString() === today.toDateString();
          const otherMonth = d.getMonth() !== today.getMonth();
          return <span key={d.toISOString()} className={"rounded py-0.5 " + (isToday ? "bg-sky-500 font-bold text-white shadow-[0_0_12px_rgba(56,189,248,.8)]" : otherMonth ? "text-slate-600" : "text-slate-300")}>{d.getDate()}</span>;
        })}
      </div>
    </div>
  );
}

export default function TadCentral({ audience, enabledModules, permittedModules, previewModules = [], companyName }: TadCentralProps) {
  const { user, logout, isEffectiveAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("Todos");
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useMemo(() => () => setMenuOpen(false), []);
  const menuRef = useDismiss(menuOpen, closeMenu);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const inputs = [document.getElementById("tad-search"), document.getElementById("tad-search-mobile")];
        const visibleInput = inputs.find((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.offsetParent !== null);
        visibleInput?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isPlatformSuperAdmin = user?.platformRole === "super_admin";
  const { authorized, listed } = useMemo(() => resolveTadLauncherModules({
    audience, enabledModules, permittedModules, previewModules, isPlatformSuperAdmin,
  }), [audience, enabledModules, permittedModules, previewModules, isPlatformSuperAdmin]);
  const sections = useMemo(() => ["Todos", ...new Set(listed.map(m => TAD_LABELS[m.key]?.section ?? "Outros"))], [listed]);
  const visible = useMemo(() => listed.filter(m => {
    const label = TAD_LABELS[m.key];
    const matchesSection = section === "Todos" || (label?.section ?? "Outros") === section;
    const matchesSearch = [m.title, label?.description ?? "", label?.section ?? ""]
      .join(" ").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
    return matchesSection && matchesSearch;
  }), [listed, search, section]);

  const titleFor = (m: LauncherModule, fallback: string) => (m === "marketplace_casa" ? "Praça.ai" : fallback);
  const initials = ((user?.name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("")) || "U";
  const roleLabel = isEffectiveAdmin ? "Administrador" : "Usuário";

  // Prévia à direita de cada card. Decorativa, exceto Configurações e Suporte, que levam a rotas reais.
  const renderPreview = (key: LauncherModule, tone: Tone, canOpen: boolean): ReactNode => {
    if (PHOTO[key]) {
      return <img src={PHOTO[key]} alt="" loading="lazy" className="pointer-events-none h-full w-full rounded-xl object-cover opacity-90 [mask-image:linear-gradient(to_left,black_70%,transparent)]" />;
    }
    if (key === "agenda") return <CurrentWeeksCalendar />;
    if (key === "marketplace_casa") {
      return (
        <div className="pointer-events-none grid h-full w-full grid-cols-3 gap-1.5" aria-hidden="true">
          {MARKETPLACE_TILES.map(t => (
            <div key={t.label} className="relative overflow-hidden rounded-lg border border-white/10">
              <img src={t.image} alt="" loading="lazy" className="h-full w-full object-cover opacity-90" />
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[9px] font-medium text-white">{t.label}</span>
            </div>
          ))}
        </div>
      );
    }
    if (key === "configuracoes" || key === "suporte") {
      const links = key === "configuracoes" ? CONFIG_LINKS : SUPPORT_LINKS;
      return (
        <nav aria-label={key === "configuracoes" ? "Atalhos de configurações" : "Atalhos de suporte"} className={"relative z-10 flex h-full w-full flex-col justify-center gap-1 rounded-xl border border-white/10 bg-[#081322]/90 p-2 " + (key === "suporte" ? "sm:flex-row sm:items-center sm:gap-2" : "")}>
          {links.map(item => canOpen ? (
            <Link key={item.href} href={item.href} className={"flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 hover:bg-white/[.07] hover:text-white " + FOCUS}>
              <span className="flex items-center gap-2"><item.icon size={13} className={tone.label} aria-hidden="true" />{item.label}</span>
              <ArrowRight size={11} className="text-slate-500" aria-hidden="true" />
            </Link>
          ) : (
            <span key={item.href} className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-slate-500"><item.icon size={13} aria-hidden="true" />{item.label}</span>
          ))}
        </nav>
      );
    }
    if (key === "agentes_ia") {
      return (
        <div className="pointer-events-none flex h-full w-full flex-col justify-center gap-2 rounded-xl border border-white/10 bg-[#081322]/90 p-3" aria-hidden="true">
          <span className="h-2 w-3/4 rounded-full bg-indigo-400/30" />
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white/[.06] px-3 py-2 text-[11px] text-slate-200"><Bot size={14} className="shrink-0 text-indigo-300" />Como posso ajudar sua equipe hoje?</div>
        </div>
      );
    }
    if (key === "crm") {
      return (
        <div className="pointer-events-none grid h-full w-full grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-[#081322]/90 p-2" aria-hidden="true">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage} className="flex flex-col gap-1">
              <span className="truncate text-[9px] font-semibold text-slate-400">{stage}</span>
              {Array.from({ length: 3 - i }, (_, j) => <span key={j} className={"h-4 rounded-md " + (i === 1 ? "bg-cyan-400/45" : "bg-white/10")} />)}
            </div>
          ))}
        </div>
      );
    }
    const bars = key === "erp" ? [38, 46, 41, 58, 70, 86] : [28, 44, 36, 62, 54, 80];
    return (
      <div className="pointer-events-none flex h-full w-full items-end gap-1.5 rounded-xl border border-white/10 bg-[#081322]/90 p-3" aria-hidden="true">
        {bars.map((h, i) => <span key={i} className={"flex-1 rounded-t bg-gradient-to-t " + tone.bar} style={{ height: h + "%" }} />)}
      </div>
    );
  };

  return (
    <SidebarLayout>
      <main className="min-h-screen bg-muted/30" aria-label="Central de ambientes">
        <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor.ai · Central de ambientes</p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Escolha onde trabalhar</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Cada ambiente reúne as ferramentas do seu dia. Selecione um módulo para começar.</p>
              </div>
              <span className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">{listed.length} ambiente(s)</span>
            </div>
          </header>

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="tad-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar ambiente, módulo ou assunto..."
                aria-label="Buscar ambiente"
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filtrar por área"
              value={section}
              onChange={(event) => setSection(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {sections.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <Link href="/faq" className="inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm hover:bg-muted">Ajuda</Link>
          </section>

          <section aria-label="Ambientes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((module) => {
              const info = TAD_LABELS[module.key];
              const sectionName = info?.section ?? "Serviço";
              const Icon = ICON_MAP[module.key] ?? Layers3;
              const canOpen = authorized.some((item) => item.key === module.key) && Boolean(module.route);
              const title = titleFor(module.key, module.title);
              return (
                <article key={module.key} className="flex min-h-[190px] flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sectionName}</p>
                      <h2 className="mt-0.5 text-lg font-semibold leading-tight text-foreground">{title}</h2>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{info?.description ?? "Ambiente do ecossistema"}</p>
                  <div className="mt-auto pt-5">
                    {canOpen ? (
                      <Link href={module.route ?? "/tad"} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                        Acessar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
                        {isPlatformSuperAdmin && module.route === null ? "Tela em integração" : "Acesso em validação"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {visible.length === 0 && (
            <section className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground" role="status">
              {listed.length === 0 ? "Nenhum ambiente habilitado para este perfil. Solicite acesso ao administrador." : "Nenhum ambiente corresponde à busca."}
            </section>
          )}

          <footer className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Precisa de ajuda para escolher? <Link href="/faq" className="font-medium text-primary hover:underline">Consulte as perguntas frequentes</Link>.
          </footer>
        </div>
      </main>
    </SidebarLayout>
  );
}
