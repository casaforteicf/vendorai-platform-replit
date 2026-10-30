import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CatalogProduct = { id: string; nome: string; sku?: string | null };
type IngredientDraft = { productId: string; quantityGross: number; quantityUnit: "kg" | "g" | "l" | "ml" | "un"; yieldFactor: number };
type Recipe = { id: string; title: string; status: string; yield_quantity: string; yield_unit: string; allergens: string[] };
type CostResult = { totalCost: number; costPerPortion: number; currency: string };
const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function HotelReceitas() {
  const { user, token, isEffectiveAdmin } = useAuth();
  const tenantId = user?.tenantId;
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [title, setTitle] = useState("");
  const [portions, setPortions] = useState(10);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    { productId: "", quantityGross: 1, quantityUnit: "kg", yieldFactor: 1 },
  ]);
  const [costs, setCosts] = useState<Record<string, CostResult>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/hotelaria` : "";

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error ?? `Erro HTTP ${res.status}`);
    return payload as T;
  }

  async function load() {
    if (!tenantId || !token) return;
    try { setRecipes(await request<Recipe[]>("/receitas")); }
    catch (e) { setMessage(String(e)); }
  }

  useEffect(() => {
    if (!tenantId || !token) return;
    void load();
    const controller = new AbortController();
    fetch(`/api/tenants/${encodeURIComponent(tenantId)}/produtos-catalogo`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async res => {
      if (!res.ok) throw new Error(`Falha ao carregar catálogo: HTTP ${res.status}`);
      return res.json() as Promise<CatalogProduct[]>;
    }).then(data => setProducts(data)).catch(err => {
      if (!controller.signal.aborted) setMessage(String(err));
    });
    return () => controller.abort();
  }, [tenantId, token]);

  async function create() {
    if (!title.trim() || ingredients.some(i => !i.productId || i.quantityGross <= 0 || i.yieldFactor <= 0 || i.yieldFactor > 1)) { setMessage("Informe nome e ingredientes válidos."); return; }\n    if (new Set(ingredients.map(i => i.productId)).size !== ingredients.length) { setMessage("Um mesmo produto só pode aparecer uma vez na receita."); return; }
    setBusy(true); setMessage("");
    try {
      await request("/receitas", { method: "POST", body: JSON.stringify({
        title, portions, ingredients,
      }) });
      setTitle(""); setIngredients([{ productId: "", quantityGross: 1, quantityUnit: "kg", yieldFactor: 1 }]); await load();
      setMessage("Ficha técnica salva como rascunho.");
    } catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }

  async function showCost(id: string) {
    setBusy(true); setMessage("");
    try { setCosts(p => ({ ...p, [id]: undefined as unknown as CostResult })); const result = await request<CostResult>(`/receitas/${id}/custo`); setCosts(p => ({ ...p, [id]: result })); }
    catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }

  async function approve(id: string) {
    setBusy(true); setMessage("");
    try { await request(`/receitas/${id}/aprovar`, { method: "POST" }); await load(); setMessage("Ficha aprovada."); }
    catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
    <div><a href="/estoque" className="text-sm text-blue-700 hover:underline">← Voltar ao estoque</a>
      <h1 className="mt-2 text-2xl font-semibold">Hotelaria · Fichas técnicas</h1>
      <p className="text-sm text-muted-foreground">Receitas e custo por porção, separados por estabelecimento.</p></div>
    {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
    {isEffectiveAdmin && <Card><CardHeader><CardTitle>Nova ficha técnica</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Nome da receita<Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Arroz branco" /></label>
      <label className="text-sm">Porções<Input type="number" min={1} value={portions} onChange={e => setPortions(Number(e.target.value))} /></label>
      <div className="sm:col-span-2 space-y-3">
        <p className="text-sm font-medium">Ingredientes do catálogo</p>
        {ingredients.map((ingredient, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
          <label className="text-sm sm:col-span-2">Produto
            <select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={ingredient.productId}
              onChange={e => setIngredients(prev => prev.map((v,i) => i === index ? {...v, productId: e.target.value} : v))}>
              <option value="">Selecione um produto</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.nome}{p.sku ? ` · ${p.sku}` : ""}</option>)}
            </select>
          </label>
          <label className="text-sm">Quantidade bruta<Input type="number" min={0.0001} step="any" value={ingredient.quantityGross}
            onChange={e => setIngredients(prev => prev.map((v,i) => i === index ? {...v, quantityGross: Number(e.target.value)} : v))} /></label>
          <label className="text-sm">Unidade
            <select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={ingredient.quantityUnit}
              onChange={e => setIngredients(prev => prev.map((v,i) => i === index ? {...v, quantityUnit: e.target.value as IngredientDraft["quantityUnit"]} : v))}>
              {["kg","g","l","ml","un"].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="text-sm">Aproveitamento (0 a 1)<Input type="number" min={0.000001} max={1} step="any" value={ingredient.yieldFactor}
            onChange={e => setIngredients(prev => prev.map((v,i) => i === index ? {...v, yieldFactor: Number(e.target.value)} : v))} /></label>
          <div className="flex items-end"><Button type="button" variant="outline" disabled={ingredients.length === 1}
            onClick={() => setIngredients(prev => prev.filter((_,i) => i !== index))}>Remover</Button></div>
        </div>)}
        <Button type="button" variant="outline" disabled={ingredients.length >= 100}
          onClick={() => setIngredients(prev => [...prev, {productId:"", quantityGross:1, quantityUnit:"kg", yieldFactor:1}])}>Adicionar ingrediente</Button>
      </div>
      <div className="sm:col-span-2"><Button onClick={() => void create()} disabled={busy || !tenantId}>Salvar rascunho</Button></div>
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Receitas cadastradas</CardTitle></CardHeader><CardContent className="space-y-3">
      {!recipes.length && <p className="text-sm text-muted-foreground">Nenhuma receita cadastrada.</p>}
      {recipes.map(recipe => <div key={recipe.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div><p className="font-medium">{recipe.title}</p><p className="text-sm text-muted-foreground">{recipe.yield_quantity} {recipe.yield_unit} · {recipe.status}</p>
          {costs[recipe.id] && <p className="text-sm">Custo total: {formatMoney(costs[recipe.id].totalCost)} · Por porção: {formatMoney(costs[recipe.id].costPerPortion)}</p>}</div>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void showCost(recipe.id)}>Calcular custo</Button>
          {isEffectiveAdmin && recipe.status === "draft" && <Button size="sm" disabled={busy} onClick={() => void approve(recipe.id)}>Aprovar</Button>}</div>
      </div>)}
    </CardContent></Card>
  </main>;
}
