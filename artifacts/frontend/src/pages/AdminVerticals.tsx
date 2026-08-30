import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenants,
  getListTenantsQueryKey,
  useListSegmentTemplates,
  useApplySegmentTemplate,
  getGetAgentConfigByTenantQueryKey,
  type Tenant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  HardHat, Shirt, ShoppingCart, Building2, Search, LogOut,
  ExternalLink, AlertCircle, Bot, GitBranch, Tag, Sparkles,
  CheckCircle2, Loader2, Users, ChevronRight, Info, Layers,
  Shield, DraftingCompass, Scissors, Stethoscope, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VerticalTemplateEditor } from "@/components/admin/VerticalTemplateEditor";

interface VerticalMeta {
  label: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
  href: string;
  features: string[];
}

const VERTICAL_META: Record<string, VerticalMeta> = {
  "Construção & Reforma": {
    label: "Construção Civil",
    icon: HardHat,
    color: "text-amber-700 bg-amber-50 border-amber-200",
    bgGradient: "from-amber-50 to-orange-50",
    href: "/obras",
    features: [
      "Gestão de obras com etapas e medições",
      "Orçamentos e composições de insumos",
      "Controle financeiro por obra (DRE)",
      "Upload e análise IA de NF/XML",
      "Portal do cliente para acompanhamento",
      "Lançamentos integrados com Asaas",
    ],
  },
  "Varejo de Roupas & Acessórios": {
    label: "Varejo de Moda",
    icon: Shirt,
    color: "text-pink-700 bg-pink-50 border-pink-200",
    bgGradient: "from-pink-50 to-purple-50",
    href: "/varejo/produtos",
    features: [
      "Catálogo de produtos com variações (cor/tamanho)",
      "Gestão de coleções e fornecedores",
      "Controle de compras e estoque",
      "Programa de fidelidade por pontos",
      "Combos e looks sugeridos",
      "Vitrine integrada com WhatsApp",
    ],
  },
  "Supermercado": {
    label: "Supermercado",
    icon: ShoppingCart,
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    bgGradient: "from-emerald-50 to-teal-50",
    href: "/supermercado",
    features: [
      "Dashboard de pedidos e faturamento",
      "Catálogo com categorias e preços",
      "Gestão de pedidos e status de entrega",
      "Campanhas de promoção por segmento",
      "Configurações de área de cobertura",
    ],
  },
  "Seguros Corporativos": {
    label: "Seguros Corporativos",
    icon: Shield,
    color: "text-blue-700 bg-blue-50 border-blue-200",
    bgGradient: "from-blue-50 to-cyan-50",
    href: "/scout/seguros/renovacoes",
    features: [
      "Pipeline de renovações 90/60/30/10",
      "Matriz conta × produto",
      "Whitespace e cross-sell",
      "Gestão de apólices e sinistros",
      "Revenue Scout com aprovação humana",
    ],
  },
  "Clínica": {
    label: "Clínica",
    icon: Stethoscope,
    color: "text-sky-700 bg-sky-50 border-sky-200",
    bgGradient: "from-sky-50 to-indigo-50",
    href: "/clinic",
    features: ["Dashboard clínico", "Agenda", "Prontuários", "Gestão de médicos"],
  },
  "Salão de Beleza": {
    label: "Salão de Beleza",
    icon: Scissors,
    color: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200",
    bgGradient: "from-fuchsia-50 to-pink-50",
    href: "/beauty",
    features: ["Dashboard do salão", "Agenda", "Serviços", "Profissionais"],
  },
  "Arquitetura & Design": {
    label: "Arch — Arquitetura & Design",
    icon: DraftingCompass,
    color: "text-violet-700 bg-violet-50 border-violet-200",
    bgGradient: "from-violet-50 to-purple-50",
    href: "/arch",
    features: ["Dashboard de projetos", "Render Studio", "Catálogo", "Marketplace"],
  },
  "Distribuidora de Materiais de Construção": {
    label: "Distribuidora de Materiais de Construção",
    icon: Building2,
    color: "text-orange-700 bg-orange-50 border-orange-200",
    bgGradient: "from-orange-50 to-amber-50",
    href: "/scout",
    features: [
      "Revenue Scout por obra, etapa e categoria",
      "Reposição e giro de estoque",
      "Cross-sell de materiais complementares",
      "Reativação de construtoras e profissionais",
      "Cotações e oportunidades comerciais",
      "Entregas e acompanhamento de pedidos",
    ],
  },
  "Distribuidora de Alimentos": {
    label: "Distribuidora de Alimentos",
    icon: ShoppingCart,
    color: "text-lime-700 bg-lime-50 border-lime-200",
    bgGradient: "from-lime-50 to-emerald-50",
    href: "/scout",
    features: [
      "Revenue Scout por frequência e mix de compra",
      "Reposição, giro, validade e ruptura",
      "Cross-sell por categoria e perfil de cliente",
      "Reativação de clientes inativos",
      "Campanhas e oportunidades sazonais",
      "Entregas e acompanhamento de pedidos",
    ],
  },
  "Distribuidora de Máquinas e Insumos": {
    label: "Distribuidora de Máquinas e Insumos",
    icon: Layers,
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
    bgGradient: "from-cyan-50 to-slate-50",
    href: "/scout",
    features: [
      "Revenue Scout por parque instalado e ciclo de uso",
      "Reposição de insumos e consumíveis",
      "Manutenção e substituição de máquinas",
      "Cross-sell técnico e expansão de capacidade",
      "Reativação de contas e contratos",
      "Entregas e oportunidades por aplicação",
    ],
  },
};

