import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  getGetBusinessProfileByTenantQueryKey,
  getGetTenantQueryKey,
  useGetBusinessProfileByTenant,
  useGetTenant,
  useUpdateBusinessProfile,
  useUpdateTenant,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Save, Palette, ImageIcon, Building2, Megaphone, Brain, Library, ExternalLink, Sparkles, Loader2, CheckCircle2, ChevronLeft, ChevronRight, Package2, Eye, Bot, WandSparkles } from "lucide-react";

type BrandStudioMode = "maintain" | "evolve" | "rebuild";

type BrandStudioProposal = {
  mode?: BrandStudioMode;
  diagnosis?: string;
  rationale?: string;
  positioning?: string;
  valueProposition?: string;
  toneOfVoice?: string[];
  keyMessages?: string[];
  wordsToUse?: string[];
  wordsToAvoid?: string[];
  palette?: Array<{ name?: string; hex?: string; use?: string }>;
  typography?: { headline?: string; body?: string; notes?: string };
  visualStyle?: string;
  photographyStyle?: string;
  videoStyle?: string;
  applications?: string[];
  doList?: string[];
  dontList?: string[];
};

type BrandDraft = {
  posicionamento: string;
  tomVoz: string;
  mensagensChave: string;
  estiloVisual: string;
  tipografia: string;
  coresSecundarias: string;
  ctaPadrao: string;
  palavrasEvitar: string;
  referenciasVisuais: string;
};

