import React, { useMemo, useState } from "react";
import { AISuggestions } from "./AISuggestions";
import { PromptHistory, type PromptHistoryItem } from "./PromptHistory";
import { QuickActions } from "./QuickActions";

type AIChatPanelProps = {
  projectTitle?: string;
  environmentName?: string;
  onSubmitPrompt?: (prompt: string) => void;
  onClose?: () => void;
};

export function AIChatPanel({
  projectTitle = "Projeto",
  environmentName = "Ambiente",
  onSubmitPrompt,
  onClose,
}: AIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);

  const contextLabel = useMemo(() => {
    return `${projectTitle} • ${environmentName}`;
  }, [projectTitle, environmentName]);

  const submit = (value?: string) => {
    const finalPrompt = (value || prompt).trim();
    if (!finalPrompt) return;

    const item: PromptHistoryItem = {
      id: `${Date.now()}`,
      prompt: finalPrompt,
      createdAt: new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    };

    setHistory((current) => [item, ...current]);
    setPrompt("");
    onSubmitPrompt?.(finalPrompt);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">IA contextual</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">ARQDOR Copilot</h3>
            <p className="mt-1 text-xs text-slate-500">{contextLabel}</p>
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              Fechar
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <section>
          <p className="mb-3 text-sm font-semibold text-slate-950">Ações rápidas</p>
          <QuickActions onSelect={submit} />
        </section>

        <section>
          <p className="mb-3 text-sm font-semibold text-slate-950">Sugestões da IA</p>
          <AISuggestions onUse={submit} />
        </section>

        <section>
          <p className="mb-3 text-sm font-semibold text-slate-950">Histórico</p>
          <PromptHistory items={history} onReuse={(value) => setPrompt(value)} />
        </section>
      </div>

      <div className="border-t border-slate-100 p-4">
        <label className="sr-only" htmlFor="arqdor-ai-prompt">
          Comando para IA
        </label>
        <textarea
          id="arqdor-ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ex: deixe essa cozinha mais sofisticada..."
          className="min-h-[92px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />

        <button
          type="button"
          onClick={() => submit()}
          className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!prompt.trim()}
        >
          Enviar comando
        </button>
      </div>
    </div>
  );
}
