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
  estadoInicial,
  fmtHoras,
  gerarEscala,
  gerarMetas,
  minutosTrabalho,
  normalizarEstado,
  paraCsv,
  rotuloDia,
  tipoTarifa,
  validar,
  valorTarifa,
  type EscalaState,
} from "@/lib/escala-ab";

const ABAS = ["Escala", "Ocupação e metas", "Colaboradores", "Extras", "Cobertura", "Validação"] as const;
type Aba = (typeof ABAS)[number];
const ouro = "border-[#e9b900] bg-[#edbd16] text-[#171717]";
const card = "rounded-xl border border-[#d8c88d]/50 bg-[#111] p-4";

function inicioDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function HotelEscalas() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [estado, setEstado] = useState<EscalaState>(() => estadoInicial(inicioDoMes()));
  const [aba, setAba] = useState<Aba>("Escala");
  const [diaCobertura, setDiaCobertura] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState<number | null>(null);
  const [historico, setHistorico] = useState<Array<{ id: string; version: number; createdAt: string }>>([]);
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
            <button type="button" className={`rounded-md border px-3 py-2 text-sm font-semibold ${ouro}`} onClick={() => { gerarMetas(estado); gerarEscala(estado); setEstado({ ...estado, days: [...estado.days], staff: [...estado.staff] }); }}>Gerar / melhorar escala</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : `Salvar${versao ? ` v${versao}` : ""}`}</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={exportarCsv}>CSV</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={exportarJson}>Backup</button>
            <button type="button" className="rounded-md border border-[#d8c88d] px-3 py-2 text-sm" onClick={() => inputImport.current?.click()}>Importar</button>
            <input ref={inputImport} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importar(file); }} />
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
            <h2 className="text-lg font-semibold text-[#ffd12a]">Escala nominal</h2>
            <p className="mb-3 text-xs text-[#b9ae91]">Clique em T/F para editar. 12x36 fica protegido. Salve para versionar.</p>
            <div className="overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="bg-[#2a2104] text-[#f5e6a8]"><th className="border p-2 text-left">Colaborador</th><th className="border p-2">Setor / turno</th><th className="border p-2">Regime</th><th className="border p-2">Horário</th>{estado.days.map((_, d) => <th key={d} className="border p-1">{rotuloDia(estado, d)}</th>)}</tr></thead>
                <tbody>
                  {estado.staff.map((s, i) => (
                    <tr key={`${s.name}-${i}`}>
                      <td className="border p-2">{s.name || "Sem nome"}<br /><span className="text-[10px] text-[#b9ae91]">{s.role}</span></td>
                      <td className="border p-2">{s.sector} {s.shift}</td>
                      <td className="border p-2">{s.regime}</td>
                      <td className="border p-2">{s.start}–{s.end}<br />{s.breakStart}–{s.breakEnd}</td>
                      {s.schedule.map((v, d) => <td key={d} className="border p-0 text-center"><button type="button" className={`h-7 w-7 ${v === "T" ? "bg-[#d9eee6] text-[#17604a]" : "bg-[#f8d365] text-[#4b3400]"}`} onClick={() => atualizar((c) => { if (c.staff[i]!.regime !== "12x36") c.staff[i]!.schedule[d] = v === "T" ? "F" : "T"; })}>{v}</button></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 overflow-auto">
              <table className="w-full text-xs">
                <tbody>
                  {[["Pax noite", estado.days.map((d) => d.pax)], ["Pax manhã", estado.days.map((d) => d.morning)], ["Efetivos", contagem.map((c) => c.total)], ["Extras", contagem.map((c) => c.totalExtras)], ["Tarifa", estado.days.map((_, d) => valorTarifa(estado, d))]].map(([label, valores]) => (
                    <tr key={String(label)}><th className="border p-2 text-left text-[#d8c88d]">{label}</th>{(valores as number[]).map((v, d) => <td key={d} className="border p-1 text-center">{v}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            {historico.length > 0 && <div className="mt-4"><h3 className="font-semibold text-[#ffd12a]">Histórico</h3><div className="mt-2 space-y-1 text-xs">{historico.map((v) => <div key={v.id} className="flex justify-between border-b border-[#d8c88d]/20 py-1"><span>v{v.version} · {new Date(v.createdAt).toLocaleString("pt-BR")}</span><button type="button" className="text-[#ffd12a]" onClick={() => void restaurar(v.id)}>Restaurar</button></div>)}</div></div>}
          </section>
        )}

        <footer className="rounded-xl border border-[#d8c88d]/40 p-3 text-xs text-[#b9ae91]">
          Simulação gerencial. Confirme domingos, feriados, intervalos e contratos com o RH antes de publicar a escala.
          <Link href="/hotelaria" className="ml-2 text-[#ffd12a] underline">Voltar à Hotelaria</Link>
        </footer>
      </div>
    </main>
  );
}
