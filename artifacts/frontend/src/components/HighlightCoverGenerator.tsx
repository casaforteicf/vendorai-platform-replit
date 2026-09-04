import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bookmark, Loader2, Download } from "lucide-react";

export function HighlightCoverGenerator({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const mutation = useMutation<{ mediaUrl: string }, Error, string>({
    mutationFn: async (text) => {
      const res = await fetch(`/api/tenants/${tenantId}/content/highlight-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
        body: JSON.stringify({ label: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? "Falha ao gerar capa");
      }
      return res.json();
    },
    onSuccess: (data) => setCoverUrl(data.mediaUrl),
    onError: (err) => toast({ title: "Erro ao gerar capa", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          Capa de Destaque
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          O Instagram não tem como criar Destaque por API — isso gera a imagem da capa na cor da sua marca; o upload final é manual, na hora de criar o Destaque no app.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 max-w-sm">
          <div className="flex-1">
            <Label className="sr-only">Nome do destaque</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Produtos, Depoimentos, Como funciona"
              maxLength={30}
            />
          </div>
          <Button onClick={() => mutation.mutate(label)} disabled={!label.trim() || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar"}
          </Button>
        </div>

        {coverUrl && (
          <div className="flex items-center gap-3">
            <div className="h-24 w-24 rounded-full overflow-hidden border">
              <img src={coverUrl} alt={label} className="h-full w-full object-cover" />
            </div>
            <a href={coverUrl} download={`destaque-${label.toLowerCase()}.jpg`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Baixar
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
