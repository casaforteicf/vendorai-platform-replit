import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Zap } from "lucide-react";

type JsonObject = Record<string, unknown>;
type TemplateLike = { id: string; name: string };
type TemplateVersion = { id: string; version: number; status: string; definition: JsonObject };
type ActionRegistry = {
  key: string;
  name: string;
  description?: string | null;
  inputSchema?: JsonObject;
  riskLevel?: string;
  status?: string;
  requiredPermissions?: string[];
};
type ActionField = { key: string; label: string; inputType: "text" | "email" | "tel" | "number" | "textarea"; placeholder: string; required: boolean };
type ActionUiItem = {
  id: string;
  pageId: string;
  kind: "cta" | "form";
  actionKey: string;
  title: string;
  body: string;
  buttonLabel: string;
  successMessage: string;
  fields: ActionField[];
};
type Props = { template: TemplateLike | null; token: string | null | undefined; open: boolean; onOpenChange: (open: boolean) => void };

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function newId() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `action-${suffix}`;
}
function pagesFrom(definition: JsonObject) {
  const runtime = asObject(definition.runtime);
  return objectArray(runtime.pages).flatMap((page) => {
    const id = stringValue(page.id).trim();
    if (!id) return [];
    return [{ id, title: stringValue(page.title).trim() || id }];
  });
}
function normalizeFields(value: unknown): ActionField[] {
  return objectArray(value).flatMap((field) => {
    const key = stringValue(field.key).trim();
    if (!key) return [];
    const rawType = stringValue(field.inputType);
    const inputType: ActionField["inputType"] = ["text", "email", "tel", "number", "textarea"].includes(rawType) ? rawType as ActionField["inputType"] : "text";
    return [{ key, label: stringValue(field.label) || key, inputType, placeholder: stringValue(field.placeholder), required: field.required === true }];
  });
}
function normalizeItems(definition: JsonObject): ActionUiItem[] {
  return objectArray(definition.actionUi).flatMap((item) => {
    const actionKey = stringValue(item.actionKey).trim();
    const pageId = stringValue(item.pageId).trim();
    if (!actionKey || !pageId) return [];
    return [{
      id: stringValue(item.id).trim() || newId(),
      pageId,
      kind: item.kind === "form" ? "form" : "cta",
      actionKey,
      title: stringValue(item.title),
      body: stringValue(item.body),
      buttonLabel: stringValue(item.buttonLabel),
      successMessage: stringValue(item.successMessage),
      fields: normalizeFields(item.fields),
    }];
  });
}
function requiredKeys(action?: ActionRegistry): Set<string> {
  const schema = asObject(action?.inputSchema);
  const raw = Array.isArray(schema.required) ? schema.required : [];
  return new Set(raw.filter((item): item is string => typeof item === "string"));
}
function minimumProperties(action?: ActionRegistry): number {
  const value = asObject(action?.inputSchema).minProperties;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
function actionRequiresInput(action?: ActionRegistry): boolean {
  return requiredKeys(action).size > 0 || minimumProperties(action) > 0;
}
function fieldsFromSchema(action?: ActionRegistry): ActionField[] {
  const properties = asObject(asObject(action?.inputSchema).properties);
  const required = requiredKeys(action);
  const minimum = minimumProperties(action);
  return Object.entries(properties).slice(0, 20).map(([key, schemaValue], index) => {
    const schema = asObject(schemaValue);
    const lower = key.toLowerCase();
    const inputType: ActionField["inputType"] = lower.includes("email") ? "email" : lower.includes("phone") || lower.includes("tel") ? "tel" : schema.type === "number" || schema.type === "integer" ? "number" : "text";
    const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/^./, (char) => char.toUpperCase());
    return { key, label, inputType, placeholder: "", required: required.has(key) || index < minimum };
  });
}
function isContractRequired(action: ActionRegistry | undefined, key: string): boolean {
  return fieldsFromSchema(action).some((field) => field.key === key && field.required);
}

