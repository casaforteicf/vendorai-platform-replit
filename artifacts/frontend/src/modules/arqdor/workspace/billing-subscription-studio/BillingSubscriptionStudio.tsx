import React, { useMemo, useState } from "react";
import { BillingAccountsPanel } from "./BillingAccountsPanel";
import { BillingOverview } from "./BillingOverview";
import { CommissionsPanel } from "./CommissionsPanel";
import { ContractsPanel } from "./ContractsPanel";
import { DunningPanel } from "./DunningPanel";
import { InvoicesPanel } from "./InvoicesPanel";
import { PaymentsPanel } from "./PaymentsPanel";
import { PlansPanel } from "./PlansPanel";
import { RevenueRecognitionPanel } from "./RevenueRecognitionPanel";
import { UsageMeteringPanel } from "./UsageMeteringPanel";
import type { BillingView } from "./billingTypes";
import { clientName, getProject, projectTitle } from "./billingUtils";

type BillingSubscriptionStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

function Header({
  project,
  view,
  setView,
  onNavigate,
}: {
  project: any;
  view: BillingView;
  setView: (view: BillingView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: BillingView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "plans", label: "Planos" },
    { id: "accounts", label: "Contas" },
    { id: "invoices", label: "Faturas" },
    { id: "payments", label: "Pagamentos" },
    { id: "usage", label: "Uso" },
    { id: "commissions", label: "Comissões" },
    { id: "contracts", label: "Contratos" },
    { id: "dunning", label: "Cobrança" },
    { id: "recognition", label: "Receita" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 025 • Billing & Subscription Studio</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">ARQDOR.ai Billing Operations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projectTitle(project)} • {clientName(project)} • planos, faturas, pagamentos, uso, contratos, comissões e receita.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onNavigate?.("revenue-operations")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Revenue
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: BillingView }) {
  if (view === "plans") return <PlansPanel />;
  if (view === "accounts") return <BillingAccountsPanel />;
  if (view === "invoices") return <InvoicesPanel />;
  if (view === "payments") return <PaymentsPanel />;
  if (view === "usage") return <UsageMeteringPanel />;
  if (view === "commissions") return <CommissionsPanel />;
  if (view === "contracts") return <ContractsPanel />;
  if (view === "dunning") return <DunningPanel />;
  if (view === "recognition") return <RevenueRecognitionPanel />;
  return <BillingOverview />;
}

export default function BillingSubscriptionStudio({ arqState, onNavigate }: BillingSubscriptionStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<BillingView>("overview");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
