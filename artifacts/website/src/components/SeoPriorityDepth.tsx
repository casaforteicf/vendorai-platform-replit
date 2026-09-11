import { CheckCircle2 } from "lucide-react";
import priorityDepth from "@/data/seoPriorityDepth.json";
import prioritySupplement from "@/data/seoPrioritySupplement.json";

type PriorityDepthLocale = {
  title: string;
  paragraphs: string[];
  checklist: string[];
};

type PriorityDepthPage = {
  path: string;
  pt: PriorityDepthLocale;
  es: PriorityDepthLocale;
};

type PrioritySupplementPage = {
  path: string;
  pt: string;
  es: string;
};

export function SeoPriorityDepth({ path, isSpanish }: { path: string; isSpanish: boolean }) {
  const entry = (priorityDepth.pages as PriorityDepthPage[]).find((item) => item.path === path);
  if (!entry) return null;

  const supplement = (prioritySupplement.pages as PrioritySupplementPage[]).find((item) => item.path === path);
  const copy = isSpanish ? entry.es : entry.pt;
  const extra = supplement ? (isSpanish ? supplement.es : supplement.pt) : null;
  const checklistTitle = isSpanish ? "Checklist para evaluar tu operación" : "Checklist para avaliar sua operação";

  return (
    <section className="border-y border-slate-200 bg-white py-16 md:py-20" data-vendorai-priority-depth="true">
      <div className="container mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[1.4fr_.6fr] lg:items-start">
        <article>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">
            {isSpanish ? "Guía práctica" : "Guia prático"}
          </p>
          <h2 className="mt-3 max-w-4xl text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
            {copy.title}
          </h2>
          <div className="mt-7 space-y-5 text-base leading-8 text-slate-600">
            {copy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {extra && <p>{extra}</p>}
          </div>
        </article>

        <aside className="rounded-3xl border border-orange-200 bg-orange-50/70 p-6 shadow-sm lg:sticky lg:top-24">
          <h3 className="text-lg font-black text-slate-950">{checklistTitle}</h3>
          <ul className="mt-5 space-y-4">
            {copy.checklist.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
