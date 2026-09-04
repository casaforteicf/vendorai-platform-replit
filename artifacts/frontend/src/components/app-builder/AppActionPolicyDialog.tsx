import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, ShieldCheck, Zap } from "lucide-react";

type JsonObject = Record<string, unknown>;
type AppLike = { id: string; name: string; status: string; settings: JsonObject };
type ActionRegistry = {
  key: string;
  name: string;
  description?: string | null;
  riskLevel?: string;
  status?: string;
  requiredPermissions?: string[];
};
type Props = {
  app: AppLike | null;
  token: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAppChanged?: () => void | Promise<void>;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function actionState(settings: JsonObject | undefined) {
  const runtimeAccess = asObject(settings?.runtimeAccess);
  const actions = asObject(runtimeAccess.actions);
  const keys = Array.isArray(actions.keys) ? actions.keys.filter((key): key is string => typeof key === "string") : [];
  return new Set(actions.enabled === true ? keys : []);
}

export default function AppActionPolicyDialog({ app, token, open, onOpenChange, onAppChanged }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState<ActionRegistry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const requestJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error("Sessão SuperAdmin não disponível.");
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload && payload.error ? String(payload.error) : `Falha (${response.status})`);
    return payload as T;
  }, [token]);

  useEffect(() => {
    if (!open || !app) return;
    setSelected(actionState(app.settings));
    setLoading(true);
    void requestJson<{ actions: ActionRegistry[] }>("/admin/app-builder/registries")
      .then((payload) => setActions((payload.actions ?? []).filter((action) => action.status === "active" || !action.status)))
      .catch((error) => toast({ title: "Não foi possível carregar as Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [app, open, requestJson, toast]);

  const sorted = useMemo(() => [...actions].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [actions]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!app) return;
    setSaving(true);
    try {
      const settings = asObject(app.settings);
      const runtimeAccess = asObject(settings.runtimeAccess);
      const keys = Array.from(selected).sort();
      const nextSettings = {
        ...settings,
        runtimeAccess: {
          ...runtimeAccess,
          actions: { enabled: keys.length > 0, keys },
        },
      };
      await requestJson(`/admin/app-builder/apps/${app.id}`, { method: "PATCH", body: JSON.stringify({ settings: nextSettings }) });
      await onAppChanged?.();
      toast({ title: "Actions atualizadas no working draft", description: "Crie um novo snapshot e publique em Versões para aplicar ao runtime." });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao salvar Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Actions · {app?.name ?? "App"}</DialogTitle></DialogHeader>
        <div className="rounded-xl border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-600" />
          Autorizar aqui não executa a Action automaticamente. O backend ainda exige snapshot publicado, App User ativo, membership ativo, permissões atuais e executor allowlisted.
        </div>
        {app?.status === "published" && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">As mudanças abaixo alteram somente o working draft. Publique um novo snapshot para efetivá-las.</div>}
        {loading ? <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-3">
            {sorted.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma Action ativa no Registry.</div> : sorted.map((action) => {
              const active = selected.has(action.key);
              return (
                <button key={action.key} type="button" onClick={() => toggle(action.key)} className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border ${active ? "border-primary bg-primary text-primary-foreground" : ""}`}>{active && <Check className="h-3.5 w-3.5" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{action.name}</p><Badge variant="outline" className="font-mono text-[10px]">{action.key}</Badge>{action.riskLevel && <Badge variant="secondary" className="text-[10px]">Risco {action.riskLevel}</Badge>}</div>
                      {action.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p>}
                      {!!action.requiredPermissions?.length && <p className="mt-2 text-[10px] text-muted-foreground">Permissões exigidas: {action.requiredPermissions.join(", ")}</p>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving || loading}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Actions</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