const ACTIVE_VERTICALS = Object.keys(VERTICAL_META);

interface VerticalDetailSheetProps {
  vertical: string | null;
  onClose: () => void;
  tenants: Tenant[];
}

function VerticalDetailSheet({ vertical, onClose, tenants }: VerticalDetailSheetProps) {
  const { setTenantOverride, tenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [targetTenantId, setTargetTenantId] = useState<string>("");
  const [activating, setActivating] = useState(false);

  const { data: templates = [], refetch: refetchTemplates } = useListSegmentTemplates();
  const applyMutation = useApplySegmentTemplate();

  if (!vertical) return null;

  const meta = VERTICAL_META[vertical];
  if (!meta) return null;

  const VertIcon = meta.icon;
  const template = templates.find((t) => t.nome === vertical);

  const tenantsWithVertical = tenants.filter((t) => (t as any).vertical === vertical);
  const tenantsWithout = tenants.filter(
    (t) => (t as any).vertical !== vertical && t.status === "active"
  );

  const promptCount = template
    ? Object.values(template.promptsSugeridos ?? {}).filter(Boolean).length
    : 0;

  async function handleActivate() {
    if (!targetTenantId || !template) return;
    const tName = tenants.find((t) => t.id === targetTenantId)?.name ?? targetTenantId;
    setActivating(true);
    applyMutation.mutate(
      { tenantId: targetTenantId, id: template.id },
      {
        onSuccess: () => {
          setActivating(false);
          toast({
            title: `Vertical ativada para ${tName}`,
            description: `O módulo "${vertical}" foi ativado com sucesso.`,
          });
          qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAgentConfigByTenantQueryKey(targetTenantId) });
          setTargetTenantId("");
        },
        onError: () => {
          setActivating(false);
          toast({
            title: "Erro ao ativar vertical",
            description: "Tente novamente.",
            variant: "destructive",
          });
        },
      }
    );
  }

  function handleAccess(tenantId: string, tenantName: string) {
    setTenantOverride({ id: tenantId, name: tenantName, vertical: vertical! });
    setLocation(meta.href);
    onClose();
  }

  // Verticais que têm um programa de marca (white-label) associado — o
  // preview usa a cor/logo do programa em vez do padrão Vendor.ai. Só tem
  // "arqdor" hoje; quando o logo for enviado pela tela normal de
  // Configurações, atualiza o logoUrl aqui também.
  const BRAND_PROGRAM_BY_VERTICAL: Record<string, { corPrimaria?: string; logoUrl?: string }> = {
    "Arquitetura & Design": { corPrimaria: "#F4171F" },
  };

  function handlePreview() {
    const brand = BRAND_PROGRAM_BY_VERTICAL[vertical!];
    setTenantOverride({
      id: `__vertical_preview__:${vertical}`,
      name: "Preview de layout",
      vertical: vertical!,
      preview: true,
      ...(brand ?? {}),
    });
    setLocation(meta.href);
    onClose();
  }

  return (
    <Sheet open={!!vertical} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className={cn("p-6 bg-gradient-to-br", meta.bgGradient)}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3 text-xl">
              <div className={cn("p-2 rounded-lg border", meta.color)}>
                <VertIcon className="h-5 w-5" />
              </div>
              {meta.label}
            </SheetTitle>
            <SheetDescription className="text-sm mt-1">
              {template?.descricao ?? `Módulo vertical para ${meta.label}`}
            </SheetDescription>
          </SheetHeader>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { icon: Bot, label: "Agentes IA", value: promptCount },
              { icon: GitBranch, label: "Etapas funil", value: template?.funilPadrao?.length ?? "—" },
              { icon: Tag, label: "Categorias", value: template?.categoriasProdutoSugeridas?.length ?? "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col items-center gap-1 rounded-xl bg-white/70 border border-white/80 p-3 text-center backdrop-blur-sm">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-lg font-bold text-foreground">{value}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Preview sem tenant
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Abra o layout desta vertical como Super Admin, sem cadastrar empresa, tenant ou e-mail.
                Dados reais de clientes não são carregados.
              </p>
            </div>
            <Button className="w-full gap-2" onClick={handlePreview}>
              <Eye className="h-4 w-4" />
              Visualizar layout
            </Button>
          </section>

          {template && (
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Configuração operacional</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Edite o funil, categorias e orientações dos agentes desta vertical sem alterar o layout nem os tenants existentes.
                </p>
              </div>
              <VerticalTemplateEditor
                template={template}
                onSaved={() => refetchTemplates()}
              />
            </section>
          )}

          {/* ── Funcionalidades do módulo ──────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Funcionalidades incluídas
            </h3>
            <ul className="space-y-1.5">
              {meta.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </section>

          {/* ── Funil padrão ──────────────────────────────────── */}
          {template?.funilPadrao && template.funilPadrao.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                Funil de vendas padrão
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {template.funilPadrao.map((etapa, i) => (
                  <Badge key={etapa} variant="secondary" className="text-xs gap-1">
                    <span className="text-muted-foreground">{i + 1}.</span> {etapa}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* ── Agentes de IA ─────────────────────────────────── */}
          {template && promptCount > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Agentes de IA configurados
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(template.promptsSugeridos ?? {})
                  .filter((k) => !!(template.promptsSugeridos as Record<string, string>)[k])
                  .map((k) => (
                    <Badge key={k} variant="outline" className="text-xs capitalize">
                      <Sparkles className="h-3 w-3 mr-1 text-primary" />
                      {k.replace(/([A-Z])/g, " $1").trim()}
                    </Badge>
                  ))}
              </div>
            </section>
          )}

          {/* ── Categorias de produto ─────────────────────────── */}
          {template?.categoriasProdutoSugeridas && template.categoriasProdutoSugeridas.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                Categorias sugeridas
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {template.categoriasProdutoSugeridas.map((c) => (
                  <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                ))}
              </div>
            </section>
          )}

          {/* ── Tenants com esta vertical ─────────────────────── */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Tenants com este módulo
              <Badge variant="secondary" className="text-xs">{tenantsWithVertical.length}</Badge>
            </h3>
            {tenantsWithVertical.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum tenant ativo nesta vertical ainda.</p>
            ) : (
              <div className="space-y-2">
                {tenantsWithVertical.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.status}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 shrink-0"
                      onClick={() => handleAccess(t.id, t.name)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Acessar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Ativar para novo tenant ───────────────────────── */}
          {template && (
            <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Ativar módulo para um tenant
              </h3>
              <p className="text-xs text-muted-foreground">
                Selecione um tenant ativo que ainda não possui este módulo e aplique o template completo (agentes, funil, vertical).
              </p>
              <Select value={targetTenantId} onValueChange={setTargetTenantId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecionar tenant..." />
                </SelectTrigger>
                <SelectContent>
                  {tenantsWithout.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Todos os tenants ativos já têm esta vertical
                    </SelectItem>
                  ) : (
                    tenantsWithout.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                className="w-full gap-2"
                disabled={!targetTenantId || activating || tenantsWithout.length === 0}
                onClick={handleActivate}
              >
                {activating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ativando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Ativar módulo
                  </>
                )}
              </Button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminVerticals() {
  const { setTenantOverride, tenantOverride, clearTenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterVertical, setFilterVertical] = useState<string | "all">("all");
  const [detailVertical, setDetailVertical] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useListTenants({
    query: { queryKey: getListTenantsQueryKey() },
  });

  const tenantsWithVertical = tenants.filter(
    (t) => t.vertical && ACTIVE_VERTICALS.includes(t.vertical)
  );

  const filtered = tenantsWithVertical.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchV = filterVertical === "all" || t.vertical === filterVertical;
    return matchSearch && matchV;
  });

  const grouped = ACTIVE_VERTICALS.reduce<Record<string, typeof filtered>>((acc, v) => {
    acc[v] = filtered.filter((t) => t.vertical === v);
    return acc;
  }, {});

  function handleAccess(tenantId: string, tenantName: string, vertical: string) {
    const meta = VERTICAL_META[vertical];
    if (!meta) return;
    setTenantOverride({ id: tenantId, name: tenantName, vertical });
    setLocation(meta.href);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Verticais e previews
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visualize layouts, edite a configuração operacional das verticais e acesse módulos vinculados a clientes reais.
          </p>
        </div>
        {tenantOverride && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-800">
              Visualizando <strong>{tenantOverride.name}</strong>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-amber-700 hover:text-amber-900 hover:bg-amber-100 ml-1"
              onClick={clearTenantOverride}
            >
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Sair
            </Button>
          </div>
        )}
      </div>

      {/* ── Vitrine dos módulos verticais ─────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ACTIVE_VERTICALS.map((vertical) => {
          const meta = VERTICAL_META[vertical]!;
          const VertIcon = meta.icon;
          const count = tenants.filter((t) => (t as any).vertical === vertical).length;
          return (
            <button
              key={vertical}
              onClick={() => setDetailVertical(vertical)}
              className={cn(
                "rounded-xl border text-left p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 group",
                `bg-gradient-to-br ${meta.bgGradient}`
              )}
            >
              <div className={cn("w-fit p-2 rounded-lg border", meta.color)}>
                <VertIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">{meta.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{count} tenant{count !== 1 ? "s" : ""} ativos</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary font-medium mt-auto group-hover:gap-2 transition-all">
                <Info className="h-3.5 w-3.5" />
                Ver detalhes
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          );
        })}
      </section>

      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tenant..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", ...ACTIVE_VERTICALS].map((v) => {
            const meta = v !== "all" ? VERTICAL_META[v] : null;
            const Icon = meta?.icon;
            return (
              <Button
                key={v}
                size="sm"
                variant={filterVertical === v ? "default" : "outline"}
                onClick={() => setFilterVertical(v)}
                className="gap-1.5"
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {v === "all" ? "Todos" : meta?.label}
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm animate-pulse">
          Carregando tenants...
        </div>
      )}

      {!isLoading && tenantsWithVertical.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Nenhum tenant com vertical ativa cadastrado.
        </div>
      )}

      {/* ── Lista por vertical ────────────────────────────────── */}
      {!isLoading && ACTIVE_VERTICALS.map((vertical) => {
        const items = grouped[vertical] ?? [];
        if (filterVertical !== "all" && filterVertical !== vertical) return null;
        if (items.length === 0 && search) return null;

        const meta = VERTICAL_META[vertical]!;
        const VertIcon = meta.icon;

        return (
          <section key={vertical}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md border w-fit", meta.color)}>
                <VertIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">{meta.label}</span>
                <Badge variant="secondary" className="ml-1 text-xs">{items.length}</Badge>
              </div>
              <button
                onClick={() => setDetailVertical(vertical)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Info className="h-3 w-3" /> Ver detalhes do módulo
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">Nenhum tenant encontrado.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((tenant) => {
                  const isActive = tenantOverride?.id === tenant.id;
                  return (
                    <div
                      key={tenant.id}
                      className={cn(
                        "rounded-lg border bg-card p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm",
                        isActive && "ring-2 ring-primary border-primary/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{tenant.id}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs shrink-0",
                            tenant.status === "active"
                              ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                              : "text-muted-foreground"
                          )}
                        >
                          {tenant.status}
                        </Badge>
                      </div>

                      <Button
                        size="sm"
                        className={cn("w-full gap-2", isActive && "bg-primary/90")}
                        onClick={() => handleAccess(tenant.id, tenant.name, vertical)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {isActive ? "Visualizando" : "Acessar módulo"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* ── Detail Sheet ──────────────────────────────────────── */}
      <VerticalDetailSheet
        vertical={detailVertical}
        onClose={() => setDetailVertical(null)}
        tenants={tenants}
      />
    </div>
  );
}
