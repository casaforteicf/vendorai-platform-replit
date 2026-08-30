import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, PackageSearch } from "lucide-react";

type Category = { id: string; nome: string; nivel: string; parentId?: string | null; ativo?: boolean };
type Product = { id: string; nome: string; categoriaId?: string | null; categoriaNome?: string | null; ativo?: boolean };

export type MarketingContextValue = {
  nicheId: string;
  nicheName: string;
  productIds: string[];
  productNames: string[];
};

function headers() {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/tenants/${tenantId}/categorias-produto`, { headers: headers() }).then((r) => r.ok ? r.json() : []),
      fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers() }).then((r) => r.ok ? r.json() : []),
    ]).then(([cats, prods]) => {
      setCategories(Array.isArray(cats) ? cats.filter((c) => c.ativo !== false) : []);
      setProducts(Array.isArray(prods) ? prods.filter((p) => p.ativo !== false) : []);
    }).finally(() => setLoading(false));
  }, [tenantId]);

  const niches = useMemo(() => {
    const explicit = categories.filter((c) => c.nivel === "nicho");
    return explicit.length ? explicit : categories.filter((c) => ["categoria", "subcategoria"].includes(c.nivel));
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (!value.nicheId) return products;
    const childIds = new Set([value.nicheId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories) {
        if (category.parentId && childIds.has(category.parentId) && !childIds.has(category.id)) {
          childIds.add(category.id);
          changed = true;
        }
      }
    }
    return products.filter((product) => product.categoriaId && childIds.has(product.categoriaId));
  }, [categories, products, value.nicheId]);

  function selectNiche(id: string) {
    const niche = niches.find((item) => item.id === id);
    onChange({ nicheId: id, nicheName: niche?.nome ?? "", productIds: [], productNames: [] });
  }

  function toggleProduct(product: Product) {
    const selected = value.productIds.includes(product.id);
    const productIds = selected ? value.productIds.filter((id) => id !== product.id) : [...value.productIds, product.id];
    const productNames = products.filter((item) => productIds.includes(item.id)).map((item) => item.nome);
    onChange({ ...value, productIds, productNames });
  }

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 font-semibold"><PackageSearch className="h-5 w-5 text-primary" />O que você quer divulgar?</div>
        <p className="mt-1 text-xs text-muted-foreground">Escolha primeiro o nicho e depois um ou mais produtos ou serviços.</p>
      </div>

      <div className="space-y-2">
        <Label>Nicho ou área de atuação {required ? "*" : ""}</Label>
        <Select value={value.nicheId} onValueChange={selectNiche}>
          <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione o nicho"} /></SelectTrigger>
          <SelectContent>
            {niches.map((niche) => <SelectItem key={niche.id} value={niche.id}>{niche.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {!loading && niches.length === 0 && <p className="text-xs text-amber-700">Cadastre categorias ou nichos no catálogo para organizar a divulgação.</p>}
      </div>

      <div className="space-y-2">
        <Label>Produtos ou serviços {required ? "*" : ""}</Label>
        <div className="max-h-52 overflow-y-auto rounded-lg border bg-background p-2">
          {filteredProducts.map((product) => {
            const selected = value.productIds.includes(product.id);
            return (
              <button key={product.id} type="button" onClick={() => toggleProduct(product)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                <span>{product.nome}</span>
                {selected && <CheckCircle2 className="h-4 w-4" />}
              </button>
            );
          })}
          {!loading && filteredProducts.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado neste nicho.</p>}
        </div>
        {value.productNames.length > 0 && <div className="flex flex-wrap gap-1.5">{value.productNames.map((name) => <Badge key={name} variant="secondary">{name}</Badge>)}</div>}
      </div>
    </section>
  );
}
