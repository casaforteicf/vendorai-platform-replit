import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import HotelSectorNav from "./HotelSectorNav";
import {
  GRUPOS,
  JANELAS,
  contar,
  cobertura,
  custoExtras,
  diaSemana,
  estadoInicial,
  fmtHoras,
  gerarEscala,
  gerarMetas,
  minutosTrabalho,
  normalizarEstado,
  paraCsv,
  rotuloDia,
  tipoTarifa,
  trocarPeriodo,
  validar,
  valorTarifa,
  type EscalaState,
} from "@/lib/escala-ab";
import { lerPlanilhaEscala } from "@/lib/escala-xlsx";

const ABAS = ["Escala", "Ocupação e metas", "Colaboradores", "Extras", "Cobertura", "Validação"] as const;
type Aba = (typeof ABAS)[number];
const ouro = "border-[#e9b900] bg-[#edbd16] text-[#171717]";
const card = "rounded-xl border border-[#d8c88d]/50 bg-[#111] p-4";

function inicioDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function rotuloPeriodo(inicio: string): string {
  return new Date(`${inicio}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function HotelEscalas() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [estado, setEstado] = useState<EscalaState>(() => estadoInicial(inicioDoMes()));
  const [aba, setAba] = useState<Aba>("Escala");
  const [diaCobertura, setDiaCobertura] = useState(0);
  const [semana, setSemana] = useState(0);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState<number | null>(null);
  const [historico, setHistorico] = useState<Array<{ id: string; version: number; createdAt: string; inicio?: string | null }>>([]);
  const inputImport = useRef<HTMLInputElement>(null);
  const base = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/escalas` : "";

  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" }), [token]);

  const carregar = useCallback(async () => {
    if (!tenantId || !token) return;
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(base, { headers, cache: "no-store" });
      const body = await resposta.json();
      if (!resposta.ok) throw new Error(body?.error ?? "Falha ao carregar a escala");
      if (body.config?.state) {
        setEstado(normalizarEstado(body.config.state, inicioDoMes()));
        setVersao(body.config.version ?? null);
      } else {
        setEstado(estadoInicial(inicioDoMes()));
        setVersao(null);
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setCarregando(false);
    }
  }, [base, headers, tenantId, token]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (detalhe === null) return;
    const fechar = (evento: KeyboardEvent) => { if (evento.key === "Escape") setDetalhe(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [detalhe]);

  function mudarPeriodo(valor: string) {
    if (!/^\d{4}-\d{2}$/.test(valor)) return;
    const novoInicio = `${valor}-01`;
    if (novoInicio === estado.start) return;
    const rotulo = rotuloPeriodo(novoInicio);
    if (!window.confirm(`Mudar o período para ${rotulo}? A ocupação e as metas serão zeradas; equipe, horários, folgas, tarifas e pares são mantidos. Salve para gravar como nova versão.`)) return;
    setEstado((atual) => trocarPeriodo(atual, novoInicio));
    setMensagem(`Período alterado para ${rotulo}. Revise folgas e metas e salve para gravar.`);
    setErro(null);
  }

  function atualizar(alteracao: (copia: EscalaState) => void) {
    setEstado((atual) => {
      const copia = JSON.parse(JSON.stringify(atual)) as EscalaState;
      alteracao(copia);
      return copia;
    });
  }

  async function salvar() {
    if (!tenantId || !token) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const resposta = await fetch(base, { method: "PUT", headers, body: JSON.stringify({ nome: "Escala A&B", state: estado }) });
      const body = await resposta.json();
      if (!resposta.ok) throw new Error(body?.error ?? "Falha ao salvar");
      setVersao(body.config?.version ?? null);
      setMensagem(`Escala salva na versão ${body.config?.version ?? "?"}.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setSalvando(false);
    }
  }

  async function carregarHistorico() {
    if (!base) return;
    const resposta = await fetch(`${base}/historico`, { headers, cache: "no-store" });
    const body = await resposta.json();
    if (resposta.ok) setHistorico(body.versoes ?? []);
  }

  async function restaurar(id: string) {
    if (!window.confirm("Restaurar esta versão como uma nova versão da escala?")) return;
    const resposta = await fetch(`${base}/historico/${encodeURIComponent(id)}/restaurar`, { method: "POST", headers });
    const body = await resposta.json();
    if (!resposta.ok) { setErro(body?.error ?? "Falha ao restaurar"); return; }
    if (body.config?.state) setEstado(normalizarEstado(body.config.state, estado.start));
    setVersao(body.config?.version ?? null);
    setMensagem("Versão restaurada.");
  }

  function exportarJson() {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "escala-ab-backup.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarCsv() {
    const blob = new Blob([paraCsv(estado)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "escala-ab.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importar(arquivo: File) {
    try {
      const bruto = JSON.parse(await arquivo.text());
      const normalizado = normalizarEstado(bruto, estado.start);
      if (normalizado.staff.length > 500) throw new Error("Backup grande demais");
      setEstado(normalizado);
      setMensagem("Backup importado. Revise e salve.");
    } catch (falha) {
      setErro(`Backup inválido: ${falha instanceof Error ? falha.message : String(falha)}`);
    }
  }

  async function importarPlanilha(arquivo: File) {
    setErro(null);
    setMensagem("Lendo planilha...");
    try {
      const { estado: novo, resumo } = await lerPlanilhaEscala(await arquivo.arrayBuffer(), estado.start, estado);
      if (resumo.colaboradores === 0) throw new Error(`nenhum colaborador encontrado para ${rotuloPeriodo(estado.start)}${resumo.abasIgnoradas.length > 0 ? ` — abas ignoradas: ${resumo.abasIgnoradas.join(", ")}` : ""}`);
      const ignoradas = resumo.abasIgnoradas.length > 0 ? ` Abas ignoradas: ${resumo.abasIgnoradas.join(", ")}.` : "";
      const setores = Object.entries(resumo.setores).map(([setor, n]) => `${setor} ${n}`).join(", ");
      if (!window.confirm(`Importar ${resumo.colaboradores} colaborador(es) para ${rotuloPeriodo(estado.start)} (${setores})? A escala atual será substituída até você salvar.${ignoradas}`)) {
        setMensagem(null);
        return;
      }
      setEstado(novo);
      setMensagem(`Planilha importada: ${resumo.colaboradores} colaborador(es), ${resumo.diasComOcupacao} dias de ocupação. Revise e salve.${ignoradas}`);
    } catch (falha) {
      setMensagem(null);
      setErro(`Planilha inválida: ${falha instanceof Error ? falha.message : String(falha)}`);
    }
  }

  const semanaAtual = semana * 7;
  const diasVisiveis = estado.days.slice(semanaAtual, semanaAtual + 7);
  const staffDetalhe = detalhe === null ? null : estado.staff[detalhe] ?? null;

  const contagem = contar(estado);
  const totalExtras = contagem.reduce((a, b) => a + b.totalExtras, 0);
  const custo = custoExtras(estado);

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-4 text-[#f7f1df] sm:p-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <HotelSectorNav />
        <header className="flex flex-wrap items-center gap-5 rounded-xl border border-[#d8c88d]/50 bg-black p-5">
          <img src="/logo-full-dark.svg" alt="Vendor.ai" className="h-14 w-auto object-contain" />
          <div className="min-w-[260px] flex-1">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#d8c88d]">AJ Escala · A&amp;B</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#ffd12a]">Planejamento de equipe e folgas</h1>
            <p className="text-sm text-[#d9d2bf]">Escala 5x2, 12x36 e parcial, ocupação, metas, extras e cobertura.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-md border border-[#d8c88d] bg-[#181818] px-3 py-2 text-sm [color-scheme:dark]">
              <span className="text-xs uppercase tracking-wide text-[#b9ae91]">Período</span>
              <input
                type="month"
                aria-label="Período da escala"
                className="bg-transparent text-[#f7f1df] outline-none"
                value={estado.start.slice(0, 7)}
                onChange={(event) => mudarPeriodo(event.target.value)}
              />
            </label>
            <button type="button" className={`rounded-md border px-3 py-2 text-sm font-semibold ${ouro}`} onClick={() => { gerarMetas(estado); gerarEscala(estado); setEstado({ ...estado, days: [...estado.days], staff: [...estado.staff] }); }}>Gerar / melhorar escala</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : `Salvar${versao ? ` v${versao}` : ""}`}</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={exportarCsv}>CSV</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={exportarJson}>Backup</button>
            <button type="button" title="Importar backup JSON ou planilha XLSX" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={() => inputImport.current?.click()}>Importar</button>
            <input ref={inputImport} type="file" accept=".json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (/\.xlsx?$/i.test(file.name)) void importarPlanilha(file); else void importar(file); event.target.value = ""; }} />
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={() => void carregarHistorico()}>Histórico</button>
          </div>
        </header>

        {erro && <p role="alert" className="rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200">{erro}</p>}
        {mensagem && <p role="status" className="rounded-lg border border-[#e9b900]/50 bg-[#2a2104] p-3 text-sm text-[#ffe58a]">{mensagem}</p>}
        {carregando && <p className="text-sm text-[#d9d2bf]">Carregando escala...</p>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Colaboradores", estado.staff.length],
            ["Extras no período", totalExtras],
            ["Pico de extras/dia", Math.max(0, ...contagem.map((c) => c.totalExtras))],
            ["Custo previsto extras", custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })],
            ["Menor equipe fixa", Math.min(...contagem.map((c) => c.total))],
          ].map(([label, valor]) => (
            <div key={String(label)} className={card}>
              <p className="text-xs uppercase tracking-wide text-[#b9ae91]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#ffd12a]">{valor}</p>
            </div>
          ))}
        </section>

        <nav className="flex flex-wrap gap-2">
          {ABAS.map((item) => (
            <button key={item} type="button" onClick={() => setAba(item)} className={`rounded-md border px-3 py-2 text-sm ${aba === item ? ouro : "border-[#d8c88d]/60 text-[#f7f1df] hover:bg-[#211d10]"}`}>{item}</button>
          ))}
        </nav>

        {aba === "Escala" && (
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#ffd12a]">Escala nominal</h2>
                <p className="text-sm text-[#b9ae91]">Clique em T/F para editar e no nome para abrir o cadastro completo. 12x36 fica protegido.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-[#b9ae91]">Semana</span>
                {Array.from({ length: 5 }, (_, s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSemana(s)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${semana === s ? ouro : "border-[#d8c88d]/60 text-[#f7f1df] hover:bg-[#211d10]"}`}
                  >
                    {s + 1}
                    <span className="ml-1 text-xs opacity-80">{rotuloDia(estado, s * 7)}–{rotuloDia(estado, s * 7 + 6)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-[#d8c88d]/40">
              <table className="min-w-[1080px] w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#2a2104] text-[#f5e6a8]">
                    <th className="sticky left-0 top-0 z-30 min-w-[230px] border-b border-r border-[#d8c88d]/30 bg-[#2a2104] p-3 text-left">Colaborador</th>
                    <th className="sticky top-0 z-20 min-w-[120px] border-b border-r border-[#d8c88d]/30 bg-[#2a2104] p-3">Setor / turno</th>
                    <th className="sticky top-0 z-20 min-w-[130px] border-b border-r border-[#d8c88d]/30 bg-[#2a2104] p-3">Regime</th>
                    <th className="sticky top-0 z-20 min-w-[150px] border-b border-r border-[#d8c88d]/30 bg-[#2a2104] p-3">Horário</th>
                    {diasVisiveis.map((_, d) => {
                      const dia = semanaAtual + d;
                      return (
                        <th key={dia} className="sticky top-0 z-20 min-w-[64px] border-b border-r border-[#d8c88d]/20 bg-[#2a2104] p-2 text-center">
                          <div>{rotuloDia(estado, dia)}</div>
                          <div className="text-[10px] font-normal uppercase text-[#b9ae91]">{diaSemana(estado, dia)}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {estado.staff.map((s, i) => (
                    <tr key={`${s.name}-${i}`} className="hover:bg-[#1a1608]">
                      <td className="sticky left-0 z-10 border-b border-r border-[#d8c88d]/15 bg-[#111] p-3">
                        <button type="button" onClick={() => setDetalhe(i)} className="text-left font-medium text-[#ffd12a] hover:underline">
                          {s.name || "Sem nome"}
                        </button>
                        <div className="text-xs text-[#b9ae91]">{s.role}</div>
                      </td>
                      <td className="border-b border-r border-[#d8c88d]/15 p-3 text-center">{s.sector} {s.shift}</td>
                      <td className="border-b border-r border-[#d8c88d]/15 p-3 text-center text-xs">{s.regime}</td>
                      <td className="border-b border-r border-[#d8c88d]/15 p-3 text-center text-xs">
                        {s.start}–{s.end}
                        <br />
                        <span className="text-[#b9ae91]">{s.breakStart && s.breakEnd ? `${s.breakStart}–${s.breakEnd}` : "sem intervalo"}</span>
                      </td>
                      {diasVisiveis.map((_, d) => {
                        const dia = semanaAtual + d;
                        const v = s.schedule[dia];
                        return (
                          <td key={dia} className="border-b border-r border-[#d8c88d]/15 p-1.5 text-center">
                            <button
                              type="button"
                              title={`${s.name} · ${rotuloDia(estado, dia)}`}
                              className={`h-10 w-10 rounded-md text-sm font-semibold transition ${v === "T" ? "bg-[#d9eee6] text-[#17604a] hover:bg-emerald-200" : "bg-[#f8d365] text-[#4b3400] hover:bg-amber-300"}`}
                              onClick={() => atualizar((c) => { if (c.staff[i]!.regime !== "12x36") c.staff[i]!.schedule[dia] = v === "T" ? "F" : "T"; })}
                            >
                              {v}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {[
                    ["Pax noite", diasVisiveis.map((d) => d.pax)],
                    ["Pax manhã", diasVisiveis.map((d) => d.morning)],
                    ["Efetivos", contagem.slice(semanaAtual, semanaAtual + 7).map((c) => c.total)],
                    ["Extras", contagem.slice(semanaAtual, semanaAtual + 7).map((c) => c.totalExtras)],
                    ["Tarifa", diasVisiveis.map((_, d) => valorTarifa(estado, semanaAtual + d))],
                  ].map(([label, valores]) => (
                    <tr key={String(label)}>
                      <th colSpan={4} className="sticky left-0 z-10 border-t border-r border-[#d8c88d]/20 bg-[#151515] p-2 text-left text-xs text-[#d8c88d]">{label}</th>
                      {(valores as number[]).map((v, d) => (
                        <td key={d} className="border-t border-r border-[#d8c88d]/15 bg-[#151515] p-2 text-center text-sm">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-[#b9ae91]">T = trabalha · F = folga. Em telas menores a tabela rola na horizontal e a coluna de nomes fica fixa.</p>
          </section>
        )}

        {aba === "Ocupação e metas" && (
          <section className={card}>
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[#ffd12a]">Ocupação e metas por turno</h2><button type="button" className={`rounded border px-3 py-2 text-sm ${ouro}`} onClick={() => { gerarMetas(estado); setEstado({ ...estado, days: [...estado.days] }); }}>Recalcular metas</button></div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-[#2a2104]"><th className="border p-2">Data</th><th className="border p-2">Pax manhã</th><th className="border p-2">Pax noite</th>{GRUPOS.map((g) => <th key={g} className="border p-2">{g}</th>)}</tr></thead>
                <tbody>{estado.days.map((day, d) => <tr key={day.date}><td className="border p-2">{day.date}</td>{(["morning", "pax"] as const).map((key) => <td key={key} className="border p-1"><input type="number" min={0} className="w-20 rounded border border-[#d8c88d]/50 bg-[#181818] p-1 text-[#f7f1df]" value={day[key]} onChange={(event) => atualizar((c) => { c.days[d]![key] = Number(event.target.value) || 0; })} /></td>)}{day.targets.map((v, g) => <td key={g} className="border p-1"><input type="number" min={0} className="w-16 rounded border border-[#d8c88d]/50 bg-[#181818] p-1 text-center text-[#f7f1df]" value={v} onChange={(event) => atualizar((c) => { c.days[d]!.targets[g] = Number(event.target.value) || 0; })} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {aba === "Colaboradores" && (
          <section className={card}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold text-[#ffd12a]">Cadastro e horários</h2><button type="button" className={`rounded border px-3 py-2 text-sm ${ouro}`} onClick={() => atualizar((c) => c.staff.push({ name: "NOVO COLABORADOR", role: "Auxiliar", sector: "Salão", shift: "M", regime: "5x2 integral", start: "08:00", breakStart: "12:00", breakEnd: "13:00", end: "17:24", sunday: 1, schedule: c.days.map((_, d) => d % 7 < 5 ? "T" : "F") }))}>Adicionar</button></div>
            <div className="overflow-auto">
              <table className="w-full text-xs"><thead><tr className="bg-[#2a2104]">{["Nome", "Cargo", "Setor", "Turno", "Regime", "Entrada", "Início int.", "Fim int.", "Saída", "Horas", "Ação"].map((h) => <th key={h} className="border p-2">{h}</th>)}</tr></thead>
                <tbody>{estado.staff.map((s, i) => <tr key={`${s.name}-${i}`}>
                  <td className="border p-1"><input className="w-40 rounded border border-[#d8c88d]/50 bg-[#181818] p-1" value={s.name} onChange={(e) => atualizar((c) => { c.staff[i]!.name = e.target.value; })} /></td>
                  <td className="border p-1"><input className="w-28 rounded border border-[#d8c88d]/50 bg-[#181818] p-1" value={s.role} onChange={(e) => atualizar((c) => { c.staff[i]!.role = e.target.value; })} /></td>
                  <td className="border p-1"><select className="rounded border border-[#d8c88d]/50 bg-[#181818] p-1" value={s.sector} onChange={(e) => atualizar((c) => { c.staff[i]!.sector = e.target.value; })}>{["Cozinha", "Salão", "Confeitaria", "Quiosque"].map((v) => <option key={v}>{v}</option>)}</select></td>
                  <td className="border p-1"><select className="rounded border border-[#d8c88d]/50 bg-[#181818] p-1" value={s.shift} onChange={(e) => atualizar((c) => { c.staff[i]!.shift = e.target.value; })}>{["M", "N", "P", "E"].map((v) => <option key={v}>{v}</option>)}</select></td>
                  <td className="border p-1"><select className="rounded border border-[#d8c88d]/50 bg-[#181818] p-1" value={s.regime} onChange={(e) => atualizar((c) => { c.staff[i]!.regime = e.target.value; })}>{["5x2 integral", "5x2 parcial", "12x36"].map((v) => <option key={v}>{v}</option>)}</select></td>
                  {(["start", "breakStart", "breakEnd", "end"] as const).map((key) => <td key={key} className="border p-1"><input type="time" className="rounded border border-[#d8c88d]/50 bg-[#181818] p-1" value={s[key]} onChange={(e) => atualizar((c) => { c.staff[i]![key] = e.target.value; })} /></td>)}
                  <td className="border p-2">{fmtHoras(minutosTrabalho(s))}</td>
                  <td className="border p-1 text-center"><button type="button" className="text-red-300" onClick={() => atualizar((c) => c.staff.splice(i, 1))}>Excluir</button></td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {aba === "Extras" && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className={card}>
              <h2 className="text-lg font-semibold text-[#ffd12a]">Reforços e tarifas</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">{(['weekday', 'weekend', 'holiday'] as const).map((key) => <label key={key} className="text-xs">{key === "weekday" ? "Dia útil" : key === "weekend" ? "Fim de semana" : "Feriado"} (R$)<input type="number" className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={estado.rates[key]} onChange={(e) => atualizar((c) => { c.rates[key] = Number(e.target.value) || 0; })} /></label>)}</div>
              <div className="mt-3 overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#2a2104]"><th className="border p-2">Data</th><th className="border p-2">Setor</th><th className="border p-2">Meta</th><th className="border p-2">Fixos</th><th className="border p-2">Extras</th><th className="border p-2">Janela</th></tr></thead><tbody>{contagem.map((c, d) => c.extras.map((n, g) => n > 0 ? <tr key={`${d}-${g}`}><td className="border p-2">{rotuloDia(estado, d)}</td><td className="border p-2">{GRUPOS[g]}</td><td className="border p-2">{estado.days[d]!.targets[g]}</td><td className="border p-2">{c.ativos[g]}</td><td className="border p-2 font-semibold text-[#ffd12a]">{n}</td><td className="border p-2">{JANELAS[g]}</td></tr> : null))}</tbody></table></div>
            </div>
            <div className={card}>
              <h2 className="text-lg font-semibold text-[#ffd12a]">Banco de extras</h2>
              <button type="button" className={`mt-2 rounded border px-3 py-2 text-sm ${ouro}`} onClick={() => atualizar((c) => c.extraPeople.push({ name: "", phone: "", role: "", group: 2, days: [0, 1, 2, 3, 4, 5, 6], notes: "" }))}>Adicionar contato</button>
              <div className="mt-3 space-y-2">{estado.extraPeople.map((e, i) => <div key={i} className="grid gap-2 rounded border border-[#d8c88d]/40 p-2 text-xs sm:grid-cols-2"><input placeholder="Nome" className="rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={e.name} onChange={(ev) => atualizar((c) => { c.extraPeople[i]!.name = ev.target.value; })} /><input placeholder="Telefone" className="rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={e.phone} onChange={(ev) => atualizar((c) => { c.extraPeople[i]!.phone = ev.target.value; })} /><input placeholder="Função" className="rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={e.role} onChange={(ev) => atualizar((c) => { c.extraPeople[i]!.role = ev.target.value; })} /><select className="rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={e.group} onChange={(ev) => atualizar((c) => { c.extraPeople[i]!.group = Number(ev.target.value); })}>{GRUPOS.map((g, j) => <option key={g} value={j}>{g}</option>)}</select><button type="button" className="text-left text-red-300" onClick={() => atualizar((c) => c.extraPeople.splice(i, 1))}>Excluir</button></div>)}</div>
            </div>
          </section>
        )}

        {aba === "Cobertura" && (
          <section className={card}>
            <h2 className="text-lg font-semibold text-[#ffd12a]">Cobertura horária</h2>
            <div className="mt-2 flex flex-wrap gap-2">{estado.days.map((_, d) => <button key={d} type="button" className={`rounded border px-2 py-1 text-xs ${diaCobertura === d ? ouro : "border-[#d8c88d]/50"}`} onClick={() => setDiaCobertura(d)}>{rotuloDia(estado, d)}</button>)}</div>
            <div className="mt-3 overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#2a2104]"><th className="border p-2">Hora</th>{["Cozinha", "Salão", "Confeitaria", "Quiosque"].map((s) => <th key={s} className="border p-2">{s}</th>)}</tr></thead><tbody>{cobertura(estado, diaCobertura).map((row) => <tr key={row.hora}><td className="border p-2">{row.hora}</td>{row.setores.map((n, i) => <td key={i} className="border p-2 text-center">{n}</td>)}</tr>)}</tbody></table></div>
          </section>
        )}

        {aba === "Validação" && (
          <section className={card}>
            <h2 className="text-lg font-semibold text-[#ffd12a]">Validação e funções críticas</h2>
            <label className="mt-2 block text-xs text-[#b9ae91]">Pares críticos (um por linha, nomes separados por vírgula)
              <textarea className="mt-1 h-24 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2 text-sm" value={estado.criticalPairs.map((p) => p.join(", ")).join("\n")} onChange={(e) => atualizar((c) => { c.criticalPairs = e.target.value.split(/\n/).map((linha) => linha.split(",").map((v) => v.trim()).filter(Boolean)).filter((p) => p.length > 0); })} />
            </label>
            <div className="mt-3 overflow-auto"><table className="w-full text-xs"><thead><tr className="bg-[#2a2104]"><th className="border p-2">Colaborador / regra</th><th className="border p-2">Alertas</th></tr></thead><tbody>{validar(estado).map((row, i) => <tr key={i}><td className="border p-2">{row.nome}</td><td className={`border p-2 ${row.alertas === "OK" ? "text-emerald-300" : "text-amber-200"}`}>{row.alertas}</td></tr>)}</tbody></table></div>
            {historico.length > 0 && <div className="mt-4"><h3 className="font-semibold text-[#ffd12a]">Histórico</h3><div className="mt-2 space-y-1 text-xs">{historico.map((v) => <div key={v.id} className="flex justify-between border-b border-[#d8c88d]/20 py-1"><span>v{v.version}{v.inicio ? ` · ${rotuloPeriodo(v.inicio)}` : ""} · {new Date(v.createdAt).toLocaleString("pt-BR")}</span><button type="button" className="text-[#ffd12a]" onClick={() => void restaurar(v.id)}>Restaurar</button></div>)}</div></div>}
          </section>
        )}

        {detalhe !== null && staffDetalhe ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Detalhes do colaborador" onClick={() => setDetalhe(null)}>
            <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-[#d8c88d] bg-[#111] p-5 shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#ffd12a]">{staffDetalhe.name || "Sem nome"}</h2>
                  <p className="text-sm text-[#b9ae91]">{staffDetalhe.role} · {staffDetalhe.sector} {staffDetalhe.shift} · {staffDetalhe.regime}</p>
                </div>
                <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-1.5 text-sm" onClick={() => setDetalhe(null)}>Fechar</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Nome<input className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={staffDetalhe.name} onChange={(e) => atualizar((c) => { c.staff[detalhe]!.name = e.target.value; })} /></label>
                <label className="text-sm">Cargo<input className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={staffDetalhe.role} onChange={(e) => atualizar((c) => { c.staff[detalhe]!.role = e.target.value; })} /></label>
                <label className="text-sm">Setor<select className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={staffDetalhe.sector} onChange={(e) => atualizar((c) => { c.staff[detalhe]!.sector = e.target.value; })}>{["Cozinha", "Salão", "Confeitaria", "Quiosque"].map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="text-sm">Turno<select className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={staffDetalhe.shift} onChange={(e) => atualizar((c) => { c.staff[detalhe]!.shift = e.target.value; })}>{["M", "N", "P", "E"].map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className="text-sm">Regime<select className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={staffDetalhe.regime} onChange={(e) => atualizar((c) => { c.staff[detalhe]!.regime = e.target.value; })}>{["5x2 integral", "5x2 parcial", "12x36"].map((v) => <option key={v}>{v}</option>)}</select></label>
                <div className="self-end text-sm text-[#b9ae91]">Jornada: <span className="font-semibold text-[#ffd12a]">{fmtHoras(minutosTrabalho(staffDetalhe))}</span></div>
                {(["start", "breakStart", "breakEnd", "end"] as const).map((key) => (
                  <label key={key} className="text-sm">{key === "start" ? "Entrada" : key === "breakStart" ? "Início do intervalo" : key === "breakEnd" ? "Fim do intervalo" : "Saída"}<input type="time" className="mt-1 w-full rounded border border-[#d8c88d]/50 bg-[#181818] p-2" value={staffDetalhe[key]} onChange={(e) => atualizar((c) => { c.staff[detalhe]![key] = e.target.value; })} /></label>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-[#d8c88d]/30 p-3">
                <p className="text-sm font-semibold text-[#ffd12a]">Semana {semana + 1} · {rotuloDia(estado, semanaAtual)}–{rotuloDia(estado, semanaAtual + 6)}</p>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {diasVisiveis.map((_, d) => {
                    const dia = semanaAtual + d;
                    const v = staffDetalhe.schedule[dia];
                    return (
                      <button key={dia} type="button" className={`rounded-md border p-2 text-sm font-semibold ${v === "T" ? "border-emerald-300/40 bg-[#d9eee6] text-[#17604a]" : "border-amber-300/40 bg-[#f8d365] text-[#4b3400]"}`} onClick={() => atualizar((c) => { if (c.staff[detalhe]!.regime !== "12x36") c.staff[detalhe]!.schedule[dia] = v === "T" ? "F" : "T"; })}>
                        <div className="text-[10px] font-normal">{rotuloDia(estado, dia)}</div>
                        {v}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-[#b9ae91]">{staffDetalhe.schedule.slice(0, 30).filter((v) => v === "T").length} dias trabalhados · {30 - staffDetalhe.schedule.slice(0, 30).filter((v) => v === "T").length} folgas no mês</p>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="rounded-xl border border-[#d8c88d]/40 p-3 text-xs text-[#b9ae91]">
          Simulação gerencial. Confirme domingos, feriados, intervalos e contratos com o RH antes de publicar a escala.
          <Link href="/hotelaria" className="ml-2 text-[#ffd12a] underline">Voltar à Hotelaria</Link>
        </footer>
      </div>
    </main>
  );
}
