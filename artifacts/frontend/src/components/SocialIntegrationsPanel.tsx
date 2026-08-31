import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
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

export function SocialIntegrationsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<string>();

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

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-base">Canais sociais e conversas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Centralize contas, publicações, métricas, comentários e respostas. Mensagens diretas só aparecem quando a API oficial da plataforma oferece esse acesso.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {connections.map((item) => (
          <div key={item.provider} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <strong>{labels[item.provider]}</strong>
              <span className={`text-xs ${item.connected ? "text-emerald-600" : "text-muted-foreground"}`}>{item.connected ? "Conectado" : "Desconectado"}</span>
            </div>
            {item.accountName && <p className="text-sm">{item.accountName}</p>}
            <p className="text-xs text-muted-foreground">
              Publicações e métricas{item.capabilities.reply ? ", comentários e respostas" : ""}{item.capabilities.ads ? ", anúncios mediante aprovação" : ""}.
            </p>
            {!item.configured && <p className="text-xs text-amber-700">Credenciais OAuth pendentes no servidor.</p>}
            <Button size="sm" variant={item.connected ? "outline" : "default"} disabled={busy === item.provider} onClick={() => item.connected ? disconnect(item) : connect(item)}>
              {busy === item.provider ? "Aguarde…" : item.connected ? "Desconectar" : `Conectar ${labels[item.provider]}`}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

