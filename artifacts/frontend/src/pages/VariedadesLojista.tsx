import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Video, Loader2, Trash2, Clock, Tag, MapPin, ChefHat, Sparkles, Percent, MessageSquareText } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const CATEGORIA_INFO: Record<string, { label: string; icon: typeof MapPin }> = {
  viagens: { label: "Viagens", icon: MapPin },
  receitas: { label: "Receitas", icon: ChefHat },
  variedades: { label: "Variedades", icon: Sparkles },
};

type VariedadeDia = {
  id: string;
  categoria: string;
  titulo: string;
  conteudoTexto: string | null;
  videoUrl: string | null;
  promocaoTipo: "produto" | "texto_livre" | null;
  promocaoProdutoId: string | null;
  promocaoDescontoPercentual: string | null;
  promocaoTexto: string | null;
  createdAt: string;
  expiresAt: string;
};

function horasRestantes(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expirado";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h restantes` : `${m}min restantes`;
}

// Variedades do dia — parceiro fala sobre um assunto (texto e/ou vídeo) e
// pode juntar uma promoção real (produto do catálogo com desconto) ou só um
// anúncio em texto. 1 vaga por categoria por dia, quem chega primeiro.
// Expira sozinho em 24h. Vira conteúdo real na home do Praça.ai e na aba
// específica da categoria (ex: Viagens).
export default function VariedadesLojista() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categoria, setCategoria] = useState("");
  const [categoriaCustom, setCategoriaCustom] = useState("");
  const [titulo, setTitulo] = useState("");
  const [conteudoTexto, setConteudoTexto] = useState("");
  const [uploading, setUploading] = useState(false);
  const [videoPath, setVideoPath] = useState<{ objectPath: string; previewUrl: string } | null>(null);
  const [promocaoTipo, setPromocaoTipo] = useState<"nenhuma" | "produto" | "texto_livre">("nenhuma");
  const [promocaoProdutoId, setPromocaoProdutoId] = useState("");
  const [promocaoDesconto, setPromocaoDesconto] = useState("");
  const [promocaoTexto, setPromocaoTexto] = useState("");

  const categoriaFinal = categoria === "outra" ? categoriaCustom.trim().toLowerCase() : categoria;

  const { data: vagas } = useQuery<{ categoriasPadrao: string[]; ocupadas: string[] }>({
    queryKey: ["variedades-vagas-hoje"],
    queryFn: () => fetch(`/api/variedades-dia/vagas-hoje`, { headers: authHeaders() }).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: minhas = [], isLoading } = useQuery<VariedadeDia[]>({
    queryKey: ["variedades-dia", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/variedades-dia`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  const { data: produtos = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ["produtos-select", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && promocaoTipo === "produto",
  });

  async function handleVideo(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploadRes.ok) throw new Error("Falha no upload");
      setVideoPath({ objectPath: result.objectPath, previewUrl: URL.createObjectURL(file) });
    } catch {
      toast({ title: "Erro no upload do vídeo. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function limpar() {
    setCategoria(""); setCategoriaCustom(""); setTitulo(""); setConteudoTexto("");
    setVideoPath(null); setPromocaoTipo("nenhuma"); setPromocaoProdutoId(""); setPromocaoDesconto(""); setPromocaoTexto("");
  }

  const publicar = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/variedades-dia`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          categoria: categoriaFinal,
          titulo,
          conteudoTexto: conteudoTexto.trim() || undefined,
          videoUrl: videoPath?.objectPath || undefined,
          promocaoTipo: promocaoTipo === "nenhuma" ? undefined : promocaoTipo,
          promocaoProdutoId: promocaoTipo === "produto" ? promocaoProdutoId || undefined : undefined,
          promocaoDescontoPercentual: promocaoTipo === "produto" ? promocaoDesconto || undefined : undefined,
          promocaoTexto: promocaoTipo === "texto_livre" ? promocaoTexto.trim() || undefined : undefined,
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Falha ao publicar");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Publicado!", description: "Fica no ar por 24h na Praça.ai." });
      qc.invalidateQueries({ queryKey: ["variedades-dia", tenantId] });
      qc.invalidateQueries({ queryKey: ["variedades-vagas-hoje"] });
      limpar();
    },
    onError: (err: any) => toast({ title: "Não foi possível publicar", description: err.message, variant: "destructive" }),
  });

  const remover = useMutation({
    mutationFn: (id: string) => fetch(`/api/tenants/${tenantId}/variedades-dia/${id}`, { method: "DELETE", headers: authHeaders() }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao remover"); return r; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variedades-dia", tenantId] });
      qc.invalidateQueries({ queryKey: ["variedades-vagas-hoje"] });
    },
    onError: (err: Error) => toast({ title: "Não foi possível remover", description: err.message, variant: "destructive" }),
  });

  const podePublicar = !!categoriaFinal && !!titulo.trim() && (!!conteudoTexto.trim() || !!videoPath) && !publicar.isPending;
  const vagaOcupada = categoriaFinal && vagas?.ocupadas.includes(categoriaFinal);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Variedades do Dia</h1>
        <p className="text-sm text-muted-foreground">Fale sobre um assunto e, se quiser, junte uma promoção — 1 vaga por categoria, por dia.</p>
      </div>

      {vagas && (
        <div className="flex flex-wrap gap-2">
          {vagas.categoriasPadrao.map((cat) => {
            const info = CATEGORIA_INFO[cat];
            const ocupada = vagas.ocupadas.includes(cat);
            return (
              <Badge key={cat} variant={ocupada ? "secondary" : "outline"} className="gap-1.5">
                {info?.icon && <info.icon className="h-3 w-3" />}
                {info?.label ?? cat}
                <span className={ocupada ? "text-muted-foreground" : "text-emerald-600 font-medium"}>
                  {ocupada ? "· ocupada hoje" : "· livre"}
                </span>
              </Badge>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORIA_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>{info.label}</SelectItem>
                ))}
                <SelectItem value="outra">Outra (escrever)</SelectItem>
              </SelectContent>
            </Select>
            {categoria === "outra" && (
              <Input placeholder="Nome da categoria" value={categoriaCustom} onChange={(e) => setCategoriaCustom(e.target.value)} />
            )}
            {vagaOcupada && (
              <p className="text-xs text-destructive">Essa categoria já tem publicação hoje — escolha outra ou tenta amanhã.</p>
            )}
          </div>

          <Input placeholder="Título (ex: Um fim de tarde em Chapecó)" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={100} />
          <Textarea placeholder="Escreva sobre o assunto (opcional se enviar vídeo)" value={conteudoTexto} onChange={(e) => setConteudoTexto(e.target.value)} rows={4} />

          {!videoPath ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-16 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted/50"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Video className="h-5 w-5" /> Anexar vídeo (opcional)</>}
            </button>
          ) : (
            <div className="relative">
              <video src={videoPath.previewUrl} className="w-full rounded-lg max-h-64" controls />
              <Button type="button" variant="ghost" size="sm" onClick={() => setVideoPath(null)} className="mt-2">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover vídeo
              </Button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleVideo(e.target.files?.[0] ?? null)} />

          <div className="space-y-2 border-t pt-4">
            <Label className="text-xs">Promoção junto (opcional)</Label>
            <Select value={promocaoTipo} onValueChange={(v) => setPromocaoTipo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem promoção</SelectItem>
                <SelectItem value="produto"><span className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" /> Produto do catálogo com desconto</span></SelectItem>
                <SelectItem value="texto_livre"><span className="flex items-center gap-1.5"><MessageSquareText className="h-3.5 w-3.5" /> Anúncio em texto livre</span></SelectItem>
              </SelectContent>
            </Select>

            {promocaoTipo === "produto" && (
              <div className="grid grid-cols-2 gap-2">
                <Select value={promocaoProdutoId} onValueChange={setPromocaoProdutoId}>
                  <SelectTrigger className="col-span-2"><SelectValue placeholder="Escolha o produto" /></SelectTrigger>
                  <SelectContent>
                    {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="% de desconto" value={promocaoDesconto} onChange={(e) => setPromocaoDesconto(e.target.value)} className="col-span-2" />
              </div>
            )}
            {promocaoTipo === "texto_livre" && (
              <Textarea placeholder="Ex: Frete grátis pra região hoje" value={promocaoTexto} onChange={(e) => setPromocaoTexto(e.target.value)} rows={2} />
            )}
          </div>

          <Button className="w-full" disabled={!podePublicar || !!vagaOcupada} onClick={() => publicar.mutate()}>
            {publicar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Publicar
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Minhas publicações ativas</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && minhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma publicação ativa.</p>}
        <div className="space-y-2">
          {minhas.map((v) => {
            const info = CATEGORIA_INFO[v.categoria];
            return (
              <Card key={v.id}>
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Tag className="h-3 w-3" /> {info?.label ?? v.categoria}
                      <Clock className="h-3 w-3 ml-2" /> {horasRestantes(v.expiresAt)}
                    </div>
                    <p className="font-semibold truncate">{v.titulo}</p>
                    {v.promocaoTipo && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {v.promocaoTipo === "produto" ? `Promoção: ${v.promocaoDescontoPercentual}% off` : `Promoção: ${v.promocaoTexto}`}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remover.mutate(v.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
