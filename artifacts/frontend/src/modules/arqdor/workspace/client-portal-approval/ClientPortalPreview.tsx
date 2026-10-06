import React, { useState } from "react";
import type { Proposal, ProposalItem } from "./portalTypes";
import { approvalStatusClass, approvalStatusLabel, money, proposalStatusClass, proposalStatusLabel } from "./portalUtils";

export function ClientPortalPreview({
  proposal,
  items,
}: {
  proposal?: Proposal | null;
  items: ProposalItem[];
}) {
  const [comment, setComment] = useState("");

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Preview cliente</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Como a proposta aparece no portal</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          Imprimir / salvar PDF
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white">
        <div className="bg-slate-950 p-6 text-white" style={proposal?.tenantPrimaryColor ? { backgroundColor: proposal.tenantPrimaryColor } : undefined}>
          <div className="flex items-center gap-3">
            {proposal?.tenantLogoUrl ? (
              <img src={proposal.tenantLogoUrl} alt={proposal.tenantName || "Logo"} className="h-10 max-w-[180px] object-contain object-left" />
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/75">{proposal?.tenantName || "ARQDOR.ai"}</p>
          </div>
          <h3 className="mt-3 text-2xl font-semibold">{proposal?.title || "Proposta"}</h3>
          <p className="mt-1 text-sm text-slate-300">Cliente: {proposal?.clientName || "-"}</p>
          {proposal ? (
            <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${proposalStatusClass(proposal.status)}`}>
              {proposalStatusLabel(proposal.status)}
            </span>
          ) : null}
        </div>

        <div className="p-6">
          <div className="space-y-3">
            {items.filter((item) => item.visibleToClient).map((item) => (
              <div key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{item.item}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.description || ""}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.quantity} {item.unit}</p>
                    {(item.productName || item.materialName || item.manufacturerName) ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {[item.productName, item.materialName, item.manufacturerName].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {(item.areaM2 || item.lengthMm || item.widthMm || item.heightMm || item.depthMm) ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {[
                          item.areaM2 ? `${item.areaM2} m²` : null,
                          item.lengthMm ? `C ${item.lengthMm} mm` : null,
                          item.widthMm ? `L ${item.widthMm} mm` : null,
                          item.heightMm ? `A ${item.heightMm} mm` : null,
                          item.depthMm ? `P ${item.depthMm} mm` : null,
                        ].filter(Boolean).join(" · ")}
                        {item.projectRevision ? ` · revisão ${item.projectRevision}` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-lg font-semibold text-slate-950">{money(item.total)}</p>
                    <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${approvalStatusClass(item.approvalStatus)}`}>
                      {approvalStatusLabel(item.approvalStatus)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="ml-auto mt-6 max-w-sm">
            <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-semibold text-slate-950">
              <span>Total da proposta</span>
              <span>{money(proposal?.grandTotal)}</span>
            </div>
          </div>

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Comentário do cliente..."
            rows={4}
            className="mt-6 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <button type="button" className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">Aprovar</button>
            <button type="button" className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white">Solicitar revisão</button>
            <button type="button" className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white">Reprovar</button>
          </div>
        </div>
      </div>
    </section>
  );
}

