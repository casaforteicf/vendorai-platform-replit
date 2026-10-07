import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense, useEffect, useState } from "react";
import { RouteContentErrorBoundary } from "@/components/RouteContentErrorBoundary";
import {
  useGetTenant,
  getGetTenantQueryKey,
  useListInvoices,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";

// ── Lazy authenticated shell imports ──
const SidebarLayout      = lazy(() => import("@/components/layout/SidebarLayout").then((m) => ({ default: m.SidebarLayout })));
const DemoBanner         = lazy(() => import("@/components/DemoBanner").then((m) => ({ default: m.DemoBanner })));

// ── Lazy page imports (code splitting — each page loads only when navigated to) ──
const VideoHome          = lazy(() => import("@/pages/video/VideoHome"));
const VideoProjectDirectPage = lazy(() => import("@/pages/video/VideoProjectDirectPage"));
const Login              = lazy(() => import("@/pages/Login"));
const Register           = lazy(() => import("@/pages/Register"));
const ForgotPassword     = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword      = lazy(() => import("@/pages/ResetPassword"));
const GoogleAuthSuccess  = lazy(() => import("@/pages/GoogleAuthSuccess"));
const ContactSales       = lazy(() => import("@/pages/demo/contact-sales"));
const PortalObra         = lazy(() => import("@/pages/PortalObra"));
const ObraCampo           = lazy(() => import("@/pages/ObraCampo"));
const PublicProposta     = lazy(() => import("@/pages/PublicProposta"));
const ServicoAcompanhamentoPublico = lazy(() => import("@/pages/ServicoAcompanhamentoPublico"));
const PublicDiagnosticoNegocio = lazy(() => import("@/pages/PublicDiagnosticoNegocio"));
const PublicDeliveryRuntime = lazy(() => import("@/pages/PublicDeliveryRuntime"));
const PublicSupportAssistance = lazy(() => import("@/pages/PublicSupportAssistance"));
const ForcePasswordChange= lazy(() => import("@/pages/ForcePasswordChange"));
const AcceptInvite       = lazy(() => import("@/pages/AcceptInvite"));
const NotFound           = lazy(() => import("@/pages/not-found"));
const Suspended          = lazy(() => import("@/pages/Suspended"));

const Dashboard          = lazy(() => import("@/pages/dashboard/Dashboard"));
const WorkCenterHome     = lazy(() => import("@/pages/WorkCenterHome"));
const ComissoesVendedor  = lazy(() => import("@/pages/ComissoesVendedor"));
const Leads              = lazy(() => import("@/pages/Leads"));
const Companies          = lazy(() => import("@/pages/Companies"));
const ImportConfig       = lazy(() => import("@/pages/leads/import-config"));
const NonLeadContacts    = lazy(() => import("@/pages/contacts-nonleads"));
const LeadWorkspace      = lazy(() => import("@/pages/LeadWorkspace"));
const CompanyCenter      = lazy(() => import("@/pages/CompanyCenter"));
const Prospector         = lazy(() => import("@/pages/Prospector"));
const FlowBuilder        = lazy(() => import("@/pages/prospector/FlowBuilder"));
const FlowExecutions     = lazy(() => import("@/pages/prospector/FlowExecutions"));
const Deals              = lazy(() => import("@/pages/Deals"));
const OperationalMeasurementChecklist = lazy(() => import("@/pages/OperationalMeasurementChecklist"));
const PipelineOperacional = lazy(() => import("@/pages/PipelineOperacional"));
const PipelineRelacionamento = lazy(() => import("@/pages/PipelineRelacionamento"));
const Conversations      = lazy(() => import("@/pages/Conversations"));
const Agenda             = lazy(() => import("@/pages/Agenda"));
const MinhasEntregas     = lazy(() => import("@/pages/MinhasEntregas"));
const Configuracoes      = lazy(() => import("@/pages/Configuracoes"));
const BrandKitSettingsOnly = lazy(() => import("@/components/BrandKitSettings").then((m) => ({ default: m.BrandKitSettings })));
const KnowledgeBase      = lazy(() => import("@/pages/KnowledgeBase"));
const SolicitacaoCompra  = lazy(() => import("@/pages/SolicitacaoCompra"));
const Pacotes            = lazy(() => import("@/pages/Pacotes"));
const ContentAutopilot   = lazy(() => import("@/pages/ContentAutopilot"));
const Ads                = lazy(() => import("@/pages/Ads"));
const PlanoMidia         = lazy(() => import("@/pages/PlanoMidia"));
const RastreioFrete      = lazy(() => import("@/pages/RastreioFrete"));
const AcompanharEntrega  = lazy(() => import("@/pages/AcompanharEntrega"));
const MonitorLogisticaPraca = lazy(() => import("@/pages/MonitorLogisticaPraca"));
const DashboardExecutivoPraca = lazy(() => import("@/pages/DashboardExecutivoPraca"));
const ConciliacaoFinanceiraPraca = lazy(() => import("@/pages/ConciliacaoFinanceiraPraca"));
const AppEntregadorPraca = lazy(() => import("@/pages/AppEntregadorPraca"));
const Usuarios           = lazy(() => import("@/pages/Usuarios"));
const Propostas          = lazy(() => import("@/pages/Propostas"));
const CatalogoProdutos   = lazy(() => import("@/pages/CatalogoProdutos"));
const FacebookMarketplaceManager = lazy(() => import("@/pages/FacebookMarketplaceManager"));
const CategoriasProduto  = lazy(() => import("@/pages/CategoriasProduto"));
const PropostaPrint      = lazy(() => import("@/pages/PropostaPrint"));
const AdminAIUsage       = lazy(() => import("@/pages/AdminAIUsage"));
const AdminPartners      = lazy(() => import("@/pages/AdminPartners"));
const AdminTenants       = lazy(() => import("@/pages/AdminTenants"));
const AdminTenantDetail  = lazy(() => import("@/pages/AdminTenantDetail"));
const AdminVerticals     = lazy(() => import("@/pages/AdminVerticals"));
const AdminAppBuilder    = lazy(() => import("@/pages/AdminAppBuilder"));
const AdminProdutosInternos = lazy(() => import("@/pages/AdminProdutosInternos"));
const AgentDefaults      = lazy(() => import("@/pages/admin/AgentDefaults"));
const SupportAdmin       = lazy(() => import("@/pages/admin/SupportAdmin"));
const RelatosTecnicos    = lazy(() => import("@/pages/admin/RelatosTecnicos"));
const AdminChangelog     = lazy(() => import("@/pages/admin/AdminChangelog"));
const AdminMlStatus      = lazy(() => import("@/pages/admin/AdminMlStatus"));
const AdminKnowledgeBaseInternal = lazy(() => import("@/pages/admin/AdminKnowledgeBaseInternal"));
const AdminImprovements   = lazy(() => import("@/pages/admin/AdminImprovements"));
const AdminFinanceiro    = lazy(() => import("@/pages/AdminFinanceiro"));
const OrganizacaoPainel  = lazy(() => import("@/pages/OrganizacaoPainel"));
const PartnerDashboard   = lazy(() => import("@/pages/PartnerDashboard"));
const PartnerDash        = lazy(() => import("@/pages/partner/PartnerDashboard"));
const PartnerLeads       = lazy(() => import("@/pages/partner/PartnerLeads"));
const PartnerLeadDetail  = lazy(() => import("@/pages/partner/PartnerLeadDetail"));
const PartnerCommissions = lazy(() => import("@/pages/partner/PartnerCommissions"));
const SiteLandingPage    = lazy(() => import("@/pages/SiteLandingPage"));
const Marketplace        = lazy(() => import("@/pages/Marketplace"));
const Estoque            = lazy(() => import("@/pages/Estoque"));
const GestaoErp          = lazy(() => import("@/pages/GestaoErp"));
const ErpCapture         = lazy(() => import("@/pages/erp"));
const Content            = lazy(() => import("@/pages/ContentHub"));
const MarketingInstagram = lazy(() => import("@/pages/MarketingInstagram"));
const MediaCenter        = lazy(() => import("@/pages/MediaCenter"));
const GrowthLabConnected = lazy(() => import("@/pages/GrowthLabConnected"));

const VideoAvatarPage    = lazy(() => import("@/pages/video/VideoAvatarPage"));
const VideoAvatarCaptureRoute = lazy(() => import("@/pages/video/VideoAvatarCaptureRoute"));
const VideoProdutoPage   = lazy(() => import("@/pages/video/VideoProdutoPage"));
const VideoEdicaoPage    = lazy(() => import("@/pages/video/VideoEdicaoPage"));
const VideoLegendaPage   = lazy(() => import("@/pages/video/VideoLegendaPage"));
const VideoClipesPage    = lazy(() => import("@/pages/video/VideoClipesPage"));
const VideoLotePage      = lazy(() => import("@/pages/video/VideoLotePage"));
const GuiaImplantacao    = lazy(() => import("@/pages/GuiaImplantacao"));
const FAQ                = lazy(() => import("@/pages/faq"));
const Questionario       = lazy(() => import("@/pages/Questionario"));
const Analytics          = lazy(() => import("@/pages/Analytics"));
const AgentConfig        = lazy(() => import("@/pages/agents/AgentConfig"));
const VendiOperations    = lazy(() => import("@/pages/agents/VendiOperations"));
const VendiHandoff       = lazy(() => import("@/pages/agents/VendiHandoff"));
const RelatoriosVisaoGeral = lazy(() => import("@/pages/RelatoriosVisaoGeral"));
const RelatorioGanhosMes = lazy(() => import("@/pages/RelatorioGanhosMes"));
const RelatorioTipoCliente = lazy(() => import("@/pages/RelatorioTipoCliente"));
const RelatorioDores     = lazy(() => import("@/pages/RelatorioDores"));

// VKG
const VKGDemo = lazy(() => import("@/modules/vkg/VKGDemoView").then(m => ({ default: m.VKGDemoView })));

// Vendor Brain
const VendorBrainDash = lazy(() => import("@/modules/vendor-brain/VendorBrainDashboard").then(m => ({ default: m.VendorBrainDashboard })));

// Partner Hub — FASE 20
const PartnerHub = lazy(() => import("@/pages/partner-hub/PartnerHubPage").then(m => ({ default: m.PartnerHubPage })));
const PartnerDetail = lazy(() => import("@/pages/partner-hub/PartnerDetailPage").then(m => ({ default: m.PartnerDetailPage })));
const EcosystemHub = lazy(() => import("@/pages/ecosystem-hub/EcosystemHubPage").then(m => ({ default: m.EcosystemHubPage })));
const EcosystemCompanyCreate = lazy(() => import("@/pages/ecosystem-hub/EcosystemCompanyCreatePage"));
const CompanyDetail = lazy(() => import("@/pages/ecosystem-hub/CompanyDetailPage").then(m => ({ default: m.CompanyDetailPage })));
const VCNHub = lazy(() => import("@/pages/vcn/VCNPage").then(m => ({ default: m.VCNPage })));
const VCNCompanyDetail = lazy(() => import("@/pages/vcn/VCNCompanyDetailPage").then(m => ({ default: m.VCNCompanyDetailPage })));
const POEHub = lazy(() => import("@/pages/poe/POEPage").then(m => ({ default: m.POEPage })));

// Arch
const ArchDashboard = lazy(() => import("@/pages/arch/ArchDashboard"));
const ArchProjetos = lazy(() => import("@/pages/arch/Projetos"));
const ArchProjetoDetalhe = lazy(() => import("@/pages/arch/ProjetoDetalhe"));
const ArchCatalogo = lazy(() => import("@/pages/arch/Catalogo"));
const ArchMarketplace = lazy(() => import("@/pages/arch/Marketplace"));
const ArchPortalCliente = lazy(() => import("@/pages/arch/PortalCliente"));
const ArchRender = lazy(() => import("@/pages/arch/RenderStudioPage"));
const ArchWorkspace = lazy(() => import("@/modules/arqdor/workspace/ArqWorkspace"));
const ArchConcept = lazy(() => import("@/pages/arch/ConceptPlanner"));
const ArchPublicConceptTour = lazy(() => import("@/pages/arch/PublicConceptTour"));
const ArchPublicConceptSignup = lazy(() => import("@/pages/arch/PublicConceptSignup"));

// Construção
const Obras = lazy(() => import("@/pages/Obras"));
const ObraDetalhe = lazy(() => import("@/pages/ObraDetalhe"));
const Insumos = lazy(() => import("@/pages/Insumos"));
const Composicoes = lazy(() => import("@/pages/Composicoes"));

// Varejo
const VarejoProdutos = lazy(() => import("@/pages/VarejoProdutos"));
const VarejoProdutoDetalhe = lazy(() => import("@/pages/VarejoProdutoDetalhe"));
const VarejoColecoes = lazy(() => import("@/pages/VarejoColecoes"));
const VarejoFornecedores = lazy(() => import("@/pages/VarejoFornecedores"));
const VarejoCompras = lazy(() => import("@/pages/VarejoCompras"));
const VarejoFidelidade = lazy(() => import("@/pages/VarejoFidelidade"));
const VarejoCombos = lazy(() => import("@/pages/VarejoCombos"));

// Revenue Scout
const RevenueDashboard = lazy(() => import("@/pages/scout/RevenueDashboard"));
const ScoutRegras = lazy(() => import("@/pages/scout/Regras"));
const ScoutOportunidades = lazy(() => import("@/pages/scout/Oportunidades"));
const ScoutPipeline = lazy(() => import("@/pages/scout/Pipeline"));
const InsuranceRenewals = lazy(() => import("@/pages/scout/InsuranceRenewals"));

// Clínica
const ClinicDashboard = lazy(() => import("@/pages/clinic/ClinicDashboard"));
const AgendaClinica = lazy(() => import("@/pages/clinic/AgendaClinica"));
const ClinicProntuario = lazy(() => import("@/pages/clinic/Prontuario"));
const ClinicMedicos = lazy(() => import("@/pages/clinic/Medicos"));

// Beauty — Salão de Beleza
const BeautyDashboard = lazy(() => import("@/pages/beauty/BeautyDashboard"));
const ServicosOrdens = lazy(() => import("@/pages/servicos/ServicosOrdens"));
const ServicosCadastros = lazy(() => import("@/pages/servicos/ServicosCadastros"));
const FoodPedidos = lazy(() => import("@/pages/food/FoodPedidos"));
const FoodCardapio = lazy(() => import("@/pages/food/FoodCardapio"));
const FarmaciaProdutos = lazy(() => import("@/pages/farmacia/FarmaciaProdutos"));
const FarmaciaBulas = lazy(() => import("@/pages/farmacia/FarmaciaBulas"));
const FarmaciaPedidos = lazy(() => import("@/pages/farmacia/FarmaciaPedidos"));
const FarmaciaReceitas = lazy(() => import("@/pages/farmacia/FarmaciaReceitas"));
const FarmaciaOperacao = lazy(() => import("@/pages/farmacia/FarmaciaOperacao"));
const ImoveisPropriedades = lazy(() => import("@/pages/imoveis/ImoveisPropriedades"));
const ImoveisVisitas = lazy(() => import("@/pages/imoveis/ImoveisVisitas"));
const FretesCargas = lazy(() => import("@/pages/fretes/FretesCargas"));
const StoriesLojista = lazy(() => import("@/pages/StoriesLojista"));
const VariedadesLojista = lazy(() => import("@/pages/VariedadesLojista"));
const FretesVeiculos = lazy(() => import("@/pages/fretes/FretesVeiculos"));
const FretesMotorista = lazy(() => import("@/pages/fretes/FretesMotorista"));
const VeiculosEstoque = lazy(() => import("@/pages/veiculos/VeiculosEstoque"));
const VeiculosTestDrives = lazy(() => import("@/pages/veiculos/VeiculosTestDrives"));
const PracaPerguntas = lazy(() => import("@/pages/PracaPerguntas"));
const PracaVariedades = lazy(() => import("@/pages/supermercado/SupermercadoCampanhas"));
const BeautyAgenda = lazy(() => import("@/pages/beauty/Agenda"));
const BeautyServicos = lazy(() => import("@/pages/beauty/Servicos"));
const BeautyProfissionais = lazy(() => import("@/pages/beauty/Profissionais"));

// Supermercado
const SupermercadoDashboard = lazy(() => import("@/pages/supermercado/SupermercadoDashboard"));
const SupermercadoProdutos = lazy(() => import("@/pages/supermercado/SupermercadoProdutos"));
const SupermercadoPedidos = lazy(() => import("@/pages/supermercado/SupermercadoPedidos"));
const SupermercadoCampanhas = lazy(() => import("@/pages/supermercado/SupermercadoCampanhas"));
const SupermercadoConfig = lazy(() => import("@/pages/supermercado/SupermercadoConfig"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 402) return false;
        return failureCount < 2;
      },
    },
  },
});

