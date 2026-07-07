import React from "react";

export type PromptHistoryItem = {
  id: string;
  prompt: string;
  createdAt?: string;
};

type PromptHistoryProps = {
  items: PromptHistoryItem[];
  onReuse?: (prompt: string) => void;
};

export function PromptHistory({ items, onReuse }: PromptHistoryProps) {
  if (!items.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        O histórico de comandos aparecerá aqui.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 6).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onReuse?.(item.prompt)}
          className="w-full rounded-2xl border border-slate-100 bg-white p-3 text-left transition hover:border-violet-200 hover:bg-violet-50"
        >
          <p className="line-clamp-2 text-xs font-medium leading-5 text-slate-700">{item.prompt}</p>
          {item.createdAt ? <p className="mt-1 text-[11px] text-slate-400">{item.createdAt}</p> : null}
        </button>
      ))}
    </div>
  );
}
