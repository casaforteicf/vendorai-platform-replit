import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { MessageCircle, ImageIcon, DollarSign, Building2, ExternalLink } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Projeto = {
  id: string;
  titulo: string;
  clienteNome: string | null;
  tipoObra: string | null;
  areaM2: string | null;
  orcamentoTotal: string | null;
  arquitetoResponsavel: string | null;
  status: string;
};

type Ambiente = {
  id: string;
  nome: string;
  areaM2: string | null;
  ordem: number;
};

type OrcItem = {
  id: string;
  ambienteId: string | null;
  categoria: string | null;
  descricao: string;
  quantidade: string | null;
  unidade: string | null;
  valorTotal: string | null;
};

type Cena = {
  id: string;
  nome: string | null;
  renderUrl: string | null;
  status: string | null;
};

type Tenant = {
  name: string;
  nomeEmpresa: string | null;
  logoUrl: string | null;
  site: string | null;
};

type PortalData = {
  projeto: Projeto;
  ambientes: Ambiente[];
  orcamento: OrcItem[];
  cenas: Cena[];
  tenant: Tenant | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getBase() { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, string> = {
  briefing:    "Briefing",
  orcamento:   "Orçamento",
  aprovado:    "Aprovado",
  em_execucao: "Em Execução",
  entregue:    "Entregue",
  cancelado:   "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  briefing:    "bg-gray-100 text-gray-700",
  orcamento:   "bg-blue-100 text-blue-700",
  aprovado:    "bg-green-100 text-green-700",
  em_execucao: "bg-amber-100 text-amber-700",
  entregue:    "bg-emerald-100 text-emerald-700",
  cancelado:   "bg-red-100 text-red-700",
};

// ── Main Component ─────────────────────────────────────────────────────────
export default function PortalCliente() {
  const [, params] = useRoute("/arch/portal/:token");
  const token = params?.token ?? "";

  const [data, setData]       = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewingCena, setViewingCena] = useState<Cena | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${getBase()}/api/arch/portal/${token}`)
      .then(async res => {
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        setData(await res.json());
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────
  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <Building2 className="h-14 w-14 text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-700">Projeto não disponível</h1>
        <p className="text-gray-500 mt-2 max-w-sm">
          Este link não está mais ativo ou o projeto foi desativado. Entre em contato com o arquiteto responsável.
        </p>
      </div>
    );
  }

  const { projeto, ambientes, orcamento, cenas, tenant } = data;

  // Group orçamento by ambiente
  const byAmbiente: Record<string, { nome: string; itens: OrcItem[]; total: number }> = {};
  for (const item of orcamento) {
    const key = item.ambienteId ?? "__sem__";
    const ambNome = ambientes.find(a => a.id === item.ambienteId)?.nome ?? "Geral";
    if (!byAmbiente[key]) byAmbiente[key] = { nome: ambNome, itens: [], total: 0 };
    byAmbiente[key].itens.push(item);
    byAmbiente[key].total += Number(item.valorTotal ?? 0);
  }

  const totalGeral = orcamento.reduce((acc, i) => acc + Number(i.valorTotal ?? 0), 0);
  const rendersFeitos = cenas.filter(c => c.status === "concluido" && c.renderUrl);
  const tenantNome = tenant?.nomeEmpresa ?? tenant?.name ?? "Arquiteto";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              <img
                src={tenant.logoUrl.startsWith("/api") ? `${getBase()}${tenant.logoUrl}` : tenant.logoUrl}
                alt={tenantNome}
                className="h-9 w-9 rounded-full object-cover border"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-violet-100 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-violet-600" />
              </div>
            )}
            <div>
              <p className="font-semibold text-sm leading-tight">{tenantNome}</p>
              {tenant?.site && (
                <a
                  href={tenant.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-600 hover:underline flex items-center gap-0.5"
                >
                  {tenant.site.replace(/^https?:\/\//, "")}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[projeto.status] ?? "bg-gray-100 text-gray-700"}`}>
            {STATUS_LABEL[projeto.status] ?? projeto.status}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {/* ── Visão geral ─────────────────────────────────────────────── */}
        <section>
          <h1 className="text-3xl font-bold tracking-tight">{projeto.titulo}</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-gray-600">
            {projeto.clienteNome     && <span>👤 {projeto.clienteNome}</span>}
            {projeto.tipoObra        && <span>🏗 {projeto.tipoObra}</span>}
            {projeto.areaM2          && <span>📐 {Number(projeto.areaM2).toFixed(0)} m²</span>}
            {projeto.arquitetoResponsavel && <span>🎨 {projeto.arquitetoResponsavel}</span>}
          </div>
        </section>

        {/* ── Galeria de renders ───────────────────────────────────────── */}
        {rendersFeitos.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">Renders 3D</h2>
              <span className="text-sm text-gray-500">({rendersFeitos.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rendersFeitos.map(cena => (
                <button
                  key={cena.id}
                  onClick={() => setViewingCena(cena)}
                  className="rounded-xl overflow-hidden border bg-white aspect-video hover:shadow-md transition-shadow group relative"
                >
                  <img
                    src={cena.renderUrl!}
                    alt={cena.nome ?? "Render"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {cena.nome && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs font-medium truncate">{cena.nome}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Orçamento por ambiente ───────────────────────────────────── */}
        {orcamento.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">Orçamento</h2>
            </div>
            <div className="space-y-4">
              {Object.values(byAmbiente).map(grupo => (
                <div key={grupo.nome} className="rounded-xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <p className="font-semibold text-sm">{grupo.nome}</p>
                    <p className="font-bold text-sm text-violet-700">{fmt(grupo.total)}</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {grupo.itens.map(item => (
                        <tr key={item.id} className="px-4">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-800">{item.descricao}</p>
                            {item.categoria && (
                              <p className="text-xs text-gray-400">{item.categoria}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">
                            {item.quantidade} {item.unidade}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* Total geral */}
            <div className="mt-4 rounded-xl bg-violet-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-violet-200 text-sm">Investimento total estimado</p>
                <p className="text-3xl font-bold mt-0.5">{fmt(totalGeral)}</p>
              </div>
              <DollarSign className="h-10 w-10 text-violet-300 opacity-60" />
            </div>
          </section>
        )}

        {/* ── Falar com arquiteto ─────────────────────────────────────── */}
        <section className="rounded-xl border bg-white p-6 text-center space-y-3">
          <MessageCircle className="h-10 w-10 mx-auto text-green-500" />
          <div>
            <p className="font-semibold text-lg">Tem alguma dúvida?</p>
            <p className="text-gray-500 text-sm mt-1">
              {projeto.arquitetoResponsavel
                ? `Entre em contato com ${projeto.arquitetoResponsavel}`
                : "Entre em contato com o arquiteto responsável"}
            </p>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Olá! Tenho interesse no projeto "${projeto.titulo}". Poderia me ajudar?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 text-white rounded-lg px-5 py-2.5 font-medium hover:bg-green-600 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Falar com {projeto.arquitetoResponsavel ?? "o arquiteto"}
          </a>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 pb-4">
          Portal gerado por <span className="font-medium text-gray-500">VendorAI</span>
        </footer>
      </main>

      {/* ── Lightbox de render ──────────────────────────────────────────── */}
      {viewingCena && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewingCena(null)}
        >
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={viewingCena.renderUrl!}
              alt={viewingCena.nome ?? "Render"}
              className="w-full rounded-xl shadow-2xl"
            />
            {viewingCena.nome && (
              <p className="text-white text-center mt-3 font-medium">{viewingCena.nome}</p>
            )}
            <div className="flex justify-center gap-3 mt-4">
              <a
                href={viewingCena.renderUrl!}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-gray-800 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                <ExternalLink className="h-4 w-4" /> Download
              </a>
              <button
                onClick={() => setViewingCena(null)}
                className="inline-flex items-center gap-2 bg-white/20 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-white/30"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