function Spinner({ debug }: { debug?: Record<string, unknown> } = {}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background gap-4">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      {slow && debug && (
        <pre
          style={{
            background: "#1a0a0a",
            color: "#ffdada",
            padding: "12px",
            fontSize: "12px",
            maxWidth: "90vw",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {"DIAG spinner travado:\n" + JSON.stringify(debug, null, 2)}
        </pre>
      )}
    </div>
  );
}

function RouteContentFallback() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!slow) {
    return (
      <div className="min-h-[50vh] w-full flex items-center justify-center">
        <div className="animate-spin h-7 w-7 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h2 className="text-base font-semibold">Esta tela demorou mais que o esperado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O menu continua disponível. Se houve uma atualização do VendorAI enquanto esta aba estava aberta, carregue a versão atual do sistema.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Carregar versão atual
          </button>
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            onClick={() => { window.location.href = "/dashboard"; }}
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteContentBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const routeKey = location.split("?")[0] || "/";

  return (
    <RouteContentErrorBoundary routeKey={routeKey}>
      <Suspense fallback={<RouteContentFallback />}>{children}</Suspense>
    </RouteContentErrorBoundary>
  );
}

function RedirectPage({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);
  return null;
}

function LegacyCampaignHubRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    setLocation(view === "mercados" ? "/content?tab=campanhas&view=mercados" : "/content?tab=campanhas");
  }, [setLocation]);
  return null;
}

