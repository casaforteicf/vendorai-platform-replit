[Reading 265 lines from start (total: 265 lines, 0 remaining)]

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceProject } from "../WorkspaceContext";
import ConstructionPortalContentManager from "./ConstructionPortalContentManager";

type Props = { arqState?: any };

type PortalConfig = {
  showOverview: boolean;
  showSchedule: boolean;
  showBudget: boolean;
  showDiary: boolean;
  showDiaryPhotos: boolean;
  showFinancialSummary: boolean;
  showFinancialDetails: boolean;
  showClientDecisions: boolean;
  showMeasurements: boolean;
  showMilestones: boolean;
  showDocuments: boolean;
  showProcurementSummary: boolean;
  showProjectGallery: boolean;
  requireLogin: boolean;
  allowSelfRegistration: boolean;
  showExecutiveBalance: boolean;
  showProposals: boolean;
  showContracts: boolean;
  showInvoices: boolean;
  showManuals: boolean;
  showSupport: boolean;
  showChat: boolean;
  showBriefing: boolean;
  showTimeline: boolean;
  showAgenda: boolean;
  showChangeOrders: boolean;
  showSignatures: boolean;
  showDelivery: boolean;
  showVendi: boolean;
  showNotifications: boolean;
  showClientTasks: boolean;
};

const DEFAULT_CONFIG: PortalConfig = {
  showOverview: true,
  showSchedule: true,
  showBudget: true,
  showDiary: true,
  showDiaryPhotos: true,
  showFinancialSummary: false,
  showFinancialDetails: false,
  showClientDecisions: true,
  showMeasurements: true,
  showMilestones: true,
  showDocuments: true,
  showProcurementSummary: true,
  showProjectGallery: true,
  requireLogin: false,
  allowSelfRegistration: true,
  showExecutiveBalance: true,
  showProposals: true,
  showContracts: false,
  showInvoices: false,
  showManuals: true,
  showSupport: true,
  showChat: true,
  showBriefing: true,
  showTimeline: true,
  showAgenda: true,
  showChangeOrders: true,
  showSignatures: true,
  showDelivery: true,
  showVendi: true,
  showNotifications: true,
  showClientTasks: true,
};

function token() { return localStorage.getItem("vendorai_token") ?? ""; }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

function projectMeta(arqState: any, projectCtx: any) {
  const candidate = arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? {};
  return {
    id: String(projectCtx?.id || arqState?.projectId || candidate?.id || ""),
    name: String(projectCtx?.name || candidate?.titulo || candidate?.title || candidate?.name || "Projeto ARQDOR"),
    clientName: candidate?.clienteNome || candidate?.clientName || null,
    budget: candidate?.orcamentoTotal || null,
    status: candidate?.status || null,
  };
}

const ITEMS: Array<{ key: keyof PortalConfig; title: string; description: string; dependsOn?: keyof PortalConfig }> = [
  { key: "showOverview", title: "Visão geral da obra", description: "Status, endereço, avanço físico, etapa atual, próximas etapas e previsão de entrega." },
  { key: "showBriefing", title: "Briefing", description: "Briefing do cliente, referências, respostas e aprovações publicadas." },
  { key: "showTimeline", title: "Linha do tempo", description: "Histórico consolidado do briefing ao pós-venda." },
  { key: "showClientTasks", title: "Pendências do cliente", description: "Ações que dependem do cliente: aprovações, escolhas, assinaturas e confirmações." },
  { key: "showAgenda", title: "Agenda", description: "Reuniões, visitas, medições, instalações, vistorias e entregas." },
  { key: "showChangeOrders", title: "Alterações e aditivos", description: "Mudanças de escopo com impacto em prazo e valor para aceite do cliente." },
  { key: "showSignatures", title: "Assinaturas e aceites", description: "Contratos, termos, documentos e aceites pendentes ou concluídos." },
  { key: "showDelivery", title: "Entrega e pós-venda", description: "Checklist final, garantias, assistência, manuais e satisfação." },
  { key: "showNotifications", title: "Notificações", description: "Avisos importantes e atualizações publicadas para o cliente." },
  { key: "showVendi", title: "Vendi no portal", description: "Assistente contextual que responde somente com informações autorizadas desta obra." },
  { key: "showSchedule", title: "Cronograma", description: "Etapas, datas previstas, responsáveis e avanço físico." },
  { key: "showMilestones", title: "Marcos da obra", description: "Marcos previstos, concluídos e próximos eventos do cronograma.", dependsOn: "showSchedule" },
  { key: "showMeasurements", title: "Medições", description: "Histórico de evolução física registrada nas etapas.", dependsOn: "showSchedule" },
  { key: "showBudget", title: "Orçamento", description: "Somente orçamento enviado ou aprovado." },
  { key: "showDiary", title: "Diário de obra", description: "Somente registros com status Aprovado." },
  { key: "showDiaryPhotos", title: "Fotos do diário", description: "Fotos e vídeos apenas de diários aprovados.", dependsOn: "showDiary" },
  { key: "showDocuments", title: "Documentos e anexos", description: "Anexos publicados em diários aprovados e documentos financeiros permitidos." },
  { key: "showProjectGallery", title: "Galeria do projeto", description: "Renders concluídos/aprovados vinculados ao projeto Arqdor desta obra." },
  { key: "showProcurementSummary", title: "Compras e suprimentos", description: "Resumo de compras críticas e entregas relacionadas às etapas." },
  { key: "showFinancialSummary", title: "Resumo financeiro", description: "Mostra orçamento total, custo realizado e percentual consumido. Fica oculto por padrão." },
  { key: "showFinancialDetails", title: "Detalhamento financeiro", description: "Lista lançamentos financeiros/documentos da obra. Requer Resumo financeiro.", dependsOn: "showFinancialSummary" },
  { key: "showClientDecisions", title: "Decisões do cliente", description: "Exibe somente decisões explicitamente publicadas para aprovação." },
  { key: "showExecutiveBalance", title: "Balanço executivo", description: "Planejado × executado, avanço físico, custo e desvios por etapa." },
  { key: "showProposals", title: "Propostas e orçamentos comerciais", description: "Mostra proposta/orçamento gerados e o status de aprovação." },
  { key: "showContracts", title: "Contratos", description: "Documentos classificados como contrato e termos vinculados à obra." },
  { key: "showInvoices", title: "Notas fiscais", description: "Documentos financeiros classificados como nota fiscal." },
  { key: "showManuals", title: "Manuais e garantias", description: "Manuais técnicos, garantias e documentação de entrega." },
  { key: "showSupport", title: "Solicitações de suporte", description: "Permite ao cliente abrir e acompanhar tickets da obra." },
  { key: "showChat", title: "Chat com a equipe", description: "Canal de mensagens entre cliente e executores responsáveis." },
  { key: "requireLogin", title: "Exigir login do cliente", description: "Protege o conteúdo do portal com conta e senha do cliente." },
  { key: "allowSelfRegistration", title: "Permitir cadastro pelo cliente", description: "O cliente pode criar sua própria conta usando o link desta obra.", dependsOn: "requireLogin" },
];

