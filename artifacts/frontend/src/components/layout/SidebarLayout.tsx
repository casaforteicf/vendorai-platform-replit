type UserFunction = "vendedor" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro";

import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import {
  LayoutDashboard, Users, Briefcase, MessageSquare, Calendar,
  Settings, LogOut, Megaphone, FileText, Receipt, BrainCircuit, Bell,
  Store, Package, PackagePlus, Menu, X, Sparkles, Globe, BookOpen, HardHat, Layers,
  Shirt, Tag, ShoppingCart, Heart, Gift, Truck, UtensilsCrossed, Megaphone as MegaphoneIcon, Navigation,
  BarChart3, ChevronRight, ChevronDown, Target, Trophy, Search, Clapperboard, Building2, AlertCircle, Bot,
  DraftingCompass, FolderOpen, Scissors, User2, Stethoscope, TrendingUp, Zap, ListChecks, Network,
  Handshake, Shield, Cpu, Bug, Coins, Wrench, Pill, Home, Car, HelpCircle, WalletCards, Camera, KanbanSquare, ClipboardCheck, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logoFull from "/logo-full-light.svg";
import { StoreSwitcher } from "@/components/StoreSwitcher";
import { NovidadesBell } from "@/components/NovidadesBell";
import { applyTenantTheme, resetTenantTheme } from "@/lib/tenantTheme";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, tenantOverride, clearTenantOverride, token, isEffectiveAdmin } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSuperAdmin = user?.platformRole === "super_admin";

  const { data: tenantData } = useQuery<{ planSlug: string | null; corPrimaria?: string | null; vertical?: string | null }>({
    queryKey: ["tenant-plan", user?.tenantId],
    enabled: !!user?.tenantId && !!token,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${user!.tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return { planSlug: null };
      return r.json();
    },
  });

  // Co-branding de cor: a sidebar/botões/destaques passam a usar a cor de
  // marca do tenant (mesma ideia da logo no header). Reseta pro padrão do
  // Vendor.ai se o tenant não tiver cor definida ou ao desmontar (logout).
  // Em preview de vertical (Admin → Verticais → Visualizar layout) não
  // existe tenant real pra buscar — usa a cor do programa de marca que
  // veio junto no override, se tiver.
  const previewCorPrimaria = isSuperAdmin && tenantOverride?.preview ? tenantOverride.corPrimaria : null;
  React.useEffect(() => {
    const cor = previewCorPrimaria ?? tenantData?.corPrimaria;
    if (cor) {
      applyTenantTheme(cor);
    } else {
      resetTenantTheme();
    }
    return () => resetTenantTheme();
  }, [previewCorPrimaria, tenantData?.corPrimaria]);
  // Plano Start (grátis) só vê o essencial pra operar e vender no Praça.ai —
  // o resto do sistema (agentes de IA, CRM avançado, ERP...) fica visível
  // só a partir de um plano pago. Super admin nunca é restringido por isso.
  const START_PLAN_HREFS = new Set(["/", "/trabalho", "/catalogo", "/varejo/produtos", "/supermercado/produtos", "/farmacia", "/farmacia/produtos", "/deals", "/base-conhecimento", "/configuracoes", "/guia-implantacao"]);
  const isTenantAdmin = isEffectiveAdmin;
  const isStartPlan = tenantData?.planSlug === "start" && !isSuperAdmin && !isTenantAdmin;

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
  const isSeller = user?.platformRole === "tenant_seller" && user?.userFunction !== "administrador";
  const userFunction = user?.userFunction as UserFunction | undefined;

  // Telas e módulos do tenant (Configurações do Admin → "Aplicar recomendado
  // pra vertical" etc). Só reage a OVERRIDE EXPLÍCITO (hasOverride:true) —
  // nunca ao valor padrão do catálogo, que pra maioria dos módulos é "false"
  // e esconderia telas que todo tenant já usa hoje se fosse tratado como
  // real. Tenant sem nenhum override (o caso de praticamente todos hoje):
  // zero mudança no menu.
  type NavModule = { moduleKey: string; isEnabled: boolean; hasOverride: boolean };
  const { data: tenantNavModules } = useQuery<NavModule[]>({
    queryKey: ["tenant-nav-modules", user?.tenantId],
    enabled: !!user?.tenantId && !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${user!.tenantId}/nav-modules`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const MODULE_TO_HREFS: Record<string, string[]> = {
    dashboard:  ["/", "/trabalho"],
    leads:      ["/leads", "/deals"],
    prospector: ["/app/prospector"],
    scheduler:  ["/agenda"],
    revenue:    ["/scout", "/scout/regras", "/scout/oportunidades", "/scout/pipeline", "/scout/seguros/renovacoes"],
    analytics:  ["/analytics"],
    arch:       ["/arch", "/arch/projetos", "/arch/render", "/arch/catalogo", "/arch/marketplace"],
    obras:      ["/obras", "/insumos", "/composicoes"],
    financeiro: ["/erp"],
    settings:   ["/configuracoes"],
    varejo:       ["/varejo/produtos", "/varejo/colecoes", "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade", "/varejo/combos"],
    supermercado: ["/supermercado", "/supermercado/produtos", "/supermercado/pedidos", "/supermercado/campanhas", "/supermercado/config"],
    beauty:       ["/beauty", "/beauty/agenda", "/beauty/servicos", "/beauty/profissionais"],
    clinic:       ["/clinic", "/clinic/agenda", "/clinic/medicos"],
    knowledge_graph: ["/vkg"],
    vendor_brain:    ["/brain"],
    content_autopilot: ["/content-autopilot"],
    // sdr, content, campaigns, churn: sem tela própria no menu hoje —
    // desligar não esconde nada (não são páginas, são só flags de catálogo)
  };
  const disabledHrefs = new Set(
    (tenantNavModules ?? [])
      .filter((m) => m.hasOverride && !m.isEnabled)
      .flatMap((m) => MODULE_TO_HREFS[m.moduleKey] ?? [])
  );

  // A vertical do usuário vem da sessão e pode ficar desatualizada quando o
  // onboarding define o segmento depois do primeiro login. Prefere o valor
  // atual do tenant retornado pela API para atualizar o menu sem novo login.
  const effectiveVertical = isSuperAdmin && tenantOverride
    ? tenantOverride.vertical
    : tenantData?.vertical ?? user?.tenantVertical;
  const isConstrucao = effectiveVertical === "Construção & Reforma";
  const isVarejo = effectiveVertical === "Varejo de Roupas & Acessórios" || effectiveVertical === "Varejo de Eletroeletrônicos" || effectiveVertical === "Varejo de Decoração, Variedades & Utilidades" || effectiveVertical === "Bebês e Crianças" || effectiveVertical === "Esportes e Lazer" || effectiveVertical === "Automotivo — Acessórios e Som" || effectiveVertical === "Papelaria e Livraria" || effectiveVertical === "Joias, Relógios e Óticas" || effectiveVertical === "Calçados" || effectiveVertical === "Móveis" || effectiveVertical === "Cama, Mesa e Banho" || effectiveVertical === "Brinquedos" || effectiveVertical === "Instrumentos Musicais" || effectiveVertical === "Perfumaria e Cosméticos" || effectiveVertical === "Floricultura" || effectiveVertical === "Adega e Bebidas" || effectiveVertical === "Produtos Naturais e Suplementos" || effectiveVertical === "Armarinho e Tecidos" || effectiveVertical === "Papelaria Criativa e Artesanato" || effectiveVertical === "Games e Informática" || effectiveVertical === "Pet Shop (Varejo)" || effectiveVertical === "Material de Construção — Varejo";
  const isSupermercado = effectiveVertical === "Supermercado";
  const isSalao   = effectiveVertical === "Salão de Beleza" || effectiveVertical === "Barbearia" || effectiveVertical === "Pet Shop (Varejo)";
  const isPetShop = effectiveVertical === "Pet Shop (Varejo)";
  const isClinica = effectiveVertical === "Clínica";
  const normalizedVertical = (effectiveVertical ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isFarmacia = normalizedVertical.includes("farmacia");

  const allNavItems = [
    { name: "Dashboard",     href: "/",             icon: LayoutDashboard, sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Central de Trabalho", href: "/trabalho", icon: ClipboardCheck, sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Leads",         href: "/leads",         icon: Users,           sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Prospector",    href: "/app/prospector", icon: Search,         sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Negócios",      href: "/deals",         icon: Briefcase,       sellerHidden: false, section: "crm", fn: ["vendedor", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Conversas",     href: "/conversations", icon: MessageSquare,   sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Agenda",        href: "/agenda",        icon: Calendar,        sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Operação Praça.ai", href: "/entregas-praca", icon: Truck, sellerHidden: false, section: "crm", fn: ["entrega"] as UserFunction[] },
    { name: "Gestão de Entregas", href: "/entregas", icon: Truck, sellerHidden: false, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Executivo Praça.ai", href: "/praca-executivo", icon: BarChart3, sellerHidden: false, section: "crm", fn: ["financeiro", "suporte", "administrador"] as UserFunction[] },
    { name: "Conciliação Praça.ai", href: "/praca-conciliacao", icon: FileCheck, sellerHidden: false, section: "crm", fn: ["financeiro", "administrador"] as UserFunction[] },
    { name: "Monitor Praça.ai", href: "/logistica-praca", icon: Navigation, sellerHidden: false, section: "crm", fn: ["suporte", "administrador"] as UserFunction[] },
    { name: "Orçamentos",    href: "/propostas",     icon: FileText,        sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Catálogo",      href: "/catalogo",      icon: BookOpen,        sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Pacotes",       href: "/pacotes",       icon: PackagePlus,     sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Content Autopilot", href: "/content-autopilot", icon: Sparkles, sellerHidden: true, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Campanhas",     href: "/campanhas-nova", icon: Megaphone,      sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Gestão ERP",    href: "/erp",           icon: WalletCards,     sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Agentes",       href: "/agents/config", icon: Bot,           sellerHidden: true,  section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Base de Conhecimento", href: "/base-conhecimento", icon: BookOpen, sellerHidden: true, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Métricas de IA",href: "/analytics",     icon: BarChart3,     sellerHidden: true,  section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Painel da Rede",href: "/organizacao",   icon: Network,       sellerHidden: true,  section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Equipe",        href: "/usuarios",      icon: Users,           sellerHidden: false, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Configurações", href: "/configuracoes", icon: Settings,        sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    // "Stories" agora é um item dentro do dropdown "Conteúdo" (renomeado
    // "Stories Praça.ai"), não mais um item de topo — ver bloco do
    // dropdown mais abaixo.
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
    { name: isPetShop ? "Banho & Tosa" : "Salão", href: "/beauty", icon: Scissors,    sellerHidden: false, section: "salao",    fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Agenda",        href: "/beauty/agenda",            icon: Calendar,    sellerHidden: false, section: "salao",    fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Serviços",      href: "/beauty/servicos",          icon: Scissors,    sellerHidden: false, section: "salao",    fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Profissionais", href: "/beauty/profissionais",     icon: User2,       sellerHidden: false, section: "salao",    fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Ordens de Serviço", href: "/servicos",             icon: Wrench,      sellerHidden: false, section: "servicos", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Cadastros",     href: "/servicos/cadastros",       icon: HardHat,     sellerHidden: false, section: "servicos", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Central",       href: "/farmacia",                 icon: ClipboardCheck, sellerHidden: false, section: "farmacia", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Produtos",      href: "/farmacia/produtos",        icon: Pill,        sellerHidden: false, section: "farmacia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Bulas",         href: "/farmacia/bulas",           icon: FileCheck,   sellerHidden: false, section: "farmacia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Pedidos",       href: "/farmacia/pedidos",         icon: ShoppingCart,sellerHidden: false, section: "farmacia", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Receitas",      href: "/farmacia/receitas",        icon: FileText,    sellerHidden: false, section: "farmacia", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Propriedades",  href: "/imoveis/propriedades",     icon: Home,        sellerHidden: false, section: "imoveis",  fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Visitas",       href: "/imoveis/visitas",          icon: Calendar,    sellerHidden: false, section: "imoveis",  fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Cargas",        href: "/fretes/cargas",            icon: Package,     sellerHidden: false, section: "fretes",   fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Frota",         href: "/fretes/veiculos",          icon: Truck,       sellerHidden: false, section: "fretes",   fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Minhas Entregas", href: "/fretes/motorista",       icon: Navigation,  sellerHidden: false, section: "fretes",   fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Estoque",       href: "/veiculos/estoque",         icon: Car,         sellerHidden: false, section: "veiculos", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Test-Drives",   href: "/veiculos/test-drives",     icon: Calendar,    sellerHidden: false, section: "veiculos", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
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
    { name: "Pipeline Scout",href: "/scout/pipeline",           icon: KanbanSquare,sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Renovações",    href: "/scout/seguros/renovacoes", icon: Shield,      sellerHidden: true,  section: "inteligencia", fn: ["administrador", "outro"] as UserFunction[] },
  ];

  // Global menu policy per Industry Pack. A known vertical only receives
  // Core routes plus its explicit allowlist; new routes remain hidden until
  // approved for that vertical.
  const CORE_VERTICAL_HREFS = [
    "/", "/trabalho", "/leads", "/app/prospector", "/deals", "/comissoes",
    "/conversations", "/agenda", "/propostas", "/catalogo", "/campanhas", "/campanhas-nova",
    "/agents/config", "/base-conhecimento", "/analytics", "/usuarios", "/configuracoes",
    "/guia-implantacao", "/scout", "/scout/regras", "/scout/oportunidades", "/scout/pipeline",
    "/praca-perguntas", "/erp", "/ads",
  ];

  const verticalHrefAllowlists: Record<string, Set<string>> = {
    "Construção & Reforma": new Set([
      ...CORE_VERTICAL_HREFS,
      "/entregas", "/estoque", "/obras", "/insumos", "/composicoes",
    ]),
    "Varejo de Roupas & Acessórios": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Varejo de Eletroeletrônicos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Varejo de Decoração, Variedades & Utilidades": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Bebês e Crianças": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Esportes e Lazer": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Automotivo — Acessórios e Som": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Papelaria e Livraria": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Joias, Relógios e Óticas": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Calçados": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Móveis": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Cama, Mesa e Banho": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Brinquedos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Instrumentos Musicais": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Perfumaria e Cosméticos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Floricultura": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Adega e Bebidas": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Produtos Naturais e Suplementos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Armarinho e Tecidos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Papelaria Criativa e Artesanato": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Games e Informática": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Pet Shop (Varejo)": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Material de Construção — Varejo": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/varejo/produtos", "/varejo/colecoes",
      "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade",
      "/varejo/combos",
    ]),
    "Supermercado": new Set([
      ...CORE_VERTICAL_HREFS,
      "/supermercado", "/supermercado/produtos", "/supermercado/pedidos",
      "/supermercado/campanhas", "/supermercado/config",
    ]),
    "Seguros Corporativos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/scout/seguros/renovacoes",
    ]),
    "Clínica": new Set([
      ...CORE_VERTICAL_HREFS,
      "/clinic", "/clinic/agenda", "/clinic/medicos",
    ]),
    "Salão de Beleza": new Set([
      ...CORE_VERTICAL_HREFS,
      "/beauty", "/beauty/agenda", "/beauty/servicos",
      "/beauty/profissionais",
    ]),
    "Barbearia": new Set([
      ...CORE_VERTICAL_HREFS,
      "/beauty", "/beauty/agenda", "/beauty/servicos",
      "/beauty/profissionais",
    ]),
    "Serviços": new Set([
      ...CORE_VERTICAL_HREFS,
      "/servicos", "/servicos/cadastros",
    ]),
    "Farmácia": new Set([
      ...CORE_VERTICAL_HREFS,
      "/farmacia", "/farmacia/produtos", "/farmacia/bulas", "/farmacia/pedidos", "/farmacia/receitas",
    ]),
    "Imóveis": new Set([
      ...CORE_VERTICAL_HREFS,
      "/imoveis/propriedades", "/imoveis/visitas",
    ]),
    "Fretes": new Set([
      ...CORE_VERTICAL_HREFS,
      "/fretes/cargas", "/fretes/veiculos", "/fretes/motorista",
    ]),
    "Veículos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/veiculos/estoque", "/veiculos/test-drives",
    ]),
    "Arquitetura & Design": new Set([
      ...CORE_VERTICAL_HREFS,
      "/arch", "/arch/projetos", "/arch/render", "/arch/catalogo",
      "/arch/marketplace",
    ]),
    "Arquitetura": new Set([
      ...CORE_VERTICAL_HREFS,
      "/arch", "/arch/projetos", "/arch/render", "/arch/catalogo",
      "/arch/marketplace",
    ]),
    "Distribuidora de Materiais de Construção": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/entregas", "/vendor-certified-network", "/poe",
    ]),
    "Distribuidora de Alimentos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/entregas", "/vendor-certified-network", "/poe",
    ]),
    "Distribuidora de Máquinas e Insumos": new Set([
      ...CORE_VERTICAL_HREFS,
      "/estoque", "/entregas", "/vendor-certified-network", "/poe",
    ]),
  };

  const activeVerticalAllowlist = effectiveVertical
    ? verticalHrefAllowlists[effectiveVertical] ?? Object.entries(verticalHrefAllowlists)
      .find(([name]) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalizedVertical)?.[1]
    : undefined;

  const scoutVerticalLabels: Record<string, string> = {
    "Construção & Reforma": "Construção",
    "Varejo de Roupas & Acessórios": "Varejo",
    "Varejo de Eletroeletrônicos": "Varejo",
    "Varejo de Decoração, Variedades & Utilidades": "Varejo",
    "Bebês e Crianças": "Varejo",
    "Esportes e Lazer": "Varejo",
    "Automotivo — Acessórios e Som": "Varejo",
    "Papelaria e Livraria": "Varejo",
    "Joias, Relógios e Óticas": "Varejo",
    "Calçados": "Varejo",
    "Móveis": "Varejo",
    "Cama, Mesa e Banho": "Varejo",
    "Brinquedos": "Varejo",
    "Instrumentos Musicais": "Varejo",
    "Perfumaria e Cosméticos": "Varejo",
    "Floricultura": "Varejo",
    "Adega e Bebidas": "Varejo",
    "Produtos Naturais e Suplementos": "Varejo",
    "Armarinho e Tecidos": "Varejo",
    "Papelaria Criativa e Artesanato": "Varejo",
    "Games e Informática": "Varejo",
    "Pet Shop (Varejo)": "Varejo",
    "Material de Construção — Varejo": "Varejo",
    "Barbearia": "Salão",
    "Bicicletaria / Oficina de Bike": "CRM",
    "Gráfica Rápida": "CRM",
    "Supermercado": "Supermercado",
    "Seguros Corporativos": "Seguros",
    "Clínica": "Clínica",
    "Salão de Beleza": "Salão",
    "Arquitetura & Design": "Arquitetura",
    "Arquitetura": "Arquitetura",
    "Distribuidora de Materiais de Construção": "Materiais de Construção",
    "Distribuidora de Alimentos": "Alimentos",
    "Distribuidora de Máquinas e Insumos": "Máquinas e Insumos",
  };
  const scoutVerticalLabel = effectiveVertical
    ? scoutVerticalLabels[effectiveVertical]
    : undefined;

  function isVisible(item: typeof allNavItems[0]) {
    if (isStartPlan && !START_PLAN_HREFS.has(item.href)) return false;
    if (activeVerticalAllowlist && !activeVerticalAllowlist.has(item.href)) return false;
    if (disabledHrefs.has(item.href)) return false;
    if (isSeller && item.sellerHidden) return false;
    const knownSections = ["crm", "construcao", "varejo", "supermercado", "arch", "salao", "clinica", "farmacia", "inteligencia", "hub"];
    if (!knownSections.includes(item.section)) return false;
    if (item.section === "construcao" && !isConstrucao) return false;
    if (item.section === "varejo" && !isVarejo) return false;
    if (item.section === "supermercado" && !isSupermercado) return false;
    if (item.section === "salao" && !isSalao) return false;
    if (item.section === "clinica" && !isClinica) return false;
    if (item.section === "farmacia" && !isFarmacia) return false;
    const isAdmin = isSuperAdmin || isTenantAdmin;
    if (isAdmin) return true;
    return userFunction ? item.fn.includes(userFunction) : true;
  }

  const navigation = allNavItems
    .filter(isVisible)
    .map((item) =>
      item.href === "/scout" && scoutVerticalLabel
        ? { ...item, name: `Revenue Scout · ${scoutVerticalLabel}` }
        : item
    );

  const adminNavigation = isSuperAdmin
    ? [
        { name: "Tenants",     href: "/admin/tenants",    icon: Briefcase,    sellerHidden: false, section: "admin", badge: undefined },
        { name: "Verticais",   href: "/admin/verticais",  icon: Building2,    sellerHidden: false, section: "admin", badge: undefined },
        { name: "Marketplace", href: "/marketplace",      icon: Store,        sellerHidden: false, section: "admin", badge: undefined },
        { name: "AI Usage",    href: "/admin/ai-usage",   icon: BrainCircuit, sellerHidden: false, section: "admin", badge: undefined },
        { name: "Financeiro",  href: "/admin/financeiro", icon: BarChart3,    sellerHidden: false, section: "admin", badge: undefined },
        { name: "Parceiros",   href: "/admin/partners",   icon: Users,        sellerHidden: false, section: "admin", badge: undefined },
        { name: "Suporte",     href: "/admin/suporte",    icon: Bug,          sellerHidden: false, section: "admin", badge: openBugCount > 0 ? openBugCount : undefined },
        { name: "Relatos Técnicos", href: "/admin/relatos-tecnicos", icon: AlertCircle, sellerHidden: false, section: "admin", badge: undefined },
        { name: "Novidades",   href: "/admin/changelog",  icon: Bell,         sellerHidden: false, section: "admin", badge: undefined },
        { name: "Progresso de ML", href: "/admin/ml-status", icon: BrainCircuit, sellerHidden: false, section: "admin", badge: undefined },
      ]
    : [];

  const crmNav = navigation.filter((i) => i.section === "crm");
  const construcaoNav = navigation.filter((i) => i.section === "construcao");
  const varejoNav = navigation.filter((i) => i.section === "varejo");
  const supermercadoNav = navigation.filter((i) => i.section === "supermercado");
  const archNav = navigation.filter((i) => i.section === "arch");
  const salaoNav       = navigation.filter((i) => i.section === "salao");
  const clinicaNav     = navigation.filter((i) => i.section === "clinica");
  const farmaciaNav    = navigation.filter((i) => i.section === "farmacia");
  const inteligenciaNav= navigation.filter((i) => i.section === "inteligencia");
  const hubNav         = navigation.filter((i) => i.section === "hub");

  function resolveImgUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith("/objects/") ? `/api/storage${url}` : url;
  }

  function LogoBranding({ size }: { size: "lg" | "md" | "sm" }) {
    const tenantLogo = resolveImgUrl(user?.tenantLogoUrl);
    const whiteLabelCompleto = !!(user as any)?.tenantWhiteLabel;
    const vendorH    = size === "lg" ? "h-10" : size === "md" ? "h-8" : "h-7";
    const tenantH    = size === "lg" ? "h-9"  : size === "md" ? "h-7" : "h-6";

    if (!tenantLogo) {
      return <img src={logoFull} alt="Vendor.ai" className={`${vendorH} w-auto`} />;
    }

    // Marca branca completa (programa como Arqdor.ai) — nunca mostra
    // "Vendor.ai", só a marca do programa, sem o "×" de co-branding.
    if (whiteLabelCompleto) {
      return (
        <img
          src={tenantLogo}
          alt="Logo"
          className={`${vendorH} w-auto max-w-[160px] object-contain`}
          onError={(e) => ((e.currentTarget as HTMLImageElement).src = logoFull)}
        />
      );
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
          "group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
            : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.name}</span>
        {item.badge !== undefined && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
            isActive
              ? "bg-primary/15 text-primary"
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
              "w-full flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isConteudo
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
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
              <Link
                href="/content?tab=campanhas"
                onClick={onNavigate}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Megaphone className="h-3.5 w-3.5" /> Campanhas
              </Link>
              <Link
                href="/variedades-dia"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/variedades-dia"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Variedades Praça.ai
              </Link>
              {!isStartPlan && (
                <Link
                  href="/stories"
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                    location === "/stories"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Camera className="h-3.5 w-3.5" /> Stories Praça.ai
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Relatórios submenu */}
        <div>
          <button
            onClick={() => setRelatoriosOpen((v) => !v)}
            className={cn(
              "w-full flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isRelatorio
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
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

        {farmaciaNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <Pill className="h-3 w-3" />
              Farmácia
            </p>
            {farmaciaNav.map((item) => <NavItem key={item.href} item={item} onNavigate={onNavigate} />)}
          </div>
        )}

        {inteligenciaNav.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              {scoutVerticalLabel ? `Revenue Scout · ${scoutVerticalLabel}` : "Inteligência"}
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
        <div className="mb-1">
          <NovidadesBell />
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
    <div className="flex h-screen bg-background">
      {/* ── Desktop sidebar ────────────────────────────────── */}
      <div className="hidden md:flex w-[272px] bg-sidebar/92 backdrop-blur-2xl border-r border-sidebar-border/70 flex-col shrink-0">
        <div className="p-5 border-b border-sidebar-border/70">
          <LogoBranding size="lg" />
        </div>
        <div className="px-3 py-2 border-b">
          <StoreSwitcher />
        </div>
        <div className="vendor-scrollbar flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
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
          <div className="absolute left-0 top-0 h-full w-[min(88vw,320px)] bg-sidebar/98 backdrop-blur-2xl flex flex-col shadow-2xl">
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
            <div className="px-3 py-2 border-b">
              <StoreSwitcher />
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
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border/70 bg-background/90 backdrop-blur-xl shrink-0">
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
                {tenantOverride.preview ? (
                  <>
                    Preview de <strong>{tenantOverride.vertical}</strong> — somente layout, sem tenant
                  </>
                ) : (
                  <>
                    Visualizando módulo de{" "}
                    <strong>{tenantOverride.vertical}</strong> — Tenant:{" "}
                    <strong>{tenantOverride.name}</strong>
                  </>
                )}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-amber-700 hover:text-amber-900 hover:bg-amber-100 shrink-0 gap-1.5"
              onClick={() => { clearTenantOverride(); }}
            >
              <LogOut className="h-3.5 w-3.5" />
              {tenantOverride.preview ? "Sair do preview" : "Sair do tenant"}
            </Button>
          </div>
        )}
        <main className="vendor-scrollbar flex-1 overflow-y-auto">
          <div className="vendor-page-canvas">{children}</div>
        </main>
      </div>
    </div>
    {/* Hide global support widget on /arch/* routes (ARQDOR has its own shell) */}
    {!location.startsWith("/arch") && <SupportChatWidget />}
    </>
  );
}
