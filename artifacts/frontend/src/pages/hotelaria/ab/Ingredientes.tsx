import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import RestaurantModulesNav from "../RestaurantModulesNav";

type Ingrediente = {
  id: string;
  nome: string;
  unidade: string;
  precoUnitario: string | null;
  categoria: string | null;
  codigo: string | null;
  descricao: string | null;
};

const vazio = { nome: "", unidade: "g", precoUnitario: "", categoria: "", codigo: "", descricao: "" };

export default function Ingredientes() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const base = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/restaurante/ingredientes` : "";
  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ""}` }), [token]);

  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(vazio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    try {
      const resposta = await fetch(`${base}${busca.trim() ? `?q=${encodeURIComponent(busca.trim())}` : ""}`, { headers, cache: "no-store" });
      const body = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(body?.error ?? "Falha ao carregar ingredientes.");
      setIngredientes(body.ingredientes ?? []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setCarregando(false);
    }
  }, [base, busca, headers, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  function editar(ingrediente: Ingrediente) {
    setEditandoId(ingrediente.id);
    setForm({
      nome: ingrediente.nome,
      unidade: ingrediente.unidade,
      precoUnitario: ingrediente.precoUnitario ?? "",
      categoria: ingrediente.categoria ?? "",
      codigo: ingrediente.codigo ?? "",
      descricao: ingrediente.descricao ?? "",
    });
    setErro(null);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limpar() {
    setEditandoId(null);
    setForm(vazio);
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    if (!form.nome.trim()) { setErro("Informe o nome do ingrediente."); return; }
    if (!["g", "ml", "un"].includes(form.unidade)) { setErro("A unidade base precisa ser g, ml ou un."); return; }
    const preco = form.precoUnitario.trim();
    if (preco && !/^\d+(\.\d+)?$/.test(preco.replace(",", "."))) { setErro("Preço inválido."); return; }
    setSalvando(true);
    try {
      const body = {
        nome: form.nome.trim(),
        unidade: form.unidade,
        precoUnitario: preco ? preco.replace(",", ".") : null,
        categoria: form.categoria.trim() || null,
        codigo: form.codigo.trim() || null,
        descricao: form.descricao.trim() || null,
      };
      const resposta = await fetch(editandoId ? `${base}/${encodeURIComponent(editandoId)}` : base, {
        method: editandoId ? "PUT" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(payload?.error ?? "Falha ao salvar ingrediente.");
      setAviso(editandoId ? "Ingrediente atualizado." : "Ingrediente criado.");
      limpar();
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(ingrediente: Ingrediente) {
    if (!window.confirm(`Excluir "${ingrediente.nome}"?`)) return;
    setErro(null);
    try {
      const resposta = await fetch(`${base}/${encodeURIComponent(ingrediente.id)}`, { method: "DELETE", headers });
      if (!resposta.ok) {
        const payload = await resposta.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Falha ao excluir ingrediente.");
      }
      setAviso("Ingrediente excluído.");
      if (editandoId === ingrediente.id) limpar();
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <RestaurantModulesNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Restaurante</p>
          <h1 className="mt-1 text-2xl font-semibold">Ingredientes</h1>
          <p className="text-sm text-muted-foreground">Catálogo de insumos usado pelas fichas técnicas, cardápios e compras.</p>
        </div>
        <Link href="/hotelaria/restaurante/importar" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Importar ingredientes</Link>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">{editandoId ? "Editar ingrediente" : "Novo ingrediente"}</h2>
          <label className="block text-sm">Nome<input className="mt-1 w-full rounded-md border p-2" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} /></label>
          <label className="block text-sm">Unidade base
            <select className="mt-1 w-full rounded-md border p-2" value={form.unidade} onChange={(event) => setForm((current) => ({ ...current, unidade: event.target.value }))}>
              <option value="g">g (grama)</option>
              <option value="ml">ml (mililitro)</option>
              <option value="un">un (unidade)</option>
            </select>
          </label>
          <label className="block text-sm">Preço por unidade base (R$)<input type="number" min="0" step=".01" className="mt-1 w-full rounded-md border p-2" value={form.precoUnitario} onChange={(event) => setForm((current) => ({ ...current, precoUnitario: event.target.value }))} /></label>
          <label className="block text-sm">Categoria<input className="mt-1 w-full rounded-md border p-2" value={form.categoria} onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))} /></label>
          <label className="block text-sm">Código<input className="mt-1 w-full rounded-md border p-2" value={form.codigo} onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))} /></label>
          <label className="block text-sm">Descrição<textarea rows={2} className="mt-1 w-full rounded-md border p-2" value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={salvando} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={() => void salvar()}>
              <Plus className="h-4 w-4" /> {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Cadastrar"}
            </button>
            {editandoId && <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={limpar}>Cancelar</button>}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className="w-full rounded-md border py-2 pl-8 pr-2" placeholder="Buscar ingrediente..." value={busca} onChange={(event) => setBusca(event.target.value)} />
            </div>
            <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void carregar()}>Buscar</button>
            <span className="text-xs text-muted-foreground">{ingredientes.length} item(ns)</span>
          </div>

          {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!carregando && ingredientes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ingrediente cadastrado.</p>}
          <div className="max-h-[560px] space-y-2 overflow-auto">
            {ingredientes.map((ingrediente) => (
              <div key={ingrediente.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <strong>{ingrediente.nome}</strong>
                  <p className="text-xs text-muted-foreground">
                    {ingrediente.unidade} · {ingrediente.precoUnitario ? `R$ ${ingrediente.precoUnitario}` : "sem preço"}{ingrediente.categoria ? ` · ${ingrediente.categoria}` : ""}{ingrediente.codigo ? ` · ${ingrediente.codigo}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => editar(ingrediente)}>Editar</button>
                  <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void excluir(ingrediente)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
