import React, { useState } from "react";
import type { ReleaseGate, ReleaseGateStatus } from "./consolidationTypes";
import { gateClass } from "./consolidationUtils";

export function ReleaseGatePanel({
  gates,
  saving,
  onChange,
}: {
  gates: ReleaseGate[];
  saving?: boolean;
  onChange: (gateId: string, status: ReleaseGateStatus, evidence?: string) => void;
}) {
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Release Candidate</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Gates de validação</h2>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {gates.map((gate) => (
          <article key={gate.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{gate.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{gate.description}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${gateClass(gate.status)}`}>
                {gate.status}
              </span>
            </div>

            <input
              value={evidence[gate.id] || gate.evidence || ""}
              onChange={(event) => setEvidence((current) => ({ ...current, [gate.id]: event.target.value }))}
              placeholder="Evidência: comando, print, URL, observação..."
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {(["passed", "failed", "waived", "pending"] as ReleaseGateStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={saving}
                  onClick={() => onChange(gate.id, status, evidence[gate.id] || gate.evidence || "")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${gateClass(status)} disabled:opacity-50`}
                >
                  {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
