import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Loader2, ShieldCheck, Workflow } from "lucide-react";

type JsonObject = Record<string, unknown>;
type AppLike = {
  id: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
};
type ActionRegistryItem = {
  key: string;
  name: string;
  description?: string | null;
  requiredPermissions?: string[];
  riskLevel: string;
  status: string;
  executorKey?: string | null;
};
type RegistriesResponse = { actions?: ActionRegistryItem[] };

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function policyState(settings: Record<string, unknown> | undefined) {
  const runtimeAccess = asObject(settings?.runtimeAccess);
  const actions = asObject(runtimeAccess.actions);
  return {
    enabled: actions.enabled === true,
    keys: stringArray(actions.keys),
  };
}

function authEnabled(settings: Record<string, unknown> | undefined) {
  const runtimeAccess = asObject(settings?.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  return auth.enabled === true && stringArray(auth.methods).includes("email_code");
}

export default function AppActionPolicyDialog({ app, token, open, onOpenChange, onAppChanged }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState<ActionRegistryItem[]>([]);
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
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error
        ? String(payload.error)
        : `Falha na operação (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }, [token]);

  const load = useCallback(async () => {
    if (!open || !app) return;
    setLoading(true);
    try {
      const registries = await requestJson<RegistriesResponse>("/admin/app-builder/registries");
      const rows = (registries.actions ?? []).filter((action) => action.status === "active");
      setActions(rows);
      const current = policyState(app.settings);
      setSelected(new Set(current.keys));
    } catch (error) {
      toast({ title: "Não foi possível carregar as Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [app, open, requestJson, toast]);

  useEffect(() => { void load(); }, [load]);

  const lowRisk = useMemo(() => actions.filter((action) => action.riskLevel === "low" && action.executorKey), [actions]);
  const editableKeys = useMemo(() => new Set(lowRisk.map((action) => action.key)), [lowRisk]);
  const loginReady = authEnabled(app?.settings);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!app) return;
    setSaving(true);
    try {
      const settings = asObject(app.settings);
      const runtimeAccess = asObject(settings.runtimeAccess);
      const actionsPolicy = asObject(runtimeAccess.actions);
      // Preserve qualquer chave já existente que não pertence ao conjunto low-risk
      // editável nesta tela. Assim itens futuros/legados nunca são apagados por acidente.
      const preservedNonEditable = stringArray(actionsPolicy.keys).filter((key) => !editableKeys.has(key));
      const editableSelected = lowRisk.filter((action) => selected.has(action.key)).map((action) => action.key);
      const keys = Array.from(new Set([...preservedNonEditable, ...editableSelected]));
      const nextSettings = {
        ...settings,
        runtimeAccess: {
          ...runtimeAccess,
          actions: {
            ...actionsPolicy,
            enabled: keys.length > 0,
            keys,
          },
        },
      };
      await requestJson(`/admin/app-builder/apps/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({ settings: nextSettings }),
      });
      await onAppChanged?.();
      toast({
        title: "Actions atualizadas no working draft",
        description: "Crie um novo snapshot da App Instance e publique para aplicar a policy ao runtime.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao salvar policy de Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Workflow className="h-5 w-5 text-primary" />Actions publicadas · {app?.name ?? "App"}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
          <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>Esta tela altera somente o <strong>working draft</strong> da App Instance. O runtime continua usando o snapshot publicado até você criar uma nova versão e publicá-la.</p></div>
        </div>

        {!loginReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">Actions externas exigem autenticação do App User. Ative o login por e-mail em <strong>Gerenciar usuários</strong> antes de publicar.</div>}

        {loading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-3">
            {lowRisk.map((action) => {
              const active = selected.has(action.key);
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => toggle(action.key)}
                  className={cn("w-full rounded-xl border p-4 text-left transition", active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/20")}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")}>{active && <Check className="h-3.5 w-3.5" />}</div>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{action.name}</p><Badge variant="outline" className="font-mono text-[9px]">{action.key}</Badge><Badge variant="secondary" className="text-[9px]">low</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p><div className="mt-2 flex flex-wrap gap-1.5">{(action.requiredPermissions ?? []).map((permission) => <Badge key={permission} variant="outline" className="font-mono text-[9px]">{permission}</Badge>)}</div></div>
                  </div>
                </button>
              );
            })}
            {lowRisk.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma Action low-risk executável disponível.</div>}
            {actions.some((action) => action.riskLevel !== "low") && <p className="text-[11px] leading-5 text-muted-foreground">Actions de risco médio/alto/crítico não são habilitáveis por este fluxo. Elas exigirão confirmação e políticas específicas.</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => void save()} disabled={saving || loading || !app}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar working draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
