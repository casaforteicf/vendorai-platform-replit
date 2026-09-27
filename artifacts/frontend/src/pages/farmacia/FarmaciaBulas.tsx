import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BookOpenCheck, Download, Loader2, Pencil, ShieldCheck } from "lucide-react";

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`, "Content-Type": "application/json" });
const emptyPosologia = { concentracao: "", formaFarmaceutica: "", viaAdministracao: "", faixaEtaria: "", pesoMinimoKg: "", pesoMaximoKg: "", dosePorAdministracao: "", intervaloMinimo: "", duracaoMaxima: "", doseMaximaDiaria: "", modoDeUsar: "", contraindicacoes: "", interacoes: "", alertas: "" };

export default function FarmaciaBulas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("todos");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const { data: bulas = [], isLoading } = useQuery<any[]>({
    queryKey: ["farmacia-bulas", tenantId, status],
    enabled: !!tenantId,
    queryFn: () => fetch(`/api/tenants/${tenantId}/farmacia/bulas${status === "todos" ? "" : `?status=${status}`}`, { headers: headers() }).then((r) => r.json()),
  });
  const importBase = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/farmacia/bulas/importar-base`, { method: "POST", headers: headers() })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? "Não foi possível importar a base de bulas.");
          return body;
        }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["farmacia-bulas"] }); toast({ title: `${data.imported} bulas disponíveis para revisão.` }); },
    onError: (error: Error) => toast({ title: "Erro ao importar bulas", description: error.message, variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: ({ approve }: { approve: boolean }) => fetch(`/api/tenants/${tenantId}/farmacia/bulas/${editing.id}${approve ? "/aprovar" : ""}`, { method: approve ? "POST" : "PUT", headers: headers(), body: JSON.stringify(form) }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data; }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["farmacia-bulas"] }); setEditing(null); toast({ title: "Bula atualizada." }); },
    onError: (e: any) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  function open(row: any) {
    setEditing(row);
    setForm({ ...row, posologia: { ...emptyPosologia, ...(row.posologia ?? {}), pesoMinimoKg: row.posologia?.pesoMinimoKg ?? "", pesoMaximoKg: row.posologia?.pesoMaximoKg ?? "" } });
  }
  const setP = (field: string, value: string) => setForm((f: any) => ({ ...f, posologia: { ...f.posologia, [field]: value } }));

  return <div className="space-y-5">
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
      <div><h1 className="text-xl font-bold flex items-center gap-2"><BookOpenCheck className="h-5 w-5" /> Bulas para revisão</h1><p className="text-sm text-muted-foreground">Cada apresentação precisa de fonte oficial, nome e CRF do responsável.</p></div>
      <Button onClick={() => importBase.mutate()} disabled={importBase.isPending}><Download className="h-4 w-4 mr-2" />Importar lista base</Button>
    </div>
    <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="aprovada">Aprovadas</SelectItem><SelectItem value="rejeitada">Rejeitadas</SelectItem></SelectContent></Select>
    {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{bulas.map((b: any) => <Card key={b.id}><CardContent className="p-4 space-y-3"><div className="flex justify-between gap-2"><div><p className="font-semibold">{b.principioAtivo}</p><p className="text-xs text-muted-foreground">{b.sintomasReferencia || "Referência a completar"}</p></div><Badge variant={b.status === "aprovada" ? "default" : "secondary"}>{b.status}</Badge></div>{b.status === "aprovada" && <p className="text-xs text-emerald-700"><ShieldCheck className="inline h-3 w-3 mr-1" />{b.responsavelNome} · {b.responsavelRegistro}</p>}<Button variant="outline" size="sm" className="w-full" onClick={() => open(b)}><Pencil className="h-3.5 w-3.5 mr-2" />Revisar bula</Button></CardContent></Card>)}</div>}
    <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Revisar — {editing?.principioAtivo}</DialogTitle></DialogHeader>{editing && <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3"><div><Label>Concentração</Label><Input value={form.posologia.concentracao} onChange={(e) => setP("concentracao", e.target.value)} /></div><div><Label>Forma farmacêutica</Label><Input value={form.posologia.formaFarmaceutica} onChange={(e) => setP("formaFarmaceutica", e.target.value)} /></div><div><Label>Via</Label><Input value={form.posologia.viaAdministracao} onChange={(e) => setP("viaAdministracao", e.target.value)} /></div><div><Label>Faixa etária</Label><Input value={form.posologia.faixaEtaria} onChange={(e) => setP("faixaEtaria", e.target.value)} /></div><div><Label>Peso mínimo (kg)</Label><Input type="number" value={form.posologia.pesoMinimoKg} onChange={(e) => setP("pesoMinimoKg", e.target.value)} /></div><div><Label>Peso máximo (kg)</Label><Input type="number" value={form.posologia.pesoMaximoKg} onChange={(e) => setP("pesoMaximoKg", e.target.value)} /></div><div><Label>Dose por administração</Label><Input value={form.posologia.dosePorAdministracao} onChange={(e) => setP("dosePorAdministracao", e.target.value)} /></div><div><Label>Intervalo mínimo</Label><Input value={form.posologia.intervaloMinimo} onChange={(e) => setP("intervaloMinimo", e.target.value)} /></div><div><Label>Duração máxima</Label><Input value={form.posologia.duracaoMaxima} onChange={(e) => setP("duracaoMaxima", e.target.value)} /></div></div>
      <div><Label>Dose máxima diária</Label><Input value={form.posologia.doseMaximaDiaria} onChange={(e) => setP("doseMaximaDiaria", e.target.value)} /></div>
      {[["modoDeUsar","Modo de usar"],["contraindicacoes","Contraindicações"],["interacoes","Interações"],["alertas","Alertas"]].map(([key,label]) => <div key={key}><Label>{label}</Label><Textarea rows={2} value={form.posologia[key] ?? ""} onChange={(e) => setP(key, e.target.value)} /></div>)}
      <div><Label>URL da bula oficial (Anvisa)</Label><Input type="url" value={form.fonteUrl ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, fonteUrl: e.target.value }))} /></div>
      <div className="grid sm:grid-cols-2 gap-3"><div><Label>Nome do farmacêutico</Label><Input value={form.responsavelNome ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, responsavelNome: e.target.value }))} /></div><div><Label>Registro profissional (CRF/UF)</Label><Input value={form.responsavelRegistro ?? ""} onChange={(e) => setForm((f: any) => ({ ...f, responsavelRegistro: e.target.value }))} placeholder="CRF-SC 00000" /></div></div>
      <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => save.mutate({ approve: false })} disabled={save.isPending}>Salvar como pendente</Button><Button onClick={() => save.mutate({ approve: true })} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Aprovar bula</Button></div>
    </div>}</DialogContent></Dialog>
  </div>;
}
