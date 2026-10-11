import type { SurveyElement } from "./SurveyElementsEditor";

export default function SurveyPlanPreview({ elements }: { elements: SurveyElement[] }) {
  const walls = elements.filter((e) => e.elementType === "wall" && e.verified && [e.x1Mm, e.y1Mm, e.x2Mm, e.y2Mm].every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1000000));
  if (!walls.length) return <p className="text-xs">Informe duas extremidades e confira uma parede para visualizar a planta.</p>;
  const coordinates = walls.flatMap((w) => [[w.x1Mm!, w.y1Mm!], [w.x2Mm!, w.y2Mm!]]);
  const minX = Math.min(...coordinates.map((p) => p[0])) - 300;
  const minY = Math.min(...coordinates.map((p) => p[1])) - 300;
  const width = Math.max(1000, Math.max(...coordinates.map((p) => p[0])) - minX + 300);
  const height = Math.max(1000, Math.max(...coordinates.map((p) => p[1])) - minY + 300);
  return <section className="rounded-lg border p-3 space-y-2">
    <h4 className="font-semibold text-sm">Prévia 2D de paredes verificadas</h4>
    <svg className="w-full max-h-80" viewBox={String(minX)+" "+String(minY)+" "+String(width)+" "+String(height)} aria-label="Planta prévia, sem aprovação para fabricação">
      {walls.map((w) => <line key={w.id} x1={w.x1Mm} y1={w.y1Mm} x2={w.x2Mm} y2={w.y2Mm} stroke="currentColor" strokeWidth={w.thicknessMm ?? 150}/>)}
    </svg>
    <p className="text-xs text-amber-700">Prévia não homologada. Não cria projeto nem libera fabricação.</p>
  </section>;
}
