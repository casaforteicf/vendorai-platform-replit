import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListTenants } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Bug, MessageSquare, Lightbulb, Loader2, Copy, Check,
  AlertTriangle, Clock, CheckCircle2, Search, RefreshCw, WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BugReport {
  id: string;
  tenantId: string;
  tenantName: string | null;
  conversationId: string | null;
  resolvidoPor: "agente" | "humano" | "dev_ia" | null;
  titulo: string;
  descricao: string;
  categoria: "bug" | "duvida" | "sugestao";
  status: "aberto" | "em_analise" | "resolvido";
  prioridade: "baixa" | "media" | "alta" | "critica";
  rotaAfetada: string | null;
  erroTecnico: string | null;
  stackTrace: string | null;
  respostaSuporte: string | null;
  resolvidoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PRIORIDADE_CONFIG = {
  critica: { label: "Crítica",  className: "bg-red-100 text-red-700 border-red-200" },
  alta:    { label: "Alta",     className: "bg-orange-100 text-orange-700 border-orange-200" },
  media:   { label: "Média",    className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  baixa:   { label: "Baixa",   className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const STATUS_CONFIG = {
  aberto:     { label: "Aberto",      className: "bg-red-50 text-red-600 border-red-200",     icon: AlertTriangle },
  em_analise: { label: "Em análise",  className: "bg-blue-50 text-blue-600 border-blue-200",  icon: Clock },
  resolvido:  { label: "Resolvido",   className: "bg-green-50 text-green-600 border-green-200", icon: CheckCircle2 },
};

const CATEGORIA_CONFIG = {
  bug:      { label: "Bug",      icon: Bug },
  duvida:   { label: "Dúvida",   icon: MessageSquare },
  sugestao: { label: "Sugestão", icon: Lightbulb },
};

function buildReplitReport(bug: BugReport): string {
  const protocolo = `#${bug.id.substring(0, 8).toUpperCase()}`;
  const lines: string[] = [
    `# Bug Report — ${protocolo}`,
    `**Tenant:** ${bug.tenantName ?? bug.tenantId}`,
    `**Título:** ${bug.titulo}`,
    `**Categoria:** ${CATEGORIA_CONFIG[bug.categoria].label}`,
    `**Prioridade:** ${PRIORIDADE_CONFIG[bug.prioridade].label}`,
    `**Status:** ${STATUS_CONFIG[bug.status].label}`,
    `**Criado em:** ${format(new Date(bug.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    ``,
    `## Descrição do Problema`,
    bug.descricao,
  ];

  if (bug.rotaAfetada) {
    lines.push(``, `## Rota / Tela Afetada`, bug.rotaAfetada);
  }
  if (bug.erroTecnico) {
    lines.push(``, `## Mensagem de Erro`, `\`\`\``, bug.erroTecnico, `\`\`\``);
  }
  if (bug.stackTrace) {
    lines.push(``, `## Stack Trace`, `\`\`\``, bug.stackTrace, `\`\`\``);
  }
  if (bug.respostaSuporte) {
    lines.push(``, `## Resposta do Suporte`, bug.respostaSuporte);
  }

  return lines.join("\n");
}

function useAdminApiFetch<T>(url: string, token: string | null) {
  return useQuery<T>({
    queryKey: ["admin", url],
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await fetch(`/api${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<T>;
    },
  });
}

export default function SupportAdmin() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterStatus, setFilterStatus]     = useState("all");
  const [filterPrio, setFilterPrio]         = useState("all");
  const [filterCat, setFilterCat]           = useState("all");
  const [filterTenant, setFilterTenant]     = useState("all");
  const [filterStart, setFilterStart]       = useState("");
  const [filterEnd, setFilterEnd]           = useState("");
  const [search, setSearch]                 = useState("");

  const [selected, setSelected]             = useState<BugReport | null>(null);
  const [resposta, setResposta]             = useState("");
  const [copied, setCopied]                 = useState(false);

  const { data: tenants = [] } = useListTenants();

  const buildUrl = useCallback(() => {
    const p = new URLSearchParams();
    if (filterStatus !== "all") p.set("status", filterStatus);
    if (filterPrio !== "all") p.set("prioridade", filterPrio);
    if (filterCat !== "all") p.set("categoria", filterCat);
    if (filterTenant !== "all") p.set("tenantId", filterTenant);
    if (filterStart) p.set("startDate", filterStart);
    if (filterEnd) p.set("endDate", filterEnd);
    const qs = p.toString();
    return `/admin/bug-reports${qs ? `?${qs}` : ""}`;
  }, [filterStatus, filterPrio, filterCat, filterTenant, filterStart, filterEnd]);

  const { data: bugs = [], isLoading, refetch } = useAdminApiFetch<BugReport[]>(buildUrl(), token);

  const filtered = search
    ? bugs.filter((b) =>
        b.titulo.toLowerCase().includes(search.toLowerCase()) ||
        (b.tenantName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : bugs;

  const patch = useMutation({
    mutationFn: async ({ id, status, respostaSuporte }: { id: string; status: string; respostaSuporte?: string }) => {
      const r = await fetch(`/api/admin/bug-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, respostaSuporte }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<BugReport>;
    },
    onSuccess: (updated, vars) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setSelected((s) => (s?.id === updated.id ? updated : s));
      toast({
        title: vars.status === "resolvido" ? "Chamado resolvido!" : "Status atualizado",
        description: vars.status === "resolvido"
          ? "Notificação WhatsApp enviada ao tenant (se configurado)."
          : "Status atualizado para Em Análise.",
      });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" }),
  });

  const createImprovement = useMutation({
    mutationFn: async (bug: BugReport) => {
      const r = await fetch("/api/admin/improvements/from-support/" + bug.id, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? "Não foi possível gerar a demanda.");
      return body;
    },
    onSuccess: async (body) => {
      qc.invalidateQueries({ queryKey: ["admin", "improvements"] });
      if (body?.created && body?.improvement?.id) {
        const response = await fetch("/api/admin/improvements/" + body.improvement.id + "/start-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        });
        if (!response.ok) {
          toast({
            title: "Demanda criada",
            description: "A melhoria entrou na fila, mas o Vendi não conseguiu iniciar imediatamente. Ela poderá ser retomada pela Central de Melhorias.",
          });
          return;
        }
      }
      toast({
        title: body?.created ? "Demanda criada e Vendi iniciado" : "Chamado vinculado à melhoria existente",
        description: "Desenvolvimento, testes e publicação seguem pelo fluxo controlado de Melhorias & Publicações.",
      });
    },
    onError: (error) => toast({
      title: "Erro ao gerar demanda",
      description: error instanceof Error ? error.message : "Não foi possível gerar a melhoria.",
      variant: "destructive",
    }),
  });

  function handleCopy() {
    if (!selected) return;
    navigator.clipboard.writeText(buildReplitReport(selected));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const openCount = bugs.filter((b) => b.status === "aberto").length;
  const agentResolvedCount = bugs.filter((b) => b.status === "resolvido" && b.resolvidoPor === "agente").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-primary" />
            Suporte do Sistema
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount} chamado{openCount !== 1 ? "s" : ""} aberto{openCount !== 1 ? "s" : ""}
            {bugs.length > 0 && ` · ${agentResolvedCount} resolvido${agentResolvedCount !== 1 ? "s" : ""} pelo agente · ${bugs.length} total`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título ou tenant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="em_analise">Em análise</SelectItem>
                <SelectItem value="resolvido">Resolvido</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPrio} onValueChange={setFilterPrio}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="duvida">Dúvida</SelectItem>
                <SelectItem value="sugestao">Sugestão</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterTenant} onValueChange={setFilterTenant}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Tenant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tenants</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              className="h-9 text-sm"
              title="Data inicial"
            />
            <Input
              type="date"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              className="h-9 text-sm"
              title="Data final"
            />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Bug className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhum chamado encontrado</p>
          <p className="text-sm mt-1">Ajuste os filtros ou aguarde novos relatos.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((bug) => {
            const CatIcon = CATEGORIA_CONFIG[bug.categoria].icon;
            const StatusIcon = STATUS_CONFIG[bug.status].icon;
            return (
              <Card
                key={bug.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md hover:border-primary/30",
                  bug.status === "aberto" && bug.prioridade === "critica" && "border-red-300"
                )}
                onClick={() => { setSelected(bug); setResposta(bug.respostaSuporte ?? ""); }}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 text-muted-foreground shrink-0">
                      <CatIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">{bug.titulo}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          #{bug.id.substring(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{bug.descricao}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", STATUS_CONFIG[bug.status].className)}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {STATUS_CONFIG[bug.status].label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", PRIORIDADE_CONFIG[bug.prioridade].className)}>
                          {PRIORIDADE_CONFIG[bug.prioridade].label}
                        </Badge>
                        {bug.status === "resolvido" && (
                          <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
                            {bug.resolvidoPor === "agente" ? "Resolvido pelo agente" : "Resolvido pela equipe"}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
                          {bug.tenantName ?? bug.tenantId.substring(0, 8)}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {format(new Date(bug.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {(() => { const I = CATEGORIA_CONFIG[selected.categoria].icon; return <I className="h-4 w-4 text-muted-foreground" />; })()}
                  {selected.titulo}
                  <span className="text-xs font-mono text-muted-foreground ml-1">
                    #{selected.id.substring(0, 8).toUpperCase()}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Meta */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("text-xs", STATUS_CONFIG[selected.status].className)}>
                    {STATUS_CONFIG[selected.status].label}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs", PRIORIDADE_CONFIG[selected.prioridade].className)}>
                    {PRIORIDADE_CONFIG[selected.prioridade].label}
                  </Badge>
                  {selected.status === "resolvido" && (
                    <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
                      {selected.resolvidoPor === "agente" ? "Resolvido pelo agente" : "Resolvido pela equipe"}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {selected.tenantName ?? selected.tenantId}
                  </Badge>
                  <span className="text-xs text-muted-foreground self-center">
                    {format(new Date(selected.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>

                {/* Descrição */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{selected.descricao}</p>
                </div>

                {selected.rotaAfetada && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Tela / Rota</p>
                    <code className="text-sm bg-muted/40 rounded px-2 py-1">{selected.rotaAfetada}</code>
                  </div>
                )}

                {selected.erroTecnico && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Mensagem de Erro</p>
                    <pre className="text-xs bg-red-50 border border-red-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                      {selected.erroTecnico}
                    </pre>
                  </div>
                )}

                {selected.stackTrace && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Stack Trace</p>
                    <pre className="text-xs bg-slate-950 text-slate-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-40">
                      {selected.stackTrace}
                    </pre>
                  </div>
                )}

                {/* Relatório para Replit */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Relatório para Replit Agent
                    </p>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopy}>
                      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </Button>
                  </div>
                  <pre className="text-xs bg-muted/40 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-52 font-mono">
                    {buildReplitReport(selected)}
                  </pre>
                </div>

                {/* Resposta do suporte */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Resposta ao Usuário (opcional — enviada via WhatsApp)
                  </p>
                  <Textarea
                    placeholder="Descreva o que foi feito ou como o usuário pode resolver..."
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>

                {/* Ações */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.categoria !== "duvida" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={createImprovement.isPending}
                      onClick={() => createImprovement.mutate(selected)}
                    >
                      {createImprovement.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                      Gerar demanda de melhoria
                    </Button>
                  )}
                  {selected.status !== "em_analise" && selected.status !== "resolvido" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={patch.isPending}
                      onClick={() => patch.mutate({ id: selected.id, status: "em_analise", respostaSuporte: resposta || undefined })}
                    >
                      {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 text-blue-600" />}
                      Marcar em análise
                    </Button>
                  )}
                  {selected.status !== "resolvido" && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={patch.isPending}
                      onClick={() => patch.mutate({ id: selected.id, status: "resolvido", respostaSuporte: resposta || undefined })}
                    >
                      {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Marcar resolvido
                    </Button>
                  )}
                  {selected.status === "resolvido" && (
                    <div className="flex items-center gap-1.5 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {selected.resolvidoPor === "agente" ? "Resolvido pelo agente em " : "Resolvido pela equipe em "}{selected.resolvidoAt ? format(new Date(selected.resolvidoAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
