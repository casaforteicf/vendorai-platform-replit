import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Bell, Plus, Loader2, Send, Trash2, Pencil, Sparkles, Wrench, Bug } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Entry {
  id: string;
  titulo: string;
  descricao: string;
  tipo: "novidade" | "melhoria" | "correcao";
  publicadoEm: string | null;
  createdAt: string;
  automatico?: boolean;
}

const TIPO_OPTS = [
  { value: "novidade", label: "Novidade", icon: Sparkles, className: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "melhoria", label: "Melhoria", icon: Wrench, className: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "correcao", label: "Correção", icon: Bug, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

interface FormState { id: string | null; titulo: string; descricao: string; tipo: string }
const EMPTY_FORM: FormState = { id: null, titulo: "", descricao: "", tipo: "novidade" };

export default function AdminChangelog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  const { data: entries = [], isLoading } = useQuery<Entry[]>({
    queryKey: ["admin-changelog"],
    queryFn: () => fetch("/api/admin/changelog", { headers: authHeaders() }).then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { titulo: form.titulo.trim(), descricao: form.descricao.trim(), tipo: form.tipo };
      const url = form.id ? `/api/admin/changelog/${form.id}` : "/api/admin/changelog";
      const res = await fetch(url, { method: form.id ? "PATCH" : "POST", headers: authHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erro ao salvar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-changelog"] });
      toast({ title: form.id ? "Atualizado!" : "Rascunho criado!" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const publicarMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/changelog/${id}/publicar`, { method: "POST", headers: authHeaders() });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Não foi possível publicar a novidade."); }
      return response;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-changelog"] });
      toast({ title: "Publicado! Já aparece pros tenants." });
    },
    onError: (error: Error) => toast({ title: "Erro ao publicar", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/changelog/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Não foi possível remover a novidade."); }
      return response;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-changelog"] }); toast({ title: "Removido" }); },
    onError: (error: Error) => toast({ title: "Erro ao remover", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-5 w-5" /> Novidades</h1>
          <p className="text-sm text-muted-foreground mt-1">Toda entrega é registrada automaticamente. Use a criação manual apenas para comunicados especiais.</p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova entrada
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : entries.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground">Nenhuma entrada ainda.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const cfg = TIPO_OPTS.find((t) => t.value === e.tipo) ?? TIPO_OPTS[0]!;
            const Icon = cfg.icon;
            return (
              <Card key={e.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={`text-xs flex items-center gap-1 ${cfg.className}`}>
                          <Icon className="h-3 w-3" /> {cfg.label}
                        </Badge>
                        {e.automatico && (
                          <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">Automático</Badge>
                        )}
                        {e.publicadoEm ? (
                          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
                            Publicado {format(new Date(e.publicadoEm), "dd/MM/yyyy", { locale: ptBR })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Rascunho</Badge>
                        )}
                      </div>
                      <p className="font-semibold text-sm">{e.titulo}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-0.5">{e.descricao}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!e.automatico && !e.publicadoEm && (
                        <Button size="sm" variant="outline" onClick={() => publicarMutation.mutate(e.id)} disabled={publicarMutation.isPending}>
                          <Send className="h-3.5 w-3.5 mr-1.5" /> Publicar
                        </Button>
                      )}
                      {!e.automatico && (
                        <>
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => { setForm({ id: e.id, titulo: e.titulo, descricao: e.descricao, tipo: e.tipo }); setOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive" disabled={deleteMutation.isPending || publicarMutation.isPending} onClick={() => { if (!deleteMutation.isPending) deleteMutation.mutate(e.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar entrada" : "Nova entrada"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input placeholder="Ex: Rastreio público de entregas" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={5} placeholder="Explica em linguagem simples o que mudou pro tenant..." value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button disabled={saveMutation.isPending || !form.titulo.trim() || !form.descricao.trim()} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar como rascunho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
