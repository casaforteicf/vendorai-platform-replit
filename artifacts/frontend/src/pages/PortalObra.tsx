import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2, MapPin, Calendar, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Camera, HardHat, Loader2,
  ThumbsUp, CircleDollarSign, Layers,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = "/api";

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return d; }
}

function fmtMoney(v?: string | number | null) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const total = parseFloat(b);
  if (!total) return null;
  return Math.min(100, Math.round((parseFloat(a) / total) * 100));
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortalData {
  obra: {
    id: string; nome: string; descricao?: string | null;
    clienteNome?: string | null; endereco?: string | null; status: string;
    dataInicio?: string | null; dataFimPrevista?: string | null; dataFimReal?: string | null;
    orcamentoTotal?: string | null; custoRealizado?: string | null;
  };
  tenant: { id: string; name: string };
  orcamento: {
    id: string; status: string; versao: number; titulo?: string | null;
    bdiGlobal: string;
    etapas: Array<{
      id: string; nome: string; ordem: number;
      itens: Array<{
        id: string; nome: string; unidade: string;
        quantidade: string; custoUnitario: string; bdi?: string | null; ordem: number;
      }>;
    }>;
  } | null;
  etapas: Array<{
    id: string; nome: string; ordem: number; status: string;
    percentualExecutado: string; responsavel?: string | null;
    dataInicioPrevista?: string | null; dataFimPrevista?: string | null;
  }>;
  diario: Array<{
    id: string; data: string; conteudo: string; responsavelNome?: string | null;
    climaTempo?: string | null; maoDeObra?: number | null; observacoes?: string | null;
    fotos?: Array<{ url: string; caption?: string; uploadedAt: string }> | null;
    status: string;
  }>;
  ocorrencias: Array<{
    id: string; data: string; observacoes: string; status: string;
    responsavelNome?: string | null;
  }>;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const OBRA_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  planejamento: { label: "Planejamento",  color: "bg-slate-100 text-slate-700",  icon: <Clock className="h-4 w-4" /> },
  em_andamento: { label: "Em andamento",  color: "bg-blue-100 text-blue-700",    icon: <HardHat className="h-4 w-4" /> },
  concluida:    { label: "Concluída",     color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-4 w-4" /> },
  suspensa:     { label: "Suspensa",      color: "bg-amber-100 text-amber-700",   icon: <AlertTriangle className="h-4 w-4" /> },
};

const ETAPA_STATUS: Record<string, { label: string; color: string; bar: string }> = {
  pendente:     { label: "Não iniciada",  color: "bg-slate-100 text-slate-600",   bar: "#94a3b8" },
  em_andamento: { label: "Em andamento",  color: "bg-indigo-100 text-indigo-700", bar: "#6366f1" },
  concluida:    { label: "Concluída",     color: "bg-emerald-100 text-emerald-700", bar: "#10b981" },
  pausada:      { label: "Pausada",       color: "bg-amber-100 text-amber-700",   bar: "#f59e0b" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4 pb-2 border-b border-gray-200">
        <span className="text-indigo-600">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="text-sm font-medium text-gray-900">{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PortalObra() {
  const [, params] = useRoute("/portal/obra/:token");
  const token = params?.token ?? "";

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [expandedDiario, setExpandedDiario] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/portal/obra/${token}`)
      .then((r) => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)))
      .then((d: PortalData) => { setData(d); setLoading(false); })
      .catch((e: any) => { setError(typeof e === "string" ? e : "Erro ao carregar o portal."); setLoading(false); });
  }, [token]);

  async function handleAprovar() {
    setApproving(true);
    try {
      const r = await fetch(`${API}/portal/obra/${token}/aprovar-orcamento`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setApproved(true);
      setData((d) => d ? { ...d, orcamento: d.orcamento ? { ...d.orcamento, status: "aprovado" } : null } : d);
    } catch (e: any) {
      alert(e.message ?? "Erro ao aprovar orçamento.");
    } finally {
      setApproving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Carregando portal…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-700 mb-2">Portal não encontrado</h1>
        <p className="text-gray-500 text-sm">{error ?? "Verifique o link enviado pela construtora."}</p>
      </div>
    </div>
  );

  const { obra, tenant, orcamento, etapas, diario, ocorrencias } = data;
  const obraStatus = OBRA_STATUS[obra.status] ?? { label: obra.status, color: "bg-gray-100 text-gray-600", icon: null };

  // Overall progress
  const totalEtapas = etapas.length;
  const avgProgress = totalEtapas > 0
    ? Math.round(etapas.reduce((s, e) => s + parseFloat(e.percentualExecutado ?? "0"), 0) / totalEtapas)
    : 0;

  // BDI factor for orcamento items
  const bdiGlobal = orcamento ? parseFloat(orcamento.bdiGlobal ?? "0") : 0;
  const bdiMult = 1 + bdiGlobal / 100;

  function itemTotal(item: NonNullable<PortalData["orcamento"]>["etapas"][0]["itens"][0]) {
    const bdi = item.bdi != null ? parseFloat(item.bdi) : bdiGlobal;
    const mult = 1 + bdi / 100;
    return parseFloat(item.quantidade) * parseFloat(item.custoUnitario) * mult;
  }

  function etapaTotal(etapa: NonNullable<PortalData["orcamento"]>["etapas"][0]) {
    return etapa.itens.reduce((s, i) => s + itemTotal(i), 0);
  }

  const orcamentoTotalCalc = orcamento
    ? orcamento.etapas.reduce((s, e) => s + etapaTotal(e), 0)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Foto da obra" className="max-h-[85vh] max-w-full rounded-lg shadow-2xl" />
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white rounded-lg p-2">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 leading-none">Portal do Cliente</p>
              <p className="font-semibold text-gray-900 text-sm leading-snug">{tenant.name}</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${obraStatus.color}`}>
            {obraStatus.icon}
            {obraStatus.label}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ── Hero ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{obra.nome}</h1>
          {obra.clienteNome && <p className="text-gray-500 text-sm mb-3">Cliente: <span className="font-medium text-gray-700">{obra.clienteNome}</span></p>}
          {obra.descricao && <p className="text-gray-600 text-sm mb-4">{obra.descricao}</p>}

          {obra.endereco && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
              <MapPin className="h-4 w-4 flex-shrink-0 text-indigo-400" />
              {obra.endereco}
            </div>
          )}

          {/* Progress overview */}
          {totalEtapas > 0 && (
            <div className="mt-4 p-4 bg-indigo-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-indigo-800">Progresso geral da obra</span>
                <span className="text-lg font-bold text-indigo-700">{avgProgress}%</span>
              </div>
              <ProgressBar value={avgProgress} color="#6366f1" />
            </div>
          )}
        </div>

        {/* ── Ocorrências em destaque ── */}
        {ocorrencias.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
            <h2 className="font-semibold text-amber-800 flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5" />
              Ocorrências em aberto ({ocorrencias.length})
            </h2>
            <div className="space-y-3">
              {ocorrencias.map((oc) => (
                <div key={oc.id} className="bg-white rounded-lg p-3 border border-amber-100">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>{fmt(oc.data)}</span>
                    {oc.responsavelNome && <span>{oc.responsavelNome}</span>}
                  </div>
                  <p className="text-sm text-gray-700">{oc.observacoes}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Dados da obra ── */}
        <Section title="Dados da Obra" icon={<Building2 className="h-5 w-5" />}>
          <InfoGrid items={[
            { label: "Início", value: fmt(obra.dataInicio) },
            { label: "Conclusão prevista", value: fmt(obra.dataFimPrevista) },
            { label: "Conclusão real", value: fmt(obra.dataFimReal) },
            { label: "Orçamento total", value: fmtMoney(obra.orcamentoTotal) },
            { label: "Custo realizado", value: fmtMoney(obra.custoRealizado) },
            ...(obra.orcamentoTotal && obra.custoRealizado ? [{
              label: "% Executado (custo)",
              value: `${pct(obra.custoRealizado, obra.orcamentoTotal) ?? "—"}%`,
            }] : []),
          ]} />
        </Section>

        {/* ── Orçamento ── */}
        <Section title="Orçamento" icon={<CircleDollarSign className="h-5 w-5" />}>
          {!orcamento ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum orçamento disponível ainda.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <span className="text-sm text-gray-500">
                    {orcamento.titulo ?? `Orçamento v${orcamento.versao}`}
                    {orcamento.bdiGlobal !== "0" && ` · BDI ${orcamento.bdiGlobal}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {orcamento.status === "aprovado" && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado pelo cliente
                    </span>
                  )}
                  {orcamento.status === "enviado" && !approved && (
                    <button
                      onClick={handleAprovar}
                      disabled={approving}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                    >
                      {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                      Aprovar Orçamento
                    </button>
                  )}
                  {approved && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado!
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {orcamento.etapas.map((etapa) => {
                  const total = etapaTotal(etapa);
                  return (
                    <div key={etapa.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <span className="font-medium text-gray-800 text-sm">{etapa.nome}</span>
                        <span className="text-sm font-semibold text-gray-900">{fmtMoney(total)}</span>
                      </div>
                      {etapa.itens.length > 0 && (
                        <div className="divide-y divide-gray-100">
                          {etapa.itens.map((item) => {
                            const subtotal = itemTotal(item);
                            return (
                              <div key={item.id} className="px-4 py-2.5 flex items-start justify-between gap-4 text-sm">
                                <div className="flex-1 min-w-0">
                                  <p className="text-gray-700">{item.nome}</p>
                                  <p className="text-xs text-gray-400">
                                    {item.quantidade} {item.unidade} × {fmtMoney(item.custoUnitario)}
                                    {item.bdi != null ? ` · BDI ${item.bdi}%` : bdiGlobal > 0 ? ` · BDI ${bdiGlobal}%` : ""}
                                  </p>
                                </div>
                                <span className="text-gray-900 font-medium whitespace-nowrap">{fmtMoney(subtotal)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 bg-indigo-50 rounded-xl px-5 py-4 flex items-center justify-between">
                <span className="font-semibold text-indigo-800">Total do Orçamento</span>
                <span className="text-xl font-bold text-indigo-700">{fmtMoney(orcamentoTotalCalc)}</span>
              </div>
            </>
          )}
        </Section>

        {/* ── Cronograma ── */}
        <Section title="Cronograma" icon={<Layers className="h-5 w-5" />}>
          {etapas.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma etapa cadastrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {etapas.map((etapa) => {
                const p = parseFloat(etapa.percentualExecutado ?? "0");
                const st = ETAPA_STATUS[etapa.status] ?? { label: etapa.status, color: "bg-gray-100 text-gray-600", bar: "#94a3b8" };
                const dias = etapa.dataInicioPrevista && etapa.dataFimPrevista
                  ? Math.max(1, differenceInCalendarDays(
                      parseISO(etapa.dataFimPrevista + "T12:00:00"),
                      parseISO(etapa.dataInicioPrevista + "T12:00:00"),
                    ))
                  : null;

                return (
                  <div key={etapa.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{etapa.nome}</p>
                        {etapa.responsavel && <p className="text-xs text-gray-400 mt-0.5">{etapa.responsavel}</p>}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>{st.label}</span>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <ProgressBar value={p} color={st.bar} />
                      <span className="text-sm font-bold text-gray-700 w-10 text-right">{Math.round(p)}%</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                      {etapa.dataInicioPrevista && <span>{fmt(etapa.dataInicioPrevista)} → {fmt(etapa.dataFimPrevista)}</span>}
                      {dias && <span>{dias} dias</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── Diário da Obra ── */}
        <Section title="Diário da Obra" icon={<FileText className="h-5 w-5" />}>
          {diario.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma entrada no diário ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {diario.map((entry) => {
                const isOpen = expandedDiario === entry.id;
                const hasFotos = (entry.fotos?.length ?? 0) > 0;
                return (
                  <div key={entry.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedDiario(isOpen ? null : entry.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-700">
                          {format(parseISO(entry.data + "T12:00:00"), "dd 'de' MMMM", { locale: ptBR })}
                        </span>
                        {hasFotos && (
                          <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            <Camera className="h-3 w-3" />{entry.fotos!.length} foto{entry.fotos!.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {entry.responsavelNome && <span className="text-xs text-gray-400">{entry.responsavelNome}</span>}
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        <p className="text-sm text-gray-700 mt-3 leading-relaxed">{entry.conteudo}</p>

                        {(entry.climaTempo || entry.maoDeObra != null) && (
                          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                            {entry.climaTempo && <span>🌤 {entry.climaTempo}</span>}
                            {entry.maoDeObra != null && <span>👷 {entry.maoDeObra} trabalhadores</span>}
                          </div>
                        )}

                        {hasFotos && (
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {entry.fotos!.map((foto, i) => (
                              <button
                                key={i}
                                onClick={() => setLightbox(foto.url)}
                                className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
                              >
                                <img
                                  src={foto.url}
                                  alt={foto.caption ?? `Foto ${i + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {entry.observacoes && (
                          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
                            <p className="text-xs font-medium text-amber-700 mb-1">Observações</p>
                            <p className="text-sm text-amber-800">{entry.observacoes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-200 mt-4">
          Portal do Cliente — {tenant.name} · Este link é exclusivo para o acompanhamento desta obra.
        </footer>
      </main>
    </div>
  );
}
