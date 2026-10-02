type UserFunction = "vendedor" | "representante_comercial" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro";

import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import React, { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGetTenantQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard, Users, Briefcase, MessageSquare, Calendar,
  Settings, LogOut, Megaphone, FileText, Receipt, BrainCircuit, Bell,
  Store, Package, PackagePlus, Menu, X, Sparkles, Globe, BookOpen, HardHat, Layers,
  Shirt, Tag, ShoppingCart, Heart, Gift, Truck, UtensilsCrossed, Megaphone as MegaphoneIcon, Navigation,
  BarChart3, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Target, Trophy, Search, Clapperboard, Building2, AlertCircle, Bot,
  DraftingCompass, FolderOpen, Scissors, User2, Stethoscope, TrendingUp, Zap, ListChecks, Network,
  Handshake, Shield, Cpu, Bug, Coins, Wrench, Pill, Home, Car, HelpCircle, WalletCards, Camera, KanbanSquare, ClipboardCheck, FileCheck, UserCog, Instagram,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logoFull from "/logo-full-light.svg";
import { applyTenantTheme, resetTenantTheme } from "@/lib/tenantTheme";

const StoreSwitcher = lazy(() => import("@/components/StoreSwitcher").then((m) => ({ default: m.StoreSwitcher })));
const NovidadesBell = lazy(() => import("@/components/NovidadesBell").then((m) => ({ default: m.NovidadesBell })));
const SupportChatWidget = lazy(() => import("@/components/support/SupportChatWidget").then((m) => ({ default: m.SupportChatWidget })));
const AccessLicenseBanner = lazy(() => import("@/components/billing/AccessLicenseBanner").then((m) => ({ default: m.AccessLicenseBanner })));

function GroupedNavSection({
  label,
  icon: Icon,
  active,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `vendorai_nav_group_${label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;

  // O estado do grupo precisa sobreviver à troca de rota. A sidebar pode
  // remontar quando o usuário abre uma tela e, sem persistência, um grupo
  // que estava aberto voltava ao estado inicial e "fechava" após o clique.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return active;
    return active || window.localStorage.getItem(storageKey) === "true";
  });

  React.useEffect(() => {
    if (!active) return;
    setOpen(true);
    window.localStorage.setItem(storageKey, "true");
  }, [active, storageKey]);

  const toggleOpen = () => {
    setOpen((value) => {
      const next = !value;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          "w-full flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>
      {open && <div className="ml-4 mt-1 space-y-1">{children}</div>}
    </div>
  );
}

export function SidebarLayout({ children, arqdorVisible = false }: { children: React.ReactNode; arqdorVisible?: boolean }) {
  const { user, logout, tenantOverride, clearTenantOverride, token, isEffectiveAdmin } = useAuth();
  const [location] = useLocation();
  // Menu lateral desktop -- botão manual (não mais hover) que alterna entre
  // expandida (com texto) e recolhida (só ícones), com a preferência salva
  // em localStorage. Lida direto do localStorage na inicialização, então
  // sobrevive a troca de tela mesmo que o componente remonte (era o motivo
  // real de "sumir"/resetar antes: o estado vivia só em memória).
  const SIDEBAR_STORAGE_KEY = "vendorai_sidebar_expanded";
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved === null ? true : saved === "true";
  });
  function toggleSidebar() {
    setSidebarExpanded((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  // Bloco inferior da sidebar: IA Assistente, usuário, ajuda, novidades e sair.
  // Abre sempre recolhido. O usuário pode expandir durante a sessão, mas a
  // próxima montagem da sidebar volta ao estado fechado.
  const [sidebarUtilitiesExpanded, setSidebarUtilitiesExpanded] = useState(false);
  function toggleSidebarUtilities() {
    setSidebarUtilitiesExpanded((prev) => !prev);
  }

  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportReady, setSupportReady] = useState(false);

  useEffect(() => {
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    const win = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(() => setSupportReady(true), { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(() => setSupportReady(true), 600);
    }

    return () => {
      if (idleId !== undefined && typeof win.cancelIdleCallback === "function") win.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);
  const isSuperAdmin = user?.platformRole === "super_admin";

  const { data: tenantData } = useQuery<{ planSlug: string | null; corPrimaria?: string | null; vertical?: string | null; verticalSecundaria?: string | null }>({
    queryKey: getGetTenantQueryKey(user?.tenantId ?? ""),
    enabled: !!user?.tenantId && !!token,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
  const START_PLAN_HREFS = new Set(["/", "/trabalho", "/catalogo", "/marketing/facebook-marketplace", "/varejo/produtos", "/supermercado/produtos", "/farmacia", "/farmacia/produtos", "/deals", "/pipeline-operacional", "/pipeline-relacionamento", "/base-conhecimento", "/configuracoes", "/faq"]);
  const isTenantAdmin = isEffectiveAdmin;
  // Todos os modelos comerciais entregam a experiência completa; a licença controla apenas o período ativo.
  const isStartPlan = false;

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
  type NavModule = { moduleKey: string; isEnabled: boolean; hasOverride: boolean; commerciallyEntitled?: boolean; accessSource?: string };
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
    leads:      ["/leads", "/empresas", "/deals", "/pipeline-operacional", "/pipeline-relacionamento"],
    prospector: ["/app/prospector"],
    scheduler:  ["/agenda"],
    revenue:    ["/scout", "/scout/regras", "/scout/oportunidades", "/scout/pipeline", "/scout/seguros/renovacoes"],
    analytics:  ["/analytics"],
    arch:       ["/arch", "/arch/projetos", "/arch/render", "/arch/catalogo", "/arch/marketplace"],
    obras:      ["/obras", "/insumos", "/composicoes"],
    financeiro: ["/erp"],
    settings:   ["/configuracoes", "/faq"],
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
      // A navegação só deve desaparecer por uma decisão persistida do tenant
      // (ou por um módulo estruturalmente default-off). Uma leitura comercial
      // transitória/incompleta não pode colapsar o menu inteiro. O bloqueio de
      // produto não contratado continua autoritativo no backend (403
      // PRODUCT_NOT_ENABLED), sem destruir a descoberta/navegação do CRM.
      .filter((m) => m.hasOverride === true && !m.isEnabled && m.accessSource !== "not_purchased")
      .flatMap((m) => MODULE_TO_HREFS[m.moduleKey] ?? [])
  );

  // A vertical do usuário vem da sessão e pode ficar desatualizada quando o
  // onboarding define o segmento depois do primeiro login. Prefere o valor
  // atual do tenant retornado pela API para atualizar o menu sem novo login.
  const effectiveVertical = isSuperAdmin && tenantOverride
    ? tenantOverride.vertical
    : tenantData?.vertical ?? user?.tenantVertical;
  // Vertical secundária: ainda não existe no preview de Super Admin
  // (TenantOverride não carrega esse campo hoje) -- só se aplica no tenant
  // real logado. Generaliza o mesmo padrão de "2 baldes ao mesmo tempo"
  // que já existia só pro Pet Shop.
  const effectiveVerticalSecundaria = isSuperAdmin && tenantOverride
    ? null
    : tenantData?.verticalSecundaria ?? null;
  type VerticalBucket =
    | "core" | "construcao" | "varejo" | "supermercado" | "salao" | "clinica"
    | "farmacia" | "imoveis" | "fretes" | "veiculos" | "arquitetura" | "seguros"
    | "servicos" | "distribuidora" | "food_service";

  // Fonte única de verdade: TODO nicho cadastrado (100 hoje, ver Admin →
  // Segmentos) precisa estar aqui, mapeado pro balde certo. Nicho sem
  // módulo próprio vai explicitamente pra "core" -- nunca fica de fora do
  // mapa, que era o bug real: vertical sem entrada aqui não filtrava NADA
  // (mostrava tudo junto: Farmácia + Veículos + Obras + Varejo ao mesmo
  // tempo), em vez de mostrar só o núcleo genérico.
  const VERTICAL_BUCKET: Record<string, VerticalBucket> = {
    "Construção & Reforma": "construcao",
    "Construtora": "construcao",
    "Construtora Residencial": "construcao",
    "Construção Civil": "construcao",
    "Gestão de Obras": "construcao",
    "Obras": "construcao",
    "Varejo de Roupas & Acessórios": "varejo",
    "Varejo de Eletroeletrônicos": "varejo",
    "Varejo de Decoração, Variedades & Utilidades": "varejo",
    "Bebês e Crianças": "varejo",
    "Esportes e Lazer": "varejo",
    "Automotivo — Acessórios e Som": "varejo",
    "Papelaria e Livraria": "varejo",
    "Joias, Relógios e Óticas": "varejo",
    "Calçados": "varejo",
    "Móveis": "varejo",
    "Cama, Mesa e Banho": "varejo",
    "Brinquedos": "varejo",
    "Instrumentos Musicais": "varejo",
    "Perfumaria e Cosméticos": "varejo",
    "Floricultura": "varejo",
    "Adega e Bebidas": "varejo",
    "Produtos Naturais e Suplementos": "varejo",
    "Armarinho e Tecidos": "varejo",
    "Papelaria Criativa e Artesanato": "varejo",
    "Games e Informática": "varejo",
    "Pet Shop (Varejo)": "varejo",
    "Material de Construção — Varejo": "varejo",
    "Supermercado": "supermercado",
    "Salão de Beleza": "salao",
    "Barbearia": "salao",
    // Bloco 1 da proposta de agrupamento (17/09): mesmo padrão de agenda +
    // profissional + serviço de preço fixo do salão, sem visita técnica.
    "Academia / Personal Trainer": "salao",
    "Estúdio de Pilates / Yoga": "salao",
    "Escolinha Esportiva / Artes Marciais": "salao",
    "Nutricionista": "salao",
    "Escola de Idiomas": "salao",
    "Creche / Berçário": "salao",
    "Hospedagem/Creche Pet": "salao",
    "Adestramento": "salao",
    "Clínica": "clinica",
    "Farmácia": "farmacia",
    "Imóveis": "imoveis",
    "Fretes": "fretes",
    "Veículos": "veiculos",
    "Arquitetura & Design": "arquitetura",
    "Arquitetura": "arquitetura",
    "Seguros Corporativos": "seguros",
    "Serviços": "servicos",
    "Distribuidora de Materiais de Construção": "distribuidora",
    "Distribuidora de Alimentos": "distribuidora",
    "Distribuidora de Máquinas e Insumos": "distribuidora",
    // Nichos "só template" (Admin → Segmentos), sem módulo de tela próprio
    // ainda -- core explícito, de propósito.
    "Açougue": "core",
    "Advocacia": "core",
    "Agência de Marketing / Publicidade": "core",
    "Agência de Viagens": "core",
    "Agropecuária": "core",
    "Assistência Técnica (Celular/Eletrônicos)": "servicos",
    "Banho e Tosa": "core",
    "Bicicletaria / Oficina de Bike": "core",
    "Buffet / Festas": "servicos",
    "Cafeteria": "food_service",
    "Casa & Decoração": "core",
    "Chaveiro": "servicos",
    "Comunicação Visual / Sinalização": "core",
    "Confecção / Facção Têxtil": "core",
    "Confeitaria / Doceria": "food_service",
    "Consultoria Empresarial": "core",
    "Contabilidade": "core",
    "Decoração de Eventos": "servicos",
    "Dedetização / Controle de Pragas": "servicos",
    "Delivery de comida": "food_service",
    "Desenvolvimento de Software / TI": "core",
    "Design Gráfico": "core",
    "Distribuição Técnica": "core",
    "Distribuidora de Peças": "core",
    "DJ / Som para Eventos": "servicos",
    "Educação": "core",
    "Energia & Climatização": "core",
    "Food truck": "food_service",
    "Fotografia / Filmagem": "servicos",
    "Funerária": "core",
    "Funilaria / Pintura": "servicos",
    "Gráfica Industrial": "core",
    "Gráfica Rápida": "core",
    "Hamburgueria": "food_service",
    "Hotel / Pousada": "core",
    "Jardinagem / Paisagismo": "servicos",
    "Lavajato": "servicos",
    "Lavanderia": "core",
    "Limpeza Residencial/Comercial": "servicos",
    "Locação de Equipamentos": "servicos",
    "Locação de Espaço para Eventos": "servicos",
    "Locadora de Veículos": "core",
    "Loja de Piscinas & Spas": "core",
    "Manutenção Predial": "servicos",
    "Marcenaria Sob Encomenda": "core",
    "Marmitaria": "food_service",
    "Metalúrgica": "core",
    "Mobilidade": "core",
    "Odontologia": "clinica",
    "Óptica": "clinica",
    "Padaria": "food_service",
    "Pizzaria": "food_service",
    "Recursos Humanos / Recrutamento": "core",
    "Restaurante": "food_service",
    "Saúde & Estética": "core",
    "Saúde Animal & Pet": "core",
    "Segurança Eletrônica / CFTV": "servicos",
    "Segurança Patrimonial / Monitoramento": "core",
    "Self Storage / Armazenagem": "core",
    "Serralheria": "servicos",
    "Transporte Turístico": "core",
  };

  const BUCKET_EXTRA_HREFS: Record<VerticalBucket, string[]> = {
    core: [],
    construcao: ["/entregas", "/estoque", "/obras", "/insumos", "/composicoes"],
    varejo: ["/estoque", "/varejo/produtos", "/varejo/colecoes", "/varejo/fornecedores", "/varejo/compras", "/varejo/fidelidade", "/varejo/combos"],
    supermercado: ["/supermercado", "/supermercado/produtos", "/supermercado/pedidos", "/supermercado/campanhas", "/supermercado/config"],
    salao: ["/beauty", "/beauty/agenda", "/beauty/servicos", "/beauty/profissionais"],
    clinica: ["/clinic", "/clinic/agenda", "/clinic/medicos"],
    farmacia: ["/farmacia", "/farmacia/produtos", "/farmacia/bulas", "/farmacia/pedidos", "/farmacia/receitas"],
    imoveis: ["/imoveis/propriedades", "/imoveis/visitas"],
    fretes: ["/fretes/cargas", "/fretes/veiculos", "/fretes/motorista"],
    veiculos: ["/veiculos/estoque", "/veiculos/test-drives"],
    arquitetura: ["/arch", "/arch/projetos", "/arch/render", "/arch/catalogo", "/arch/marketplace"],
    seguros: ["/scout/seguros/renovacoes"],
    servicos: ["/servicos", "/servicos/cadastros"],
    distribuidora: ["/estoque", "/entregas", "/vendor-certified-network", "/poe"],
    food_service: ["/food/pedidos", "/food/cardapio"],
  };

  function findVerticalBucket(vertical: string | null | undefined): VerticalBucket | null {
    if (!vertical) return null;
    if (VERTICAL_BUCKET[vertical]) return VERTICAL_BUCKET[vertical];
    const normalized = vertical.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const found = Object.entries(VERTICAL_BUCKET).find(
      ([name]) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized
    );
    if (found) return found[1];

    // Construção usa nomes diferentes entre cadastro antigo, onboarding e
    // templates comerciais (ex.: "Construtora", "Construtora Residencial",
    // "Construção Civil"). Tratar semanticamente evita que um tenant de obra
    // caia no bucket "core" e perca Obras/Insumos/Composições no menu.
    const constructionAliases = new Set([
      "construtora",
      "construcao",
      "construtora residencial",
      "construcao civil",
      "construcao & reforma",
      "gestao de obras",
      "obras",
    ]);
    if (constructionAliases.has(normalized)) {
      return "construcao";
    }

    // Fallback seguro: vertical com nome que não bate com nada -- provavelmente
    // erro de cadastro/digitação -- vira "core" em vez de "sem filtro nenhum".
    return "core";
  }

  const effectiveBucket = findVerticalBucket(effectiveVertical);
  const effectiveSecondaryBucket = findVerticalBucket(effectiveVerticalSecundaria);
  const isPetShop = effectiveVertical === "Pet Shop (Varejo)";

  const allNavItems = [
    { name: "Dashboard",     href: "/",             icon: LayoutDashboard, sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Central de Trabalho", href: "/trabalho", icon: ClipboardCheck, sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Leads",         href: "/leads",         icon: Users,           sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Empresas",      href: "/empresas",      icon: Building2,       sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Não-Leads",     href: "/contacts-nonleads", icon: UserCog,     sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Prospector",    href: "/app/prospector", icon: Search,         sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Negócios",      href: "/deals",         icon: Briefcase,       sellerHidden: false, section: "crm", fn: ["vendedor", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Pipelines", href: "/pipeline-operacional", icon: KanbanSquare, sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Conversas",     href: "/conversations", icon: MessageSquare,   sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Agenda",        href: "/agenda",        icon: Calendar,        sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "administrador", "outro"] as UserFunction[] },
    { name: "Operação Praça.ai", href: "/entregas-praca", icon: Truck, sellerHidden: false, section: "crm", fn: ["entrega"] as UserFunction[] },
    { name: "Gestão de Entregas", href: "/entregas", icon: Truck, sellerHidden: false, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Executivo Praça.ai", href: "/praca-executivo", icon: BarChart3, sellerHidden: false, section: "crm", fn: ["financeiro", "suporte", "administrador"] as UserFunction[] },
    { name: "Conciliação Praça.ai", href: "/praca-conciliacao", icon: FileCheck, sellerHidden: false, section: "crm", fn: ["financeiro", "administrador"] as UserFunction[] },
    { name: "Monitor Praça.ai", href: "/logistica-praca", icon: Navigation, sellerHidden: false, section: "crm", fn: ["suporte", "administrador"] as UserFunction[] },
    { name: "Orçamentos",    href: "/propostas",     icon: FileText,        sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "entrega", "administrador", "outro"] as UserFunction[] },
    { name: "Catálogo",      href: "/catalogo",      icon: BookOpen,        sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Marketplace FB", href: "/marketing/facebook-marketplace", icon: Store, sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Pacotes",       href: "/pacotes",       icon: PackagePlus,     sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Gestão ERP",    href: "/erp",           icon: WalletCards,     sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "administrador", "outro"] as UserFunction[] },
    { name: "Agentes",       href: "/agents/config", icon: Bot,           sellerHidden: true,  section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Vendi · Operações", href: "/vendi/operacoes", icon: Zap, sellerHidden: true, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Base de Conhecimento", href: "/base-conhecimento", icon: BookOpen, sellerHidden: true, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Métricas de IA",href: "/analytics",     icon: BarChart3,     sellerHidden: true,  section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    { name: "Painel da Rede",href: "/organizacao",   icon: Network,       sellerHidden: true,  section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Equipe",        href: "/usuarios",      icon: Users,           sellerHidden: false, section: "crm", fn: ["administrador"] as UserFunction[] },
    { name: "Configurações", href: "/configuracoes", icon: Settings,        sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },
    // "Stories" agora é um item dentro do dropdown "Marketing", não mais um item de topo.
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
    { name: "Estoque",       href: "/estoque",                  icon: Package,     sellerHidden: false, section: "distribuidora", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Pedidos",       href: "/food/pedidos",             icon: UtensilsCrossed, sellerHidden: false, section: "food_service", fn: ["administrador", "vendedor", "outro"] as UserFunction[] },
    { name: "Cardápio",      href: "/food/cardapio",            icon: BookOpen,    sellerHidden: false, section: "food_service", fn: ["administrador", "outro"] as UserFunction[] },
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
    "/agents/config", "/base-conhecimento", "/analytics", "/usuarios", "/configuracoes", "/faq",
    "/guia-implantacao", "/scout", "/scout/regras", "/scout/oportunidades", "/scout/pipeline",
    "/praca-perguntas", "/erp", "/ads", "/marketing/plano-de-midia",
  ];

  // Baldes de nicho já cobrem o que os antigos allowlists cobriam --
  // computa direto a partir de VERTICAL_BUCKET (fonte única). Pet Shop é
  // caso especial histórico: usa 2 baldes ao mesmo tempo (varejo +
  // salão/banho&tosa). Vertical secundária (campo genérico, qualquer
  // tenant pode ter) soma o balde dela do mesmo jeito.
  const activeVerticalAllowlist = effectiveVertical
    ? new Set([
        ...CORE_VERTICAL_HREFS,
        ...BUCKET_EXTRA_HREFS[effectiveBucket ?? "core"],
        ...(effectiveSecondaryBucket ? BUCKET_EXTRA_HREFS[effectiveSecondaryBucket] : []),
        ...(effectiveVertical === "Pet Shop (Varejo)" ? BUCKET_EXTRA_HREFS.salao : []),
      ])
    : undefined;

  const BUCKET_SCOUT_LABEL: Partial<Record<VerticalBucket, string>> = {
    construcao: "Construção",
    varejo: "Varejo",
    supermercado: "Supermercado",
    salao: "Salão",
    clinica: "Clínica",
    farmacia: "Farmácia",
    imoveis: "Imóveis",
    fretes: "Fretes",
    veiculos: "Veículos",
    arquitetura: "Arquitetura",
    seguros: "Seguros",
    servicos: "Serviços",
    // distribuidora usa 3 nomes diferentes conforme o nicho específico
    // (a rótulo genérico "Distribuidora" cobre os 3 igual de bem)
    distribuidora: "Distribuidora",
    // core: sem rótulo -- "Revenue Scout" sozinho, sem sufixo
  };
  const scoutVerticalLabel = effectiveBucket ? BUCKET_SCOUT_LABEL[effectiveBucket] : undefined;

  // Política única de experiência por vertical:
  // - "crm", inteligência e administração são capacidades compartilhadas;
  // - cada seção operacional pertence explicitamente a um bucket;
  // - uma vertical nunca herda a operação de outra vertical por acidente;
  // - Arqdor é tratado fora desta lista e só aparece quando arqdorVisible=true.
  const VERTICAL_OPERATION_SECTIONS: Record<Exclude<VerticalBucket, "core" | "arquitetura" | "seguros">, string[]> = {
    construcao: ["construcao"],
    varejo: ["varejo"],
    supermercado: ["supermercado"],
    salao: ["salao"],
    clinica: ["clinica"],
    farmacia: ["farmacia"],
    imoveis: ["imoveis"],
    fretes: ["fretes"],
    veiculos: ["veiculos"],
    servicos: ["servicos"],
    distribuidora: ["distribuidora"],
    food_service: ["food_service"],
  };
  const activeBuckets = new Set<VerticalBucket>(
    [
      effectiveBucket,
      effectiveSecondaryBucket,
      ...(effectiveVertical === "Pet Shop (Varejo)" ? (["salao"] as VerticalBucket[]) : []),
    ].filter((bucket): bucket is VerticalBucket => Boolean(bucket))
  );
  const sectionBuckets = new Map<string, VerticalBucket[]>();
  Object.entries(VERTICAL_OPERATION_SECTIONS).forEach(([bucket, sections]) => {
    sections.forEach((section) => {
      const list = sectionBuckets.get(section) ?? [];
      list.push(bucket as VerticalBucket);
      sectionBuckets.set(section, list);
    });
  });

  function isVisible(item: typeof allNavItems[0]) {
    if (isStartPlan && !START_PLAN_HREFS.has(item.href)) return false;
    if (activeVerticalAllowlist && !activeVerticalAllowlist.has(item.href)) return false;
    if (disabledHrefs.has(item.href)) return false;
    if (isSeller && item.sellerHidden) return false;
    const knownSections = [
      "crm", "construcao", "varejo", "supermercado", "salao", "clinica", "farmacia",
      "imoveis", "fretes", "veiculos", "servicos", "distribuidora", "food_service",
      "inteligencia", "hub", "arch",
    ];
    if (!knownSections.includes(item.section)) return false;
    // /arch/* nunca é montado como seção genérica: o Arqdor entra uma única
    // vez, pelo shell principal, somente nas verticais elegíveis.
    if (item.section === "arch") return false;
    const allowedBuckets = sectionBuckets.get(item.section);
    if (allowedBuckets && !allowedBuckets.some((bucket) => activeBuckets.has(bucket))) return false;
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
        { name: "Segmentos",   href: "/admin/verticais",  icon: Building2,    sellerHidden: false, section: "admin", badge: undefined },
        { name: "App Builder", href: "/admin/app-builder", icon: Cpu,          sellerHidden: false, section: "admin", badge: undefined },
        { name: "Produtos",    href: "/admin/produtos-internos", icon: Package, sellerHidden: false, section: "admin", badge: undefined },
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
  const verticalOperationSectionNames = new Set(Object.values(VERTICAL_OPERATION_SECTIONS).flat());
  const verticalNav = navigation.filter((i) => verticalOperationSectionNames.has(i.section));
  const inteligenciaNav= navigation.filter((i) => i.section === "inteligencia");
  const hubNav         = navigation.filter((i) => i.section === "hub");

  function resolveImgUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const value = url.trim();
    if (!value) return null;
    if (value.startsWith("/objects/")) return `/api/storage${value}`;
    if (value.startsWith("objects/")) return `/api/storage/${value}`;
    if (/^(https?:|data:|blob:)/i.test(value) || value.startsWith("/api/") || value.startsWith("/")) return value;
    // Valores antigos gravados apenas como UUID/chave não são URLs públicas.
    // Ignorar evita requests como GET /500dad44-... => 404; o logo VendorAI vira fallback.
    return null;
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
        data-arqdor-tool-entry={item.arqdorToolEntry ? "true" : undefined}
        onClick={() => {
          if (item.href === "/faq") sessionStorage.setItem("vendorai_help_from", location);
          onNavigate?.();
        }}
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
    const relatoriosStorageKey = "vendorai_nav_group_relatorios";
    const relatoriosActive =
      location === "/relatorios" || location.startsWith("/relatorios/") || location === "/analytics";
    const [relatoriosOpen, setRelatoriosOpen] = useState<boolean>(() => {
      if (typeof window === "undefined") return relatoriosActive;
      return relatoriosActive || window.localStorage.getItem(relatoriosStorageKey) === "true";
    });
    const isRelatorio = relatoriosActive;
    const isConteudo =
      location.startsWith("/content") ||
      location === "/ads" ||
      location === "/marketing/plano-de-midia" ||
      location === "/marketing/instagram" ||
      location === "/marketing/facebook-marketplace";
    const marketingStorageKey = "vendorai_nav_group_marketing";
    const [conteudoOpen, setConteudoOpen] = useState<boolean>(() => {
      if (typeof window === "undefined") return isConteudo;
      return isConteudo || window.localStorage.getItem(marketingStorageKey) === "true";
    });

    React.useEffect(() => {
      if (isConteudo) {
        setConteudoOpen(true);
        window.localStorage.setItem(marketingStorageKey, "true");
      }
    }, [isConteudo]);

    React.useEffect(() => {
      if (relatoriosActive) {
        setRelatoriosOpen(true);
        window.localStorage.setItem(relatoriosStorageKey, "true");
      }
    }, [relatoriosActive]);
    const isGeradorConteudo = location === "/content";
    const isCampanhas = location.startsWith("/content?tab=campanhas");

    const homeHrefs = new Set(["/", "/trabalho"]);
    const commercialHrefs = new Set(["/propostas", "/catalogo", "/pacotes"]);
    const financeHrefs = new Set(["/erp"]);
    const administrationHrefs = new Set(["/organizacao", "/usuarios", "/configuracoes"]);
    const operationHrefs = new Set(["/entregas"]);
    const aiKnowledgeHrefs = new Set(["/agents/config", "/vendi/operacoes", "/base-conhecimento"]);
    const reportHrefs = new Set(["/analytics"]);
    const pracaHrefs = new Set(["/entregas-praca", "/praca-executivo", "/praca-conciliacao", "/logistica-praca"]);
    const marketingHrefs = new Set(["/marketing/facebook-marketplace"]);
    const groupedCoreHrefs = new Set([
      ...homeHrefs,
      ...commercialHrefs,
      ...financeHrefs,
      ...administrationHrefs,
      ...operationHrefs,
      ...aiKnowledgeHrefs,
      ...reportHrefs,
      ...pracaHrefs,
      ...marketingHrefs,
    ]);

    const homeNav = crmNav.filter((item) => homeHrefs.has(item.href));
    const crmAtendimentoNav = crmNav.filter((item) => !groupedCoreHrefs.has(item.href));
    const commercialNav = crmNav.filter((item) => commercialHrefs.has(item.href));
    const financeNav = crmNav.filter((item) => financeHrefs.has(item.href));
    const administrationNav = crmNav.filter((item) => administrationHrefs.has(item.href));
    const operationNav = crmNav.filter((item) => operationHrefs.has(item.href));
    const aiKnowledgeNav = crmNav.filter((item) => aiKnowledgeHrefs.has(item.href));
    const analyticsNav = crmNav.filter((item) => reportHrefs.has(item.href));
    const pracaAiNav = crmNav.filter((item) => pracaHrefs.has(item.href));
    const verticalOperationNav = [
      ...operationNav,
      ...verticalNav.filter((item) => item.href !== "/beauty/agenda" && item.href !== "/clinic/agenda"),
    ].filter((item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index);

    // Praça.ai fica oculto para todos os tenants nesta fase. A infraestrutura
    // e as rotas permanecem preservadas para o Super Admin e reativação futura.
    const pracaAiEnabled = false;
    const isPracaAi =
      location === "/stories" ||
      location === "/variedades-dia" ||
      location === "/praca-perguntas" ||
      location === "/praca-variedades" ||
      pracaHrefs.has(location);

    const groupActive = (items: Array<{ href: string }>) =>
      items.some((item) => location === item.href || (item.href !== "/" && location.startsWith(item.href)));
    return (
      <>
        {homeNav.map((item) => (
          <NavItem key={item.href} item={item} onNavigate={onNavigate} />
        ))}

        {crmAtendimentoNav.length > 0 && (
          <GroupedNavSection
            label="CRM & Atendimento"
            icon={Briefcase}
            active={groupActive(crmAtendimentoNav)}
          >
            {crmAtendimentoNav.map((item) => (
              <NavItem key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </GroupedNavSection>
        )}

        {commercialNav.length > 0 && (
          <GroupedNavSection
            label="Produtos & Comercial"
            icon={FileText}
            active={groupActive(commercialNav)}
          >
            {commercialNav.map((item) => (
              <NavItem key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </GroupedNavSection>
        )}

        {verticalOperationNav.length > 0 && (
          <GroupedNavSection
            label="Operação"
            icon={ClipboardCheck}
            active={groupActive(verticalOperationNav)}
          >
            {verticalOperationNav.map((item) => (
              <NavItem key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </GroupedNavSection>
        )}

        {arqdorVisible && (
          <NavItem
            item={{ name: "Arqdor.ai", href: "/arch", icon: DraftingCompass, arqdorToolEntry: true }}
            onNavigate={onNavigate}
          />
        )}

        {financeNav.map((item) => (
          <NavItem key={item.href} item={item} onNavigate={onNavigate} />
        ))}

        {pracaAiEnabled && (
          <GroupedNavSection label="Praça.ai" icon={Store} active={isPracaAi}>
            {pracaAiNav.map((item) => (
              <NavItem key={item.href} item={item} onNavigate={onNavigate} />
            ))}
            <Link
              href="/praca-perguntas"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                location === "/praca-perguntas"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Perguntas Praça.ai
            </Link>
            <Link
              href="/praca-variedades"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                location === "/praca-variedades"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Variedades Praça.ai
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
              <Sparkles className="h-3.5 w-3.5" /> Variedades do Dia
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
          </GroupedNavSection>
        )}

        {/* Marketing submenu — fonte declarativa oficial */}
        <div>
          <button
            onClick={() => setConteudoOpen((v) => {
              const next = !v;
              window.localStorage.setItem(marketingStorageKey, String(next));
              return next;
            })}
            className={cn(
              "w-full flex min-h-[44px] items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isConteudo
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 shrink-0" />
              Marketing
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
                  isGeradorConteudo
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Gerador de Conteúdo
              </Link>
              <Link
                href="/marketing/instagram"
                onClick={onNavigate}
                aria-label="Instagram — grade e publicação"
                title="Instagram — grade e publicação"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/marketing/instagram"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </Link>
              <Link
                href="/content-studio/video"
                onClick={onNavigate}
                aria-label="Vídeo com IA — VendorAI Media Engine"
                title="Vídeo com IA — VendorAI Media Engine"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location.startsWith("/content-studio/video")
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Clapperboard className="h-3.5 w-3.5" /> Vídeo com IA
              </Link>
              <Link