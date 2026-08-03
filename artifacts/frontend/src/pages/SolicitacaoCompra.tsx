import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart, Plus, Loader2, Camera, X, Check, Ban, Send, Search,
} from "lucide-react";

function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}` };
}
function authHeadersJson() {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

interface Produto {
  id: string;
  nome: string;
  sku: string | null;
  codigoBarras: string | null;
  precoBase: string;
  estoqueQuantidade: number | null;
}
interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  telefone: string | null;
  email: string | null;
}
interface Solicitacao {
  id: string;
  produtoNome: string;
  quantidade: number;
  fornecedorNome: string;
  fornecedorContato: string | null;
  ultimoValorPago: string | null;
  cotacaoAtual: string | null;
  prazoEntregaDias: number | null;
  condicaoPagamento: string | null;
  status: "pendente" | "aprovado" | "reprovado" | "enviado";
  observacoes: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = { pendente: "Pendentes", aprovado: "Aprovadas", reprovado: "Reprovadas", enviado: "Enviadas" };
const STATUS_COLOR: Record<string, string> = {
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reprovado: "bg-red-50 text-red-700 border-red-200",
  enviado: "bg-blue-50 text-blue-700 border-blue-200",
};

interface FormState {
  produtoId: string;
  produtoNome: string;
  quantidade: string;
  fornecedorNome: string;
  fornecedorContato: string;
  fornecedorTelefone: string;
  fornecedorEmail: string;
  ultimoValorPago: string;
  cotacaoAtual: string;
  prazoEntregaDias: string;
  condicaoPagamento: string;
  observacoes: string;
  autoRegistrarFornecedor: boolean;
  enviarPedidoAutomatico: boolean;
}
const EMPTY_FORM: FormState = {
  produtoId: "", produtoNome: "", quantidade: "1",
  fornecedorNome: "", fornecedorContato: "", fornecedorTelefone: "", fornecedorEmail: "",
  ultimoValorPago: "", cotacaoAtual: "", prazoEntregaDias: "", condicaoPagamento: "",
  observacoes: "", autoRegistrarFornecedor: true, enviarPedidoAutomatico: false,
};

export default function SolicitacaoCompra() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusTab, setStatusTab] = useState("pendente");
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [produtoSearch, setProdutoSearch] = useState("");
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  const { data: solicitacoes = [], isLoading } = useQuery<Solicitacao[]>({
    queryKey: ["solicitacoes-compra", tenantId, statusTab],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/solicitacoes-compra?status=${statusTab}`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: produtos = [] } = useQuery<Produto[]>({
    queryKey: ["produtos-catalogo", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : [])),
    enabled: !!tenantId,
  });

  const { data: fornecedores = [] } = useQuery<Fornecedor[]>({
    queryKey: ["fornecedores", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/fornecedores`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : [])),
    enabled: !!tenantId && open,
  });

  const produtosFiltrados = produtoSearch.trim()
    ? produtos.filter((p) => {
        const q = produtoSearch.toLowerCase();
        return p.nome.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.codigoBarras?.includes(produtoSearch);
      })
    : produtos.slice(0, 8);

  function selecionarProduto(p: Produto) {
    setForm((f) => ({ ...f, produtoId: p.id, produtoNome: p.nome }));
    setProdutoSearch("");
  }

  function selecionarFornecedor(nome: string) {
    const f = fornecedores.find((x) => x.nome === nome);
    if (f) {
      setForm((prev) => ({ ...prev, fornecedorNome: f.nome, fornecedorContato: f.contato ?? "", fornecedorTelefone: f.telefone ?? "", fornecedorEmail: f.email ?? "", autoRegistrarFornecedor: false }));
    } else {
      setForm((prev) => ({ ...prev, fornecedorNome: nome, autoRegistrarFornecedor: true }));
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/solicitacoes-compra`, {
        method: "POST",
        headers: authHeadersJson(),
        body: JSON.stringify({
          produtoId: form.produtoId || null,
          produtoNome: form.produtoNome,
          quantidade: Number(form.quantidade) || 1,
          fornecedorNome: form.fornecedorNome,
          fornecedorContato: form.fornecedorContato || null,
          fornecedorTelefone: form.fornecedorTelefone || null,
          fornecedorEmail: form.fornecedorEmail || null,
          ultimoValorPago: form.ultimoValorPago || null,
          cotacaoAtual: form.cotacaoAtual || null,
          prazoEntregaDias: form.prazoEntregaDias ? Number(form.prazoEntregaDias) : null,
          condicaoPagamento: form.condicaoPagamento || null,
          observacoes: form.observacoes || null,
          autoRegistrarFornecedor: form.autoRegistrarFornecedor,
          enviarPedidoAutomatico: form.enviarPedidoAutomatico,
          criadoPorNome: (user as any)?.nome ?? (user as any)?.email ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erro ao criar solicitação");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitacoes-compra", tenantId] });
      qc.invalidateQueries({ queryKey: ["fornecedores", tenantId] });
      toast({ title: "Solicitação criada!" });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const aprovarMutation = useMutation({
    mutationFn: ({ id, aprovado }: { id: string; aprovado: boolean }) =>
      fetch(`/api/solicitacoes-compra/${id}/aprovar`, {
        method: "POST",
        headers: authHeadersJson(),
        body: JSON.stringify({ aprovado }),
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["solicitacoes-compra", tenantId] });
      toast({ title: v.aprovado ? "Solicitação aprovada" : "Solicitação reprovada" });
    },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Solicitação de Compra
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Peça cotação, registre o fornecedor e aprove antes de enviar o pedido.
          </p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Solicitação
        </Button>
      </div>

      <Tabs value={statusTab} onValueChange={setStatusTab}>
        <TabsList>
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <TabsTrigger key={k} value={k}>{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : solicitacoes.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma solicitação {STATUS_LABEL[statusTab].toLowerCase()} ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {solicitacoes.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{s.produtoNome}</p>
                    <Badge variant="outline" className="text-xs">{s.quantidade}x</Badge>
                    <Badge className={`text-xs border ${STATUS_COLOR[s.status]}`} variant="outline">{STATUS_LABEL[s.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fornecedor: <span className="font-medium">{s.fornecedorNome}</span>
                    {s.fornecedorContato ? ` · ${s.fornecedorContato}` : ""}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-muted-foreground">
                    {s.ultimoValorPago && <span>Último pago: R$ {Number(s.ultimoValorPago).toFixed(2)}</span>}
                    {s.cotacaoAtual && <span>Cotação: R$ {Number(s.cotacaoAtual).toFixed(2)}</span>}
                    {s.prazoEntregaDias && <span>Entrega: {s.prazoEntregaDias}d</span>}
                    {s.condicaoPagamento && <span>{s.condicaoPagamento}</span>}
                  </div>
                </div>
                {s.status === "pendente" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => aprovarMutation.mutate({ id: s.id, aprovado: true })} disabled={aprovarMutation.isPending}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => aprovarMutation.mutate({ id: s.id, aprovado: false })} disabled={aprovarMutation.isPending}>
                      <Ban className="h-3.5 w-3.5 mr-1" /> Reprovar
                    </Button>
                  </div>
                )}
                {s.status === "enviado" && (
                  <Badge variant="outline" className="text-xs text-blue-700 border-blue-200 flex items-center gap-1">
                    <Send className="h-3 w-3" /> Pedido enviado
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Nova Solicitação */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Solicitação de Compra</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Produto */}
            <div className="space-y-1.5">
              <Label>Produto <span className="text-destructive">*</span></Label>
              {form.produtoNome ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
                  <span className="text-sm font-medium">{form.produtoNome}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setForm((f) => ({ ...f, produtoId: "", produtoNome: "" }))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8" placeholder="Buscar por nome, SKU ou código de barras…"
                        value={produtoSearch} onChange={(e) => setProdutoSearch(e.target.value)} />
                    </div>
                    <Button type="button" variant="outline" size="icon" title="Escanear código de barras" onClick={() => setScannerOpen(true)}>
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                  {produtosFiltrados.length > 0 && (
                    <ul className="border rounded-md max-h-40 overflow-y-auto divide-y">
                      {produtosFiltrados.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => selecionarProduto(p)}
                            className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex items-center justify-between">
                            <span>{p.nome}</span>
                            <span className="text-xs text-muted-foreground">{p.sku ?? ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">Não achou? Pode digitar um nome de produto novo direto no campo de busca e usar como texto livre.</p>
                  {produtoSearch.trim() && produtosFiltrados.length === 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => selecionarProduto({ id: "", nome: produtoSearch, sku: null, codigoBarras: null, precoBase: "0", estoqueQuantidade: null })}>
                      Usar "{produtoSearch}" como produto
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={form.quantidade} onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
            </div>

            {/* Fornecedor */}
            <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fornecedor</Label>
              <Input list="fornecedores-list" placeholder="Nome do fornecedor"
                value={form.fornecedorNome} onChange={(e) => selecionarFornecedor(e.target.value)} />
              <datalist id="fornecedores-list">
                {fornecedores.map((f) => <option key={f.id} value={f.nome} />)}
              </datalist>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Vendedor/contato" value={form.fornecedorContato} onChange={(e) => setForm((f) => ({ ...f, fornecedorContato: e.target.value }))} />
                <Input placeholder="Telefone" value={form.fornecedorTelefone} onChange={(e) => setForm((f) => ({ ...f, fornecedorTelefone: e.target.value }))} />
              </div>
              <Input placeholder="E-mail" value={form.fornecedorEmail} onChange={(e) => setForm((f) => ({ ...f, fornecedorEmail: e.target.value }))} />
              <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Checkbox checked={form.autoRegistrarFornecedor} onCheckedChange={(v) => setForm((f) => ({ ...f, autoRegistrarFornecedor: !!v }))} />
                Cadastrar esse fornecedor automaticamente (se ainda não existir)
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Último valor pago</Label>
                <Input type="number" step="0.01" placeholder="R$" value={form.ultimoValorPago} onChange={(e) => setForm((f) => ({ ...f, ultimoValorPago: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cotação atual</Label>
                <Input type="number" step="0.01" placeholder="R$" value={form.cotacaoAtual} onChange={(e) => setForm((f) => ({ ...f, cotacaoAtual: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo de entrega (dias)</Label>
                <Input type="number" min={0} value={form.prazoEntregaDias} onChange={(e) => setForm((f) => ({ ...f, prazoEntregaDias: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Condição de pagamento</Label>
                <Input placeholder="Ex: 28/42/56 dias" value={form.condicaoPagamento} onChange={(e) => setForm((f) => ({ ...f, condicaoPagamento: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.enviarPedidoAutomatico} onCheckedChange={(v) => setForm((f) => ({ ...f, enviarPedidoAutomatico: !!v }))} />
              Enviar pedido automaticamente assim que for aprovado
            </label>

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={createMutation.isPending || !form.produtoNome || !form.fornecedorNome}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar solicitação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {scannerOpen && (
        <BarcodeScanner
          onDetected={(code) => {
            const match = produtos.find((p) => p.codigoBarras === code || p.sku === code);
            if (match) {
              selecionarProduto(match);
              toast({ title: "Produto encontrado!", description: match.nome });
            } else {
              toast({ title: "Código não encontrado no catálogo", description: code, variant: "destructive" });
            }
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Scanner de código de barras via câmera (BarcodeDetector nativo) ─────────
function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setSupported(false);
      return;
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // @ts-ignore — BarcodeDetector é experimental, sem types no lib.dom padrão
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"] });
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            // frame ilegível, tenta o próximo
          }
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível acessar a câmera");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Escanear código de barras</DialogTitle></DialogHeader>
        {!supported ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Esse navegador não suporta leitura de código de barras pela câmera. Funciona no Chrome Android — no computador, busca pelo nome ou SKU mesmo.
          </p>
        ) : error ? (
          <p className="text-sm text-destructive py-6 text-center">{error}</p>
        ) : (
          <div className="rounded-lg overflow-hidden bg-black aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
