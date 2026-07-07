import type { ArqdorRadarItem } from "../types/arqdor.types";
import { ArqCard } from "./ArqCard";

const dotClass: Record<ArqdorRadarItem["type"], string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  critical: "bg-rose-500",
};

export function RadarCard({ items }: { items: ArqdorRadarItem[] }) {
  return (
    <ArqCard className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-950">Radar do projeto</h3>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">IA</span>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex gap-3">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[item.type]}`} />
              <div>
                <p className="text-sm font-medium text-slate-800">{item.title}</p>
                {item.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ArqCard>
  );
}
