// Product routes are part of the public website deployment (Cloudflare production sync).
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import GrowthRevenueHero from "@/components/GrowthRevenueHero";
import PublicSeoManager from "@/components/PublicSeoManager";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import "@/styles/vendorIdentity.css";

const Home = lazy(() => import("@/pages/Home"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Funcionalidades = lazy(() => import("@/pages/Funcionalidades"));
const RecursoDetalhe = lazy(() => import("@/pages/RecursoDetalhe"));
const AgenteDetalhe = lazy(() => import("@/pages/AgenteDetalhe"));
const Produtos = lazy(() => import("@/pages/Produtos"));
const ProdutoDetalhe = lazy(() => import("@/pages/ProdutoDetalhe"));
const SeoIntentPage = lazy(() => import("@/pages/SeoIntentPage"));
const SeoIntentHub = lazy(() => import("@/pages/SeoIntentHub"));
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
const RevenueMagicCalculator = lazy(() => import("@/components/RevenueMagicCalculator"));
const DistributedProductScreens = lazy(() => import("@/components/DistributedProductScreens"));
const AgentSimulatorWidget = lazy(() => import("@/components/AgentSimulatorWidget").then((module) => ({ default: module.AgentSimulatorWidget })));
const RouteToasterComponent = lazy(() => import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })));

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

function ViewportDeferred({ children, minHeight = 720, rootMargin = "900px 0px" }: { children: ReactNode; minHeight?: number; rootMargin?: string }) {
  const [enabled, setEnabled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (enabled) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setEnabled(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setEnabled(true);
      observer.disconnect();
    }, { rootMargin });

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return (
    <div
      ref={sentinelRef}
      style={{ minHeight: enabled ? undefined : minHeight, contentVisibility: "auto", containIntrinsicSize: `auto ${minHeight}px` }}
    >
      {enabled ? children : null}
    </div>
  );
}

function IdleAgentSimulator() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    const enable = () => setEnabled(true);
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(enable, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(enable, 1200);
    }

    return () => {
      if (idleId != null) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!enabled) return null;
  return <Suspense fallback={null}><AgentSimulatorWidget /></Suspense>;
}

function FloatingActions() {
  const [location] = useLocation();
  const formFocusedPage = location === "/demo" || location === "/contato" || location === "/cadastro-praca" || location === "/baixar-app";

  if (formFocusedPage) return null;

  return (
    <>
      <WhatsAppFloatButton />
      <IdleAgentSimulator />
    </>
  );
}

function RouteToaster() {
  const [location] = useLocation();

  if (location !== "/cadastro-praca") return null;
  return <Suspense fallback={null}><RouteToasterComponent /></Suspense>;
}

function HomeWithGrowthRevenueHero() {
  return (
    <>
      <GrowthRevenueHero />
      <ViewportDeferred minHeight={900} rootMargin="1100px 0px">
        <Suspense fallback={null}><RevenueMagicCalculator /></Suspense>
      </ViewportDeferred>
      <div
        className="[&>div>section:first-child]:hidden [&>div>section.border-y.border-slate-200.bg-slate-50]:hidden"
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 4200px" }}
      >
        <Home />
      </div>
      <ViewportDeferred minHeight={3200} rootMargin="1200px 0px">
        <Suspense fallback={null}><DistributedProductScreens /></Suspense>
      </ViewportDeferred>
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
                <Route path="/solucoes" component={SeoIntentHub} />
                <Route path="/comparar" component={SeoIntentHub} />
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
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <PublicSeoManager />
        <ScrollToTop />
        <Router />
        <FloatingActions />
        <RouteToaster />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
