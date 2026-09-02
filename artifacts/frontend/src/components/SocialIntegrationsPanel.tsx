import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Provider = "youtube" | "linkedin" | "tiktok";
type Connection = {
  provider: Provider;
  connected: boolean;
  configured: boolean;
  accountName?: string | null;
  approvalRequired: boolean;
  capabilities: { publish: boolean; metrics: boolean; comments: boolean; reply: boolean; ads: boolean; directMessages: boolean };
};

const labels: Record<Provider, string> = { youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok" };

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
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "publish_failed");
      toast({ title: `Publicação enviada para ${labels[item.provider]}.` });
      setPublishOpen(null);
      setPublishText("");
      setPublishMediaUrl("");
    } catch (error) {
      toast({ title: `Falha ao publicar em ${labels[item.provider]}.`, description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(undefined);
    }
  }

  const filtered = connections.filter((item) => !providersFilter || providersFilter.includes(item.provider));

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-base">{mode === "publish" ? "Publicar" : "Canais sociais e conversas"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "publish"
            ? "Publique diretamente nas contas conectadas. Para conectar ou desconectar contas, use Configurações → Integrações."
            : "Conecte suas contas para centralizar publicações, métricas, comentários e respostas."}
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

            {mode === "connect" && (
              <>
                <p className="text-xs text-muted-foreground">
                  Publicações e métricas{item.capabilities.reply ? ", comentários e respostas" : ""}{item.capabilities.ads ? ", anúncios mediante aprovação" : ""}.
                </p>
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
                      <Input
                        placeholder={item.provider === "youtube" ? "URL do vídeo (mp4/mov público)" : "URL da mídia (opcional)"}
                        value={publishMediaUrl}
                        onChange={(e) => setPublishMediaUrl(e.target.value)}
                      />
                      <Input
                        placeholder="Título/legenda"
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
