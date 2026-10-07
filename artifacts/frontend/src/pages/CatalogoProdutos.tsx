import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CatalogoModal } from "./Propostas";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  FolderTree,
  Plus,
  Route,
  Save,
  Store,
  Trash2,
  Truck,
  Upload,
  WalletCards,
} from "lucide-react";

type PricingMode = "cost_plus" | "sale_minus_expenses";
type SaleMode = "direct_purchase" | "subscription" | "quote" | "assisted_sale";
type CoverageType = "all_brazil" | "by_regions" | "pickup_only" | "no_delivery";
type RegionCoverageType = "states" | "cities" | "postal_code" | "radius";
type DeliveryAvailability = "delivery" | "pickup_only" | "unavailable" | "quote";
type DeliveryFeeType = "fixed" | "percent" | "per_km" | "quote" | "free";
type DeliveryMode = "own" | "carrier" | "postal" | "courier" | "pickup" | "redispatch" | "quote";

type PricingConfig = {
  mode?: PricingMode;
  saleMode?: SaleMode;
  salePrice?: number | null;
  minimumPrice?: number | null;
  taxPercent?: number | null;
  otherCostPercent?: number | null;
  otherCostFixed?: number | null;
  cashPrice?: number | null;
  installmentTotalPrice?: number | null;
  maxInstallments?: number | null;
  cashFinancialCostPercent?: number | null;
  installmentFinancialCostPercent?: number | null;
  priceValidUntil?: string | null;
};

type DeliveryRegion = {
  id: string;
  name: string;
  enabled?: boolean;
  coverageType?: RegionCoverageType;
  coverageValue?: string;
  availability?: DeliveryAvailability;
  feeType?: DeliveryFeeType;
  feeValue?: number | null;
  leadTimeMinDays?: number | null;
  leadTimeMaxDays?: number | null;
  minimumOrder?: number | null;
  freeShippingAbove?: number | null;
  deliveryMode?: DeliveryMode;
  notes?: string | null;
};

type DeliveryRoute = {
  id: string;
  name: string;
  regionIds?: string[];
  coverageValue?: string;
  daysOfWeek?: number[];
  frequency?: "weekly" | "biweekly" | "monthly" | "custom";
  cutoffTime?: string | null;
  cutoffDaysBefore?: number | null;
  departureTime?: string | null;
  estimatedWindow?: string | null;
  carrierOrDriver?: string | null;
  vehicle?: string | null;
  capacity?: string | null;
  routeCost?: number | null;
  active?: boolean;
  notes?: string | null;
};

type DeliveryException = {
  id: string;
  date: string;
  type: "blocked" | "extra" | "changed";
  routeId?: string | null;
  description?: string | null;
};

type DeliveryConfig = {
  coverageType?: CoverageType;
  regions?: DeliveryRegion[];
  routes?: DeliveryRoute[];
  exceptions?: DeliveryException[];
};

type CatalogProductSummary = {
  id: string;
  nome: string;
  ativo: boolean;
  precoBase?: string | number | null;
  custoFornecedor?: string | number | null;
  margemPercentual?: string | number | null;
  fretePercentual?: string | number | null;
  comissaoPercentual?: string | number | null;
  custoFinanceiroPercentual?: string | number | null;
  recorrencia?: string | null;
  pricingConfig?: PricingConfig | null;
  deliveryConfig?: DeliveryConfig | null;
  imagemUrl?: string | null;
  imagens?: string[] | null;
  textureUrl?: string | null;
  model3dUrl?: string | null;
  projectLibraryEnabled?: boolean;
  tipoCalculo?: string | null;
  colecao?: string | null;
  cor?: string | null;
  fechamentoPacote?: string | number | null;
  quantidadePacote?: number | null;
  precoPacote?: string | number | null;
  embalagemMestreQuantidade?: number | null;
  quantidadeMinimaVenda?: number | null;
  multiploVenda?: number | null;
  permiteFracionarEmbalagemMestre?: boolean | null;
  projectTechnicalConfig?: {
    modelSurfaces?: Array<{ key: string; label: string }>;
    modelSurfacesDetectedAt?: string;
    [key: string]: unknown;
  } | null;
};

type ArqdorMaterial = {
  id: string;
  nome: string;
  fabricante: string;
  linha: string;
  referencia?: string | null;
  categoria: string;
};

type ArqdorProductMaterial = {
  id: string;
  materialId: string;
  grupo: string | null;
  surfaceKey: string | null;
  isDefault: boolean;
  precoAdicional: string | null;
  material: ArqdorMaterial | null;
};

type CatalogPricePreviewItem = {
  nome: string;
  sku?: string | null;
  colecao?: string | null;
  cor?: string | null;
  precoBase?: number | null;
  imagemUrl?: string | null;
  paginaCatalogo?: number | null;
  fechamentoPacote?: number | null;
  quantidadePacote?: number | null;
  embalagemMestreQuantidade?: number | null;
  quantidadeMinimaVenda?: number | null;
  multiploVenda?: number | null;
  avisos?: string[];
  duplicate?: { id: string; nome: string; sku?: string | null } | null;
  priceMatch?: { score: number; sourceName?: string | null; sourceSku?: string | null; reason: string } | null;
};

type CatalogPricePreview = {
  catalogFileName: string;
  priceTableFileName: string;
  fabricante?: string | null;
  tabela?: string | null;
  vigencia?: string | null;
  products: CatalogPricePreviewItem[];
  importableCount: number;
  updateableCount?: number;
  exactOrHighConfidenceCount: number;
  reviewCount: number;
  duplicateCount: number;
  csv: string;
  sourceFiles?: {
    catalogOriginalUrl?: string | null;
    priceTableOriginalUrl?: string | null;
  };
  visualSource?: {
    strategy?: string;
    extractedCount?: number;
    referencedCount?: number;
    note?: string;
  };
};

type CommercialSnapshot = {
  pricingConfig: PricingConfig;
  deliveryConfig: DeliveryConfig;
  mode: PricingMode;
  cost: number;
  margin: number;
  freight: number;
  commission: number;
  financial: number;
  canonicalPrice: number;
};

const WEEK_DAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function patchCatalogProduct(productId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/produtos-catalogo/${productId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "Não foi possível salvar a configuração do produto.");
  }
  return response.json();
}

