export function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>Progresso</span>
        <span>{safeValue}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
