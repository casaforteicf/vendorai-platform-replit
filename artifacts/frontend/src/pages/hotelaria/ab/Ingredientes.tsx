import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { criarOrdemCompraManual } from "@/lib/ab/client";
import RestaurantModulesNav from "../RestaurantModulesNav";

type Ingrediente = {
  id: string;
  nome: string;
  unidade: string;
  precoUnitario: string | null;
  categoria: string | null;
  codigo: string | null;
  descricao: string | null;
  fornecedorPreferencial: string | null;
  marca: string | null;
  fabricante: string | null;
};

const vazio = {
  nome: "",
  unidade: "g",
  precoUnitario: "",
  categoria: "",
  codigo: "",
  descricao: "",
  fornecedorPreferencial: "",
  marca: "",
  fabricante: "",
};

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
  const [comprar, setComprar] = useState<Record<string, string>>({});
  const [gerandoCompra, setGerandoCompra] = useState(false);

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
      fornecedorPreferencial: ingrediente.fornecedorPreferencial ?? "",
      marca: ingrediente.marca ?? "",
      fabricante: ingrediente.fabricante ?? "",
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
    if (!["g", "kg", "ml", "l", "un"].includes(form.unidade)) { setErro("A unidade precisa ser g, kg, ml, L ou un."); return; }
    const preco = form.precoUnitario.trim();
    if (preco && !/^\d+(\.\d+)?$/.test(preco.replace(",", "."))) { setErro("Preço inválido."); return; }
    const entradaEmKg = form.unidade === "kg";
    const entradaEmLitro = form.unidade === "l";
    const unidadeBase = entradaEmKg ? "g" : entradaEmLitro ? "ml" : form.unidade;
    const divisor = entradaEmKg || entradaEmLitro ? 1000 : 1;
    const precoBase = preco ? (Number(preco.replace(",", ".")) / divisor).toFixed(4) : null;
    setSalvando(true);
    try {
      const body = {
        nome: form.nome.trim(),
        unidade: unidadeBase,
        precoUnitario: precoBase,
        categoria: form.categoria.trim() || null,
        codigo: form.codigo.trim() || null,
        descricao: form.descricao.trim() || null,
        fornecedorPreferencial: form.fornecedorPreferencial.trim() || null,
        marca: form.marca.trim() || null,
        fabricante: form.fabricante.trim() || null,
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

  async function gerarCompra() {
    const itens = Object.entries(comprar)
      .map(([insumoId, quantidade]) => ({ insumoId, quantidade: Number(String(quantidade).replace(",", ".")) }))
      .filter((item) => Number.isFinite(item.quantidade) && item.quantidade > 0);
    if (itens.length === 0) { setErro("Selecione ao menos um insumo e informe a quantidade."); return; }
    const fornecedor = window.prompt("Fornecedor da compra (opcional):")?.trim() || null;
    const entrega = window.prompt("Data prevista de entrega (AAAA-MM-DD, opcional):")?.trim() || null;
    setGerandoCompra(true);
    setErro(null);
    try {
      const ordem = await criarOrdemCompraManual(auth, {
        fornecedor,
        dataEntregaPrevista: entrega && /^\d{4}-\d{2}-\d{2}$/.test(entrega) ? entrega : null,
        itens,
      });
      setAviso(`Ordem de compra criada com ${ordem.itens.length} item(ns). Abra Compras para aprovar.`);
      setComprar({});
      window.location.href = "/hotelaria/restaurante/compras";
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setGerandoCompra(false);
    }
  }

  function exportarCsv() {
    const cabecalho = ["nome", "unidade", "preco_medio", "fornecedor", "categoria", "codigo", "descricao"];
    const linhas = ingredientes.map((item) => [
      item.nome,
      item.unidade,
      item.precoUnitario ?? "",
      item.fornecedorPreferencial ?? "",
      item.categoria ?? "",
      item.codigo ?? "",
      item.descricao ?? "",
    ]);
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `insumos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
        <div className="flex flex-wrap gap-2">
          <Link href="/hotelaria/restaurante/importar?tipo=ingredientes" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Importar ingredientes</Link>
          <button type="button" onClick={exportarCsv} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> Exportar tabela
          </button>
        </div>
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
              <option value="kg">kg (quilograma)</option>
              <option value="ml">ml (mililitro)</option>
              <option value="l">L (litro)</option>
              <option value="un">un (unidade)</option>
            </select>
          </label>
          <label className="block text-sm">
            {form.unidade === "kg" ? "Preço médio por kg (R$)" : form.unidade === "l" ? "Preço médio por litro (R$)" : "Preço médio por unidade base (R$)"}
            <input type="number" min="0" step=".01" className="mt-1 w-full rounded-md border p-2" value={form.precoUnitario} onChange={(event) => setForm((current) => ({ ...current, precoUnitario: event.target.value }))} />
            <span className="mt-1 block text-xs text-muted-foreground">
              Preço médio pago ao fornecedor, usado no custo das fichas.
              {(form.unidade === "kg" || form.unidade === "l") && ` Será convertido para ${form.unidade === "kg" ? "g" : "ml"} (÷ 1.000).`}
            </span>
          </label>
          <label className="block text-sm">Fornecedor preferencial
            <input className="mt-1 w-full rounded-md border p-2" placeholder="Ex.: Distribuidora Central" value={form.fornecedorPreferencial} onChange={(event) => setForm((current) => ({ ...current, fornecedorPreferencial: event.target.value }))} />
          </label>
          <label className="block text-sm">Categoria<input className="mt-1 w-full rounded-md border p-2" value={form.categoria} onChange={(event) => setForm((current) => ({ ...current, categoria: event.target.value }))} /></label>
          <label className="block text-sm">Código<input className="mt-1 w-full rounded-md border p-2" value={form.codigo} onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">Marca<input className="mt-1 w-full rounded-md border p-2" value={form.marca} onChange={(event) => setForm((current) => ({ ...current, marca: event.target.value }))} /></label>
            <label className="block text-sm">Fabricante<input className="mt-1 w-full rounded-md border p-2" value={form.fabricante} onChange={(event) => setForm((current) => ({ ...current, fabricante: event.target.value }))} /></label>
          </div>
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
            <button type="button" disabled={gerandoCompra} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => void gerarCompra()}>
              {gerandoCompra ? "Gerando..." : `Gerar compra (${Object.keys(comprar).length})`}
            </button>
            <span className="text-xs text-muted-foreground">{ingredientes.length} item(ns)</span>
          </div>

          {carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!carregando && ingredientes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ingrediente cadastrado.</p>}
          <div className="max-h-[560px] space-y-2 overflow-auto">
            {ingredientes.map((ingrediente) => (
              <div key={ingrediente.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ingrediente.id in comprar}
                    onChange={(event) => setComprar((atual) => {
                      if (!event.target.checked) {
                        const copia = { ...atual };
                        delete copia[ingrediente.id];
                        return copia;
                      }
                      return { ...atual, [ingrediente.id]: "1" };
                    })}
                  />
                  {ingrediente.id in comprar && (
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      className="w-24 rounded-md border p-1 text-xs"
                      value={comprar[ingrediente.id]}
                      onChange={(event) => setComprar((atual) => ({ ...atual, [ingrediente.id]: event.target.value }))}
                      aria-label={`Quantidade de ${ingrediente.nome}`}
                    />
                  )}
                  <div>
                  <strong>{ingrediente.nome}</strong>
                  <p className="text-xs text-muted-foreground">
                    {ingrediente.unidade} · {ingrediente.precoUnitario ? `R$ ${ingrediente.precoUnitario}` : "sem preço"}{ingrediente.categoria ? ` · ${ingrediente.categoria}` : ""}{ingrediente.codigo ? ` · ${ingrediente.codigo}` : ""}
                  </p>
                  {(ingrediente.fornecedorPreferencial || ingrediente.marca || ingrediente.fabricante) && (
                    <p className="text-xs text-muted-foreground">
                      {[ingrediente.fornecedorPreferencial, ingrediente.marca, ingrediente.fabricante].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  </div>
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
