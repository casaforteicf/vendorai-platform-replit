import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, FileUp, Plus, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import RestaurantModulesNav from "../RestaurantModulesNav";

type Tipo = "receitas" | "cardapios" | "ingredientes" | "briffing";
type Insumo = { nome: string; unidade: "g" | "ml" | "un"; quantidadePorPorcao: number; fatorCorrecao: number };
type Receita = { nome: string; rendimentoPorcoes: number; insumos: Insumo[] };
type ItemCardapio = { receitaNome: string; porcoesPorPax: number };
type Cardapio = { nome: string; data: string; servico: "cafe_manha" | "almoco" | "jantar" | "outro"; itens: ItemCardapio[] };
type Ingrediente = { nome: string; unidade: "g" | "ml" | "un"; precoUnitario: string | null; categoria: string | null };
type Previsao = { data: string; servico: "cafe_manha" | "almoco" | "jantar" | "outro"; ocupacao: number; evento: string | null; observacoes: string | null };

const SERVICOS = [
  { value: "cafe_manha", label: "Café da manhã" },
  { value: "almoco", label: "Almoço" },
  { value: "jantar", label: "Jantar" },
  { value: "outro", label: "Outro" },
] as const;

const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const MODELOS: Record<Tipo, { nome: string; csv: string }> = {
  receitas: {
    nome: "modelo-receitas.csv",
    csv: "receita;rendimento;ingrediente;quantidade;unidade;fator_correcao\nArroz branco;10;Arroz;100;g;1\nArroz branco;10;Sal;2;g;1\n",
  },
  cardapios: {
    nome: "modelo-cardapios.csv",
    csv: "cardapio;data;servico;receita;porcoes_por_pax\nAlmoço executivo;2026-11-25;almoco;Arroz branco;0.5\n",
  },
  ingredientes: {
    nome: "modelo-ingredientes.csv",
    csv: "nome;unidade;preco;categoria\nArroz;g;0.005;grãos\n",
  },
  briffing: {
    nome: "modelo-briffing.csv",
    csv: "data;servico;ocupacao;evento;observacoes\n25/11/2026;almoco;150;Almoço executivo;Grupo de 150\n",
  },
};

