import React from "react";

export type AISuggestion = {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  prompt?: string;
};

const defaultSuggestions: AISuggestion[] = [
  {
    id: "briefing",
    title: "Sugestão discreta",
    description: "Quando o briefing estiver completo, a IA poderá sugerir melhorias alinhadas ao cliente.",
    actionLabel: "Usar sugestão",
    prompt: "Sugira melhorias com base no briefing deste ambiente.",
  },
  {
    id: "versions",
    title: "Explorar alternativas",
    description: "Gere variações sem perder o histórico do conceito atual.",
    actionLabel: "Gerar opções",
    prompt: "Gere 3 alternativas para este ambiente mantendo a proposta principal.",
  },
];

type AISuggestionsProps = {
  suggestions?: AISuggestion[];
  onUse?: (prompt: string) => void;
};

export function AISuggestions({ suggestions = defaultSuggestions, onUse }: AISuggestionsProps) {
  return (
    <div className="space-y-3">
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} className="rounded-3xl bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-950">{suggestion.title}</p>
          <p className="mt-1 text-xs leading-5 text-violet-700">{suggestion.description}</p>
          {suggestion.prompt ? (
            <button
              type="button"
              onClick={() => onUse?.(suggestion.prompt || "")}
              className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100"
            >
              {suggestion.actionLabel || "Aplicar"}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
