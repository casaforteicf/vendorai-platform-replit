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
import { Save, Palette, ImageIcon, Building2, Megaphone, Brain, Library, ExternalLink, Sparkles, Loader2 } from "lucide-react";

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
    setPrimaryColor(tenant.data?.corPrimaria || "#A78BFA");
  }, [tenant.data?.corPrimaria]);

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


  const buildWithAI = async () => {
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
        body: JSON.stringify({ mode: aiMode }),
      });
      const payload = await response.json().catch(() => ({})) as { proposal?: BrandStudioProposal; error?: string };
      if (!response.ok || !payload.proposal) throw new Error(payload.error || "Não foi possível montar o Kit da Marca com IA.");

      const proposal = payload.proposal;
      setAiProposal(proposal);

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
        posicionamento: proposal.positioning || current.posicionamento,
        tomVoz: (proposal.toneOfVoice ?? []).join(", ") || current.tomVoz,
        mensagensChave: messages ? `• ${messages}` : current.mensagensChave,
        estiloVisual: style || current.estiloVisual,
        tipografia: typography || current.tipografia,
        coresSecundarias: palette || current.coresSecundarias,
        palavrasEvitar: avoid || current.palavrasEvitar,
        referenciasVisuais: references || current.referenciasVisuais,
      }));

      const firstPaletteHex = (proposal.palette ?? [])
        .map((item) => item.hex?.trim())
        .find((hex) => /^#[0-9A-Fa-f]{6}$/.test(hex || ""));
      if (firstPaletteHex && (!tenant.data?.corPrimaria || tenant.data.corPrimaria === "#A78BFA")) {
        setPrimaryColor(firstPaletteHex);
      }

      toast({ title: "A IA montou uma proposta de marca. Revise os campos antes de salvar." });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Falha ao montar o Kit da Marca com IA.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-xl font-semibold">Identidade da marca</h2>
          <p className="mt-1 text-sm text-muted-foreground">Marca e identidade visual permanecem aqui; estratégia, PN e diagnóstico têm uma única fonte oficial.</p>
        </div>
        <Button variant="outline" onClick={() => window.location.assign("/diagnostico-planejamento")}>
          Abrir Diagnóstico & Planejamento
        </Button>
      </div>
      <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Kit da Marca</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Fonte única da identidade do tenant. Marketing, vídeos, anúncios, sites, documentos e agentes devem consumir este contexto.
            </p>
          </div>
          <Badge variant="secondary">{completeness}% completo</Badge>
        </div>
        <Progress value={completeness} />

        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <strong className="text-sm">Assistente de Marca com IA</strong>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                A IA lê dados da empresa, conhecimento, mídias e identidade atual para montar uma proposta completa. Nada é salvo sem sua revisão.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={aiMode}
                onChange={(event) => setAiMode(event.target.value as BrandStudioMode)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                aria-label="Modo da IA para o Kit da Marca"
              >
                <option value="maintain">Manter identidade</option>
                <option value="evolve">Evoluir identidade</option>
                <option value="rebuild">Reconstruir identidade</option>
              </select>
              <Button type="button" onClick={buildWithAI} disabled={aiLoading || !tenantId} className="gap-2">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiLoading ? "Analisando marca..." : "Montar com IA"}
              </Button>
            </div>
          </div>
          {aiProposal && (
            <div className="mt-3 grid gap-2 rounded-lg border bg-background/70 p-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold">Diagnóstico da IA</p>
                <p className="mt-1 text-xs text-muted-foreground">{aiProposal.diagnosis || "Proposta criada com base no contexto disponível."}</p>
              </div>
              <div>
                <p className="text-xs font-semibold">Direção recomendada</p>
                <p className="mt-1 text-xs text-muted-foreground">{aiProposal.rationale || "Revise os campos preenchidos abaixo antes de salvar."}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded-lg border p-3"><strong className="text-sm">Empresa</strong><p className="text-xs text-muted-foreground">business_profiles</p></div>
          <div className="rounded-lg border p-3"><strong className="text-sm">Identidade</strong><p className="text-xs text-muted-foreground">logo + cores do tenant</p></div>
          <div className="rounded-lg border p-3"><strong className="text-sm">Vídeo</strong><p className="text-xs text-muted-foreground">{videoKit ? "Brand Video Kit conectado" : "Sem kit de vídeo ativo"}</p></div>
          <div className="rounded-lg border p-3">
            <strong className="text-sm">Propostas</strong>
            <p className="text-xs text-muted-foreground">
              {activeProposalBuilderTemplate
                ? `Modelo inteligente ativo: ${String(activeProposalBuilderTemplate.name || "Modelo padrão")}`
                : "O modelo inteligente será criado automaticamente ao salvar o Kit da Marca."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h3 className="font-semibold">Dados oficiais da empresa</h3></div>
        <p className="text-xs text-muted-foreground">Estes dados vêm do mesmo Perfil da Empresa; não existe uma segunda cópia no Marketing.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Empresa</Label><Input value={profile.data?.nomeFantasia || profile.data?.razaoSocial || ""} readOnly /></div>
          <div><Label>Segmento</Label><Input value={profile.data?.vertical || ""} readOnly /></div>
          <div className="md:col-span-2"><Label>Diferenciais</Label><Textarea value={profile.data?.diferenciais || ""} readOnly rows={2} /></div>
          <div className="md:col-span-2"><Label>Público-alvo</Label><Textarea value={profile.data?.publicoAlvo || ""} readOnly rows={2} /></div>
        </div>
        <Button variant="outline" type="button" onClick={() => window.location.assign("/configuracoes?tab=perfil")}>
          Editar dados institucionais <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /><h3 className="font-semibold">Identidade visual</h3></div>
        <div className="grid gap-4 md:grid-cols-2">
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
              {(profile.data?.logoUrl || tenant.data?.logoUrl) ? "Logo cadastrada e compartilhada com as ferramentas." : "Nenhuma logo cadastrada."}
            </div>
          </div>
          {field("Cores secundárias", "coresSecundarias", "Ex.: #111827, #F97316, branco e cinza claro", 2)}
          {field("Tipografia", "tipografia", "Ex.: Inter para interface; Montserrat para títulos", 2)}
          <div className="md:col-span-2">{field("Estilo visual", "estiloVisual", "Descreva fotografia, iluminação, composição, cenários, acabamentos e o que deve ser evitado.")}</div>
          <div className="md:col-span-2">{field("Referências visuais", "referenciasVisuais", "Links, projetos de referência, padrões aprovados e orientações para imagens e vídeos.")}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /><h3 className="font-semibold">Comunicação da marca</h3></div>
        <div className="grid gap-4 md:grid-cols-2">
          {field("Posicionamento", "posicionamento", "Como a marca deve ser percebida e qual proposta de valor deve sustentar.")}
          {field("Tom de voz", "tomVoz", "Ex.: consultivo, claro, técnico sem ser complicado, direto e humano.")}
          {field("Mensagens-chave", "mensagensChave", "Mensagens que devem aparecer com frequência nos materiais.")}
          {field("CTA padrão", "ctaPadrao", "Ex.: Solicite uma análise / Fale com nossa equipe.", 2)}
          <div className="md:col-span-2">{field("Palavras e abordagens a evitar", "palavrasEvitar", "Termos proibidos, promessas que não podem ser feitas e estilos de comunicação inadequados.")}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Modelo inteligente de proposta</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          O VendorAI cria automaticamente um modelo modular a partir do segmento, diferenciais, público-alvo e Kit da Marca. A proposta usa esse padrão sem exigir uma configuração inicial separada.
        </p>
        {activeProposalBuilderTemplate ? (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{String(activeProposalBuilderTemplate.name || "Modelo padrão")}</p>
                <p className="text-xs text-muted-foreground">
                  {proposalBuilderTemplates.length} versão(ões) · modelo ativo do tenant
                </p>
              </div>
              <Badge variant="secondary">Pronto</Badge>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Ao salvar o Kit da Marca, o sistema prepara automaticamente o primeiro modelo de proposta. Se a IA estiver indisponível, um padrão seguro do segmento é aplicado para não bloquear o uso.
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2"><Library className="h-4 w-4 text-primary" /><h3 className="font-semibold">Mídia e conhecimento</h3></div>
        <p className="text-sm text-muted-foreground">
          Fotos, vídeos, catálogos e documentos permanecem nas bibliotecas oficiais do tenant. O Kit da Marca referencia essas fontes em vez de duplicar arquivos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" onClick={() => window.location.assign("/content")}>Abrir Conteúdo</Button>
          <Button variant="outline" type="button" onClick={() => window.location.assign("/base-conhecimento")}>Abrir Conhecimento</Button>
          <Button variant="outline" type="button" onClick={() => window.location.assign("/content-studio/video")}><ImageIcon className="mr-2 h-4 w-4" />Abrir Vídeo</Button>
        </div>
      </div>

      <div className="sticky bottom-3 z-20 flex justify-end rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button type="button" onClick={saveBrandContext} disabled={updateProfile.isPending || updateTenant.isPending || !profile.data?.id}>
          <Save className="mr-2 h-4 w-4" />{updateProfile.isPending || updateTenant.isPending ? "Salvando..." : "Salvar Kit da Marca"}
        </Button>
      </div>
      </div>
    </div>
  );
}