export default function Importar() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const base = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/restaurante/importacoes` : "";
  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ""}` }), [token]);

  const [tipo, setTipo] = useState<Tipo>("receitas");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [formato, setFormato] = useState("");
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [cardapios, setCardapios] = useState<Cardapio[]>([]);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [briffing, setBriffing] = useState<Previsao[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function limpar() {
    setReceitas([]);
    setCardapios([]);
    setIngredientes([]);
    setBriffing([]);
    setAvisos([]);
    setErro(null);
    setAviso(null);
    setFormato("");
  }

  async function lerArquivo() {
    if (!arquivo) { setErro("Selecione um arquivo."); return; }
    limpar();
    setLendo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        reader.readAsDataURL(arquivo);
      });
      const resposta = await fetch(`${base}/preview`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, filename: arquivo.name, base64 }),
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(payload?.error ?? "Falha ao interpretar o arquivo.");
      setFormato(payload.formato ?? "");
      setAvisos(payload.avisos ?? []);
      if (tipo === "receitas") setReceitas(payload.itens ?? []);
      if (tipo === "cardapios") setCardapios(payload.itens ?? []);
      if (tipo === "ingredientes") setIngredientes(payload.itens ?? []);
      if (tipo === "briffing") setBriffing(payload.itens ?? []);
      setAviso(`${(payload.itens ?? []).length} item(ns) reconhecido(s). Revise e edite antes de confirmar.`);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    setErro(null);
    setAviso(null);
    const itens = tipo === "receitas" ? receitas : tipo === "cardapios" ? cardapios : tipo === "ingredientes" ? ingredientes : briffing;
    if (itens.length === 0) { setErro("Nada para importar."); return; }
    setSalvando(true);
    try {
      const resposta = await fetch(`${base}/confirmar`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, itens }),
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(payload?.error ?? "Falha ao confirmar.");
      setAviso(`Importação concluída: ${payload.criados ?? 0} criado(s), ${payload.atualizados ?? 0} atualizado(s)${payload.erros?.length ? `, ${payload.erros.length} erro(s)` : ""}.`);
      setErro(payload.erros?.length ? payload.erros.join(" | ") : null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setSalvando(false);
    }
  }

  function baixarModelo() {
    const modelo = MODELOS[tipo];
    const blob = new Blob([modelo.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = modelo.nome;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function alterarReceita(index: number, patch: Partial<Receita>) {
    setReceitas((lista) => lista.map((receita, i) => i === index ? { ...receita, ...patch } : receita));
  }
  function alterarInsumo(ri: number, ii: number, patch: Partial<Insumo>) {
    setReceitas((lista) => lista.map((receita, i) => i !== ri ? receita : {
      ...receita,
      insumos: receita.insumos.map((insumo, j) => j === ii ? { ...insumo, ...patch } : insumo),
    }));
  }
  function alterarCardapio(index: number, patch: Partial<Cardapio>) {
    setCardapios((lista) => lista.map((cardapio, i) => i === index ? { ...cardapio, ...patch } : cardapio));
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <RestaurantModulesNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Restaurante</p>
          <h1 className="mt-1 text-2xl font-semibold">Importar receitas, ingredientes e cardápios</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Aceita CSV/TSV, TXT, JSON, PDF e DOCX. O sistema mostra um preview editável; nada é gravado
            até você clicar em Confirmar importação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={baixarModelo} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> Modelo CSV
          </button>
          <Link href="/hotelaria/restaurante" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Voltar ao Restaurante</Link>
        </div>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}
      {avisos.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Avisos:</strong> {avisos.join(" · ")}</div>}

      <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <label className="text-sm">Tipo
          <select className="mt-1 block rounded-md border p-2" value={tipo} onChange={(event) => { setTipo(event.target.value as Tipo); limpar(); setArquivo(null); }}>
            <option value="receitas">Receitas</option>
            <option value="cardapios">Cardápios</option>
            <option value="ingredientes">Ingredientes</option>
            <option value="briffing">Briffing / ocupação</option>
          </select>
        </label>
        <label className="text-sm">Arquivo
          <input type="file" accept=".csv,.tsv,.txt,.json,.pdf,.docx" className="mt-1 block rounded-md border p-1.5 text-sm" onChange={(event) => { setArquivo(event.target.files?.[0] ?? null); limpar(); }} />
        </label>
        <button type="button" disabled={lendo || !arquivo} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm" onClick={() => void lerArquivo()}>
          <FileUp className="h-4 w-4" /> {lendo ? "Interpretando..." : "Gerar preview"}
        </button>
        {formato && <span className="text-xs text-muted-foreground">Formato detectado: {formato.toUpperCase()}</span>}
      </section>

      {tipo === "ingredientes" && ingredientes.length > 0 && (
        <section className="space-y-2 rounded-xl border p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Ingredientes ({ingredientes.length})</h2>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setIngredientes((lista) => [...lista, { nome: "", unidade: "g", precoUnitario: null, categoria: null }])}><Plus className="mr-1 inline h-3 w-3" />Adicionar</button>
          </div>
          {ingredientes.map((ingrediente, index) => (
            <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_100px_130px_1fr_40px]">
              <input className="rounded border p-2 text-sm" placeholder="Nome" value={ingrediente.nome} onChange={(event) => setIngredientes((lista) => lista.map((item, i) => i === index ? { ...item, nome: event.target.value } : item))} />
              <select className="rounded border p-2 text-sm" value={ingrediente.unidade} onChange={(event) => setIngredientes((lista) => lista.map((item, i) => i === index ? { ...item, unidade: event.target.value as Ingrediente["unidade"] } : item))}>
                <option value="g">g</option><option value="ml">ml</option><option value="un">un</option>
              </select>
              <input className="rounded border p-2 text-sm" placeholder="Preço" value={ingrediente.precoUnitario ?? ""} onChange={(event) => setIngredientes((lista) => lista.map((item, i) => i === index ? { ...item, precoUnitario: event.target.value || null } : item))} />
              <input className="rounded border p-2 text-sm" placeholder="Categoria" value={ingrediente.categoria ?? ""} onChange={(event) => setIngredientes((lista) => lista.map((item, i) => i === index ? { ...item, categoria: event.target.value || null } : item))} />
              <button type="button" className="rounded border p-2" onClick={() => setIngredientes((lista) => lista.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </section>
      )}

      {tipo === "receitas" && receitas.length > 0 && (
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Receitas ({receitas.length})</h2>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setReceitas((lista) => [...lista, { nome: "", rendimentoPorcoes: 1, insumos: [{ nome: "", unidade: "g", quantidadePorPorcao: 1, fatorCorrecao: 1 }] }])}><Plus className="mr-1 inline h-3 w-3" />Adicionar</button>
          </div>
          {receitas.map((receita, ri) => (
            <article key={ri} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_40px]">
                <input className="rounded border p-2 text-sm" placeholder="Nome da receita" value={receita.nome} onChange={(event) => alterarReceita(ri, { nome: event.target.value })} />
                <input type="number" min="0.001" step="any" className="rounded border p-2 text-sm" placeholder="Rendimento" value={receita.rendimentoPorcoes} onChange={(event) => alterarReceita(ri, { rendimentoPorcoes: Number(event.target.value) })} />
                <button type="button" className="rounded border p-2" onClick={() => setReceitas((lista) => lista.filter((_, i) => i !== ri))}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1">
                {receita.insumos.map((insumo, ii) => (
                  <div key={ii} className="grid gap-2 sm:grid-cols-[2fr_100px_100px_100px_40px]">
                    <input className="rounded border p-2 text-sm" placeholder="Ingrediente" value={insumo.nome} onChange={(event) => alterarInsumo(ri, ii, { nome: event.target.value })} />
                    <input type="number" min="0.001" step="any" className="rounded border p-2 text-sm" placeholder="Qtd" value={insumo.quantidadePorPorcao} onChange={(event) => alterarInsumo(ri, ii, { quantidadePorPorcao: Number(event.target.value) })} />
                    <select className="rounded border p-2 text-sm" value={insumo.unidade} onChange={(event) => alterarInsumo(ri, ii, { unidade: event.target.value as Insumo["unidade"] })}><option value="g">g</option><option value="ml">ml</option><option value="un">un</option></select>
                    <input type="number" min="0.001" step="any" className="rounded border p-2 text-sm" placeholder="FC" value={insumo.fatorCorrecao} onChange={(event) => alterarInsumo(ri, ii, { fatorCorrecao: Number(event.target.value) })} />
                    <button type="button" className="rounded border p-2" onClick={() => setReceitas((lista) => lista.map((item, i) => i !== ri ? item : { ...item, insumos: item.insumos.filter((_, j) => j !== ii) }))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setReceitas((lista) => lista.map((item, i) => i !== ri ? item : { ...item, insumos: [...item.insumos, { nome: "", unidade: "g", quantidadePorPorcao: 1, fatorCorrecao: 1 }] }))}><Plus className="mr-1 inline h-3 w-3" />Insumo</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tipo === "cardapios" && cardapios.length > 0 && (
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Cardápios ({cardapios.length})</h2>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setCardapios((lista) => [...lista, { nome: "", data: hoje(), servico: "almoco", itens: [{ receitaNome: "", porcoesPorPax: 1 }] }])}><Plus className="mr-1 inline h-3 w-3" />Adicionar</button>
          </div>
          {cardapios.map((cardapio, ci) => (
            <article key={ci} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px_40px]">
                <input className="rounded border p-2 text-sm" placeholder="Nome do cardápio" value={cardapio.nome} onChange={(event) => alterarCardapio(ci, { nome: event.target.value })} />
                <input type="date" className="rounded border p-2 text-sm" value={cardapio.data} onChange={(event) => alterarCardapio(ci, { data: event.target.value })} />
                <select className="rounded border p-2 text-sm" value={cardapio.servico} onChange={(event) => alterarCardapio(ci, { servico: event.target.value as Cardapio["servico"] })}>{SERVICOS.map((servico) => <option key={servico.value} value={servico.value}>{servico.label}</option>)}</select>
                <button type="button" className="rounded border p-2" onClick={() => setCardapios((lista) => lista.filter((_, i) => i !== ci))}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1">
                {cardapio.itens.map((item, ii) => (
                  <div key={ii} className="grid gap-2 sm:grid-cols-[1fr_120px_40px]">
                    <input className="rounded border p-2 text-sm" placeholder="Receita" value={item.receitaNome} onChange={(event) => alterarCardapio(ci, { itens: cardapio.itens.map((current, j) => j === ii ? { ...current, receitaNome: event.target.value } : current) })} />
                    <input type="number" min="0.001" step="any" className="rounded border p-2 text-sm" placeholder="Porções/pax" value={item.porcoesPorPax} onChange={(event) => alterarCardapio(ci, { itens: cardapio.itens.map((current, j) => j === ii ? { ...current, porcoesPorPax: Number(event.target.value) } : current) })} />
                    <button type="button" className="rounded border p-2" onClick={() => alterarCardapio(ci, { itens: cardapio.itens.filter((_, j) => j !== ii) })}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => alterarCardapio(ci, { itens: [...cardapio.itens, { receitaNome: "", porcoesPorPax: 1 }] })}><Plus className="mr-1 inline h-3 w-3" />Item</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tipo === "briffing" && briffing.length > 0 && (
        <section className="space-y-2 rounded-xl border p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Briffing / ocupação ({briffing.length})</h2>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setBriffing((lista) => [...lista, { data: hoje(), servico: "almoco", ocupacao: 150, evento: null, observacoes: null }])}><Plus className="mr-1 inline h-3 w-3" />Adicionar</button>
          </div>
          {briffing.map((previsao, index) => (
            <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[140px_150px_110px_1fr_1fr_40px]">
              <input type="date" className="rounded border p-2 text-sm" value={previsao.data} onChange={(event) => setBriffing((lista) => lista.map((item, i) => i === index ? { ...item, data: event.target.value } : item))} />
              <select className="rounded border p-2 text-sm" value={previsao.servico} onChange={(event) => setBriffing((lista) => lista.map((item, i) => i === index ? { ...item, servico: event.target.value as Previsao["servico"] } : item))}>
                {SERVICOS.map((servico) => <option key={servico.value} value={servico.value}>{servico.label}</option>)}
              </select>
              <input type="number" min="0" step="1" className="rounded border p-2 text-sm" placeholder="Ocupação/pax" value={previsao.ocupacao} onChange={(event) => setBriffing((lista) => lista.map((item, i) => i === index ? { ...item, ocupacao: Number(event.target.value) } : item))} />
              <input className="rounded border p-2 text-sm" placeholder="Evento" value={previsao.evento ?? ""} onChange={(event) => setBriffing((lista) => lista.map((item, i) => i === index ? { ...item, evento: event.target.value || null } : item))} />
              <input className="rounded border p-2 text-sm" placeholder="Observações" value={previsao.observacoes ?? ""} onChange={(event) => setBriffing((lista) => lista.map((item, i) => i === index ? { ...item, observacoes: event.target.value || null } : item))} />
              <button type="button" className="rounded border p-2" onClick={() => setBriffing((lista) => lista.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </section>
      )}

      {(receitas.length > 0 || cardapios.length > 0 || ingredientes.length > 0 || briffing.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={salvando} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" onClick={() => void confirmar()}>
            <Upload className="h-4 w-4" /> {salvando ? "Importando..." : "Confirmar importação"}
          </button>
          <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={limpar}>Descartar preview</button>
        </div>
      )}
    </main>
  );
}
