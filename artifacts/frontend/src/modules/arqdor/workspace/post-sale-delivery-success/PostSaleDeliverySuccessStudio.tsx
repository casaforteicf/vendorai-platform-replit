import React, { useMemo, useState } from "react";
import { DeliveryChecklistPanel } from "./DeliveryChecklistPanel";
import { DeliverySummaryCards } from "./DeliverySummaryCards";
import { DeliveryTermPanel } from "./DeliveryTermPanel";
import { FinalDocumentationPanel } from "./FinalDocumentationPanel";
import { FutureOpportunitiesPanel } from "./FutureOpportunitiesPanel";
import { PostSaleTimelinePanel } from "./PostSaleTimelinePanel";
import { SatisfactionSurveyPanel } from "./SatisfactionSurveyPanel";
import { TestimonialReferralPanel } from "./TestimonialReferralPanel";
import type { DeliveryStatus } from "./postSaleTypes";
import { deliveryStatusClass, deliveryStatusLabel, getClientName, getProjectId, getProjectTitle, getProposalId } from "./postSaleUtils";
import { usePostSaleSuccess } from "./usePostSaleSuccess";

type PostSaleDeliverySuccessStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function PostSaleDeliverySuccessStudio({ arqState, onNavigate }: PostSaleDeliverySuccessStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const clientName = useMemo(() => getClientName(arqState), [arqState]);
  const proposalId = useMemo(() => getProposalId(arqState), [arqState]);
  const [view, setView] = useState<"delivery" | "documentation" | "satisfaction" | "opportunities" | "timeline">("delivery");

  const {
    delivery,
    checklist,
    terms,
    documents,
    surveys,
    testimonialRequests,
    opportunities,
    events,
    stats,
    loading,
    creating,
    saving,
    error,
    reload,
    createFromProduction,
    addChecklist,
    toggleChecklist,
    generateTerm,
    acceptTerm,
    addDocument,
    sendSurvey,
    requestClientTestimonial,
    addOpportunity,
    saveOpportunity,
  } = usePostSaleSuccess(projectId, proposalId, clientName);

  const nav = [
    { id: "delivery", label: "Entrega" },
    { id: "documentation", label: "Documentos" },
    { id: "satisfaction", label: "Satisfação" },
    { id: "opportunities", label: "Oportunidades" },
    { id: "timeline", label: "Timeline" },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Sprint 034 • Post-Sale, Delivery & Customer Success</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Entrega, pós-venda e sucesso do cliente</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • termo de entrega, documentação final, satisfação, depoimento e novas oportunidades.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {delivery ? (
                <span className={`rounded-2xl px-4 py-2 text-sm font-semibold ${deliveryStatusClass(delivery.status as DeliveryStatus)}`}>
                  {deliveryStatusLabel(delivery.status as DeliveryStatus)}
                </span>
              ) : null}

              {nav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    view === item.id ? "bg-slate-950 text-white" : "bg-[var(--arq-card-soft)] text-[var(--arq-muted)] hover:bg-[var(--arq-card-soft)] hover:text-[var(--arq-accent)]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                {loading ? "Carregando..." : "Atualizar"}
              </button>

              <button
                type="button"
                disabled={creating}
                onClick={() => void createFromProduction()}
                className="rounded-2xl bg-[var(--arq-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "Criando..." : "Iniciar pós-venda"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Projeto" value={projectId || "não identificado"} />
            <Info label="Cliente" value={delivery?.clientName || clientName} />
            <Info label="Entrega" value={delivery?.id || "ainda não criada"} />
          </div>
        </header>

        {error ? (
          <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <DeliverySummaryCards delivery={delivery} stats={stats} />

        {view === "delivery" ? (
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <DeliveryChecklistPanel
              delivery={delivery}
              checklist={checklist}
              saving={saving}
              onAdd={addChecklist}
              onToggle={toggleChecklist}
            />

            <DeliveryTermPanel
              delivery={delivery}
              terms={terms}
              saving={saving}
              projectTitle={projectTitle}
              onGenerate={generateTerm}
              onAccept={acceptTerm}
            />
          </div>
        ) : null}

        {view === "documentation" ? (
          <FinalDocumentationPanel
            delivery={delivery}
            documents={documents}
            saving={saving}
            onAdd={addDocument}
          />
        ) : null}

        {view === "satisfaction" ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <SatisfactionSurveyPanel
              surveys={surveys}
              saving={saving}
              onSend={sendSurvey}
            />

            <TestimonialReferralPanel
              requests={testimonialRequests}
              saving={saving}
              onRequest={requestClientTestimonial}
            />
          </div>
        ) : null}

        {view === "opportunities" ? (
          <FutureOpportunitiesPanel
            delivery={delivery}
            opportunities={opportunities}
            saving={saving}
            onAdd={addOpportunity}
            onUpdate={saveOpportunity}
          />
        ) : null}

        {view === "timeline" ? (
          <PostSaleTimelinePanel events={events} />
        ) : null}

        <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Ciclo fechado</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Projeto entregue → relacionamento contínuo</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--arq-muted)]">
            Após o aceite, o ARQDOR mantém histórico, documentação, feedback e oportunidades futuras para alimentar CRM, campanhas e novos projetos.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.("crm")}
            className="mt-4 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
          >
            Enviar oportunidades para CRM
          </button>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-[var(--arq-card-soft)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--arq-foreground)]">{value}</p>
    </div>
  );
}
