import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Content from "@/pages/Content";
import Campanhas from "@/pages/Campanhas";
import PracaVariedades from "@/pages/supermercado/SupermercadoCampanhas";
import { Images, Megaphone, Sparkles } from "lucide-react";

export default function ContentHub() {
  const initialTab = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tab") ?? "gerador"
    : "gerador";

  return (
    <div className="min-w-0">
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Marketing
          </h1>
          <p className="text-sm text-muted-foreground">Conteúdo, campanhas e automação de marketing em um único lugar.</p>
        </div>
        <Tabs defaultValue={initialTab}>
          <TabsList className="h-auto flex flex-wrap">
            <TabsTrigger value="gerador" className="gap-2"><Images className="h-4 w-4"/>Gerador</TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-2"><Megaphone className="h-4 w-4"/>Campanhas</TabsTrigger>
            <TabsTrigger value="variedades" className="gap-2"><Sparkles className="h-4 w-4"/>Variedades Praça.ai</TabsTrigger>
          </TabsList>
          <TabsContent value="gerador" className="-mx-4 md:-mx-6"><Content /></TabsContent>
          <TabsContent value="campanhas" className="-mx-4 md:-mx-6"><Campanhas /></TabsContent>
          <TabsContent value="variedades" className="-mx-4 md:-mx-6"><PracaVariedades /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
