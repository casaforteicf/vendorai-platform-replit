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
import { useEffect } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { token, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation("/login");
    }
  }, [token, isLoading, setLocation]);

  if (isLoading || !token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

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

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return <Component />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute component={Login} />
      </Route>
      <Route path="/register">
        <PublicRoute component={Register} />
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
