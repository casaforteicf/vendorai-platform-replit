import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FormInput, Loader2, Save, ShieldCheck } from "lucide-react";

type JsonObject = Record<string, unknown>;
type TemplateLike = { id: string; name: string };
type TemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  definition: JsonObject;
};
type ActionRegistryItem = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  inputSchema: JsonObject;
  requiredPermissions?: string[];
  riskLevel: string;
  status: string;
};
type RegistriesResponse = { actions?: ActionRegistryItem[] };
type ActionField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "number" | "checkbox";
  required: boolean;
  options?: string[];
};

type Props = {
  template: TemplateLike | null;
  token: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function newId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${suffix}`;
}

function humanize(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function schemaTypes(schema: JsonObject): string[] {
  if (typeof schema.type === "string") return [schema.type];
  return stringArray(schema.type);
}

function fieldType(name: string, schema: JsonObject): ActionField["type"] | null {
  const types = schemaTypes(schema);
  if (stringArray(schema.enum).length > 0) return "select";
  if (types.includes("boolean")) return "checkbox";
  if (types.includes("number") || types.includes("integer")) return "number";
  if (!types.includes("string")) return null;
  if (schema.format === "email") return "email";
  if (/phone|telefone|celular/i.test(name)) return "tel";
  if (/message|description|descricao|notes|observa|body/i.test(name)) return "textarea";
  return "text";
}

function actionFields(action: ActionRegistryItem | null): ActionField[] {
  if (!action) return [];
  const schema = asObject(action.inputSchema);
  const properties = asObject(schema.properties);
  const required = new Set(stringArray(schema.required));
  return Object.entries(properties).flatMap(([name, rawSchema]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) return [];
    const property = asObject(rawSchema);
    const type = fieldType(name, property);
    if (!type) return [];
    return [{
      name,
      label: humanize(name),
      type,
      required: required.has(name),
      ...(type === "select" ? { options: stringArray(property.enum) } : {}),
    }];
  }).slice(0, 20);
}

function pagesFrom(definition: JsonObject): JsonObject[] {
  return objectArray(asObject(definition.runtime).pages);
}

function actionBlocks(page: JsonObject | null): JsonObject[] {
  return objectArray(page?.blocks).filter((block) => block.type === "action_form");
}

export default function TemplateActionEditorDialog({ template, token, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [actions, setActions] = useState<ActionRegistryItem[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [definition, setDefinition] = useState<JsonObject>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [blockId, setBlockId] = useState("__new__");
  const [formId, setFormId] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [title, setTitle] = useState("Atualizar informações");
  const [body, setBody] = useState("");
  const [submitLabel, setSubmitLabel] = useState("Salvar");
  const [successMessage, setSuccessMessage] = useState("Dados salvos com sucesso.");
  const [changeLog, setChangeLog] = useState("");

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

  const resetForm = useCallback((availableActions: ActionRegistryItem[]) => {
    const firstAction = availableActions[0]?.key ?? "";
    setBlockId("__new__");
    setFormId(newId("action"));
    setActionKey(firstAction);
    setTitle("Atualizar informações");
    setBody("");
    setSubmitLabel("Salvar");
    setSuccessMessage("Dados salvos com sucesso.");
  }, []);

  const hydrate = useCallback((version: TemplateVersion | null, availableActions: ActionRegistryItem[]) => {
    setSourceVersionId(version?.id ?? "");
    setDefinition(cloneJson(version?.definition ?? {}));
    setPageIndex(0);
    resetForm(availableActions);
  }, [resetForm]);

  const load = useCallback(async () => {
    if (!open || !template) return;
    setLoading(true);
    try {
      const [versionRows, registries] = await Promise.all([
        requestJson<TemplateVersion[]>(`/admin/app-builder/templates/${template.id}/versions`),
        requestJson<RegistriesResponse>("/admin/app-builder/registries"),
      ]);
      const safeActions = (registries.actions ?? []).filter((action) => action.status === "active" && action.riskLevel === "low");
      setVersions(versionRows);
      setActions(safeActions);
      hydrate(versionRows[0] ?? null, safeActions);
      setChangeLog("");
    } catch (error) {
      toast({ title: "Não foi possível carregar as Actions", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [hydrate, open, requestJson, template, toast]);

  useEffect(() => { void load(); }, [load]);

  const pages = useMemo(() => pagesFrom(definition), [definition]);
  const page = pages[pageIndex] ?? null;
  const existingForms = useMemo(() => actionBlocks(page), [page]);
  const selectedAction = useMemo(() => actions.find((action) => action.key === actionKey) ?? null, [actionKey, actions]);
  const fields = useMemo(() => actionFields(selectedAction), [selectedAction]);

  function chooseVersion(versionId: string) {
    const version = versions.find((row) => row.id === versionId) ?? null;
    hydrate(version, actions);
  }

  function choosePage(value: string) {
    setPageIndex(Number(value));
    resetForm(actions);
  }

  function chooseBlock(value: string) {
    setBlockId(value);
    if (value === "__new__") {
      resetForm(actions);
      return;
    }
    const block = existingForms.find((item) => stringValue(item.id) === value);
    if (!block) return;
    const props = asObject(block.props);
    setFormId(stringValue(block.id) || newId("action"));
    setActionKey(stringValue(props.actionKey));
    setTitle(stringValue(props.title) || "Formulário");
    setBody(stringValue(props.body));
    setSubmitLabel(stringValue(props.submitLabel) || "Enviar");
    setSuccessMessage(stringValue(props.successMessage) || "Dados salvos com sucesso.");
  }

  async function saveVersion() {
    if (!template || !page || !selectedAction || fields.length === 0) return;
    if (!formId.trim()) {
      toast({ title: "Informe um ID para o bloco", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const nextDefinition = cloneJson(definition);
      const runtime = { ...asObject(nextDefinition.runtime) };
      const nextPages = objectArray(runtime.pages).map((item) => ({ ...item }));
      const targetPage = { ...asObject(nextPages[pageIndex]) };
      const blocks = objectArray(targetPage.blocks).map((item) => ({ ...item }));
      const existingIndex = blocks.findIndex((item) => stringValue(item.id) === blockId && item.type === "action_form");
      const existing = existingIndex >= 0 ? blocks[existingIndex] : null;
      const actionBlock: JsonObject = {
        ...(existing ?? {}),
        id: formId.trim(),
        type: "action_form",
        props: {
          actionKey: selectedAction.key,
          title: title.trim() || selectedAction.name,
          ...(body.trim() ? { body: body.trim() } : {}),
          submitLabel: submitLabel.trim() || "Enviar",
          successMessage: successMessage.trim() || "Dados salvos com sucesso.",
          fields,
        },
      };
      if (existingIndex >= 0) blocks[existingIndex] = actionBlock;
      else blocks.push(actionBlock);
      targetPage.blocks = blocks;
      nextPages[pageIndex] = targetPage;
      runtime.pages = nextPages;
      nextDefinition.runtime = runtime;

      const created = await requestJson<TemplateVersion>(`/admin/app-builder/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          definition: nextDefinition,
          changeLog: changeLog.trim() || `Configura formulário para ${selectedAction.key}`,
        }),
      });
      toast({
        title: `Versão ${created.version} criada em rascunho`,
        description: "A Action ainda precisa estar habilitada e publicada na App Instance para poder executar.",
      });
      await load();
    } catch (error) {
      toast({ title: "Erro ao salvar formulário", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FormInput className="h-5 w-5 text-primary" />Formulários e Actions · {template?.name ?? "Template"}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
          <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>Somente Actions <strong>low-risk</strong> ativas aparecem aqui. Os campos são derivados do <code>input_schema</code>; o formulário não pode criar parâmetros fora do contrato do Registry.</p></div>
        </div>

        {loading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5"><span className="text-xs font-medium">Template Version de origem</span><Select value={sourceVersionId} onValueChange={chooseVersion} disabled={versions.length === 0}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version} · {version.status}</SelectItem>)}</SelectContent></Select></label>
              <label className="space-y-1.5"><span className="text-xs font-medium">Página</span><Select value={String(pageIndex)} onValueChange={choosePage} disabled={pages.length === 0}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{pages.map((item, index) => <SelectItem key={`${stringValue(item.id)}-${index}`} value={String(index)}>{stringValue(item.title) || stringValue(item.id) || `Página ${index + 1}`}</SelectItem>)}</SelectContent></Select></label>
            </div>

            {pages.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Crie uma página no Editor visual antes de adicionar um formulário.</div> : actions.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma Action low-risk executável está registrada.</div> : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5"><span className="text-xs font-medium">Bloco de formulário</span><Select value={blockId} onValueChange={chooseBlock}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__new__">+ Novo formulário</SelectItem>{existingForms.map((block, index) => <SelectItem key={stringValue(block.id) || index} value={stringValue(block.id) || `form-${index}`}>{stringValue(asObject(block.props).title) || stringValue(block.id) || `Formulário ${index + 1}`}</SelectItem>)}</SelectContent></Select></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium">Action</span><Select value={actionKey} onValueChange={setActionKey}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{actions.map((action) => <SelectItem key={action.key} value={action.key}>{action.name} · {action.key}</SelectItem>)}</SelectContent></Select></label>
                </div>

                {selectedAction && <div className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{selectedAction.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedAction.description}</p></div><Badge variant="outline" className="font-mono text-[10px]">{selectedAction.key}</Badge></div><div className="mt-3 flex flex-wrap gap-2">{(selectedAction.requiredPermissions ?? []).map((permission) => <Badge key={permission} variant="secondary" className="font-mono text-[10px]">{permission}</Badge>)}{(selectedAction.requiredPermissions ?? []).length === 0 && <Badge variant="secondary" className="text-[10px]">Sem permissão adicional</Badge>}</div></div>}

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5"><span className="text-xs font-medium">ID do bloco</span><Input value={formId} onChange={(event) => setFormId(event.target.value)} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium">Título</span><Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                  <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-medium">Texto de apoio</span><Textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium">CTA</span><Input value={submitLabel} onChange={(event) => setSubmitLabel(event.target.value)} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-medium">Mensagem de sucesso</span><Input value={successMessage} onChange={(event) => setSuccessMessage(event.target.value)} /></label>
                </div>

                <div className="rounded-xl border p-4"><p className="text-xs font-semibold">Campos derivados do input_schema</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{fields.map((field) => <div key={field.name} className="rounded-lg bg-muted/30 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{field.label}</span><Badge variant="outline" className="text-[9px]">{field.type}</Badge></div><p className="mt-1 font-mono text-[10px] text-muted-foreground">{field.name}{field.required ? " · obrigatório" : " · opcional"}</p></div>)}</div></div>

                <label className="block space-y-1.5"><span className="text-xs font-medium">Registro da alteração</span><Input value={changeLog} onChange={(event) => setChangeLog(event.target.value)} placeholder="Ex.: adiciona formulário de atualização do perfil" /></label>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => void saveVersion()} disabled={saving || loading || !page || !selectedAction || fields.length === 0}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Criar nova versão em rascunho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