export default function TemplateActionEditorDialog({ template, token, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [actions, setActions] = useState<ActionRegistry[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [sourceDefinition, setSourceDefinition] = useState<JsonObject>({});
  const [items, setItems] = useState<ActionUiItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [changeLog, setChangeLog] = useState("");

  const requestJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error("Sessão SuperAdmin não disponível.");
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload && payload.error ? String(payload.error) : `Falha (${response.status})`);
    return payload as T;
  }, [token]);

  const hydrate = useCallback((version: TemplateVersion | undefined) => {
    const definition = version?.definition ?? {};
    const nextItems = normalizeItems(definition);
    setSourceDefinition(definition);
    setItems(nextItems);
    setSelectedId(nextItems[0]?.id ?? "");
    setSourceVersionId(version?.id ?? "");
  }, []);

  useEffect(() => {
    if (!open || !template) return;
    setLoading(true);
    setChangeLog("");
    void Promise.all([
      requestJson<TemplateVersion[]>(`/admin/app-builder/templates/${template.id}/versions`),
      requestJson<{ actions: ActionRegistry[] }>("/admin/app-builder/registries"),
    ]).then(([versionRows, registries]) => {
      setVersions(versionRows);
      setActions((registries.actions ?? []).filter((action) => action.status === "active" || !action.status));
      hydrate(versionRows[0]);
    }).catch((error) => toast({ title: "Não foi possível carregar Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [hydrate, open, requestJson, template, toast]);

  const pages = useMemo(() => pagesFrom(sourceDefinition), [sourceDefinition]);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const selectedAction = useMemo(() => actions.find((action) => action.key === selected?.actionKey), [actions, selected]);
  const selectedActionRequiresInput = useMemo(() => actionRequiresInput(selectedAction), [selectedAction]);

  function chooseVersion(id: string) {
    hydrate(versions.find((version) => version.id === id));
  }
  function updateItem(patch: Partial<ActionUiItem>) {
    if (!selected) return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  }
  function addItem() {
    const action = actions[0];
    const item: ActionUiItem = {
      id: newId(), pageId: pages[0]?.id ?? "", kind: "form", actionKey: action?.key ?? "", title: action?.name ?? "Nova ação", body: "", buttonLabel: "Salvar", successMessage: "Ação concluída.", fields: fieldsFromSchema(action),
    };
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
  }
  function removeItem() {
    if (!selected) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id ?? "");
  }
  function changeAction(actionKey: string) {
    const action = actions.find((item) => item.key === actionKey);
    const nextKind: ActionUiItem["kind"] = selected?.kind === "cta" && actionRequiresInput(action) ? "form" : selected?.kind ?? "form";
    updateItem({ actionKey, kind: nextKind, title: selected?.title || action?.name || "", fields: nextKind === "form" ? fieldsFromSchema(action) : [] });
  }
  function changeKind(kind: string) {
    const requested = kind as ActionUiItem["kind"];
    const nextKind: ActionUiItem["kind"] = requested === "cta" && selectedActionRequiresInput ? "form" : requested;
    updateItem({ kind: nextKind, fields: nextKind === "form" ? fieldsFromSchema(selectedAction) : [] });
  }
  function updateField(index: number, patch: Partial<ActionField>) {
    if (!selected) return;
    const fields = selected.fields.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      if (patch.required === false && isContractRequired(selectedAction, field.key)) return { ...field, ...patch, required: true };
      return { ...field, ...patch };
    });
    updateItem({ fields });
  }

  async function save() {
    if (!template) return;
    if (items.some((item) => !item.pageId || !item.actionKey || !item.buttonLabel.trim())) {
      toast({ title: "Preencha página, Action e texto do botão em todos os itens", variant: "destructive" });
      return;
    }
    const invalidCta = items.find((item) => item.kind === "cta" && actionRequiresInput(actions.find((action) => action.key === item.actionKey)));
    if (invalidCta) {
      toast({ title: "Esta Action exige dados de entrada", description: "Use um formulário para Actions que exigem pelo menos um campo.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const definition = JSON.parse(JSON.stringify(sourceDefinition ?? {})) as JsonObject;
      definition.actionUi = items.map((item) => {
        const action = actions.find((registryAction) => registryAction.key === item.actionKey);
        const contractRequired = new Set(fieldsFromSchema(action).filter((field) => field.required).map((field) => field.key));
        return {
          id: item.id, pageId: item.pageId, kind: item.kind, actionKey: item.actionKey,
          title: item.title.trim(), body: item.body.trim(), buttonLabel: item.buttonLabel.trim(), successMessage: item.successMessage.trim() || "Ação concluída.",
          ...(item.kind === "form" ? { fields: item.fields.map((field) => ({ key: field.key, label: field.label.trim() || field.key, inputType: field.inputType, placeholder: field.placeholder.trim(), required: field.required || contractRequired.has(field.key) })) } : { input: {} }),
        };
      });
      await requestJson(`/admin/app-builder/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ definition, changeLog: changeLog.trim() || "Configuração visual de Actions/CTAs" }),
      });
      toast({ title: "Nova Template Version criada", description: "A versão foi salva como draft. Publique a versão e depois um novo snapshot do App Instance." });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Erro ao salvar Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />CTAs e formulários · {template?.name ?? "Template"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="space-y-1.5"><p className="text-xs font-semibold">Versão base</p><Select value={sourceVersionId} onValueChange={chooseVersion} disabled={loading}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version} · {version.status}</SelectItem>)}</SelectContent></Select></div>
            <Button className="w-full" variant="outline" onClick={addItem} disabled={loading || actions.length === 0 || pages.length === 0}><Plus className="mr-2 h-4 w-4" />Adicionar CTA/Formulário</Button>
            <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary/5" : ""}`}><p className="truncate text-sm font-semibold">{item.title || item.buttonLabel || item.actionKey}</p><div className="mt-1 flex gap-1"><Badge variant="outline" className="text-[9px]">{item.kind === "form" ? "Formulário" : "CTA"}</Badge><Badge variant="secondary" className="max-w-[180px] truncate font-mono text-[9px]">{item.actionKey}</Badge></div></button>)}</div>
          </aside>
          <section className="min-w-0 rounded-xl border p-4">
            {loading ? <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : !selected ? <div className="py-16 text-center text-sm text-muted-foreground">Adicione ou selecione uma ação.</div> : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Configuração visual</p><p className="mt-1 text-xs text-muted-foreground">A execução continua protegida pelo Action Registry e pela policy do App Instance.</p></div><Button size="sm" variant="destructive" onClick={removeItem}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remover</Button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><p className="text-xs font-semibold">Página</p><Select value={selected.pageId} onValueChange={(pageId) => updateItem({ pageId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{pages.map((page) => <SelectItem key={page.id} value={page.id}>{page.title}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><p className="text-xs font-semibold">Tipo</p><Select value={selected.kind} onValueChange={changeKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cta" disabled={selectedActionRequiresInput}>Botão / CTA</SelectItem><SelectItem value="form">Formulário</SelectItem></SelectContent></Select>{selectedActionRequiresInput && <p className="text-[10px] text-amber-700">Esta Action exige entrada e deve ser usada como formulário.</p>}</div>
                  <div className="space-y-1.5 sm:col-span-2"><p className="text-xs font-semibold">Action Registry</p><Select value={selected.actionKey} onValueChange={changeAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{actions.map((action) => <SelectItem key={action.key} value={action.key}>{action.name} · {action.key}</SelectItem>)}</SelectContent></Select>{selectedAction && <p className="text-[10px] text-muted-foreground">Risco: {selectedAction.riskLevel ?? "low"}{selectedAction.requiredPermissions?.length ? ` · Permissões: ${selectedAction.requiredPermissions.join(", ")}` : ""}</p>}</div>
                  <div className="space-y-1.5"><p className="text-xs font-semibold">Título</p><Input value={selected.title} onChange={(event) => updateItem({ title: event.target.value })} /></div>
                  <div className="space-y-1.5"><p className="text-xs font-semibold">Texto do botão</p><Input value={selected.buttonLabel} onChange={(event) => updateItem({ buttonLabel: event.target.value })} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><p className="text-xs font-semibold">Descrição</p><Textarea rows={3} value={selected.body} onChange={(event) => updateItem({ body: event.target.value })} /></div>
                  <div className="space-y-1.5 sm:col-span-2"><p className="text-xs font-semibold">Mensagem de sucesso</p><Input value={selected.successMessage} onChange={(event) => updateItem({ successMessage: event.target.value })} /></div>
                </div>
                {selected.kind === "form" && <div className="space-y-3"><div><p className="text-sm font-semibold">Campos do formulário</p><p className="text-xs text-muted-foreground">Gerados somente a partir do input_schema do Registry; requisitos mínimos do contrato não podem ser removidos.</p></div>{selected.fields.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">Esta Action não declara campos de entrada.</div> : selected.fields.map((field, index) => { const lockedRequired = isContractRequired(selectedAction, field.key); return <div key={field.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px_1fr_auto]"><Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} placeholder="Rótulo" /><Select value={field.inputType} onValueChange={(inputType) => updateField(index, { inputType: inputType as ActionField["inputType"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text">Texto</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="tel">Telefone</SelectItem><SelectItem value="number">Número</SelectItem><SelectItem value="textarea">Texto longo</SelectItem></SelectContent></Select><Input value={field.placeholder} onChange={(event) => updateField(index, { placeholder: event.target.value })} placeholder={field.key} /><Button type="button" variant={field.required ? "default" : "outline"} size="sm" disabled={lockedRequired} onClick={() => updateField(index, { required: !field.required })}>{lockedRequired ? "Obrigatório" : field.required ? "Obrigatório" : "Opcional"}</Button></div>; })}</div>}
              </div>
            )}
          </section>
        </div>
        <div className="space-y-1.5"><p className="text-xs font-semibold">Registro da alteração</p><Input value={changeLog} onChange={(event) => setChangeLog(event.target.value)} placeholder="Ex.: formulário de atualização do perfil" /></div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving || loading || !sourceVersionId}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Criar nova versão draft"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