async function persistCommercialSnapshot(productId: string, snapshot: CommercialSnapshot) {
  const common = {
    pricingConfig: snapshot.pricingConfig,
    deliveryConfig: snapshot.deliveryConfig,
    comissaoPercentual: snapshot.commission.toFixed(2),
    custoFinanceiroPercentual: snapshot.financial.toFixed(2),
  };

  if (snapshot.mode === "cost_plus") {
    return patchCatalogProduct(productId, {
      ...common,
      custoFornecedor: snapshot.cost.toFixed(2),
      margemPercentual: snapshot.margin.toFixed(2),
      fretePercentual: snapshot.freight.toFixed(2),
    });
  }

  // O endpoint legado recalcula precoBase enquanto existir custoFornecedor.
  // Ao trocar para "preço de venda - despesas", limpamos o custo primeiro e
  // em seguida gravamos o preço de venda como preço oficial do catálogo.
  await patchCatalogProduct(productId, {
    ...common,
    custoFornecedor: null,
    margemPercentual: "0.00",
    fretePercentual: "0.00",
  });

  return patchCatalogProduct(productId, {
    ...common,
    precoBase: snapshot.canonicalPrice.toFixed(2),
  });
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  step = "0.01",
  min = "0",
  hint,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  suffix?: string;
  step?: string;
  min?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <Input
          type="number"
          min={min}
          step={step}
          value={value ?? ""}
          onChange={(event) => onChange(optionalNumber(event.target.value))}
          className={suffix ? "pr-12" : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

function EngineeringCommercialPanel({
  product,
  onSaved,
}: {
  product: CatalogProductSummary;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [fechamentoPacote, setFechamentoPacote] = useState<number | undefined>(
    product.fechamentoPacote == null ? undefined : Number(product.fechamentoPacote),
  );
  const [quantidadePacote, setQuantidadePacote] = useState<number | undefined>(
    product.quantidadePacote ?? undefined,
  );
  const [precoPacote, setPrecoPacote] = useState<number | undefined>(
    product.precoPacote == null ? undefined : Number(product.precoPacote),
  );
  const [embalagemMestre, setEmbalagemMestre] = useState<number | undefined>(
    product.embalagemMestreQuantidade ?? undefined,
  );
  const [quantidadeMinima, setQuantidadeMinima] = useState<number | undefined>(
    product.quantidadeMinimaVenda ?? undefined,
  );
  const [multiploVenda, setMultiploVenda] = useState<number | undefined>(
    product.multiploVenda ?? undefined,
  );
  const [fracionaMestre, setFracionaMestre] = useState(
    product.permiteFracionarEmbalagemMestre === true,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFechamentoPacote(product.fechamentoPacote == null ? undefined : Number(product.fechamentoPacote));
    setQuantidadePacote(product.quantidadePacote ?? undefined);
    setPrecoPacote(product.precoPacote == null ? undefined : Number(product.precoPacote));
    setEmbalagemMestre(product.embalagemMestreQuantidade ?? undefined);
    setQuantidadeMinima(product.quantidadeMinimaVenda ?? undefined);
    setMultiploVenda(product.multiploVenda ?? undefined);
    setFracionaMestre(product.permiteFracionarEmbalagemMestre === true);
  }, [product]);

  const save = async () => {
    setSaving(true);
    try {
      await patchCatalogProduct(product.id, {
        fechamentoPacote: fechamentoPacote == null ? null : fechamentoPacote.toFixed(3),
        quantidadePacote: quantidadePacote == null ? null : Math.trunc(quantidadePacote),
        precoPacote: precoPacote == null ? null : precoPacote.toFixed(2),
        embalagemMestreQuantidade: embalagemMestre == null ? null : Math.trunc(embalagemMestre),
        quantidadeMinimaVenda: quantidadeMinima == null ? null : Math.trunc(quantidadeMinima),
        multiploVenda: multiploVenda == null ? null : Math.trunc(multiploVenda),
        permiteFracionarEmbalagemMestre: fracionaMestre,
      });
      await onSaved();
      toast({
        title: "Engenharia comercial salva",
        description: "Vendor.ai, Praça.ai e Arqdor passam a usar as mesmas regras de pacote e embalagem mestre.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar engenharia comercial",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const pack = fechamentoPacote && fechamentoPacote > 0 ? fechamentoPacote : null;
  const master = embalagemMestre && embalagemMestre > 0 ? embalagemMestre : null;
  const masterYield = pack && master ? pack * master : null;

  return (
    <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Engenharia de venda e embalagem</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Regra única do produto mestre para orçamento, Praça.ai e Arqdor. A necessidade técnica é calculada primeiro; depois o sistema fecha pacote, mínimo, múltiplo e embalagem mestre.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Salvando…" : "Salvar engenharia"}
        </Button>
      </div>

      {(product.colecao || product.cor || product.tipoCalculo) && (
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {product.colecao && <span className="rounded-full border bg-background px-2 py-1">Coleção: {product.colecao}</span>}
          {product.cor && <span className="rounded-full border bg-background px-2 py-1">Variação: {product.cor}</span>}
          {product.tipoCalculo && <span className="rounded-full border bg-background px-2 py-1">Cálculo: {product.tipoCalculo}</span>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NumberField
          label="Fechamento do pacote"
          value={fechamentoPacote}
          onChange={setFechamentoPacote}
          step="0.001"
          hint="Quanto 1 pacote primário cobre na unidade comercial do produto (m², m, peça etc.)."
        />
        <NumberField
          label="Itens por pacote"
          value={quantidadePacote}
          onChange={setQuantidadePacote}
          step="1"
          hint="Quantidade física de peças/unidades dentro do pacote primário."
        />
        <NumberField
          label="Preço do pacote"
          value={precoPacote}
          onChange={setPrecoPacote}
          suffix="R$"
          hint="Opcional. Se vazio, o motor deriva pelo rendimento × preço base."
        />
        <NumberField
          label="Pacotes por embalagem mestre"
          value={embalagemMestre}
          onChange={setEmbalagemMestre}
          step="1"
          hint="Ex.: caixa mestre com 6 pacotes = 6."
        />
        <NumberField
          label="Quantidade mínima de venda"
          value={quantidadeMinima}
          onChange={setQuantidadeMinima}
          step="1"
          hint="Em pacotes primários. Ex.: mínimo comercial de 4 pacotes."
        />
        <NumberField
          label="Múltiplo obrigatório"
          value={multiploVenda}
          onChange={setMultiploVenda}
          step="1"
          hint="Em pacotes primários. Ex.: vende somente de 2 em 2."
        />
      </div>

      <label className="flex items-start gap-3 rounded-lg border bg-background p-3">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={fracionaMestre}
          onChange={(event) => setFracionaMestre(event.target.checked)}
        />
        <span>
          <span className="block text-xs font-medium">Permitir fracionar embalagem mestre</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
            Desligado por padrão. Quando desligado, a quantidade faturável sobe automaticamente para um múltiplo válido da embalagem mestre.
          </span>
        </span>
      </label>

      {masterYield != null && (
        <div className="rounded-lg border bg-background p-3 text-xs">
          <span className="font-medium">Resumo automático:</span>{" "}
          1 embalagem mestre = {master} pacote{master === 1 ? "" : "s"} primário{master === 1 ? "" : "s"} = {masterYield.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} na unidade de rendimento do produto.
        </div>
      )}
    </div>
  );
}

function ArqdorProductConfigurationPanel({ product }: { product: CatalogProductSummary }) {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<ArqdorMaterial[]>([]);
  const [links, setLinks] = useState<ArqdorProductMaterial[]>([]);
  const [modelUrl, setModelUrl] = useState(product.model3dUrl ?? "");
  const [textureUrl, setTextureUrl] = useState(product.textureUrl ?? "");
  const [projectEnabled, setProjectEnabled] = useState(product.projectLibraryEnabled !== false);
  const [surfaces, setSurfaces] = useState<Array<{ key: string; label: string }>>(
    product.projectTechnicalConfig?.modelSurfaces ?? [],
  );
  const [materialId, setMaterialId] = useState("");
  const [group, setGroup] = useState("Revestimento");
  const [surfaceKey, setSurfaceKey] = useState("");
  const [priceDelta, setPriceDelta] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingTechnical, setSavingTechnical] = useState(false);
  const [linking, setLinking] = useState(false);

  const loadConfiguration = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: authHeaders().Authorization };
      const [catalogRes, materialsRes, linksRes] = await Promise.all([
        fetch(`/api/arch/catalogo?busca=${encodeURIComponent(product.nome)}&limit=100`, { headers }),
        fetch("/api/arch/materials?limit=200", { headers }),
        fetch(`/api/arch/catalogo/${product.id}/materials`, { headers }),
      ]);

      if (materialsRes.ok) setMaterials(await materialsRes.json());
      if (linksRes.ok) setLinks(await linksRes.json());

      if (catalogRes.ok) {
        const items = await catalogRes.json() as Array<{
          id: string;
          model3dUrl?: string | null;
          textureUrl?: string | null;
          especificacoes?: { modelSurfaces?: Array<{ key: string; label: string }> };
        }>;
        const current = items.find((item) => item.id === product.id);
        if (current) {
          setModelUrl(current.model3dUrl ?? "");
          setTextureUrl(current.textureUrl ?? "");
          setSurfaces(current.especificacoes?.modelSurfaces ?? []);
        }
      }
    } catch (error) {
      toast({
        title: "Configuração técnica indisponível",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [product.id, product.nome, toast]);

  useEffect(() => {
    setModelUrl(product.model3dUrl ?? "");
    setTextureUrl(product.textureUrl ?? "");
    setProjectEnabled(product.projectLibraryEnabled !== false);
    setSurfaces(product.projectTechnicalConfig?.modelSurfaces ?? []);
    void loadConfiguration();
  }, [
    product.id,
    product.model3dUrl,
    product.textureUrl,
    product.projectLibraryEnabled,
    product.projectTechnicalConfig,
    loadConfiguration,
  ]);

  const saveTechnical = async () => {
    setSavingTechnical(true);
    try {
      const response = await fetch(`/api/arch/catalogo/${product.id}/technical`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          model3dUrl: modelUrl.trim() || null,
          textureUrl: textureUrl.trim() || null,
          projectLibraryEnabled: projectEnabled,
          projectTechnicalConfig: {
            ...(product.projectTechnicalConfig ?? {}),
            modelSurfaces: surfaces,
          },
        }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar a configuração técnica.");
      toast({
        title: "Produto mestre atualizado",
        description: "Catálogo comercial e Biblioteca de Projeto agora usam este mesmo cadastro.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingTechnical(false);
    }
  };

  const linkMaterial = async () => {
    if (!materialId) return;
    setLinking(true);
    try {
      const response = await fetch(`/api/arch/catalogo/${product.id}/materials`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          materialId,
          grupo: group.trim() || undefined,
          surfaceKey: surfaceKey.trim() || undefined,
          precoAdicional: priceDelta ? Number(priceDelta) : undefined,
          isDefault,
        }),
      });
      if (!response.ok) throw new Error("Não foi possível vincular o material.");
      setMaterialId("");
      setSurfaceKey("");
      setPriceDelta("");
      setIsDefault(true);
      await loadConfiguration();
      toast({ title: "Material vinculado ao produto mestre." });
    } catch (error) {
      toast({
        title: "Erro ao vincular material",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  const unlinkMaterial = async (linkId: string) => {
    const response = await fetch(`/api/arch/catalogo/${product.id}/materials/${linkId}`, {
      method: "DELETE",
      headers: { Authorization: authHeaders().Authorization },
    });
    if (response.ok) {
      await loadConfiguration();
      toast({ title: "Material removido do produto." });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Biblioteca de Projeto</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Não cria outro produto. Este mesmo cadastro, com o mesmo ID, nome, preço, imagens e fornecedor, é reutilizado no projeto, render, orçamento e proposta.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={projectEnabled}
            onChange={(event) => setProjectEnabled(event.target.checked)}
          />
          Disponível na Biblioteca de Projeto
        </label>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Carregando configuração do produto mestre…
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Modelo 3D / GLB" hint="O arquivo fica associado ao produto mestre e é reutilizado em todas as cenas.">
              <Input
                value={modelUrl}
                onChange={(event) => setModelUrl(event.target.value)}
                placeholder="URL do arquivo .glb/.gltf"
              />
            </Field>
            <Field label="Textura principal" hint="Opcional. Materiais por superfície continuam vindo da Biblioteca de Materiais.">
              <Input
                value={textureUrl}
                onChange={(event) => setTextureUrl(event.target.value)}
                placeholder="URL da textura principal"
              />
            </Field>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-medium">Imagens do produto</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              As mesmas imagens cadastradas acima no Catálogo Comercial são usadas como miniatura, referência de projeto, render e proposta. Não há uma segunda galeria.
            </p>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-medium">Partes / superfícies detectadas</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {surfaces.length > 0
                ? `${surfaces.length} superfície(s) disponíveis para receber acabamentos.`
                : "Quando o GLB for carregado no 3D, o sistema registra as superfícies diretamente neste produto mestre."}
            </p>
            {surfaces.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {surfaces.map((surface) => (
                  <span key={surface.key} className="rounded-full border bg-muted/30 px-2 py-1 text-[11px]">
                    {surface.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium">Materiais e acabamentos permitidos</p>
              <p className="text-[11px] text-muted-foreground">
                A Biblioteca de Materiais fornece as texturas; o vínculo fica no produto mestre.
              </p>
            </div>
            {links.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Nenhum material vinculado.
              </div>
            ) : (
              <div className="grid gap-2 xl:grid-cols-2">
                {links.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {link.material?.nome ?? "Material"}{link.material?.fabricante ? ` · ${link.material.fabricante}` : ""}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {link.grupo ?? "Material"} · {link.surfaceKey || "produto inteiro"}
                        {link.isDefault ? " · padrão" : ""}
                        {link.precoAdicional && Number(link.precoAdicional) > 0 ? ` · + ${currency(Number(link.precoAdicional))}` : ""}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void unlinkMaterial(link.id)}>
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Material da Biblioteca">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={materialId}
                onChange={(event) => setMaterialId(event.target.value)}
              >
                <option value="">Selecione…</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.fabricante} · {material.linha} · {material.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grupo / parte">
              <Input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Ex.: Assento, Encosto, Pés" />
            </Field>
            <Field label="Superfície 3D">
              {surfaces.length > 0 ? (
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={surfaceKey}
                  onChange={(event) => setSurfaceKey(event.target.value)}
                >
                  <option value="">Produto inteiro</option>
                  {surfaces.map((surface) => (
                    <option key={surface.key} value={surface.key}>{surface.label}</option>
                  ))}
                </select>
              ) : (
                <Input value={surfaceKey} onChange={(event) => setSurfaceKey(event.target.value)} placeholder="Detectada pelo GLB" />
              )}
            </Field>
            <NumberField
              label="Acréscimo"
              value={priceDelta ? Number(priceDelta) : undefined}
              onChange={(value) => setPriceDelta(value == null ? "" : String(value))}
              suffix="R$"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              Usar como material padrão desta parte
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void saveTechnical()} disabled={savingTechnical}>
                {savingTechnical ? "Salvando…" : "Salvar configuração técnica"}
              </Button>
              <Button type="button" onClick={() => void linkMaterial()} disabled={!materialId || linking}>
                {linking ? "Vinculando…" : "Adicionar material"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CommercialDeliveryPanel({
  product,
  portalTarget,
  onSaved,
}: {
  product: CatalogProductSummary;
  portalTarget: HTMLElement;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const storedPricing = product.pricingConfig ?? {};
  const storedDelivery = product.deliveryConfig ?? {};

  const [mode, setMode] = useState<PricingMode>(
    storedPricing.mode ?? (product.custoFornecedor != null ? "cost_plus" : "sale_minus_expenses"),
  );
  const [saleMode, setSaleMode] = useState<SaleMode>(
    storedPricing.saleMode ?? (product.recorrencia ? "subscription" : "assisted_sale"),
  );
  const [cost, setCost] = useState<number>(toNumber(product.custoFornecedor));
  const [margin, setMargin] = useState<number>(toNumber(product.margemPercentual));
  const [freight, setFreight] = useState<number>(toNumber(product.fretePercentual));
  const [commission, setCommission] = useState<number>(toNumber(product.comissaoPercentual));
  const [financial, setFinancial] = useState<number>(toNumber(product.custoFinanceiroPercentual));
  const [salePrice, setSalePrice] = useState<number>(
    storedPricing.salePrice ?? toNumber(product.precoBase),
  );
  const [minimumPrice, setMinimumPrice] = useState<number | undefined>(storedPricing.minimumPrice ?? undefined);
  const [taxPercent, setTaxPercent] = useState<number>(storedPricing.taxPercent ?? 0);
  const [otherCostPercent, setOtherCostPercent] = useState<number>(storedPricing.otherCostPercent ?? 0);
  const [otherCostFixed, setOtherCostFixed] = useState<number>(storedPricing.otherCostFixed ?? 0);
  const [cashPrice, setCashPrice] = useState<number | undefined>(storedPricing.cashPrice ?? undefined);
  const [installmentTotalPrice, setInstallmentTotalPrice] = useState<number | undefined>(
    storedPricing.installmentTotalPrice ?? undefined,
  );
  const [maxInstallments, setMaxInstallments] = useState<number | undefined>(storedPricing.maxInstallments ?? undefined);
  const [cashFinancialCost, setCashFinancialCost] = useState<number>(storedPricing.cashFinancialCostPercent ?? 0);
  const [installmentFinancialCost, setInstallmentFinancialCost] = useState<number>(
    storedPricing.installmentFinancialCostPercent ?? financial,
  );
  const [priceValidUntil, setPriceValidUntil] = useState<string>(storedPricing.priceValidUntil ?? "");

  const [coverageType, setCoverageType] = useState<CoverageType>(storedDelivery.coverageType ?? "by_regions");
  const [regions, setRegions] = useState<DeliveryRegion[]>(storedDelivery.regions ?? []);
  const [routes, setRoutes] = useState<DeliveryRoute[]>(storedDelivery.routes ?? []);
  const [exceptions, setExceptions] = useState<DeliveryException[]>(storedDelivery.exceptions ?? []);
  const [saving, setSaving] = useState(false);

  const calculatedPrice = useMemo(() => {
    if (mode === "sale_minus_expenses") return Math.max(0, salePrice || 0);
    return Math.max(0, cost * (1 + (margin + freight + commission + financial) / 100));
  }, [mode, salePrice, cost, margin, freight, commission, financial]);

  const estimatedNet = useMemo(() => {
    const variable = commission + financial + taxPercent + otherCostPercent;
    const afterVariable = calculatedPrice * (1 - variable / 100) - otherCostFixed;
    return mode === "cost_plus" ? afterVariable - cost : afterVariable;
  }, [calculatedPrice, commission, financial, taxPercent, otherCostPercent, otherCostFixed, mode, cost]);

  const pricingConfig = useMemo<PricingConfig>(() => ({
    mode,
    saleMode,
    salePrice: calculatedPrice,
    minimumPrice: minimumPrice ?? null,
    taxPercent,
    otherCostPercent,
    otherCostFixed,
    cashPrice: cashPrice ?? null,
    installmentTotalPrice: installmentTotalPrice ?? null,
    maxInstallments: maxInstallments ?? null,
    cashFinancialCostPercent: cashFinancialCost,
    installmentFinancialCostPercent: installmentFinancialCost,
    priceValidUntil: priceValidUntil || null,
  }), [
    mode,
    saleMode,
    calculatedPrice,
    minimumPrice,
    taxPercent,
    otherCostPercent,
    otherCostFixed,
    cashPrice,
    installmentTotalPrice,
    maxInstallments,
    cashFinancialCost,
    installmentFinancialCost,
    priceValidUntil,
  ]);

  const deliveryConfig = useMemo<DeliveryConfig>(() => ({
    coverageType,
    regions,
    routes,
    exceptions,
  }), [coverageType, regions, routes, exceptions]);

  const snapshot = useMemo<CommercialSnapshot>(() => ({
    pricingConfig,
    deliveryConfig,
    mode,
    cost,
    margin,
    freight,
    commission,
    financial,
    canonicalPrice: calculatedPrice,
  }), [pricingConfig, deliveryConfig, mode, cost, margin, freight, commission, financial, calculatedPrice]);

  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;

  const save = useCallback(async (silent = false) => {
    setSaving(true);
    try {
      await persistCommercialSnapshot(product.id, latestSnapshot.current);
      await onSaved();
      if (!silent) {
        toast({
          title: "Configuração comercial salva",
          description: "Preço, condições, regiões e rotas foram vinculados ao produto.",
        });
      }
    } catch (error) {
      if (!silent) {
        toast({
          title: "Não foi possível salvar",
          description: error instanceof Error ? error.message : "Revise os dados e tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [onSaved, product.id, toast]);

  useEffect(() => {
    const dialog = portalTarget.closest<HTMLElement>("[role='dialog']");
    const form = dialog?.querySelector<HTMLFormElement>("form");
    if (!form) return;

    const handleBaseFormSubmit = () => {
      const savedSnapshot = latestSnapshot.current;
      window.setTimeout(() => {
        void persistCommercialSnapshot(product.id, savedSnapshot)
          .then(() => onSaved())
          .catch((error) => {
            toast({
              title: "Produto salvo, mas a configuração comercial não sincronizou",
              description: error instanceof Error ? error.message : "Tente salvar novamente para sincronizar preços, entrega e regras comerciais.",
              variant: "destructive",
            });
          });
      }, 900);
    };

    form.addEventListener("submit", handleBaseFormSubmit);
    return () => form.removeEventListener("submit", handleBaseFormSubmit);
  }, [onSaved, portalTarget, product.id]);

  const addRegion = () => {
    setRegions((current) => [
      ...current,
      {
        id: uid("region"),
        name: `Região ${current.length + 1}`,
        enabled: true,
        coverageType: "cities",
        coverageValue: "",
        availability: "delivery",
        feeType: "fixed",
        feeValue: 0,
        deliveryMode: "own",
      },
    ]);
  };

  const updateRegion = (id: string, patch: Partial<DeliveryRegion>) => {
    setRegions((current) => current.map((region) => (region.id === id ? { ...region, ...patch } : region)));
  };

  const addRoute = () => {
    setRoutes((current) => [
      ...current,
      {
        id: uid("route"),
        name: `Rota ${current.length + 1}`,
        regionIds: [],
        daysOfWeek: [1, 5],
        frequency: "weekly",
        active: true,
      },
    ]);
  };

  const updateRoute = (id: string, patch: Partial<DeliveryRoute>) => {
    setRoutes((current) => current.map((route) => (route.id === id ? { ...route, ...patch } : route)));
  };

  const addException = () => {
    setExceptions((current) => [
      ...current,
      { id: uid("exception"), date: "", type: "blocked", routeId: null, description: "" },
    ]);
  };

  return (
    <div className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-orange-600" />
            <h3 className="text-sm font-semibold">Preço, comercialização e entrega</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Escolha como o preço é formado. Compra direta apenas habilita checkout após confirmação do cliente; não cria uma compra automaticamente.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void save(false)} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Salvando…" : "Salvar regras"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Método de formação do preço">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value as PricingMode)}
          >
            <option value="cost_plus">Custo + acréscimos</option>
            <option value="sale_minus_expenses">Preço de venda − despesas</option>
          </select>
        </Field>
        <Field label="Como este produto é comercializado">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={saleMode}
            onChange={(event) => setSaleMode(event.target.value as SaleMode)}
          >
            <option value="direct_purchase">Compra direta</option>
            <option value="subscription">Assinatura</option>
            <option value="quote">Solicitar orçamento</option>
            <option value="assisted_sale">Venda assistida / falar com vendedor</option>
          </select>
        </Field>
      </div>

      {mode === "cost_plus" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Custo do produto" value={cost} onChange={(value) => setCost(value ?? 0)} suffix="R$" />
          <NumberField label="Margem" value={margin} onChange={(value) => setMargin(value ?? 0)} suffix="%" />
          <NumberField label="Frete embutido" value={freight} onChange={(value) => setFreight(value ?? 0)} suffix="%" />
          <NumberField label="Comissão" value={commission} onChange={(value) => setCommission(value ?? 0)} suffix="%" />
          <NumberField label="Custo financeiro" value={financial} onChange={(value) => setFinancial(value ?? 0)} suffix="%" />
          <NumberField label="Impostos" value={taxPercent} onChange={(value) => setTaxPercent(value ?? 0)} suffix="%" hint="Usado na análise do líquido; não duplica o preço oficial." />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Preço de venda" value={salePrice} onChange={(value) => setSalePrice(value ?? 0)} suffix="R$" />
          <NumberField label="Comissão" value={commission} onChange={(value) => setCommission(value ?? 0)} suffix="%" />
          <NumberField label="Custo financeiro" value={financial} onChange={(value) => setFinancial(value ?? 0)} suffix="%" />
          <NumberField label="Impostos" value={taxPercent} onChange={(value) => setTaxPercent(value ?? 0)} suffix="%" />
          <NumberField label="Outros custos variáveis" value={otherCostPercent} onChange={(value) => setOtherCostPercent(value ?? 0)} suffix="%" />
          <NumberField label="Outros custos fixos" value={otherCostFixed} onChange={(value) => setOtherCostFixed(value ?? 0)} suffix="R$" />
        </div>
      )}

      {mode === "cost_plus" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Outros custos variáveis" value={otherCostPercent} onChange={(value) => setOtherCostPercent(value ?? 0)} suffix="%" />
          <NumberField label="Outros custos fixos" value={otherCostFixed} onChange={(value) => setOtherCostFixed(value ?? 0)} suffix="R$" />
        </div>
      )}

      <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Preço oficial ao cliente</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">{currency(calculatedPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Líquido estimado</p>
          <p className={`mt-1 text-lg font-semibold ${estimatedNet >= 0 ? "text-emerald-700" : "text-destructive"}`}>
            {currency(estimatedNet)}
          </p>
        </div>
        <NumberField label="Preço mínimo permitido" value={minimumPrice} onChange={setMinimumPrice} suffix="R$" />
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div>
          <p className="text-sm font-medium">Condições de pagamento</p>
          <p className="text-xs text-muted-foreground">Duas linhas de preço claras para a IA e o checkout apresentarem ao cliente.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField label="Preço à vista" value={cashPrice} onChange={setCashPrice} suffix="R$" />
          <NumberField label="Custo financeiro à vista" value={cashFinancialCost} onChange={(value) => setCashFinancialCost(value ?? 0)} suffix="%" />
          <NumberField label="Preço parcelado total" value={installmentTotalPrice} onChange={setInstallmentTotalPrice} suffix="R$" />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Parcelas" value={maxInstallments} onChange={setMaxInstallments} step="1" />
            <NumberField label="Custo financeiro" value={installmentFinancialCost} onChange={(value) => setInstallmentFinancialCost(value ?? 0)} suffix="%" />
          </div>
        </div>
        {installmentTotalPrice && maxInstallments ? (
          <p className="text-xs font-medium text-muted-foreground">
            Exibição sugerida: {maxInstallments}x de {currency(installmentTotalPrice / maxInstallments)} — total {currency(installmentTotalPrice)}.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Validade do preço">
            <Input type="date" value={priceValidUntil} onChange={(event) => setPriceValidUntil(event.target.value)} />
          </Field>
          <div />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-medium">Entrega e cobertura</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cadastre onde entrega, quanto custa e quais regiões não são atendidas.</p>
          </div>
          {coverageType === "by_regions" && (
            <Button type="button" size="sm" variant="outline" onClick={addRegion}>
              <Plus className="mr-1 h-4 w-4" /> Região
            </Button>
          )}
        </div>

        <Field label="Cobertura deste produto">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={coverageType}
            onChange={(event) => setCoverageType(event.target.value as CoverageType)}
          >
            <option value="all_brazil">Brasil inteiro</option>
            <option value="by_regions">Por regiões cadastradas</option>
            <option value="pickup_only">Somente retirada</option>
            <option value="no_delivery">Sem entrega</option>
          </select>
        </Field>

        {coverageType === "by_regions" && (
          <div className="space-y-2">
            {regions.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhuma região cadastrada. Adicione uma região para definir cidade/CEP, taxa e prazo.
              </div>
            )}
            {regions.map((region, index) => (
              <details key={region.id} className="rounded-lg border bg-muted/15 p-3" open={regions.length === 1}>
                <summary className="cursor-pointer list-none text-sm font-medium">
                  <span className="flex items-center justify-between gap-3">
                    <span>{region.name || `Região ${index + 1}`}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {region.availability === "unavailable" ? "Não entrega" : region.availability === "quote" ? "Sob consulta" : "Atendida"}
                    </span>
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Nome da região">
                      <Input value={region.name} onChange={(event) => updateRegion(region.id, { name: event.target.value })} />
                    </Field>
                    <Field label="Disponibilidade">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={region.availability ?? "delivery"}
                        onChange={(event) => updateRegion(region.id, { availability: event.target.value as DeliveryAvailability })}
                      >
                        <option value="delivery">Entrega disponível</option>
                        <option value="pickup_only">Somente retirada</option>
                        <option value="quote">Consultar logística</option>
                        <option value="unavailable">Não atendemos</option>
                      </select>
                    </Field>
                    <Field label="Como definir a região">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={region.coverageType ?? "cities"}
                        onChange={(event) => updateRegion(region.id, { coverageType: event.target.value as RegionCoverageType })}
                      >
                        <option value="states">Estados</option>
                        <option value="cities">Cidades</option>
                        <option value="postal_code">Faixas de CEP</option>
                        <option value="radius">Raio em km</option>
                      </select>
                    </Field>
                    <Field
                      label={region.coverageType === "postal_code" ? "CEPs / faixas" : region.coverageType === "states" ? "Estados" : region.coverageType === "radius" ? "Centro + raio" : "Cidades"}
                      hint="Separe múltiplos valores por vírgula. Ex.: Chapecó, Xaxim, Xanxerê."
                    >
                      <Input
                        value={region.coverageValue ?? ""}
                        onChange={(event) => updateRegion(region.id, { coverageValue: event.target.value })}
                      />
                    </Field>
                    <Field label="Tipo da taxa">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={region.feeType ?? "fixed"}
                        onChange={(event) => updateRegion(region.id, { feeType: event.target.value as DeliveryFeeType })}
                      >
                        <option value="fixed">Valor fixo</option>
                        <option value="percent">Percentual do pedido</option>
                        <option value="per_km">Por km</option>
                        <option value="free">Frete grátis</option>
                        <option value="quote">Sob consulta</option>
                      </select>
                    </Field>
                    {!['free', 'quote'].includes(region.feeType ?? 'fixed') ? (
                      <NumberField
                        label={region.feeType === "percent" ? "Taxa" : region.feeType === "per_km" ? "Valor por km" : "Taxa de entrega"}
                        value={region.feeValue}
                        onChange={(value) => updateRegion(region.id, { feeValue: value ?? null })}
                        suffix={region.feeType === "percent" ? "%" : "R$"}
                      />
                    ) : <div />}
                    <NumberField label="Prazo mínimo" value={region.leadTimeMinDays} onChange={(value) => updateRegion(region.id, { leadTimeMinDays: value ?? null })} step="1" suffix="dias" />
                    <NumberField label="Prazo máximo" value={region.leadTimeMaxDays} onChange={(value) => updateRegion(region.id, { leadTimeMaxDays: value ?? null })} step="1" suffix="dias" />
                    <NumberField label="Pedido mínimo" value={region.minimumOrder} onChange={(value) => updateRegion(region.id, { minimumOrder: value ?? null })} suffix="R$" />
                    <NumberField label="Frete grátis acima de" value={region.freeShippingAbove} onChange={(value) => updateRegion(region.id, { freeShippingAbove: value ?? null })} suffix="R$" />
                    <Field label="Modalidade de entrega">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={region.deliveryMode ?? "own"}
                        onChange={(event) => updateRegion(region.id, { deliveryMode: event.target.value as DeliveryMode })}
                      >
                        <option value="own">Entrega própria</option>
                        <option value="carrier">Transportadora</option>
                        <option value="postal">Correios</option>
                        <option value="courier">Motoboy / courier</option>
                        <option value="pickup">Retirada</option>
                        <option value="redispatch">Redespacho</option>
                        <option value="quote">Sob consulta</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Observações da região">
                    <Textarea
                      rows={2}
                      value={region.notes ?? ""}
                      onChange={(event) => updateRegion(region.id, { notes: event.target.value })}
                      placeholder="Restrições, dias específicos, necessidade de agendamento…"
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setRegions((current) => current.filter((item) => item.id !== region.id))}>
                      <Trash2 className="mr-1 h-4 w-4" /> Remover região
                    </Button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-medium">Rotas e dias de entrega</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Defina dias, corte de pedidos, responsável e custo operacional de cada rota.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addRoute}>
            <Plus className="mr-1 h-4 w-4" /> Rota
          </Button>
        </div>

        {routes.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhuma rota cadastrada. Produtos podem continuar usando somente prazo/taxa por região.
          </div>
        )}

        {routes.map((routeItem, index) => (
          <details key={routeItem.id} className="rounded-lg border bg-muted/15 p-3" open={routes.length === 1}>
            <summary className="cursor-pointer list-none text-sm font-medium">
              {routeItem.name || `Rota ${index + 1}`}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nome da rota">
                  <Input value={routeItem.name} onChange={(event) => updateRoute(routeItem.id, { name: event.target.value })} />
                </Field>
                <Field label="Frequência">
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={routeItem.frequency ?? "weekly"}
                    onChange={(event) => updateRoute(routeItem.id, { frequency: event.target.value as DeliveryRoute["frequency"] })}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quinzenal</option>
                    <option value="monthly">Mensal</option>
                    <option value="custom">Personalizada</option>
                  </select>
                </Field>
              </div>

              {regions.length > 0 && (
                <Field label="Regiões vinculadas">
                  <div className="flex flex-wrap gap-2">
                    {regions.map((region) => {
                      const checked = (routeItem.regionIds ?? []).includes(region.id);
                      return (
                        <label key={region.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = new Set(routeItem.regionIds ?? []);
                              if (event.target.checked) next.add(region.id);
                              else next.delete(region.id);
                              updateRoute(routeItem.id, { regionIds: Array.from(next) });
                            }}
                          />
                          {region.name}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              )}

              <Field label="Cidades / CEPs adicionais da rota" hint="Opcional. Use quando a rota não coincidir exatamente com uma região cadastrada.">
                <Input value={routeItem.coverageValue ?? ""} onChange={(event) => updateRoute(routeItem.id, { coverageValue: event.target.value })} />
              </Field>

              <Field label="Dias de entrega">
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((day) => {
                    const checked = (routeItem.daysOfWeek ?? []).includes(day.value);
                    return (
                      <label key={day.value} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${checked ? "border-orange-300 bg-orange-50" : "bg-background"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const next = new Set(routeItem.daysOfWeek ?? []);
                            if (event.target.checked) next.add(day.value);
                            else next.delete(day.value);
                            updateRoute(routeItem.id, { daysOfWeek: Array.from(next) });
                          }}
                        />
                        {day.label}
                      </label>
                    );
                  })}
                </div>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Horário de corte">
                  <Input type="time" value={routeItem.cutoffTime ?? ""} onChange={(event) => updateRoute(routeItem.id, { cutoffTime: event.target.value || null })} />
                </Field>
                <NumberField label="Corte com antecedência" value={routeItem.cutoffDaysBefore} onChange={(value) => updateRoute(routeItem.id, { cutoffDaysBefore: value ?? null })} step="1" suffix="dias" />
                <Field label="Horário de saída">
                  <Input type="time" value={routeItem.departureTime ?? ""} onChange={(event) => updateRoute(routeItem.id, { departureTime: event.target.value || null })} />
                </Field>
                <Field label="Janela estimada de entrega">
                  <Input value={routeItem.estimatedWindow ?? ""} onChange={(event) => updateRoute(routeItem.id, { estimatedWindow: event.target.value })} placeholder="Ex.: 13h às 18h" />
                </Field>
                <Field label="Responsável / transportadora">
                  <Input value={routeItem.carrierOrDriver ?? ""} onChange={(event) => updateRoute(routeItem.id, { carrierOrDriver: event.target.value })} />
                </Field>
                <Field label="Veículo">
                  <Input value={routeItem.vehicle ?? ""} onChange={(event) => updateRoute(routeItem.id, { vehicle: event.target.value })} placeholder="Ex.: Fiorino 01" />
                </Field>
                <Field label="Capacidade">
                  <Input value={routeItem.capacity ?? ""} onChange={(event) => updateRoute(routeItem.id, { capacity: event.target.value })} placeholder="Ex.: 40 pedidos / 800 kg" />
                </Field>
                <NumberField label="Custo da rota" value={routeItem.routeCost} onChange={(value) => updateRoute(routeItem.id, { routeCost: value ?? null })} suffix="R$" />
              </div>
              <Field label="Observações da rota">
                <Textarea rows={2} value={routeItem.notes ?? ""} onChange={(event) => updateRoute(routeItem.id, { notes: event.target.value })} />
              </Field>
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setRoutes((current) => current.filter((item) => item.id !== routeItem.id))}>
                  <Trash2 className="mr-1 h-4 w-4" /> Remover rota
                </Button>
              </div>
            </div>
          </details>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-orange-600" />
              <p className="text-sm font-medium">Exceções e feriados</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Bloqueie uma data, crie entrega extraordinária ou registre uma alteração pontual.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addException}>
            <Plus className="mr-1 h-4 w-4" /> Exceção
          </Button>
        </div>
        {exceptions.map((exception) => (
          <div key={exception.id} className="grid gap-2 rounded-md border p-2 md:grid-cols-[150px_170px_1fr_36px]">
            <Input type="date" value={exception.date} onChange={(event) => setExceptions((current) => current.map((item) => item.id === exception.id ? { ...item, date: event.target.value } : item))} />
            <select
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={exception.type}
              onChange={(event) => setExceptions((current) => current.map((item) => item.id === exception.id ? { ...item, type: event.target.value as DeliveryException["type"] } : item))}
            >
              <option value="blocked">Data bloqueada</option>
              <option value="extra">Entrega extra</option>
              <option value="changed">Rota alterada</option>
            </select>
            <Input
              value={exception.description ?? ""}
              onChange={(event) => setExceptions((current) => current.map((item) => item.id === exception.id ? { ...item, description: event.target.value } : item))}
              placeholder="Motivo / nova condição"
            />
            <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => setExceptions((current) => current.filter((item) => item.id !== exception.id))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalogPriceImporter({
  tenantId,
  onImported,
}: {
  tenantId: string;
  onImported: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [priceFile, setPriceFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogPricePreview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);

  const analyze = async () => {
    if (!catalogFile || !priceFile || !tenantId) return;
    setAnalyzing(true);
    setPreview(null);
    try {
      const form = new FormData();
      form.append("catalog", catalogFile);
      form.append("priceTable", priceFile);
      const response = await fetch(`/api/tenants/${tenantId}/produtos-catalogo/import-catalog-price/preview`, {
        method: "POST",
        headers: { Authorization: authHeaders().Authorization },
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Falha ao compatibilizar arquivos.");
      setPreview(body as CatalogPricePreview);
      toast({
        title: "Compatibilização concluída",
        description: `${body.importableCount ?? 0} produto(s) prontos para importação.`,
      });
    } catch (error) {
      toast({
        title: "Falha na compatibilização",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const importMatched = async () => {
    if (!preview?.csv || !tenantId) return;
    setImporting(true);
    try {
      const updates = preview.products.filter(
        (item) => item.duplicate && item.precoBase != null && (item.priceMatch?.score ?? 0) >= 0.58,
      );

      for (const item of updates) {
        const patch: Record<string, unknown> = {
          precoBase: Number(item.precoBase).toFixed(2),
        };
        if (item.colecao) patch.colecao = item.colecao;
        if (item.cor) patch.cor = item.cor;
        if (item.fechamentoPacote != null) patch.fechamentoPacote = Number(item.fechamentoPacote).toFixed(3);
        if (item.quantidadePacote != null) patch.quantidadePacote = Math.trunc(item.quantidadePacote);
        if (item.embalagemMestreQuantidade != null) patch.embalagemMestreQuantidade = Math.trunc(item.embalagemMestreQuantidade);
        if (item.quantidadeMinimaVenda != null) patch.quantidadeMinimaVenda = Math.trunc(item.quantidadeMinimaVenda);
        if (item.multiploVenda != null) patch.multiploVenda = Math.trunc(item.multiploVenda);
        await patchCatalogProduct(item.duplicate!.id, patch);
      }

      let created = 0;
      if (preview.importableCount > 0) {
        const response = await fetch(`/api/tenants/${tenantId}/produtos-catalogo/import`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ csv: preview.csv }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Falha ao importar produtos compatibilizados.");
        created = body.imported ?? 0;
      }

      await onImported();
      toast({
        title: "Catálogo e tabela aplicados",
        description: `${created} novo(s) produto(s) e ${updates.length} cadastro(s) existente(s) atualizado(s), preservando a engenharia já existente.`,
      });
      setPreview(null);
      setCatalogFile(null);
      setPriceFile(null);
      if (catalogInputRef.current) catalogInputRef.current.value = "";
      if (priceInputRef.current) priceInputRef.current.value = "";
    } catch (error) {
      toast({
        title: "Erro ao importar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Importação inteligente · Catálogo + tabela de preços</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            O catálogo fornece produto, coleção, acabamento e referência visual; a tabela fornece preço e regras comerciais. A engenharia já cadastrada no produto mestre continua sendo reutilizada por Vendor.ai, Praça.ai e Arqdor.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void analyze()} disabled={!catalogFile || !priceFile || analyzing}>
          <Upload className="mr-1.5 h-4 w-4" />
          {analyzing ? "Compatibilizando…" : "Compatibilizar"}
        </Button>
      </div>

      <input
        ref={catalogInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          setCatalogFile(event.target.files?.[0] ?? null);
          setPreview(null);
        }}
      />
      <input
        ref={priceInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          setPriceFile(event.target.files?.[0] ?? null);
          setPreview(null);
        }}
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className="flex min-h-20 items-center gap-3 rounded-xl border border-dashed bg-muted/15 p-3 text-left hover:bg-muted/30"
          onClick={() => catalogInputRef.current?.click()}
        >
          <FileText className="h-5 w-5 shrink-0 text-blue-600" />
          <span className="min-w-0">
            <span className="block text-xs font-medium">Catálogo visual PDF</span>
            <span className="block truncate text-[11px] text-muted-foreground">{catalogFile?.name || "Selecionar catálogo do fabricante"}</span>
          </span>
        </button>
        <button
          type="button"
          className="flex min-h-20 items-center gap-3 rounded-xl border border-dashed bg-muted/15 p-3 text-left hover:bg-muted/30"
          onClick={() => priceInputRef.current?.click()}
        >
          <FileText className="h-5 w-5 shrink-0 text-emerald-600" />
          <span className="min-w-0">
            <span className="block text-xs font-medium">Tabela de preços PDF</span>
            <span className="block truncate text-[11px] text-muted-foreground">{priceFile?.name || "Selecionar tabela vigente"}</span>
          </span>
        </button>
      </div>

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-background p-3"><p className="text-[11px] text-muted-foreground">Novos</p><p className="text-lg font-semibold">{preview.importableCount}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-[11px] text-muted-foreground">Atualizar existentes</p><p className="text-lg font-semibold">{preview.updateableCount ?? 0}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-[11px] text-muted-foreground">Alta confiança</p><p className="text-lg font-semibold">{preview.exactOrHighConfidenceCount}</p></div>
            <div className="rounded-lg border bg-background p-3"><p className="text-[11px] text-muted-foreground">Revisar vínculo</p><p className="text-lg font-semibold">{preview.reviewCount}</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Imagens reais do catálogo:</span>
            <span>{preview.visualSource?.extractedCount ?? 0} recorte(s) salvo(s)</span>
            <span>·</span>
            <span>{preview.visualSource?.referencedCount ?? 0} página(s) referenciada(s)</span>
            {preview.sourceFiles?.catalogOriginalUrl && (
              <a className="ml-auto underline" href={preview.sourceFiles.catalogOriginalUrl} target="_blank" rel="noreferrer">
                Abrir catálogo original
              </a>
            )}
          </div>

          <div className="max-h-72 overflow-auto rounded-xl border bg-background">
            <div className="divide-y">
              {preview.products.slice(0, 40).map((item, index) => {
                const score = item.priceMatch?.score ?? 0;
                const ok = score >= 0.85 && !item.duplicate && item.precoBase != null;
                return (
                  <div key={`${item.sku || item.nome}-${index}`} className="flex items-start justify-between gap-3 p-3">
                    {item.imagemUrl ? (
                      <img src={item.imagemUrl} alt="" className="h-14 w-14 shrink-0 rounded-md border object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted/20 text-[10px] text-muted-foreground">
                        {item.paginaCatalogo ? `p. ${item.paginaCatalogo}` : "sem foto"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{item.nome}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[item.colecao, item.cor, item.sku].filter(Boolean).join(" · ") || "Sem variação/código"}
                      </p>
                      {item.priceMatch && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Preço vinculado a: {item.priceMatch.sourceName || item.priceMatch.sourceSku || "item da tabela"} · confiança {Math.round(score * 100)}%
                        </p>
                      )}
                      {item.avisos?.length ? <p className="mt-1 text-[11px] text-amber-700">{item.avisos.join(" ")}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold">{item.precoBase != null ? currency(Number(item.precoBase)) : "Sem preço"}</p>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {ok ? "compatível" : "revisar"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-[11px] leading-4 text-muted-foreground">
              A página de origem do catálogo é preservada como referência visual. Itens sem correspondência segura ou já cadastrados não entram na importação automática.
            </p>
            <Button type="button" onClick={() => void importMatched()} disabled={importing || preview.importableCount === 0}>
              {importing ? "Aplicando…" : `Aplicar ${preview.importableCount + (preview.updateableCount ?? 0)} compatibilizados`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalogoProdutos() {
  const { user, rawUser, tenantOverride } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // O preview de vertical do super_admin usa um ID sintético
  // (__vertical_preview__:...). Esse ID não existe nas tabelas tenant-scoped
  // e fazia o Catálogo parecer vazio mesmo quando o tenant real tinha produtos.
  const tenantId = tenantOverride?.preview
    ? (rawUser?.tenantId ?? "")
    : (user?.tenantId ?? "");
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [activeProduct, setActiveProduct] = useState<CatalogProductSummary | null>(null);

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json() as CatalogProductSummary[];
      setProducts(data);
    } catch {
      // O catálogo principal continua funcional mesmo se esta melhoria auxiliar falhar.
    }
  }, [tenantId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!tenantId) return;

    const mountEnhancements = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']"));
      const dialog = dialogs.find((item) => item.textContent?.includes("Editar Produto"));
      if (!dialog) {
        setPortalTarget(null);
        setActiveProduct(null);
        return;
      }

      const nomeInput = dialog.querySelector<HTMLInputElement>("input");
      const nomeAtual = nomeInput?.value?.trim();
      if (!nomeAtual) return;
      const product = products.find((item) => item.nome.trim() === nomeAtual);
      if (!product) return;

      if (!dialog.querySelector("[data-catalog-active-control='true']")) {
        const control = document.createElement("div");
        control.dataset.catalogActiveControl = "true";
        control.style.display = "flex";
        control.style.alignItems = "center";
        control.style.justifyContent = "space-between";
        control.style.gap = "12px";
        control.style.padding = "12px 14px";
        control.style.margin = "4px 0 12px";
        control.style.border = "1px solid hsl(var(--border))";
        control.style.borderRadius = "10px";
        control.style.background = "hsl(var(--muted) / .25)";

        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = "Produto ativo";
        title.style.display = "block";
        title.style.fontSize = "14px";
        const description = document.createElement("span");
        description.textContent = "Desative para ocultar o produto dos fluxos e canais sem excluir o cadastro.";
        description.style.display = "block";
        description.style.marginTop = "2px";
        description.style.fontSize = "12px";
        description.style.color = "hsl(var(--muted-foreground))";
        copy.append(title, description);

        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "switch");
        button.setAttribute("aria-label", "Produto ativo");
        button.style.width = "46px";
        button.style.height = "26px";
        button.style.borderRadius = "999px";
        button.style.padding = "3px";
        button.style.border = "0";
        button.style.transition = "background 140ms ease";
        button.style.cursor = "pointer";
        button.style.flex = "0 0 auto";

        const knob = document.createElement("span");
        knob.style.display = "block";
        knob.style.width = "20px";
        knob.style.height = "20px";
        knob.style.borderRadius = "999px";
        knob.style.background = "white";
        knob.style.boxShadow = "0 1px 3px rgba(0,0,0,.18)";
        knob.style.transition = "transform 140ms ease";
        button.appendChild(knob);

        const render = (ativo: boolean, saving = false) => {
          button.setAttribute("aria-checked", String(ativo));
          button.disabled = saving;
          button.style.opacity = saving ? ".65" : "1";
          button.style.background = ativo ? "#16a34a" : "#d4d4d8";
          knob.style.transform = ativo ? "translateX(20px)" : "translateX(0)";
          title.textContent = ativo ? "Produto ativo" : "Produto inativo";
        };

        render(product.ativo);
        button.addEventListener("click", async () => {
          const next = button.getAttribute("aria-checked") !== "true";
          render(!next, true);
          try {
            const response = await fetch(`/api/produtos-catalogo/${product.id}`, {
              method: "PATCH",
              headers: authHeaders(),
              body: JSON.stringify({ ativo: next }),
            });
            if (!response.ok) throw new Error("Falha ao atualizar produto");
            product.ativo = next;
            render(next, false);
            await queryClient.invalidateQueries({ queryKey: ["/tenants", tenantId, "produtos-catalogo"] });
            await queryClient.invalidateQueries({ queryKey: ["produtos-catalogo", tenantId] });
          } catch {
            render(product.ativo, false);
          }
        });

        control.append(copy, button);
        const header = dialog.querySelector<HTMLElement>("[class*='SheetHeader'], [class*='DialogHeader']") ?? dialog.firstElementChild;
        if (header?.nextSibling) dialog.insertBefore(control, header.nextSibling);
        else dialog.prepend(control);
      }

      const oldPricingTitle = Array.from(dialog.querySelectorAll<HTMLElement>("p"))
        .find((item) => item.textContent?.trim() === "Formação do preço ao cliente");
      const oldPricingBox = oldPricingTitle?.parentElement?.parentElement as HTMLElement | null;
      if (oldPricingBox) oldPricingBox.style.display = "none";

      const oldFinalPriceLabel = Array.from(dialog.querySelectorAll<HTMLLabelElement>("label"))
        .find((item) => item.textContent?.includes("Preço final ao cliente (R$)"));
      const oldFinalPriceItem = oldFinalPriceLabel?.parentElement as HTMLElement | null;
      if (oldFinalPriceItem) oldFinalPriceItem.style.display = "none";

      let slot = dialog.querySelector<HTMLElement>("[data-catalog-commercial-slot='true']");
      if (!slot) {
        slot = document.createElement("div");
        slot.dataset.catalogCommercialSlot = "true";
        slot.style.margin = "12px 0";
        if (oldPricingBox?.parentElement) oldPricingBox.parentElement.insertBefore(slot, oldPricingBox);
        else dialog.querySelector("form")?.prepend(slot);
      }

      setActiveProduct(product);
      setPortalTarget(slot);
    };

    mountEnhancements();
    const observer = new MutationObserver(() => mountEnhancements());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [products, queryClient, tenantId]);

  const handleCommercialSaved = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["/tenants", tenantId, "produtos-catalogo"] });
    await queryClient.invalidateQueries({ queryKey: ["produtos-catalogo", tenantId] });
    await loadProducts();
  }, [loadProducts, queryClient, tenantId]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre, importe e organize os produtos publicados nos canais de venda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/marketing/facebook-marketplace">
            <Button type="button" size="sm">
              <Store className="h-4 w-4 mr-1.5" />
              Marketplace Facebook
            </Button>
          </Link>
          <Link href="/catalogo/categorias">
            <Button type="button" variant="outline" size="sm">
              <FolderTree className="h-4 w-4 mr-1.5" />
              Gerenciar categorias
            </Button>
          </Link>
        </div>
      </div>
      <CatalogPriceImporter tenantId={tenantId} onImported={handleCommercialSaved} />
      <CatalogoModal open tenantId={tenantId} onClose={() => navigate("/")} />
      {portalTarget && activeProduct
        ? createPortal(
            <div className="space-y-4">
              <CommercialDeliveryPanel
                key={`commercial-${activeProduct.id}`}
                product={activeProduct}
                portalTarget={portalTarget}
                onSaved={handleCommercialSaved}
              />
              <EngineeringCommercialPanel
                key={`engineering-${activeProduct.id}`}
                product={activeProduct}
                onSaved={handleCommercialSaved}
              />
              <ArqdorProductConfigurationPanel
                key={`arqdor-${activeProduct.id}`}
                product={activeProduct}
              />
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
