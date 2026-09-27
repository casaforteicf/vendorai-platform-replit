import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, X } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// Foto de prova de coleta/entrega — obrigatória de verdade (o backend
// rejeita o avanço de status sem isso, não é só validação de tela).
// Usado tanto no despachante/lojista (FretesCargas) quanto no motorista
// (FretesMotorista), que é quem realmente tira a foto no local.
export function PhotoProofDialog({
  tenantId, cargaId, field, open, onOpenChange, onDone,
}: {
  tenantId: string; cargaId: string; field: "fotosColetaUrls" | "fotosEntregaUrls";
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${cargaId}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ [field]: urls }),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Não foi possível salvar a prova fotográfica.");
        return body;
      }),
    onSuccess: () => { onDone(); onOpenChange(false); setUrls([]); },
    onError: (error: Error) => toast({ title: "Erro ao salvar prova", description: error.message, variant: "destructive" }),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
          requestUploadUrl.mutate(
            { data: { name: file.name, size: file.size, contentType: file.type } },
            { onSuccess: resolve, onError: reject },
          );
        });
        const uploadRes = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!uploadRes.ok) throw new Error("Falha no upload");
        setUrls((prev) => [...prev, result.objectPath]);
      }
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const label = field === "fotosColetaUrls" ? "coleta" : "entrega";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Foto de prova da {label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Registra o estado da carga na {label} — protege lojista e freteiro em caso de disputa.</p>
          <div className="flex flex-wrap gap-2">
            {urls.map((u, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                <img src={`/api/storage/objects${u.replace("/objects", "")}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-md p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted/50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <p className="text-xs text-muted-foreground">Pelo menos uma foto é obrigatória pra avançar.</p>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || uploading || urls.length === 0}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar e avançar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