export default function ConstructionPortalSettings({ arqState }: Props) {
  const { user } = useAuth();
  const { projectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const tenantId = user?.tenantId ?? "";
  const [obraId, setObraId] = useState("");
  const [portalToken, setPortalToken] = useState("");
  const [config, setConfig] = useState<PortalConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!meta.id || !tenantId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const ensured = await api<{ obra: any }>("/api/arch/construction/ensure", {
        method: "POST",
        body: JSON.stringify({ projectId: meta.id, name: meta.name, clientName: meta.clientName, budget: meta.budget, status: meta.status }),
      });
      const id = String(ensured.obra?.id ?? "");
      if (!id) throw new Error("Não foi possível identificar a obra vinculada.");
      setObraId(id);
      const obra = await api<any>(`/api/tenants/${tenantId}/obras/${id}`);
      setPortalToken(String(obra?.portalToken ?? obra?.portal_token ?? ""));
      setConfig({ ...DEFAULT_CONFIG, ...(obra?.portalConfig ?? obra?.portal_config ?? {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configurações do portal.");
    } finally {
      setLoading(false);
    }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!obraId || !tenantId) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      await api(`/api/tenants/${tenantId}/obras/${obraId}`, {
        method: "PUT",
        body: JSON.stringify({ portalConfig: config }),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  if (!meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto antes de configurar o Portal do Cliente.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Carregando regras do Portal do Cliente…</div>;

  return (
    <div className="space-y-5">
      <header className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Portal do Cliente</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">O que o cliente pode visualizar</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">O conteúdo continua sendo cadastrado uma única vez na obra. Estas opções apenas controlam o que é publicado no portal externo.</p>
      </header>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Link público</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Acesso do cliente à obra</h3>
            <p className="mt-1 text-xs text-slate-500">O link é exclusivo desta obra e respeita exatamente as regras de publicação abaixo.</p>
            {portalToken ? <p className="mt-2 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{`${window.location.origin}/portal/obra/${portalToken}`}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!portalToken}
              onClick={() => portalToken && navigator.clipboard.writeText(`${window.location.origin}/portal/obra/${portalToken}`)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Copiar link
            </button>
            <button
              type="button"
              disabled={!portalToken}
              onClick={() => portalToken && window.open(`/portal/obra/${portalToken}`, "_blank", "noopener,noreferrer")}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Abrir portal
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="divide-y divide-slate-100">
          {ITEMS.map((item) => {
            const disabled = item.dependsOn ? !config[item.dependsOn] : false;
            return (
              <label key={item.key} className={`flex items-start justify-between gap-4 py-4 ${disabled ? "opacity-50" : ""}`}>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(config[item.key]) && !disabled}
                  disabled={disabled}
                  onChange={(event) => setConfig((current) => ({ ...current, [item.key]: event.target.checked }))}
                  className="mt-1 h-5 w-5 accent-violet-600"
                />
              </label>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar publicação"}
          </button>
          {saved ? <span className="text-sm font-medium text-emerald-600">✓ Configuração salva</span> : null}
          <span className="text-xs text-slate-400">Segurança: rascunhos e diários em revisão nunca são enviados ao portal.</span>
        </div>
      </section>

      {tenantId && obraId ? <ConstructionPortalContentManager tenantId={tenantId} obraId={obraId} /> : null}
    </div>
  );
}
