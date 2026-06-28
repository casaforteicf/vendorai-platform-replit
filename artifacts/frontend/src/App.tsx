import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DemoBanner } from "@/components/DemoBanner";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import { lazy, Suspense, useEffect } from "react";
import {
  useGetTenant,
  getGetTenantQueryKey,
  useListInvoices,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";

// ── Lazy page imports (code splitting — each page loads only when navigated to) ──
const Login              = lazy(() => import("@/pages/Login"));
const Register           = lazy(() => import("@/pages/Register"));
const ForgotPassword     = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword      = lazy(() => import("@/pages/ResetPassword"));
const PortalObra         = lazy(() => import("@/pages/PortalObra"));
const ForcePasswordChange= lazy(() => import("@/pages/ForcePasswordChange"));
const AcceptInvite       = lazy(() => import("@/pages/AcceptInvite"));
const NotFound           = lazy(() => import("@/pages/not-found"));
const Suspended          = lazy(() => import("@/pages/Suspended"));

const Dashboard          = lazy(() => import("@/pages/Dashboard"));
const Leads              = lazy(() => import("@/pages/Leads"));
const LeadDetail         = lazy(() => import("@/pages/LeadDetail"));
const Prospector         = lazy(() => import("@/pages/Prospector"));
const FlowBuilder        = lazy(() => import("@/pages/prospector/FlowBuilder"));
const FlowExecutions     = lazy(() => import("@/pages/prospector/FlowExecutions"));
const Duplicatas         = lazy(() => import("@/pages/Duplicatas"));
const Deals              = lazy(() => import("@/pages/Deals"));
const Conversations      = lazy(() => import("@/pages/Conversations"));
const Agenda             = lazy(() => import("@/pages/Agenda"));
const Configuracoes      = lazy(() => import("@/pages/Configuracoes"));
const Usuarios           = lazy(() => import("@/pages/Usuarios"));
const Campanhas          = lazy(() => import("@/pages/Campanhas"));
const Propostas          = lazy(() => import("@/pages/Propostas"));
const PropostaPrint      = lazy(() => import("@/pages/PropostaPrint"));
const AdminAIUsage       = lazy(() => import("@/pages/AdminAIUsage"));
const AdminPartners      = lazy(() => import("@/pages/AdminPartners"));
const AdminTenants       = lazy(() => import("@/pages/AdminTenants"));
const AdminVerticals     = lazy(() => import("@/pages/AdminVerticals"));
const PartnerDashboard   = lazy(() => import("@/pages/PartnerDashboard"));
const PartnerDash        = lazy(() => import("@/pages/partner/PartnerDashboard"));
const PartnerLeads       = lazy(() => import("@/pages/partner/PartnerLeads"));
const PartnerLeadDetail  = lazy(() => import("@/pages/partner/PartnerLeadDetail"));
const PartnerCommissions = lazy(() => import("@/pages/partner/PartnerCommissions"));
const SiteLandingPage    = lazy(() => import("@/pages/SiteLandingPage"));
const Marketplace        = lazy(() => import("@/pages/Marketplace"));
const Estoque            = lazy(() => import("@/pages/Estoque"));
const Onboarding         = lazy(() => import("@/pages/Onboarding"));
const Content            = lazy(() => import("@/pages/Content"));
const ContentStudio      = lazy(() => import("@/pages/ContentStudio"));
const GuiaImplantacao    = lazy(() => import("@/pages/GuiaImplantacao"));
const Questionario       = lazy(() => import("@/pages/Questionario"));
const Analytics          = lazy(() => import("@/pages/Analytics"));
const RelatorioGanhosMes = lazy(() => import("@/pages/RelatorioGanhosMes"));
const RelatorioTipoCliente = lazy(() => import("@/pages/RelatorioTipoCliente"));
const RelatorioDores     = lazy(() => import("@/pages/RelatorioDores"));

// Construção
const Obras              = lazy(() => import("@/pages/Obras"));
const ObraDetalhe        = lazy(() => import("@/pages/ObraDetalhe"));
const Insumos            = lazy(() => import("@/pages/Insumos"));
const Composicoes        = lazy(() => import("@/pages/Composicoes"));

// Varejo
const VarejoProdutos        = lazy(() => import("@/pages/VarejoProdutos"));
const VarejoProdutoDetalhe  = lazy(() => import("@/pages/VarejoProdutoDetalhe"));
const VarejoColecoes        = lazy(() => import("@/pages/VarejoColecoes"));
const VarejoFornecedores    = lazy(() => import("@/pages/VarejoFornecedores"));
const VarejoCompras         = lazy(() => import("@/pages/VarejoCompras"));
const VarejoFidelidade      = lazy(() => import("@/pages/VarejoFidelidade"));
const VarejoCombos          = lazy(() => import("@/pages/VarejoCombos"));

// Supermercado
const SupermercadoDashboard = lazy(() => import("@/pages/supermercado/SupermercadoDashboard"));
const SupermercadoProdutos  = lazy(() => import("@/pages/supermercado/SupermercadoProdutos"));
const SupermercadoPedidos   = lazy(() => import("@/pages/supermercado/SupermercadoPedidos"));
const SupermercadoCampanhas = lazy(() => import("@/pages/supermercado/SupermercadoCampanhas"));
const SupermercadoConfig    = lazy(() => import("@/pages/supermercado/SupermercadoConfig"));

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

function Spinner() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function RedirectPage({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);
  return null;
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const isTenantAdmin = user?.platformRole === "tenant_admin";

  const { data: tenant, isLoading: tenantLoading } = useGetTenant(
    user?.tenantId ?? "",
    {
      query: {
        enabled: !isLoading && !!token && isTenantAdmin && !!user?.tenantId,
        queryKey: getGetTenantQueryKey(user?.tenantId ?? ""),
      },
    }
  );

  const { data: invoices, isLoading: invoicesLoading } = useListInvoices(
    user?.tenantId ?? "",
    undefined,
    {
      query: {
        enabled: !isLoading && !!token && isTenantAdmin && !!user?.tenantId,
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

  useEffect(() => {
    if (!isTenantAdmin || tenantLoading || !tenant) return;
    if (tenant.status !== "suspended" && !hasOverdueInvoice && !tenant.setupCompletedAt) {
      setLocation("/onboarding");
    }
  }, [tenant, tenantLoading, isTenantAdmin, hasOverdueInvoice, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (isTenantAdmin && (tenantLoading || invoicesLoading)) return <Spinner />;
  if (isTenantAdmin && (tenant?.status === "suspended" || hasOverdueInvoice)) return <Suspended />;

  return (
    <SidebarLayout>
      <DemoBanner />
      <Component {...rest} />
    </SidebarLayout>
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
      <Component {...rest} />
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

  return <Component />;
}

function OnboardingRoute() {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const isTenantAdmin = user?.platformRole === "tenant_admin";

  const { data: tenant, isLoading: tenantLoading } = useGetTenant(
    user?.tenantId ?? "",
    {
      query: {
        enabled: !isLoading && !!token && isTenantAdmin && !!user?.tenantId,
        queryKey: getGetTenantQueryKey(user?.tenantId ?? ""),
      },
    }
  );

  useEffect(() => {
    if (!isLoading && !token) setLocation("/login");
  }, [token, isLoading, setLocation]);

  useEffect(() => {
    if (!isTenantAdmin || tenantLoading || !tenant) return;
    if (tenant.setupCompletedAt) {
      setLocation("/");
    }
  }, [tenant, tenantLoading, isTenantAdmin, setLocation]);

  if (isLoading || !token) return <Spinner />;
  if (isTenantAdmin && tenantLoading) return <Spinner />;

  return <Onboarding />;
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
      <Component {...rest} />
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
      <Component {...rest} />
    </SidebarLayout>
  );
}

function ConstrucaoRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading, tenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const rawIsSA = !isLoading && !!token && user?.platformRole === "super_admin";
  const effectiveVertical = rawIsSA && tenantOverride ? tenantOverride.vertical : user?.tenantVertical;

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && !rawIsSA && effectiveVertical !== "Construção & Reforma") {
      setLocation("/");
    } else if (!isLoading && rawIsSA && effectiveVertical !== "Construção & Reforma") {
      setLocation("/admin/verticais");
    }
  }, [token, user, isLoading, effectiveVertical, rawIsSA, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (effectiveVertical !== "Construção & Reforma") return null;

  return (
    <SidebarLayout>
      <Component {...rest} />
    </SidebarLayout>
  );
}

function PublicRoute({ component: Component }: any) {
  const { token, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && token) {
      setLocation("/");
    }
  }, [token, isLoading, setLocation]);

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
        <Route path="/login">
          <PublicRoute component={Login} />
        </Route>
        <Route path="/register">
          <RegisterRoute />
        </Route>
        <Route path="/esqueci-senha">
          <PublicRoute component={ForgotPassword} />
        </Route>
        <Route path="/redefinir-senha">
          <PublicRoute component={ResetPassword} />
        </Route>
        <Route path="/portal/obra/:token">
          <PublicRoute component={PortalObra} />
        </Route>
        <Route path="/onboarding">
          <OnboardingRoute />
        </Route>
        <Route path="/">
          <ProtectedRoute component={Dashboard} />
        </Route>
        <Route path="/leads">
          <ProtectedRoute component={Leads} />
        </Route>
        <Route path="/leads/:id">
          <ProtectedRoute component={LeadDetail} />
        </Route>
        <Route path="/app/prospector">
          <ProtectedRoute component={Prospector} />
        </Route>
        <Route path="/prospector/flows">
          <ProtectedRoute component={FlowBuilder} />
        </Route>
        <Route path="/prospector/flows/:id/executions">
          <ProtectedRoute component={FlowExecutions} />
        </Route>
        <Route path="/duplicatas">
          <ProtectedRoute component={Duplicatas} />
        </Route>
        <Route path="/deals">
          <ProtectedRoute component={Deals} />
        </Route>
        <Route path="/negocios">
          <ProtectedRoute component={Deals} />
        </Route>
        <Route path="/conversations">
          <ProtectedRoute component={Conversations} />
        </Route>
        <Route path="/agenda">
          <ProtectedRoute component={Agenda} />
        </Route>
        <Route path="/configuracoes">
          <ProtectedRoute component={Configuracoes} />
        </Route>
        <Route path="/usuarios">
          <ProtectedRoute component={Usuarios} />
        </Route>
        <Route path="/propostas">
          {() => <ProtectedRoute component={Propostas} />}
        </Route>
        <Route path="/propostas/:id/print">
          {() => <ProtectedRoute component={PropostaPrint} />}
        </Route>
        <Route path="/propostas/:id">
          {() => <ProtectedRoute component={PropostaPrint} />}
        </Route>
        <Route path="/campanhas">
          <ProtectedRoute component={Campanhas} />
        </Route>
        <Route path="/estoque">
          {() => <ProtectedRoute component={Estoque} />}
        </Route>
        <Route path="/faturamento">
          <RedirectPage to="/configuracoes" />
        </Route>
        <Route path="/admin/tenants">
          {() => <SuperAdminRoute component={AdminTenants} />}
        </Route>
        <Route path="/admin/ai-usage">
          {() => <SuperAdminRoute component={AdminAIUsage} />}
        </Route>
        <Route path="/admin/partners">
          {() => <SuperAdminRoute component={AdminPartners} />}
        </Route>
        <Route path="/admin/verticais">
          {() => <SuperAdminRoute component={AdminVerticals} />}
        </Route>
        <Route path="/trocar-senha">
          <ForcePasswordChange />
        </Route>
        <Route path="/partner/dashboard">
          {() => <PartnerRoute component={PartnerDash} />}
        </Route>
        <Route path="/partner/leads/:id">
          {() => <PartnerRoute component={PartnerLeadDetail} />}
        </Route>
        <Route path="/partner/leads">
          {() => <PartnerRoute component={PartnerLeads} />}
        </Route>
        <Route path="/partner/commissions">
          {() => <PartnerRoute component={PartnerCommissions} />}
        </Route>
        <Route path="/partner">
          {() => <PartnerRoute component={PartnerDashboard} />}
        </Route>
        <Route path="/marketplace">
          {() => <ProtectedRoute component={Marketplace} />}
        </Route>
        <Route path="/content">
          {() => <ProtectedRoute component={Content} />}
        </Route>
        <Route path="/content-studio">
          {() => <ProtectedRoute component={ContentStudio} />}
        </Route>
        <Route path="/guia-implantacao">
          {() => <ProtectedRoute component={GuiaImplantacao} />}
        </Route>
        <Route path="/analytics">
          {() => <ProtectedRoute component={Analytics} />}
        </Route>
        <Route path="/relatorios/ganhos-mes">
          {() => <ProtectedRoute component={RelatorioGanhosMes} />}
        </Route>
        <Route path="/relatorios/tipo-cliente">
          {() => <ProtectedRoute component={RelatorioTipoCliente} />}
        </Route>
        <Route path="/relatorios/dores">
          {() => <ProtectedRoute component={RelatorioDores} />}
        </Route>
        <Route path="/obras">
          {() => <ConstrucaoRoute component={Obras} />}
        </Route>
        <Route path="/obras/:obraId">
          {() => <ConstrucaoRoute component={ObraDetalhe} />}
        </Route>
        <Route path="/insumos">
          {() => <ConstrucaoRoute component={Insumos} />}
        </Route>
        <Route path="/composicoes">
          {() => <ConstrucaoRoute component={Composicoes} />}
        </Route>
        <Route path="/varejo/produtos">
          {() => <VarejoRoute component={VarejoProdutos} />}
        </Route>
        <Route path="/varejo/produtos/:produtoId">
          {() => <VarejoRoute component={VarejoProdutoDetalhe} />}
        </Route>
        <Route path="/varejo/colecoes">
          {() => <VarejoRoute component={VarejoColecoes} />}
        </Route>
        <Route path="/varejo/fornecedores">
          {() => <VarejoRoute component={VarejoFornecedores} />}
        </Route>
        <Route path="/varejo/compras">
          {() => <VarejoRoute component={VarejoCompras} />}
        </Route>
        <Route path="/varejo/fidelidade">
          {() => <VarejoRoute component={VarejoFidelidade} />}
        </Route>
        <Route path="/varejo/combos">
          {() => <VarejoRoute component={VarejoCombos} />}
        </Route>
        <Route path="/supermercado">
          {() => <SupermercadoRoute component={SupermercadoDashboard} />}
        </Route>
        <Route path="/supermercado/produtos">
          {() => <SupermercadoRoute component={SupermercadoProdutos} />}
        </Route>
        <Route path="/supermercado/pedidos">
          {() => <SupermercadoRoute component={SupermercadoPedidos} />}
        </Route>
        <Route path="/supermercado/campanhas">
          {() => <SupermercadoRoute component={SupermercadoCampanhas} />}
        </Route>
        <Route path="/supermercado/config">
          {() => <SupermercadoRoute component={SupermercadoConfig} />}
        </Route>
        <Route path="/invite/:token">
          <AcceptInvite />
        </Route>
        <Route path="/site/:tenantSlug">
          <SiteLandingPage />
        </Route>
        <Route path="/questionario/:tenantSlug">
          <Questionario />
        </Route>
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
