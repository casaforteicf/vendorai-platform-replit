import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { ordenarArvoreCategorias } from "@/lib/categoriaTree";
import {
  CalculoOrcamentoM2Dialog,
  type ResultadoCalculoM2,
  type ResultadoConfirmadoCalculoM2,
} from "@/components/CalculoOrcamentoM2Dialog";
 import {
  useListPropostas,
  getListPropostasQueryKey,
  useCreateProposta,
  useCreatePropostaFromCatalogo,
  useUpdateProposta,
  useUpdatePropostaStatus,
  useDeleteProposta,
  useListTenantLeads,
  getListTenantLeadsQueryKey,
  useListProdutosCatalogo,
  getListProdutosCatalogoQueryKey,
  useCreateProdutoCatalogo,
  useUpdateProdutoCatalogo,
  useDeleteProdutoCatalogo,
  useImportProdutosCatalogo,
  useCreateDeal,
  getListDealsQueryKey,
  useListPropostaTemplates,
  getListPropostaTemplatesQueryKey,
  useCreatePropostaFromTemplate,
  useGetBusinessProfileByTenant,
  getGetBusinessProfileByTenantQueryKey,
  useGetLead,
  getGetLeadQueryKey,
  getGetPropostaQueryKey,
  useListPaymentMethods,
  getListPaymentMethodsQueryKey,
  useRequestUploadUrl,
  useListCategoriasProduto,
  getListCategoriasProdutoQueryKey,
  useListComposicoes,
  getListComposicoesQueryKey,
} from "@workspace/api-client-react";
import type {
  Proposta,
  PropostaStatus,
  ProdutoCatalogo,
  FormaPagamentoProposta,
  PaymentCompositionLineForma,
  PropostaTemplate,
  CategoriaProduto,
  Composicao,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BudgetQuantityInput } from "@/components/BudgetQuantityInput";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Loader2,
  FileText,
  Package,
  Pencil,
  Eye,
  Send,
  Check,
  CheckCircle2,
  XCircle,
  X,
  Sparkles,
  Upload,
  Download,
  AlertTriangle,
  Image as ImageIcon,
  Printer,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  MessageCircle,
  Star,
  Clock,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  rascunho:  { label: "Rascunho",  className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  enviada:   { label: "Enviada",   className: "bg-blue-100 text-blue-700 border-blue-200" },
  pendente:  { label: "Pendente",  className: "bg-violet-100 text-violet-700 border-violet-200" },
  aceita:    { label: "Aceita",    className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejeitada: { label: "Rejeitada", className: "bg-red-100 text-red-600 border-red-200" },
  expirada:  { label: "Expirada",  className: "bg-orange-100 text-orange-700 border-orange-200" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return "—"; }
}

function fmtCurrency(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "R$ —";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function roundBudgetNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  const roundedUp = Math.ceil((n - 1e-9) * 100) / 100;
  return Number(roundedUp.toFixed(2));
}

function formatBudgetMoneyValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  return roundBudgetNumber(value).toFixed(2).replace(".", ",");
}

