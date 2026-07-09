import React, { useEffect, useState } from "react";
import type { DeliveryChannel, Proposal } from "./portalTypes";
import { publicProposalUrl } from "./portalUtils";

export function PortalDeliveryPanel({
  proposal,
  activating,
  sending,
  onActivate,
  onSend,
}: {
  proposal?: Proposal | null;
  activating?: boolean;
  sending?: boolean;
  onActivate: () => Promise<unknown>;
  onSend: (payload: { channels: DeliveryChannel[]; email?: string; phone?: string; message?: string }) => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [message, setMessage] = useState("Olá! Sua proposta ARQDOR está pronta para análise e aprovação.");

  useEffect(() => {
    setEmail(proposal?.clientEmail || "");
    setPhone(proposal?.clientPhone || "");
  }, [proposal]);

  const url = proposal?.publicUrl || publicProposalUrl(proposal?.portalToken);

  function copyUrl() {
    if (!url) return;
    void navigator.clipboard?.writeText(url);
  }

  function submitSend() {
    const channels: DeliveryChannel[] = ["portal"];
    if (sendEmail) channels.push("email");
    if (sendWhatsapp) channels.push("whatsapp");

    void onSend({ channels, email, phone, message });
  }

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Envio</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Portal público com token</h2>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Link público</p>
        <p className="mt-2 break-all text-sm font-medium text-slate-800">{url || "Portal ainda não ativado"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!proposal || activating}
            onClick={() => void onActivate()}
            className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {activating ? "Ativando..." : "Ativar portal"}
          </button>

          <button
            type="button"
            disabled={!url}
            onClick={copyUrl}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Copiar link
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="E-mail cliente" value={email} onChange={setEmail} />
        <Field label="WhatsApp cliente" value={phone} onChange={setPhone} />
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mensagem</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
          Enviar por e-mail
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={sendWhatsapp} onChange={(event) => setSendWhatsapp(event.target.checked)} />
          Enviar por WhatsApp
        </label>
      </div>

      <button
        type="button"
        disabled={!proposal || sending}
        onClick={submitSend}
        className="mt-5 w-full rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {sending ? "Enviando..." : "Enviar proposta"}
      </button>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}
