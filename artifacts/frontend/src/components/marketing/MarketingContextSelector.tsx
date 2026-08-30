import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, PackageSearch, Plus, Target } from "lucide-react";

type Product = { id: string; nome: string; ativo?: boolean };

export type MarketingContextValue = {
  nicheId: string;
  nicheName: string;
  productIds: string[];
  productNames: string[];
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

function headers() {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildNicheName(segment: string, niche: string, goal: string) {
  return [
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
}: {
  tenantId: string;
  value: MarketingContextValue;
  onChange: (value: MarketingContextValue) => void;
  required?: boolean;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [customOffer, setCustomOffer] = useState("");

  const audienceSegment = value.audienceSegment ?? "";
  const audienceNiche = value.audienceNiche ?? "";
  const campaignGoal = value.campaignGoal ?? "";

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers() })
      .then((response) => response.ok ? response.json() : [])
      .then((items) => setProducts(Array.isArray(items) ? items.filter((item) => item.ativo !== false) : []))
      .finally(() => setLoading(false));
  }, [tenantId]);

  function emit(patch: Partial<MarketingContextValue>) {
    const next = { ...value, ...patch };
    const segment = next.audienceSegment ?? "";
    const niche = next.audienceNiche ?? "";
    const goal = next.campaignGoal ?? "";
    onChange({
      ...next,
      nicheId: segment,
      nicheName: buildNicheName(segment, niche, goal),
    });
  }

  function toggleProduct(product: Product) {
    const selected = value.productIds.includes(product.id);
    const productIds = selected
      ? value.productIds.filter((id) => id !== product.id)
      : [...value.productIds, product.id];
    const customNames = value.productIds
      .filter((id) => id.startsWith("custom:") && productIds.includes(id))
      .map((id) => value.productNames[value.productIds.indexOf(id)])
      .filter(Boolean);
    const catalogNames = products.filter((item) => productIds.includes(item.id)).map((item) => item.nome);
    emit({ productIds, productNames: [...catalogNames, ...customNames] });
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

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-5">
      <div>
        <div className="flex items-center gap-2 font-semibold">
          <Target className="h-5 w-5 text-primary" />
          Para quem e o que você quer divulgar?
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Primeiro defina o público que deseja atingir. Depois escolha ou descreva a oferta.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-background/70 p-3">
        <p className="text-sm font-semibold">1. Público que você quer atingir</p>
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
            2. Produto, serviço ou oferta
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

        {products.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-lg border bg-background p-2">
            {products.map((product) => {
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

        {!loading && products.length === 0 && (
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
