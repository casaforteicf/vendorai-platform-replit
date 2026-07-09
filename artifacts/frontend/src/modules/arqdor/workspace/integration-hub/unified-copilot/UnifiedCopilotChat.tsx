import React, { useState } from "react";
import { copilotMessages as initialMessages } from "./copilotData";
import type { CopilotMessage } from "./copilotTypes";

export function UnifiedCopilotChat() {
  const [messages, setMessages] = useState<CopilotMessage[]>(initialMessages);
  const [value, setValue] = useState("");

  function sendMessage() {
    const text = value.trim();
    if (!text) return;

    const now = "Agora";
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: text, timestamp: now },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Entendi. Vou analisar o fluxo completo do ARQDOR antes de sugerir uma ação. O contexto principal continua sendo: aprovação do orçamento, conflito de ID de produto e saúde do Procurement.",
        module: "Unified Copilot",
        timestamp: now,
      },
    ]);
    setValue("");
  }

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Unified Copilot</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Copiloto único do ARQDOR</h2>

      <div className="mt-5 max-h-[520px] space-y-3 overflow-auto rounded-3xl bg-slate-50 p-4">
        {messages.map((message) => (
          <div key={message.id} className={["rounded-3xl p-4", message.role === "user" ? "ml-auto max-w-[78%] bg-slate-950 text-white" : "mr-auto max-w-[82%] bg-white text-slate-700"].join(" ")}>
            <p className="text-sm leading-6">{message.content}</p>
            <p className={["mt-2 text-[11px]", message.role === "user" ? "text-slate-300" : "text-slate-400"].join(" ")}>
              {message.module || message.role} • {message.timestamp}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-3">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") sendMessage();
          }}
          placeholder="Pergunte ao ARQDOR Copilot..."
          className="h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
        <button type="button" onClick={sendMessage} className="rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-violet-700">
          Enviar
        </button>
      </div>
    </section>
  );
}
