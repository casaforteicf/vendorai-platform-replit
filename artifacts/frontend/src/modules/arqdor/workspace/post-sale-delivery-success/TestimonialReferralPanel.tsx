import React, { useState } from "react";
import type { TestimonialRequest } from "./postSaleTypes";

export function TestimonialReferralPanel({
  requests,
  saving,
  onRequest,
}: {
  requests: TestimonialRequest[];
  saving?: boolean;
  onRequest: (message: string, channel: "portal" | "email" | "whatsapp" | "manual") => Promise<unknown>;
}) {
  const [channel, setChannel] = useState<"portal" | "email" | "whatsapp" | "manual">("whatsapp");
  const [message, setMessage] = useState(
    "Ficamos muito felizes em concluir seu projeto. Você poderia nos enviar um depoimento sobre sua experiência? Também agradecemos indicações de amigos ou familiares que estejam planejando um novo ambiente.",
  );

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relacionamento</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Depoimento e indicação</h2>

      <label className="mt-5 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Canal</span>
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value as any)}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
          <option value="portal">Portal</option>
          <option value="manual">Manual</option>
        </select>
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mensagem</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <button
        type="button"
        disabled={saving}
        onClick={() => void onRequest(message, channel)}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? "Enviando..." : "Solicitar depoimento"}
      </button>

      <div className="mt-5 space-y-3">
        {requests.map((request) => (
          <article key={request.id} className="rounded-[26px] border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{request.channel} • {request.status}</p>
                <p className="mt-1 text-xs text-slate-500">Avaliação: {request.rating ?? "-"}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{request.testimonial || request.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
