import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Save } from "lucide-react";

type AgentKey = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding";

type VerticalTemplate = {
  id: string;
  nome: string;
  descricao?: string | null;
  funilPadrao?: string[] | null;
  categoriasProdutoSugeridas?: string[] | null;
  promptsSugeridos?: Partial<Record<AgentKey, string>> | null;
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
  const [descricao, setDescricao] = useState("");
  const [funil, setFunil] = useState("");
  const [categorias, setCategorias] = useState("");
  const [prompts, setPrompts] = useState<Partial<Record<AgentKey, string>>>({});

  useEffect(() => {
    if (!open) return;
    setDescricao(template.descricao ?? "");
    setFunil((template.funilPadrao ?? []).join("\n"));
    setCategorias((template.categoriasProdutoSugeridas ?? []).join("\n"));
    setPrompts(template.promptsSugeridos ?? {});
  }, [open, template]);

  async function save() {
    setSaving(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(`/api/admin/segment-templates/${template.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          descricao: descricao.trim() || null,
          funilPadrao: lines(funil),
          categoriasProdutoSugeridas: lines(categorias),
          promptsSugeridos: prompts,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar o segmento");

      await onSaved?.();
      toast({ title: "Segmento atualizado", description: "Funil, categorias e agentes foram salvos no template real." });
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <Pencil className="h-4 w-4" />
          Editar configuração do segmento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar {template.nome}</DialogTitle>
          <DialogDescription>
            O nome e o layout do segmento são preservados para não quebrar tenants existentes. Edite aqui o comportamento operacional aplicado aos clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Descrição do segmento..." />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Etapas do funil</Label>
              <p className="text-xs text-muted-foreground">Uma etapa por linha. É usada quando o tenant ainda não possui funil.</p>
              <Textarea value={funil} onChange={(e) => setFunil(e.target.value)} rows={8} placeholder={"Novo lead\nQualificação\nProposta\nGanho"} />
            </div>
            <div className="space-y-2">
              <Label>Categorias sugeridas</Label>
              <p className="text-xs text-muted-foreground">Uma categoria por linha para orientar catálogo e configuração inicial.</p>
              <Textarea value={categorias} onChange={(e) => setCategorias(e.target.value)} rows={8} placeholder={"Categoria A\nCategoria B"} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Prompts dos agentes</Label>
              <p className="text-xs text-muted-foreground mt-1">Esses prompts são sugestões do template e não sobrescrevem prompts personalizados já existentes no tenant.</p>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
