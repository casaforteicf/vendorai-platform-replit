import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import HotelModulesNav from "../HotelModulesNav";
import { useAuth } from "@/contexts/AuthContext";
import {
  atualizarEquipe,
  criarEquipe,
  excluirEquipe,
  listarCargos,
  listarEquipe,
  mensagemDoErro,
  type AbAuth,
  type Cargo,
  type Equipe,
} from "@/lib/ab/client";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Formulario = {
  nome: string;
  cargoId: string;
  diasSemana: number[];
  horaInicio: string;
  intervaloInicio: string;
  intervaloFim: string;
  horaFim: string;
  ativo: boolean;
};

const VAZIO: Formulario = {
  nome: "",
  cargoId: "",
  diasSemana: [1, 2, 3, 4, 5],
  horaInicio: "08:00",
  intervaloInicio: "12:00",
  intervaloFim: "13:00",
  horaFim: "17:00",
  ativo: true,
};

export default function AbEquipe() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const auth = useMemo<AbAuth>(() => ({ token: token ?? "", tenantId }), [token, tenantId]);
  const [equipe, setEquipe] = useState<Equipe[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    try {
      const [pessoas, listaCargos] = await Promise.all([listarEquipe(auth), listarCargos(auth)]);
      setEquipe(pessoas);
      setCargos(listaCargos.filter((cargo) => cargo.ativo));
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }, [auth, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  function limpar() {
    setEditandoId(null);
    setForm(VAZIO);
  }

  function editar(pessoa: Equipe) {
    setEditandoId(pessoa.id);
    setForm({
      nome: pessoa.nome,
      cargoId: pessoa.cargoId ?? "",
      diasSemana: pessoa.diasSemana ?? [],
      horaInicio: pessoa.horaInicio.slice(0, 5),
      intervaloInicio: pessoa.intervaloInicio?.slice(0, 5) ?? "",
      intervaloFim: pessoa.intervaloFim?.slice(0, 5) ?? "",
      horaFim: pessoa.horaFim.slice(0, 5),
      ativo: pessoa.ativo,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar() {
    setErro(null);
    setAviso(null);
    if (!form.nome.trim()) { setErro("Informe o nome da pessoa."); return; }
    if (form.diasSemana.length === 0) { setErro("Selecione ao menos um dia de trabalho."); return; }
    if (!form.horaInicio || !form.horaFim) { setErro("Informe início e fim da jornada."); return; }
    setSalvando(true);
    try {
      const corpo = {
        nome: form.nome.trim(),
        cargoId: form.cargoId || null,
        diasSemana: form.diasSemana,
        horaInicio: form.horaInicio,
        intervaloInicio: form.intervaloInicio || null,
        intervaloFim: form.intervaloFim || null,
        horaFim: form.horaFim,
        ativo: form.ativo,
      };
      if (editandoId) await atualizarEquipe(auth, editandoId, corpo);
      else await criarEquipe(auth, corpo);
      setAviso(editandoId ? "Pessoa atualizada." : "Pessoa cadastrada.");
      limpar();
      await carregar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(pessoa: Equipe) {
    if (!window.confirm(`Excluir ${pessoa.nome} da equipe?`)) return;
    try {
      await excluirEquipe(auth, pessoa.id);
      if (editandoId === pessoa.id) limpar();
      await carregar();
      setAviso("Pessoa excluída.");
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <HotelModulesNav />
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hotelaria · A&amp;B</p>
        <h1 className="mt-1 text-2xl font-semibold">Equipe e escala</h1>
        <p className="text-sm text-muted-foreground">Jornada, intervalo e folgas por pessoa, ligados ao cargo.</p>
        <Link href="/hotelaria/restaurante/cargos" className="mt-2 inline-flex rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Voltar aos cargos</Link>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {aviso && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</div>}

      <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{editandoId ? "Editar pessoa" : "Nova pessoa"}</h2>
          <label className="block text-sm">Nome
            <input className="mt-1 w-full rounded-md border p-2" value={form.nome} onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))} />
          </label>
          <label className="block text-sm">Cargo
            <select className="mt-1 w-full rounded-md border p-2" value={form.cargoId} onChange={(event) => setForm((atual) => ({ ...atual, cargoId: event.target.value }))}>
              <option value="">Sem cargo</option>
              {cargos.map((cargo) => <option key={cargo.id} value={cargo.id}>{cargo.nome}</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm">Dias de trabalho</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {DIAS.map((dia, indice) => (
                <label key={dia} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={form.diasSemana.includes(indice)}
                    onChange={(event) => setForm((atual) => ({
                      ...atual,
                      diasSemana: event.target.checked
                        ? [...atual.diasSemana, indice].sort()
                        : atual.diasSemana.filter((valor) => valor !== indice),
                    }))}
                  />
                  {dia}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Início<input type="time" className="mt-1 w-full rounded-md border p-2" value={form.horaInicio} onChange={(event) => setForm((atual) => ({ ...atual, horaInicio: event.target.value }))} /></label>
            <label className="text-sm">Fim<input type="time" className="mt-1 w-full rounded-md border p-2" value={form.horaFim} onChange={(event) => setForm((atual) => ({ ...atual, horaFim: event.target.value }))} /></label>
            <label className="text-sm">Intervalo início<input type="time" className="mt-1 w-full rounded-md border p-2" value={form.intervaloInicio} onChange={(event) => setForm((atual) => ({ ...atual, intervaloInicio: event.target.value }))} /></label>
            <label className="text-sm">Intervalo fim<input type="time" className="mt-1 w-full rounded-md border p-2" value={form.intervaloFim} onChange={(event) => setForm((atual) => ({ ...atual, intervaloFim: event.target.value }))} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm((atual) => ({ ...atual, ativo: event.target.checked }))} /> Ativo</label>
          <div className="flex gap-2">
            <button type="button" disabled={salvando} onClick={() => void salvar()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">{salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Cadastrar"}</button>
            {editandoId && <button type="button" onClick={limpar} className="rounded-md border px-3 py-2 text-sm">Cancelar</button>}
          </div>
        </section>

        <section className="space-y-3">
          {equipe.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhuma pessoa cadastrada.</p>}
          {equipe.map((pessoa) => (
            <article key={pessoa.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{pessoa.nome} {!pessoa.ativo && <span className="text-xs text-muted-foreground">(inativo)</span>}</p>
                  <p className="text-xs text-muted-foreground">{pessoa.cargoNome ?? "Sem cargo"}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => editar(pessoa)} className="rounded-md border px-2 py-1 text-xs">Editar</button>
                  <button type="button" onClick={() => void remover(pessoa)} className="rounded-md border px-2 py-1 text-xs text-red-700">Excluir</button>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {(pessoa.diasSemana ?? []).map((dia) => DIAS[dia]).join(", ") || "Sem dias"} · {pessoa.horaInicio.slice(0, 5)}–{pessoa.horaFim.slice(0, 5)}
                {pessoa.intervaloInicio && pessoa.intervaloFim ? ` · intervalo ${pessoa.intervaloInicio.slice(0, 5)}–${pessoa.intervaloFim.slice(0, 5)}` : ""}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
