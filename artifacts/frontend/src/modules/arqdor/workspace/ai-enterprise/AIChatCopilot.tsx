import React, { useState } from "react";

const suggestions = [
  "Analise este projeto e diga o que está bloqueando o orçamento.",
  "Transforme as especificações aprovadas em ações de produção.",
  "Quais fornecedores podem reduzir prazo sem perder qualidade?",
  "Prepare um resumo simples para aprovação do cliente.",
];

export function AIChatCopilot() {
  const [message, setMessage] = useState("Analise o fluxo completo deste projeto e me diga o próximo melhor passo.");

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Copilot Enterprise</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Comando central por linguagem natural</h2>

        <div className="mt-5 rounded-[28px] bg-slate-950 p-5 text-white">
          <p className="text-sm font-semibold text-violet-200">ARQDOR AI</p>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Encontrei um fluxo parcialmente pronto. Render e especificação estão avançados, mas orçamento e produção ainda precisam de validação.
            Recomendo gerar cenário financeiro, travar OP de marcenaria até checklist técnico e preparar aprovação do cliente.
          </p>
        </div>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-5 min-h-[140px] w-full rounded-3xl border border-slate-200 bg-white p-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">
            Executar análise
          </button>
          <button type="button" className="rounded-2xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
            Salvar como rotina
          </button>
        </div>
      </div>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Prompts rápidos</p>
        <div className="mt-4 space-y-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setMessage(suggestion)}
              className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm font-medium leading-5 text-slate-700 hover:bg-violet-50 hover:text-violet-700"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
