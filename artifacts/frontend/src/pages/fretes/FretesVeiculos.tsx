import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Truck, Loader2, Camera } from "lucide-react";

function objectUrl(objectPath: string) {
  return `/api/storage/objects${objectPath.replace("/objects", "")}`;
}

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TIPOS = [
  { value: "utilitario", label: "Utilitário" },
  { value: "van", label: "Van" },
  { value: "caminhao_toco", label: "Caminhão Toco" },
  { value: "caminhao_truck", label: "Caminhão Truck" },
  { value: "carreta", label: "Carreta" },
] as const;

const EMPTY_FORM = { placa: "", tipo: "van" as string, capacidadeKg: "", capacidadeM3: "", ativo: true, fotoUrl: "" };

export default function FretesVeiculos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const requestUploadUrl = useRequestUploadUrl();
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const QK = ["fretes-veiculos", tenantId];

  const { data: veiculos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => fetch(`/api/tenants/${tenantId}/fretes/veiculos`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/fretes/veiculos/${editing.id}`
        : `/api/tenants/${tenantId}/fretes/veiculos`;
      return fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: editing ? "Veículo atualizado!" : "Veículo cadastrado!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      fetch(`/api/tenants/${tenantId}/fretes/veiculos/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ ativo }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); }
  function openEdit(v: any) {
    setEditing(v);
    setForm({
      placa: v.placa ?? "", tipo: v.tipo ?? "van",
      capacidadeKg: v.capacidadeKg != null ? String(v.capacidadeKg) : "",
      capacidadeM3: v.capacidadeM3 != null ? String(v.capacidadeM3) : "",
      ativo: v.ativo !== false,
      fotoUrl: v.fotoUrl ?? "",
    });
    setDialogOpen(true);
  }
  async function handleFotoUpload(file: File) {
    setUploadingFoto(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("Falha no upload");
      setForm((f) => ({ ...f, fotoUrl: result.objectPath }));
    } catch {
      toast({ title: "Erro no upload da foto. Tente novamente.", variant: "destructive" });
    } finally {
      setUploadingFoto(false);
    }
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.placa) { toast({ title: "Placa é obrigatória", variant: "destructive" }); return; }
    save.mutate({ ...form, capacidadeKg: form.capacidadeKg || undefined, capacidadeM3: form.capacidadeM3 || undefined, fotoUrl: form.fotoUrl || undefined });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-5 w-5" /> Frota
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{Array.isArray(veiculos) ? veiculos.length : 0} veículo(s)</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Veículo
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : veiculos.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
          ) : (
            <div className="divide-y">
              {veiculos.map((v: any) => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  {v.fotoUrl ? (
                    <img src={objectUrl(v.fotoUrl)} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{v.placa}</span>
                      <Badge variant="outline" className="text-xs">{TIPOS.find((t) => t.value === v.tipo)?.label ?? v.tipo}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {v.capacidadeKg ? `${v.capacidadeKg}kg` : "—"} · {v.capacidadeM3 ? `${v.capacidadeM3}m³` : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={v.ativo !== false} onCheckedChange={(c) => toggleAtivo.mutate({ id: v.id, ativo: c })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Editar Veículo" : "Novo Veículo"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Placa <span className="text-destructive">*</span></Label>
              <Input value={form.placa} onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value.toUpperCase() }))} placeholder="ABC1D23" />
            </div>
            <div className="space-y-1.5">
              <Label>Foto do veículo</Label>
              <div className="flex items-center gap-3">
                {form.fotoUrl ? (
                  <img src={objectUrl(form.fotoUrl)} className="w-14 h-14 rounded-lg object-cover border" />
                ) : (
                  <div className="w-14 h-14 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground">
                    <Truck className="h-5 w-5" />
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto}>
                  {uploadingFoto ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
                  {form.fotoUrl ? "Trocar" : "Adicionar"}
                </Button>
                <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFotoUpload(e.target.files[0])} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Capacidade (kg)</Label>
                <Input type="number" min={0} value={form.capacidadeKg} onChange={(e) => setForm((f) => ({ ...f, capacidadeKg: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Capacidade (m³)</Label>
                <Input type="number" min={0} step={0.1} value={form.capacidadeM3} onChange={(e) => setForm((f) => ({ ...f, capacidadeM3: e.target.value }))} />
              </div>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
                <Label>Ativo</Label>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
