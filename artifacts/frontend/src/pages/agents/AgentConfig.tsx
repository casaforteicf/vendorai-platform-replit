import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  UserSearch,
  Handshake,
  BarChart2,
  AlertCircle,
  Headphones,
  CalendarCheck,
  Star,
  Telescope,
  Loader2,
  Paperclip,
  Upload,
  X,
  FileText,
  type LucideIcon,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type AgentAttachment = {
  name: string;
  objectPath: string;
  mimeType: string;
  size?: number;
};

type AgentCardData = {
  agentKey: string;
  nome: string;
  descricao: string;
  categoria: string;
  ativo: boolean;
  nomePerfil: string | null;
  tom: string;
  restricoes: string | null;
  systemPromptBase: string;
  systemPromptCustom: string | null;
  parametros: Record<string, unknown> | null;
};

type TomOption = { value: string; label: string };
const TOM_OPTIONS: TomOption[] = [
  { value: "profissional", label: "Profissional" },
  { value: "amigavel",     label: "Amigável" },
  { value: "tecnico",      label: "Técnico" },
  { value: "vendedor",     label: "Vendedor" },
  { value: "neutro",       label: "Neutro" },
];

// ── Metadados estáticos por agentKey ──────────────────────────────────────────

const AGENT_META: Record<string, { icon: LucideIcon; descricaoFallback: string }> = {
  sdr:          { icon: UserSearch,    descricaoFallback: "Prospecção ativa e primeiro contato com novos leads" },
  closer:       { icon: Handshake,     descricaoFallback: "Fechamento de negócios e tratamento de objeções" },
  financeiro:   { icon: BarChart2,     descricaoFallback: "Suporte financeiro e esclarecimento de dúvidas" },
  cobranca:     { icon: AlertCircle,   descricaoFallback: "Acompanhamento de inadimplências e cobranças" },
  suporte:      { icon: Headphones,    descricaoFallback: "Atendimento pós-venda e resolução de problemas" },
  agendamento:  { icon: CalendarCheck, descricaoFallback: "Agendamento de reuniões e visitas comerciais" },
  pos_venda:    { icon: Star,          descricaoFallback: "Relacionamento e fidelização de clientes ativos" },
  prospector:   { icon: Telescope,     descricaoFallback: "Descoberta e captação de novos prospects" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function fetchAgentConfigs(): Promise<AgentCardData[]> {
  const res = await fetch("/api/agent-configs", { headers: authHeaders() });
  if (!res.ok) throw new Error(`Erro ao buscar agentes: ${res.status}`);
  return res.json();
}

async function toggleAgent(agentKey: string, activate: boolean) {
  const action = activate ? "activate" : "deactivate";
  const res = await fetch(`/api/agent-configs/${agentKey}/${action}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ao ${activate ? "ativar" : "desativar"} agente`);
  return res.json() as Promise<{ agentKey: string; ativo: boolean }>;
}

async function patchAgent(agentKey: string, body: Partial<AgentCardData>) {
  const res = await fetch(`/api/agent-configs/${agentKey}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erro ao salvar configuração: ${res.status}`);
  return res.json();
}

type TestResult = { resposta: string; tokensUsed: number; tom: string };

async function testAgent(agentKey: string, mensagem: string): Promise<TestResult> {
  const res = await fetch(`/api/agent-configs/${agentKey}/test`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ mensagem }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res.json();
}

async function resetAgentPrompt(agentKey: string) {
  const res = await fetch(`/api/agent-configs/${agentKey}/reset`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ao resetar prompt: ${res.status}`);
  return res.json();
}

// ── Skeleton de carregamento ───────────────────────────────────────────────────

function AgentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <Skeleton className="h-5 w-8 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </Card>
  );
}

// ── Card individual ────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onToggle,
  toggling,
  onConfigure,
}: {
  agent: AgentCardData;
  onToggle: (agentKey: string, activate: boolean) => void;
  toggling: boolean;
  onConfigure: (agent: AgentCardData) => void;
}) {
  const meta = AGENT_META[agent.agentKey];
  const Icon = meta?.icon ?? UserSearch;
  const descricao = agent.descricao || meta?.descricaoFallback || "";
  const nome = agent.nomePerfil || agent.nome;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{nome}</p>
            <p className="text-xs text-muted-foreground capitalize">{agent.categoria}</p>
          </div>
          <Badge
            variant={agent.ativo ? "default" : "secondary"}
            className={agent.ativo ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}
          >
            {agent.ativo ? "Ativo" : "Inativo"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-0">
        <p className="text-sm text-muted-foreground leading-snug">{descricao}</p>

        <div className="flex items-center justify-between">
          <Switch
            checked={agent.ativo}
            disabled={toggling}
            onCheckedChange={(checked) => onToggle(agent.agentKey, checked)}
            aria-label={`${agent.ativo ? "Desativar" : "Ativar"} agente ${nome}`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfigure(agent)}
          >
            Configurar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sheet de configuração ──────────────────────────────────────────────────────

function AgentConfigSheet({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentCardData;
  onClose: () => void;
  onSaved: (updated: Partial<AgentCardData>) => void;
}) {
  const { toast } = useToast();
  const meta = AGENT_META[agent.agentKey];
  const Icon = meta?.icon ?? UserSearch;

  // ── Form state ──
  const [nomePerfil, setNomePerfil]               = useState(agent.nomePerfil ?? "");
  const [tom, setTom]                             = useState(agent.tom ?? "profissional");
  const [restricoes, setRestricoes]               = useState(agent.restricoes ?? "");
  const [systemPromptCustom, setSystemPromptCustom] = useState(agent.systemPromptCustom ?? "");

  // ── Arquivos state ──
  const initAttachments = (): AgentAttachment[] => {
    const raw = agent.parametros?.["attachments"];
    return Array.isArray(raw) ? (raw as AgentAttachment[]) : [];
  };
  const [attachments, setAttachments] = useState<AgentAttachment[]>(initAttachments);
  const [uploading, setUploading]     = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("vendorai_token") ?? "";
      const presignRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType: file.type, isPublic: false }),
      });
      if (!presignRes.ok) throw new Error("Erro ao obter URL de upload");
      const { uploadUrl, objectPath } = await presignRes.json() as { uploadUrl: string; objectPath: string };

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Erro ao enviar arquivo");

      const newAttachment: AgentAttachment = { name: file.name, objectPath, mimeType: file.type, size: file.size };
      const next = [...attachments, newAttachment];
      setAttachments(next);

      await patchAgent(agent.agentKey, { parametros: { ...((agent.parametros ?? {}) as Record<string,unknown>), attachments: next } } as Partial<AgentCardData>);
      toast({ title: "Arquivo enviado", description: file.name });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Falha ao enviar arquivo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAttachment(idx: number) {
    const next = attachments.filter((_, i) => i !== idx);
    setAttachments(next);
    await patchAgent(agent.agentKey, { parametros: { ...((agent.parametros ?? {}) as Record<string,unknown>), attachments: next } } as Partial<AgentCardData>);
    toast({ title: "Arquivo removido" });
  }

  // ── Mutation salvar ──
  const saveMutation = useMutation({
    mutationFn: () =>
      patchAgent(agent.agentKey, {
        nomePerfil: nomePerfil || null,
        tom,
        restricoes: restricoes || null,
        systemPromptCustom: systemPromptCustom || null,
        parametros: { ...((agent.parametros ?? {}) as Record<string,unknown>), attachments },
      } as Partial<AgentCardData>),
    onSuccess: () => {
      toast({ title: "Configuração salva", description: "As alterações foram aplicadas ao agente." });
      onSaved({ nomePerfil: nomePerfil || null, tom, restricoes: restricoes || null, systemPromptCustom: systemPromptCustom || null });
      onClose();
    },
    onError: () => {
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar as configurações.", variant: "destructive" });
    },
  });

  // ── Aba Teste state ──
  const [testMessage, setTestMessage]   = useState("");
  const [testResult, setTestResult]     = useState<TestResult | null>(null);
  const [testError, setTestError]       = useState<string | null>(null);

  const testMutation = useMutation({
    mutationFn: () => testAgent(agent.agentKey, testMessage),
    onSuccess: (data) => {
      setTestResult(data);
      setTestError(null);
    },
    onError: (err) => {
      setTestError(err instanceof Error ? err.message : "Erro ao chamar o agente");
      setTestResult(null);
    },
  });

  function handleClearTest() {
    setTestMessage("");
    setTestResult(null);
    setTestError(null);
  }

  // ── Mutation reset ──
  const resetMutation = useMutation({
    mutationFn: () => resetAgentPrompt(agent.agentKey),
    onSuccess: () => {
      setSystemPromptCustom("");
      toast({ title: "Prompt resetado", description: "Voltou ao padrão Vendor.ai." });
    },
    onError: () => {
      toast({ title: "Erro ao resetar", description: "Não foi possível resetar o prompt.", variant: "destructive" });
    },
  });

  const nomePerfil_ = nomePerfil || agent.nome;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight truncate">{nomePerfil_}</SheetTitle>
              <p className="text-xs text-muted-foreground capitalize">{agent.categoria}</p>
            </div>
            <Badge
              variant={agent.ativo ? "default" : "secondary"}
              className={agent.ativo ? "bg-emerald-100 text-emerald-700 border-emerald-200" : ""}
            >
              {agent.ativo ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="perfil" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 mb-0 w-auto self-start">
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="arquivos">
              <Paperclip className="h-3.5 w-3.5 mr-1.5" />
              Arquivos
              {attachments.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                  {attachments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="teste">Teste</TabsTrigger>
          </TabsList>

          {/* ABA PERFIL */}
          <TabsContent value="perfil" className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="nomePerfil">Nome do perfil</Label>
              <Input
                id="nomePerfil"
                value={nomePerfil}
                onChange={(e) => setNomePerfil(e.target.value)}
                placeholder={agent.nome}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tom">Tom de comunicação</Label>
              <Select value={tom} onValueChange={setTom}>
                <SelectTrigger id="tom">
                  <SelectValue placeholder="Selecione o tom" />
                </SelectTrigger>
                <SelectContent>
                  {TOM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="restricoes">Restrições</Label>
              <Textarea
                id="restricoes"
                value={restricoes}
                onChange={(e) => setRestricoes(e.target.value)}
                placeholder="Ex: Nunca mencionar concorrentes. Não prometer prazos."
                rows={4}
              />
            </div>
          </TabsContent>

          {/* ABA PROMPT */}
          <TabsContent value="prompt" className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label>Prompt padrão Vendor.ai</Label>
              <Textarea
                value={agent.systemPromptBase}
                readOnly
                rows={6}
                className="bg-muted/50 text-muted-foreground resize-none cursor-default focus-visible:ring-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="systemPromptCustom">Sua personalização</Label>
              <Textarea
                id="systemPromptCustom"
                value={systemPromptCustom}
                onChange={(e) => setSystemPromptCustom(e.target.value)}
                placeholder="Deixe vazio para usar o padrão. Preencha para substituir."
                rows={8}
              />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={resetMutation.isPending}>
                  {resetMutation.isPending ? "Resetando…" : "Resetar para padrão"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar prompt personalizado?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso irá remover toda a personalização de prompt deste agente e voltar ao padrão Vendor.ai. Essa ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Confirmar reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ABA ARQUIVOS */}
          <TabsContent value="arquivos" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Arquivos do agente</p>
              <p className="text-xs text-muted-foreground">
                Estes arquivos serão enviados automaticamente pelo agente via WhatsApp após cada mensagem de texto.
              </p>
            </div>

            {/* Upload button */}
            <div>
              <Label
                htmlFor="file-upload"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium cursor-pointer transition-colors
                  ${uploading
                    ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                    : "bg-background hover:bg-accent text-foreground border-input"
                  }`}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
                ) : (
                  <><Upload className="h-4 w-4" />Adicionar arquivo</>
                )}
              </Label>
              <input
                id="file-upload"
                type="file"
                className="sr-only"
                disabled={uploading}
                onChange={handleFileUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mp3"
              />
            </div>

            {/* File list */}
            {attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-lg border border-dashed text-muted-foreground gap-2">
                <Paperclip className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhum arquivo adicionado</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {attachments.map((att, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.name}</p>
                      {att.size !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          {att.size < 1024 * 1024
                            ? `${(att.size / 1024).toFixed(1)} KB`
                            : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remover arquivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ABA TESTE */}
          <TabsContent value="teste" className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="testMessage">Mensagem de teste</Label>
              <Textarea
                id="testMessage"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Ex: Olá, vi o anúncio de vocês e queria mais informações"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !testMessage.trim()}
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testando…
                  </>
                ) : (
                  "Testar agente"
                )}
              </Button>
              <Button variant="outline" onClick={handleClearTest} disabled={testMutation.isPending}>
                Limpar
              </Button>
            </div>

            {testError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{testError}</AlertDescription>
              </Alert>
            )}

            {testResult && (
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="px-4 py-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{testResult.resposta}</p>
                </div>
                <div className="px-4 py-2 border-t bg-muted/40 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Tokens: {testResult.tokensUsed}
                  </span>
                  <Badge variant="secondary" className="text-xs capitalize">
                    Tom: {testResult.tom}
                  </Badge>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <SheetFooter className="px-6 py-4 border-t flex flex-row gap-2 justify-end">
          <SheetClose asChild>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </SheetClose>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function AgentConfig() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<AgentCardData | null>(null);
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());

  const QUERY_KEY = ["agent-configs", user?.tenantId];

  const { data: agents, isLoading, isError, error } = useQuery<AgentCardData[]>({
    queryKey: QUERY_KEY,
    queryFn: fetchAgentConfigs,
    enabled: !!user?.tenantId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ agentKey, activate }: { agentKey: string; activate: boolean }) =>
      toggleAgent(agentKey, activate),
    onMutate: async ({ agentKey, activate }) => {
      setTogglingKeys((prev) => new Set(prev).add(agentKey));
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<AgentCardData[]>(QUERY_KEY);
      queryClient.setQueryData<AgentCardData[]>(QUERY_KEY, (old) =>
        old?.map((a) => (a.agentKey === agentKey ? { ...a, ativo: activate } : a)) ?? []
      );
      return { prev };
    },
    onError: (_err, { agentKey }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({
        title: "Erro ao atualizar agente",
        description: "Não foi possível alterar o status. Tente novamente.",
        variant: "destructive",
      });
      setTogglingKeys((prev) => { const s = new Set(prev); s.delete(agentKey); return s; });
    },
    onSettled: (_data, _err, { agentKey }) => {
      setTogglingKeys((prev) => { const s = new Set(prev); s.delete(agentKey); return s; });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onSuccess: (_data, { activate }) => {
      toast({
        title: activate ? "Agente ativado" : "Agente desativado",
        description: activate
          ? "O agente está ativo e pode ser usado nas conversas."
          : "O agente foi desativado.",
      });
    },
  });

  function handleToggle(agentKey: string, activate: boolean) {
    toggleMutation.mutate({ agentKey, activate });
  }

  function handleConfigure(agent: AgentCardData) {
    setSelectedAgent(agent);
  }

  function handleSheetClose() {
    setSelectedAgent(null);
  }

  function handleSaved(agentKey: string, updated: Partial<AgentCardData>) {
    queryClient.setQueryData<AgentCardData[]>(QUERY_KEY, (old) =>
      old?.map((a) => (a.agentKey === agentKey ? { ...a, ...updated } : a)) ?? []
    );
    setSelectedAgent(null);
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agentes de IA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie e configure os agentes de inteligência artificial disponíveis para o seu time.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Erro ao carregar agentes. Tente recarregar a página."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <AgentCardSkeleton key={i} />)
          : (agents ?? []).map((agent) => (
              <AgentCard
                key={agent.agentKey}
                agent={agent}
                onToggle={handleToggle}
                toggling={togglingKeys.has(agent.agentKey)}
                onConfigure={handleConfigure}
              />
            ))}
      </div>

      {selectedAgent && (
        <AgentConfigSheet
          agent={selectedAgent}
          onClose={handleSheetClose}
          onSaved={(updated) => handleSaved(selectedAgent.agentKey, updated)}
        />
      )}
    </div>
  );
}
