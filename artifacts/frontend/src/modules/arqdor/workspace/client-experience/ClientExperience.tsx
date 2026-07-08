import React, { useState } from "react";
import { AIClientPanel } from "./AIClientPanel";
import { ApprovalCenter } from "./ApprovalCenter";
import { ClientDashboard } from "./ClientDashboard";
import { ClientTimeline } from "./ClientTimeline";
import { CommentThread } from "./CommentThread";
import { FileLibrary } from "./FileLibrary";
import { FinancialPanel } from "./FinancialPanel";
import { SchedulePanel } from "./SchedulePanel";
import { SignaturePanel } from "./SignaturePanel";
import type { ClientView } from "./clientExperienceTypes";

type ClientExperienceProps = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

function Header({ view, setView, onNavigate }: { view: ClientView; setView: (view: ClientView) => void; onNavigate?: (module: string) => void }) {
  const views: Array<{ id: ClientView; label: string }> = [
    { id: "dashboard", label: "Dashboard" },
    { id: "timeline", label: "Timeline" },
    { id: "approvals", label: "Aprovações" },
    { id: "comments", label: "Comentários" },
    { id: "files", label: "Arquivos" },
    { id: "financial", label: "Financeiro" },
    { id: "schedule", label: "Agenda" },
    { id: "signature", label: "Assinatura" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Client Experience Enterprise</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Portal Cliente ARQDOR</h1>
          <p className="mt-1 text-sm text-slate-500">Aprovações, timeline, comentários, arquivos, financeiro, agenda e assinatura.</p>
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

          <button type="button" onClick={() => onNavigate?.("renders")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700">
            Design Studio
          </button>
        </div>
      </div>
    </header>
  );
}

function Content({ view }: { view: ClientView }) {
  if (view === "timeline") return <ClientTimeline />;
  if (view === "approvals") return <ApprovalCenter />;
  if (view === "comments") return <CommentThread />;
  if (view === "files") return <FileLibrary />;
  if (view === "financial") return <FinancialPanel />;
  if (view === "schedule") return <SchedulePanel />;
  if (view === "signature") return <SignaturePanel />;
  if (view === "ai") return <AIClientPanel />;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <ClientDashboard />
      <div className="space-y-5">
        <AIClientPanel />
        <ClientTimeline />
      </div>
    </div>
  );
}

export default function ClientExperience({ onNavigate }: ClientExperienceProps) {
  const [view, setView] = useState<ClientView>("dashboard");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header view={view} setView={setView} onNavigate={onNavigate} />
        <Content view={view} />
      </div>
    </div>
  );
}
