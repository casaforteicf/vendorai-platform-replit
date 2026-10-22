import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BrainCircuit,
  BookOpen,
  Briefcase,
  Bug,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  HelpCircle,
  GitMerge,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NovidadesBell } from "@/components/NovidadesBell";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import logoFull from "/logo-full-light.svg";

type AdminNavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

type AdminNavGroup = {
  key: string;
  label: string;
  description: string;
  items: AdminNavItem[];
};

const SIDEBAR_STORAGE_KEY = "vendorai_superadmin_sidebar_expanded";


function NavigationGroup({ initiallyOpen, children, ...props }: React.ComponentProps<"details"> & { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details {...props} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>{children}</details>;
}

export function SuperAdminSidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, token, setTenantOverride } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved === null ? true : saved === "true";
  });

  const { data: openBugsData } = useQuery<{ count: number }>({
    queryKey: ["admin", "bug-reports-open-count"],
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const response = await fetch("/api/admin/bug-reports/open-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { count: 0 };
      return response.json() as Promise<{ count: number }>;
    },
  });

  const openBugCount = openBugsData?.count ?? 0;

  const groups: AdminNavGroup[] = [
    {
      key: "clientes",
      label: "Clientes",
      description: "Tenants e acesso às empresas",
      items: [
        { name: "Clientes & Tenants", href: "/admin/tenants", icon: Briefcase },
      ],
    },
    {
      key: "plataforma",
      label: "Plataforma",
      description: "Segmentos, produtos e superfícies da plataforma",
      items: [
        { name: "Segmentos", href: "/admin/verticais", icon: Building2 },
        { name: "App Builder", href: "/admin/app-builder", icon: Cpu },
        { name: "Produtos da Plataforma", href: "/admin/produtos-internos", icon: Package },
        { name: "Base Interna", href: "/admin/base-interna", icon: BookOpen },
      ],
    },
    {
      key: "ia",
      label: "IA & Automação",
      description: "Consumo, modelos, prompts e evolução da inteligência artificial",
      items: [
        { name: "Consumo de IA", href: "/admin/ai-usage", icon: BrainCircuit },
        { name: "Prompts Padrão", href: "/admin/agent-defaults", icon: BrainCircuit },
        { name: "Progresso de ML", href: "/admin/ml-status", icon: BrainCircuit },
      ],
    },
    {
      key: "financeiro",
      label: "Financeiro & Comercial",
      description: "Financeiro, parceiros e operação comercial",
      items: [
        { name: "Financeiro", href: "/admin/financeiro", icon: BarChart3 },
        { name: "Parceiros", href: "/admin/partners", icon: Users },
      ],
    },
    {
      key: "operacao",
      label: "Operação & Suporte",
      description: "Suporte, incidentes, relatos técnicos e novidades",
      items: [
        { name: "Suporte", href: "/admin/suporte", icon: Bug, badge: openBugCount > 0 ? openBugCount : undefined },
        { name: "Relatos Técnicos", href: "/admin/relatos-tecnicos", icon: AlertCircle },
        { name: "Novidades", href: "/admin/changelog", icon: Bell },
        { name: "Melhorias & Publicações", href: "/admin/melhorias", icon: GitMerge },
      ],
    },
  ];

  const toggleSidebar = () => {
    setSidebarExpanded((previous) => {
      const next = !previous;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const openTenantWorkspace = () => {
    if (!user?.tenantId) return;
    setTenantOverride({
      id: user.tenantId,
      name: "Vendor.ai",
      vertical: user.tenantVertical ?? "",
    });
    setLocation("/");
  };

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  function NavItem({ item, onNavigate }: { item: AdminNavItem; onNavigate?: () => void }) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "group relative flex min-h-[42px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
          active
            ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
            : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.name}</span>
        {item.badge !== undefined && (
          <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    );
  }

  function Navigation({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <div className="space-y-1">
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Super Admin
        </p>

        <button
          type="button"
          onClick={() => {
            openTenantWorkspace();
            onNavigate?.();
          }}
          disabled={!user?.tenantId}
          className="mb-2 flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-left text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          title="Abrir o mesmo ambiente operacional usado pelos tenants"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span className="flex-1">Ambiente operacional</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>

        {groups.map((group) => {
          const active = group.items.some((item) => isActive(item.href));
          return (
            <NavigationGroup
              key={group.key}
              className="group/admin rounded-xl"
              initiallyOpen={active || group.key === "clientes"}
            >
              <summary
                className={cn(
                  "flex min-h-[42px] cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground",
                )}
                aria-label={`${group.label}: ${group.description}`}
                title={group.description}
              >
                <span>{group.label}</span>
                <ChevronRight className="h-4 w-4 transition-transform group-open/admin:rotate-90" />
              </summary>
              <div className="ml-3 mt-1 space-y-1 border-l border-border/60 pl-2">
                {group.items.map((item) => (
                  <NavItem key={item.href} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            </NavigationGroup>
          );
        })}
      </div>
    );
  }

  function UserFooter() {
    return (
      <div className="border-t p-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {user?.name?.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="mb-1 space-y-1">
          <Link
            href="/faq"
            className={cn(
              "flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              location === "/faq"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground",
            )}
          >
            <HelpCircle className="h-4 w-4" />
            Ajuda / FAQ
          </Link>
          <NovidadesBell />
        </div>
        <Button
          variant="outline"
          className="min-h-[44px] w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={logout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen bg-background">
        <div
          className={`sticky top-0 hidden h-screen ${sidebarExpanded ? "w-[clamp(240px,14.2vw,272px)]" : "w-[68px]"} shrink-0 overflow-hidden border-r border-sidebar-border/70 bg-sidebar/92 backdrop-blur-2xl transition-[width] duration-200 ease-out md:flex`}
        >
          <div className="flex h-full w-[clamp(240px,14.2vw,272px)] shrink-0 flex-col">
            <div className="flex items-center gap-2 border-b border-sidebar-border/70 p-3">
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                aria-label={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
                title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              >
                {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {sidebarExpanded && <img src={logoFull} alt="Vendor.ai" className="h-10 w-auto" />}
            </div>
            <div className="vendor-scrollbar flex-1 overflow-y-auto px-3 py-4">
              <Navigation />
            </div>
            <UserFooter />
          </div>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 flex h-full w-[min(88vw,320px)] flex-col bg-sidebar/98 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between border-b p-4">
                <img src={logoFull} alt="Vendor.ai" className="h-8 w-auto" />
                <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="h-9 w-9">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3">
                <Navigation onNavigate={() => setMobileOpen(false)} />
              </div>
              <UserFooter />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
            <img src={logoFull} alt="Vendor.ai" className="h-7 w-auto" />
          </header>
          <main className="vendor-scrollbar min-h-0 flex-1 overflow-y-auto touch-pan-y overscroll-y-contain">
            <div className="vendor-page-canvas">{children}</div>
          </main>
        </div>
      </div>
      <SupportChatWidget />
    </>
  );
}