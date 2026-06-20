import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import React, { useState } from "react";
import {
  LayoutDashboard, Users, Briefcase, MessageSquare, Calendar,
  Settings, LogOut, Megaphone, FileText, Receipt, BrainCircuit,
  Store, Package, Menu, X, Sparkles, Globe, BookOpen, HardHat, Layers,
  Shirt, Tag, ShoppingCart, Heart, Gift, Truck, UtensilsCrossed, Megaphone as MegaphoneIcon,
  BarChart3, ChevronRight, ChevronDown, Target, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logoFull from "/logo-full-light.svg";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSuperAdmin = user?.platformRole === "super_admin";
  const isSeller = user?.platformRole === "tenant_seller";
  const isConstrucao = user?.tenantVertical === "Construção & Reforma";
  const isVarejo = user?.tenantVertical === "Varejo de Roupas & Acessórios";
  const isSupermercado = user?.tenantVertical === "Supermercado";

  const allNavItems = [
    { name: "Dashboard",     href: "/",             icon: LayoutDashboard, sellerHidden: false, section: "crm" },
    { name: "Leads",         href: "/leads",         icon: Users,           sellerHidden: false, section: "crm" },
    { name: "Duplicatas",    href: "/duplicatas",    icon: Target,          sellerHidden: false, section: "crm" },
    { name: "Negócios",      href: "/deals",         icon: Briefcase,       sellerHidden: false, section: "crm" },
    { name: "Conversas",     href: "/conversations", icon: MessageSquare,   sellerHidden: false, section: "crm" },
    { name: "Agenda",        href: "/agenda",        icon: Calendar,        sellerHidden: false, section: "crm" },
    { name: "Orçamentos",    href: "/propostas",     icon: FileText,        sellerHidden: false, section: "crm" },
    { name: "Estoque",       href: "/estoque",       icon: Package,         sellerHidden: false, section: "crm" },
    { name: "Conteúdo",      href: "/content",       icon: Sparkles,        sellerHidden: false, section: "crm" },
    { name: "Campanhas",     href: "/campanhas",     icon: Megaphone,       sellerHidden: true,  section: "crm" },
    { name: "Faturamento",   href: "/faturamento",   icon: Receipt,         sellerHidden: true,  section: "crm" },
    { name: "Métricas de IA",href: "/analytics",     icon: BarChart3,     sellerHidden: true,  section: "crm" },
    { name: "Configurações", href: "/configuracoes", icon: Settings,        sellerHidden: false, section: "crm" },
    { name: "Guia de Setup", href: "/guia-implantacao", icon: BookOpen,     sellerHidden: true,  section: "crm" },
    { name: "Obras",         href: "/obras",                    icon: HardHat,     sellerHidden: false, section: "construcao" },
    { name: "Insumos",       href: "/insumos",                  icon: Package,     sellerHidden: false, section: "construcao" },
    { name: "Composições",   href: "/composicoes",              icon: Layers,      sellerHidden: false, section: "construcao" },
    { name: "Produtos",      href: "/varejo/produtos",          icon: Shirt,       sellerHidden: false, section: "varejo" },
    { name: "Coleções",      href: "/varejo/colecoes",          icon: Tag,         sellerHidden: false, section: "varejo" },
    { name: "Fornecedores",  href: "/varejo/fornecedores",      icon: Truck,       sellerHidden: false, section: "varejo" },
    { name: "Compras",       href: "/varejo/compras",           icon: ShoppingCart,sellerHidden: false, section: "varejo" },
    { name: "Fidelidade",    href: "/varejo/fidelidade",        icon: Heart,       sellerHidden: false, section: "varejo" },
    { name: "Combos & Looks",href: "/varejo/combos",            icon: Gift,        sellerHidden: false, section: "varejo" },
    { name: "Dashboard",     href: "/supermercado",             icon: ShoppingCart,sellerHidden: false, section: "supermercado" },
    { name: "Produtos",      href: "/supermercado/produtos",    icon: Package,     sellerHidden: false, section: "supermercado" },
    { name: "Pedidos",       href: "/supermercado/pedidos",     icon: UtensilsCrossed, sellerHidden: false, section: "supermercado" },
    { name: "Campanhas",     href: "/supermercado/campanhas",   icon: MegaphoneIcon, sellerHidden: false, section: "supermercado" },
    { name: "Configurações", href: "/supermercado/config",      icon: Settings,    sellerHidden: false, section: "supermercado" },
  ];

  const navigation = allNavItems.filter(item =>
    !(isSeller && item.sellerHidden) &&
    (item.section !== "construcao" || isConstrucao) &&
    (item.section !== "varejo" || isVarejo) &&
    (item.section !== "supermercado" || isSupermercado)
  );

  const adminNavigation = isSuperAdmin
    ? [
        { name: "Marketplace", href: "/marketplace",    icon: Store,        sellerHidden: false, section: "admin" },
        { name: "AI Usage",    href: "/admin/ai-usage", icon: BrainCircuit, sellerHidden: false, section: "admin" },
        { name: "Parceiros",   href: "/admin/partners", icon: Users,        sellerHidden: false, section: "admin" },
      ]
    : [];

  const crmNav = navigation.filter((i) => i.section === "crm");
  const construcaoNav = navigation.filter((i) => i.section === "construcao");
  const varejoNav = navigation.filter((i) => i.section === "varejo");
  const supermercadoNav = navigation.filter((i) => i.section === "supermercado");

  function NavItem({ item, onNavigate }: { item: (typeof allNavItems)[0]; onNavigate?: () => void }) {
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
        {item.name}
      </Link>
    );
  }

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    const [relatoriosOpen, setRelatoriosOpen] = useState(false);
    const isRelatorio = location.startsWith("/relatorios/");
    return (
      <>
        {crmNav.map((item) => <NavItem key={item.name} item={item} onNavigate={onNavigate} />)}

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
    <div className="flex h-screen bg-muted/20">
      {/* ── Desktop sidebar ────────────────────────────────── */}
      <div className="hidden md:flex w-64 bg-card border-r flex-col shrink-0">
        <div className="p-5 border-b">
          <img src={logoFull} alt="Vendor.ai" className="h-10 w-auto" />
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
              <img src={logoFull} alt="Vendor.ai" className="h-8 w-auto" />
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
          <img src={logoFull} alt="Vendor.ai" className="h-7 w-auto" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
