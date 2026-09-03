import { useState } from "react";
import { Expand, Eraser, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type Operation = "image_replace_background" | "image_remove_object" | "image_outpaint";

type Props = {
  assetId: string;
  filename?: string | null;
  capabilities?: Record<string, "ready" | "building">;
  onUpdated?: () => Promise<void> | void;
};

const TOOLS: Array<{
  operation: Operation;
  label: string;
  description: string;
  placeholder: string;
  icon: typeof ImagePlus;
  requiresPrompt: boolean;
}> = [
  {
    operation: "image_replace_background",
    label: "Trocar fundo",
    description: "Substitui somente o fundo, preservando o assunto principal.",
    placeholder: "Ex.: fundo branco de estúdio, jardim contemporâneo ao entardecer...",
    icon: ImagePlus,
    requiresPrompt: true,
  },
  {
    operation: "image_remove_object",
    label: "Remover elemento",
    description: "Remove um objeto descrito e reconstrói a área ao redor.",
    placeholder: "Ex.: remover o carro estacionado à esquerda; retirar o banco da varanda...",
    icon: Eraser,
    requiresPrompt: true,
  },
  {
    operation: "image_outpaint",
    label: "Expandir imagem",
    description: "Amplia o enquadramento continuando a cena de forma coerente.",
    placeholder: "Opcional: expandir mais para os lados, revelar jardim e céu...",
    icon: Expand,
    requiresPrompt: false,
  },
];

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

export default function AdvancedImageEditPanel({ assetId, filename, capabilities, onUpdated }: Props) {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [active, setActive] = useState<Operation>("image_replace_background");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">("1536x1024");
  const [running, setRunning] = useState(false);

  const tool = TOOLS.find((item) => item.operation === active)!;
  const ready = capabilities?.[active] === "ready";

  async function run() {
    if (!tenantId || !assetId || running) return;
    if (tool.requiresPrompt && !prompt.trim()) {
      toast({ title: "Descreva a alteração", description: tool.placeholder, variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          operation: active,
          title: `${filename || "Imagem"} — ${tool.label}`,
          context: { assetId, prompt: prompt.trim() || undefined, size },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível iniciar a edição");
      toast({ title: `${tool.label} iniciado`, description: "A nova versão será salva na Biblioteca sem alterar o original." });
      window.setTimeout(() => void onUpdated?.(), 4000);
      setPrompt("");
    } catch (error) {
      toast({ title: "Falha na edição", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <details className="rounded-xl border bg-background">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold"><Sparkles className="h-4 w-4 text-violet-600" /> Edição avançada com IA</summary>
      <div className="space-y-3 border-t p-3">
        <div className="grid grid-cols-3 gap-1.5">
          {TOOLS.map(({ operation, label, icon: Icon }) => {
            const available = capabilities?.[operation] === "ready";
            return <button key={operation} type="button" disabled={!available} onClick={() => { setActive(operation); setPrompt(""); }} className={`rounded-lg border p-2 text-center text-[10px] font-medium ${active === operation ? "border-violet-400 bg-violet-500/[0.07] text-violet-700" : "hover:bg-muted/50"} disabled:cursor-not-allowed disabled:opacity-40`}><Icon className="mx-auto mb-1 h-4 w-4" />{label}</button>;
          })}
        </div>

        <div className="rounded-lg bg-muted/30 p-2.5"><p className="text-[11px] font-medium">{tool.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{tool.description}</p></div>

        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} placeholder={tool.placeholder} className="w-full resize-none rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-500/20" />

        <label className="block text-[10px] text-muted-foreground">Formato do resultado<select value={size} onChange={(event) => setSize(event.target.value as typeof size)} className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="1536x1024">Horizontal 3:2</option><option value="1024x1024">Quadrado 1:1</option><option value="1024x1536">Vertical 2:3</option></select></label>

        <button disabled={!ready || running} onClick={() => void run()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {running ? "Processando..." : tool.label}</button>
        <p className="text-[9px] leading-relaxed text-muted-foreground">A IA recebe instruções para preservar tudo o que não foi solicitado alterar. Sempre revise o resultado antes de usar em materiais comerciais.</p>
      </div>
    </details>
  );
}
