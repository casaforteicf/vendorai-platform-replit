import { useEffect, useMemo, useState } from "react";
import { RotateCcw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type HistoryItem = {
  id: string;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  antes?: unknown;
  depois?: unknown;
  actorName?: string | null;
  actorEmail?: string | null;
  createdAt: string;
};

type HistoryPayload = {
  items?: HistoryItem[];
};

function isRestorable(item: HistoryItem) {
  return item.entidade === "business_profile"
    && item.acao === "atualizar"
    && Boolean(item.entidadeId)
    && Boolean(item.antes)
    && typeof item.antes === "object";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function ConfigurationRollbackPanel() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const isAdmin = user?.platformRole === "super_admin"
    || user?.platformRole === "tenant_admin"
    || user?.userFunction === "administrador";
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/configuration-history?limit=100`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as HistoryPayload;
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setError("Não foi possível carregar as versões restauráveis agora.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId && isAdmin) void load();
  }, [tenantId, isAdmin]);

  const restorable = useMemo(() => items.filter(isRestorable).slice(0, 8), [items]);

  const rollback = async (item: HistoryItem) => {
    if (!tenantId || confirmation !== "RESTAURAR") return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/configuration-history/${encodeURIComponent(item.id)}/rollback`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ confirm: "RESTAURAR" }),
        },
      );
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      setRollbackId(null);
      setConfirmation("");
      setMessage("Versão restaurada com sucesso. A restauração também foi registrada no histórico.");
      await load();
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : "Não foi possível restaurar esta versão.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin || !tenantId) return null;

  return (
    <section className="mb-4 rounded-xl border bg-background p-3 sm:p-4" aria-label="Restauração segura de configurações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Restauração segura</strong>
              <Badge variant="secondary" className="text-[10px]">{restorable.length} versão(ões)</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Restaura somente versões elegíveis do Perfil da Empresa. Integrações, credenciais, contratos e agentes permanecem bloqueados.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)} disabled={loading}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {expanded ? "Ocultar versões" : "Ver versões restauráveis"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              A restauração altera dados atuais. Antes de confirmar, confira a data e o responsável. Para concluir é obrigatório digitar <strong>RESTAURAR</strong>.
            </p>
          </div>

          {message && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}

          {!loading && restorable.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              Ainda não há alterações de Perfil da Empresa elegíveis para restauração automática.
            </p>
          )}

          <div className="space-y-2">
            {restorable.map((item) => {
              const selected = rollbackId === item.id;
              const actor = item.actorName || item.actorEmail || "Sistema";
              return (
                <article key={item.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">Perfil da Empresa</span>
                        <Badge variant="outline" className="text-[10px]">Restaurável</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{formatDate(item.createdAt)}</span>
                        <span>{actor}</span>
                        {item.actorEmail && item.actorName && <span>{item.actorEmail}</span>}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRollbackId(selected ? null : item.id);
                        setConfirmation("");
                        setMessage(null);
                        setError(null);
                      }}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Restaurar esta versão
                    </Button>
                  </div>

                  {selected && (
                    <div className="mt-3 space-y-2 rounded-md border border-destructive/25 bg-destructive/5 p-3">
                      <p className="text-xs font-medium">Confirme a restauração desta versão do Perfil da Empresa.</p>
                      <label className="grid gap-1 text-xs">
                        Digite RESTAURAR
                        <input
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={confirmation !== "RESTAURAR" || submitting}
                          onClick={() => void rollback(item)}
                        >
                          {submitting ? "Restaurando..." : "Confirmar restauração"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={submitting}
                          onClick={() => {
                            setRollbackId(null);
                            setConfirmation("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
