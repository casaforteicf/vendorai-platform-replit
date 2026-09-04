import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MonitorSmartphone } from "lucide-react";
import SchemaRuntimeRenderer, { type RuntimePayload } from "@/pages/app-runtime/SchemaRuntimeRenderer";
import { useToast } from "@/hooks/use-toast";

type JsonObject = Record<string, unknown>;
type TemplateLike = { id: string; name: string };
type TemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  definition: JsonObject;
  publishedAt?: string | null;
};

type Props = {
  template: TemplateLike | null;
  token: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const BLOCK_TYPES = new Set(["hero", "text", "callout", "metrics", "list", "cards", "divider"]);

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePermissions(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,]/g).map((item) => item.trim()).filter(Boolean)));
}

function visibleTo(value: unknown, roleKey: string, permissions: string[]): boolean {
  const visibility = asObject(value);
  const roles = strings(visibility.roles);
  const required = strings(visibility.permissions);
  const mode = visibility.permissionMode === "any" ? "any" : "all";
  if (roles.length > 0 && !roles.includes(roleKey)) return false;
  if (required.length === 0) return true;
  const current = new Set(permissions);
  return mode === "any" ? required.some((permission) => current.has(permission)) : required.every((permission) => current.has(permission));
}

function previewPayload(template: TemplateLike, version: TemplateVersion, roleKey: string, permissions: string[]): RuntimePayload {
  const definition = asObject(version.definition);
  const runtimeSource = asObject(definition.runtime);
  const pages = objects(runtimeSource.pages).flatMap((page, pageIndex) => {
    if (!visibleTo(page.visibility, roleKey, permissions)) return [];
    const id = text(page.id) ?? `page-${pageIndex + 1}`;
    const blocks = objects(page.blocks).flatMap((block, blockIndex) => {
      const type = text(block.type);
      if (!type || !BLOCK_TYPES.has(type) || !visibleTo(block.visibility, roleKey, permissions)) return [];
      return [{
        id: text(block.id) ?? `block-${blockIndex + 1}`,
        type: type as "hero" | "text" | "callout" | "metrics" | "list" | "cards" | "divider",
        props: asObject(block.props),
      }];
    });
    return [{
      id,
      title: text(page.title) ?? id,
      ...(text(page.subtitle) ? { subtitle: text(page.subtitle) } : {}),
      ...(text(page.icon) ? { icon: text(page.icon) } : {}),
      blocks,
    }];
  });

  const requestedDefault = text(runtimeSource.defaultPageId);
  const defaultPageId = requestedDefault && pages.some((page) => page.id === requestedDefault)
    ? requestedDefault
    : pages[0]?.id ?? null;

  return {
    runtimeVersion: 1,
    publishedVersionId: version.id,
    publishedVersion: version.version,
    publishedAt: version.publishedAt,
    app: {
      id: `preview-${template.id}`,
      name: template.name,
      slug: "preview",
      theme: {},
      whiteLabel: { appName: template.name },
      navigation: pages.map((page) => ({ id: `nav-${page.id}`, label: page.title, pageId: page.id })),
    },
    template: { versionId: version.id, version: version.version },
    runtime: { version: 1, defaultPageId, pages },
  };
}

export default function TemplateRuntimePreviewDialog({ template, token, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [versionId, setVersionId] = useState("");
  const [roleKey, setRoleKey] = useState("customer");
  const [permissionText, setPermissionText] = useState("");

  const loadVersions = useCallback(async () => {
    if (!open || !template || !token) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/app-builder/templates/${template.id}/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Falha ao carregar versões (${response.status})`);
      const rows = await response.json() as TemplateVersion[];
      setVersions(rows);
      setVersionId((current) => current && rows.some((item) => item.id === current) ? current : rows[0]?.id ?? "");
    } catch (error) {
      toast({
        title: "Não foi possível carregar a prévia",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [open, template, token, toast]);

  useEffect(() => {
    if (!open) return;
    setRoleKey("customer");
    setPermissionText("");
    void loadVersions();
  }, [loadVersions, open]);

  const selectedVersion = useMemo(() => versions.find((item) => item.id === versionId) ?? null, [versionId, versions]);
  const permissions = useMemo(() => parsePermissions(permissionText), [permissionText]);
  const payload = useMemo(
    () => template && selectedVersion ? previewPayload(template, selectedVersion, roleKey.trim() || "customer", permissions) : null,
    [permissions, roleKey, selectedVersion, template],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-[96vw] xl:max-w-7xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-primary" />
            Prévia do runtime · {template?.name ?? "Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Template Version</span>
            <Select value={versionId} onValueChange={setVersionId} disabled={loading || versions.length === 0}>
              <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione"} /></SelectTrigger>
              <SelectContent>
                {versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version} · {version.status}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Simular role_key</span>
            <Input value={roleKey} onChange={(event) => setRoleKey(event.target.value.toLowerCase())} placeholder="customer" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Simular permissões</span>
            <Input value={permissionText} onChange={(event) => setPermissionText(event.target.value)} placeholder="orders.read, support.create" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Sem salvar</Badge>
          <Badge variant="outline">Sem publicar</Badge>
          <span>A visibilidade é recalculada localmente para o perfil simulado e a renderização usa o mesmo componente do app final.</span>
        </div>

        {loading ? (
          <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !payload ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Nenhuma Template Version disponível para prévia.</div>
        ) : (
          <div className="rounded-2xl border bg-slate-50 p-3 sm:p-5">
            <SchemaRuntimeRenderer payload={payload} lang="pt" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
