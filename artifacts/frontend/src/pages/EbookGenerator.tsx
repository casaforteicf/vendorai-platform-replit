import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Download, Loader2, Megaphone, Sparkles } from "lucide-react";
import { MarketingContextSelector, type MarketingContextValue } from "@/components/marketing/MarketingContextSelector";

interface EbookChapter {
  title: string;
  opening: string;
  sections: Array<{ heading: string; body: string }>;
  takeaway: string;
}

interface CampaignLanguage {
  positioning: string;
  audience: string;
  promise: string;
  tone: string;
  vocabulary: string[];
  avoid: string[];
  primaryCta: string;
  visualDirection: string;
}

interface CampaignKit {
  metaAd: string;
  feedPost: string;
  reelsScript: string;
  deliveryEmailSubject: string;
  deliveryEmailBody: string;
  whatsapp: string;
}

interface EbookGenerationResponse {
  assetId: string;
  title: string;
  subtitle: string;
  summary: string;
  chapters: EbookChapter[];
  finalCta: string;
  campaignLanguage: CampaignLanguage;
  campaignKit: CampaignKit;
  landingHeadline: string;
  landingSubheadline: string;
  storageUrl: string;
  downloadUrl: string;
  mimeType: string;
  fileSize: number;
}

export default function EbookGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const tenantId = user?.tenantId ?? "";

  const [marketingContext, setMarketingContext] = useState<MarketingContextValue>({
    nicheId: "",
    nicheName: "",
    productIds: [],
    productNames: [],
  });

  const [theme, setTheme] = useState("");
  const [objective, setObjective] = useState<"lead_generation" | "educate" | "authority" | "sales" | "guide">("lead_generation");
  const [depth, setDepth] = useState<"curto" | "médio" | "completo">("médio");
  const [tone, setTone] = useState("");
  const [finalCta, setFinalCta] = useState("");

  const [generatedEbook, setGeneratedEbook] = useState<EbookGenerationResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "campaign">("preview");

  useEffect(() => {
    const stored = sessionStorage.getItem("marketingContext");
    if (stored) {
      try {
        const ctx = JSON.parse(stored);
        setMarketingContext(ctx);
      } catch {}
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("marketingContext", JSON.stringify(marketingContext));
  }, [marketingContext]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant ID não encontrado");
      if (!marketingContext.nicheId || !marketingContext.nicheName) throw new Error("Selecione um nicho antes de gerar");
      if (!theme) throw new Error("Defina um tema para o e-book");

      const payload = {
        ...marketingContext,
        theme,
        objective,
        depth,
        tone: tone || undefined,
        finalCta: finalCta || undefined,
      };

      const response = await fetch(`/api/tenants/${tenantId}/content/ebook/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao gerar e-book");
      }

      return response.json() as Promise<EbookGenerationResponse>;
    },
    onSuccess: (data) => {
      setGeneratedEbook(data);
      setActiveTab("preview");
      toast({
        title: "E-book gerado com sucesso!",
        description: `"${data.title}" está pronto para visualização e download.`,
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erro ao gerar e-book",
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    },
  });

  const useCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!generatedEbook || !tenantId) throw new Error("E-book não gerado ou tenant inválido");

      const campaignLanguageRecord = {
        tenantId,
        campaignId: marketingContext.campaignId || "",
        campaignName: marketingContext.campaignName || "",
        ebookAssetId: generatedEbook.assetId,
        campaignLanguage: generatedEbook.campaignLanguage,
        campaignKit: generatedEbook.campaignKit,
        landingHeadline: generatedEbook.landingHeadline,
        landingSubheadline: generatedEbook.landingSubheadline,
        createdAt: new Date().toISOString(),
      };

      sessionStorage.setItem("vendorai_campaign_language_v1", JSON.stringify(campaignLanguageRecord));
      setLocation("/content?tab=campanhas");
    },
    onSuccess: () => {
      toast({
        title: "E-book salvo como campanha",
        description: "Navegando para Campanhas...",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar campanha",
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    },
  });

  const handleDownload = async () => {
    if (!generatedEbook) return;

    try {
      const response = await fetch(generatedEbook.downloadUrl);
      if (!response.ok) throw new Error("Erro ao baixar arquivo");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${generatedEbook.title.toLowerCase().replace(/\s+/g, "-")}.${generatedEbook.mimeType.includes("pdf") ? "pdf" : "html"}`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: "Seu e-book está sendo baixado",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro no download",
        description: error instanceof Error ? error.message : "Tente novamente",
      });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <BookOpen className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Gerador de E-book</h1>
          <p className="text-sm text-muted-foreground">Crie e-books educativos alinhados com sua linguagem de campanha</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Configuração</CardTitle>
              <CardDescription>Defina os parâmetros do e-book</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Contexto de Marketing</Label>
                <MarketingContextSelector tenantId={tenantId} value={marketingContext} onChange={setMarketingContext} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="theme">Tema do E-book <span className="text-red-500">*</span></Label>
                <Textarea
                  id="theme"
                  placeholder="Ex: '10 estratégias de marketing para e-commerce'"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="min-h-20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="objective">Objetivo <span className="text-red-500">*</span></Label>
                <Select value={objective} onValueChange={(v) => setObjective(v as typeof objective)}>
                  <SelectTrigger id="objective">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead_generation">Geração de Leads</SelectItem>
                    <SelectItem value="educate">Educação</SelectItem>
                    <SelectItem value="authority">Estabelecer Autoridade</SelectItem>
                    <SelectItem value="sales">Influenciar Vendas</SelectItem>
                    <SelectItem value="guide">Guia Prático</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="depth">Profundidade <span className="text-red-500">*</span></Label>
                <Select value={depth} onValueChange={(v) => setDepth(v as typeof depth)}>
                  <SelectTrigger id="depth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="curto">Curto (4 capítulos)</SelectItem>
                    <SelectItem value="médio">Médio (6 capítulos)</SelectItem>
                    <SelectItem value="completo">Completo (8 capítulos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone">Tom (opcional)</Label>
                <Input id="tone" placeholder="Ex: profissional, descontraído" value={tone} onChange={(e) => setTone(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cta">CTA Final (opcional)</Label>
                <Input id="cta" placeholder="Ex: Agende sua consultoria gratuita" value={finalCta} onChange={(e) => setFinalCta(e.target.value)} />
              </div>

              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !marketingContext.nicheId || !theme}
                className="w-full gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Gerar E-book
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!generatedEbook ? (
            <Card className="h-full flex items-center justify-center min-h-96">
              <CardContent className="text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Preencha o formulário e clique em "Gerar E-book" para visualizar o resultado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "campaign")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="campaign">Linguagem de Campanha</TabsTrigger>
                </TabsList>

                <TabsContent value="preview" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>{generatedEbook.title}</CardTitle>
                      <CardDescription>{generatedEbook.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div>
                        <h3 className="font-semibold mb-2">Resumo Executivo</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{generatedEbook.summary}</p>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-3">Capítulos</h3>
                        <div className="space-y-4">
                          {generatedEbook.chapters.map((ch, idx) => (
                            <Card key={idx} className="bg-muted/50">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Capítulo {idx + 1}: {ch.title}</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <p className="text-sm italic text-muted-foreground">{ch.opening}</p>
                                <div className="space-y-2">
                                  {ch.sections.map((sec, sidx) => (
                                    <div key={sidx} className="border-l-2 border-primary pl-3">
                                      <p className="text-sm font-semibold">{sec.heading}</p>
                                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{sec.body}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="bg-primary/10 p-2 rounded text-xs mt-2">
                                  <strong>Aprendizado-chave:</strong> {ch.takeaway}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>

                      <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                        <p className="font-semibold mb-1">Próximo Passo</p>
                        <p className="text-sm">{generatedEbook.finalCta}</p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Headlines para Landing Page</h4>
                        <Card className="bg-muted/50 p-3">
                          <p className="font-semibold text-sm">{generatedEbook.landingHeadline}</p>
                          <p className="text-xs text-muted-foreground">{generatedEbook.landingSubheadline}</p>
                        </Card>
                      </div>

                      <Button onClick={handleDownload} className="w-full gap-2" variant="outline">
                        <Download className="h-4 w-4" />
                        Baixar E-book ({generatedEbook.mimeType.includes("pdf") ? "PDF" : "HTML"})
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="campaign" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Megaphone className="h-5 w-5" />
                        Kit de Campanha
                      </CardTitle>
                      <CardDescription>Linguagem de marketing e copy pronto para usar</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-3">
                        <h3 className="font-semibold">Linguagem de Campanha</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-muted/50 p-3 rounded">
                            <p className="text-xs font-semibold text-muted-foreground">Posicionamento</p>
                            <p className="text-sm">{generatedEbook.campaignLanguage.positioning}</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded">
                            <p className="text-xs font-semibold text-muted-foreground">Público-alvo</p>
                            <p className="text-sm">{generatedEbook.campaignLanguage.audience}</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded">
                            <p className="text-xs font-semibold text-muted-foreground">Promessa</p>
                            <p className="text-sm">{generatedEbook.campaignLanguage.promise}</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded">
                            <p className="text-xs font-semibold text-muted-foreground">Tom</p>
                            <p className="text-sm">{generatedEbook.campaignLanguage.tone}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">Vocabulário-chave</p>
                          <div className="flex flex-wrap gap-2">
                            {generatedEbook.campaignLanguage.vocabulary.map((v, i) => (
                              <Badge key={i} variant="secondary">{v}</Badge>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">Termos a Evitar</p>
                          <div className="flex flex-wrap gap-2">
                            {generatedEbook.campaignLanguage.avoid.map((a, i) => (
                              <Badge key={i} variant="outline">✕ {a}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h3 className="font-semibold">Copy para Canais</h3>
                        <ScrollArea className="h-96 rounded border p-4 space-y-4">
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Meta Ads</p>
                            <p className="text-sm bg-muted/50 p-2 rounded">{generatedEbook.campaignKit.metaAd}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Post Feed</p>
                            <p className="text-sm bg-muted/50 p-2 rounded whitespace-pre-wrap">{generatedEbook.campaignKit.feedPost}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Script Reels</p>
                            <p className="text-sm bg-muted/50 p-2 rounded whitespace-pre-wrap">{generatedEbook.campaignKit.reelsScript}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">Email</p>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground"><strong>Assunto:</strong> {generatedEbook.campaignKit.deliveryEmailSubject}</p>
                              <p className="text-sm bg-muted/50 p-2 rounded whitespace-pre-wrap">{generatedEbook.campaignKit.deliveryEmailBody}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">WhatsApp</p>
                            <p className="text-sm bg-muted/50 p-2 rounded">{generatedEbook.campaignKit.whatsapp}</p>
                          </div>
                        </ScrollArea>
                      </div>

                      <Button
                        onClick={() => useCampaignMutation.mutate()}
                        disabled={useCampaignMutation.isPending}
                        className="w-full gap-2"
                      >
                        {useCampaignMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Megaphone className="h-4 w-4" />
                            Usar como Campanha
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
