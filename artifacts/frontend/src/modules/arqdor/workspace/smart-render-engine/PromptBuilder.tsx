import React, { useState } from "react";

type PromptBuilderProps = {
  onGenerate?: (prompt: string) => void;
};

const suggestions = [
  "Melhorar qualidade mantendo o conceito",
  "Gerar versão noturna",
  "Trocar iluminação para mais aconchegante",
  "Adicionar decoração elegante",
  "Criar versão mais sofisticada",
  "Criar versão mais econômica",
];

export function PromptBuilder({ onGenerate }: PromptBuilderProps) {
  const [prompt, setPrompt] = useState("");

  const submit = (value?: string) => {
    const finalPrompt = (value || prompt).trim();
    if (!finalPrompt) return;
    onGenerate?.(finalPrompt);
    setPrompt("");
  };

  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Prompt Builder</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Gerar nova versão</h3>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ex: deixar a cozinha mais sofisticada, mantendo bancada e layout..."
        className="mt-4 min-h-[120px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
      />

      <button
        type="button"
        onClick={() => submit()}
        disabled={!prompt.trim()}
        className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Gerar versão
      </button>

      <div className="mt-5 grid grid-cols-1 gap-2">
        {suggestions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => submit(item)}
            className="rounded-2xl bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-700"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