const emptyDraft: BrandDraft = {
  posicionamento: "",
  tomVoz: "",
  mensagensChave: "",
  estiloVisual: "",
  tipografia: "",
  coresSecundarias: "",
  ctaPadrao: "",
  palavrasEvitar: "",
  referenciasVisuais: "",
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function BrandKitSettings() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();
  const profile = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId, retry: false },
  });
  const tenant = useGetTenant(tenantId, {
    query: { queryKey: getGetTenantQueryKey(tenantId), enabled: !!tenantId, retry: false },
  });
  const updateProfile = useUpdateBusinessProfile();
  const updateTenant = useUpdateTenant();

  const { data: videoKit } = useQuery({
    queryKey: ["brand-video-kit", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) return null;
      const data = await response.json() as { brandKit?: Record<string, unknown> | null };
      return data.brandKit ?? null;
    },
  });

  const discovery = (profile.data?.discoveryData as Record<string, unknown> | null) ?? {};
  const proposalBuilderTemplates = Array.isArray(discovery.proposalBuilderTemplates)
    ? (discovery.proposalBuilderTemplates as Array<Record<string, unknown>>).filter(
        (item) => item && typeof item.id === "string",
      )
    : [];
  const activeProposalBuilderTemplateId =
    typeof discovery.activeProposalBuilderTemplateId === "string"
      ? discovery.activeProposalBuilderTemplateId
      : null;
  const activeProposalBuilderTemplate =
    proposalBuilderTemplates.find((item) => item.id === activeProposalBuilderTemplateId)
    ?? proposalBuilderTemplates.find((item) => item.isDefault === true)
    ?? proposalBuilderTemplates[0]
    ?? null;
  const [draft, setDraft] = useState<BrandDraft>(emptyDraft);
  const [primaryColor, setPrimaryColor] = useState("#A78BFA");
  const [aiMode, setAiMode] = useState<BrandStudioMode>("evolve");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<BrandStudioProposal | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  const wizardSteps = [
    { label: "Empresa", description: "Contexto oficial", icon: Building2 },
    { label: "Identidade", description: "Logo, cores e tipografia", icon: Palette },
    { label: "Voz", description: "Posicionamento e linguagem", icon: Brain },
    { label: "Ofertas", description: "Produtos e propostas", icon: Package2 },
    { label: "Mídias", description: "Referências e bibliotecas", icon: Library },
    { label: "Revisão", description: "Prévia e publicação", icon: Eye },
  ] as const;

  useEffect(() => {
    setDraft({
      posicionamento: stringValue(discovery.posicionamento),
      tomVoz: stringValue(discovery.tomVoz),
      mensagensChave: stringValue(discovery.mensagensChave),
      estiloVisual: stringValue(discovery.estiloVisual),
      tipografia: stringValue(discovery.tipografia),
      coresSecundarias: stringValue(discovery.coresSecundarias),
      ctaPadrao: stringValue(discovery.ctaPadrao),
      palavrasEvitar: stringValue(discovery.palavrasEvitar),
      referenciasVisuais: stringValue(discovery.referenciasVisuais),
    });
  }, [profile.data?.id, profile.data?.discoveryData]);

  useEffect(() => {
    setPrimaryColor(tenant.data?.corPrimaria || "#111111");
  }, [tenant.data?.corPrimaria]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [profile.data?.logoUrl, tenant.data?.logoUrl]);

  const completeness = useMemo(() => {
    const checks = [
      profile.data?.razaoSocial,
      profile.data?.nomeFantasia,
      profile.data?.logoUrl || tenant.data?.logoUrl,
      tenant.data?.corPrimaria,
      profile.data?.diferenciais,
      profile.data?.publicoAlvo,
      discovery.missao,
      discovery.visao,
      discovery.historia,
      draft.posicionamento,
      draft.tomVoz,
      draft.mensagensChave,
      draft.estiloVisual,
      draft.tipografia,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile.data, tenant.data, discovery, draft]);


  const applyProposalForStep = (proposal: BrandStudioProposal, step = activeStep) => {
    const palette = (proposal.palette ?? [])
      .map((item) => [item.name, item.hex, item.use].filter(Boolean).join(" — "))
      .filter(Boolean)
      .join("\n");
    const typography = [
      proposal.typography?.headline ? `Títulos: ${proposal.typography.headline}` : "",
      proposal.typography?.body ? `Textos: ${proposal.typography.body}` : "",
      proposal.typography?.notes || "",
    ].filter(Boolean).join("\n");
    const style = [
      proposal.visualStyle ? `Visual: ${proposal.visualStyle}` : "",
      proposal.photographyStyle ? `Fotografia: ${proposal.photographyStyle}` : "",
      proposal.videoStyle ? `Vídeo: ${proposal.videoStyle}` : "",
    ].filter(Boolean).join("\n");
    const avoid = [
      ...(proposal.wordsToAvoid ?? []),
      ...(proposal.dontList ?? []),
    ].filter(Boolean).join(", ");
    const messages = [
      proposal.valueProposition,
      ...(proposal.keyMessages ?? []),
    ].filter(Boolean).join("\n• ");
    const references = [
      ...(proposal.applications ?? []),
      ...(proposal.doList ?? []),
    ].filter(Boolean).join("\n");

    setDraft((current) => ({
      ...current,
      ...(step === 1 || step === 5 ? {
        estiloVisual: style || current.estiloVisual,
        tipografia: typography || current.tipografia,
        coresSecundarias: palette || current.coresSecundarias,
      } : {}),
      ...(step === 2 || step === 5 ? {
        posicionamento: proposal.positioning || current.posicionamento,
        tomVoz: (proposal.toneOfVoice ?? []).join(", ") || current.tomVoz,
        mensagensChave: messages ? `• ${messages}` : current.mensagensChave,
        palavrasEvitar: avoid || current.palavrasEvitar,
      } : {}),
      ...(step === 4 || step === 5 ? {
        referenciasVisuais: references || current.referenciasVisuais,
      } : {}),
    }));

    const firstPaletteHex = (proposal.palette ?? [])
      .map((item) => item.hex?.trim())
      .find((hex) => /^#[0-9A-Fa-f]{6}$/.test(hex || ""));
    if ((step === 1 || step === 5) && firstPaletteHex && !tenant.data?.corPrimaria) {
      setPrimaryColor(firstPaletteHex);
    }
  };

  const buildWithAI = async (notes?: string) => {
    if (!tenantId || aiLoading) return;
    setAiLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit/ai/suggest`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: aiMode, notes: notes || undefined }),
      });
      const payload = await response.json().catch(() => ({})) as { proposal?: BrandStudioProposal; error?: string };
      if (!response.ok || !payload.proposal) throw new Error(payload.error || "Não foi possível montar o Kit da Marca com IA.");

      const proposal = payload.proposal;
      setAiProposal(proposal);
      if (!notes) {
        applyProposalForStep(proposal, activeStep);
        toast({ title: "A IA montou uma proposta para esta etapa. Revise antes de salvar." });
      } else {
        toast({ title: "O agente concluiu a análise. Revise a recomendação antes de aplicar." });
      }
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Falha ao montar o Kit da Marca com IA.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const runAgentAction = async (action: "analyze" | "improve" | "fill" | "compare" | "audit" | "custom") => {
    const step = wizardSteps[activeStep];
    const instructions: Record<typeof action, string> = {
      analyze: "Analise a etapa atual e destaque o que está bom, o que falta e o que merece atenção.",
      improve: "Sugira melhorias práticas para a etapa atual, preservando a identidade oficial e sem inventar fatos.",
      fill: "Identifique apenas campos vazios ou fracos desta etapa e proponha conteúdo para completar. Não altere fontes oficiais.",
      compare: "Compare esta etapa com o contexto, conhecimento e planejamento disponíveis do tenant e aponte divergências.",
      audit: "Faça uma auditoria de consistência desta etapa e identifique conflitos entre marca, posicionamento, público, ofertas e mídias.",
      custom: agentPrompt.trim() || "Ajude a melhorar esta etapa do Kit da Marca.",
    };
    const sourceRules = activeStep === 0 || activeStep === 3
      ? "Esta etapa usa fontes oficiais. Não proponha edição direta de dados institucionais ou catálogo; indique a fonte oficial que deve ser atualizada."
      : "Qualquer alteração é apenas sugestão e só deve ser aplicada após revisão humana.";
    await buildWithAI([
      `Etapa atual: ${activeStep + 1}. ${step.label} — ${step.description}.`,
      instructions[action],
      sourceRules,
      "Nunca recrie, recorte, distorça ou substitua a logo oficial.",
    ].join("\n"));
  };

  const saveBrandContext = async () => {
    if (!profile.data?.id) {
      toast({ title: "Cadastre primeiro os dados básicos da empresa.", variant: "destructive" });
      return;
    }
    try {
      await updateProfile.mutateAsync({
        id: profile.data.id,
        data: {
          discoveryData: {
            ...discovery,
            posicionamento: draft.posicionamento || undefined,
            tomVoz: draft.tomVoz || undefined,
            mensagensChave: draft.mensagensChave || undefined,
            estiloVisual: draft.estiloVisual || undefined,
            tipografia: draft.tipografia || undefined,
            coresSecundarias: draft.coresSecundarias || undefined,
            ctaPadrao: draft.ctaPadrao || undefined,
            palavrasEvitar: draft.palavrasEvitar || undefined,
            referenciasVisuais: draft.referenciasVisuais || undefined,
          },
        },
      });
      if (primaryColor !== (tenant.data?.corPrimaria || "#A78BFA")) {
        await updateTenant.mutateAsync({ id: tenantId, data: { corPrimaria: primaryColor } });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) }),
        qc.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) }),
        qc.invalidateQueries({ queryKey: ["tenant-plan", tenantId] }),
      ]);
      toast({ title: "Kit da Marca atualizado." });
    } catch {
      toast({ title: "Não foi possível salvar o Kit da Marca.", variant: "destructive" });
    }
  };

  const field = (label: string, key: keyof BrandDraft, placeholder: string, rows = 3) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={rows}
        value={draft[key]}
        onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  );

  const goToStep = (index: number) => {
    setActiveStep(Math.max(0, Math.min(wizardSteps.length - 1, index)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const logoUrl = profile.data?.logoUrl || tenant.data?.logoUrl || "";
  const companyName = profile.data?.nomeFantasia || profile.data?.razaoSocial || "Sua marca";
  const isSaving = updateProfile.isPending || updateTenant.isPending;
  const hasOfficialPrimaryColor = Boolean(tenant.data?.corPrimaria);
  const canApplyAgentSuggestion = Boolean(aiProposal) && ![0, 3].includes(activeStep);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Kit da Marca</h1>
              <Badge variant="secondary">{completeness === 100 ? "Kit configurado" : `${completeness}% configurado`}</Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Central oficial da identidade do tenant. O que for definido aqui alimenta Marketing, conteúdos, anúncios, sites, propostas, vídeos e agentes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" type="button" onClick={() => setAgentOpen(true)}>
              <Bot className="mr-2 h-4 w-4" />Apoio da IA
            </Button>
            <Button type="button" onClick={saveBrandContext} disabled={isSaving || !profile.data?.id}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar Kit"}
            </Button>
          </div>
        </div>
        <Progress value={completeness} className="mt-4" />
      </section>

      <section className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {wizardSteps.map((step, index) => {
            const Icon = step.icon;
            const active = index === activeStep;
            const completed = index < activeStep;
            return (
              <button
                key={step.label}
                type="button"
                onClick={() => goToStep(index)}
                className={[
                  "rounded-xl border p-3 text-left transition",
                  active ? "border-primary bg-primary/[0.06] shadow-sm" : "bg-background hover:bg-muted/40",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className={[
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    active ? "border-primary bg-primary text-primary-foreground" : completed ? "border-primary/30 bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground",
                  ].join(" ")}>
                    {completed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="text-xs font-semibold">{index + 1}. {step.label}</span>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{step.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {activeStep === 0 && (
        <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Empresa e posicionamento-base</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Dados institucionais vêm do Perfil da Empresa para evitar informações duplicadas.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Empresa</p><p className="mt-1 text-sm font-medium">{companyName}</p></div>
              <div className="rounded-xl border bg-muted/10 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Segmento</p><p className="mt-1 text-sm font-medium">{profile.data?.vertical || "Não informado"}</p></div>
              <div className="md:col-span-2 rounded-xl border bg-muted/10 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Diferenciais</p><p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{profile.data?.diferenciais || "Não informado"}</p></div>
              <div className="md:col-span-2 rounded-xl border bg-muted/10 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Público / ICP</p><p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{profile.data?.publicoAlvo || "Não informado"}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" type="button" onClick={() => window.location.assign("/configuracoes?tab=perfil")}>
                Editar em Empresa <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="ghost" type="button" onClick={() => window.location.assign("/diagnostico-planejamento")}>
                Ver Diagnóstico & Planejamento
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo da marca</p>
            <div className="mt-4 flex min-h-36 items-center justify-center rounded-xl border bg-muted/20 p-5">
              {logoUrl && !logoLoadFailed ? (
                <img src={logoUrl} alt="Logo oficial" className="max-h-24 max-w-full object-contain" onError={() => setLogoLoadFailed(true)} />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  {logoUrl ? "Não foi possível carregar a logo oficial. Verifique o arquivo cadastrado." : "Logo oficial ainda não cadastrada"}
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border p-3"><span className="text-muted-foreground">Marca</span><p className="mt-1 font-medium">{companyName}</p></div>
              <div className="rounded-lg border p-3"><span className="text-muted-foreground">Cor principal</span><div className="mt-1 flex items-center gap-2 font-mono">{hasOfficialPrimaryColor ? <><span className="h-4 w-4 rounded-full border" style={{ backgroundColor: primaryColor }} />{primaryColor}</> : <span className="text-muted-foreground">Não definida</span>}</div></div>
              <div className="rounded-lg border p-3"><span className="text-muted-foreground">Tipografia</span><p className="mt-1 line-clamp-2 font-medium">{draft.tipografia || "Não definida"}</p></div>
              <div className="rounded-lg border p-3"><span className="text-muted-foreground">Tom de voz</span><p className="mt-1 line-clamp-2 font-medium">{draft.tomVoz || "Não definido"}</p></div>
            </div>
          </div>
        </section>
      )}

      {activeStep === 1 && (
        <section className="rounded-2xl border bg-card p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /><h2 className="font-semibold">Identidade visual</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Use somente arquivos oficiais da marca. O sistema não deve recriar, recortar ou distorcer a logo cadastrada.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cor principal</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-14 rounded-md border bg-transparent p-1" />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Logo oficial</Label>
              <div className="min-h-10 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {logoUrl ? "Logo oficial cadastrada e compartilhada com as ferramentas." : "Nenhuma logo oficial cadastrada."}
              </div>
            </div>
            {field("Cores secundárias", "coresSecundarias", "Ex.: #111827, #F97316, branco e cinza claro", 3)}
            {field("Tipografia", "tipografia", "Ex.: Inter para interface; Montserrat para títulos", 3)}
            <div className="lg:col-span-2">{field("Estilo visual", "estiloVisual", "Fotografia, iluminação, composição, cenários, acabamentos e padrões visuais.")}</div>
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><strong className="text-sm">Assistente de Marca com IA</strong></div>
                <p className="mt-1 text-xs text-muted-foreground">A IA pode analisar o contexto atual e sugerir uma evolução. Nada é salvo sem sua revisão.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={aiMode} onChange={(event) => setAiMode(event.target.value as BrandStudioMode)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Modo da IA para o Kit da Marca">
                  <option value="maintain">Manter identidade</option>
                  <option value="evolve">Evoluir identidade</option>
                  <option value="rebuild">Reconstruir identidade</option>
                </select>
                <Button type="button" onClick={buildWithAI} disabled={aiLoading || !tenantId} className="gap-2">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiLoading ? "Analisando..." : "Analisar e completar"}
                </Button>
              </div>
            </div>
            {aiProposal && (
              <div className="mt-4 grid gap-3 rounded-xl border bg-background/70 p-4 md:grid-cols-2">
                <div><p className="text-xs font-semibold">Diagnóstico</p><p className="mt-1 text-xs text-muted-foreground">{aiProposal.diagnosis || "Proposta criada com base no contexto disponível."}</p></div>
                <div><p className="text-xs font-semibold">Direção recomendada</p><p className="mt-1 text-xs text-muted-foreground">{aiProposal.rationale || "Revise os campos antes de salvar."}</p></div>
              </div>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /><h2 className="font-semibold">Voz, posicionamento e mensagens</h2></div>
            <div className="grid gap-4 md:grid-cols-2">
              {field("Posicionamento", "posicionamento", "Como a marca deve ser percebida e qual proposta de valor deve sustentar.")}
              {field("Tom de voz", "tomVoz", "Ex.: consultivo, claro, técnico sem ser complicado, direto e humano.")}
              {field("Mensagens-chave", "mensagensChave", "Mensagens que devem aparecer com frequência nos materiais.")}
              {field("CTA padrão", "ctaPadrao", "Ex.: Solicite uma análise / Fale com nossa equipe.", 2)}
              <div className="md:col-span-2">{field("Palavras e abordagens a evitar", "palavrasEvitar", "Termos proibidos, promessas que não podem ser feitas e estilos inadequados.")}</div>
            </div>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2"><Package2 className="h-4 w-4 text-primary" /><h2 className="font-semibold">Produtos e ofertas</h2></div>
            <p className="text-sm text-muted-foreground">
              Produtos, serviços, preços, imagens e pacotes continuam no Catálogo oficial. O Kit da Marca usa essa fonte para campanhas, propostas e agentes sem duplicar cadastros.
            </p>
            <Button variant="outline" type="button" onClick={() => window.location.assign("/catalogo")}>Abrir Catálogo</Button>
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">Modelo inteligente de proposta</h2></div>
            {activeProposalBuilderTemplate ? (
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div><p className="text-sm font-medium">{String(activeProposalBuilderTemplate.name || "Modelo padrão")}</p><p className="text-xs text-muted-foreground">{proposalBuilderTemplates.length} versão(ões) disponíveis</p></div>
                  <Badge variant="secondary">Ativo</Badge>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Ao salvar o Kit da Marca, o sistema prepara automaticamente um modelo seguro para o segmento.
              </div>
            )}
          </div>
        </section>
      )}

      {activeStep === 4 && (
        <section className="rounded-2xl border bg-card p-5 space-y-5">
          <div className="flex items-center gap-2"><Library className="h-4 w-4 text-primary" /><h2 className="font-semibold">Mídias, referências e conhecimento</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>{field("Referências visuais", "referenciasVisuais", "Links, projetos de referência, padrões aprovados e orientações para imagens e vídeos.", 5)}</div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-medium">Fontes conectadas</p>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between rounded-lg border bg-background p-3"><span>Biblioteca de Mídias</span><Badge variant="secondary">Oficial</Badge></div>
                <div className="flex items-center justify-between rounded-lg border bg-background p-3"><span>Base de Conhecimento</span><Badge variant="secondary">Conectada</Badge></div>
                <div className="flex items-center justify-between rounded-lg border bg-background p-3"><span>Brand Video Kit</span><Badge variant="secondary">{videoKit ? "Conectado" : "Pendente"}</Badge></div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" type="button" onClick={() => window.location.assign("/midias")}>Abrir Mídias</Button>
            <Button variant="outline" type="button" onClick={() => window.location.assign("/base-conhecimento")}>Abrir Conhecimento</Button>
            <Button variant="outline" type="button" onClick={() => window.location.assign("/content-studio/video")}><ImageIcon className="mr-2 h-4 w-4" />Abrir Vídeos</Button>
          </div>
        </section>
      )}

      {activeStep === 5 && (
        <section className="grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia da identidade</p>
            <div className="mt-4 rounded-2xl border p-5" style={{ borderTopColor: primaryColor, borderTopWidth: 4 }}>
              <div className="flex min-h-28 items-center justify-center rounded-xl bg-muted/20 p-4">
                {logoUrl ? <img src={logoUrl} alt="Logo oficial" className="max-h-20 max-w-full object-contain" /> : <span className="text-sm text-muted-foreground">Logo não cadastrada</span>}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{companyName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{draft.posicionamento || "Defina o posicionamento da marca."}</p>
              <div className="mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                {draft.ctaPadrao || "CTA principal"}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-semibold">Revisar antes de salvar</h2>
              <p className="mt-1 text-xs text-muted-foreground">Confira os principais elementos que serão usados pelo restante da plataforma.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Empresa", companyName],
                ["Segmento", profile.data?.vertical || "Não informado"],
                ["Cor principal", primaryColor],
                ["Tom de voz", draft.tomVoz || "Não definido"],
                ["CTA", draft.ctaPadrao || "Não definido"],
                ["Logo", logoUrl ? "Oficial cadastrada" : "Pendente"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>
              ))}
            </div>
            <Button className="w-full" type="button" onClick={saveBrandContext} disabled={isSaving || !profile.data?.id}>
              <Save className="mr-2 h-4 w-4" />{isSaving ? "Salvando..." : "Salvar e aplicar Kit da Marca"}
            </Button>
          </div>
        </section>
      )}

      <Sheet open={agentOpen} onOpenChange={setAgentOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Agente de apoio do Kit da Marca</SheetTitle>
            <SheetDescription>
              Contexto atual: etapa {activeStep + 1} de {wizardSteps.length} · {wizardSteps[activeStep].label}. O agente usa o contexto do tenant e não altera nada sem sua revisão.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" type="button" disabled={aiLoading} onClick={() => runAgentAction("analyze")}><Sparkles className="mr-2 h-4 w-4" />Analisar esta etapa</Button>
              <Button variant="outline" type="button" disabled={aiLoading} onClick={() => runAgentAction("improve")}><WandSparkles className="mr-2 h-4 w-4" />Sugerir melhorias</Button>
              <Button variant="outline" type="button" disabled={aiLoading} onClick={() => runAgentAction("fill")}>Completar lacunas</Button>
              <Button variant="outline" type="button" disabled={aiLoading} onClick={() => runAgentAction("compare")}>Comparar com planejamento</Button>
              <Button variant="outline" type="button" disabled={aiLoading} onClick={() => runAgentAction("audit")}>Verificar inconsistências</Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand-agent-prompt">Peça algo específico</Label>
              <Textarea id="brand-agent-prompt" value={agentPrompt} onChange={(event) => setAgentPrompt(event.target.value)} placeholder="Ex.: deixe o posicionamento mais técnico, sem perder proximidade." rows={3} />
              <Button type="button" disabled={aiLoading || !agentPrompt.trim()} onClick={() => runAgentAction("custom")}>
                {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {aiLoading ? "Analisando..." : "Enviar ao agente"}
              </Button>
            </div>

            {aiProposal ? (
              <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnóstico</p>
                  <p className="mt-1 text-sm leading-6">{aiProposal.diagnosis || "Análise concluída com o contexto disponível."}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recomendação</p>
                  <p className="mt-1 text-sm leading-6">{aiProposal.rationale || "Revise as sugestões antes de aplicar."}</p>
                </div>
                {canApplyAgentSuggestion ? (
                  <Button type="button" className="w-full" onClick={() => {
                    applyProposalForStep(aiProposal, activeStep);
                    toast({ title: "Sugestões aplicadas nesta etapa. Revise e salve quando estiver pronto." });
                  }}>
                    Aplicar sugestões nesta etapa
                  </Button>
                ) : (
                  <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                    Esta etapa usa fonte oficial. O agente pode analisar e indicar ajustes, mas a alteração deve ser feita em {activeStep === 0 ? "Empresa" : "Catálogo"}.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                Escolha uma ação acima. O agente considera a etapa atual, o tenant, a base de conhecimento, o Kit da Marca e as mídias disponíveis.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="sticky bottom-3 z-20 flex items-center justify-between rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button variant="outline" type="button" onClick={() => goToStep(activeStep - 1)} disabled={activeStep === 0}>
          <ChevronLeft className="mr-2 h-4 w-4" />Anterior
        </Button>
        <div className="hidden text-xs text-muted-foreground sm:block">
          Etapa {activeStep + 1} de {wizardSteps.length} · {wizardSteps[activeStep].label}
        </div>
        {activeStep < wizardSteps.length - 1 ? (
          <Button type="button" onClick={() => goToStep(activeStep + 1)}>
            Próxima<ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={saveBrandContext} disabled={isSaving || !profile.data?.id}>
            <Save className="mr-2 h-4 w-4" />{isSaving ? "Salvando..." : "Concluir"}
          </Button>
        )}
      </div>
    </div>
  );
}
