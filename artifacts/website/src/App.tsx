import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Funcionalidades from "@/pages/Funcionalidades";
import Precos from "@/pages/Precos";
import Sobre from "@/pages/Sobre";
import Contato from "@/pages/Contato";
import Demo from "@/pages/Demo";
import CadastroPraca from "@/pages/CadastroPraca";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import VerticalPage from "@/pages/site/VerticalPage";
import ParceirosPage from "@/pages/site/ParceirosPage";
import BlogList from "@/pages/blog/BlogList";
import BlogPost from "@/pages/blog/BlogPost";
import LpRouter from "@/pages/lp/LpPage";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { captureLaunchAttribution } from "@/lib/launchAttribution";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Standalone pages — own layout, no global Navbar/Footer */}
      <Route path="/verticais/:slug" component={VerticalPage} />
      <Route path="/parceiros" component={ParceirosPage} />
      <Route path="/lp/:slug" component={LpRouter} />

      {/* Standard layout — Navbar + Footer */}
      <Route>
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/funcionalidades" component={Funcionalidades} />
              <Route path="/precos" component={Precos} />
              <Route path="/sobre" component={Sobre} />
              <Route path="/contato" component={Contato} />
              <Route path="/demo" component={Demo} />
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
  // Captura first-touch antes que a navegação client-side remova UTMs da URL.
  // É best-effort e não bloqueia renderização caso sessionStorage esteja indisponível.
  captureLaunchAttribution();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
