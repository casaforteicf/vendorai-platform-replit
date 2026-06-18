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
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/funcionalidades" component={Funcionalidades} />
          <Route path="/precos" component={Precos} />
          <Route path="/sobre" component={Sobre} />
          <Route path="/contato" component={Contato} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
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
