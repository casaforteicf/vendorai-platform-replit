import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Recipe = { id: string; title: string; status: string; yield_quantity: string; yield_unit: string; allergens: string[] };
type CostResult = { totalCost: number; costPerPortion: number; currency: string };
const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function HotelReceitas() {
  const { user, token, isEffectiveAdmin } = useAuth();
  const tenantId = user?.tenantId;
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [title, setTitle] = useState("");
  const [portions, setPortions] = useState(10);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<"kg" | "g" | "l" | "ml" | "un">("kg");
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

  useEffect(() => { void load(); }, [tenantId, token]);

  async function create() {
    if (!title.trim() || !productId.trim()) { setMessage("Informe o nome e o ID de um ingrediente do catálogo."); return; }
    setBusy(true); setMessage("");
    try {
      await request("/receitas", { method: "POST", body: JSON.stringify({
        title, portions, ingredients: [{ productId: productId.trim(), quantityGross: quantity, quantityUnit: unit, yieldFactor: 1 }],
      }) });
      setTitle(""); setProductId(""); await load();
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
      <label className="text-sm sm:col-span-2">ID do ingrediente no catálogo<Input value={productId} onChange={e => setProductId(e.target.value)} placeholder="UUID do produto já cadastrado" /></label>
      <label className="text-sm">Quantidade bruta<Input type="number" min={0.001} step="any" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
      <label className="text-sm">Unidade<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3" value={unit} onChange={e => setUnit(e.target.value as typeof unit)}>{["kg","g","l","ml","un"].map(u => <option key={u}>{u}</option>)}</select></label>
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
