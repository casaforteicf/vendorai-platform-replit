import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Video, Loader2, Trash2, Clock, Link as LinkIcon, Package } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type Story = {
  id: string;
  mediaType: "foto" | "video";
  mediaUrl: string;
  produtoId: string | null;
  linkUrl: string | null;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
};

function horasRestantes(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h restantes` : `${m}min restantes`;
}

// Stories do parceiro pra home do Praça.ai — foto/vídeo que expira sozinho
// em 24h, tipo Instagram. Cada tenant vê e gerencia só os próprios.
export default function StoriesLojista() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ objectPath: string; mediaType: "foto" | "video"; previewUrl: string } | null>(null);
  const [linkMode, setLinkMode] = useState<"nenhum" | "produto" | "link">("nenhum");
  const [produtoId, setProdutoId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [caption, setCaption] = useState("");

  const QK = ["stories", tenantId];

  const { data: stories = [], isLoading } = useQuery<Story[]>({
    queryKey: QK,
    queryFn: () => fetch(`/api/tenants/${tenantId}/stories`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  const { data: produtos = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ["produtos-select", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && linkMode === "produto",
  });

  async function handleFile(file: File | null) {
    if (!file) return;
    const mediaType: "foto" | "video" = file.type.startsWith("video/") ? "video" : "foto";
    setUploading(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("Falha no upload");
      setPendingMedia({ objectPath: result.objectPath, mediaType, previewUrl: URL.createObjectURL(file) });
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const publicar = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/stories`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          mediaType: pendingMedia!.mediaType,
          mediaUrl: pendingMedia!.objectPath,
          produtoId: linkMode === "produto" ? produtoId || undefined : undefined,
          linkUrl: linkMode === "link" ? linkUrl.trim() || undefined : undefined,
          caption: caption.trim() || undefined,
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Falha ao publicar");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Story publicado! Fica visível no Praça.ai por 24h." });
      qc.invalidateQueries({ queryKey: QK });
      setPendingMedia(null); setLinkMode("nenhum"); setProdutoId(""); setLinkUrl(""); setCaption("");
    },
    onError: (err: any) => toast({ title: "Não foi possível publicar", description: err.message, variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/stories/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Stories</h1>
        <p className="text-sm text-muted-foreground">Foto ou vídeo curto na home do Praça.ai — some sozinho em 24h.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {!pendingMedia ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-40 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50"
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                <>
                  <div className="flex gap-2"><Camera className="h-6 w-6" /><Video className="h-6 w-6" /></div>
                  <span className="text-sm font-medium">Escolher foto ou vídeo</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative w-full max-w-xs mx-auto aspect-[9/16] rounded-lg overflow-hidden bg-black">
                {pendingMedia.mediaType === "foto"
                  ? <img src={pendingMedia.previewUrl} className="w-full h-full object-cover" />
                  : <video src={pendingMedia.previewUrl} className="w-full h-full object-cover" controls />}
              </div>

              <Input placeholder="Legenda (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} />

              <div className="space-y-1.5">
                <Label className="text-xs">Ao tocar no story, o cliente vai pra...</Label>
                <Select value={linkMode} onValueChange={(v) => setLinkMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nada (só o story)</SelectItem>
                    <SelectItem value="produto">Um produto do catálogo</SelectItem>
                    <SelectItem value="link">Um link (WhatsApp, carrinho, etc)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {linkMode === "produto" && (
                <Select value={produtoId} onValueChange={setProdutoId}>
                  <SelectTrigger><SelectValue placeholder="Escolha o produto" /></SelectTrigger>
                  <SelectContent>
                    {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {linkMode === "link" && (
                <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              )}

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setPendingMedia(null)}>Cancelar</Button>
                <Button type="button" onClick={() => publicar.mutate()} disabled={publicar.isPending}>
                  {publicar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Publicar
                </Button>
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Ativos agora</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && stories.length === 0 && <p className="text-sm text-muted-foreground">Nenhum story ativo.</p>}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {stories.map((s) => (
            <div key={s.id} className="relative aspect-[9/16] rounded-lg overflow-hidden border group">
              {s.mediaType === "foto"
                ? <img src={s.mediaUrl} className="w-full h-full object-cover" />
                : <video src={s.mediaUrl} className="w-full h-full object-cover" muted />}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex items-center gap-1">
                <Clock className="h-3 w-3 text-white" />
                <span className="text-[10px] text-white font-medium">{horasRestantes(s.expiresAt)}</span>
              </div>
              {(s.produtoId || s.linkUrl) && (
                <Badge className="absolute top-1 left-1 h-5 px-1.5 gap-1" variant="secondary">
                  {s.produtoId ? <Package className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
                </Badge>
              )}
              <button
                type="button"
                onClick={() => remover.mutate(s.id)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
