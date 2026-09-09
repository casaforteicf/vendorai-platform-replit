import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, Pencil, Save } from "lucide-react";

type AgentKey = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding";

type VerticalTemplate = {
  id: string;
  nome: string;
  descricao?: string | null;
  funilPadrao?: string[] | null;
  categoriasProdutoSugeridas?: string[] | null;
  promptsSugeridos?: Partial<Record<AgentKey, string>> | null;
  ativo?: boolean | null;
};

const AGENTS: Array<{ key: AgentKey; label: string }> = [
  { key: "sdr", label: "SDR" },
  { key: "closer", label: "Closer" },
  { key: "followup", label: "Follow-up" },
  { key: "reactivation", label: "Reativação" },
  { key: "scheduler", label: "Agendamento" },
  { key: "service", label: "Atendimento" },
  { key: "onboarding", label: "Onboarding" },
];

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function VerticalTemplateEditor({
  template,
  onSaved,
}: {
  template: VerticalTemplate;
  onSaved?: () => unknown | Promise<unknown>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [descricao, setDescricao] = useState("");
  const [funil, setFunil] = useState("");
  const [categorias, setCategorias] = useState("");
  const [prompts, setPrompts] = useState<Partial<Record<AgentKey, string>>>({});

  useEffect(() => {
    if (!open) return;
    setNome(template.nome);
    setAtivo(template.ativo !== false);
    setDescricao(template.descricao ?? "");
    setFunil((template.funilPadrao ?? []).join("\n"));
    setCategorias((template.categoriasProdutoSugeridas ?? []).join("\n"));
    setPrompts(template.promptsSugeridos ?? {});
  }, [open, template]);

  async function save() {
    if (!nome.trim()) {
      toast({ title: "Informe o nome do segmento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/segment-templates/${template.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          nome: nome.trim(),
          ativo,
          descricao: descricao.trim() || null,
          funilPadrao: lines(funil),
          categoriasProdutoSugeridas: lines(categorias),
          promptsSugeridos: prompts,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar o segmento");

      await onSaved?.();
      toast({
        title: "Segmento atualizado",
        description: template.nome !== nome.trim()
          ? "Nome e vínculos dos tenants foram sincronizados com segurança."
          : "Configuração operacional atualizada.",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao salvar segmento",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    setDuplicating(true);
    try {
      const response = await fetch(`/api/admin/segment-templates/${template.id}/duplicate`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível duplicar o segmento");
      await onSaved?.();
      toast({ title: "Segmento duplicado", description: "A cópia foi criada como inativa para revisão antes de uso." });
      setOpen(false);
    } catch (error) {
      toast({ title: "Erro ao duplicar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <Pencil className="h-4 w-4" />
          Editar segmento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar segmento</DialogTitle>
          <DialogDescription>
            O ID interno permanece imutável. Se o nome mudar, os tenants e perfis vinculados são atualizados juntos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>Nome do segmento</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Distribuidora de Ferragens" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border px-4 h-10">
              <div>
                <p className="text-xs font-medium">Ativo</p>
                <p className="text-[10px] text-muted-foreground">Inativo = arquivado</p>
              </div>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Descrição do segmento..." />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Etapas do funil</Label>
              <p className="text-xs text-muted-foreground">Uma etapa por linha. Aplicada quando o tenant ainda não possui funil.</p>
              <Textarea value={funil} onChange={(e) => setFunil(e.target.value)} rows={8} placeholder={"Novo lead\nQualificação\nProposta\nGanho"} />
            </div>
            <div className="space-y-2">
              <Label>Categorias sugeridas</Label>
              <p className="text-xs text-muted-foreground">Uma categoria por linha.</p>
              <Textarea value={categorias} onChange={(e) => setCategorias(e.target.value)} rows={8} placeholder={"Categoria A\nCategoria B"} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Prompts dos agentes</Label>
              <p className="text-xs text-muted-foreground mt-1">Sugestões do template; não sobrescrevem prompts personalizados dos tenants.</p>
            </div>
            {AGENTS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5 rounded-lg border p-3">
                <Label>{label}</Label>
                <Textarea
                  value={prompts[key] ?? ""}
                  onChange={(e) => setPrompts((current) => ({ ...current, [key]: e.target.value }))}
                  rows={4}
                  placeholder={`Orientações padrão do agente ${label}...`}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={duplicate} disabled={saving || duplicating} className="gap-2">
            {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Duplicar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar alterações
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
