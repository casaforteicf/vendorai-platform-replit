// Product routes are part of the public website deployment (Cloudflare sync).
import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Funcionalidades from "@/pages/Funcionalidades";
import RecursoDetalhe from "@/pages/RecursoDetalhe";
import AgenteDetalhe from "@/pages/AgenteDetalhe";
import Produtos from "@/pages/Produtos";
import ProdutoDetalhe from "@/pages/ProdutoDetalhe";
import Precos from "@/pages/Precos";
import Sobre from "@/pages/Sobre";
import Contato from "@/pages/Contato";
import Demo from "@/pages/Demo";
import CadastroPraca from "@/pages/CadastroPraca";
import DownloadApp from "@/pages/DownloadApp";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import VerticalPage from "@/pages/site/VerticalPage";
import ParceirosPage from "@/pages/site/ParceirosPage";
import BlogList from "@/pages/blog/BlogList";
import BlogPost from "@/pages/blog/BlogPost";
import UnifiedLpRouter from "@/pages/lp/UnifiedLpRouter";
import MacrosegmentHub from "@/pages/lp/MacrosegmentHub";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ModernHomepageHero from "@/components/ModernHomepageHero";
import NicheVisualShowcase from "@/components/NicheVisualShowcase";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import { AgentSimulatorWidget } from "@/components/AgentSimulatorWidget";
import { usePublicCountry } from "@/lib/publicCountry";
import {
  captureLaunchAttribution,
  installPublicFormConsentBridge,
} from "@/lib/launchAttribution";

const queryClient = new QueryClient();

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return null;
}

function FloatingActions() {
  const [location] = useLocation();
  const formFocusedPage = location === "/demo" || location === "/contato" || location === "/cadastro-praca" || location === "/baixar-app";

  if (formFocusedPage) return null;

  return (
    <>
      <WhatsAppFloatButton />
      <AgentSimulatorWidget />
    </>
  );
}

function HomeWithNicheVisuals() {
  const { isSpanish } = usePublicCountry();

  return (
    <>
      <ModernHomepageHero />
      {!isSpanish && <NicheVisualShowcase />}
      <div className="[&>div>section:first-child]:hidden">
        <Home />
      </div>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/verticais/:slug" component={VerticalPage} />
      <Route path="/parceiros" component={ParceirosPage} />
      <Route path="/segmentos/:slug" component={MacrosegmentHub} />
      <Route path="/lp/:slug" component={UnifiedLpRouter} />

      <Route>
        <div className="flex min-h-screen flex-col overflow-x-clip">
          <Navbar />
          <main className="min-w-0 flex-1">
            <Switch>
              <Route path="/" component={HomeWithNicheVisuals} />
              <Route path="/produtos/:slug" component={ProdutoDetalhe} />
              <Route path="/produtos" component={Produtos} />
              <Route path="/funcionalidades/:slug" component={RecursoDetalhe} />
              <Route path="/funcionalidades" component={Funcionalidades} />
              <Route path="/agentes/:slug" component={AgenteDetalhe} />
              <Route path="/precos" component={Precos} />
              <Route path="/sobre" component={Sobre} />
              <Route path="/contato" component={Contato} />
              <Route path="/demo" component={Demo} />
              <Route path="/baixar-app" component={DownloadApp} />
              <Route path="/cadastro-praca" component={CadastroPraca} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/terms" component={Terms} />
              <Route path="/blog/:slug" component={BlogPost} />
              <Route path="/blog" component={BlogList} />
              <Route component={NotFound} />
            </Switch>
          </main>
          <Footer />
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  captureLaunchAttribution();
  installPublicFormConsentBridge();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ScrollToTop />
          <Router />
          <FloatingActions />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
