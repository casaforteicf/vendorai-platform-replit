type UserFunction = "vendedor" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro";

import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import {
  LayoutDashboard, Users, Briefcase, MessageSquare, Calendar,
  Settings, LogOut, Megaphone, FileText, Receipt, BrainCircuit,
  Store, Package, Menu, X, Sparkles, Globe, BookOpen, HardHat, Layers,
  Shirt, Tag, ShoppingCart, Heart, Gift, Truck, UtensilsCrossed, Megaphone as MegaphoneIcon,
  BarChart3, ChevronRight, ChevronDown, Target, Trophy, Search, Clapperboard, Building2, AlertCircle, Bot,
  DraftingCompass, FolderOpen, Scissors, User2, Stethoscope, TrendingUp, Zap, ListChecks, Network,
  Handshake, Shield, Cpu, Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logoFull from "/logo-full-light.svg";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, tenantOverride, clearTenantOverride, token } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSuperAdmin = user?.platformRole === "super_admin";

  const { data: openBugsData } = useQuery<{ count: number }>({
    queryKey: ["admin", "bug-reports-open-count"],
    enabled: isSuperAdmin && !!token,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const r = await fetch("/api/admin/bug-reports/open-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return { count: 0 };
      return r.json() as Promise<{ count: number }>;
    },
  });
  const openBugCount = openBugsData?.count ?? 0;
  const isTenantAdmin = user?.platformRole === "tenant_admin";
  const isSeller = user?.platformRole === "tenant_seller";
  const userFunction = user?.userFunction as UserFunction | undefined;
  const effectiveVertical = isSuperAdmin && tenantOverride ? tenantOverride.vertical : user?.tenantVertical;
  const isConstrucao = effectiveVertical === "Construção & Reforma";
  const isVarejo = effectiveVertical === "Varejo de Roupas & Acessórios";
  const isSupermercado = effectiveVertical === "Supermercado";
  const isSalao   = effectiveVertical === "Salão de Beleza";
  const isClinica = effectiveVertical === "Clínica";

  const allNavItems = [
    { name: "Dashboard",     href: "/",             icon: LayoutDashboard, sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Leads",         href: "/leads",         icon: Users,           sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Prospector",    href: "/app/prospector", icon: Search,         sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Negócios",      href: "/deals",         icon: Briefcase,       sellerHidden: false, section: "crm", fn: ["vendedor", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Conversas",     href: "/conversations", icon: MessageSquare,   sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Agenda",        href: "/agenda",        icon: Calendar,        sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Orçamentos",    href: "/propostas",     icon: FileText,        sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Estoque",       href: "/estoque",       icon: Package,         sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Campanhas",     href: "/campanhas",     icon: Megaphone,       sellerHidden: true,  section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Agentes",       href: "/agents/config", icon: Bot,           sellerHidden: true,  section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Métricas de IA",href: "/analytics",     icon: BarChart3,     sellerHidden: true,  section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Equipe",        href: "/usuarios",      icon: Users,           sellerHidden: false, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Configurações", href: "/configuracoes", icon: Settings,        sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Guia de Setup", href: "/guia-implantacao", icon: BookOpen,     sellerHidden: true,  section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Obras",         href: "/obras",                    icon: Building2,   sellerHidden: false, section: "construcao", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Insumos",       href: "/insumos",                  icon: Package,     sellerHidden: false, section: "construcao", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Composições",   href: "/composicoes",              icon: Layers,      sellerHidden: false, section: "construcao", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Produtos",      href: "/varejo/produtos",          icon: Shirt,       sellerHidden: false, section: "varejo", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Coleções",      href: "/varejo/colecoes",          icon: Tag,         sellerHidden: false, section: "varejo", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Fornecedores",  href: "/varejo/fornecedores",      icon: Truck,       sellerHidden: false, section: "varejo", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Compras",       href: "/varejo/compras",           icon: ShoppingCart,sellerHidden: false, section: "varejo", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Fidelidade",    href: "/varejo/fidelidade",        icon: Heart,       sellerHidden: false, section: "varejo", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Combos & Looks",href: "/varejo/combos",            icon: Gift,        sellerHidden: false, section: "varejo", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Dashboard",     href: "/supermercado",             icon: ShoppingCart,sellerHidden: false, section: "supermercado", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Produtos",      href: "/supermercado/produtos",    icon: Package,     sellerHidden: false, section: "supermercado", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Pedidos",       href: "/supermercado/pedidos",     icon: UtensilsCrossed, sellerHidden: false, section: "supermercado", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Campanhas",     href: "/supermercado/campanhas",   icon: MegaphoneIcon, sellerHidden: false, section: "supermercado", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Configurações", href: "/supermercado/config",      icon: Settings,    sellerHidden: false, section: "supermercado", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Dashboard",     href: "/arch",                     icon: DraftingCompass, sellerHidden: true,  section: "arch", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Projetos",      href: "/arch/projetos",            icon: FolderOpen,  sellerHidden: true,  section: "arch", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Renderização",  href: "/arch/render",              icon: Clapperboard, sellerHidden: true, section: "arch", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Catálogo",      href: "/arch/catalogo",            icon: Package,     sellerHidden: true,  section: "arch", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Marketplace",   href: "/arch/marketplace",         icon: Store,       sellerHidden: true,  section: "arch", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Salão",         href: "/beauty",                   icon: Scissors,    sellerHidden: false, section: "salao",    fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Agenda",        href: "/beauty/agenda",            icon: Calendar,    sellerHidden: false, section: "salao",    fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Serviços",      href: "/beauty/servicos",          icon: Scissors,    sellerHidden: false, section: "salao",    fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Profissionais", href: "/beauty/profissionais",     icon: User2,       sellerHidden: false, section: "salao",    fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Clínica",       href: "/clinic",                   icon: Stethoscope, sellerHidden: false, section: "clinica",      fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Agenda",        href: "/clinic/agenda",            icon: Calendar,    sellerHidden: false, section: "clinica",      fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Médicos",       href: "/clinic/medicos",           icon: User2,       sellerHidden: false, section: "clinica",      fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Knowledge Graph", href: "/vkg",                   icon: Network,     sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Vendor Brain",    href: "/brain",                  icon: BrainCircuit,sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Partner Hub",       href: "/partner-hub",               icon: Handshake,   sellerHidden: true,  section: "hub", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Ecosystem Hub",     href: "/ecosystem-hub",             icon: Globe,       sellerHidden: true,  section: "hub", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Certified Network", href: "/vendor-certified-network",  icon: Shield,      sellerHidden: true,  section: "hub", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Opportunity Engine",href: "/poe",                       icon: Cpu,         sellerHidden: true,  section: "hub", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Revenue Scout", href: "/scout",                    icon: TrendingUp,  sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Regras",        href: "/scout/regras",             icon: Zap,         sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Oportunidades", href: "/scout/oportunidades",      icon: ListChecks,  sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
  ];

  function isVisible(item: typeof allNavItems[0]) {
    if (isSeller && item.sellerHidden) return false;
    const knownSections = ["crm", "construcao", "varejo", "supermercado", "arch", "salao", "clinica", "inteligencia", "hub"];
    if (!knownSections.includes(item.section)) return false;
    if (item.section === "construcao" && !isConstrucao) return false;
    if (item.section === "varejo" && !isVarejo) return false;
    if (item.section === "supermercado" && !isSupermercado) return false;
    if (item.section === "salao" && !isSalao) return false;
    if (item.section === "clinica" && !isClinica) return false;
    const isAdmin = isSuperAdmin || isTenantAdmin;
    if (isAdmin) return true;
    return userFunction ? item.fn.includes(userFunction) : true;
  }

  const navigation = allNavItems.filter(isVisible);

  const adminNavigation = isSuperAdmin
    ? [
        { name: "Tenants",     href: "/admin/tenants",   icon: Briefcase,    sellerHidden: false, section: "admin", badge: undefined },
        { name: "Verticais",   href: "/admin/verticais", icon: Building2,    sellerHidden: false, section: "admin", badge: undefined },
        { name: "Marketplace", href: "/marketplace",     icon: Store,        sellerHidden: false, section: "admin", badge: undefined },
        { name: "AI Usage",    href: "/admin/ai-usage",  icon: BrainCircuit, sellerHidden: false, section: "admin", badge: undefined },
        { name: "Parceiros",   href: "/admin/partners",  icon: Users,        sellerHidden: false, section: "admin", badge: undefined },
        { name: "Suporte",     href: "/admin/suporte",   icon: Bug,          sellerHidden: false, section: "admin", badge: openBugCount > 0 ? openBugCount : undefined },
      ]
    : [];

  const crmNav = navigation.filter((i) => i.section === "crm");
  const construcaoNav = navigation.filter((i) => i.section === "construcao");
  const varejoNav = navigation.filter((i) => i.section === "varejo");
  const supermercadoNav = navigation.filter((i) => i.section === "supermercado");
  const archNav = navigation.filter((i) => i.section === "arch");
  const salaoNav       = navigation.filter((i) => i.section === "salao");
  const clinicaNav     = navigation.filter((i) => i.section === "clinica");
  const inteligenciaNav= navigation.filter((i) => i.section === "inteligencia");
  const hubNav         = navigation.filter((i) => i.section === "hub");

  function resolveImgUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith("/objects/") ? `/api/storage${url}` : url;
  }

  function LogoBranding({ size }: { size: "lg" | "md" | "sm" }) {
    const tenantLogo = resolveImgUrl(user?.tenantLogoUrl);
    const vendorH    = size === "lg" ? "h-10" : size === "md" ? "h-8" : "h-7";
    const tenantH    = size === "lg" ? "h-9"  : size === "md" ? "h-7" : "h-6";

    if (!tenantLogo) {
      return <img src={logoFull} alt="Vendor.ai" className={`${vendorH} w-auto`} />;
    }

    return (
      <div className="flex items-center gap-2">
        <img src={logoFull} alt="Vendor.ai" className={`${vendorH} w-auto shrink-0`} />
        <span className="text-muted-foreground/50 font-light text-sm select-none">×</span>
        <img
          src={tenantLogo}
          alt="Logo"
          className={`${tenantH} w-auto max-w-[100px] shrink-0 object-contain`}
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      </div>
    );
  }

  function NavItem({ item, onNavigate }: { item: any; onNavigate?: () => void }) {
    const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[44px]",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.name}</span>
        {item.badge !== undefined && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
            isActive
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-red-500 text-white"
          )}>
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    );
  }

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    const [relatoriosOpen, setRelatoriosOpen] = useState(false);
    const [conteudoOpen, setConteudoOpen] = useState(false);
    const isRelatorio = location.startsWith("/relatorios/");
    const isConteudo = location === "/content" || location.startsWith("/content-studio");
    return (
      <>
        {crmNav.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}

        {/* Conteúdo submenu */}
        <div>
          <button
            onClick={() => setConteudoOpen((v) => !v)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[44px]",
              isConteudo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 shrink-0" />
              Conteúdo
            </div>
            {conteudoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {conteudoOpen && (
            <div className="ml-6 mt-1 space-y-1">
              <Link
                href="/content"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/content"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Gerador de Conteúdo
              </Link>
              <Link
                href="/content-studio"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/content-studio"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Clapperboard className="h-3.5 w-3.5" /> Content Studio
              </Link>
            </div>
          )}
        </div>

        {/* Relatórios submenu */}
        <div>
          <button
            onClick={() => setRelatoriosOpen((v) => !v)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[44px]",
              isRelatorio
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 shrink-0" />
              Relatórios
            </div>
            {relatoriosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {relatoriosOpen && (
            <div className="ml-6 mt-1 space-y-1">
              <Link
                href="/relatorios/ganhos-mes"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/relatorios/ganhos-mes"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Trophy className="h-3.5 w-3.5" /> Ganhos do mês
              </Link>
              <Link
                href="/relatorios/tipo-cliente"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/relatorios/tipo-cliente"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Users className="h-3.5 w-3.5" /> Tipo de cliente
              </Link>
              <Link
                href="/relatorios/dores"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/relatorios/dores"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Target className="h-3.5 w-3.5" /> Dores dos leads
              </Link>
            </div>
          )}
        </div>

        {construcaoNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <HardHat className="h-3 w-3" />
              Construção Civil
            </p>
            {construcaoNav.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {varejoNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <Shirt className="h-3 w-3" />
              Varejo de Moda
            </p>
            {varejoNav.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {supermercadoNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <ShoppingCart className="h-3 w-3" />
              Supermercado
            </p>
            {supermercadoNav.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {archNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <DraftingCompass className="h-3 w-3" />
              Arch — Design
            </p>
            {archNav.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {salaoNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <Scissors className="h-3 w-3" />
              Salão de Beleza
            </p>
            {salaoNav.map((item) => <NavItem key={item.href} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {clinicaNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <Stethoscope className="h-3 w-3" />
              Clínica
            </p>
            {clinicaNav.map((item) => <NavItem key={item.href} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {inteligenciaNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              Inteligência
            </p>
            {inteligenciaNav.map((item) => <NavItem key={item.href} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {hubNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <Handshake className="h-3 w-3" />
              Partner Network
            </p>
            {hubNav.map((item) => <NavItem key={item.href} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {adminNavigation.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Super Admin
            </p>
            {adminNavigation.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}
          </div>
        )}
      </>
    );
  }

  function UserFooter() {
    return (
      <div className="p-4 border-t">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground hover:text-foreground min-h-[44px]"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    );
  }

  return (
    <>
    <div className="flex h-screen bg-muted/20">
      {/* ── Desktop sidebar ────────────────────────────────── */}
      <div className="hidden md:flex w-64 bg-card border-r flex-col shrink-0">
        <div className="p-5 border-b">
          <LogoBranding size="lg" />
        </div>
        <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          <NavLinks />
        </div>
        <UserFooter />
      </div>

      {/* ── Mobile drawer overlay ───────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-card flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <LogoBranding size="md" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                className="h-9 w-9"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 py-3 flex flex-col gap-1 px-3 overflow-y-auto">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
            <UserFooter />
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="h-9 w-9"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <LogoBranding size="sm" />
        </header>

        {isSuperAdmin && tenantOverride && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="truncate">
                Visualizando módulo de{" "}
                <strong>{tenantOverride.vertical}</strong> — Tenant:{" "}
                <strong>{tenantOverride.name}</strong>
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-amber-700 hover:text-amber-900 hover:bg-amber-100 shrink-0 gap-1.5"
              onClick={() => { clearTenantOverride(); }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair do tenant
            </Button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
    <SupportChatWidget />
    </>
  );
}