function MarketingSettingsOnlyPage() {
  return (
    <div className="vendor-page-canvas mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
      <BrandKitSettingsOnly />
    </div>
  );
}

function ConfiguracoesRoute() {
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  return requestedTab === "marketing"
    ? <ProtectedRoute component={MarketingSettingsOnlyPage} />
    : <ProtectedRoute component={Configuracoes} />;
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const isTenantAdmin = user?.platformRole === "tenant_admin";
  const isInstallationAction = location.split("?")[0] === "/configuracoes" && new URLSearchParams(window.location.search).get("installation") === "1";
  const isSetupRoute = isInstallationAction;

  const { data: tenant, isLoading: tenantLoading } = useGetTenant(
    user?.tenantId ?? "",
    {
      query: {
        enabled:
          !isLoading &&
          !!token &&
          isTenantAdmin &&
          !!user?.tenantId &&
          !isSetupRoute,
        queryKey: getGetTenantQueryKey(user?.tenantId ?? ""),
      },
    }
  );

  const { data: invoices } = useListInvoices(
    user?.tenantId ?? "",
    undefined,
    {
      query: {
        enabled:
          !isLoading &&
          !!token &&
          isTenantAdmin &&
          !!user?.tenantId &&
          !isSetupRoute,
        queryKey: getListInvoicesQueryKey(user?.tenantId ?? ""),
      },
    }
  );

  const hasOverdueInvoice = invoices?.some((inv) => inv.status === "atrasada") ?? false;

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    }
  }, [token, isLoading, setLocation]);

  if (isLoading || !token || !user) {
    return (
      <Spinner
        debug={{
          isLoading,
          hasToken: !!token,
          hasUser: !!user,
          hasRawTokenInStorage: !!localStorage.getItem("vendorai_token"),
          location,
        }}
      />
    );
  }
  // Keep them running in parallel and react when data arrives, but never hold the whole app
  // on a full-screen spinner if one of those endpoints is slow, rate-limited or unavailable.
  if (isTenantAdmin && (tenant?.status === "suspended" || hasOverdueInvoice)) return <Suspended />;

  return (
    <SidebarLayout>
      <DemoBanner />
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>
  );
}

function FullscreenProtectedRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    }
  }, [token, isLoading, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;

  return (
    <RouteContentBoundary>
      <Component {...rest} />
    </RouteContentBoundary>
  );
}

function SuperAdminRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && user.platformRole !== "super_admin") {
      setLocation("/");
    }
  }, [token, user, isLoading, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (user.platformRole !== "super_admin") return null;

  return (
    <SidebarLayout>
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>
  );
}

function PartnerRoute({ component: Component }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && user.platformRole !== "partner") {
      setLocation("/");
    }
  }, [token, user, isLoading, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (user.platformRole !== "partner") return null;

  return (
    <RouteContentBoundary>
      <Component />
    </RouteContentBoundary>
  );
}

function OnboardingRoute() {
  const { token, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) setLocation(token ? "/configuracoes?tab=plano-negocios" : "/login", { replace: true });
  }, [token, isLoading, setLocation]);

  return <Spinner />;
}

function VarejoRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading, tenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const rawIsSA = !isLoading && !!token && user?.platformRole === "super_admin";
  const effectiveVertical = rawIsSA && tenantOverride ? tenantOverride.vertical : user?.tenantVertical;

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && !rawIsSA && effectiveVertical !== "Varejo de Roupas & Acessórios") {
      setLocation("/");
    } else if (!isLoading && rawIsSA && effectiveVertical !== "Varejo de Roupas & Acessórios") {
      setLocation("/admin/verticais");
    }
  }, [token, user, isLoading, effectiveVertical, rawIsSA, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (effectiveVertical !== "Varejo de Roupas & Acessórios") return null;

  return (
    <SidebarLayout>
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>
  );
}

function SupermercadoRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading, tenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const rawIsSA = !isLoading && !!token && user?.platformRole === "super_admin";
  const effectiveVertical = rawIsSA && tenantOverride ? tenantOverride.vertical : user?.tenantVertical;

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && !rawIsSA && effectiveVertical !== "Supermercado") {
      setLocation("/");
    } else if (!isLoading && rawIsSA && effectiveVertical !== "Supermercado") {
      setLocation("/admin/verticais");
    }
  }, [token, user, isLoading, effectiveVertical, rawIsSA, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (effectiveVertical !== "Supermercado") return null;

  return (
    <SidebarLayout>
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>
  );
}

function ConstrucaoRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading, tenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const rawIsSA = !isLoading && !!token && user?.platformRole === "super_admin";
  const effectiveVertical = rawIsSA && tenantOverride ? tenantOverride.vertical : user?.tenantVertical;
  const normalizedVertical = (effectiveVertical ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const constructionAliases = new Set([
    "construtora",
    "construtora residencial",
    "construcao civil",
    "construcao & reforma",
    "gestao de obras",
    "obras",
  ]);
  const isConstrucaoVertical = constructionAliases.has(normalizedVertical);

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && !rawIsSA && !isConstrucaoVertical) {
      setLocation("/");
    } else if (!isLoading && rawIsSA && !isConstrucaoVertical) {
      setLocation("/admin/verticais");
    }
  }, [token, user, isLoading, isConstrucaoVertical, rawIsSA, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (!isConstrucaoVertical) return null;

  return (
    <SidebarLayout>
      <RouteContentBoundary>
        <Component {...rest} />
      </RouteContentBoundary>
    </SidebarLayout>
  );
}

function PublicRoute({ component: Component }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && token && user) {
      setLocation(user.platformRole === "partner" ? "/partner" : user.platformRole === "tenant_admin" ? "/configuracoes?tab=plano-negocios" : "/dashboard");
    }
  }, [token, user, isLoading, setLocation]);

  if (isLoading) return <Spinner />;

  return <Component />;
}

