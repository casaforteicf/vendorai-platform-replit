import React from "react";

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-slate-950" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
