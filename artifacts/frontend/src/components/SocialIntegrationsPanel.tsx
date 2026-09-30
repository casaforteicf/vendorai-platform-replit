import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";

type Provider = "youtube" | "linkedin" | "tiktok";
type IdentityRole = "brand" | "personal" | "operational";
type Connection = {
  provider: Provider;
  connected: boolean;
  configured: boolean;
  accountName?: string | null;
  identityRole: IdentityRole;
  approvalRequired: boolean;
  capabilities: { publish: boolean; metrics: boolean; comments: boolean; reply: boolean; ads: boolean; directMessages: boolean };
};

const labels: Record<Provider, string> = { youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok" };
const identityRoleLabels: Record<IdentityRole, string> = {
  brand: "Perfil oficial da marca",
  personal: "Conta pessoal",
  operational: "Operacional / anúncios",
};
const identityRoleHints: Record<IdentityRole, string> = {
  brand: "Pode representar publicamente a empresa em site, GEO e dados estruturados quando houver URL oficial confirmada.",
  personal: "Usada para autenticação ou publicação, mas não representa a identidade pública da empresa.",
  operational: "Usada para operação, publicação ou anúncios; não entra automaticamente como perfil oficial da marca.",
};

type Mode = "connect" | "publish";

export function SocialIntegrationsPanel({ providers: providersFilter, mode = "connect" }: { providers?: Provider[]; mode?: Mode } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<string>();
  const [publishOpen, setPublishOpen] = useState<Provider | null>(null);
  const [publishMediaUrl, setPublishMediaUrl] = useState("");
  const [publishText, setPublishText] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeTags, setYoutubeTags] = useState("");
  const [youtubePrivacyStatus, setYoutubePrivacyStatus] = useState<"public" | "unlisted" | "private">("public");
  const [uploading, setUploading] = useState<Provider | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!tenantId) return;
    const response = await fetch(`/api/tenants/${tenantId}/social-connections`);
    if (response.ok) setConnections((await response.json()).connections);
  }

  useEffect(() => { void load(); }, [tenantId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("socialConnected");
    const error = params.get("socialError");
    if (connected) toast({ title: `${labels[connected as Provider] || connected} conectado com sucesso.` });
    if (error) toast({ title: "Não foi possível concluir a conexão social.", variant: "destructive" });
  }, [toast]);

  async function connect(item: Connection) {
    setBusy(item.provider);
    try {
      const response = await fetch(`/api/auth/${item.provider}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch {
      toast({ title: `${labels[item.provider]} ainda não está configurado no servidor.`, description: "Cadastre as credenciais OAuth e as permissões da plataforma.", variant: "destructive" });
      setBusy(undefined);
    }
  }

  async function disconnect(item: Connection) {
    if (!tenantId) return;
    setBusy(item.provider);
    await fetch(`/api/tenants/${tenantId}/social-connections/${item.provider}`, { method: "DELETE" });
    await load();
    setBusy(undefined);
  }

  async function updateIdentityRole(item: Connection, identityRole: IdentityRole) {
    if (!tenantId || !item.connected) return;
    setBusy(`identity-${item.provider}`);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/social-connections/${item.provider}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "identity_role_update_failed");
      await load();
      toast({ title: `${labels[item.provider]}: uso da conta atualizado.`, description: identityRoleLabels[identityRole] });
    } catch (error) {
      toast({ title: "Não foi possível atualizar o uso da conta.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(undefined);
    }
  }

  async function publish(item: Connection) {
    if (!tenantId) return;
    if (!publishText.trim() && !publishMediaUrl.trim()) {
      toast({ title: "Informe um texto ou uma URL de mídia.", variant: "destructive" });
      return;
    }
    setBusy(`publish-${item.provider}`);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/social-publications/${item.provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: publishText.trim() || undefined,
          mediaUrl: publishMediaUrl.trim() || undefined,
          contentType: item.provider === "youtube" ? "video" : "post",
          ...(item.provider === "youtube" ? {
            youtubeTitle: youtubeTitle.trim() || undefined,
            youtubeDescription: publishText.trim() || undefined,
            youtubeTags: youtubeTags.split(",").map((tag) => tag.trim()).filter(Boolean),
            youtubePrivacyStatus,
            youtubeDefaultLanguage: "pt-BR",
          } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "publish_failed");
      toast({ title: `Publicação enviada para ${labels[item.provider]}.` });
      setPublishOpen(null);
      setPublishText("");
      setPublishMediaUrl("");
      setYoutubeTitle("");
      setYoutubeTags("");
      setYoutubePrivacyStatus("public");
    } catch (error) {
      toast({ title: `Falha ao publicar em ${labels[item.provider]}.`, description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(undefined);
    }
  }

  async function uploadFile(item: Connection, file: File) {
    const isVideo = item.provider === "youtube";
    const allowed = isVideo
      ? ["video/mp4", "video/quicktime", "video/webm"]
      : ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Formato inválido", description: isVideo ? "Use MP4, MOV ou WebM." : "Use JPG, PNG, WebP ou vídeo.", variant: "destructive" });
      return;
    }
    const maxBytes = isVideo ? 500 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({ title: "Arquivo muito grande", description: `Máximo ${Math.round(maxBytes / (1024 * 1024))} MB.`, variant: "destructive" });
      return;
    }
    setUploading(item.provider);
    try {
      const response = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!response.ok) throw new Error("Falha ao obter URL de upload");
      const { uploadURL, objectPath } = (await response.json()) as { uploadURL: string; objectPath: string };

      const result = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!result.ok) throw new Error("Falha ao enviar arquivo");

      const mediaUrl = `${window.location.origin}/api/storage${objectPath}`;
      setPublishMediaUrl(mediaUrl);
      toast({ title: "Arquivo enviado.", description: "Pronto para publicar." });
    } catch (error) {
      toast({ title: "Erro no upload", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  const filtered = connections.filter((item) => !providersFilter || providersFilter.includes(item.provider));

  const connectTitle = providersFilter?.length === 1 && providersFilter[0] === "youtube"
    ? "YouTube"
    : providersFilter && !providersFilter.includes("youtube")
      ? "Outros canais"
      : "Canais sociais e conversas";
  const connectDescription = providersFilter?.length === 1 && providersFilter[0] === "youtube"
    ? "Canal de vídeo do ecossistema Google para publicações, métricas, comentários e respostas."
    : providersFilter && !providersFilter.includes("youtube")
      ? "Canais que não pertencem aos ecossistemas Google ou Meta."
      : "Conecte suas contas para centralizar publicações, métricas, comentários e respostas.";

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-base">{mode === "publish" ? "Publicar" : connectTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "publish"
            ? "Publique diretamente nas contas conectadas. Para conectar ou desconectar contas, use Configurações → Integrações."
            : connectDescription}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {filtered.map((item) => (
          <div key={item.provider} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <strong>{labels[item.provider]}</strong>
              <span className={`text-xs ${item.connected ? "text-emerald-600" : "text-muted-foreground"}`}>{item.connected ? "Conectado" : "Desconectado"}</span>
            </div>
            {item.accountName && <p className="text-sm">{item.accountName}</p>}
            {item.connected && <p className="text-xs font-medium text-slate-600">{identityRoleLabels[item.identityRole]}</p>}

            {mode === "connect" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Publicações e métricas{item.capabilities.reply ? ", comentários e respostas" : ""}{item.capabilities.ads ? ", anúncios mediante aprovação" : ""}.
                </p>
                {item.connected && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <label className="block text-xs font-semibold" htmlFor={`identity-role-${item.provider}`}>Uso desta conta</label>
                    <select
                      id={`identity-role-${item.provider}`}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={item.identityRole}
                      disabled={busy === `identity-${item.provider}`}
                      onChange={(event) => void updateIdentityRole(item, event.target.value as IdentityRole)}
                    >
                      <option value="brand">Perfil oficial da marca</option>
                      <option value="personal">Conta pessoal</option>
                      <option value="operational">Operacional / anúncios</option>
                    </select>
                    <p className="text-xs leading-5 text-muted-foreground">{identityRoleHints[item.identityRole]}</p>
                  </div>
                )}
                {!item.configured && <p className="text-xs text-amber-700">Credenciais OAuth pendentes no servidor.</p>}
                <Button size="sm" variant={item.connected ? "outline" : "default"} disabled={busy === item.provider} onClick={() => item.connected ? disconnect(item) : connect(item)}>
                  {busy === item.provider ? "Aguarde…" : item.connected ? "Desconectar" : `Conectar ${labels[item.provider]}`}
                </Button>
              </>
            )}

            {mode === "publish" && (
              !item.connected ? (
                <p className="text-xs text-muted-foreground">Conta não conectada. Vá em Configurações → Integrações para conectar.</p>
              ) : !item.capabilities.publish ? (
                <p className="text-xs text-muted-foreground">Publicação não disponível para esta conta.</p>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setPublishOpen(publishOpen === item.provider ? null : item.provider)}>
                    {publishOpen === item.provider ? "Fechar" : "Publicar"}
                  </Button>
                  {publishOpen === item.provider && (
                    <div className="space-y-2 pt-2 border-t">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={item.provider === "youtube" ? "video/mp4,video/quicktime,video/webm" : "image/*,video/*"}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadFile(item, file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        disabled={uploading === item.provider}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading === item.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {uploading === item.provider ? "Enviando…" : `Enviar ${item.provider === "youtube" ? "vídeo" : "arquivo"} do dispositivo`}
                      </Button>
                      <Input
                        placeholder={item.provider === "youtube" ? "ou cole a URL do vídeo (mp4/mov público)" : "ou cole a URL da mídia (opcional)"}
                        value={publishMediaUrl}
                        onChange={(e) => setPublishMediaUrl(e.target.value)}
                      />
                      {item.provider === "youtube" && (
                        <>
                          <Input
                            placeholder="Título do vídeo no YouTube"
                            maxLength={100}
                            value={youtubeTitle}
                            onChange={(e) => setYoutubeTitle(e.target.value)}
                          />
                          <Input
                            placeholder="Tags separadas por vírgula"
                            value={youtubeTags}
                            onChange={(e) => setYoutubeTags(e.target.value)}
                          />
                          <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={youtubePrivacyStatus}
                            onChange={(e) => setYoutubePrivacyStatus(e.target.value as "public" | "unlisted" | "private")}
                          >
                            <option value="public">Público</option>
                            <option value="unlisted">Não listado</option>
                            <option value="private">Privado</option>
                          </select>
                        </>
                      )}
                      <textarea
                        className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder={item.provider === "youtube" ? "Descrição do vídeo" : "Título/legenda"}
                        value={publishText}
                        onChange={(e) => setPublishText(e.target.value)}
                      />
                      <Button size="sm" className="w-full" disabled={busy === `publish-${item.provider}`} onClick={() => publish(item)}>
                        {busy === `publish-${item.provider}` ? "Publicando…" : "Confirmar publicação"}
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
