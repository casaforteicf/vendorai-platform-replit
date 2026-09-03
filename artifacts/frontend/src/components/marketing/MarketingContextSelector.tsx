import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MARKETING_VERTICALS } from "@workspace/vendor-brain/marketing-verticals";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle2, PackageSearch, Plus, Target } from "lucide-react";

type Product = { id: string; nome: string; ativo?: boolean };

export type MarketingContextValue = {
  nicheId: string;
  nicheName: string;
  productIds: string[];
  productNames: string[];
  businessVertical?: string;
  businessVerticalSlug?: string;
  audienceSegment?: string;
  audienceNiche?: string;
  campaignGoal?: string;
};

const AUDIENCE_SEGMENTS = [
  "Empresas (B2B)",
  "Consumidor final (B2C)",
  "Profissionais e autônomos",
  "Condomínios",
  "Órgãos públicos",
  "Associações e entidades",
  "Outro público",
];

function headers(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * `nicheName` é um campo legado consumido por geração de copy/imagem e Ads.
 * Mantemos compatibilidade, mas agora o texto deixa explícita a separação entre:
 * negócio que anuncia → público desejado → nicho do público → objetivo.
 */
function buildContextSummary(
  businessVertical: string,
  segment: string,
  niche: string,
  goal: string,
) {
  return [
    businessVertical && `Negócio: ${businessVertical}`,
    segment && `Público: ${segment}`,
    niche && `Nicho do público: ${niche}`,
    goal && `Objetivo: ${goal}`,
  ].filter(Boolean).join(" | ");
}

export function MarketingContextSelector({
  tenantId,
  value,
  onChange,
  required = true,
  compact = false,
  productsOverride,
}: {
  tenantId: string;
  value: MarketingContextValue;
  onChange: (value: MarketingContextValue) => void;
  required?: boolean;
  compact?: boolean;
  productsOverride?: Product[];
}) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [customOffer, setCustomOffer] = useState("");

  const audienceSegment = value.audienceSegment ?? "";
  const audienceNiche = value.audienceNiche ?? "";
  const campaignGoal = value.campaignGoal ?? "";
  const availableProducts = productsOverride ?? products;
  const productsLoading = productsOverride ? false : loading;

  const requestedVerticalSlug = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("vertical")?.trim() || ""
    : "";
  const requestedProfile = requestedVerticalSlug
    ? MARKETING_VERTICALS.find(
        (profile: { slug: string; id: string; name: string }) => profile.slug === requestedVerticalSlug || profile.id === requestedVerticalSlug,
      )
    : undefined;
  const tenantVertical = ((user as any)?.tenantVertical as string | undefined)?.trim() || "";
  const businessVertical = requestedProfile?.name || value.businessVertical || tenantVertical;
  const businessVerticalSlug = requestedProfile?.slug || value.businessVerticalSlug || "";

  useEffect(() => {
    if (!tenantId || productsOverride) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers() })
      .then((response) => response.ok ? response.json() : [])
      .then((items) => setProducts(Array.isArray(items) ? items.filter((item) => item.ativo !== false) : []))
      .finally(() => setLoading(false));
  }, [tenantId, productsOverride]);

  useEffect(() => {
    if (!businessVertical) return;
    const summary = buildContextSummary(
      businessVertical,
      audienceSegment,
      audienceNiche,
      campaignGoal,
    );

    const currentBusinessVerticalSlug = value.businessVerticalSlug ?? "";
    if (
      value.businessVertical === businessVertical &&
      currentBusinessVerticalSlug === businessVerticalSlug &&
      value.nicheName === summary
    ) return;

    onChange({
      ...value,
      businessVertical,
      businessVerticalSlug: businessVerticalSlug || undefined,
      nicheName: summary,
    });
  }, [
    businessVertical,
    businessVerticalSlug,
    audienceSegment,
    audienceNiche,
    campaignGoal,
    value,
    onChange,
  ]);

  function emit(patch: Partial<MarketingContextValue>) {
    const next = { ...value, ...patch };
    const nextBusinessVertical = next.businessVertical || businessVertical || "";
    const segment = next.audienceSegment ?? "";
    const niche = next.audienceNiche ?? "";
    const goal = next.campaignGoal ?? "";
    onChange({
      ...next,
      businessVertical: nextBusinessVertical || undefined,
      businessVerticalSlug: next.businessVerticalSlug || businessVerticalSlug || undefined,
      nicheId: segment && niche.trim() ? `${segment}:${niche.trim()}` : "",
      nicheName: buildContextSummary(nextBusinessVertical, segment, niche, goal),
    });
  }

  function toggleProduct(product: Product) {
    const selectedIndex = value.productIds.indexOf(product.id);
    if (selectedIndex >= 0) {
      emit({
        productIds: value.productIds.filter((_, index) => index !== selectedIndex),
        productNames: value.productNames.filter((_, index) => index !== selectedIndex),
      });
      return;
    }
    emit({
      productIds: [...value.productIds, product.id],
      productNames: [...value.productNames, product.nome],
    });
  }

  function addCustomOffer() {
    const name = customOffer.trim();
    if (!name) return;
    const id = `custom:${crypto.randomUUID()}`;
    emit({
      productIds: [...value.productIds, id],
      productNames: [...value.productNames, name],
    });
    setCustomOffer("");
  }

  function removeOffer(index: number) {
    emit({
      productIds: value.productIds.filter((_, itemIndex) => itemIndex !== index),
      productNames: value.productNames.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  if (compact) {
    return (
      <section className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Target className="h-4 w-4 text-primary" />
              Estratégia da divulgação
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Informe uma vez a oferta, o público e o objetivo. O mesmo contexto será usado pela IA na criação, publicação e patrocínio.
            </p>
          </div>
          {businessVertical ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] text-muted-foreground">Anunciante</span>
              <Badge variant="secondary" className="text-xs">{businessVertical}</Badge>
            </div>
          ) : (
            <p className="text-xs text-amber-700">Complete o perfil da empresa para melhorar o contexto da IA.</p>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border bg-background p-3 space-y-3">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">1. O que divulgar</p>
            </div>
            {availableProducts.length > 0 && (
              <Select
                onValueChange={(id) => {
                  const product = availableProducts.find((item) => item.id === id);
                  if (product && !value.productIds.includes(product.id)) toggleProduct(product);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Escolher do catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id} disabled={value.productIds.includes(product.id)}>
                      {product.nome}{value.productIds.includes(product.id) ? " ✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2">
              <Input
                value={customOffer}
                onChange={(event) => setCustomOffer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomOffer();
                  }
                }}
                placeholder="Ou escreva uma oferta"
                className="h-9"
              />
              <button
                type="button"
                onClick={addCustomOffer}
                aria-label="Adicionar oferta"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {!productsLoading && availableProducts.length === 0 && value.productNames.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Catálogo vazio — use a oferta manual acima.</p>
            )}
            {value.productNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {value.productNames.map((name, index) => (
                  <button key={`${name}-${index}`} type="button" onClick={() => removeOffer(index)} title="Remover oferta">
                    <Badge variant="secondary" className="text-[11px]">{name} ×</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-background p-3 space-y-3">
            <p className="text-sm font-semibold">2. Para quem</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de público {required ? "*" : ""}</Label>
              <Select value={audienceSegment} onValueChange={(item) => emit({ audienceSegment: item })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Ex.: Empresas (B2B)" /></SelectTrigger>
                <SelectContent>
                  {AUDIENCE_SEGMENTS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nicho ou ramo {required ? "*" : ""}</Label>
              <Input
                value={audienceNiche}
                onChange={(event) => emit({ audienceNiche: event.target.value })}
                placeholder="Ex.: lojas de roupas, indústrias..."
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3 space-y-2">
            <p className="text-sm font-semibold">3. Objetivo</p>
            <Label className="text-xs">O que você quer conseguir com esta divulgação?</Label>
            <Textarea
              value={campaignGoal}
              onChange={(event) => emit({ campaignGoal: event.target.value })}
              placeholder="Ex.: gerar pedidos de orçamento, criar parceria, apresentar lançamento..."
              rows={4}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">A IA usa este objetivo para decidir abordagem, dor, CTA e composição.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-5">
      <div>
        <div className="flex items-center gap-2 font-semibold">
          <Target className="h-5 w-5 text-primary" />
          Para quem e o que você quer divulgar?
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O contexto do seu negócio fica separado do público que receberá a campanha e da oferta que será divulgada.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-background/70 p-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">1. Seu negócio</p>
            {businessVertical ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{businessVertical}</Badge>
                {requestedProfile && <Badge variant="outline">Vertical oficial VendorAI</Badge>}
              </div>
            ) : (
              <p className="mt-1 text-xs text-amber-700">
                A vertical do negócio ainda não foi identificada. Complete o perfil da empresa para melhorar o contexto da IA.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Esta é a empresa que está anunciando. Ela não define quem receberá a campanha.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-background/70 p-3">
        <p className="text-sm font-semibold">2. Público que você quer atingir</p>
        <div className="space-y-2">
          <Label>Tipo de público {required ? "*" : ""}</Label>
          <Select value={audienceSegment} onValueChange={(item) => emit({ audienceSegment: item })}>
            <SelectTrigger><SelectValue placeholder="Ex.: Empresas (B2B)" /></SelectTrigger>
            <SelectContent>
              {AUDIENCE_SEGMENTS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Nicho ou ramo desse público {required ? "*" : ""}</Label>
          <Input
            value={audienceNiche}
            onChange={(event) => emit({ audienceNiche: event.target.value })}
            placeholder="Ex.: lojas de roupas, indústrias, escolas..."
          />
          <p className="text-xs text-muted-foreground">
            Este campo descreve quem receberá a campanha, não o ramo da sua própria empresa.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Objetivo da divulgação</Label>
          <Textarea
            value={campaignGoal}
            onChange={(event) => emit({ campaignGoal: event.target.value })}
            placeholder="Ex.: criar parceria e oferecer um cartão especial aos colaboradores"
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-background/70 p-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-primary" />
            3. Produto, serviço ou oferta
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione algo do catálogo ou escreva uma oferta que ainda não esteja cadastrada.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={customOffer}
            onChange={(event) => setCustomOffer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomOffer();
              }
            }}
            placeholder="Ex.: Cartão Cliente Especial"
          />
          <button
            type="button"
            onClick={addCustomOffer}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>

        {availableProducts.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-lg border bg-background p-2">
            {availableProducts.map((product) => {
              const selected = value.productIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleProduct(product)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                >
                  <span>{product.nome}</span>
                  {selected && <CheckCircle2 className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        )}

        {!productsLoading && availableProducts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            O catálogo está vazio, mas você pode adicionar a oferta manualmente acima.
          </p>
        )}

        {value.productNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.productNames.map((name, index) => (
              <button key={`${name}-${index}`} type="button" onClick={() => removeOffer(index)}>
                <Badge variant="secondary">{name} ×</Badge>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}