// Product routes are part of the public website deployment (Cloudflare production sync).
import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import GrowthRevenueHero from "@/components/GrowthRevenueHero";
import DistributedProductScreens from "@/components/DistributedProductScreens";
import RevenueMagicCalculator from "@/components/RevenueMagicCalculator";
import PublicSeoManager from "@/components/PublicSeoManager";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import "@/styles/vendorIdentity.css";
import {
  captureLaunchAttribution,
  installPublicFormConsentBridge,
} from "@/lib/launchAttribution";

const Home = lazy(() => import("@/pages/Home"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Funcionalidades = lazy(() => import("@/pages/Funcionalidades"));
const RecursoDetalhe = lazy(() => import("@/pages/RecursoDetalhe"));
const AgenteDetalhe = lazy(() => import("@/pages/AgenteDetalhe"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const ProdutoDetalhe = lazy(() => import("@/pages/ProdutoDetalhe"));
const SeoIntentPage = lazy(() => import("@/pages/SeoIntentPage"));
const Precos = lazy(() => import("@/pages/Precos"));
const Sobre = lazy(() => import("@/pages/Sobre"));
const Contato = lazy(() => import("@/pages/Contato"));
const Demo = lazy(() => import("@/pages/Demo"));
const CadastroPraca = lazy(() => import("@/pages/CadastroPraca"));
const DownloadApp = lazy(() => import("@/pages/DownloadApp"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const VerticalPage = lazy(() => import("@/pages/site/VerticalPage"));
const ParceirosPage = lazy(() => import("@/pages/site/ParceirosPage"));
const BlogList = lazy(() => import("@/pages/blog/BlogList"));
const BlogPost = lazy(() => import("@/pages/blog/BlogPost"));
const UnifiedLpRouter = lazy(() => import("@/pages/lp/UnifiedLpRouter"));
const MacrosegmentHub = lazy(() => import("@/pages/lp/MacrosegmentHub"));
const AgentSimulatorWidget = lazy(() => import("@/components/AgentSimulatorWidget").then((module) => ({ default: module.AgentSimulatorWidget })));

const queryClient = new QueryClient();

function RouteFallback() {
  return <div className="min-h-[45vh] bg-white" aria-live="polite" aria-busy="true" />;
}

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
      <Suspense fallback={null}><AgentSimulatorWidget /></Suspense>
    </>
  );
}

function HomeWithGrowthRevenueHero() {
  return (
    <>
      <GrowthRevenueHero />
      <RevenueMagicCalculator />
      <div className="[&>div>section:first-child]:hidden [&>div>section.border-y.border-slate-200.bg-slate-50]:hidden">
        <Home />
      </div>
      <DistributedProductScreens />
    </>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/verticais/:slug" component={VerticalPage} />
        <Route path="/parceiros" component={ParceirosPage} />
        <Route path="/segmentos/:slug" component={MacrosegmentHub} />
        <Route path="/lp/:slug" component={UnifiedLpRouter} />

        <Route>
          <div className="vendor-public-shell flex min-h-screen flex-col overflow-x-clip">
            <Navbar />
            <main className="min-w-0 flex-1">
              <Switch>
                <Route path="/" component={HomeWithGrowthRevenueHero} />
                <Route path="/solucoes/:slug" component={SeoIntentPage} />
                <Route path="/comparar/:slug" component={SeoIntentPage} />
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
    </Suspense>
  );
}

function App() {
  captureLaunchAttribution();
  installPublicFormConsentBridge();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <PublicSeoManager />
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
