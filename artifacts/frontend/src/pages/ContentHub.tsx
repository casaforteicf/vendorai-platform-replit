import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Content from "@/pages/Content";
import Campanhas from "@/pages/Campanhas";
import CampanhasHub from "@/pages/CampanhasHub";
import SiteGenerator from "@/pages/SiteGenerator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Images, Megaphone, Sparkles } from "lucide-react";

const REDUNDANT_CHILD_TITLES = new Set([
  "Criar conteúdo",
  "Campanhas",
  "Campanhas e Variedades Praça.ai",
]);

const COPY_REPLACEMENTS: Array<[string, string]> = [
  ["Objetivo da peça", "Ângulo da peça"],
  ["O que você quer publicar?", "Instruções adicionais para a IA"],
  ["Criar estratégia com IA", "Preparar conteúdo com IA"],
  ["Produto interno VendorAI", "Funcionalidade VendorAI"],
  ["Patrocinar este conteúdo", "Criar campanha"],
];

function applyMarketingRedundancyFilter(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("h1").forEach((heading) => {
    const label = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (REDUNDANT_CHILD_TITLES.has(label) && !heading.hidden) {
      heading.hidden = true;
    }
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  textNodes.forEach((node) => {
    let next = node.nodeValue ?? "";
    COPY_REPLACEMENTS.forEach(([from, to]) => {
      if (next.includes(from)) next = next.replace(from, to);
    });
    if (next !== node.nodeValue) node.nodeValue = next;
  });

  root.querySelectorAll<HTMLElement>("[title]").forEach((element) => {
    const title = element.getAttribute("title") ?? "";
    if (title.includes("Patrocinar este conteúdo")) {
      element.setAttribute(
        "title",
        "Leva este conteúdo para a aba Campanhas, preservando texto, imagens e contexto da divulgação.",
      );
    }
  });
}

export default function ContentHub() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useLocation();
  const queryString = location.includes("?") ? location.split("?")[1] ?? "" : "";
  const params = new URLSearchParams(queryString);
  const requestedTab = params.get("tab") ?? "gerador";
  // Compatibilidade: o antigo ?tab=variedades agora abre a modalidade Praça.ai
  // dentro de Campanhas, sem manter uma terceira área paralela no Marketing.
  const legacyPracaView = requestedTab === "variedades";
  const activeTab = requestedTab === "campanhas" || legacyPracaView ? "campanhas" : "gerador";
  const campaignView = legacyPracaView ? "praca" : params.get("view") ?? "overview";

  function handleTabChange(nextTab: string) {
    if (nextTab === "gerador") {
      setLocation("/content");
      return;
    }
    setLocation(`/content?tab=${nextTab}`);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const apply = () => applyMarketingRedundancyFilter(root);
    apply();

    const observer = new MutationObserver(() => apply());
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="min-w-0">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="text-sm text-muted-foreground">Planeje, crie e ative ações em um único fluxo.</p>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto flex flex-wrap">
            <TabsTrigger value="gerador" className="gap-2"><Images className="h-4 w-4"/>Gerador de conteúdo</TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-2"><Megaphone className="h-4 w-4"/>Campanhas</TabsTrigger>
          </TabsList>
          <TabsContent value="gerador" className="-mx-4 md:-mx-6"><Content /></TabsContent>
          <TabsContent value="campanhas" className="-mx-4 md:-mx-6">
            {campaignView === "organicas" ? (
              <Campanhas />
            ) : campaignView === "lp" ? (
              <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const campaignId = params.get("campaignId");
                    setLocation(campaignId
                      ? `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(campaignId)}&from=revenue-scout`
                      : "/content?tab=campanhas");
                  }}
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar para Campanha
                </Button>
                <SiteGenerator />
              </div>
            ) : (
              <CampanhasHub />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
