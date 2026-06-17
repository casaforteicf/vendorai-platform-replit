import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Deals from "@/pages/Deals";
import Conversations from "@/pages/Conversations";
import Agenda from "@/pages/Agenda";
import Configuracoes from "@/pages/Configuracoes";
import Campanhas from "@/pages/Campanhas";
import Propostas from "@/pages/Propostas";
import Faturamento from "@/pages/Faturamento";
import AdminAIUsage from "@/pages/AdminAIUsage";
import AdminPartners from "@/pages/AdminPartners";
import PartnerDashboard from "@/pages/PartnerDashboard";
import AcceptInvite from "@/pages/AcceptInvite";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import SiteLandingPage from "@/pages/SiteLandingPage";
import Marketplace from "@/pages/Marketplace";
import Estoque from "@/pages/Estoque";
import Onboarding from "@/pages/Onboarding";
import Content from "@/pages/Content";
import GuiaImplantacao from "@/pages/GuiaImplantacao";
import Suspended from "@/pages/Suspended";
import Questionario from "@/pages/Questionario";
import Obras from "@/pages/Obras";
import ObraDetalhe from "@/pages/ObraDetalhe";
import Insumos from "@/pages/Insumos";
import Composicoes from "@/pages/Composicoes";
import VarejoProdutos from "@/pages/VarejoProdutos";
import VarejoProdutoDetalhe from "@/pages/VarejoProdutoDetalhe";
import VarejoColecoes from "@/pages/VarejoColecoes";
import VarejoFornecedores from "@/pages/VarejoFornecedores";
import VarejoCompras from "@/pages/VarejoCompras";
import VarejoFidelidade from "@/pages/VarejoFidelidade";
import VarejoCombos from "@/pages/VarejoCombos";
import SupermercadoDashboard from "@/pages/supermercado/SupermercadoDashboard";
import SupermercadoProdutos from "@/pages/supermercado/SupermercadoProdutos";
import SupermercadoPedidos from "@/pages/supermercado/SupermercadoPedidos";
import SupermercadoCampanhas from "@/pages/supermercado/SupermercadoCampanhas";
import SupermercadoConfig from "@/pages/supermercado/SupermercadoConfig";
import SiteGenerator from "@/pages/SiteGenerator";
import { useEffect } from "react";
import {
  useGetTenant,
  getGetTenantQueryKey,
} from "@workspace/api-client-react";

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

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    }
  }, [token, isLoading, setLocation]);

  useEffect(() => {
    if (!isTenantAdmin || tenantLoading || !tenant) return;
    if (tenant.status !== "suspended" && !tenant.setupCompletedAt) {
      setLocation("/onboarding");
    }
  }, [tenant, tenantLoading, isTenantAdmin, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (isTenantAdmin && tenantLoading) return <Spinner />;
  if (isTenantAdmin && tenant?.status === "suspended") return <Suspended />;

  return (
    <SidebarLayout>
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
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && user.tenantVertical !== "Varejo de Roupas & Acessórios") {
      setLocation("/");
    }
  }, [token, user, isLoading, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (user.tenantVertical !== "Varejo de Roupas & Acessórios") return null;

  return (
    <SidebarLayout>
      <Component {...rest} />
    </SidebarLayout>
  );
}

function SupermercadoRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && user.tenantVertical !== "Supermercado") {
      setLocation("/");
    }
  }, [token, user, isLoading, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (user.tenantVertical !== "Supermercado") return null;

  return (
    <SidebarLayout>
      <Component {...rest} />
    </SidebarLayout>
  );
}

function ConstrucaoRoute({ component: Component, ...rest }: any) {
  const { token, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    } else if (!isLoading && user && user.tenantVertical !== "Construção & Reforma") {
      setLocation("/");
    }
  }, [token, user, isLoading, setLocation]);

  if (isLoading || !token || !user) return <Spinner />;
  if (user.tenantVertical !== "Construção & Reforma") return null;

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
      <Route path="/deals">
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
      <Route path="/propostas">
        {() => <ProtectedRoute component={Propostas} />}
      </Route>
      <Route path="/campanhas">
        <ProtectedRoute component={Campanhas} />
      </Route>
      <Route path="/estoque">
        {() => <ProtectedRoute component={Estoque} />}
      </Route>
      <Route path="/faturamento">
        {() => <ProtectedRoute component={Faturamento} />}
      </Route>
      <Route path="/admin/ai-usage">
        {() => <SuperAdminRoute component={AdminAIUsage} />}
      </Route>
      <Route path="/admin/partners">
        {() => <SuperAdminRoute component={AdminPartners} />}
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
      <Route path="/guia-implantacao">
        {() => <ProtectedRoute component={GuiaImplantacao} />}
      </Route>
      <Route path="/site-generator">
        {() => <ProtectedRoute component={SiteGenerator} />}
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