function BudgetMoneyInput({
  value,
  onChange,
  className = "",
  disabled = false,
  placeholder = "0,00",
}: {
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(() => formatBudgetMoneyValue(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatBudgetMoneyValue(value));
  }, [value]);

  const commit = () => {
    const normalized = draft.trim().replace(",", ".");
    if (!normalized) {
      setDraft("");
      onChange(undefined);
      return;
    }
    const parsed = Number(normalized);
    const next = roundBudgetNumber(Number.isFinite(parsed) ? parsed : Number(value ?? 0));
    setDraft(formatBudgetMoneyValue(next));
    onChange(next);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        const input = event.currentTarget;
        requestAnimationFrame(() => {
          if (document.activeElement === input) input.select();
        });
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onChange={(event) => {
        const raw = event.target.value;
        if (!/^\d*(?:[.,]\d{0,6})?$/.test(raw)) return;
        setDraft(raw);
        const parsed = Number(raw.replace(",", "."));
        if (raw && Number.isFinite(parsed)) onChange(parsed);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

// ── Catalog Modal (CRUD) ──────────────────────────────────────────────────────
const catFormSchema = z.object({
  nome: z.string().min(1, "Obrigatório"),
  categoriaId: z.string().min(1, "Selecione uma categoria"),
  descontoMaximoPercentual: z.coerce.number().min(0).max(100).optional(),
  precoBase: z.coerce.number().min(0, "Preço inválido"),
  fornecedor: z.string().optional(),
  prazoEntregaDias: z.coerce.number().int().min(0).optional(),
  custoFornecedor: z.coerce.number().min(0).optional(),
  margemPercentual: z.coerce.number().min(0).max(999).default(0),
  fretePercentual: z.coerce.number().min(0).max(999).default(0),
  comissaoPercentual: z.coerce.number().min(0).max(999).default(0),
  custoFinanceiroPercentual: z.coerce.number().min(0).max(999).default(0),
  rendimentoPorUnidade: z.coerce.number().min(0).optional(),
  unidadeRendimento: z.string().optional(),
  estoqueQuantidade: z.coerce.number().int().min(0).optional(),
  unidade: z.string().min(1, "Obrigatório"),
  descricao: z.string().optional(),
  imagemUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  // Galeria de fotos adicionais (além da capa em imagemUrl) e vídeo do
  // produto — pedido real: cadastro só aceitava 1 foto, sem vídeo.
  imagens: z.array(z.string()).default([]),
  videoUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  ativo: z.boolean().default(true),
  recorrente: z.boolean().default(false),
  prazoContrato: z.coerce.number().int().min(1).optional(),
  // Controle específico do Praça.ai: "herda" segue o switch geral da loja
  // (tenants.vendeNoPracaAi); "sim"/"nao" sobrepõe só pra esse produto.
  vendeNoPracaAi: z.enum(["herda", "sim", "nao"]).default("herda"),
  precoPracaAi: z.coerce.number().min(0).optional(),
tipoCalculo: z
  .enum([
    "none",
    "area_simples",
    "area_com_acabamento_perimetro",
    "acabamento_perimetro",
    "linear",
    "peca_avulsa",
  ])
  .default("none"),
colecao: z.string().optional(),
cor: z.string().optional(),
fechamentoPacote: z.coerce.number().min(0).optional(),
quantidadePacote: z.coerce.number().int().min(0).optional(),
precoPacote: z.coerce.number().min(0).optional(),
larguraPecaM: z.coerce.number().min(0).optional(),
  // Tabela de especificações livre do produto (Complemento Praça.ai —
  // paridade com Mercado Livre: Marca/Modelo/Cor/etc), pares label/value.
  especificacoes: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  // Compatibilidade veicular — filtro "selecione seu carro" no Praça.ai
  compatibilidadeVeicular: z.array(z.object({
    marca: z.string(), modelo: z.string(),
    anoInicio: z.coerce.number(), anoFim: z.coerce.number().optional(),
  })).default([]),
  // Validade de lote — genérico, útil pra qualquer produto perecível
  // (distribuidora de alimentos, farmácia, pet food). Alimenta a regra
  // "produto_vencendo" do Revenue Scout.
  dataValidade: z.string().optional(),
});
type CatFormValues = z.infer<typeof catFormSchema>;

function isInternalPricingSpecificationLabel(label: string): boolean {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return normalized === "margem" || normalized.startsWith("regra de preco");
}

interface CsvPreviewRow {
  nome: string;
  sku?: string;
  categoria?: string;
  preco_base: string;
  unidade?: string;
  descricao?: string;
  imagem_url?: string;
  marca?: string;
  imagens?: string;
  video_url?: string;
  especificacoes?: string;
  custo?: string;
  margem_percentual?: string;
  frete_percentual?: string;
  comissao_percentual?: string;
  custo_financeiro_percentual?: string;
  rendimento_por_unidade?: string;
  unidade_rendimento?: string;
  fornecedor?: string;
  prazo_entrega_dias?: string;
  controla_estoque?: string;
}

// Parser de linha CSV com suporte a campos entre aspas (mesma lógica do backend,
// em artifacts/api-server/src/routes/produtos_catalogo.ts:parseCsvLine).
// Sem isso, um split(",") ingênuo quebra a linha errado sempre que um campo de
// texto (descrição, especificações) contém vírgula, deslocando todas as colunas
// seguintes — sintoma relatado: "dado cai em coluna errada".
function parseCsvLinePreview(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      fields.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

const CSV_TEMPLATE =
  "nome,sku,categoria,custo,margem_percentual,frete_percentual,comissao_percentual,custo_financeiro_percentual,rendimento_por_unidade,unidade_rendimento,fornecedor,prazo_entrega_dias,controla_estoque,preco_base,unidade,descricao,imagem_url,marca,imagens,video_url,especificacoes\n" +
  "Camiseta Básica,SKU001,Feminino,40.00,80,5,10,3,1.500,m²,Branno,20,não,79.20,un,100% algodão,https://exemplo.com/img1.jpg,Marca X,https://exemplo.com/img2.jpg|https://exemplo.com/img3.jpg,,Cor:Azul;Tamanho:M\n" +
  "Calça Jeans,SKU002,Masculino,100.00,70,5,10,4,2.500,m²,Branno,20,não,189.00,un,Slim fit,,,,,,\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "modelo_catalogo.csv"; a.click();
  URL.revokeObjectURL(url);
}


type ProductInteractions = {
  questions: Array<{ id: string; pergunta: string; resposta: string | null; status: string; createdAt: string }>;
  reviews: Array<{
    id: string; nota: number; comentario: string | null; fotos: string[];
    compraVerificada: boolean; clienteNome: string | null; status: string;
    respostaLoja: string | null; createdAt: string;
  }>;
};

function ProductInteractionsDialog({
  product,
  tenantId,
  onClose,
}: {
  product: ProdutoCatalogo | null;
  tenantId: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<ProductInteractions>({
    queryKey: ["product-interactions", tenantId, product?.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/tenants/${tenantId}/products/${product!.id}/interactions`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` } },
      );
      if (!response.ok) throw new Error("Não foi possível carregar as interações.");
      return response.json();
    },
    enabled: !!product && !!tenantId,
  });

  const publishedReviews = data?.reviews.filter((review) => review.status === "publicada") ?? [];
  const average = publishedReviews.length
    ? publishedReviews.reduce((total, review) => total + review.nota, 0) / publishedReviews.length
    : 0;

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interações — {product?.nome}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">Não foi possível carregar as interações.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Nota média</p><p className="mt-1 text-2xl font-bold">{average.toFixed(1)} / 10</p></CardContent></Card>
              <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Avaliações</p><p className="mt-1 text-2xl font-bold">{data?.reviews.length ?? 0}</p></CardContent></Card>
              <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Perguntas</p><p className="mt-1 text-2xl font-bold">{data?.questions.length ?? 0}</p></CardContent></Card>
            </div>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4" /> Perguntas</h3>
              {data?.questions.length ? data.questions.map((question) => (
                <Card key={question.id}><CardContent className="space-y-2 pt-5">
                  <p className="text-sm font-medium">{question.pergunta}</p>
                  {question.resposta
                    ? <p className="rounded-md bg-muted p-3 text-sm"><strong>Resposta:</strong> {question.resposta}</p>
                    : <Badge variant="outline">Aguardando resposta</Badge>}
                  <p className="text-xs text-muted-foreground">{fmtDate(question.createdAt)}</p>
                </CardContent></Card>
              )) : <p className="text-sm text-muted-foreground">Nenhuma pergunta para este produto.</p>}
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><Star className="h-4 w-4" /> Avaliações</h3>
              {data?.reviews.length ? data.reviews.map((review) => (
                <Card key={review.id}><CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{review.nota} / 10</span>
                    {review.compraVerificada && <Badge className="bg-emerald-600">Compra verificada</Badge>}
                    <Badge variant="outline">{review.status}</Badge>
                  </div>
                  {review.comentario && <p className="text-sm">{review.comentario}</p>}
                  {review.fotos?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {review.fotos.map((foto) => <img key={foto} src={foto} alt="Foto enviada pelo cliente" className="h-24 w-24 rounded-md border object-cover" />)}
                    </div>
                  )}
                  {review.respostaLoja && <p className="rounded-md bg-muted p-3 text-sm"><strong>Resposta da loja:</strong> {review.respostaLoja}</p>}
                  <p className="text-xs text-muted-foreground">{review.clienteNome || "Cliente"} · {fmtDate(review.createdAt)}</p>
                </CardContent></Card>
              )) : <p className="text-sm text-muted-foreground">Nenhuma avaliação para este produto.</p>}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CatalogoModal({
  open,
  onClose,
  tenantId,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const requestUploadUrl = useRequestUploadUrl();
  const [editingProd, setEditingProd] = useState<ProdutoCatalogo | null>(null);
  const [interactionsProd, setInteractionsProd] = useState<ProdutoCatalogo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [imagemUploading, setImagemUploading] = useState(false);
  const [galeriaUploading, setGaleriaUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [gerandoImagemIa, setGerandoImagemIa] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProdutoCatalogo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[]>([]);
  const [csvTotalRows, setCsvTotalRows] = useState(0);
  const [csvRaw, setCsvRaw] = useState("");
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  // Composição de N itens pra cálculo por m² — tabela separada
  // (produto_composicoes), carregada/salva à parte do form principal.
  const [composicaoItens, setComposicaoItens] = useState<{ itemProdutoId: string; baseCalculo: "area" | "perimetro" }[]>([]);
  const [composicaoLoading, setComposicaoLoading] = useState(false);

  const { data: catalog = [], isLoading } = useListProdutosCatalogo(tenantId, {
    query: {
      queryKey: getListProdutosCatalogoQueryKey(tenantId),
      enabled: !!tenantId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 300_000,
    },
  });

  const createMut = useCreateProdutoCatalogo();
  const updateMut = useUpdateProdutoCatalogo();
  const deleteMut = useDeleteProdutoCatalogo();
  const importMut = useImportProdutosCatalogo();

  const { data: categorias = [] } = useListCategoriasProduto(tenantId, {
    query: { queryKey: getListCategoriasProdutoQueryKey(tenantId), enabled: !!tenantId },
  });

  const form = useForm<CatFormValues>({
    resolver: zodResolver(catFormSchema),
    defaultValues: { nome: "", categoriaId: "", descontoMaximoPercentual: undefined, precoBase: 0, margemPercentual: 0, fretePercentual: 0, comissaoPercentual: 0, custoFinanceiroPercentual: 0, unidade: "un", descricao: "", imagemUrl: "", imagens: [], videoUrl: "", ativo: true, recorrente: false, prazoContrato: undefined, vendeNoPracaAi: "herda", precoPracaAi: undefined, especificacoes: [], compatibilidadeVeicular: [], dataValidade: "" },
  });

  const watchRecorrente = form.watch("recorrente");
  const custoFormacao = form.watch("custoFornecedor");
  const margemFormacao = form.watch("margemPercentual") ?? 0;
  const freteFormacao = form.watch("fretePercentual") ?? 0;
  const comissaoFormacao = form.watch("comissaoPercentual") ?? 0;
  const financeiroFormacao = form.watch("custoFinanceiroPercentual") ?? 0;
  const precoFinalCalculado = custoFormacao == null
    ? form.watch("precoBase")
    : custoFormacao * (1 + (margemFormacao + freteFormacao + comissaoFormacao + financeiroFormacao) / 100);
  const especFieldArray = useFieldArray({ control: form.control, name: "especificacoes" });
  const compatVeicularFieldArray = useFieldArray({ control: form.control, name: "compatibilidadeVeicular" });

  function openCreate() {
    setEditingProd(null);
    form.reset({ nome: "", categoriaId: "", descontoMaximoPercentual: undefined, precoBase: 0, margemPercentual: 0, fretePercentual: 0, comissaoPercentual: 0, custoFinanceiroPercentual: 0, unidade: "un", descricao: "", imagemUrl: "", imagens: [], videoUrl: "", ativo: true, recorrente: false, prazoContrato: undefined, vendeNoPracaAi: "herda", precoPracaAi: undefined, especificacoes: [], compatibilidadeVeicular: [], dataValidade: "" });
    setComposicaoItens([]);
    setFormOpen(true);
  }

  function openEdit(p: ProdutoCatalogo) {
    setEditingProd(p);
    const vendeNoPracaAiValue = (p as any).vendeNoPracaAi;
    form.reset({
      nome: p.nome,
      categoriaId: p.categoriaId ?? "",
      descontoMaximoPercentual: p.descontoMaximoPercentual != null ? parseFloat(p.descontoMaximoPercentual) : undefined,
      precoBase: parseFloat(p.precoBase),
      custoFornecedor: (p as any).custoFornecedor != null ? parseFloat((p as any).custoFornecedor) : undefined,
      margemPercentual: (p as any).margemPercentual != null ? parseFloat((p as any).margemPercentual) : 0,
      fretePercentual: (p as any).fretePercentual != null ? parseFloat((p as any).fretePercentual) : 0,
      comissaoPercentual: (p as any).comissaoPercentual != null ? parseFloat((p as any).comissaoPercentual) : 0,
      custoFinanceiroPercentual: (p as any).custoFinanceiroPercentual != null ? parseFloat((p as any).custoFinanceiroPercentual) : 0,
      fornecedor: (p as any).fornecedor ?? "",
      prazoEntregaDias: (p as any).prazoEntregaDias ?? undefined,
      estoqueQuantidade: (p as any).estoqueQuantidade ?? undefined,
      rendimentoPorUnidade: (p as any).rendimentoPorUnidade != null ? parseFloat((p as any).rendimentoPorUnidade) : undefined,
      unidadeRendimento: (p as any).unidadeRendimento ?? "m²",
      unidade: p.unidade,
      descricao: p.descricao ?? "",
      imagemUrl: p.imagemUrl ?? "",
      imagens: Array.isArray((p as any).imagens) ? (p as any).imagens : [],
      videoUrl: (p as any).videoUrl ?? "",
      ativo: p.ativo,
      recorrente: p.recorrencia === "mensal",
      prazoContrato: p.prazoContrato ?? undefined,
      vendeNoPracaAi: vendeNoPracaAiValue === true ? "sim" : vendeNoPracaAiValue === false ? "nao" : "herda",
      precoPracaAi: (p as any).precoPracaAi != null ? parseFloat((p as any).precoPracaAi) : undefined,
      especificacoes: Array.isArray((p as any).especificacoes)
        ? (p as any).especificacoes.filter(
            (spec: { label?: string }) =>
              !isInternalPricingSpecificationLabel(spec?.label ?? "")
          )
        : [],
      compatibilidadeVeicular: Array.isArray((p as any).compatibilidadeVeicular) ? (p as any).compatibilidadeVeicular : [],
      dataValidade: (p as any).dataValidade ? String((p as any).dataValidade).slice(0, 10) : "",
      tipoCalculo: ((p as any).tipoCalculo ?? "none") as CatFormValues["tipoCalculo"],
      fechamentoPacote: (p as any).fechamentoPacote != null ? parseFloat((p as any).fechamentoPacote) : undefined,
      precoPacote: (p as any).precoPacote != null ? parseFloat((p as any).precoPacote) : undefined,
      colecao: (p as any).colecao ?? "",
      cor: (p as any).cor ?? "",
    });
    setFormOpen(true);

    // Composição é tabela separada — carrega à parte, não bloqueia a
    // abertura do modal (form já abre com o resto pronto).
    setComposicaoItens([]);
    setComposicaoLoading(true);
    fetch(`/api/produtos-catalogo/${p.id}/composicao`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((itens: { itemProdutoId: string; baseCalculo: "area" | "perimetro" }[]) => {
        setComposicaoItens(itens.map((i) => ({ itemProdutoId: i.itemProdutoId, baseCalculo: i.baseCalculo })));
      })
      .catch(() => {})
      .finally(() => setComposicaoLoading(false));
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListProdutosCatalogoQueryKey(tenantId) });
  }

  // Auto-cadastro via IA (sync de estoque do ERP) — produtos criados
  // automaticamente entram nesse status até o lojista conferir e aprovar.
  // Sem hook gerado ainda (rota nova); fetch direto, mesmo padrão já usado
  // pro card do Google Ads em Configuracoes.tsx.
  const pendentesRevisao = catalog.filter((p) => (p as any).statusRevisao === "pendente_revisao");

  async function aprovarProduto(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/produtos-catalogo/${id}/aprovar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error();
      toast({ title: "Produto aprovado" });
      invalidate();
    } catch {
      toast({ title: "Erro ao aprovar produto", variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  }

  function onSubmit(vals: CatFormValues) {
    const body = {
      nome: vals.nome,
      categoriaId: vals.categoriaId,
      descontoMaximoPercentual: vals.descontoMaximoPercentual != null ? vals.descontoMaximoPercentual.toFixed(2) : undefined,
      precoBase: precoFinalCalculado.toFixed(2),
      unidade: vals.unidade,
      descricao: vals.descricao || undefined,
      imagemUrl: vals.imagemUrl || undefined,
      imagens: vals.imagens && vals.imagens.length > 0 ? vals.imagens : undefined,
      videoUrl: vals.videoUrl || undefined,
      fornecedor: vals.fornecedor || undefined,
      prazoEntregaDias: vals.prazoEntregaDias ?? undefined,
      custoFornecedor: vals.custoFornecedor != null ? vals.custoFornecedor.toFixed(2) : undefined,
      margemPercentual: vals.margemPercentual.toFixed(2),
      fretePercentual: vals.fretePercentual.toFixed(2),
      comissaoPercentual: vals.comissaoPercentual.toFixed(2),
      custoFinanceiroPercentual: vals.custoFinanceiroPercentual.toFixed(2),
      estoqueQuantidade: vals.estoqueQuantidade ?? undefined,
      rendimentoPorUnidade: vals.rendimentoPorUnidade != null ? vals.rendimentoPorUnidade.toFixed(3) : null,
      unidadeRendimento: vals.unidadeRendimento || null,
      ativo: vals.ativo,
      recorrencia: vals.recorrente ? ("mensal" as const) : null,
      prazoContrato: vals.recorrente ? (vals.prazoContrato ?? null) : null,
      // Campos do Praça.ai — ainda não sincronizados no client gerado
      // (orval/openapi.yaml), backend já aceita (schema Drizzle da tabela).
      vendeNoPracaAi: vals.vendeNoPracaAi === "sim" ? true : vals.vendeNoPracaAi === "nao" ? false : null,
      precoPracaAi: vals.precoPracaAi != null ? vals.precoPracaAi.toFixed(2) : null,
      especificacoes: vals.especificacoes.filter(
        (e) =>
          e.label.trim() &&
          e.value.trim() &&
          !isInternalPricingSpecificationLabel(e.label)
      ),
      compatibilidadeVeicular: vals.compatibilidadeVeicular.filter(c => c.marca.trim() && c.modelo.trim() && c.anoInicio),
      dataValidade: vals.dataValidade || null,
      tipoCalculo: vals.tipoCalculo === "none" ? null : vals.tipoCalculo,
      fechamentoPacote: vals.fechamentoPacote != null ? vals.fechamentoPacote.toFixed(3) : null,
      precoPacote: vals.precoPacote != null ? vals.precoPacote.toFixed(2) : null,
      colecao: vals.colecao || null,
      cor: vals.cor || null,
    } as any;
    if (editingProd) {
      updateMut.mutate(
        { id: editingProd.id, data: body },
        {
          onSuccess: () => { toast({ title: "Produto atualizado" }); invalidate(); salvarComposicao(editingProd.id); setFormOpen(false); },
          onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
        }
      );
    } else {
      createMut.mutate(
        { data: { ...body, tenantId } },
        {
          onSuccess: (created: any) => { toast({ title: "Produto criado" }); invalidate(); if (created?.id) salvarComposicao(created.id); setFormOpen(false); },
          onError: () => toast({ title: "Erro ao criar produto", variant: "destructive" }),
        }
      );
    }
  }

  // Salva a composição em separado, depois do produto já existir (precisa
  // do ID real, seja de um produto novo ou já existente). Falha aqui não
  // desfaz o produto já salvo — só avisa, o resto do cadastro fica valendo.
  function salvarComposicao(produtoId: string) {
    if (composicaoItens.length === 0 && !editingProd) return; // produto novo sem composição: nada a salvar
    fetch(`/api/produtos-catalogo/${produtoId}/composicao`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      body: JSON.stringify({ itens: composicaoItens.filter((i) => i.itemProdutoId) }),
    })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => toast({ title: "Produto salvo, mas a composição não pôde ser atualizada", variant: "destructive" }));
  }

  function doDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => { toast({ title: "Produto excluído" }); invalidate(); setDeleteTarget(null); },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
      }
    );
  }

  // Processa o texto CSV (já vindo pronto de um .csv, ou convertido de um .xlsx)
  // e monta o preview. Ponto único, reaproveitado pelos dois formatos.
  function normalizeImportHeader(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function processCsvText(text: string) {
    setCsvRaw(text);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { toast({ title: "Arquivo vazio ou sem dados", variant: "destructive" }); return; }
    const headers = parseCsvLinePreview(lines[0]).map(normalizeImportHeader);
    const rows: CsvPreviewRow[] = [];
    // D-002: pré-visualização mostrava só 5 linhas -- muito pouco pra
    // conferir um arquivo de verdade. Sobe pra 50 (o import real, do
    // lado do backend, continua processando o arquivo inteiro).
    for (let i = 1; i < Math.min(lines.length, 51); i++) {
      const cols = parseCsvLinePreview(lines[i]);
      const get = (aliases: string[]) => {
        for (const a of aliases) { const idx = headers.indexOf(a); if (idx >= 0) return cols[idx] ?? ""; }
        return "";
      };
      rows.push({
        nome: get(["nome", "name", "produto"]),
        sku: get(["sku", "codigo", "ref"]),
        categoria: get(["categoria", "category"]),
        preco_base: get(["preco_base", "preco_final_r", "preco_final", "precobase", "preco", "price", "valor"]),
        unidade: get(["unidade", "unidade_vendida", "un", "unit"]) || "un",
        descricao: get(["descricao", "description"]),
        imagem_url: get(["imagem_url", "imagem", "image", "foto"]),
        marca: get(["marca", "brand"]),
        imagens: get(["imagens", "images", "fotos", "galeria"]),
        video_url: get(["video_url", "video"]),
        especificacoes: get(["especificacoes", "especifica_es", "atributos", "specs"]),
      });
    }
    setCsvPreview(rows);
    setCsvTotalRows(lines.length - 1);
    setImportPreviewOpen(true);
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      // XLSX: cada célula é lida separada de verdade pela lib — sem depender
      // de aspas/vírgula/encoding como no CSV. Convertemos a 1ª aba pra CSV
      // (já corretamente quotado pela própria lib) e seguimos o mesmo fluxo.
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) { toast({ title: "Planilha sem abas", variant: "destructive" }); return; }
          const sheet = workbook.Sheets[firstSheetName];
          const csvText = XLSX.utils.sheet_to_csv(sheet);
          processCsvText(csvText);
        } catch {
          toast({ title: "Erro ao ler o arquivo Excel", description: "Confira se o arquivo não está corrompido.", variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => processCsvText(ev.target?.result as string);
      reader.readAsText(file, "UTF-8");
    }
    e.target.value = "";
  }

  function confirmImport() {
    importMut.mutate(
      { tenantId, data: { csv: csvRaw } },
      {
        onSuccess: (result) => {
          setImportPreviewOpen(false);
          setImportResult(result);
          invalidate();
        },
        onError: () => toast({ title: "Erro ao importar", variant: "destructive" }),
      }
    );
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="!max-w-[95vw] !w-full !max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>Catálogo de Produtos</DialogTitle>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  id="csv-import-input"
                  className="hidden"
                  onChange={handleCsvFile}
                />
                <Button size="sm" variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Modelo CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => document.getElementById("csv-import-input")?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Importar CSV/Excel
                </Button>
                  {selectedIds.size > 0 && (
                <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Excluir ({selectedIds.size})
                </Button>
              )}
                <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                  Novo Produto
                </Button>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : catalog.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Package className="h-10 w-10 opacity-25" />
              <p className="text-sm">Nenhum produto no catálogo ainda</p>
              <p className="text-xs">Use "Importar CSV/Excel" para adicionar vários produtos de uma vez</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            {pendentesRevisao.length > 0 && (
              <button
                onClick={() => setShowOnlyPending((v) => !v)}
                className={`w-full mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                  showOnlyPending ? "border-amber-400 bg-amber-100" : "border-amber-300 bg-amber-50 hover:bg-amber-100"
                }`}
              >
                <span className="flex items-center gap-2 text-amber-800">
                  <Sparkles className="h-4 w-4" />
                  {pendentesRevisao.length} produto{pendentesRevisao.length > 1 ? "s" : ""} criado{pendentesRevisao.length > 1 ? "s" : ""} automaticamente pelo sync de estoque, aguardando revisão
                </span>
                <span className="text-xs text-amber-700 underline underline-offset-2">
                  {showOnlyPending ? "Ver todos" : "Ver pendentes"}
                </span>
              </button>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                 <TableHead className="w-10">
                <Checkbox
                  checked={catalog.length > 0 && selectedIds.size === catalog.length}
                  onCheckedChange={(v) => setSelectedIds(v ? new Set(catalog.map((p) => p.id)) : new Set())}
                />
              </TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Preço Base</TableHead>
                  <TableHead>Recorrência</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Fornecedor</TableHead>
<TableHead>Prazo Entrega</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(showOnlyPending ? pendentesRevisao : catalog).map((p) => {
                  const isPending = (p as any).statusRevisao === "pendente_revisao";
                  const avisos: string[] = (p as any).avisosRevisao ?? [];
                  return (
                  <TableRow key={p.id} className={isPending ? "bg-amber-50/50" : undefined}>
                                        <TableCell>
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedIds);
                          if (v) next.add(p.id); else next.delete(p.id);
                          setSelectedIds(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {p.imagemUrl ? (
                        <img
                          src={p.imagemUrl.startsWith("/objects/") ? `/api/storage${p.imagemUrl}` : p.imagemUrl}
                          alt={p.nome}
                          className="h-9 w-9 rounded object-cover border border-border"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-9 w-9 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {p.nome}
                        {isPending && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">
                            Pendente
                          </Badge>
                        )}
                      </div>
                      {p.sku && <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>}
                      {avisos.length > 0 && (
                        <div className="text-xs text-amber-700 mt-0.5" title={avisos.join(" · ")}>
                          ⚠ {avisos[0]}{avisos.length > 1 ? ` (+${avisos.length - 1})` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.categoriaNome ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-mono">{fmtCurrency(p.precoBase)}</div>
                      {p.recorrencia === "mensal" && (
                        <div className="text-xs text-muted-foreground">/mês</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.recorrencia === "mensal" ? (
                        <div>
                          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">
                            Mensal
                          </Badge>
                          {p.prazoContrato && (
                            <div className="text-xs text-muted-foreground mt-0.5">{p.prazoContrato} {p.prazoContrato === 1 ? "mês" : "meses"}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Avulso</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p.ativo ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"}>
                        {p.ativo ? "Sim" : "Não"}
                      </Badge>
                    </TableCell>
                   <TableCell>{p.fornecedor || "—"}</TableCell>
              <TableCell>{p.prazoEntregaDias != null ? `${p.prazoEntregaDias} dias` : "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setInteractionsProd(p)}>
                            <MessageCircle className="h-4 w-4 mr-2" /> Perguntas e avaliações
                          </DropdownMenuItem>
                          {isPending && (
                            <DropdownMenuItem onClick={() => aprovarProduto(p.id)} disabled={approvingId === p.id}>
                              {approvingId === p.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                              Aprovar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProductInteractionsDialog
        product={interactionsProd}
        tenantId={tenantId}
        onClose={() => setInteractionsProd(null)}
      />

      {/* Product form dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProd ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="categoriaId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ordenarArvoreCategorias(categorias).map(({ categoria: c, profundidade }) => (
                          <SelectItem key={c.id} value={c.id}>
                            {"　".repeat(profundidade)}{profundidade > 0 ? "↳ " : ""}{c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="unidade" render={({ field }) => (
                  <FormItem><FormLabel>Unidade</FormLabel><FormControl><Input placeholder="un, m², h…" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="dataValidade" render={({ field }) => (
                <FormItem>
                  <FormLabel>Validade do lote <span className="text-muted-foreground text-xs">(opcional — produto perecível)</span></FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="descontoMaximoPercentual" render={({ field }) => {
                const catSel = categorias.find((c) => c.id === form.watch("categoriaId"));
                return (
                  <FormItem>
                    <FormLabel>Teto de desconto (%) <span className="text-muted-foreground text-xs">(opcional — sobrepõe a categoria)</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number" step="0.01" min="0" max="100"
                        placeholder={catSel?.descontoMaximoPercentual != null ? `Categoria: ${catSel.descontoMaximoPercentual}%` : "Sem teto"}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }} />
              <FormField control={form.control} name="precoBase" render={() => (
                <FormItem>
                  <FormLabel>Preço final ao cliente (R$)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" value={Number.isFinite(precoFinalCalculado) ? precoFinalCalculado.toFixed(2) : "0.00"} readOnly className="bg-emerald-50 font-semibold" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Calculado automaticamente pela composição de custo abaixo.</p>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="tipoCalculo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cálculo de orçamento <span className="text-muted-foreground text-xs">(opcional — produto vendido por área/m linear)</span></FormLabel>
                  <Select value={field.value ?? "none"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Não se aplica (venda normal)</SelectItem>
                      <SelectItem value="area_simples">Área simples — m² por parede (ex: revestimento)</SelectItem>
                      <SelectItem value="area_com_acabamento_perimetro">Área + acabamento de perímetro — m² por ambiente (ex: teto vinílico)</SelectItem>
                      <SelectItem value="acabamento_perimetro">Acessório de acabamento de perímetro (m linear)</SelectItem>
                      <SelectItem value="linear">Linear — vendido por metro</SelectItem>
                      <SelectItem value="peca_avulsa">Peça avulsa — vendido por unidade dentro de um kit</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {form.watch("tipoCalculo") !== "none" && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="fechamentoPacote" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fechamento do pacote</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.001" min="0" placeholder="Ex: 2.5 (m² ou m por pacote)" {...field} value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="precoPacote" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço do pacote (R$) <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sem fechamento de pacote, cobra pela quantidade exata × preço base (produto a granel). Sem preço de pacote, deriva de fechamento × preço base.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="colecao" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Coleção <span className="text-muted-foreground text-xs">(pra casar acessório automaticamente)</span></FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cor" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Coleção+Cor é só um fallback: se não houver nenhum item de composição configurado abaixo, o sistema tenta casar automaticamente com outro produto de mesma Coleção+Cor marcado como acabamento de perímetro.
                  </p>

                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Composição (itens que entram junto no cálculo)</Label>
                      {composicaoLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cada item some junto — pela área total ou pelo perímetro total dos ambientes/paredes informados. Ex: teto vinílico = manta (área) + perfil de acabamento (perímetro). Sem limite de itens.
                    </p>
                    {composicaoItens.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select value={item.itemProdutoId} onValueChange={(v) => setComposicaoItens((prev) => prev.map((it, i) => i === idx ? { ...it, itemProdutoId: v } : it))}>
                          <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Selecione o produto…" /></SelectTrigger>
                          <SelectContent>
                            {catalog.filter((p) => p.id !== editingProd?.id).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={item.baseCalculo} onValueChange={(v) => setComposicaoItens((prev) => prev.map((it, i) => i === idx ? { ...it, baseCalculo: v as "area" | "perimetro" } : it))}>
                          <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="area">Por área</SelectItem>
                            <SelectItem value="perimetro">Por perímetro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setComposicaoItens((prev) => prev.filter((_, i) => i !== idx))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setComposicaoItens((prev) => [...prev, { itemProdutoId: "", baseCalculo: "area" }])}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                    </Button>
                  </div>
                </div>
              )}
                          <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="fornecedor" render={({ field }) => (
                <FormItem><FormLabel>Fornecedor</FormLabel><FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl></FormItem>
              )} />
              <FormField control={form.control} name="prazoEntregaDias" render={({ field }) => (
                <FormItem><FormLabel>Prazo de Entrega (dias)</FormLabel><FormControl>
                  <Input type="number" min="0" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value))} />
                </FormControl></FormItem>
              )} />
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Formação do preço ao cliente</p>
                <p className="text-xs text-muted-foreground mt-0.5">Todos os percentuais são adicionados sobre o custo do produto.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="custoFornecedor" render={({ field }) => (
                  <FormItem><FormLabel>Custo (R$)</FormLabel><FormControl>
                    <Input type="number" step="0.01" min="0" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))} />
                  </FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="estoqueQuantidade" render={({ field }) => (
                  <FormItem><FormLabel>Estoque</FormLabel><FormControl>
                    <Input type="number" min="0" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value))} />
                  </FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["margemPercentual", "Margem (%)"],
                  ["fretePercentual", "Frete (%)"],
                  ["comissaoPercentual", "Comissão (%)"],
                  ["custoFinanceiroPercentual", "Custo financeiro (%)"],
                ] as const).map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem><FormLabel>{label}</FormLabel><FormControl>
                      <Input type="number" step="0.01" min="0" {...field} value={field.value ?? 0} onChange={(e) => field.onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))} />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                ))}
              </div>
              <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between gap-3">
                <span className="text-sm text-emerald-800">Preço final ao cliente</span>
                <strong className="text-lg text-emerald-900">{fmtCurrency(precoFinalCalculado)}</strong>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="rendimentoPorUnidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rendimento por unidade vendida</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.001" min="0" placeholder="Ex: 3,00" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="unidadeRendimento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidade do rendimento</FormLabel>
                    <Select value={field.value || "m²"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="m²">m²</SelectItem>
                        <SelectItem value="m">metro linear</SelectItem>
                        <SelectItem value="un">unidade</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
              <FormField control={form.control} name="descricao" render={({ field }) => (
                <FormItem><FormLabel>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Textarea rows={2} className="resize-none" {...field} value={field.value ?? ""} /></FormControl><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="imagemUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Imagem do Produto <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl><Input placeholder="https://…" {...field} value={field.value ?? ""} /></FormControl>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="prod-img-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImagemUploading(true);
                        try {
                          const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
                            requestUploadUrl.mutate(
                              { data: { name: file.name, size: file.size, contentType: file.type } },
                              { onSuccess: resolve, onError: reject },
                            );
                          });
                          const res = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
                          if (!res.ok) throw new Error("Upload failed");
                          field.onChange(result.objectPath);
                          toast({ title: "Imagem enviada", description: "Upload concluído." });
                        } catch (err) {
                          toast({ title: "Erro no upload", description: String(err), variant: "destructive" });
                        } finally {
                          setImagemUploading(false);
                          e.target.value = "";
                        }
                      }}
                    />
                    <label htmlFor="prod-img-upload">
                      <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={imagemUploading} asChild>
                        <span className="cursor-pointer flex items-center gap-1.5 text-xs">
                          {imagemUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          Enviar
                        </span>
                      </Button>
                    </label>
                  </div>
                  <FormMessage />
                  {field.value && (
                    <img
                      src={field.value.startsWith("/objects/") ? `/api/storage${field.value}` : field.value}
                      alt="preview"
                      className="h-16 w-16 rounded object-cover border border-border mt-1"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </FormItem>
              )} />

              {/* Galeria de fotos adicionais + gerar com IA */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mais fotos <span className="text-muted-foreground text-xs">(opcional — além da capa acima)</span></Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    disabled={gerandoImagemIa || !form.watch("nome")}
                    title={!form.watch("nome") ? "Preencha o nome do produto primeiro" : undefined}
                    onClick={async () => {
                      setGerandoImagemIa(true);
                      try {
                        const categoriaNome = categorias.find((c) => c.id === form.getValues("categoriaId"))?.nome;
                        const r = await fetch(`/api/tenants/${tenantId}/produtos-catalogo/gerar-imagem-ia`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
                          body: JSON.stringify({
                            nome: form.getValues("nome"),
                            descricao: form.getValues("descricao") || undefined,
                            categoriaNome,
                          }),
                        });
                        const data = await r.json();
                        if (!r.ok) throw new Error(data?.error ?? "Falha ao gerar imagem");
                        const atuais = form.getValues("imagens") ?? [];
                        form.setValue("imagens", [...atuais, data.imagemUrl]);
                        toast({ title: "Imagem gerada com IA" });
                      } catch (err) {
                        toast({ title: "Erro ao gerar imagem", description: String(err), variant: "destructive" });
                      } finally {
                        setGerandoImagemIa(false);
                      }
                    }}
                  >
                    {gerandoImagemIa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Gerar com IA
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(form.watch("imagens") ?? []).map((url, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={url.startsWith("/objects/") ? `/api/storage${url}` : url}
                        alt={`foto ${idx + 1}`}
                        className="h-16 w-16 rounded object-cover border border-border"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <button
                        type="button"
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] leading-none"
                        onClick={() => {
                          const atuais = form.getValues("imagens") ?? [];
                          form.setValue("imagens", atuais.filter((_, i) => i !== idx));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    id="prod-galeria-upload"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length === 0) return;
                      setGaleriaUploading(true);
                      try {
                        const novasUrls: string[] = [];
                        for (const file of files) {
                          const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
                            requestUploadUrl.mutate(
                              { data: { name: file.name, size: file.size, contentType: file.type } },
                              { onSuccess: resolve, onError: reject },
                            );
                          });
                          const res = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
                          if (!res.ok) throw new Error("Upload falhou");
                          novasUrls.push(result.objectPath);
                        }
                        const atuais = form.getValues("imagens") ?? [];
                        form.setValue("imagens", [...atuais, ...novasUrls]);
                        toast({ title: novasUrls.length > 1 ? "Fotos enviadas" : "Foto enviada" });
                      } catch (err) {
                        toast({ title: "Erro no upload", description: String(err), variant: "destructive" });
                      } finally {
                        setGaleriaUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <label htmlFor="prod-galeria-upload">
                    <span className="cursor-pointer h-16 w-16 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-accent">
                      {galeriaUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
                    </span>
                  </label>
                </div>
              </div>

              {/* Vídeo do produto */}
              <FormField control={form.control} name="videoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Vídeo do Produto <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl><Input placeholder="https://… ou envie um arquivo" {...field} value={field.value ?? ""} /></FormControl>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      id="prod-video-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setVideoUploading(true);
                        try {
                          const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
                            requestUploadUrl.mutate(
                              { data: { name: file.name, size: file.size, contentType: file.type } },
                              { onSuccess: resolve, onError: reject },
                            );
                          });
                          const res = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
                          if (!res.ok) throw new Error("Upload falhou");
                          field.onChange(result.objectPath);
                          toast({ title: "Vídeo enviado" });
                        } catch (err) {
                          toast({ title: "Erro no upload", description: String(err), variant: "destructive" });
                        } finally {
                          setVideoUploading(false);
                          e.target.value = "";
                        }
                      }}
                    />
                    <label htmlFor="prod-video-upload">
                      <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={videoUploading} asChild>
                        <span className="cursor-pointer flex items-center gap-1.5 text-xs">
                          {videoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          Enviar
                        </span>
                      </Button>
                    </label>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Recorrência mensal */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <FormField control={form.control} name="recorrente" render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <FormLabel className="text-sm font-medium">Serviço recorrente mensal</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">Ativar quando o produto é cobrado mensalmente</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                  </FormItem>
                )} />
                {watchRecorrente && (
                  <FormField control={form.control} name="prazoContrato" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prazo do contrato <span className="text-muted-foreground text-xs">(meses)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Ex: 12"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>

              {/* Praça.ai — visibilidade e preço específico */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Praça.ai</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Controle desse produto na vitrine do marketplace, separado do resto do catálogo</p>
                </div>
                <FormField control={form.control} name="vendeNoPracaAi" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Vender no Praça.ai</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="herda">Padrão da loja</SelectItem>
                        <SelectItem value="sim">Sim, sempre</SelectItem>
                        <SelectItem value="nao">Não, esconder da vitrine</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="precoPracaAi" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Preço específico no Praça.ai <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Deixe em branco pra usar o preço normal"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Sobrepõe o preço normal só na vitrine do Praça.ai (ex: já embutindo a comissão)</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Tabela de especificações — Marca/Modelo/Cor/etc, pra alimentar
                  a tabela de detalhes do produto no Praça.ai */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Especificações</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Atributos que aparecem na tabela de detalhes do produto no Praça.ai</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => especFieldArray.append({ label: "", value: "" })}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {especFieldArray.fields.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma especificação ainda.</p>
                )}
                {especFieldArray.fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <Input
                      placeholder="Ex: Marca"
                      {...form.register(`especificacoes.${index}.label` as const)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Ex: Genérica"
                      {...form.register(`especificacoes.${index}.value` as const)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => especFieldArray.remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Compatibilidade veicular — filtro "selecione seu carro" no Praça.ai
                  (categoria Acessórios para Veículos, tipo Tuning Parts) */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Compatibilidade veicular</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Pra quais carros essa peça serve — alimenta o filtro "selecione seu carro" no Praça.ai</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => compatVeicularFieldArray.append({ marca: "", modelo: "", anoInicio: new Date().getFullYear(), anoFim: undefined })}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                {compatVeicularFieldArray.fields.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum veículo cadastrado — peça não aparece no filtro.</p>
                )}
                {compatVeicularFieldArray.fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2 items-start">
                    <Input
                      placeholder="Marca (ex: Volkswagen)"
                      {...form.register(`compatibilidadeVeicular.${index}.marca` as const)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Modelo (ex: Gol)"
                      {...form.register(`compatibilidadeVeicular.${index}.modelo` as const)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="De"
                      {...form.register(`compatibilidadeVeicular.${index}.anoInicio` as const)}
                      className="w-20"
                    />
                    <Input
                      type="number"
                      placeholder="Até"
                      {...form.register(`compatibilidadeVeicular.${index}.anoFim` as const)}
                      className="w-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => compatVeicularFieldArray.remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setFormOpen(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingProd ? "Salvar" : "Criar Produto"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import CSV preview dialog */}
      <Dialog open={importPreviewOpen} onOpenChange={(o) => !o && setImportPreviewOpen(false)}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Pré-visualização da importação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground px-6 pb-2 shrink-0">
            Mostrando {csvPreview.length} de <strong>{csvTotalRows}</strong> linhas do arquivo. A importação processa <strong>todas</strong> ao confirmar.
          </p>
          {csvPreview.length > 0 && (
            <div className="flex-1 overflow-auto px-6">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead>Extras</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvPreview.map((row, i) => {
                    const extras = [
                      row.marca && "Marca",
                      row.imagens && "+imagens",
                      row.video_url && "Vídeo",
                      row.especificacoes && "Especificações",
                    ].filter(Boolean) as string[];
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.nome || <span className="text-destructive text-xs">vazio!</span>}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{row.sku || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{row.categoria || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.preco_base || <span className="text-destructive">inválido</span>}</TableCell>
                        <TableCell className="text-xs">{row.unidade || "un"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{extras.length > 0 ? extras.join(", ") : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex gap-2 p-6 pt-4 border-t shrink-0">
            <Button variant="outline" className="flex-1" onClick={() => setImportPreviewOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={confirmImport} disabled={importMut.isPending}>
              {importMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Confirmar Importação
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import result dialog */}
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resultado da importação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="text-sm text-emerald-800 font-medium">
                {importResult?.imported ?? 0} produto{(importResult?.imported ?? 0) !== 1 ? "s" : ""} importado{(importResult?.imported ?? 0) !== 1 ? "s" : ""} com sucesso
              </span>
            </div>
            {(importResult?.errors?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{importResult!.errors.length} linha{importResult!.errors.length !== 1 ? "s" : ""} ignorada{importResult!.errors.length !== 1 ? "s" : ""}:</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5 ml-6 list-disc">
                  {importResult!.errors.map((e) => (
                    <li key={e.row}>Linha {e.row}: {e.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <Button className="w-full mt-2" onClick={() => setImportResult(null)}>Fechar</Button>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.nome}</strong> será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
                  <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} produto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Os produtos selecionados serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                  onClick={async () => {
                    if (bulkDeleting) return;
                    setBulkDeleting(true);
                    try {
                      for (const id of Array.from(selectedIds)) {
                        await deleteMut.mutateAsync({ id });
                      }
                      toast({ title: "Produtos excluídos", description: `${selectedIds.size} item(ns) removido(s) com sucesso.` });
                      setSelectedIds(new Set());
                      setBulkDeleteOpen(false);
                      invalidate();
                    } catch (error) {
                      toast({
                        title: "Não foi possível concluir a exclusão em lote",
                        description: error instanceof Error ? error.message : "Tente novamente.",
                        variant: "destructive",
                      });
                    } finally {
                      setBulkDeleting(false);
                    }
                  }}
                  disabled={bulkDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {bulkDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</> : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Proposta Modal (Nova Proposta) ────────────────────────────────────────────
interface OrcamentoEtapaDraft {
  id: string;
  nome: string;
}

interface CartLine {
  etapaId: string;
  tipo: "produto" | "composicao";
  produtoId?: string;
  composicaoId?: string;
  quantidade: number;
  precoUnitarioOverride?: number;
  nomeOverride?: string;
}
interface FreeItem  { id: string; nome: string; quantidade: number; valorUnitario: number; }

type ProposalPresentationMode = "completo" | "resumo_etapa" | "preco_medio";

type ProposalStageSchedule = {
  duracaoDias?: number;
  percentualFisico?: number;
  inicioPrevisto?: string;
  fimPrevisto?: string;
  observacao?: string;
  marcoPagamento?: string;
};

const PROPOSAL_PRESENTATION_OPTIONS: Array<{
  value: ProposalPresentationMode;
  label: string;
  description: string;
}> = [
  { value: "resumo_etapa", label: "Resumo da etapa", description: "Mostra somente a etapa e o valor macro." },
  { value: "preco_medio", label: "Preço por item", description: "Mostra os itens e o valor unitário, sem quantidade nem subtotal." },
  { value: "completo", label: "Completo", description: "Mostra item, quantidade, valor unitário e subtotal." },
];

const DEFAULT_ETAPA_ID = "etapa-inicial";
type ConstructionSystem = "icf" | "alvenaria" | "steel_frame" | "wood_frame" | "madeira" | "concreto" | "outro";

const CONSTRUCTION_SYSTEMS: Array<{ value: ConstructionSystem; label: string; structureLabel: string }> = [
  { value: "icf", label: "ICF", structureLabel: "Estrutura / ICF" },
  { value: "alvenaria", label: "Alvenaria / tijolo", structureLabel: "Estrutura / Alvenaria" },
  { value: "steel_frame", label: "Steel Frame", structureLabel: "Estrutura / Steel Frame" },
  { value: "wood_frame", label: "Wood Frame", structureLabel: "Estrutura / Wood Frame" },
  { value: "madeira", label: "Madeira", structureLabel: "Estrutura / Madeira" },
  { value: "concreto", label: "Concreto armado", structureLabel: "Estrutura / Concreto armado" },
  { value: "outro", label: "Outro sistema", structureLabel: "Estrutura / Sistema personalizado" },
];

function getStageNamesForSystem(system: ConstructionSystem) {
  const structureLabel = CONSTRUCTION_SYSTEMS.find((item) => item.value === system)?.structureLabel ?? "Estrutura";
  return [
    "Projetos e legalização",
    "Serviços preliminares",
    "Terraplenagem",
    "Fundações",
    structureLabel,
    "Lajes",
    "Cobertura",
    "Instalações hidráulicas",
    "Instalações elétricas",
    "Esquadrias",
    "Revestimentos",
    "Forros e pintura",
    "Acabamentos",
    "Áreas externas",
    "Energia solar e automação",
    "Limpeza e entrega",
  ];
}

const ETAPAS_OBRA_SUGERIDAS = getStageNamesForSystem("icf");

// Pacote inicial de uma obra residencial ICF. O objetivo é abrir o orçamento
// já com a sequência executiva e as composições principais, sem forçar opcionais
// como piscina, climatização, cisterna ou energia solar. Esses continuam
// disponíveis no seletor filtrado da respectiva etapa.
const ICF_DEFAULT_COMPOSITION_CODES = new Set([
  // Projetos e legalização
  "9.1.1", "9.2.3", "9.2.6", "9.2.7", "9.2.8",
  // Serviços preliminares
  "1.1.1", "1.1.2", "1.1.3",
  // Terraplenagem
  "1.2.1", "1.2.3",
  // Fundações
  "1.2.2",
  // Estrutura / ICF
  "2.1.1", "2.1.2", "2.1.3", "2.2.1", "2.2.3", "2.3.1",
  // Lajes
  "2.2.2",
  // Cobertura
  "6.3.3", "6.3.4", "6.3.6",
  // Instalações hidráulicas
  "4.1.1", "4.1.2", "4.2.1", "4.3.1", "4.3.2", "4.3.3", "4.4.1",
  // Instalações elétricas
  "3.1.1", "3.1.2", "3.1.3", "3.3.1",
  // Esquadrias
  "5.1.1", "5.1.2", "5.2.1", "5.2.2", "5.2.3", "5.3.2",
  // Revestimentos
  "4.5.1", "6.2.1", "6.2.3", "6.3.1",
  // Forros e pintura
  "6.1.1", "6.1.2", "6.3.5",
  // Acabamentos
  "6.4.2", "9.4.1", "9.4.2",
  // Limpeza e entrega
  "9.3.1", "9.3.2",
]);

type OrcamentoStageKey =
  | "preliminares"
  | "terraplenagem"
  | "fundacoes"
  | "estrutura_icf"
  | "lajes"
  | "cobertura"
  | "hidraulica"
  | "eletrica"
  | "esquadrias"
  | "revestimentos"
  | "forros_pintura"
  | "acabamentos"
  | "areas_externas"
  | "solar_automacao"
  | "projetos_legalizacao"
  | "limpeza_entrega"
  | "custom";

function normalizeStageText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveOrcamentoStageKey(nome: string): OrcamentoStageKey {
  const value = normalizeStageText(nome);
  if (/preliminar|canteiro|mobilizacao/.test(value)) return "preliminares";
  if (/terraplen|movimentacao de terra|escavacao/.test(value)) return "terraplenagem";
  if (/fundac|radier|baldrame|sapata|estaca/.test(value)) return "fundacoes";
  if (/estrutura|\bicf\b|parede estrutural/.test(value)) return "estrutura_icf";
  if (/laje/.test(value)) return "lajes";
  if (/cobertura|telhado/.test(value)) return "cobertura";
  if (/hidraul|sanitari|esgoto|gas/.test(value)) return "hidraulica";
  if (/eletric|climatiz|ar condicionado/.test(value)) return "eletrica";
  if (/esquadr|vidro|janela|porta/.test(value)) return "esquadrias";
  if (/revest|piso|impermeab/.test(value)) return "revestimentos";
  if (/forro|pintura|gesso|drywall/.test(value)) return "forros_pintura";
  if (/acabamento|marcenaria|mobiliario/.test(value)) return "acabamentos";
  if (/extern|piscina|deck|paisag|jardim/.test(value)) return "areas_externas";
  if (/solar|fotovolta|automacao/.test(value)) return "solar_automacao";
  if (/projeto|legal|licen|regulariz|taxa/.test(value)) return "projetos_legalizacao";
  if (/limpeza|entrega|pos obra/.test(value)) return "limpeza_entrega";
  return "custom";
}

const STAGE_KEYWORDS: Record<Exclude<OrcamentoStageKey, "custom">, string[]> = {
  preliminares: ["canteiro", "tapume", "sondagem", "demarcacao", "locacao de obra", "limpeza do terreno", "placa de obra", "barracao"],
  terraplenagem: ["terraplen", "escavacao", "movimentacao de terra", "aterro", "corte", "compactacao"],
  fundacoes: ["fundacao", "radier", "sapata", "baldrame", "estaca", "broca"],
  estrutura_icf: ["icf", "estrutura", "coluna", "viga", "armadura", "graute", "concreto estrutural", "forma"],
  lajes: ["laje", "escoramento"],
  cobertura: ["cobertura", "telha", "rufo", "calha", "cumeeira"],
  hidraulica: ["hidraul", "sanitari", "esgoto", "pex", "agua", "cisterna", "aquecedor", "registro", "chuveiro", "vaso", "banheiro", "fossa", "biofiltro", "gas"],
  eletrica: ["eletric", "cabo", "eletroduto", "quadro", "disjuntor", "tomada", "interruptor", "aterramento", "split", "climatizacao", "ar condicionado"],
  esquadrias: ["esquadr", "janela", "porta", "vidro", "box", "persiana", "fechadura"],
  revestimentos: ["revest", "porcelanato", "piso", "reboco", "impermeab", "argamassa", "rejunte"],
  forros_pintura: ["forro", "gesso", "drywall", "pintura", "tinta", "massa", "sanca"],
  acabamentos: ["acabamento", "louca", "metal", "granito", "marmore", "moveis", "movel", "marcenaria"],
  areas_externas: ["extern", "piscina", "deck", "churrasqueira", "paisag", "jardim", "calcada", "paver"],
  solar_automacao: ["solar", "fotovolta", "inversor", "bateria", "mppt", "automacao", "monitoramento"],
  projetos_legalizacao: ["projeto", "alvara", "taxa", "avcb", "acessibilidade", "habite", "seguro", "averbacao", "inss", "iss", "licenca", "regularizacao"],
  limpeza_entrega: ["limpeza", "entrega", "pos obra"],
};

function textMatchesStage(text: string, key: OrcamentoStageKey, etapaNome: string) {
  const normalized = normalizeStageText(text);
  if (!normalized) return false;
  if (key === "custom") {
    const terms = normalizeStageText(etapaNome).split(" ").filter((term) => term.length >= 4);
    return terms.length > 0 && terms.some((term) => normalized.includes(term));
  }
  return STAGE_KEYWORDS[key].some((keyword) => normalized.includes(keyword));
}

function composicaoMatchesStage(item: Composicao, etapaNome: string, constructionSystem: ConstructionSystem = "icf") {
  const key = resolveOrcamentoStageKey(etapaNome);
  const metadata = item as Composicao & {
    etapaKey?: string | null;
    sistemasConstrutivos?: string[] | null;
    comumTodosSistemas?: boolean;
    ativo?: boolean;
  };

  if (metadata.ativo === false) return false;

  const explicitStageKey = metadata.etapaKey ?? null;
  const expectedStageKey = key === "estrutura_icf" ? "estrutura" : key;
  if (explicitStageKey) {
    if (explicitStageKey !== expectedStageKey) return false;
    if (metadata.comumTodosSistemas) return true;
    const systems = Array.isArray(metadata.sistemasConstrutivos) ? metadata.sistemasConstrutivos : [];
    return systems.includes(constructionSystem);
  }

  const codigo = String(item.codigo ?? "").trim();
  const text = [item.nome, item.descricao, item.codigo].filter(Boolean).join(" ");
  const normalizedText = normalizeStageText(text);

  if (key === "preliminares" && /^1\.1\./.test(codigo)) return true;
  if (key === "terraplenagem" && /^1\.2\.(1|3)$/.test(codigo)) return true;
  if (key === "fundacoes" && /^1\.2\.2$/.test(codigo)) return true;

  if (key === "estrutura_icf") {
    if (constructionSystem === "icf") {
      return /^2\.1\./.test(codigo) || /^2\.2\.(1|3)$/.test(codigo) || /^2\.3\./.test(codigo) || /\bicf\b/.test(normalizedText);
    }
    const terms: Record<Exclude<ConstructionSystem, "icf">, string[]> = {
      alvenaria: ["alvenaria", "tijolo", "bloco ceramico", "bloco concreto", "verga", "contraverga"],
      steel_frame: ["steel frame", "steel", "lsf", "perfil galvanizado", "placa cimenticia", "osb"],
      wood_frame: ["wood frame", "wood", "ossatura madeira", "osb"],
      madeira: ["madeira", "clt", "mlc", "estrutura de madeira"],
      concreto: ["concreto armado", "pilar", "viga", "armadura", "forma", "concreto estrutural"],
      outro: [],
    };
    return terms[constructionSystem].some((term) => normalizedText.includes(term));
  }

  if (key === "lajes" && /^2\.2\.2$/.test(codigo) && constructionSystem === "icf") return true;
  if (key === "cobertura" && /^6\.3\.(3|4|6)$/.test(codigo)) return true;
  if (key === "hidraulica" && /^4\.(1|2|3|4)\./.test(codigo)) return true;
  if (key === "eletrica" && /^3\./.test(codigo)) return true;
  if (key === "esquadrias" && /^5\./.test(codigo)) return true;
  if (key === "revestimentos" && (/^4\.5\./.test(codigo) || /^6\.2\./.test(codigo) || /^6\.3\.(1|2)$/.test(codigo) || /^6\.4\.1$/.test(codigo))) return true;
  if (key === "forros_pintura" && (/^6\.1\./.test(codigo) || /^6\.3\.5$/.test(codigo))) return true;
  if (key === "acabamentos" && (/^6\.4\.2$/.test(codigo) || /^9\.4\.(1|2|5)$/.test(codigo))) return true;
  if (key === "areas_externas" && (/^7\./.test(codigo) || /^9\.4\.3$/.test(codigo))) return true;
  if (key === "solar_automacao" && (/^8\./.test(codigo) || /^9\.4\.4$/.test(codigo))) return true;
  if (key === "projetos_legalizacao" && (/^1\.3\./.test(codigo) || /^9\.(1|2)\./.test(codigo))) return true;
  if (key === "limpeza_entrega" && /^9\.3\./.test(codigo)) return true;

  return textMatchesStage(text, key, etapaNome);
}

function produtoMatchesStage(item: ProdutoCatalogo, etapaNome: string) {
  const key = resolveOrcamentoStageKey(etapaNome);
  const product = item as ProdutoCatalogo & { categoriaNome?: string; descricao?: string | null };
  const text = [product.nome, product.categoriaNome, product.descricao].filter(Boolean).join(" ");
  return textMatchesStage(text, key, etapaNome);
}

function buildStandardStages(system: ConstructionSystem): OrcamentoEtapaDraft[] {
  return getStageNamesForSystem(system).map((nome, index) => ({
    id: index === 0 ? DEFAULT_ETAPA_ID : `etapa-padrao-${index + 1}`,
    nome,
  }));
}

function buildStandardIcfBudget(composicoes: Composicao[]) {
  const etapas: OrcamentoEtapaDraft[] = buildStandardStages("icf");
  const etapaByKey = new Map(etapas.map((etapa) => [resolveOrcamentoStageKey(etapa.nome), etapa]));

  const lines: CartLine[] = composicoes
    .filter((item) => ICF_DEFAULT_COMPOSITION_CODES.has(String(item.codigo ?? "").trim()))
    .map((item) => {
      const etapa = etapas.find((candidate) => composicaoMatchesStage(item, candidate.nome))
        ?? etapaByKey.get("acabamentos")
        ?? etapas[0];
      return {
        etapaId: etapa.id,
        tipo: "composicao" as const,
        composicaoId: item.id,
        quantidade: 1,
      };
    });

  return { etapas, lines };
}

const FORMA_PAGAMENTO_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto Bancário",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  transferencia: "Transferência Bancária",
  dinheiro: "Dinheiro",
  a_combinar: "A Combinar",
};

function getPaymentLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return FORMA_PAGAMENTO_LABELS[code] ?? code;
}

const paymentCompositionSchema = z.object({
  forma: z.string().min(1, "Selecione uma forma"),
  valor: z.coerce.number().min(0.01, "Valor deve ser maior que zero"),
  comprovanteUrl: z.string().optional(),
});

const propostaFormSchema = z.object({
  leadId: z.string().min(1, "Selecione um lead"),
  titulo: z.string().min(1, "Título é obrigatório"),
  validadeAte: z.string().optional(),
  observacoes: z.string().optional(),
  formaPagamento: z.string().optional(),
  condPagamento: z.string().optional(),
  prazoEntrega: z.string().optional(),
  formaPagamentoMensalidade: z.string().optional(),
  condPagamentoMensalidade: z.string().optional(),
  recorrente: z.boolean().default(false),
  valorMensal: z.coerce.number().min(0).optional(),
  prazoContratoMeses: z.coerce.number().int().min(1).optional(),
  paymentCompositions: z.array(paymentCompositionSchema).optional().default([]),
  skipAsaasBilling: z.boolean().default(false),
});
type PropostaFormValues = z.infer<typeof propostaFormSchema>;

function newFreeItem(): FreeItem {
  return { id: Math.random().toString(36).slice(2), nome: "", quantidade: 1, valorUnitario: 0 };
}

  export function PropostaModal({
    open,
    onClose,
    tenantId,
    catalog,
    leadId: lockedLeadId,
    leadNome,
    leadTelefone,
    leadEmpresa,
    dealId: activeDealId,
    initialProductIds = [],
    editingProposta,
    onSuccess,
  }: {
    open: boolean;
    onClose: () => void;
    tenantId: string;
    catalog: ProdutoCatalogo[];
    leadId?: string;
    leadNome?: string;
    leadTelefone?: string;
    leadEmpresa?: string;
    dealId?: string;
    initialProductIds?: string[];
    editingProposta?: Proposta;
    onSuccess?: () => void;
  }) {
    const { toast } = useToast();
    const qc = useQueryClient();
  
    // mode
    const [mode, setMode] = useState<"catalogo" | "livre" | "template" | "importar">("catalogo");
    const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string>("");
    const [constructionSystem, setConstructionSystem] = useState<ConstructionSystem>("icf");
  
    // catálogo + composições organizados por grupos de etapa
    const [orcamentoEtapas, setOrcamentoEtapas] = useState<OrcamentoEtapaDraft[]>([
      { id: DEFAULT_ETAPA_ID, nome: ETAPAS_OBRA_SUGERIDAS[0] },
    ]);
    const [cartLines, setCartLines] = useState<CartLine[]>([
      { etapaId: DEFAULT_ETAPA_ID, tipo: "produto", quantidade: 1 },
    ]);
    const [cartError, setCartError] = useState("");
    const [calcM2Idx, setCalcM2Idx] = useState<number | null>(null);
    const [showAllByStage, setShowAllByStage] = useState<Record<string, boolean>>({});
    const [presentationDefaultMode, setPresentationDefaultMode] = useState<ProposalPresentationMode>("completo");
    const [presentationStageModes, setPresentationStageModes] = useState<Record<string, ProposalPresentationMode>>({});
    const [showProposalGrandTotal, setShowProposalGrandTotal] = useState(true);
    const [proposalStartDate, setProposalStartDate] = useState("");
    const [proposalStageSchedule, setProposalStageSchedule] = useState<Record<string, ProposalStageSchedule>>({});
    const [showExecutionSchedule, setShowExecutionSchedule] = useState(true);
    const [showPhysicalFinancial, setShowPhysicalFinancial] = useState(true);
    const standardBudgetAppliedRef = useRef(false);
    // livre mode
    const [freeItems, setFreeItems] = useState<FreeItem[]>([newFreeItem()]);
    const [freeError, setFreeError] = useState("");
    const [suggesting, setSuggesting] = useState(false);
    const [contextoIA, setContextoIA] = useState("");
    const [showIAPanel, setShowIAPanel] = useState(false);
  
    const defaultTitle = editingProposta?.titulo ?? (
      lockedLeadId
        ? `Orçamento - ${leadNome || "Cliente"}`
        : ""
    );
  
    const form = useForm<PropostaFormValues>({
      resolver: zodResolver(propostaFormSchema),
      defaultValues: {
        leadId: lockedLeadId || "",
        titulo: defaultTitle,
        validadeAte: "",
        observacoes: "",
        formaPagamento: "",
        condPagamento: "",
        prazoEntrega: "",
        formaPagamentoMensalidade: "",
        condPagamentoMensalidade: "",
        recorrente: false,
        valorMensal: undefined,
        prazoContratoMeses: undefined,
        paymentCompositions: [],
        skipAsaasBilling: false,
      },
    });

    const budgetDraftKey = `vendorai:orcamento-draft:v2:${tenantId}:${lockedLeadId ?? "novo"}`;
    const legacyBudgetDraftKey = `vendorai:orcamento-draft:v1:${tenantId}:${lockedLeadId ?? "novo"}`;
    const [draftHydrated, setDraftHydrated] = useState(false);
    const [quickAddEtapaId, setQuickAddEtapaId] = useState(DEFAULT_ETAPA_ID);
    const budgetClosingRef = useRef(false);

    function persistBudgetDraft() {
      if (editingProposta || budgetClosingRef.current) return;
      localStorage.setItem(budgetDraftKey, JSON.stringify({
        form: form.getValues(),
        mode,
        selectedTemplateSlug,
        constructionSystem,
        orcamentoEtapas,
        cartLines,
        freeItems,
        presentationDefaultMode,
        presentationStageModes,
        showProposalGrandTotal,
        proposalStartDate,
        proposalStageSchedule,
        showExecutionSchedule,
        showPhysicalFinancial,
      }));
    }

    function clearBudgetDraft() {
      localStorage.removeItem(budgetDraftKey);
      localStorage.removeItem(legacyBudgetDraftKey);
      sessionStorage.removeItem(legacyBudgetDraftKey);
    }

    useEffect(() => {
      if (!open) {
        budgetClosingRef.current = true;
        setDraftHydrated(false);
        return;
      }
      budgetClosingRef.current = false;
      if (editingProposta) {
        setDraftHydrated(true);
        return;
      }

      try {
        const raw = localStorage.getItem(budgetDraftKey)
          ?? localStorage.getItem(legacyBudgetDraftKey)
          ?? sessionStorage.getItem(legacyBudgetDraftKey);
        if (raw) {
          if (!localStorage.getItem(budgetDraftKey)) {
            localStorage.setItem(budgetDraftKey, raw);
            localStorage.removeItem(legacyBudgetDraftKey);
            sessionStorage.removeItem(legacyBudgetDraftKey);
          }
          const draft = JSON.parse(raw) as {
            form?: Partial<PropostaFormValues>;
            mode?: "catalogo" | "livre" | "template" | "importar";
            selectedTemplateSlug?: string;
            constructionSystem?: ConstructionSystem;
            orcamentoEtapas?: OrcamentoEtapaDraft[];
            cartLines?: CartLine[];
            freeItems?: FreeItem[];
            presentationDefaultMode?: ProposalPresentationMode;
            presentationStageModes?: Record<string, ProposalPresentationMode>;
            showProposalGrandTotal?: boolean;
            proposalStartDate?: string;
            proposalStageSchedule?: Record<string, ProposalStageSchedule>;
            showExecutionSchedule?: boolean;
            showPhysicalFinancial?: boolean;
          };
          if (draft.form) form.reset({ ...form.getValues(), ...draft.form });
          if (draft.mode) setMode(draft.mode);
          if (draft.selectedTemplateSlug !== undefined) setSelectedTemplateSlug(draft.selectedTemplateSlug);
          if (draft.constructionSystem) setConstructionSystem(draft.constructionSystem);
          if (draft.orcamentoEtapas?.length) setOrcamentoEtapas(draft.orcamentoEtapas);
          if (draft.cartLines?.length) setCartLines(draft.cartLines);
          if (draft.freeItems?.length) setFreeItems(draft.freeItems);
          if (draft.presentationDefaultMode) setPresentationDefaultMode(draft.presentationDefaultMode);
          if (draft.presentationStageModes) setPresentationStageModes(draft.presentationStageModes);
          if (draft.showProposalGrandTotal !== undefined) setShowProposalGrandTotal(draft.showProposalGrandTotal);
          if (draft.proposalStartDate !== undefined) setProposalStartDate(draft.proposalStartDate);
          if (draft.proposalStageSchedule) setProposalStageSchedule(draft.proposalStageSchedule);
          if (draft.showExecutionSchedule !== undefined) setShowExecutionSchedule(draft.showExecutionSchedule);
          if (draft.showPhysicalFinancial !== undefined) setShowPhysicalFinancial(draft.showPhysicalFinancial);
          standardBudgetAppliedRef.current = true;
        }
      } catch {
        clearBudgetDraft();
      } finally {
        setDraftHydrated(true);
      }
    }, [open, editingProposta?.id, budgetDraftKey]);

    useEffect(() => {
      if (!open || editingProposta || !draftHydrated) return;

      persistBudgetDraft();
      const subscription = form.watch(() => persistBudgetDraft());
      return () => subscription.unsubscribe();
    }, [
      open,
      editingProposta?.id,
      draftHydrated,
      budgetDraftKey,
      mode,
      selectedTemplateSlug,
      constructionSystem,
      orcamentoEtapas,
      cartLines,
      freeItems,
      presentationDefaultMode,
      presentationStageModes,
      showProposalGrandTotal,
      proposalStartDate,
      proposalStageSchedule,
      showExecutionSchedule,
      showPhysicalFinancial,
      form,
    ]);

    useEffect(() => {
      if (!open || editingProposta) return;
      const preventAccidentalRefresh = (event: BeforeUnloadEvent) => {
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", preventAccidentalRefresh);
      return () => window.removeEventListener("beforeunload", preventAccidentalRefresh);
    }, [open, editingProposta?.id]);
  
    const watchRecorrente = form.watch("recorrente");
    const watchValorMensal = form.watch("valorMensal");
    const watchPrazoMeses = form.watch("prazoContratoMeses");
    const totalContrato = (watchValorMensal ?? 0) * (watchPrazoMeses ?? 0);
  
    const { data: leads = [] } = useListTenantLeads(tenantId, {
      query: {
        queryKey: getListTenantLeadsQueryKey(tenantId),
        enabled: !!tenantId && !lockedLeadId,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 300_000,
      },
    });
    const { data: paymentMethods } = useListPaymentMethods(tenantId, {
      query: {
        queryKey: getListPaymentMethodsQueryKey(tenantId),
        enabled: !!tenantId,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 300_000,
      },
    });
    const pmLabels = paymentMethods?.methods?.reduce((acc: Record<string, string>, m) => {
      if (m.enabled && m.code) acc[m.code] = m.label ?? m.code;
      return acc;
    }, {} as Record<string, string>) ?? {};
  
    const createFromCatMut      = useCreatePropostaFromCatalogo();
    const createLivreMut        = useCreateProposta();
    const updateExistingMut     = useUpdateProposta();
    const createFromTemplateMut = useCreatePropostaFromTemplate();
    const { mutate: createDeal } = useCreateDeal();
    const { data: propostaTemplates = [] } = useListPropostaTemplates(tenantId, {
      query: {
        queryKey: getListPropostaTemplatesQueryKey(tenantId),
        enabled: !!tenantId && open,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 300_000,
      },
    });
    const activeCatalog     = catalog.filter((p) => p.ativo);
    const { data: composicoes = [] } = useListComposicoes(tenantId, {}, {
      query: {
        queryKey: getListComposicoesQueryKey(tenantId),
        enabled: !!tenantId && open,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 300_000,
      },
    });
  
    useEffect(() => {
      if (!open || !editingProposta) return;

      standardBudgetAppliedRef.current = true;
      const currentItems = ((editingProposta.itens ?? []) as Array<any>);
      const currentPresentation = (editingProposta as any).apresentacao as {
        modoPadrao?: ProposalPresentationMode;
        etapas?: Record<string, ProposalPresentationMode>;
        mostrarTotalGeral?: boolean;
        previsaoInicio?: string;
        cronogramaEtapas?: Record<string, ProposalStageSchedule>;
        mostrarCronogramaExecucao?: boolean;
        mostrarFisicoFinanceiro?: boolean;
      } | null | undefined;
      setPresentationDefaultMode(currentPresentation?.modoPadrao ?? "completo");
      setPresentationStageModes(currentPresentation?.etapas ?? {});
      setShowProposalGrandTotal(currentPresentation?.mostrarTotalGeral ?? true);
      setProposalStartDate(currentPresentation?.previsaoInicio ?? "");
      setProposalStageSchedule(currentPresentation?.cronogramaEtapas ?? {});
      setShowExecutionSchedule(currentPresentation?.mostrarCronogramaExecucao ?? true);
      setShowPhysicalFinancial(currentPresentation?.mostrarFisicoFinanceiro ?? true);

      form.reset({
        leadId: editingProposta.leadId,
        titulo: editingProposta.titulo,
        validadeAte: editingProposta.validadeAte ? String(editingProposta.validadeAte).slice(0, 10) : "",
        observacoes: editingProposta.observacoes ?? "",
        formaPagamento: editingProposta.formaPagamento ?? "",
        condPagamento: editingProposta.condPagamento ?? "",
        prazoEntrega: editingProposta.prazoEntrega ?? "",
        formaPagamentoMensalidade: (editingProposta as any).formaPagamentoMensalidade ?? "",
        condPagamentoMensalidade: (editingProposta as any).condPagamentoMensalidade ?? "",
        recorrente: editingProposta.recorrente ?? false,
        valorMensal: editingProposta.valorMensal != null ? Number(editingProposta.valorMensal) : undefined,
        prazoContratoMeses: editingProposta.prazoContratoMeses ?? undefined,
        paymentCompositions: ((editingProposta as any).paymentCompositions ?? []).map((item: any) => ({
          forma: item.forma ?? "",
          valor: Number(item.valor ?? 0),
          comprovanteUrl: item.comprovanteUrl ?? "",
        })),
        skipAsaasBilling: false,
      });

      const allStructured = currentItems.length > 0
        && currentItems.every((item) => Boolean(item.produtoId || item.composicaoId));

      if (currentItems.length === 0) {
        // Orçamento legado vazio: abrir diretamente no construtor completo,
        // sem criar uma cópia nem esconder as funções de etapas/composições.
        setMode("catalogo");
        setOrcamentoEtapas(buildStandardStages("icf"));
        setCartLines([]);
        setFreeItems([newFreeItem()]);
      } else if (allStructured) {
        setMode("catalogo");

        const groups = new Map<string, OrcamentoEtapaDraft & { ordem: number }>();
        currentItems.forEach((item, index) => {
          const ordem = Number(item.etapaOrdem ?? item.ordemExecucao ?? index + 1);
          const etapaId = String(item.etapaId ?? `etapa-existente-${ordem}`);
          if (!groups.has(etapaId)) {
            groups.set(etapaId, {
              id: etapaId,
              nome: item.etapaNome ?? `Etapa ${ordem}`,
              ordem,
            });
          }
        });

        const etapas = Array.from(groups.values())
          .sort((a, b) => a.ordem - b.ordem)
          .map(({ id, nome }) => ({ id, nome }));

        setOrcamentoEtapas(etapas.length ? etapas : buildStandardStages("icf"));
        setCartLines(currentItems.map((item, index) => ({
          etapaId: String(item.etapaId ?? etapas[0]?.id ?? DEFAULT_ETAPA_ID),
          tipo: item.composicaoId ? "composicao" as const : "produto" as const,
          produtoId: item.produtoId ?? undefined,
          composicaoId: item.composicaoId ?? undefined,
          quantidade: roundBudgetNumber(item.quantidade ?? 1),
          precoUnitarioOverride: roundBudgetNumber(item.valorUnitario ?? 0),
          nomeOverride: item.nome ?? undefined,
        })));
        setFreeItems([newFreeItem()]);
      } else {
        setMode("livre");
        setFreeItems(currentItems.length
          ? currentItems.map((item, index) => ({
              id: String(item.id ?? `item-existente-${index}`),
              nome: item.nome ?? "",
              quantidade: roundBudgetNumber(item.quantidade ?? 1),
              valorUnitario: roundBudgetNumber(item.valorUnitario ?? 0),
            }))
          : [newFreeItem()]
        );
        setOrcamentoEtapas(buildStandardStages("icf"));
        setCartLines([]);
      }

      setCartError("");
      setFreeError("");
      setShowAllByStage({});
    }, [open, editingProposta?.id]);

    useEffect(() => {
      if (!open || editingProposta || initialProductIds.length === 0) return;
      standardBudgetAppliedRef.current = true;
      setMode("catalogo");
      setCartLines(initialProductIds.map((produtoId) => ({
        etapaId: DEFAULT_ETAPA_ID,
        tipo: "produto" as const,
        produtoId,
        quantidade: 1,
      })));
    }, [open, initialProductIds.join(",")]);

    useEffect(() => {
      if (!orcamentoEtapas.some((etapa) => etapa.id === quickAddEtapaId)) {
        setQuickAddEtapaId(orcamentoEtapas[0]?.id ?? DEFAULT_ETAPA_ID);
      }
    }, [orcamentoEtapas, quickAddEtapaId]);

    useEffect(() => {
      if (!open || editingProposta || initialProductIds.length > 0 || standardBudgetAppliedRef.current || composicoes.length === 0) return;
      standardBudgetAppliedRef.current = true;
      setMode("catalogo");
      if (constructionSystem === "icf") {
        const standard = buildStandardIcfBudget(composicoes);
        setOrcamentoEtapas(standard.etapas);
        setCartLines(standard.lines);
      } else {
        setOrcamentoEtapas(buildStandardStages(constructionSystem));
        setCartLines([]);
      }
      setShowAllByStage({});
    }, [open, composicoes, constructionSystem, initialProductIds.join(",")]);
  
    // totals
    const catTotal = roundBudgetNumber(cartLines.reduce((sum, line) => {
      const produto = line.produtoId ? activeCatalog.find((item) => item.id === line.produtoId) : undefined;
      const composicao = line.composicaoId ? composicoes.find((item) => item.id === line.composicaoId) : undefined;
      if (!produto && !composicao) return sum;

      const basePrice = produto
        ? parseFloat(produto.precoBase)
        : Number(composicao?.custoTotal ?? 0);
      const unitPrice = roundBudgetNumber(line.precoUnitarioOverride !== undefined ? line.precoUnitarioOverride : basePrice);
      const quantidade = roundBudgetNumber(line.quantidade);
      return sum + quantidade * unitPrice;
    }, 0));
    const freeTotal = roundBudgetNumber(
      freeItems.reduce(
        (sum, item) => sum + roundBudgetNumber(item.quantidade) * roundBudgetNumber(item.valorUnitario),
        0,
      ),
    );

    // ── Importar orçamento de outro sistema ──────────────────────────────
    const [importValorTotal, setImportValorTotal] = useState<number>(0);
    const [importArquivo, setImportArquivo] = useState<{ url: string; nome: string } | null>(null);
    const [importUploading, setImportUploading] = useState(false);
    const [importError, setImportError] = useState("");
    const importFileInputRef = useRef<HTMLInputElement>(null);

    async function uploadImportFile(file: File) {
      setImportUploading(true);
      try {
        const metaRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!metaRes.ok) throw new Error("Falha ao obter URL de upload");
        const { uploadURL, objectPath } = (await metaRes.json()) as { uploadURL: string; objectPath: string };
        const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!putRes.ok) throw new Error("Falha ao enviar arquivo");
        setImportArquivo({ url: `${window.location.origin}/api/storage${objectPath}`, nome: file.name });
      } catch {
        toast({ title: "Erro no upload do arquivo", variant: "destructive" });
      } finally {
        setImportUploading(false);
      }
    }

    function saveDraftAndContinue() {
      if (editingProposta) {
        void form.handleSubmit((vals) => onSubmit(vals, true))();
        return;
      }
      persistBudgetDraft();
      toast({
        title: "Orçamento salvo",
        description: "Você pode continuar exatamente deste ponto, mesmo após fechar e reabrir esta tela.",
      });
    }

    function handleClose() {
      // O reset do formulário dispara watchers do react-hook-form.
      // Bloqueamos o autosave durante o fechamento para não substituir
      // o rascunho válido por um orçamento vazio.
      budgetClosingRef.current = true;
      form.reset({
        leadId: lockedLeadId || "",
        titulo: lockedLeadId ? defaultTitle : "",
        validadeAte: "",
        observacoes: "",
        formaPagamento: "",
        condPagamento: "",
        prazoEntrega: "",
        formaPagamentoMensalidade: "",
        condPagamentoMensalidade: "",
        recorrente: false,
        valorMensal: undefined,
        prazoContratoMeses: undefined,
      });
      setMode("catalogo");
      setSelectedTemplateSlug("");
      setConstructionSystem("icf");
      setOrcamentoEtapas([{ id: DEFAULT_ETAPA_ID, nome: getStageNamesForSystem("icf")[0] }]);
      setCartLines([{ etapaId: DEFAULT_ETAPA_ID, tipo: "produto", quantidade: 1 }]);
      setCartError("");
      setShowAllByStage({});
      setPresentationDefaultMode("completo");
      setPresentationStageModes({});
      setShowProposalGrandTotal(true);
      setProposalStartDate("");
      setProposalStageSchedule({});
      setShowExecutionSchedule(true);
      setShowPhysicalFinancial(true);
      standardBudgetAppliedRef.current = false;
      setDraftHydrated(false);
      setFreeItems([newFreeItem()]);
      setFreeError("");
      setContextoIA("");
      setShowIAPanel(false);
      onClose();
    }

  // ── catálogo por grupos de etapa ───────────────────────────────────────────
  function changeConstructionSystem(system: ConstructionSystem) {
    setConstructionSystem(system);
    standardBudgetAppliedRef.current = true;
    setShowAllByStage({});

    if (system === "icf") {
      const standard = buildStandardIcfBudget(composicoes);
      setOrcamentoEtapas(standard.etapas);
      setCartLines(standard.lines);
      toast({ title: "Sistema construtivo: ICF", description: "Pacote padrão ICF carregado nas etapas correspondentes." });
      return;
    }

    setOrcamentoEtapas(buildStandardStages(system));
    setCartLines([]);
    const label = CONSTRUCTION_SYSTEMS.find((item) => item.value === system)?.label ?? "Outro sistema";
    toast({
      title: `Sistema construtivo: ${label}`,
      description: "As etapas foram preparadas sem inserir composições ICF. Selecione as composições específicas deste sistema em cada etapa.",
    });
  }

  function addEtapaDraft() {
    const id = `etapa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setOrcamentoEtapas((prev) => {
      const ordem = prev.length;
      const nome = ETAPAS_OBRA_SUGERIDAS[ordem] ?? `Etapa ${ordem + 1}`;
      return [...prev, { id, nome }];
    });
    setQuickAddEtapaId(id);
  }

  function addMissingStandardIcfItems() {
    if (constructionSystem !== "icf") return;
    const standard = buildStandardIcfBudget(composicoes);
    if (standard.lines.length === 0) {
      toast({
        title: "Pacote padrão ICF indisponível",
        description: "As composições-base do modelo ICF não foram encontradas neste tenant.",
        variant: "destructive",
      });
      return;
    }

    const currentStageByKey = new Map(
      orcamentoEtapas.map((etapa) => [resolveOrcamentoStageKey(etapa.nome), etapa])
    );
    const mergedStandardStages = standard.etapas.map((standardStage) => {
      const key = resolveOrcamentoStageKey(standardStage.nome);
      return currentStageByKey.get(key) ?? standardStage;
    });
    const standardKeys = new Set(mergedStandardStages.map((etapa) => resolveOrcamentoStageKey(etapa.nome)));
    const customStages = orcamentoEtapas.filter((etapa) => !standardKeys.has(resolveOrcamentoStageKey(etapa.nome)));
    const nextStages = [...mergedStandardStages, ...customStages];

    const stageIdByKey = new Map(nextStages.map((etapa) => [resolveOrcamentoStageKey(etapa.nome), etapa.id]));
    const existingCompositionIds = new Set(
      cartLines.map((line) => line.composicaoId).filter(Boolean) as string[]
    );

    const missingLines = standard.lines
      .filter((line) => line.composicaoId && !existingCompositionIds.has(line.composicaoId))
      .map((line) => {
        const composicao = composicoes.find((item) => item.id === line.composicaoId);
        const matchingStage = composicao
          ? nextStages.find((etapa) => composicaoMatchesStage(composicao, etapa.nome))
          : undefined;
        const stageKey = matchingStage ? resolveOrcamentoStageKey(matchingStage.nome) : "acabamentos";
        return {
          ...line,
          etapaId: stageIdByKey.get(stageKey) ?? nextStages[0].id,
        };
      });

    setOrcamentoEtapas(nextStages);
    setCartLines((prev) => [...prev.filter((line) => line.produtoId || line.composicaoId), ...missingLines]);
    toast({
      title: "Pacote padrão ICF atualizado",
      description: missingLines.length
        ? `${missingLines.length} composição(ões) principal(is) adicionada(s) às etapas corretas.`
        : "Todos os itens principais já estavam no orçamento.",
    });
  }

  function updateEtapaDraft(etapaId: string, nome: string) {
    setOrcamentoEtapas((prev) => prev.map((etapa) => etapa.id === etapaId ? { ...etapa, nome } : etapa));
  }

  function moveEtapaDraft(index: number, direction: -1 | 1) {
    setOrcamentoEtapas((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeEtapaDraft(etapaId: string) {
    if (orcamentoEtapas.length <= 1) return;
    if (cartLines.some((line) => line.etapaId === etapaId)) return;
    setOrcamentoEtapas((prev) => prev.filter((etapa) => etapa.id !== etapaId));
  }

  function addCatLine(tipo: "produto" | "composicao" = "produto", etapaId?: string) {
    const targetEtapaId = etapaId ?? orcamentoEtapas[0]?.id ?? DEFAULT_ETAPA_ID;
    setCartLines((prev) => [...prev, { etapaId: targetEtapaId, tipo, quantidade: 1 }]);
  }
  async function calcularOrcamentoM2(payload: {
  produtoId: string;
  superficies: Record<string, unknown>[];
  acessorioProdutoId?: string;
}): Promise<ResultadoCalculoM2> {
  const res = await fetch(`/api/tenants/${tenantId}/propostas/calcular-orcamento`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Não foi possível calcular.");
  return data;
}
 
  function removeCatLine(i: number) { setCartLines((p) => p.filter((_, j) => j !== i)); }
  function updateCatLine(i: number, patch: Partial<CartLine>) {
    setCartLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function changeLineType(index: number, tipo: "produto" | "composicao") {
    setCartLines((prev) => prev.map((line, current) => current === index
      ? {
          etapaId: line.etapaId,
          tipo,
          quantidade: line.quantidade || 1,
          produtoId: undefined,
          composicaoId: undefined,
          precoUnitarioOverride: undefined,
          nomeOverride: undefined,
        }
      : line
    ));
  }

  function selectProduct(index: number, produtoId: string) {
    const prod = activeCatalog.find((p) => p.id === produtoId);
    if (!prod) {
      updateCatLine(index, {
        tipo: "produto",
        produtoId,
        composicaoId: undefined,
        precoUnitarioOverride: undefined,
        nomeOverride: undefined,
      });
      return;
    }

    const precoImpl = prod.precoImplantacao ? parseFloat(prod.precoImplantacao) : 0;
    const precoMens = prod.precoMensalidade ? parseFloat(prod.precoMensalidade) : 0;
    if (precoImpl > 0 && precoMens > 0) {
      setCartLines((prev) => [
        ...prev.slice(0, index),
        { etapaId: prev[index]?.etapaId ?? DEFAULT_ETAPA_ID, tipo: "produto", produtoId, quantidade: 1, precoUnitarioOverride: precoImpl, nomeOverride: `${prod.nome} — Implantação` },
        { etapaId: prev[index]?.etapaId ?? DEFAULT_ETAPA_ID, tipo: "produto", produtoId, quantidade: 1, precoUnitarioOverride: precoMens, nomeOverride: `${prod.nome} — Mensalidade` },
        ...prev.slice(index + 1),
      ]);
      return;
    }

    updateCatLine(index, {
      tipo: "produto",
      produtoId,
      composicaoId: undefined,
      precoUnitarioOverride: undefined,
      nomeOverride: undefined,
    });
  }

  function selectComposicao(index: number, composicaoId: string) {
    updateCatLine(index, {
      tipo: "composicao",
      composicaoId,
      produtoId: undefined,
      precoUnitarioOverride: undefined,
      nomeOverride: undefined,
    });
  }

  // ── livre helpers ─────────────────────────────────────────────────────────
  function addFreeItem()    { setFreeItems((p) => [...p, newFreeItem()]); }
  function removeFreeItem(id: string) { setFreeItems((p) => p.filter((i) => i.id !== id)); }
  function updateFreeItem(id: string, patch: Partial<FreeItem>) {
    setFreeItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  // ── AI suggestion ─────────────────────────────────────────────────────────
  async function suggestItems() {
    setSuggesting(true);
    try {
      const titulo   = form.getValues("titulo") || "orçamento";
      const leadId   = form.getValues("leadId");
      const resolvedLeadNome = lockedLeadId
        ? leadNome
        : leads.find((l) => l.id === leadId)?.nome;
      const res = await fetch(`/api/tenants/${tenantId}/propostas/suggest-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ titulo, leadNome: resolvedLeadNome, contexto: contextoIA }),
      });
      if (!res.ok) throw new Error("Falha");
      const data = await res.json();
      if (data.itens?.length) {
        setFreeItems(
          data.itens.map((item: { nome: string; quantidade?: number; valorUnitario?: number }) => ({
            id: Math.random().toString(36).slice(2),
            nome: item.nome ?? "",
            quantidade: item.quantidade ?? 1,
            valorUnitario: item.valorUnitario ?? 0,
          }))
        );
        toast({ title: `${data.itens.length} itens sugeridos pela IA` });
      }
    } catch {
      toast({ title: "Erro ao gerar sugestão", variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  }

  function saveExistingBudget(data: Record<string, unknown>, stayOpen = false) {
    if (!editingProposta) return false;

    updateExistingMut.mutate(
      { id: editingProposta.id, data: data as any },
      {
        onSuccess: async () => {
          toast({
            title: stayOpen ? "Orçamento salvo — continue editando" : "Orçamento atualizado com sucesso",
          });
          await qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          await qc.invalidateQueries({ queryKey: getGetPropostaQueryKey(editingProposta.id) });
          if (lockedLeadId) {
            await qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: lockedLeadId }) });
          }
          onSuccess?.();
          if (!stayOpen) handleClose();
        },
        onError: (error: any) => toast({
          title: "Erro ao atualizar orçamento",
          description: error?.message,
          variant: "destructive",
        }),
      }
    );
    return true;
  }

  function existingExecutionFor(line: CartLine | undefined, index: number) {
    if (!editingProposta) return {};
    const itens = (editingProposta.itens ?? []) as Array<any>;
    const byIdentity = line
      ? itens.find((item) =>
          String(item.etapaId ?? "") === String(line.etapaId ?? "")
          && (
            (line.produtoId && item.produtoId === line.produtoId)
            || (line.composicaoId && item.composicaoId === line.composicaoId)
          )
        )
      : undefined;
    const current = byIdentity ?? itens[index];
    return current
      ? {
          statusExecucao: current.statusExecucao ?? "pendente",
          iniciadoEm: current.iniciadoEm,
          executadoEm: current.executadoEm,
        }
      : { statusExecucao: "pendente" };
  }

  function proposalStageBudgetTotal(etapaId: string) {
    return cartLines
      .filter((line) => line.etapaId === etapaId)
      .reduce((sum, line) => {
        const produto = line.produtoId
          ? activeCatalog.find((item) => item.id === line.produtoId)
          : undefined;
        const composicao = line.composicaoId
          ? composicoes.find((item) => item.id === line.composicaoId)
          : undefined;
        const unitValue = line.precoUnitarioOverride !== undefined
          ? Number(line.precoUnitarioOverride)
          : Number(produto?.precoBase ?? composicao?.custoTotal ?? 0);
        return sum + Number(line.quantidade ?? 0) * unitValue;
      }, 0);
  }

  function proposalPresentationConfig() {
    return {
      modoPadrao: presentationDefaultMode,
      etapas: Object.fromEntries(
        orcamentoEtapas.map((etapa) => [
          etapa.id,
          presentationStageModes[etapa.id] ?? presentationDefaultMode,
        ])
      ),
      mostrarTotalGeral: showProposalGrandTotal,
      previsaoInicio: proposalStartDate || undefined,
      cronogramaEtapas: Object.fromEntries(
        orcamentoEtapas
          .map((etapa) => [etapa.id, proposalStageSchedule[etapa.id] ?? {}] as const)
          .filter(([, value]) => Object.values(value).some((entry) => entry !== undefined && entry !== "")),
      ),
      // As fotos representativas são geradas no fluxo da proposta e ficam
      // vinculadas ao orçamento. Editar preço, cronograma ou apresentação não
      // deve apagá-las.
      imagensEtapas:
        (editingProposta as any)?.apresentacao?.imagensEtapas
        && typeof (editingProposta as any).apresentacao.imagensEtapas === "object"
          ? (editingProposta as any).apresentacao.imagensEtapas
          : {},
      mostrarCronogramaExecucao: showExecutionSchedule,
      mostrarFisicoFinanceiro: showPhysicalFinancial,
    };
  }

  // ── submit ────────────────────────────────────────────────────────────────
  function onSubmit(vals: PropostaFormValues, stayOpen = false) {
    const recFields = vals.recorrente
      ? {
          recorrente: true,
          valorMensal: vals.valorMensal,
          prazoContratoMeses: vals.prazoContratoMeses,
          formaPagamentoMensalidade: vals.formaPagamentoMensalidade || undefined,
          condPagamentoMensalidade: vals.condPagamentoMensalidade || undefined,
        }
      : { recorrente: false, valorMensal: undefined, prazoContratoMeses: undefined };

    if (mode === "importar") {
      if (!importValorTotal || importValorTotal <= 0) { setImportError("Informe o valor total do orçamento."); return; }
      setImportError("");
      const paymentCompImport = vals.paymentCompositions?.filter((pc) => pc.forma && pc.valor > 0);
      createLivreMut.mutate(
        {
          data: {
            tenantId, leadId: vals.leadId, dealId: activeDealId, titulo: vals.titulo,
            validadeAte: vals.validadeAte || undefined,
            observacoes: vals.observacoes || undefined,
            formaPagamento: (vals.formaPagamento || undefined) as FormaPagamentoProposta | undefined,
            condPagamento: vals.condPagamento || undefined,
            prazoEntrega: vals.prazoEntrega || undefined,
            itens: [{ nome: "Orçamento importado de outro sistema", quantidade: 1, valorUnitario: importValorTotal }],
            valorTotal: importValorTotal,
            apresentacao: proposalPresentationConfig(),
            paymentCompositions: paymentCompImport?.length
              ? paymentCompImport.map((pc) => ({
                  forma: pc.forma as PaymentCompositionLineForma,
                  valor: roundBudgetNumber(pc.valor),
                  comprovanteUrl: pc.comprovanteUrl,
                }))
              : undefined,
            arquivoImportadoUrl: importArquivo?.url || undefined,
            arquivoImportadoNome: importArquivo?.nome || undefined,
          } as any,
        },
        {
          onSuccess: () => {
            toast({ title: "Orçamento importado com sucesso" });
            qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
            if (lockedLeadId) {
              qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: lockedLeadId }) });
            }
            if (!activeDealId) createDeal(
              { data: { tenantId, titulo: vals.titulo, leadId: vals.leadId, etapa: "proposta", valor: importValorTotal } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }), onError: (error: unknown) => toast({ title: "Orçamento salvo, mas o negócio não foi criado", description: error instanceof Error ? error.message : "Tente criar o negócio manualmente.", variant: "destructive" }) }
            );
            onSuccess?.();
            clearBudgetDraft();
            handleClose();
          },
          onError: () => toast({ title: "Erro ao importar orçamento", variant: "destructive" }),
        }
      );
    } else if (mode === "catalogo") {
      const etapaOrder = new Map(orcamentoEtapas.map((etapa, index) => [etapa.id, index + 1]));
      const etapaName = new Map(orcamentoEtapas.map((etapa, index) => [
        etapa.id,
        etapa.nome.trim() || `Etapa ${index + 1}`,
      ]));
      const valid = orcamentoEtapas.flatMap((etapa) =>
        cartLines.filter((line) =>
          line.etapaId === etapa.id
          && (
            (line.tipo === "produto" && line.produtoId)
            || (line.tipo === "composicao" && line.composicaoId)
          )
        )
      );
      if (!valid.length) { setCartError("Adicione pelo menos um produto ou composição em uma etapa."); return; }
      setCartError("");
      const paymentComp = vals.paymentCompositions?.filter((pc) => pc.forma && pc.valor > 0);
      const skipAsaas = vals.skipAsaasBilling;

      if (editingProposta) {
        const materializedItems = valid.map((line, itemIndex) => {
          const produto = line.produtoId ? activeCatalog.find((item) => item.id === line.produtoId) : undefined;
          const composicao = line.composicaoId ? composicoes.find((item) => item.id === line.composicaoId) : undefined;
          const basePrice = produto
            ? Number(produto.precoBase ?? 0)
            : Number(composicao?.custoTotal ?? 0);
          const valorUnitario = line.precoUnitarioOverride !== undefined
            ? Number(line.precoUnitarioOverride)
            : basePrice;

          return {
            nome: line.nomeOverride?.trim() || produto?.nome || composicao?.nome || "Item do orçamento",
            quantidade: roundBudgetNumber(line.quantidade ?? 1),
            valorUnitario: roundBudgetNumber(valorUnitario),
            ...(produto?.id ? { produtoId: produto.id } : {}),
            ...(composicao?.id ? { composicaoId: composicao.id } : {}),
            sku: produto?.sku ?? composicao?.codigo ?? undefined,
            descricao: produto?.descricao ?? composicao?.descricao ?? undefined,
            unidade: produto?.unidade ?? composicao?.unidade ?? undefined,
            etapaId: line.etapaId,
            etapaNome: etapaName.get(line.etapaId),
            etapaOrdem: etapaOrder.get(line.etapaId),
            ordemExecucao: itemIndex + 1,
            ...existingExecutionFor(line, itemIndex),
          };
        });
        const updatedTotal = materializedItems.reduce(
          (sum, item) => sum + Number(item.quantidade) * Number(item.valorUnitario),
          0
        );

        saveExistingBudget({
          titulo: vals.titulo,
          validadeAte: vals.validadeAte || undefined,
          observacoes: vals.observacoes || undefined,
          formaPagamento: (vals.formaPagamento || undefined) as FormaPagamentoProposta | undefined,
          condPagamento: vals.condPagamento || undefined,
          prazoEntrega: vals.prazoEntrega || undefined,
          ...recFields,
          itens: materializedItems,
          valorTotal: roundBudgetNumber(updatedTotal),
          apresentacao: proposalPresentationConfig(),
          paymentCompositions: paymentComp?.length
            ? paymentComp.map((pc) => ({
                forma: pc.forma as PaymentCompositionLineForma,
                valor: roundBudgetNumber(pc.valor),
                comprovanteUrl: pc.comprovanteUrl,
              }))
            : undefined,
          skipAsaasBilling: skipAsaas,
        }, stayOpen);
        return;
      }

      createFromCatMut.mutate(
        {
          tenantId,
          data: {
            leadId: vals.leadId,
            dealId: activeDealId,
            titulo: vals.titulo,
            validadeAte: vals.validadeAte || undefined,
            observacoes: vals.observacoes || undefined,
            formaPagamento: (vals.formaPagamento || undefined) as FormaPagamentoProposta | undefined,
            condPagamento: vals.condPagamento || undefined,
            prazoEntrega: vals.prazoEntrega || undefined,
            ...recFields,
            apresentacao: proposalPresentationConfig(),
            itens: valid.map((line, itemIndex) => ({
              ...(line.tipo === "produto" && line.produtoId ? { produtoId: line.produtoId } : {}),
              ...(line.tipo === "composicao" && line.composicaoId ? { composicaoId: line.composicaoId } : {}),
              quantidade: roundBudgetNumber(line.quantidade),
              precoUnitario: line.precoUnitarioOverride !== undefined
                ? roundBudgetNumber(line.precoUnitarioOverride)
                : undefined,
              nome: line.nomeOverride?.trim() || undefined,
              etapaId: line.etapaId,
              etapaNome: etapaName.get(line.etapaId),
              etapaOrdem: etapaOrder.get(line.etapaId),
              ordemExecucao: itemIndex + 1,
            })),
            paymentCompositions: paymentComp?.length
              ? paymentComp.map((pc) => ({ forma: pc.forma as PaymentCompositionLineForma, valor: roundBudgetNumber(pc.valor), comprovanteUrl: pc.comprovanteUrl }))
              : undefined,
            skipAsaasBilling: skipAsaas,
          } as any,
        },
        {
          onSuccess: () => {
            toast({ title: "Orçamento criado com sucesso" });
            qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
            if (lockedLeadId) {
              qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: lockedLeadId }) });
            }
            const dealValor = vals.recorrente && totalContrato > 0 ? totalContrato : catTotal || undefined;
            if (!activeDealId) createDeal(
              { data: { tenantId, titulo: vals.titulo, leadId: vals.leadId, etapa: "proposta", valor: dealValor, skipAsaasBilling: skipAsaas } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }), onError: (error: unknown) => toast({ title: "Orçamento salvo, mas o negócio não foi criado", description: error instanceof Error ? error.message : "Tente criar o negócio manualmente.", variant: "destructive" }) }
            );
            onSuccess?.();
            clearBudgetDraft();
            handleClose();
          },
          onError: () => toast({ title: "Erro ao criar orçamento", variant: "destructive" }),
        }
      );
    } else {
      const valid = freeItems.filter((i) => i.nome.trim());
      if (!valid.length) { setFreeError("Adicione pelo menos um item."); return; }
      setFreeError("");
      const paymentComp2 = vals.paymentCompositions?.filter((pc) => pc.forma && pc.valor > 0);
      const skipAsaas2 = vals.skipAsaasBilling;

      if (editingProposta) {
        const oldItems = (editingProposta.itens ?? []) as Array<any>;
        const updatedItems = valid.map((item, index) => {
          const previous = oldItems[index];
          return {
            nome: item.nome,
            quantidade: roundBudgetNumber(item.quantidade ?? 1),
            valorUnitario: roundBudgetNumber(item.valorUnitario ?? 0),
            sku: previous?.sku,
            descricao: previous?.descricao,
            unidade: previous?.unidade,
            produtoId: previous?.produtoId,
            composicaoId: previous?.composicaoId,
            etapaId: previous?.etapaId,
            etapaNome: previous?.etapaNome,
            etapaOrdem: previous?.etapaOrdem,
            ordemExecucao: index + 1,
            statusExecucao: previous?.statusExecucao ?? "pendente",
            iniciadoEm: previous?.iniciadoEm,
            executadoEm: previous?.executadoEm,
          };
        });
        const updatedTotal = updatedItems.reduce(
          (sum, item) => sum + Number(item.quantidade) * Number(item.valorUnitario),
          0
        );

        saveExistingBudget({
          titulo: vals.titulo,
          validadeAte: vals.validadeAte || undefined,
          observacoes: vals.observacoes || undefined,
          formaPagamento: (vals.formaPagamento || undefined) as FormaPagamentoProposta | undefined,
          condPagamento: vals.condPagamento || undefined,
          prazoEntrega: vals.prazoEntrega || undefined,
          ...recFields,
          itens: updatedItems,
          valorTotal: roundBudgetNumber(updatedTotal),
          apresentacao: proposalPresentationConfig(),
          paymentCompositions: paymentComp2?.length
            ? paymentComp2.map((pc) => ({
                forma: pc.forma as PaymentCompositionLineForma,
                valor: roundBudgetNumber(pc.valor),
                comprovanteUrl: pc.comprovanteUrl,
              }))
            : undefined,
          skipAsaasBilling: skipAsaas2,
        }, stayOpen);
        return;
      }

      createLivreMut.mutate(
        { data: { tenantId, leadId: vals.leadId, dealId: activeDealId, titulo: vals.titulo, validadeAte: vals.validadeAte || undefined, observacoes: vals.observacoes || undefined, formaPagamento: (vals.formaPagamento || undefined) as FormaPagamentoProposta | undefined, condPagamento: vals.condPagamento || undefined, prazoEntrega: vals.prazoEntrega || undefined, ...recFields, apresentacao: proposalPresentationConfig(), itens: valid.map((i) => ({ nome: i.nome, quantidade: roundBudgetNumber(i.quantidade), valorUnitario: roundBudgetNumber(i.valorUnitario) })), valorTotal: freeTotal, paymentCompositions: paymentComp2?.length ? paymentComp2.map((pc) => ({ forma: pc.forma as PaymentCompositionLineForma, valor: roundBudgetNumber(pc.valor), comprovanteUrl: pc.comprovanteUrl })) : undefined, skipAsaasBilling: skipAsaas2 } as any },
        {
          onSuccess: () => {
            toast({ title: "Orçamento criado com sucesso" });
            qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
            if (lockedLeadId) {
              qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: lockedLeadId }) });
            }
            const dealValor = vals.recorrente && totalContrato > 0 ? totalContrato : freeTotal || undefined;
            if (!activeDealId) createDeal(
              { data: { tenantId, titulo: vals.titulo, leadId: vals.leadId, etapa: "proposta", valor: dealValor, skipAsaasBilling: skipAsaas2 } },
              { onSuccess: () => qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }), onError: (error: unknown) => toast({ title: "Orçamento salvo, mas o negócio não foi criado", description: error instanceof Error ? error.message : "Tente criar o negócio manualmente.", variant: "destructive" }) }
            );
            onSuccess?.();
            clearBudgetDraft();
            handleClose();
          },
          onError: () => toast({ title: "Erro ao criar proposta", variant: "destructive" }),
        }
      );
    }
  }

  function onSubmitTemplate(vals: PropostaFormValues) {
    if (!selectedTemplateSlug) {
      toast({ title: "Selecione um template de plano", variant: "destructive" });
      return;
    }
    const leadId = vals.leadId;
    if (!leadId) {
      toast({ title: "Selecione um lead", variant: "destructive" });
      return;
    }
    const paymentComp = vals.paymentCompositions?.filter((pc) => pc.forma && pc.valor > 0);
    createFromTemplateMut.mutate(
      {
        tenantId,
        data: {
          templateSlug: selectedTemplateSlug,
          leadId,
          dealId: activeDealId,
          validadeAte: vals.validadeAte || undefined,
          observacoes: vals.observacoes || undefined,
          formaPagamento: (vals.formaPagamento || undefined) as FormaPagamentoProposta | undefined,
          condPagamento: vals.condPagamento || undefined,
          prazoEntrega: vals.prazoEntrega || undefined,
          paymentCompositions: paymentComp?.length
            ? paymentComp.map((pc) => ({
                forma: pc.forma as PaymentCompositionLineForma,
                valor: roundBudgetNumber(pc.valor),
                comprovanteUrl: pc.comprovanteUrl,
              }))
            : undefined,
        } as any,
      },
      {
        onSuccess: (proposta) => {
          toast({ title: "Orçamento criado a partir do template" });
          qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          if (lockedLeadId) {
            qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId, { leadId: lockedLeadId }) });
          }
          if (!activeDealId) createDeal(
            { data: { tenantId, titulo: (proposta as { titulo?: string }).titulo ?? vals.titulo, leadId, etapa: "proposta" } },
            { onSuccess: () => qc.invalidateQueries({ queryKey: getListDealsQueryKey(tenantId) }), onError: (error: unknown) => toast({ title: "Orçamento salvo, mas o negócio não foi criado", description: error instanceof Error ? error.message : "Tente criar o negócio manualmente.", variant: "destructive" }) }
          );
          onSuccess?.();
          clearBudgetDraft();
          handleClose();
        },
        onError: () => toast({ title: "Erro ao criar orçamento do template", variant: "destructive" }),
      }
    );
  }

  const isPending = createFromCatMut.isPending || createLivreMut.isPending || createFromTemplateMut.isPending || updateExistingMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        data-vendorai-refresh-protected="true"
        className="max-w-[96vw] xl:max-w-[1600px] max-h-[95vh] overflow-y-auto"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{editingProposta ? "Editar Orçamento" : "Novo Orçamento"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(mode === "template" ? onSubmitTemplate : (vals) => onSubmit(vals, false))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                event.preventDefault();
              }
            }}
            className="space-y-5"
          >
            {/* Lead + Título */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="leadId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead</FormLabel>
                  {lockedLeadId ? (
                    <FormControl>
                      <Input
                        value={leadNome ? `${leadNome}${leadTelefone ? " / " + leadTelefone : ""}${leadEmpresa ? " / " + leadEmpresa : ""}` : lockedLeadId}
                        disabled
                        className="bg-muted text-muted-foreground"
                      />
                    </FormControl>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione o lead" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {leads.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="titulo" render={({ field }) => (
                <FormItem><FormLabel>Título</FormLabel><FormControl><Input placeholder="Ex: Orçamento Plano Pro" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[280px_1fr] md:items-end">
              <div className="space-y-1.5">
                <Label>Sistema construtivo</Label>
                <Select value={constructionSystem} onValueChange={(value) => changeConstructionSystem(value as ConstructionSystem)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o sistema construtivo" /></SelectTrigger>
                  <SelectContent>
                    {CONSTRUCTION_SYSTEMS.map((system) => (
                      <SelectItem key={system.value} value={system.value}>{system.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                {constructionSystem === "icf"
                  ? "ICF usa o pacote automático já cadastrado."
                  : "As etapas comuns são criadas automaticamente, mas não carregamos composições ICF neste sistema."}
              </div>
            </div>

            {/* Origens do orçamento: todas usam o mesmo fluxo e persistência real. */}
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium">Como deseja montar este orçamento?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Use um modelo pronto, selecione produtos ou composições, ou informe itens livres.</p>
            </div>
            <div className="flex rounded-lg border overflow-hidden text-sm">
              {!editingProposta && (
                <button
                  type="button"
                  onClick={() => setMode("template")}
                  className={`flex-1 py-2 font-medium transition-colors ${mode === "template" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  Modelos de orçamento
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("catalogo")}
                className={`flex-1 py-2 font-medium transition-colors ${mode === "catalogo" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                Catálogo + Composições
              </button>
              <button
                type="button"
                onClick={() => setMode("livre")}
                className={`flex-1 py-2 font-medium transition-colors ${mode === "livre" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                Itens Livres
              </button>
              {!editingProposta && (
                <button
                  type="button"
                  onClick={() => setMode("importar")}
                  className={`flex-1 py-2 font-medium transition-colors ${mode === "importar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  Importar de outro sistema
                </button>
              )}
            </div>

            {/* ── TEMPLATE MODE ─────────────────────────────────────────────── */}
            {mode === "template" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Escolha um modelo pronto para criar o orçamento com itens e valores pré-configurados. Você poderá revisar antes de enviar.</p>
                {selectedTemplateSlug ? (
                  (() => {
                    const sel = propostaTemplates.find((t: PropostaTemplate) => t.slug === selectedTemplateSlug);
                    if (!sel) return null;
                    const totalSel = (sel.itens as Array<{ quantidade: number; valorUnitario: number }>).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
                    return (
                      <div className="rounded-lg border-2 border-primary bg-primary/5 p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-primary text-lg">✓</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{sel.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {(sel.itens as Array<{ nome: string }>).map((i) => i.nome).join(" + ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold">{fmtCurrency(totalSel)}</p>
                            <p className="text-xs text-muted-foreground">{sel.cycle === "annual" ? "anual" : "mensal"}</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTemplateSlug("")}>
                            Alterar
                          </Button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                <div className="grid gap-2">
                  {propostaTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum template disponível</p>
                  ) : (
                    propostaTemplates.map((t: PropostaTemplate) => {
                      const totalTemplate = (t.itens as Array<{ quantidade: number; valorUnitario: number }>).reduce(
                        (s, i) => s + i.quantidade * i.valorUnitario, 0
                      );
                      return (
                        <button
                          key={t.slug}
                          type="button"
                          onClick={() => setSelectedTemplateSlug(t.slug)}
                          className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/50 hover:border-primary"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{t.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {(t.itens as Array<{ nome: string }>).map((i) => i.nome).join(" + ")}
                              </p>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <p className="text-sm font-bold">{fmtCurrency(totalTemplate)}</p>
                              <p className="text-xs text-muted-foreground">{t.cycle === "annual" ? "pagamento anual" : "mensal"}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                )}
              </div>
            )}

            {/* ── CATÁLOGO + COMPOSIÇÕES POR ETAPA ────────────────────────── */}
            {mode === "catalogo" && (
              <div className="space-y-4">
                <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
                  <span className="text-xs font-medium text-muted-foreground">Adicionar em</span>
                  <Select value={quickAddEtapaId} onValueChange={setQuickAddEtapaId}>
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {orcamentoEtapas.map((etapa, index) => (
                        <SelectItem key={etapa.id} value={etapa.id}>
                          Etapa {index + 1} · {etapa.nome || `Etapa ${index + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => addCatLine("produto", quickAddEtapaId)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Novo produto
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addCatLine("composicao", quickAddEtapaId)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Nova composição
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addEtapaDraft}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Nova etapa
                  </Button>
                  <span className="ml-auto text-[11px] text-muted-foreground">Rascunho salvo automaticamente</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Etapas do Orçamento</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {constructionSystem === "icf"
                        ? "O orçamento ICF inicia com as etapas e composições principais. Remova o que não se aplica, ajuste quantidades e adicione opcionais dentro da etapa correspondente."
                        : "As etapas seguem a sequência executiva do sistema escolhido. Adicione somente as composições compatíveis com esse método construtivo."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {constructionSystem === "icf" && (
                      <Button type="button" variant="outline" size="sm" onClick={addMissingStandardIcfItems}>
                        <Package className="h-3.5 w-3.5 mr-1" /> Completar pacote padrão ICF
                      </Button>
                    )}
                  </div>
                </div>

                <datalist id="etapas-obras-sugeridas">
                  {getStageNamesForSystem(constructionSystem).map((nome) => <option key={nome} value={nome} />)}
                </datalist>

                {orcamentoEtapas.map((etapa, etapaIndex) => {
                  const stageEntries = cartLines
                    .map((line, index) => ({ line, index }))
                    .filter(({ line }) => line.etapaId === etapa.id);

                  const selectedProductIds = new Set(stageEntries.map(({ line }) => line.produtoId).filter(Boolean) as string[]);
                  const selectedComposicaoIds = new Set(stageEntries.map(({ line }) => line.composicaoId).filter(Boolean) as string[]);
                  const showAllForStage = Boolean(showAllByStage[etapa.id]);
                  const produtosEtapa = activeCatalog.filter((item) =>
                    showAllForStage || selectedProductIds.has(item.id) || produtoMatchesStage(item, etapa.nome)
                  );
                  const composicoesEtapa = composicoes.filter((item: Composicao) =>
                    showAllForStage || selectedComposicaoIds.has(item.id) || composicaoMatchesStage(item, etapa.nome, constructionSystem)
                  );

                  const etapaTotal = stageEntries.reduce((sum, { line }) => {
                    const prod = line.tipo === "produto" && line.produtoId
                      ? activeCatalog.find((item) => item.id === line.produtoId)
                      : undefined;
                    const composicao = line.tipo === "composicao" && line.composicaoId
                      ? composicoes.find((item) => item.id === line.composicaoId)
                      : undefined;
                    if (!prod && !composicao) return sum;
                    const basePrice = prod ? parseFloat(prod.precoBase) : Number(composicao?.custoTotal ?? 0);
                    const unitPrice = line.precoUnitarioOverride !== undefined ? line.precoUnitarioOverride : basePrice;
                    return sum + line.quantidade * unitPrice;
                  }, 0);

                  return (
                    <Card key={etapa.id} className="overflow-hidden">
                      <CardHeader className="p-3 bg-muted/30 border-b">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary whitespace-nowrap">
                            Etapa {etapaIndex + 1}
                          </span>
                          <Input
                            list="etapas-obras-sugeridas"
                            className="h-8 min-w-[220px] flex-1 font-medium"
                            value={etapa.nome}
                            onChange={(e) => updateEtapaDraft(etapa.id, e.target.value)}
                            placeholder="Nome da etapa"
                          />
                          <div className="text-right min-w-[120px]">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
                            <p className="text-sm font-bold">{fmtCurrency(etapaTotal)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={etapaIndex === 0}
                              onClick={() => moveEtapaDraft(etapaIndex, -1)}
                              title="Mover etapa para cima"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={etapaIndex === orcamentoEtapas.length - 1}
                              onClick={() => moveEtapaDraft(etapaIndex, 1)}
                              title="Mover etapa para baixo"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={orcamentoEtapas.length <= 1 || stageEntries.length > 0}
                              onClick={() => removeEtapaDraft(etapa.id)}
                              title={stageEntries.length > 0 ? "Remova os itens antes de excluir a etapa" : "Excluir etapa"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => { setQuickAddEtapaId(etapa.id); addCatLine("produto", etapa.id); }}>
                              <Plus className="h-3.5 w-3.5 mr-1" /> Novo produto
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => { setQuickAddEtapaId(etapa.id); addCatLine("composicao", etapa.id); }}>
                              <Plus className="h-3.5 w-3.5 mr-1" /> Nova composição
                            </Button>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>
                              {showAllForStage
                                ? `Exibindo catálogo completo · ${activeCatalog.length} produtos · ${composicoes.length} composições`
                                : `${produtosEtapa.length} produtos · ${composicoesEtapa.length} composições compatíveis`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setShowAllByStage((prev) => ({ ...prev, [etapa.id]: !showAllForStage }))}
                            >
                              {showAllForStage ? "Filtrar pela etapa" : "Mostrar todos"}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="p-0">
                        {stageEntries.length === 0 ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            Nenhum item nesta etapa. Adicione produtos ou composições.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs py-2 w-32">Tipo</TableHead>
                                  <TableHead className="text-xs py-2">Item</TableHead>
                                  <TableHead className="text-xs py-2 w-24">Qtd</TableHead>
                                  <TableHead className="text-xs py-2 w-32 text-right">Preço unit.</TableHead>
                                  <TableHead className="text-xs py-2 w-28 text-right">Subtotal</TableHead>
                                  <TableHead className="w-8 py-2" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {stageEntries.map(({ line, index: idx }) => {
                                  const prod = line.tipo === "produto" && line.produtoId
                                    ? activeCatalog.find((item) => item.id === line.produtoId)
                                    : undefined;
                                  const composicao = line.tipo === "composicao" && line.composicaoId
                                    ? composicoes.find((item) => item.id === line.composicaoId)
                                    : undefined;
                                  const selected = prod || composicao;
                                  const basePrice = prod ? parseFloat(prod.precoBase) : Number(composicao?.custoTotal ?? 0);
                                  const precoUnit = line.precoUnitarioOverride !== undefined ? line.precoUnitarioOverride : basePrice;
                                  const subtotal = selected ? line.quantidade * precoUnit : 0;
                                  const unidade = prod?.unidade ?? composicao?.unidade ?? "";

                                  return (
                                    <TableRow key={`${etapa.id}-${idx}`}>
                                      <TableCell className="py-1.5 align-top">
                                        <Select value={line.tipo} onValueChange={(value) => changeLineType(idx, value as "produto" | "composicao")}>
                                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="produto">Produto</SelectItem>
                                            <SelectItem value="composicao">Composição</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </TableCell>

                                      <TableCell className="py-1.5 min-w-[300px]">
                                        {line.tipo === "produto" ? (
                                          <Select value={line.produtoId} onValueChange={(value) => selectProduct(idx, value)}>
                                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione um produto…" /></SelectTrigger>
                                            <SelectContent>
                                              {produtosEtapa.length === 0 ? (
                                                <SelectItem value={`__no-product-${etapa.id}`} disabled>
                                                  Nenhum produto correspondente a esta etapa
                                                </SelectItem>
                                              ) : produtosEtapa.map((p) => (
                                                <SelectItem key={p.id} value={p.id}>
                                                  {p.nome}{p.categoriaNome ? ` · ${p.categoriaNome}` : ""}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Select value={line.composicaoId} onValueChange={(value) => selectComposicao(idx, value)}>
                                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione uma composição…" /></SelectTrigger>
                                            <SelectContent>
                                              {composicoesEtapa.length === 0 ? (
                                                <SelectItem value={`__no-composition-${etapa.id}`} disabled>
                                                  Nenhuma composição correspondente a esta etapa
                                                </SelectItem>
                                              ) : composicoesEtapa.map((item: Composicao) => (
                                                <SelectItem key={item.id} value={item.id}>
                                                  {item.nome}{item.codigo ? ` · ${item.codigo}` : ""}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        )}

                                        {(() => {
                                          const tipoCalculo = (prod as any)?.tipoCalculo;
                                          if (tipoCalculo !== "area_simples" && tipoCalculo !== "area_com_acabamento_perimetro") return null;
                                          return (
                                            <Button
                                              type="button"
                                              variant="link"
                                              size="sm"
                                              className="h-6 px-0 text-xs"
                                              onClick={() => setCalcM2Idx(idx)}
                                            >
                                              Calcular por m²
                                            </Button>
                                          );
                                        })()}

                                        {selected && (
                                          <div className="mt-1 space-y-1">
                                            <Label className="text-[10px] font-medium text-muted-foreground">
                                              Nome/descrição no orçamento
                                            </Label>
                                            <Input
                                              className="h-7 text-xs"
                                              value={line.nomeOverride ?? (prod?.nome ?? composicao?.nome ?? "")}
                                              onChange={(e) => updateCatLine(idx, { nomeOverride: e.target.value })}
                                              placeholder="Nome ou descrição que aparecerá no orçamento"
                                            />
                                          </div>
                                        )}

                                        {composicao && (
                                          <p className="mt-1 text-[11px] text-muted-foreground">
                                            Composição de obra · {composicao.unidade} · custo atual {fmtCurrency(Number(composicao.custoTotal ?? 0))}
                                          </p>
                                        )}
                                      </TableCell>

                                      <TableCell className="py-1.5">
                                        <BudgetQuantityInput
                                          value={line.quantidade}
                                          isComposition={Boolean(composicao)}
                                          onChange={(quantidade) => updateCatLine(idx, { quantidade })}
                                        />
                                      </TableCell>

                                      <TableCell className="py-1.5">
                                        <div className="relative flex items-center justify-end">
                                          <span className="absolute left-2 text-muted-foreground text-xs pointer-events-none">R$</span>
                                          <BudgetMoneyInput
                                            className="h-8 text-sm text-right font-mono pl-7 w-32"
                                            disabled={!selected}
                                            value={selected ? precoUnit : undefined}
                                            onChange={(value) => updateCatLine(idx, { precoUnitarioOverride: value ?? 0 })}
                                          />
                                          {selected && <span className="ml-1 text-xs text-muted-foreground shrink-0">/{unidade}</span>}
                                        </div>
                                      </TableCell>

                                      <TableCell className="py-1.5 text-right font-mono text-sm font-medium">
                                        {selected ? fmtCurrency(subtotal) : "—"}
                                      </TableCell>

                                      <TableCell className="py-1.5">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                          onClick={() => removeCatLine(idx)}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                <CalculoOrcamentoM2Dialog
                  open={calcM2Idx !== null}
                  onOpenChange={(value) => { if (!value) setCalcM2Idx(null); }}
                  produto={(() => {
                    if (calcM2Idx === null) return null;
                    const line = cartLines[calcM2Idx];
                    const p = line?.produtoId ? activeCatalog.find((item) => item.id === line.produtoId) as any : null;
                    return p ? { id: p.id, nome: p.nome, tipoCalculo: p.tipoCalculo } : null;
                  })()}
                  acessoriosDisponiveis={activeCatalog
                    .filter((p: any) => p.tipoCalculo === "acabamento_perimetro")
                    .map((p: any) => ({ id: p.id, nome: p.nome }))}
                  onCalcular={calcularOrcamentoM2}
                  onConfirm={(resultado: ResultadoConfirmadoCalculoM2) => {
                    if (calcM2Idx === null) return;
                    updateCatLine(calcM2Idx, {
                      quantidade: roundBudgetNumber(resultado.quantidade),
                      precoUnitarioOverride: roundBudgetNumber(resultado.precoUnitario),
                    });
                    if (resultado.itensComposicao && resultado.itensComposicao.length > 0) {
                      setCartLines((prev) => [
                        ...prev,
                        ...resultado.itensComposicao!.map((item) => ({
                          etapaId: prev[calcM2Idx]?.etapaId ?? DEFAULT_ETAPA_ID,
                          tipo: "produto" as const,
                          produtoId: item.produtoId,
                          quantidade: roundBudgetNumber(item.quantidade),
                          precoUnitarioOverride: roundBudgetNumber(item.precoUnitario),
                          nomeOverride: item.nome,
                        })),
                      ]);
                    }
                  }}
                />

                <div className="flex items-center justify-end gap-3 pr-2">
                  <span className="text-sm text-muted-foreground">Total estimado:</span>
                  <span className="text-lg font-bold">{fmtCurrency(catTotal)}</span>
                </div>
                {cartError && <p className="text-sm text-destructive">{cartError}</p>}
              </div>
            )}

            {mode === "catalogo" && (
              <Card className="border-primary/20 bg-primary/[0.02]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Apresentação da proposta</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Escolha o que o cliente verá em cada etapa. Quantidades, custos e cálculos continuam completos internamente.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto] md:items-end">
                    <div className="space-y-1.5">
                      <Label>Modo padrão</Label>
                      <Select
                        value={presentationDefaultMode}
                        onValueChange={(value) => setPresentationDefaultMode(value as ProposalPresentationMode)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROPOSAL_PRESENTATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2.5">
                      <Switch
                        checked={showProposalGrandTotal}
                        onCheckedChange={setShowProposalGrandTotal}
                      />
                      <div>
                        <p className="text-sm font-medium">Mostrar total geral</p>
                        <p className="text-[11px] text-muted-foreground">Pode ocultar o total final sem alterar o cálculo.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {orcamentoEtapas.map((etapa, index) => {
                      const selectedMode = presentationStageModes[etapa.id] ?? presentationDefaultMode;
                      const selectedInfo = PROPOSAL_PRESENTATION_OPTIONS.find((option) => option.value === selectedMode);
                      return (
                        <div key={etapa.id} className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[1fr_260px] md:items-center">
                          <div>
                            <p className="text-sm font-medium">Etapa {index + 1} · {etapa.nome || `Etapa ${index + 1}`}</p>
                            <p className="text-xs text-muted-foreground">{selectedInfo?.description}</p>
                          </div>
                          <Select
                            value={selectedMode}
                            onValueChange={(value) => setPresentationStageModes((prev) => ({
                              ...prev,
                              [etapa.id]: value as ProposalPresentationMode,
                            }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PROPOSAL_PRESENTATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    Exemplo: Fundação em <strong>Resumo da etapa</strong> mostra apenas o valor macro; Esquadrias em <strong>Preço por item</strong> mostra cada item e seu valor unitário na mesma proposta.
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Cronograma e físico-financeiro</p>
                      <p className="text-xs text-muted-foreground">
                        Cada etapa pode ter sua própria data de início e duração. Etapas podem ocorrer em paralelo; a proposta monta colunas mensais e soma automaticamente as cobranças das etapas ativas no mesmo período.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[220px_1fr_1fr] md:items-end">
                      <div className="space-y-1.5">
                        <Label>Previsão geral de início</Label>
                        <Input
                          type="date"
                          value={proposalStartDate}
                          onChange={(event) => setProposalStartDate(event.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2.5">
                        <Switch checked={showExecutionSchedule} onCheckedChange={setShowExecutionSchedule} />
                        <div>
                          <p className="text-sm font-medium">Cronograma de execução</p>
                          <p className="text-[11px] text-muted-foreground">Mostra início, término e duração por etapa.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2.5">
                        <Switch checked={showPhysicalFinancial} onCheckedChange={setShowPhysicalFinancial} />
                        <div>
                          <p className="text-sm font-medium">Cronograma físico-financeiro</p>
                          <p className="text-[11px] text-muted-foreground">Mostra peso físico, participação financeira, valor e marco de pagamento.</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {orcamentoEtapas.map((etapa, index) => {
                        const schedule = proposalStageSchedule[etapa.id] ?? {};
                        const stageBudgetValue = proposalStageBudgetTotal(etapa.id);
                        return (
                          <div
                            key={`schedule-${etapa.id}`}
                            className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[minmax(180px,1fr)_145px_110px_110px_minmax(220px,1fr)] md:items-end"
                          >
                            <div>
                              <p className="text-sm font-medium">Etapa {index + 1} · {etapa.nome || `Etapa ${index + 1}`}</p>
                              <p className="text-[11px] font-medium text-foreground/80">Valor da etapa no orçamento: {fmtCurrency(stageBudgetValue)}</p>
                              <p className="text-[11px] text-muted-foreground">Pode acontecer em paralelo com outras etapas. Se não informar a data, usa a previsão geral.</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Início da etapa</Label>
                              <Input
                                type="date"
                                value={schedule.inicioPrevisto ?? ""}
                                onChange={(event) => setProposalStageSchedule((prev) => ({
                                  ...prev,
                                  [etapa.id]: {
                                    ...(prev[etapa.id] ?? {}),
                                    inicioPrevisto: event.target.value || undefined,
                                  },
                                }))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Duração (dias)</Label>
                              <Input
                                type="number"
                                min="1"
                                placeholder="Ex: 15"
                                value={schedule.duracaoDias ?? ""}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setProposalStageSchedule((prev) => ({
                                    ...prev,
                                    [etapa.id]: {
                                      ...(prev[etapa.id] ?? {}),
                                      duracaoDias: raw === "" ? undefined : Math.max(1, Number(raw)),
                                    },
                                  }));
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Peso físico (%)</Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="Auto"
                                value={schedule.percentualFisico ?? ""}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  setProposalStageSchedule((prev) => ({
                                    ...prev,
                                    [etapa.id]: {
                                      ...(prev[etapa.id] ?? {}),
                                      percentualFisico: raw === "" ? undefined : Math.min(100, Math.max(0, Number(raw))),
                                    },
                                  }));
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Marco / condição da etapa</Label>
                              <Input
                                placeholder="Ex: pagamento na conclusão da fundação"
                                value={schedule.marcoPagamento ?? ""}
                                onChange={(event) => setProposalStageSchedule((prev) => ({
                                  ...prev,
                                  [etapa.id]: {
                                    ...(prev[etapa.id] ?? {}),
                                    marcoPagamento: event.target.value || undefined,
                                  },
                                }))}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                      <strong>Modelo por colunas:</strong> cada mês vira uma coluna. As linhas são as etapas do orçamento; em cada célula aparecem o valor previsto de cobrança e o avanço físico. Se Fundação, Estrutura, Instalações e Esquadrias estiverem ativas no mesmo mês, as quatro aparecem na mesma coluna e o rodapé soma a cobrança total daquele mês.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── LIVRE MODE ────────────────────────────────────────────────── */}
            {mode === "livre" && (
              <div className="space-y-3">
                {/* AI suggestion panel */}
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium text-violet-800 w-full"
                    onClick={() => setShowIAPanel((p) => !p)}
                  >
                    <Sparkles className="h-4 w-4" />
                    Sugerir itens com IA
                    <span className="ml-auto text-violet-500 text-xs">{showIAPanel ? "▲" : "▼"}</span>
                  </button>
                  {showIAPanel && (
                    <div className="space-y-2 pt-1">
                      <Textarea
                        placeholder="Descreva o que o cliente precisa (opcional)…  Ex: instalação de câmeras de segurança para escritório de 200m²"
                        className="resize-none text-sm h-20 bg-white"
                        value={contextoIA}
                        onChange={(e) => setContextoIA(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="w-full gap-2 bg-violet-700 hover:bg-violet-800 text-white"
                        disabled={suggesting}
                        onClick={suggestItems}
                      >
                        {suggesting ? (
                          <><Loader2 className="h-4 w-4 animate-spin" />Gerando itens...</>
                        ) : (
                          <><Sparkles className="h-4 w-4" />Gerar sugestão de itens</>
                        )}
                      </Button>
                      <p className="text-[11px] text-violet-600">A IA usa o título, lead e perfil do seu negócio para sugerir itens relevantes e preços de mercado.</p>
                    </div>
                  )}
                </div>

                {/* Editable items table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Itens do Orçamento</p>
                    <Button type="button" variant="outline" size="sm" onClick={addFreeItem}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                    </Button>
                  </div>
                  <div className="rounded-md border overflow-hidden overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2">Descrição do item</TableHead>
                          <TableHead className="text-xs py-2 w-20">Qtd</TableHead>
                          <TableHead className="text-xs py-2 w-32">Valor unit. (R$)</TableHead>
                          <TableHead className="text-xs py-2 w-28 text-right">Subtotal</TableHead>
                          <TableHead className="w-8 py-2" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {freeItems.map((item) => {
                          const subtotal = item.quantidade * item.valorUnitario;
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="py-1.5">
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="Ex: Instalação de câmera"
                                  value={item.nome}
                                  onChange={(e) => updateFreeItem(item.id, { nome: e.target.value })}
                                />
                              </TableCell>
                              <TableCell className="py-1.5">
                                <BudgetQuantityInput
                                  value={item.quantidade}
                                  isComposition={false}
                                  className="h-8 w-24"
                                  onChange={(quantidade) => updateFreeItem(item.id, { quantidade })}
                                />
                              </TableCell>
                              <TableCell className="py-1.5">
                                <BudgetMoneyInput
                                  className="h-8 text-sm w-28"
                                  value={item.valorUnitario}
                                  onChange={(value) => updateFreeItem(item.id, { valorUnitario: value ?? 0 })}
                                />
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono text-sm font-medium">
                                {item.nome ? fmtCurrency(subtotal) : "—"}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeFreeItem(item.id)} disabled={freeItems.length === 1}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-2 pr-2">
                    <span className="text-sm text-muted-foreground">Total:</span>
                    <span className="text-lg font-bold">{fmtCurrency(freeTotal)}</span>
                  </div>
                  {freeError && <p className="text-sm text-destructive mt-1">{freeError}</p>}
                </div>
              </div>
            )}

            {/* ── IMPORT MODE ───────────────────────────────────────────────── */}
            {mode === "importar" && (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Anexe o orçamento gerado em outro sistema (PDF, planilha, imagem etc.) e informe o valor total.
                  O arquivo original fica salvo aqui pra consulta — os itens não precisam ser detalhados linha a linha.
                </div>

                <div className="grid gap-1.5">
                  <FormLabel>Arquivo do orçamento</FormLabel>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadImportFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start gap-2 w-fit"
                    disabled={importUploading}
                    onClick={() => importFileInputRef.current?.click()}
                  >
                    {importUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {importUploading ? "Enviando…" : importArquivo ? "Trocar arquivo" : "Selecionar arquivo"}
                  </Button>
                  {importArquivo && (
                    <a href={importArquivo.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5 mt-1">
                      <FileText className="h-3.5 w-3.5" />
                      {importArquivo.nome}
                    </a>
                  )}
                </div>

                <div className="grid gap-1.5 max-w-xs">
                  <FormLabel>Valor total (R$)</FormLabel>
                  <BudgetMoneyInput
                    value={importValorTotal || undefined}
                    onChange={(value) => setImportValorTotal(value ?? 0)}
                  />
                </div>

                {importError && <p className="text-sm text-destructive">{importError}</p>}
              </div>
            )}

            {/* Validade + Observações */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="validadeAte" render={({ field }) => (
                <FormItem>
                  <FormLabel>Validade da proposta <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="Notas para o lead…" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Cobrança Recorrente Mensal */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <FormField control={form.control} name="recorrente" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <FormLabel className="text-sm font-medium">Cobrança recorrente mensal</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">Ativar para serviços com mensalidade e prazo de contrato</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </div>
                </FormItem>
              )} />

              {watchRecorrente && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="valorMensal" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor Mensal (R$)</FormLabel>
                        <FormControl>
                          <BudgetMoneyInput
                            placeholder="Ex: 1500,00"
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="prazoContratoMeses" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prazo do Contrato (meses)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            placeholder="Ex: 12"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  {totalContrato > 0 && (
                    <div className="flex items-center gap-2 rounded-md bg-violet-50 border border-violet-200 px-3 py-2">
                      <span className="text-xs text-violet-700 font-medium">Valor total do contrato:</span>
                      <span className="text-sm font-bold text-violet-800">{fmtCurrency(totalContrato)}</span>
                      <span className="text-xs text-violet-600 ml-auto">({watchPrazoMeses} × {fmtCurrency(watchValorMensal ?? 0)}/mês)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Condições Comerciais */}
            <div className="space-y-3">
              {/* Label do bloco */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {watchRecorrente ? "Condições — Licença / Implantação" : "Condições Comerciais"}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="condPagamento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condição de Pagamento <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                    <FormControl><Input placeholder="Ex: 50% entrada + 50% entrega" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="prazoEntrega" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prazo de Entrega <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                    <FormControl><Input placeholder="Ex: 7 dias úteis" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="formaPagamento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de Pagamento <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(pmLabels).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Condições da Mensalidade — só quando recorrente */}
              {watchRecorrente && (
                <>
                  <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide pt-1">
                    Condições — Mensalidade
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="formaPagamentoMensalidade" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forma de Pagamento da Mensalidade <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(pmLabels).map(([val, label]) => (
                              <SelectItem key={val} value={val}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="condPagamentoMensalidade" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condição da Mensalidade <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                        <FormControl><Input placeholder="Ex: Todo dia 10 via boleto" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </>
              )}
            </div>

            {/* Composição de Pagamento */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Composição de Pagamento</h4>
                <span className="text-xs text-muted-foreground">
                  Total: {fmtCurrency((form.watch("paymentCompositions")?.reduce((s, p) => s + (p.valor || 0), 0)) ?? 0)}
                </span>
              </div>
              {form.watch("paymentCompositions")?.map((_, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_120px_32px] gap-2 items-start">
                  <FormField control={form.control} name={`paymentCompositions.${idx}.forma` as const} render={({ field }) => (
                    <FormItem className="space-y-1">
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Forma…" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(pmLabels).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`paymentCompositions.${idx}.valor` as const} render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormControl>
                        <BudgetMoneyInput
                          placeholder="Valor"
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" className="mt-0.5"
                    onClick={() => {
                      const arr = form.getValues("paymentCompositions") || [];
                      form.setValue("paymentCompositions", arr.filter((_, i) => i !== idx));
                    }}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full"
                onClick={() => {
                  const arr = form.getValues("paymentCompositions") || [];
                  form.setValue("paymentCompositions", [...arr, { forma: "", valor: 0, comprovanteUrl: "" }]);
                }}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar forma de pagamento
              </Button>
            </div>

            {/* Skip Asaas Billing */}
            <FormField control={form.control} name="skipAsaasBilling" render={({ field }) => (
              <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium cursor-pointer">Pagamento já recebido / não gerar cobrança no Asaas</FormLabel>
                  <p className="text-xs text-muted-foreground">Marque se o pagamento foi feito manualmente e não deve gerar cobrança no Asaas.</p>
                </div>
              </FormItem>
            )} />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="sm:flex-1" onClick={handleClose}>Fechar</Button>
              <Button type="button" variant="secondary" className="sm:flex-1" onClick={saveDraftAndContinue} disabled={isPending}>
                Salvar e continuar
              </Button>
              <Button type="submit" className="sm:flex-1" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingProposta ? "Salvar Orçamento" : "Criar Orçamento"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Proposta Detail Sheet ─────────────────────────────────────────────────────
function PropostaDetailSheet({
  proposta,
  leadName,
  onClose,
}: {
  proposta: Proposta | null;
  leadName: string;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!proposta) return null;
  const statusCfg = STATUS_CONFIG[proposta.status] ?? STATUS_CONFIG.rascunho;
  const total = proposta.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  function handleEditar() {
    onClose();
    navigate(`/propostas/${proposta!.id}`);
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/propostas/${proposta!.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Orcamento_${proposta!.numero ?? proposta!.id.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao gerar PDF", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <Sheet open={!!proposta} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{proposta.titulo}</SheetTitle>
          {proposta.numero && (
            <p className="text-xs font-mono text-muted-foreground">{proposta.numero}</p>
          )}
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {/* Status + meta + ações */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`${statusCfg.className} text-xs`}>
              {statusCfg.label}
            </Badge>
            {proposta.validadeAte && (
              <span className="text-xs text-muted-foreground">
                Válida até {fmtDate(proposta.validadeAte)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={handleEditar}
              >
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
              >
                {downloadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {downloadingPdf ? "Gerando…" : "PDF"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Lead</p>
              <p className="font-medium">{leadName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Criada em</p>
              <p className="font-medium">{fmtDate(proposta.createdAt)}</p>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <p className="text-sm font-semibold mb-3">Itens</p>
            {proposta.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item</p>
            ) : (
              <div className="space-y-2">
                {proposta.itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{item.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantidade}× {fmtCurrency(item.valorUnitario)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold font-mono">
                      {fmtCurrency(item.quantidade * item.valorUnitario)}
                    </p>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 pt-1">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-lg font-bold">{fmtCurrency(proposta.valorTotal ?? total)}</span>
                </div>
              </div>
            )}
          </div>

          {proposta.recorrente && (
            <>
              <Separator />
              <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-300 text-xs">
                    Recorrente Mensal
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {proposta.valorMensal && (
                    <div>
                      <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Mensalidade</p>
                      <p className="font-semibold text-violet-900">{fmtCurrency(proposta.valorMensal)}</p>
                    </div>
                  )}
                  {proposta.prazoContratoMeses && (
                    <div>
                      <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Prazo</p>
                      <p className="font-semibold text-violet-900">{proposta.prazoContratoMeses} {proposta.prazoContratoMeses === 1 ? "mês" : "meses"}</p>
                    </div>
                  )}
                  {proposta.valorMensal && proposta.prazoContratoMeses && (
                    <div>
                      <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Total Contrato</p>
                      <p className="font-bold text-violet-900">{fmtCurrency(parseFloat(proposta.valorMensal) * proposta.prazoContratoMeses)}</p>
                    </div>
                  )}
                </div>
                {((proposta as any).formaPagamentoMensalidade || (proposta as any).condPagamentoMensalidade) && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-violet-200 text-sm">
                    {(proposta as any).formaPagamentoMensalidade && (
                      <div>
                        <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Forma Pgto Mensalidade</p>
                        <p className="font-medium text-violet-900">{getPaymentLabel((proposta as any).formaPagamentoMensalidade)}</p>
                      </div>
                    )}
                    {(proposta as any).condPagamentoMensalidade && (
                      <div>
                        <p className="text-xs text-violet-600 uppercase tracking-wide mb-0.5">Condição Mensalidade</p>
                        <p className="font-medium text-violet-900">{(proposta as any).condPagamentoMensalidade}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {(proposta.formaPagamento || proposta.condPagamento || proposta.prazoEntrega) && (
            <>
              <Separator />
              {proposta.recorrente && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Licença / Implantação
                </p>
              )}
              <div className="grid grid-cols-3 gap-4 text-sm">
                {proposta.formaPagamento && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Forma de Pagamento</p>
                    <p className="font-medium">{getPaymentLabel(proposta.formaPagamento)}</p>
                  </div>
                )}
                {proposta.condPagamento && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Condição Pagamento</p>
                    <p className="font-medium">{proposta.condPagamento}</p>
                  </div>
                )}
                {proposta.prazoEntrega && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Prazo Entrega</p>
                    <p className="font-medium">{proposta.prazoEntrega}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {proposta.observacoes && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm">{proposta.observacoes}</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Proposta Viewer (modelo print-ready) ─────────────────────────────────────
function PropostaViewer({
  proposta,
  tenantId,
  sellerName,
  sellerEmail,
  onClose,
}: {
  proposta: Proposta;
  tenantId: string;
  sellerName: string;
  sellerEmail: string;
  onClose: () => void;
}) {
  const { data: biz } = useGetBusinessProfileByTenant(tenantId, {
    query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId },
  });
  const { data: lead } = useGetLead(proposta.leadId, {
    query: { queryKey: getGetLeadQueryKey(proposta.leadId), enabled: !!proposta.leadId },
  });

  const total = proposta.valorTotal
    ?? proposta.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const propNum = proposta.id.slice(-8).toUpperCase();
  const statusCfg = STATUS_CONFIG[proposta.status] ?? STATUS_CONFIG.rascunho;

  // Inject print CSS so only #proposta-print renders when Ctrl+P / Save as PDF
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "__proposta-print-css";
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #proposta-print, #proposta-print * { visibility: visible !important; }
        #proposta-print {
          position: fixed !important;
          inset: 0 !important;
          padding: 32px !important;
          overflow: visible !important;
          background: white !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("__proposta-print-css")?.remove(); };
  }, []);

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    try {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/propostas/${proposta.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Orcamento_${proposta.numero ?? proposta.id.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      handlePrint();
    }
  }

  function buildText() {
    const empresa = biz?.nomeFantasia || biz?.razaoSocial || "";
    const lines: string[] = [];
    lines.push(`*${proposta.titulo}*`);
    if (empresa) lines.push(`*${empresa}*`);
    lines.push(`Nº ${propNum}`);
    lines.push(`Data: ${fmtDate(proposta.createdAt)}`);
    if (proposta.validadeAte) lines.push(`Válida até: ${fmtDate(proposta.validadeAte)}`);
    lines.push("");
    if (lead?.nome) lines.push(`Cliente: ${lead.nome}`);
    lines.push("");
    lines.push("*Itens:*");
    proposta.itens.forEach((it) => {
      lines.push(`• ${it.nome} × ${it.quantidade} — ${fmtCurrency(it.valorUnitario)}`);
    });
    lines.push(`\n*Total: ${fmtCurrency(total)}*`);
    if (proposta.formaPagamento) lines.push(`\nForma de Pagamento: ${getPaymentLabel(proposta.formaPagamento)}`);
    if (proposta.condPagamento)  lines.push(`Condição: ${proposta.condPagamento}`);
    if (proposta.prazoEntrega)   lines.push(`Entrega: ${proposta.prazoEntrega}`);
    if (proposta.observacoes)   lines.push(`\n${proposta.observacoes}`);
    if (sellerName) lines.push(`\nVendedor: ${sellerName}`);
    return lines.join("\n");
  }

  function handleWhatsApp() {
    const phone = lead?.telefone?.replace(/\D/g, "") ?? "";
    const text  = encodeURIComponent(buildText());
    const url   = phone
      ? `https://wa.me/55${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener");
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Proposta Comercial — ${proposta.titulo}`);
    const body = encodeURIComponent(buildText().replace(/\*/g, ""));
    const to = lead?.email ?? "";
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_self");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Modelo da Proposta</span>
            <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleWhatsApp} className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 hidden sm:inline-flex">
              <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={handleEmail} className="hidden sm:inline-flex">
              <Mail className="h-4 w-4 mr-1.5" /> E-mail
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Baixar </span>PDF
            </Button>
            {/* Mobile: dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleWhatsApp}><MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />Enviar WhatsApp</DropdownMenuItem>
                <DropdownMenuItem onClick={handleEmail}><Mail className="h-4 w-4 mr-2" />Enviar E-mail</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDownloadPdf}><Download className="h-4 w-4 mr-2" />Baixar PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Imprimir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Document */}
        <div id="proposta-print" className="bg-white text-gray-900 p-8 md:p-12 space-y-8 min-h-[800px]">

          {/* Header: logo + company */}
          <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-gray-900">
            <div className="flex items-center gap-4">
              {biz?.logoUrl ? (
                <img src={biz.logoUrl} alt="Logo" className="h-14 w-auto object-contain max-w-[120px]" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-gray-400" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold leading-tight">
                  {biz?.nomeFantasia || biz?.razaoSocial || "Empresa"}
                </h2>
                {biz?.razaoSocial && biz.nomeFantasia && biz.razaoSocial !== biz.nomeFantasia && (
                  <p className="text-xs text-gray-500">{biz.razaoSocial}</p>
                )}
                {biz?.cnpj && <p className="text-xs text-gray-500">CNPJ: {biz.cnpj}</p>}
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              {biz?.endereco && <p className="flex items-center gap-1 justify-end"><MapPin className="h-3 w-3" />{biz.endereco}</p>}
              {biz?.telefone && <p className="flex items-center gap-1 justify-end"><Phone className="h-3 w-3" />{biz.telefone}</p>}
              {biz?.email && <p className="flex items-center gap-1 justify-end"><Mail className="h-3 w-3" />{biz.email}</p>}
            </div>
          </div>

          {/* Title + meta */}
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-2xl font-bold tracking-tight">{proposta.titulo}</h1>
              <span className="text-sm text-gray-500 whitespace-nowrap">Nº {propNum}</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>Data: <strong className="text-gray-700">{fmtDate(proposta.createdAt)}</strong></span>
              {proposta.validadeAte && (
                <span>Válida até: <strong className="text-gray-700">{fmtDate(proposta.validadeAte)}</strong></span>
              )}
            </div>
          </div>

          {/* Para / Vendedor */}
          <div className="grid grid-cols-2 gap-6 bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Cliente</p>
              <p className="font-semibold text-base">{lead?.nome ?? "—"}</p>
              {lead?.empresa && <p className="text-sm text-gray-600">{lead.empresa}</p>}
              {lead?.telefone && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {lead.telefone}
                </p>
              )}
              {lead?.email && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {lead.email}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Vendedor</p>
              <p className="font-semibold text-base flex items-center gap-1.5">
                <User className="h-4 w-4 text-gray-400" /> {sellerName || "—"}
              </p>
              {sellerEmail && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" /> {sellerEmail}
                </p>
              )}
            </div>
          </div>

          {/* Items table */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Itens</p>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {proposta.itens.map((item, i) => (
                <div key={i} className="rounded border border-gray-200 p-3 text-sm">
                  <p className="font-medium text-gray-800">{item.nome}</p>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
                    <span>{item.quantidade}× {fmtCurrency(item.valorUnitario)}</span>
                    <span className="font-mono font-semibold text-gray-800">{fmtCurrency(item.quantidade * item.valorUnitario)}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t-2 border-gray-900">
                <div className="text-right">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-3">Total</span>
                  <span className="font-mono text-lg font-bold text-gray-900">{fmtCurrency(total)}</span>
                </div>
              </div>
            </div>
            {/* Desktop table */}
            <table className="hidden md:table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="text-left py-2 font-semibold text-gray-700">Descrição</th>
                  <th className="text-center py-2 font-semibold text-gray-700 w-20">Qtd</th>
                  <th className="text-right py-2 font-semibold text-gray-700 w-28">Valor Unit.</th>
                  <th className="text-right py-2 font-semibold text-gray-700 w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {proposta.itens.map((item, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                    <td className="py-2.5 pr-4 text-gray-800">{item.nome}</td>
                    <td className="py-2.5 text-center text-gray-600">{item.quantidade}</td>
                    <td className="py-2.5 text-right font-mono text-gray-600">{fmtCurrency(item.valorUnitario)}</td>
                    <td className="py-2.5 text-right font-mono font-medium">{fmtCurrency(item.quantidade * item.valorUnitario)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-900">
                  <td colSpan={3} className="pt-3 pr-4 text-right text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Total
                  </td>
                  <td className="pt-3 text-right font-mono text-lg font-bold text-gray-900">
                    {fmtCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Cobrança Recorrente */}
          {proposta.recorrente && proposta.valorMensal && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">Cobrança Recorrente Mensal</p>
              <div className="grid grid-cols-3 gap-6 text-sm mb-0">
                <div>
                  <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Mensalidade</p>
                  <p className="font-semibold text-violet-900">{fmtCurrency(proposta.valorMensal)}</p>
                </div>
                {proposta.prazoContratoMeses && (
                  <div>
                    <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Prazo</p>
                    <p className="font-semibold text-violet-900">
                      {proposta.prazoContratoMeses} {proposta.prazoContratoMeses === 1 ? "mês" : "meses"}
                    </p>
                  </div>
                )}
                {proposta.prazoContratoMeses && (
                  <div>
                    <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Total do Contrato</p>
                    <p className="font-bold text-violet-900">
                      {fmtCurrency(parseFloat(String(proposta.valorMensal)) * proposta.prazoContratoMeses)}
                    </p>
                  </div>
                )}
              </div>
              {((proposta as any).formaPagamentoMensalidade || (proposta as any).condPagamentoMensalidade) && (
                <div className="grid grid-cols-2 gap-4 text-sm mt-4 pt-4 border-t border-violet-200">
                  {(proposta as any).formaPagamentoMensalidade && (
                    <div>
                      <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Forma de Pagamento</p>
                      <p className="font-medium text-violet-900">{getPaymentLabel((proposta as any).formaPagamentoMensalidade)}</p>
                    </div>
                  )}
                  {(proposta as any).condPagamentoMensalidade && (
                    <div>
                      <p className="text-xs text-violet-500 uppercase tracking-wide mb-0.5">Condição de Pagamento</p>
                      <p className="font-medium text-violet-900">{(proposta as any).condPagamentoMensalidade}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Condições comerciais */}
          {(proposta.formaPagamento || proposta.condPagamento || proposta.prazoEntrega) && (
            <div className="border border-gray-200 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                {proposta.recorrente ? "Condições — Licença / Implantação" : "Condições Comerciais"}
              </p>
              <div className="grid grid-cols-3 gap-6 text-sm">
                {proposta.formaPagamento && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Forma de Pagamento</p>
                    <p className="font-medium text-gray-800">{getPaymentLabel(proposta.formaPagamento)}</p>
                  </div>
                )}
                {proposta.condPagamento && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Condição de Pagamento</p>
                    <p className="font-medium text-gray-800">{proposta.condPagamento}</p>
                  </div>
                )}
                {proposta.prazoEntrega && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Prazo de Entrega</p>
                    <p className="font-medium text-gray-800">{proposta.prazoEntrega}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Observações */}
          {proposta.observacoes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Observações</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{proposta.observacoes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
            <span>{biz?.nomeFantasia || biz?.razaoSocial || ""}</span>
            <span>Orçamento #{propNum}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Propostas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  const urlParams = new URLSearchParams(window.location.search);
  const urlStatus = urlParams.get("status");
  const urlLeadId = urlParams.get("leadId") ?? undefined;
  const urlDealId = urlParams.get("dealId") ?? undefined;
  const urlEditId = urlParams.get("edit") ?? undefined;
  const returnTo = urlParams.get("returnTo") ?? undefined;
  const urlProductIds = (urlParams.get("productIds") ?? "").split(",").filter(Boolean);
  const openNewFromUrl = urlParams.get("new") === "1";
  const defaultStatus = urlStatus === "ativa" ? "enviada" : undefined;

  const [modalOpen, setModalOpen] = useState(openNewFromUrl || !!urlEditId);
  const [detailProposta, setDetailProposta] = useState<Proposta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Proposta | null>(null);
  const [viewProposta, setViewProposta] = useState<Proposta | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatus ?? "all");

  const { data: propostas = [], isLoading } = useListPropostas(tenantId, undefined, {
    query: {
      queryKey: getListPropostasQueryKey(tenantId),
      enabled: !!tenantId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 300_000,
    },
  });

  const { data: leads = [] } = useListTenantLeads(tenantId, {
    query: {
      queryKey: getListTenantLeadsQueryKey(tenantId),
      enabled: !!tenantId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 300_000,
    },
  });

  const { data: catalog = [] } = useListProdutosCatalogo(tenantId, {
    query: {
      queryKey: getListProdutosCatalogoQueryKey(tenantId),
      enabled: !!tenantId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 300_000,
    },
  });

  const statusMut = useUpdatePropostaStatus();
  const deleteMut = useDeleteProposta();
  const [, setLocation] = useLocation();

  const editTarget = urlEditId
    ? propostas.find((proposta) => proposta.id === urlEditId) ?? null
    : null;

  function closeBudgetModal() {
    setModalOpen(false);
    if (urlEditId && returnTo) {
      setLocation(returnTo);
      return;
    }
    if (urlEditId || openNewFromUrl) {
      window.history.replaceState({}, "", "/propostas");
    }
  }

  // Build leadId → name map
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l.nome]));

  function changeStatus(p: Proposta, status: PropostaStatus) {
    statusMut.mutate(
      { id: p.id, data: { status } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          toast({ title: `Orçamento marcado como "${STATUS_CONFIG[status]?.label ?? status}"` });
        },
        onError: () => toast({ title: "Erro ao alterar status", variant: "destructive" }),
      }
    );
  }

  function doDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPropostasQueryKey(tenantId) });
          toast({ title: "Orçamento excluído" });
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
      }
    );
  }

  // Summary counts
  const counts = {
    rascunho: propostas.filter((p) => p.status === "rascunho").length,
    enviada:  propostas.filter((p) => p.status === "enviada").length,
    pendente: propostas.filter((p) => p.status === "pendente").length,
    aceita:   propostas.filter((p) => p.status === "aceita").length,
    rejeitada:propostas.filter((p) => p.status === "rejeitada").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gerencie orçamentos e propostas comerciais</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setModalOpen(true)} className="flex-1 sm:flex-none min-h-[44px]">
            <Plus className="h-4 w-4 mr-2" />
            Novo Orçamento
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["rascunho", "enviada", "pendente", "aceita", "rejeitada"] as const).map((k) => (
          <Card key={k} className={`cursor-pointer transition-shadow ${statusFilter === k ? "ring-2 ring-primary" : "hover:shadow-md"}`} onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {STATUS_CONFIG[k].label}s
              </p>
              <p className="text-2xl font-bold mt-0.5">{counts[k]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando…
            </div>
          ) : propostas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-25" />
              <p className="text-sm">Nenhum orçamento criado ainda</p>
              <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Criar primeiro orçamento
              </Button>
            </div>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y">
              {propostas.filter((p) => statusFilter === "all" || p.status === statusFilter).map((p) => {
                const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.rascunho;
                const canSend    = p.status === "rascunho";
                const canPendente= p.status === "enviada";
                const canAccept  = p.status === "pendente";
                const canReject  = p.status === "pendente";
                const canDelete  = p.status === "rascunho";
                return (
                  <div
                    key={p.id}
                    className="p-4 space-y-2 cursor-pointer hover:bg-muted/50 active:bg-muted/80 transition-colors"
                    onClick={() => setDetailProposta(p)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {leadMap[p.leadId] ?? p.leadId.slice(0, 8) + "…"}
                        </p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailProposta(p)}><Eye className="h-4 w-4 mr-2" />Ver detalhes</DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setViewProposta(p); }}><Printer className="h-4 w-4 mr-2" />Visualizar modelo</DropdownMenuItem>
                            {canSend && <DropdownMenuItem onClick={() => changeStatus(p, "enviada")}><Send className="h-4 w-4 mr-2" />Enviar proposta</DropdownMenuItem>}
                            {canPendente && <DropdownMenuItem onClick={() => changeStatus(p, "pendente")}><Clock className="h-4 w-4 mr-2 text-violet-600" />Marcar pendente</DropdownMenuItem>}
                            {canAccept && <DropdownMenuItem onClick={() => changeStatus(p, "aceita")}><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />Marcar aceita</DropdownMenuItem>}
                            {canReject && <DropdownMenuItem onClick={() => changeStatus(p, "rejeitada")}><XCircle className="h-4 w-4 mr-2 text-red-500" />Marcar rejeitada</DropdownMenuItem>}
                            {canDelete && (<><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem></>)}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
                      <span className="text-sm font-semibold font-mono">{fmtCurrency(p.valorTotal)}</span>
                    </div>
                    {p.validadeAte && (
                      <p className="text-xs text-muted-foreground">Válida até {fmtDate(p.validadeAte)}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Desktop table */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Válida até</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {propostas.filter((p) => statusFilter === "all" || p.status === statusFilter).map((p) => {
                  const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.rascunho;
                  const canSend     = p.status === "rascunho";
                  const canPendente = p.status === "enviada";
                  const canAccept   = p.status === "pendente";
                  const canReject   = p.status === "pendente";
                  const canDelete   = p.status === "rascunho";

                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => setDetailProposta(p)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.numero ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{p.titulo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {leadMap[p.leadId] ?? p.leadId.slice(0, 8) + "…"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {fmtCurrency(p.valorTotal)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(p.validadeAte)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailProposta(p)}>
                              <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setViewProposta(p); }}>
                              <Printer className="h-4 w-4 mr-2" /> Visualizar modelo
                            </DropdownMenuItem>
                            {canSend && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "enviada")}>
                                <Send className="h-4 w-4 mr-2" /> Enviar orçamento
                              </DropdownMenuItem>
                            )}
                            {canPendente && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "pendente")}>
                                <Clock className="h-4 w-4 mr-2 text-violet-600" /> Marcar pendente
                              </DropdownMenuItem>
                            )}
                            {canAccept && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "aceita")}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Marcar aceita
                              </DropdownMenuItem>
                            )}
                            {canReject && (
                              <DropdownMenuItem onClick={() => changeStatus(p, "rejeitada")}>
                                <XCircle className="h-4 w-4 mr-2 text-red-500" /> Marcar rejeitada
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(p)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <PropostaModal
        open={modalOpen && (!urlEditId || !!editTarget)}
        onClose={closeBudgetModal}
        tenantId={tenantId}
        catalog={catalog}
        leadId={editTarget?.leadId ?? (openNewFromUrl ? urlLeadId : undefined)}
        dealId={editTarget?.dealId ?? (openNewFromUrl ? urlDealId : undefined)}
        leadNome={editTarget ? (leadMap[editTarget.leadId] ?? undefined) : (openNewFromUrl && urlLeadId ? leadMap[urlLeadId] : undefined)}
        initialProductIds={editTarget ? [] : (openNewFromUrl ? urlProductIds : [])}
        editingProposta={editTarget ?? undefined}
      />
      <PropostaDetailSheet
        proposta={detailProposta}
        leadName={detailProposta ? (leadMap[detailProposta.leadId] ?? "—") : ""}
        onClose={() => setDetailProposta(null)}
      />
      {viewProposta && (
        <PropostaViewer
          proposta={viewProposta}
          tenantId={tenantId}
          sellerName={user?.name ?? user?.email ?? ""}
          sellerEmail={user?.email ?? ""}
          onClose={() => setViewProposta(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.titulo}</strong> será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
