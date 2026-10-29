import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Radar, HelpCircle, ChevronDown, ChevronLeft, ChevronRight, ArrowRight, CalendarDays, Megaphone, BriefcaseBusiness, HardHat, Package, Store, ChartNoAxesCombined, Bot, Settings, Headphones, Layers3, LogOut, Users, MessageSquare, ShoppingBag, UserRound, ShieldCheck, Plug, SlidersHorizontal, BookOpen, CircleHelp, Building2, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NovidadesBell } from "@/components/NovidadesBell";
import { resolveTadLauncherModules, type LauncherAudience, type LauncherModule } from "@/lib/adaptiveModuleLauncher";

/**
 * TAD — selectable ecosystem start screen (neon dark).
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
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";
const TOKEN_KEY = "vendorai_token";

const TAD_LABELS: Partial<Record<LauncherModule, { description: string; section: string }>> = {
  prospector: { description: "Pesquisa de empresas e qualificação por IA", section: "Comercial" },
  crm: { description: "Clientes, oportunidades, pipeline e propostas", section: "Comercial" },
  marketing: { description: "Campanhas, anúncios e conteúdos", section: "Crescimento" },
  omnichannel: { description: "Conversas e atendimento integrado", section: "Comercial" },
  agenda: { description: "Compromissos, tarefas e visitas", section: "Produtividade" },
  arqdor: { description: "Projetos, modelagem, render e especificações", section: "Projetos" },
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
  arqdor: Layers3, obras: HardHat, pdv: ShoppingBag, erp: Package,
  marketplace_casa: Store, parceiros: BriefcaseBusiness, portal_cliente: UserRound,
  inteligencia: ChartNoAxesCombined, agentes_ia: Bot, configuracoes: Settings, suporte: Headphones,
};

type Tone = { label: string; tile: string; card: string; bar: string };
// Classes completas (estáticas) para o Tailwind gerar o CSS de cada tom neon.
const TONES = {
  cyan: { label: "text-cyan-300", tile: "from-cyan-400 to-blue-600 shadow-[0_0_24px_-4px_rgba(34,211,238,.75)]", card: "from-cyan-500/[.13] border-cyan-400/25 hover:border-cyan-300/70 hover:shadow-[0_0_36px_-10px_rgba(34,211,238,.7)]", bar: "from-cyan-600/40 to-cyan-300" },
  violet: { label: "text-violet-300", tile: "from-violet-500 to-indigo-600 shadow-[0_0_24px_-4px_rgba(139,92,246,.75)]", card: "from-violet-500/[.14] border-violet-400/25 hover:border-violet-300/70 hover:shadow-[0_0_36px_-10px_rgba(139,92,246,.7)]", bar: "from-violet-700/40 to-violet-400" },
  sky: { label: "text-sky-300", tile: "from-sky-400 to-blue-600 shadow-[0_0_24px_-4px_rgba(56,189,248,.75)]", card: "from-sky-500/[.12] border-sky-400/25 hover:border-sky-300/70 hover:shadow-[0_0_36px_-10px_rgba(56,189,248,.7)]", bar: "from-sky-700/40 to-sky-300" },
  rose: { label: "text-rose-300", tile: "from-rose-400 to-red-600 shadow-[0_0_24px_-4px_rgba(251,113,133,.75)]", card: "from-rose-500/[.12] border-rose-400/25 hover:border-rose-300/70 hover:shadow-[0_0_36px_-10px_rgba(251,113,133,.7)]", bar: "from-rose-700/40 to-rose-300" },
  amber: { label: "text-amber-300", tile: "from-amber-400 to-orange-600 shadow-[0_0_24px_-4px_rgba(245,158,11,.75)]", card: "from-amber-500/[.13] border-amber-400/25 hover:border-amber-300/70 hover:shadow-[0_0_36px_-10px_rgba(245,158,11,.7)]", bar: "from-amber-700/40 to-amber-300" },
  blue: { label: "text-blue-300", tile: "from-blue-400 to-indigo-600 shadow-[0_0_24px_-4px_rgba(59,130,246,.75)]", card: "from-blue-500/[.13] border-blue-400/25 hover:border-blue-300/70 hover:shadow-[0_0_36px_-10px_rgba(59,130,246,.7)]", bar: "from-blue-700/40 to-cyan-300" },
  orange: { label: "text-orange-300", tile: "from-orange-400 to-amber-700 shadow-[0_0_24px_-4px_rgba(249,115,22,.75)]", card: "from-orange-500/[.13] border-orange-400/25 hover:border-orange-300/70 hover:shadow-[0_0_36px_-10px_rgba(249,115,22,.7)]", bar: "from-orange-700/40 to-orange-300" },
  fuchsia: { label: "text-fuchsia-300", tile: "from-fuchsia-500 to-purple-700 shadow-[0_0_24px_-4px_rgba(217,70,239,.75)]", card: "from-fuchsia-500/[.13] border-fuchsia-400/25 hover:border-fuchsia-300/70 hover:shadow-[0_0_36px_-10px_rgba(217,70,239,.7)]", bar: "from-purple-700/40 to-cyan-300" },
  indigo: { label: "text-indigo-300", tile: "from-indigo-400 to-violet-700 shadow-[0_0_24px_-4px_rgba(99,102,241,.75)]", card: "from-indigo-500/[.14] border-indigo-400/25 hover:border-indigo-300/70 hover:shadow-[0_0_36px_-10px_rgba(99,102,241,.7)]", bar: "from-indigo-700/40 to-indigo-300" },
  slate: { label: "text-cyan-200", tile: "from-slate-600 to-slate-800 shadow-[0_0_22px_-6px_rgba(148,163,184,.6)]", card: "from-slate-400/[.08] border-slate-400/20 hover:border-slate-300/60 hover:shadow-[0_0_36px_-10px_rgba(148,163,184,.55)]", bar: "from-slate-700/40 to-slate-300" },
  teal: { label: "text-teal-300", tile: "from-teal-400 to-emerald-600 shadow-[0_0_24px_-4px_rgba(45,212,191,.75)]", card: "from-teal-500/[.12] border-teal-400/25 hover:border-teal-300/70 hover:shadow-[0_0_36px_-10px_rgba(45,212,191,.7)]", bar: "from-teal-700/40 to-teal-300" },
} satisfies Record<string, Tone>;

const MODULE_TONE: Partial<Record<LauncherModule, Tone>> = {
  crm: TONES.cyan, prospector: TONES.teal, marketing: TONES.violet, omnichannel: TONES.teal, agenda: TONES.sky,
  arqdor: TONES.rose, obras: TONES.amber, pdv: TONES.teal, erp: TONES.blue,
  marketplace_casa: TONES.orange, parceiros: TONES.teal, portal_cliente: TONES.teal,
  inteligencia: TONES.fuchsia, agentes_ia: TONES.indigo, configuracoes: TONES.slate, suporte: TONES.blue,
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
    <main className="min-h-screen w-full bg-[#050b14] bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,.08),transparent_55%)] font-sans text-slate-100" aria-label="TAD Central do ecossistema">
      {/* ── Barra superior ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between gap-2 border-b border-white/[.07] bg-[#070f1a]/90 px-3 backdrop-blur-md sm:gap-3 md:px-7">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link href="/tad" className={"shrink-0 rounded-md " + FOCUS} aria-label="Vendor.ai — início do TAD">
            <img src="/logo-full-dark.svg" alt="Vendor.ai" className="h-8 w-auto max-w-[132px] object-contain sm:h-9 sm:max-w-[176px]" />
          </Link>
          <div className="relative hidden w-full max-w-[520px] md:block">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="tad-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no TAD..." aria-label="Buscar serviço" className="w-full rounded-xl border border-white/10 bg-[#0e1b2c] py-2.5 pl-11 pr-16 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,.12)]" />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[.04] px-2 py-0.5 font-sans text-[10px] font-medium text-slate-400">Ctrl + K</kbd>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
          <CompanySwitcher companyName={companyName} />
          <Link href="/faq" className={"hidden rounded-lg p-2 text-slate-300 hover:bg-white/5 sm:block " + FOCUS} aria-label="Ajuda e perguntas frequentes"><HelpCircle size={18} /></Link>
          <NovidadesBell variant="icon" />
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setMenuOpen(o => !o)} className={"flex items-center gap-2 rounded-xl border border-white/10 p-1 hover:bg-white/5 md:py-1.5 md:pl-1.5 md:pr-2 " + FOCUS} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menu da conta">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-bold text-white">{initials}</span>
              <span className="hidden text-left leading-tight md:block"><span className="block max-w-[140px] truncate text-xs font-semibold text-white">{user?.name ?? "Usuário"}</span><span className="block text-[10px] text-slate-400">{roleLabel}</span></span>
              <ChevronDown size={14} className="hidden text-slate-400 md:block" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-40 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0c1829] shadow-2xl">
                <div className="border-b border-white/10 px-4 py-3"><p className="truncate text-sm font-semibold text-white">{user?.name ?? "Usuário"}</p><p className="truncate text-[11px] text-slate-400">{roleLabel}</p></div>
                <Link href="/faq" role="menuitem" onClick={() => setMenuOpen(false)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5"><HelpCircle size={15} /> Ajuda</Link>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); logout(); setLocation("/"); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5"><LogOut size={15} /> Sair</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1520px] px-3 pb-12 pt-4 sm:px-4 md:px-7 md:pt-5">
        {/* Central de Ambientes: cabeçalho compacto, sem banner de setor específico. */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-[#0b1726] px-5 py-6 md:px-8 md:py-7" aria-labelledby="tad-welcome-title">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-400">Vendor.ai · Central de Ambientes</p>
          <h1 id="tad-welcome-title" className={DISPLAY + " mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl"}>Escolha onde trabalhar</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">Cada ambiente reúne suas ferramentas e funcionalidades. Selecione um módulo abaixo para começar.</p>
        </section>

        {/* ── Busca (mobile) + filtro ────────────────────────────────── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full md:hidden">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input id="tad-search-mobile" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no TAD..." aria-label="Buscar serviço" className="w-full rounded-xl border border-white/10 bg-[#0e1b2c] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/60" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:w-full">
            <h2 className={DISPLAY + " text-sm font-semibold text-white"}>{isPlatformSuperAdmin ? "Todos os módulos do ecossistema" : "Seus ambientes"}</h2>
            <select aria-label="Filtrar por área" value={section} onChange={e => setSection(e.target.value)} className="rounded-lg border border-white/10 bg-[#0e1b2c] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/60">
              {sections.map(group => <option key={group} value={group}>{group}</option>)}
            </select>
          </div>
        </div>

        {/* ── Grade de serviços ──────────────────────────────────────── */}
        <section aria-label="Serviços" className="grid grid-cols-2 gap-2.5 sm:gap-3.5 xl:grid-cols-3">
          {visible.map(module => {
            const info = TAD_LABELS[module.key];
            const sectionName = info?.section ?? "Serviço";
            const tone = MODULE_TONE[module.key] ?? TONES.cyan;
            const Icon = ICON_MAP[module.key] ?? Layers3;
            const canOpen = authorized.some(m => m.key === module.key) && !!module.route;
            const wide = WIDE_MODULES.has(module.key);
            const title = titleFor(module.key, module.title);
            return (
              <article
                key={module.key}
                aria-disabled={canOpen ? undefined : true}
                className={"group relative flex gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br via-[#0a1524] to-[#08111d] p-3.5 transition-all duration-200 sm:min-h-[190px] sm:gap-4 sm:p-5 motion-safe:hover:-translate-y-0.5 " + tone.card + (wide ? " col-span-2 min-h-[120px] sm:min-h-[132px]" : " min-h-[150px]") + (canOpen ? "" : " opacity-60")}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start gap-2.5 sm:gap-3.5">
                    <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white sm:h-14 sm:w-14 sm:rounded-2xl " + tone.tile}>
                      <Icon className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <span className={"block text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] " + tone.label}>{sectionName}</span>
                      <h3 className={DISPLAY + " mt-0.5 text-[15px] font-semibold leading-tight tracking-tight text-white sm:text-xl"}>{title}</h3>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-400 sm:mt-3 sm:text-[13px] sm:leading-relaxed">{info?.description ?? "Ambiente do ecossistema"}</p>
                  <div className="mt-auto pt-3 sm:pt-4">
                    {canOpen ? (
                      <Link href={module.route ?? "/tad"} aria-label={"Acessar " + title} className={"inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.05] px-4 py-2 text-xs font-semibold text-white transition after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:border-cyan-300/60 group-hover:text-cyan-100 " + FOCUS}>
                        Acessar<ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-400">{isPlatformSuperAdmin && module.route === null ? "Tela em integração" : "Acesso em validação"}</span>
                    )}
                  </div>
                </div>
                <div className={"hidden shrink-0 overflow-hidden rounded-xl sm:block " + (wide ? "w-[48%] max-w-[420px]" : "w-[42%] max-w-[230px]")}>{renderPreview(module.key, tone, canOpen)}</div>
              </article>
            );
          })}
        </section>
        {visible.length === 0 && <p role="status" className="mt-10 text-center text-sm text-slate-400">{listed.length === 0 ? "Nenhum serviço habilitado para este perfil. Solicite acesso ao administrador." : "Nenhum serviço corresponde à sua busca."}</p>}
      </div>
    </main>
  );
}
