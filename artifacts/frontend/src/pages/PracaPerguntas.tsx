import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, Bot, Box, Clock, ExternalLink, HelpCircle,
  Loader2, Mail, Package, Phone, Search, Send, User,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type Pergunta = {
  id: string;
  productId: string;
  productName?: string;
  productSku?: string | null;
  productDescription?: string | null;
  productImageUrl?: string | null;
  productPrice?: string | number | null;
  productUnit?: string | null;
  productSupplier?: string | null;
  productDeliveryDays?: number | null;
  clienteId?: string | null;
  clienteNome?: string | null;
  clienteEmail?: string | null;
  clienteTelefone?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  pergunta: string;
  aiStatus: "nao_tentada" | "respondida" | "escalada" | "erro";
  aiConfidence?: string | number | null;
  aiReason?: string | null;
  aiDraft?: string | null;
  createdAt: string;
};

function money(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;
}

function AiStatus({ pergunta }: { pergunta: Pergunta }) {
  if (pergunta.aiStatus === "erro") {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Falha na IA</Badge>;
  }
  if (pergunta.aiStatus === "escalada") {
    return <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"><User className="h-3 w-3" /> Precisa de humano</Badge>;
  }
  return <Badge variant="outline" className="gap-1"><Bot className="h-3 w-3" /> IA não processada</Badge>;
}

function PerguntaCard({ pergunta, tenantId }: { pergunta: Pergunta; tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [resposta, setResposta] = useState(pergunta.aiDraft ?? "");

  const responder = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/praca-perguntas-pendentes/${pergunta.id}/responder`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ resposta }),
      }).then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Erro");
        return response.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["praca-perguntas-pendentes", tenantId] });
      qc.invalidateQueries({ queryKey: ["praca-perguntas-count", tenantId] });
      toast({ title: "Resposta enviada ao cliente" });
    },
    onError: (error: Error) =>
      toast({ title: "Erro ao responder", description: error.message, variant: "destructive" }),
  });

  const confidence = pergunta.aiConfidence == null ? null : Math.round(Number(pergunta.aiConfidence) * 100);
  const price = money(pergunta.productPrice);

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[220px_1fr_260px]">
          <div className="border-b bg-muted/20 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-lg border bg-background">
              {pergunta.productImageUrl ? (
                <img src={pergunta.productImageUrl} alt={pergunta.productName || "Produto"} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-10 w-10 text-muted-foreground/30" />
              )}
            </div>
            <p className="font-semibold leading-snug">{pergunta.productName || "Produto sem nome"}</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {pergunta.productSku && <p>SKU: {pergunta.productSku}</p>}
              {pergunta.productSupplier && <p>Fornecedor: {pergunta.productSupplier}</p>}
              {price && <p className="font-medium text-foreground">{price}{pergunta.productUnit ? ` / ${pergunta.productUnit}` : ""}</p>}
              {pergunta.productDeliveryDays != null && <p>Prazo cadastrado: {pergunta.productDeliveryDays} dias</p>}
            </div>
            {pergunta.productDescription && (
              <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">{pergunta.productDescription}</p>
            )}
          </div>

          <div className="space-y-4 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AiStatus pergunta={pergunta} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatDistanceToNow(parseISO(pergunta.createdAt), { locale: ptBR, addSuffix: true })}
              </span>
            </div>

            <div className="rounded-lg border bg-background p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pergunta do cliente</p>
              <p className="text-base font-semibold leading-relaxed">{pergunta.pergunta}</p>
            </div>

            {(pergunta.aiReason || confidence != null) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <Bot className="h-4 w-4" /> Análise da IA
                  {confidence != null && <Badge variant="outline" className="border-amber-300 bg-white">{confidence}% de confiança</Badge>}
                </div>
                <p>{pergunta.aiReason || "A resposta não atingiu a confiança mínima para envio automático."}</p>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium">Resposta ao cliente</label>
              <Textarea
                value={resposta}
                onChange={(event) => setResposta(event.target.value)}
                placeholder="Revise a sugestão da IA ou escreva uma resposta confirmada..."
                rows={4}
                className="resize-y text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button disabled={!resposta.trim() || responder.isPending} onClick={() => responder.mutate()}>
                {responder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Responder e concluir
              </Button>
            </div>
          </div>

          <aside className="border-t bg-muted/10 p-4 lg:border-l lg:border-t-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</p>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium"><User className="h-4 w-4 text-muted-foreground" /> {pergunta.clienteNome || "Identificação ausente"}</p>
              {pergunta.clienteTelefone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {pergunta.clienteTelefone}</p>}
              {pergunta.clienteEmail && <p className="flex items-center gap-2 break-all text-muted-foreground"><Mail className="h-4 w-4" /> {pergunta.clienteEmail}</p>}
            </div>

            <div className="mt-5 space-y-2">
              {pergunta.leadId ? (
                <Button variant="outline" className="w-full justify-between" onClick={() => { window.location.href = `/leads/${pergunta.leadId}`; }}>
                  Abrir lead <ExternalLink className="h-4 w-4" />
                </Button>
              ) : (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">Lead não vinculado</div>
              )}
              {pergunta.conversationId && (
                <Button variant="outline" className="w-full justify-between" onClick={() => { window.location.href = `/conversations?conv=${pergunta.conversationId}`; }}>
                  Abrir conversa <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PracaPerguntas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [search, setSearch] = useState("");

  const { data: perguntas = [], isLoading, error } = useQuery<Pergunta[]>({
    queryKey: ["praca-perguntas-pendentes", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/praca-perguntas-pendentes`, { headers: authHeaders() })
        .then(async (response) => {
          if (!response.ok) throw new Error("Não foi possível carregar as perguntas.");
          return response.json();
        }),
    enabled: !!tenantId,
    retry: false,
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return perguntas;
    return perguntas.filter((item) =>
      [item.pergunta,item.productName,item.productSku,item.clienteNome,item.clienteEmail,item.clienteTelefone]
        .some((value) => String(value ?? "").toLowerCase().includes(term)),
    );
  }, [perguntas, search]);

  const aiErrors = perguntas.filter((item) => item.aiStatus === "erro").length;
  const escalated = perguntas.filter((item) => item.aiStatus === "escalada").length;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <HelpCircle className="h-6 w-6" /> Perguntas de produtos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A IA responde usando o cadastro do produto. Somente dúvidas sem informação suficiente ficam nesta fila.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="px-3 py-1.5 text-sm">{perguntas.length} pendentes</Badge>
          {escalated > 0 && <Badge className="bg-amber-100 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">{escalated} escaladas</Badge>}
          {aiErrors > 0 && <Badge variant="destructive" className="px-3 py-1.5 text-sm">{aiErrors} falhas da IA</Badge>}
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, produto, SKU ou pergunta" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2].map((item) => <Skeleton key={item} className="h-72 w-full" />)}</div>
      ) : error ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center"><AlertTriangle className="mb-3 h-8 w-8 text-destructive" /><p className="font-medium">Não foi possível carregar as perguntas</p><p className="text-sm text-muted-foreground">Tente novamente ou confira a conexão da API.</p></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-14 text-center"><Box className="mb-3 h-10 w-10 text-muted-foreground/30" /><p className="font-medium">{search ? "Nenhum resultado encontrado" : "Nenhuma pergunta pendente"}</p><p className="text-sm text-muted-foreground">{search ? "Altere o termo da busca." : "As perguntas respondidas pela IA não ocupam esta fila."}</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((pergunta) => <PerguntaCard key={pergunta.id} pergunta={pergunta} tenantId={tenantId} />)}
        </div>
      )}
    </div>
  );
}
