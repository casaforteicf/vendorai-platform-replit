import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, BookOpen, Bot, Loader2, Plus, Upload, FileText, Trash2, Pencil, Search } from "lucide-react";

function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}` };
}
function authHeadersJson() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

interface KnowledgeEntry {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  tags: string[];
  ativo: boolean;
  createdAt: string;
}

interface AgentAssignment {
  agentKey: string;
  nome: string;
  nomePerfil: string | null;
  ativo: boolean;
  knowledgeBaseIds?: string[] | null;
}

interface EditForm {
  id: string | null;
  titulo: string;
  conteudo: string;
  categoria: string;
  tags: string;
}
const EMPTY_EDIT: EditForm = { id: null, titulo: "", conteudo: "", categoria: "", tags: "" };

export default function KnowledgeBase() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ ...EMPTY_EDIT });
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeEntry | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<KnowledgeEntry | null>(null);
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<string[]>([]);
  const [savingAgents, setSavingAgents] = useState(false);

  const QK = ["knowledge-base", tenantId];
  const AGENTS_QK = ["agent-configs", tenantId];

  const { data: entries = [], isLoading } = useQuery<KnowledgeEntry[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/knowledge-base`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery<AgentAssignment[]>({
    queryKey: AGENTS_QK,
    queryFn: async () => {
      const res = await fetch("/api/agent-configs", { headers: authHeaders() });
      if (!res.ok) throw new Error(`Erro ao buscar agentes: ${res.status}`);
      return res.json();
    },
    enabled: !!tenantId,
  });

  const entryKey = (entry: KnowledgeEntry) =>
    `${entry.categoria.trim().toLowerCase()}::${entry.titulo.trim().toLowerCase()}`;
  const keyCounts = entries.reduce((counts, entry) => {
    const key = entryKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const duplicateKeys = new Set(
    Array.from(keyCounts.entries()).filter(([, count]) => count > 1).map(([key]) => key),
  );

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.titulo.toLowerCase().includes(q) || e.categoria.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q));
  });

  function agentName(agent: AgentAssignment) {
    return agent.nomePerfil?.trim() || agent.nome || agent.agentKey;
  }

  function openAgentAssignment(entry: KnowledgeEntry) {
    setAssignmentTarget(entry);
    setSelectedAgentKeys(
      agents
        .filter((agent) => Array.isArray(agent.knowledgeBaseIds) && agent.knowledgeBaseIds.includes(entry.id))
        .map((agent) => agent.agentKey),
    );
  }

  function toggleAgentSelection(agentKey: string, checked: boolean) {
    setSelectedAgentKeys((current) =>
      checked
        ? Array.from(new Set([...current, agentKey]))
        : current.filter((key) => key !== agentKey),
    );
  }

  async function saveAgentAssignments() {
    if (!assignmentTarget) return;
    setSavingAgents(true);
    try {
      const selected = new Set(selectedAgentKeys);
      const entryId = assignmentTarget.id;
      const updates = agents.flatMap((agent) => {
        const currentIds = Array.isArray(agent.knowledgeBaseIds) ? agent.knowledgeBaseIds : [];
        const alreadyUses = currentIds.includes(entryId);
        const shouldUse = selected.has(agent.agentKey);
        if (alreadyUses === shouldUse) return [];

        const nextIds = shouldUse
          ? Array.from(new Set([...currentIds, entryId]))
          : currentIds.filter((id) => id !== entryId);

        return [
          fetch(`/api/agent-configs/${agent.agentKey}`, {
            method: "PATCH",
            headers: authHeadersJson(),
            body: JSON.stringify({ knowledgeBaseIds: nextIds }),
          }).then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? `Erro ao atualizar ${agentName(agent)}`);
            }
            return res.json();
          }),
        ];
      });

      await Promise.all(updates);
      await qc.invalidateQueries({ queryKey: AGENTS_QK });
      toast({
        title: "Acesso dos agentes atualizado",
        description: selectedAgentKeys.length === 0
          ? "Nenhum agente está usando esta informação."
          : `${selectedAgentKeys.length} agente${selectedAgentKeys.length === 1 ? "" : "s"} pode${selectedAgentKeys.length === 1 ? "" : "m"} usar esta informação.`,
      });
      setAssignmentTarget(null);
    } catch (err) {
      toast({
        title: "Erro ao atualizar agentes",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingAgents(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/tenants/${tenantId}/knowledge-base/upload`, {
        method: "POST",
        headers: authHeaders(),
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao processar arquivo");
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Documento adicionado!", description: `"${data.titulo}" foi adicionado. Agora escolha aqui quais agentes podem usar esse conteúdo.` });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        titulo: editForm.titulo.trim(),
        conteudo: editForm.conteudo.trim(),
        categoria: editForm.categoria.trim() || "Geral",
        tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const url = editForm.id ? `/api/knowledge-base/${editForm.id}` : "/api/knowledge-base";
      const res = await fetch(url, {
        method: editForm.id ? "PATCH" : "POST",
        headers: authHeadersJson(),
        body: JSON.stringify(editForm.id ? payload : { ...payload, tenantId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erro ao salvar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: editForm.id ? "Atualizado!" : "Adicionado!" });
      setEditOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/knowledge-base/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível remover o item da base de conhecimento.");
      return response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: AGENTS_QK });
      toast({ title: "Removido" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Base de Conhecimento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione catálogos, tabelas de preço e materiais uma vez e defina aqui mesmo quais agentes podem usar cada informação.
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,image/*" className="hidden" onChange={handleFileSelected} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploading ? "Processando…" : "Enviar arquivo"}
          </Button>
          <Button onClick={() => { setEditForm({ ...EMPTY_EDIT }); setEditOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar texto
          </Button>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por título, categoria ou tag…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {entries.length === 0 ? "Nenhum documento na base de conhecimento ainda." : "Nada encontrado pra essa busca."}
          </p>
          {entries.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Envie um catálogo em PDF/DOCX ou adicione texto direto — depois escolha os agentes que podem usar cada conteúdo.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((entry) => {
            const assignedAgents = agents.filter(
              (agent) => Array.isArray(agent.knowledgeBaseIds) && agent.knowledgeBaseIds.includes(entry.id),
            );

            return (
              <Card key={entry.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="font-semibold text-sm truncate">{entry.titulo}</p>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar"
                        onClick={() => { setEditForm({ id: entry.id, titulo: entry.titulo, conteudo: entry.conteudo, categoria: entry.categoria, tags: entry.tags.join(", ") }); setEditOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Remover"
                        onClick={() => setDeleteTarget(entry)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Badge variant="outline" className="text-xs">{entry.categoria}</Badge>
                    {duplicateKeys.has(entryKey(entry)) && (
                      <Badge variant="destructive" className="text-xs gap-1" title="Há outro conteúdo com o mesmo título e categoria">
                        <AlertTriangle className="h-3 w-3" /> Possível duplicado
                      </Badge>
                    )}
                    {entry.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{entry.conteudo}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Criado em {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
                  </p>

                  <div className="mt-3 pt-3 border-t flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Agentes com acesso</p>
                      <div className="flex flex-wrap gap-1.5">
                        {agentsLoading ? (
                          <Skeleton className="h-5 w-24" />
                        ) : assignedAgents.length > 0 ? (
                          assignedAgents.map((agent) => (
                            <Badge key={agent.agentKey} variant="secondary" className="text-[11px]">
                              {agentName(agent)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Nenhum agente selecionado</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={agentsLoading}
                      onClick={() => openAgentAssignment(entry)}
                    >
                      <Bot className="h-3.5 w-3.5 mr-1.5" /> Selecionar agentes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Seleção dos agentes que podem usar a entrada */}
      <Dialog
        open={!!assignmentTarget}
        onOpenChange={(open) => {
          if (!open && !savingAgents) setAssignmentTarget(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Selecionar agentes</DialogTitle>
            <DialogDescription>
              Defina quais agentes podem usar “{assignmentTarget?.titulo}”. A mesma seleção continua sincronizada na configuração individual de cada agente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Agentes disponíveis</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={agentsLoading || savingAgents || agents.length === 0}
                  onClick={() => setSelectedAgentKeys(agents.map((agent) => agent.agentKey))}
                >
                  Selecionar todos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={savingAgents || selectedAgentKeys.length === 0}
                  onClick={() => setSelectedAgentKeys([])}
                >
                  Limpar
                </Button>
              </div>
            </div>

            <div className="border rounded-lg divide-y">
              {agentsLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : agents.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum agente disponível para este tenant.</p>
              ) : (
                agents.map((agent) => {
                  const checked = selectedAgentKeys.includes(agent.agentKey);
                  return (
                    <label
                      key={agent.agentKey}
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={savingAgents}
                        onCheckedChange={(value) => toggleAgentSelection(agent.agentKey, value === true)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{agentName(agent)}</p>
                        <p className="text-xs text-muted-foreground">{agent.agentKey}</p>
                      </div>
                      <Badge variant={agent.ativo ? "default" : "secondary"} className="text-[11px]">
                        {agent.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {selectedAgentKeys.length} selecionado{selectedAgentKeys.length === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={savingAgents} onClick={() => setAssignmentTarget(null)}>
                  Cancelar
                </Button>
                <Button type="button" disabled={savingAgents || agentsLoading} onClick={saveAgentAssignments}>
                  {savingAgents && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar acesso
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog criar/editar */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editForm.id ? "Editar entrada" : "Adicionar texto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input placeholder="Ex: Tabela de preços 2026" value={editForm.titulo}
                onChange={(e) => setEditForm((f) => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input placeholder="Ex: Preços, Institucional, Políticas…" value={editForm.categoria}
                onChange={(e) => setEditForm((f) => ({ ...f, categoria: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (separadas por vírgula)</Label>
              <Input placeholder="Ex: seguros, corporativo, renovação" value={editForm.tags}
                onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo <span className="text-destructive">*</span></Label>
              <Textarea rows={10} placeholder="Cole aqui o texto que os agentes devem conhecer…" value={editForm.conteudo}
                onChange={(e) => setEditForm((f) => ({ ...f, conteudo: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button
                disabled={saveMutation.isPending || !editForm.titulo.trim() || !editForm.conteudo.trim()}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de remoção */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{deleteTarget?.titulo}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa entrada deixa de estar disponível pros agentes que a usavam. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}