function RegisterRoute() {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && token && user?.platformRole !== "super_admin") {
      setLocation("/");
    }
  }, [token, isLoading, user, setLocation]);

  if (isLoading) return <Spinner />;
  return <Register />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<Spinner />}>
      <Switch>
        <Route path="/login"><PublicRoute component={Login} /></Route>
        <Route path="/register"><RegisterRoute /></Route>
        <Route path="/auth/success">{() => <GoogleAuthSuccess />}</Route>
        <Route path="/demo/contact-sales">{() => <ContactSales />}</Route>
        <Route path="/esqueci-senha"><PublicRoute component={ForgotPassword} /></Route>
        <Route path="/redefinir-senha"><ResetPassword /></Route>
        <Route path="/portal/obra/:token"><PublicRoute component={PortalObra} /></Route>
        <Route path="/obra/campo/:obraId">{() => <ObraCampo />}</Route>
        <Route path="/p/:token">{() => <PublicProposta />}</Route>
        <Route path="/diagnostico-negocio/:token">{() => <PublicDiagnosticoNegocio />}</Route>
        <Route path="/rastreio/:id">{() => <RastreioFrete />}</Route>
        <Route path="/acompanhar-entrega/:token">{() => <AcompanharEntrega />}</Route>
        <Route path="/acompanhar/servico/:token">{() => <ServicoAcompanhamentoPublico />}</Route>
        <Route path="/entrega/agente/:agentKey">{() => <PublicDeliveryRuntime />}</Route>
        <Route path="/entrega/simulador/sdr">{() => <PublicDeliveryRuntime />}</Route>
        <Route path="/entrega/arqdor/pre-projeto">{() => <PublicDeliveryRuntime />}</Route>
        <Route path="/assistencia/:token">{() => <PublicSupportAssistance />}</Route>
        <Route path="/vendi/handoff">{() => <VendiHandoff />}</Route>
        <Route path="/onboarding"><OnboardingRoute /></Route>
        <Route path="/onboarding/integracoes"><RedirectPage to="/configuracoes" /></Route>
        <Route path="/"><PublicRoute component={Login} /></Route>
        <Route path="/app"><RedirectPage to="/" /></Route>
        <Route path="/app/"><RedirectPage to="/" /></Route>
        <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
        <Route path="/trabalho/:id"><ProtectedRoute component={LeadWorkspace} /></Route>
        <Route path="/trabalho"><ProtectedRoute component={WorkCenterHome} /></Route>
        <Route path="/leads/import-config"><ProtectedRoute component={ImportConfig} /></Route>
        <Route path="/contacts-nonleads"><ProtectedRoute component={NonLeadContacts} /></Route>
        <Route path="/leads"><ProtectedRoute component={Leads} /></Route>
        <Route path="/empresas"><ProtectedRoute component={Companies} /></Route>
        <Route path="/leads/:id"><ProtectedRoute component={LeadWorkspace} /></Route>
        <Route path="/empresas/:id"><ProtectedRoute component={CompanyCenter} /></Route>
        <Route path="/app/prospector"><ProtectedRoute component={Prospector} /></Route>
        <Route path="/prospector"><ProtectedRoute component={Prospector} /></Route>
        <Route path="/prospector/flows"><ProtectedRoute component={FlowBuilder} /></Route>
        <Route path="/prospector/flows/:id/executions"><ProtectedRoute component={FlowExecutions} /></Route>
        <Route path="/deals"><ProtectedRoute component={Deals} /></Route>
        <Route path="/checklists/medidas/:dealId"><ProtectedRoute component={OperationalMeasurementChecklist} /></Route>
        <Route path="/negocios"><ProtectedRoute component={Deals} /></Route>
        <Route path="/pipeline-operacional/:tab"><ProtectedRoute component={PipelineOperacional} /></Route>
        <Route path="/pipeline-operacional"><ProtectedRoute component={PipelineOperacional} /></Route>
        <Route path="/pipeline-relacionamento/:tab"><ProtectedRoute component={PipelineRelacionamento} /></Route>
        <Route path="/pipeline-relacionamento"><ProtectedRoute component={PipelineRelacionamento} /></Route>
        <Route path="/comissoes"><ProtectedRoute component={ComissoesVendedor} /></Route>
        <Route path="/conversations"><ProtectedRoute component={Conversations} /></Route>
        <Route path="/conversas"><ProtectedRoute component={Conversations} /></Route>
        <Route path="/agenda"><ProtectedRoute component={Agenda} /></Route>
        <Route path="/entregas"><ProtectedRoute component={MinhasEntregas} /></Route>
        <Route path="/praca-executivo"><ProtectedRoute component={DashboardExecutivoPraca} /></Route>
        <Route path="/praca-conciliacao"><ProtectedRoute component={ConciliacaoFinanceiraPraca} /></Route>
        <Route path="/logistica-praca"><ProtectedRoute component={MonitorLogisticaPraca} /></Route>
        <Route path="/entregas-praca"><ProtectedRoute component={AppEntregadorPraca} /></Route>
        <Route path="/configuracoes"><ConfiguracoesRoute /></Route>
        <Route path="/usuarios"><ProtectedRoute component={Usuarios} /></Route>
        <Route path="/propostas">{() => <ProtectedRoute component={Propostas} />}</Route>
        <Route path="/catalogo">{() => <ProtectedRoute component={CatalogoProdutos} />}</Route>
        <Route path="/marketing/facebook-marketplace">{() => <ProtectedRoute component={FacebookMarketplaceManager} />}</Route>
        <Route path="/catalogo/categorias">{() => <ProtectedRoute component={CategoriasProduto} />}</Route>
        <Route path="/base-conhecimento">{() => <ProtectedRoute component={KnowledgeBase} />}</Route>
        <Route path="/solicitacao-compra">{() => <ProtectedRoute component={SolicitacaoCompra} />}</Route>
        <Route path="/pacotes">{() => <ProtectedRoute component={Pacotes} />}</Route>
        <Route path="/content-autopilot">{() => <ProtectedRoute component={ContentAutopilot} />}</Route>
        <Route path="/ads">{() => <ProtectedRoute component={Ads} />}</Route>
        <Route path="/marketing/plano-de-midia">{() => <ProtectedRoute component={PlanoMidia} />}</Route>
        <Route path="/propostas/:id/print">{() => <ProtectedRoute component={PropostaPrint} />}</Route>
        <Route path="/propostas/:id">{() => <ProtectedRoute component={PropostaPrint} />}</Route>
        <Route path="/campanhas-nova"><LegacyCampaignHubRedirect /></Route>
        <Route path="/campanhas"><RedirectPage to="/content?tab=campanhas&view=organicas" /></Route>
        <Route path="/estoque">{() => <ProtectedRoute component={Estoque} />}</Route>
        <Route path="/erp/captura">{() => <ProtectedRoute component={ErpCapture} />}</Route>
        <Route path="/erp">{() => <ProtectedRoute component={GestaoErp} />}</Route>
        <Route path="/faturamento"><RedirectPage to="/configuracoes" /></Route>
        <Route path="/admin/tenants/:id">{() => <SuperAdminRoute component={AdminTenantDetail} />}</Route>
        <Route path="/admin/tenants">{() => <SuperAdminRoute component={AdminTenants} />}</Route>
        <Route path="/admin/ai-usage">{() => <SuperAdminRoute component={AdminAIUsage} />}</Route>
        <Route path="/admin/partners">{() => <SuperAdminRoute component={AdminPartners} />}</Route>
        <Route path="/admin/verticais">{() => <SuperAdminRoute component={AdminVerticals} />}</Route>
        <Route path="/admin/app-builder">{() => <SuperAdminRoute component={AdminAppBuilder} />}</Route>
        <Route path="/admin/produtos-internos">{() => <SuperAdminRoute component={AdminProdutosInternos} />}</Route>
        <Route path="/admin/agent-defaults">{() => <SuperAdminRoute component={AgentDefaults} />}</Route>
        <Route path="/admin/suporte">{() => <SuperAdminRoute component={SupportAdmin} />}</Route>
        <Route path="/admin/relatos-tecnicos">{() => <SuperAdminRoute component={RelatosTecnicos} />}</Route>
        <Route path="/admin/changelog">{() => <SuperAdminRoute component={AdminChangelog} />}</Route>
        <Route path="/admin/melhorias">{() => <SuperAdminRoute component={AdminImprovements} />}</Route>
        <Route path="/admin/ml-status">{() => <SuperAdminRoute component={AdminMlStatus} />}</Route>
        <Route path="/admin/base-interna">{() => <SuperAdminRoute component={AdminKnowledgeBaseInternal} />}</Route>
        <Route path="/admin/financeiro">{() => <SuperAdminRoute component={AdminFinanceiro} />}</Route>
        <Route path="/organizacao">{() => <ProtectedRoute component={OrganizacaoPainel} />}</Route>
        <Route path="/trocar-senha"><ForcePasswordChange /></Route>
        <Route path="/partner/dashboard">{() => <PartnerRoute component={PartnerDash} />}</Route>
        <Route path="/partner/leads/:id">{() => <PartnerRoute component={PartnerLeadDetail} />}</Route>
        <Route path="/partner/leads">{() => <PartnerRoute component={PartnerLeads} />}</Route>
        <Route path="/partner/commissions">{() => <PartnerRoute component={PartnerCommissions} />}</Route>
        <Route path="/partner">{() => <PartnerRoute component={PartnerDashboard} />}</Route>
        <Route path="/marketplace">{() => <ProtectedRoute component={Marketplace} />}</Route>
        <Route path="/content">{() => <ProtectedRoute component={Content} />}</Route>
        <Route path="/midias">{() => <ProtectedRoute component={MediaCenter} />}</Route>
        <Route path="/midias/informacoes">{() => <ProtectedRoute component={MediaCenter} />}</Route>
        <Route path="/growth-lab">{() => <ProtectedRoute component={GrowthLabConnected} />}</Route>
        <Route path="/marketing/instagram">{() => <ProtectedRoute component={MarketingInstagram} />}</Route>
        <Route path="/content-studio"><RedirectPage to="/content" /></Route>
        <Route path="/content-studio/video">{() => <ProtectedRoute component={VideoHome} />}</Route>
        <Route path="/content-studio/video/projeto">{() => <ProtectedRoute component={VideoProjectDirectPage} />}</Route>
        <Route path="/content-studio/video/avatar">{() => <ProtectedRoute component={VideoAvatarPage} />}</Route>
        <Route path="/content-studio/video/avatar/captura">{() => <FullscreenProtectedRoute component={VideoAvatarCaptureRoute} />}</Route>
        <Route path="/content-studio/video/produto">{() => <ProtectedRoute component={VideoProdutoPage} />}</Route>
        <Route path="/content-studio/video/edicao">{() => <ProtectedRoute component={VideoEdicaoPage} />}</Route>
        <Route path="/content-studio/video/legenda">{() => <ProtectedRoute component={VideoLegendaPage} />}</Route>
        <Route path="/content-studio/video/clipes">{() => <ProtectedRoute component={VideoClipesPage} />}</Route>
        <Route path="/content-studio/video/lote">{() => <ProtectedRoute component={VideoLotePage} />}</Route>
        <Route path="/faq">{() => <ProtectedRoute component={FAQ} />}</Route>
        <Route path="/guia-implantacao">{() => <ProtectedRoute component={GuiaImplantacao} />}</Route>
        <Route path="/agents/config">{() => <ProtectedRoute component={AgentConfig} />}</Route>
        <Route path="/agentes">{() => <ProtectedRoute component={AgentConfig} />}</Route>
        <Route path="/vendi/operacoes">{() => <ProtectedRoute component={VendiOperations} />}</Route>
        <Route path="/diagnostico-planejamento">{() => <RedirectPage to="/configuracoes?tab=plano-negocios" />}</Route>
        <Route path="/analytics">{() => <ProtectedRoute component={Analytics} />}</Route>
        <Route path="/metricas-ia">{() => <ProtectedRoute component={Analytics} />}</Route>
        <Route path="/relatorios">{() => <ProtectedRoute component={RelatoriosVisaoGeral} />}</Route>
        <Route path="/relatorios/ganhos-mes">{() => <ProtectedRoute component={RelatorioGanhosMes} />}</Route>
        <Route path="/relatorios/tipo-cliente">{() => <ProtectedRoute component={RelatorioTipoCliente} />}</Route>
        <Route path="/relatorios/dores">{() => <ProtectedRoute component={RelatorioDores} />}</Route>
        <Route path="/tour/arqdor/:token">{() => <ArchPublicConceptTour />}</Route>
        <Route path="/projeto/:slug">{() => <ArchPublicConceptSignup />}</Route>
        <Route path="/arch">{() => <ProtectedRoute component={ArchDashboard} />}</Route>
        <Route path="/arch/projetos/novo">{() => <ProtectedRoute component={ArchProjetos} />}</Route>
        <Route path="/arch/projetos/:id">{() => <ProtectedRoute component={ArchProjetoDetalhe} />}</Route>
        <Route path="/arch/projetos">{() => <ProtectedRoute component={ArchProjetos} />}</Route>
        <Route path="/arch/catalogo">{() => <ProtectedRoute component={ArchCatalogo} />}</Route>
        <Route path="/arch/marketplace">{() => <ProtectedRoute component={ArchMarketplace} />}</Route>
        <Route path="/arch/render">{() => <FullscreenProtectedRoute component={ArchRender} />}</Route>
        <Route path="/arch/studio">{() => <FullscreenProtectedRoute component={ArchWorkspace} />}</Route>
        <Route path="/arch/concept">{() => <FullscreenProtectedRoute component={ArchConcept} />}</Route>
        <Route path="/arch/portal/:token">{() => <ArchPortalCliente />}</Route>
        <Route path="/obras">{() => <ConstrucaoRoute component={Obras} />}</Route>
        <Route path="/obras/:obraId">{() => <ConstrucaoRoute component={ObraDetalhe} />}</Route>
        <Route path="/insumos">{() => <ConstrucaoRoute component={Insumos} />}</Route>
        <Route path="/composicoes">{() => <ConstrucaoRoute component={Composicoes} />}</Route>
        <Route path="/varejo/produtos">{() => <VarejoRoute component={VarejoProdutos} />}</Route>
        <Route path="/varejo/produtos/:produtoId">{() => <VarejoRoute component={VarejoProdutoDetalhe} />}</Route>
        <Route path="/varejo/colecoes">{() => <VarejoRoute component={VarejoColecoes} />}</Route>
        <Route path="/varejo/fornecedores">{() => <VarejoRoute component={VarejoFornecedores} />}</Route>
        <Route path="/varejo/compras">{() => <VarejoRoute component={VarejoCompras} />}</Route>
        <Route path="/varejo/fidelidade">{() => <VarejoRoute component={VarejoFidelidade} />}</Route>
        <Route path="/varejo/combos">{() => <VarejoRoute component={VarejoCombos} />}</Route>
        <Route path="/scout">{() => <ProtectedRoute component={RevenueDashboard} />}</Route>
        <Route path="/scout/regras">{() => <ProtectedRoute component={ScoutRegras} />}</Route>
        <Route path="/scout/oportunidades">{() => <ProtectedRoute component={ScoutOportunidades} />}</Route>
        <Route path="/scout/pipeline">{() => <ProtectedRoute component={ScoutPipeline} />}</Route>
        <Route path="/scout/seguros/renovacoes">{() => <ProtectedRoute component={InsuranceRenewals} />}</Route>
        <Route path="/clinic">{() => <ProtectedRoute component={ClinicDashboard} />}</Route>
        <Route path="/clinic/agenda">{() => <ProtectedRoute component={AgendaClinica} />}</Route>
        <Route path="/clinic/prontuario/:consultaId">{() => <ProtectedRoute component={ClinicProntuario} />}</Route>
        <Route path="/clinic/medicos">{() => <ProtectedRoute component={ClinicMedicos} />}</Route>
        <Route path="/beauty">{() => <ProtectedRoute component={BeautyDashboard} />}</Route>
        <Route path="/beauty/agenda">{() => <ProtectedRoute component={BeautyAgenda} />}</Route>
        <Route path="/beauty/servicos">{() => <ProtectedRoute component={BeautyServicos} />}</Route>
        <Route path="/beauty/profissionais">{() => <ProtectedRoute component={BeautyProfissionais} />}</Route>
        <Route path="/supermercado">{() => <SupermercadoRoute component={SupermercadoDashboard} />}</Route>
        <Route path="/servicos">{() => <ProtectedRoute component={ServicosOrdens} />}</Route>
        <Route path="/servicos/cadastros">{() => <ProtectedRoute component={ServicosCadastros} />}</Route>
        <Route path="/food/pedidos">{() => <ProtectedRoute component={FoodPedidos} />}</Route>
        <Route path="/food/cardapio">{() => <ProtectedRoute component={FoodCardapio} />}</Route>
        <Route path="/farmacia/produtos">{() => <ProtectedRoute component={FarmaciaProdutos} />}</Route>
        <Route path="/farmacia/bulas">{() => <ProtectedRoute component={FarmaciaBulas} />}</Route>
        <Route path="/farmacia">{() => <ProtectedRoute component={FarmaciaOperacao} />}</Route>
        <Route path="/farmacia/pedidos">{() => <ProtectedRoute component={FarmaciaPedidos} />}</Route>
        <Route path="/farmacia/receitas">{() => <ProtectedRoute component={FarmaciaReceitas} />}</Route>
        <Route path="/imoveis/propriedades">{() => <ProtectedRoute component={ImoveisPropriedades} />}</Route>
        <Route path="/imoveis/visitas">{() => <ProtectedRoute component={ImoveisVisitas} />}</Route>
        <Route path="/fretes/cargas">{() => <ProtectedRoute component={FretesCargas} />}</Route>
        <Route path="/stories">{() => <ProtectedRoute component={StoriesLojista} />}</Route>
        <Route path="/variedades-dia">{() => <ProtectedRoute component={VariedadesLojista} />}</Route>
        <Route path="/fretes/veiculos">{() => <ProtectedRoute component={FretesVeiculos} />}</Route>
        <Route path="/fretes/motorista">{() => <ProtectedRoute component={FretesMotorista} />}</Route>
        <Route path="/veiculos/estoque">{() => <ProtectedRoute component={VeiculosEstoque} />}</Route>
        <Route path="/veiculos/test-drives">{() => <ProtectedRoute component={VeiculosTestDrives} />}</Route>
        <Route path="/praca-perguntas">{() => <ProtectedRoute component={PracaPerguntas} />}</Route>
        <Route path="/praca-variedades">{() => <ProtectedRoute component={PracaVariedades} />}</Route>
        <Route path="/supermercado/produtos">{() => <SupermercadoRoute component={SupermercadoProdutos} />}</Route>
        <Route path="/supermercado/pedidos">{() => <SupermercadoRoute component={SupermercadoPedidos} />}</Route>
        <Route path="/supermercado/campanhas">{() => <SupermercadoRoute component={SupermercadoCampanhas} />}</Route>
        <Route path="/supermercado/config">{() => <SupermercadoRoute component={SupermercadoConfig} />}</Route>
        <Route path="/vkg">{() => <ProtectedRoute component={VKGDemo} />}</Route>
        <Route path="/brain">{() => <ProtectedRoute component={VendorBrainDash} />}</Route>
        <Route path="/partner-hub">{() => <ProtectedRoute component={PartnerHub} />}</Route>
        <Route path="/partner-hub/:id">{() => <ProtectedRoute component={PartnerDetail} />}</Route>
        <Route path="/ecosystem-hub">{() => <ProtectedRoute component={EcosystemHub} />}</Route>
        <Route path="/ecosystem-hub/new">{() => <ProtectedRoute component={EcosystemCompanyCreate} />}</Route>
        <Route path="/ecosystem-hub/:id">{() => <ProtectedRoute component={CompanyDetail} />}</Route>
        <Route path="/vendor-certified-network">{() => <ProtectedRoute component={VCNHub} />}</Route>
        <Route path="/vendor-certified-network/:id">{() => <ProtectedRoute component={VCNCompanyDetail} />}</Route>
        <Route path="/poe">{() => <ProtectedRoute component={POEHub} />}</Route>
        <Route path="/invite/:token"><AcceptInvite /></Route>
        <Route path="/site/:tenantSlug"><SiteLandingPage /></Route>
        <Route path="/questionario/:tenantSlug"><Questionario /></Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
