import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MARKETING_VERTICALS } from "@workspace/vendor-brain/marketing-verticals";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle2, MapPin, PackageSearch, Plus, Search, Target } from "lucide-react";

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
  locationCity?: string;
  locationState?: string;
  locationRegion?: string;
  projectName?: string;
  specificDetails?: string;
  mandatoryDifferentiators?: string;
  restrictions?: string;
  primaryKpi?: string;
  researchEnabled?: boolean;
  seoTrackingEnabled?: boolean;
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

const MANUAL_OFFER_ID = "custom:manual-offer-draft";

function headers(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * `nicheName` continua como ponte de compatibilidade para geradores antigos.
 * Os dados novos permanecem estruturados no marketingContext, mas entram também
 * neste resumo enquanto todos os consumidores migram para o briefing mestre.
 */
function buildContextSummary(value: {
  businessVertical: string;
  segment: string;
  niche: string;
  goal: string;
  city?: string;
  state?: string;
  region?: string;
  project?: string;
  details?: string;
  differentiators?: string;
  restrictions?: string;
  primaryKpi?: string;
}) {
  const location = [value.city, value.state].filter(Boolean).join("/");
  return [
    value.businessVertical && `Negócio: ${value.businessVertical}`,
    value.segment && `Público: ${value.segment}`,
    value.niche && `Nicho do público: ${value.niche}`,
    value.goal && `Objetivo: ${value.goal}`,
    location && `Local: ${location}`,
    value.region && `Região/bairro: ${value.region}`,
    value.project && `Empreendimento/local: ${value.project}`,
    value.details && `Contexto específico: ${value.details}`,
    value.differentiators && `Diferenciais obrigatórios: ${value.differentiators}`,
    value.restrictions && `Restrições: ${value.restrictions}`,
    value.primaryKpi && `Meta/KPI: ${value.primaryKpi}`,
  ].filter(Boolean).join(" | ");
}

function BriefingToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-background px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
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
  const hideExpandedInContentAutopilot = typeof window !== "undefined"
    && window.location.pathname === "/content-autopilot"
    && new URLSearchParams(window.location.search).get("view") === "generator";

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

  function summaryFor(next: MarketingContextValue, nextBusinessVertical = businessVertical || "") {
    return buildContextSummary({
      businessVertical: nextBusinessVertical,
      segment: next.audienceSegment ?? "",
      niche: next.audienceNiche ?? "",
      goal: next.campaignGoal ?? "",
      city: next.locationCity?.trim(),
      state: next.locationState?.trim(),
      region: next.locationRegion?.trim(),
      project: next.projectName?.trim(),
      details: next.specificDetails?.trim(),
      differentiators: next.mandatoryDifferentiators?.trim(),
      restrictions: next.restrictions?.trim(),
      primaryKpi: next.primaryKpi?.trim(),
    });
  }

  useEffect(() => {
    if (!businessVertical) return;
    const next: MarketingContextValue = {
      ...value,
      businessVertical,
      businessVerticalSlug: businessVerticalSlug || undefined,
    };
    const summary = summaryFor(next, businessVertical);
    const currentBusinessVerticalSlug = value.businessVerticalSlug ?? "";

    if (
      value.businessVertical === businessVertical &&
      currentBusinessVerticalSlug === businessVerticalSlug &&
      value.nicheName === summary
    ) return;

    onChange({ ...next, nicheName: summary });
    // value/onChange são intencionalmente observados para manter o resumo legado sincronizado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    businessVertical,
    businessVerticalSlug,
    audienceSegment,
    audienceNiche,
    campaignGoal,
    value.locationCity,
    value.locationState,
    value.locationRegion,
    value.projectName,
    value.specificDetails,
    value.mandatoryDifferentiators,
    value.restrictions,
    value.primaryKpi,
  ]);

  function emit(patch: Partial<MarketingContextValue>) {
    const next = { ...value, ...patch };
    const nextBusinessVertical = next.businessVertical || businessVertical || "";
    const segment = next.audienceSegment ?? "";
    const niche = next.audienceNiche ?? "";
    const normalized: MarketingContextValue = {
      ...next,
      businessVertical: nextBusinessVertical || undefined,
      businessVerticalSlug: next.businessVerticalSlug || businessVerticalSlug || undefined,
      nicheId: segment && niche.trim() ? `${segment}:${niche.trim()}` : "",
      nicheName: "",
    };
    onChange({
      ...normalized,
      nicheName: summaryFor(normalized, nextBusinessVertical),
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

  function syncCustomOffer(rawValue: string) {
    setCustomOffer(rawValue);
    const name = rawValue.trim();
    const draftIndex = value.productIds.indexOf(MANUAL_OFFER_ID);

    if (!name) {
      if (draftIndex >= 0) {
        emit({
          productIds: value.productIds.filter((_, index) => index !== draftIndex),
          productNames: value.productNames.filter((_, index) => index !== draftIndex),
        });
      }
      return;
    }

    if (draftIndex >= 0) {
      const productNames = [...value.productNames];
      productNames[draftIndex] = name;
      emit({ productNames });
      return;
    }

    emit({
      productIds: [...value.productIds, MANUAL_OFFER_ID],
      productNames: [...value.productNames, name],
    });
  }

  function addCustomOffer() {
    const name = customOffer.trim();
    if (!name) return;

    const draftIndex = value.productIds.indexOf(MANUAL_OFFER_ID);
    if (draftIndex >= 0) {
      const productIds = [...value.productIds];
      productIds[draftIndex] = `custom:${crypto.randomUUID()}`;
      emit({ productIds });
      setCustomOffer("");
      return;
    }

    emit({
      productIds: [...value.productIds, `custom:${crypto.randomUUID()}`],
      productNames: [...value.productNames, name],
    });
    setCustomOffer("");
  }

  function removeOffer(index: number) {
    if (value.productIds[index] === MANUAL_OFFER_ID) setCustomOffer("");
    emit({
      productIds: value.productIds.filter((_, itemIndex) => itemIndex !== index),
      productNames: value.productNames.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  const locationLabel = [value.locationCity, value.locationState].filter(Boolean).join("/");
  const hasSpecificContext = Boolean(
    locationLabel || value.locationRegion || value.projectName || value.specificDetails || value.mandatoryDifferentiators || value.restrictions || value.primaryKpi,
  );

  if (hideExpandedInContentAutopilot && !compact) return null;

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
              Defina o briefing uma vez. Oferta, público, objetivo e contexto específico acompanham a campanha nas próximas criações.
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
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolher do catálogo" /></SelectTrigger>
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
                onChange={(event) => syncCustomOffer(event.target.value)}
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
                aria-label="Fixar oferta e adicionar outra"
                title="Fixar oferta e adicionar outra"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O texto digitado já entra no briefing. Use + somente para fixar a oferta e escrever outra.
            </p>
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
                placeholder="Ex.: condomínios, indústrias..."
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
            <p className="text-[11px] text-muted-foreground">A IA usa o objetivo para decidir abordagem, dor, CTA e composição.</p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">4. Contexto específico</p>
            <Badge variant={hasSpecificContext ? "secondary" : "outline"} className="ml-auto text-[10px]">
              {hasSpecificContext ? "Definido" : "Opcional"}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Use quando a peça for para uma cidade, bairro, condomínio, obra, evento ou oportunidade específica.
          </p>

          <div className="grid gap-2 md:grid-cols-4">
            <Input value={value.locationCity ?? ""} onChange={(e) => emit({ locationCity: e.target.value })} placeholder="Cidade, ex.: Chapecó" className="h-9" />
            <Input value={value.locationState ?? ""} onChange={(e) => emit({ locationState: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF, ex.: SC" className="h-9" maxLength={2} />
            <Input value={value.locationRegion ?? ""} onChange={(e) => emit({ locationRegion: e.target.value })} placeholder="Bairro/região" className="h-9" />
            <Input value={value.projectName ?? ""} onChange={(e) => emit({ projectName: e.target.value })} placeholder="Empreendimento/local" className="h-9" />
          </div>

          <div className="grid gap-2 lg:grid-cols-3">
            <Textarea value={value.specificDetails ?? ""} onChange={(e) => emit({ specificDetails: e.target.value })} placeholder="Detalhes: ex. Condomínio Jardim, público dos moradores, ação de orçamento..." rows={2} />
            <Textarea value={value.mandatoryDifferentiators ?? ""} onChange={(e) => emit({ mandatoryDifferentiators: e.target.value })} placeholder="Diferenciais que precisam aparecer" rows={2} />
            <Textarea value={value.restrictions ?? ""} onChange={(e) => emit({ restrictions: e.target.value })} placeholder="Restrições/cuidados: o que não afirmar ou mostrar" rows={2} />
          </div>

          <Input value={value.primaryKpi ?? ""} onChange={(e) => emit({ primaryKpi: e.target.value })} placeholder="Meta principal/KPI, ex.: 20 leads qualificados ou 10 pedidos de orçamento" className="h-9" />

          <div className="grid gap-2 md:grid-cols-2">
            <BriefingToggle
              checked={value.researchEnabled === true}
              onChange={(checked) => emit({ researchEnabled: checked })}
              title="Pesquisar contexto público"
              description="Prepara a campanha para usar pesquisa real do local/mercado quando a integração de pesquisa estiver disponível. Não inventa dados do empreendimento."
            />
            <BriefingToggle
              checked={value.seoTrackingEnabled === true}
              onChange={(checked) => emit({ seoTrackingEnabled: checked })}
              title="Gerar SEO e tracking"
              description="Marca o briefing para gerar palavras-chave, metadados e rastreamento consistentes nas peças conectadas."
            />
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Briefing mestre conectado:</strong> oferta, público, objetivo, local, empreendimento e detalhes ficam no contexto da campanha e seguem para os consumidores compatíveis da IA.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-5">
      <div>
        <div className="flex items-center gap-2 font-semibold">
          <Target className="h-5 w-5 text-primary" />
          Briefing mestre da campanha
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Defina uma vez o que divulgar, para quem, onde e em qual contexto. A campanha guarda esse briefing para reutilizar nas criações.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-background/70 p-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><Building2 className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Seu negócio</p>
            {businessVertical ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{businessVertical}</Badge>
                {requestedProfile && <Badge variant="outline">Vertical oficial VendorAI</Badge>}
              </div>
            ) : (
              <p className="mt-1 text-xs text-amber-700">A vertical ainda não foi identificada. Complete o perfil da empresa para melhorar o contexto da IA.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Esta é a empresa que anuncia. Ela não define quem receberá a campanha.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="space-y-3 rounded-lg border bg-background/70 p-3">
          <p className="text-sm font-semibold flex items-center gap-2"><PackageSearch className="h-4 w-4 text-primary" />1. Oferta</p>
          <div className="flex gap-2">
            <Input
              value={customOffer}
              onChange={(event) => syncCustomOffer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomOffer();
                }
              }}
              placeholder="Ex.: Esquadrias de PVC"
            />
            <button type="button" onClick={addCustomOffer} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">O texto digitado já faz parte do briefing; Adicionar apenas fixa a oferta para incluir outra.</p>

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
            <p className="text-xs text-muted-foreground">O catálogo está vazio, mas você pode escrever a oferta manualmente.</p>
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

        <div className="space-y-3 rounded-lg border bg-background/70 p-3">
          <p className="text-sm font-semibold">2. Público</p>
          <div className="space-y-2">
            <Label>Tipo de público {required ? "*" : ""}</Label>
            <Select value={audienceSegment} onValueChange={(item) => emit({ audienceSegment: item })}>
              <SelectTrigger><SelectValue placeholder="Ex.: Condomínios" /></SelectTrigger>
              <SelectContent>{AUDIENCE_SEGMENTS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nicho ou ramo {required ? "*" : ""}</Label>
            <Input value={audienceNiche} onChange={(event) => emit({ audienceNiche: event.target.value })} placeholder="Ex.: condomínios residenciais" />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-background/70 p-3">
          <p className="text-sm font-semibold">3. Objetivo</p>
          <Label>O que esta campanha deve conseguir?</Label>
          <Textarea value={campaignGoal} onChange={(event) => emit({ campaignGoal: event.target.value })} placeholder="Ex.: gerar pedidos de orçamento de moradores" rows={4} />
          <Input value={value.primaryKpi ?? ""} onChange={(event) => emit({ primaryKpi: event.target.value })} placeholder="Meta/KPI, ex.: 20 leads qualificados" />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-background/70 p-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">4. Local e contexto específico</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Exemplo: Chapecó/SC → Condomínio Jardim → ação exclusiva para moradores. Esses campos evitam peças genéricas e deixam o briefing reutilizável.
        </p>

        <div className="grid gap-2 md:grid-cols-4">
          <Input value={value.locationCity ?? ""} onChange={(e) => emit({ locationCity: e.target.value })} placeholder="Cidade" />
          <Input value={value.locationState ?? ""} onChange={(e) => emit({ locationState: e.target.value.toUpperCase().slice(0, 2) })} placeholder="UF" maxLength={2} />
          <Input value={value.locationRegion ?? ""} onChange={(e) => emit({ locationRegion: e.target.value })} placeholder="Bairro/região" />
          <Input value={value.projectName ?? ""} onChange={(e) => emit({ projectName: e.target.value })} placeholder="Empreendimento/local" />
        </div>

        <div className="grid gap-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Detalhes da ação</Label>
            <Textarea value={value.specificDetails ?? ""} onChange={(e) => emit({ specificDetails: e.target.value })} placeholder="Condição, ocasião, público local, mensagem específica..." rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Diferenciais obrigatórios</Label>
            <Textarea value={value.mandatoryDifferentiators ?? ""} onChange={(e) => emit({ mandatoryDifferentiators: e.target.value })} placeholder="Benefícios, diferenciais ou argumentos que precisam aparecer" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Restrições e cuidados</Label>
            <Textarea value={value.restrictions ?? ""} onChange={(e) => emit({ restrictions: e.target.value })} placeholder="O que a IA não deve afirmar, inventar ou mostrar" rows={3} />
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <BriefingToggle
            checked={value.researchEnabled === true}
            onChange={(checked) => emit({ researchEnabled: checked })}
            title="Pesquisar contexto público"
            description="Reserva a pesquisa para dados reais e verificáveis do mercado/local. Informações não confirmadas não devem ser tratadas como fato."
          />
          <BriefingToggle
            checked={value.seoTrackingEnabled === true}
            onChange={(checked) => emit({ seoTrackingEnabled: checked })}
            title="Gerar SEO e tracking"
            description="Mantém o briefing preparado para palavras-chave, metadados, UTMs e eventos de conversão das peças conectadas."
          />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
        <Search className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          <strong className="text-foreground">Contexto preservado:</strong> campanhas antigas continuam válidas, enquanto as novas passam a guardar localização, empreendimento, detalhes, diferenciais, restrições, KPI e preferências de pesquisa/SEO de forma estruturada.
        </p>
      </div>
    </section>
  );
}
