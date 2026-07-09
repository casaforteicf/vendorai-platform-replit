import React from "react";
import { offerPackages } from "./launchData";
import { launchStatusClass, launchStatusLabel } from "./launchUtils";

export function OfferBuilderPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Oferta</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Pacotes comerciais do ARQDOR.ai</h2>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {offerPackages.map((offer) => (
          <article key={offer.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-950">{offer.name}</p>
                <p className="mt-1 text-sm text-slate-500">{offer.target}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${launchStatusClass(offer.status)}`}>
                {launchStatusLabel(offer.status)}
              </span>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-white">
              <p className="text-sm text-slate-300">Mensalidade</p>
              <p className="mt-1 text-3xl font-semibold">{offer.price}</p>
              <p className="mt-3 text-sm text-slate-300">Implantação: {offer.setup}</p>
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-600">{offer.promise}</p>

            <div className="mt-5 space-y-2">
              {offer.included.map((item) => (
                <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
