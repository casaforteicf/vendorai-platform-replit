import { useMemo, useState } from "react";

type Point = [number, number];
type Aperture = { id: string; kind: "door" | "window"; offset: number; width: number; sill: number; height: number };
type Wall = { id: string; start: Point; end: Point; thickness: number; height: number; openings: Aperture[] };
const initial: Wall[] = [
  { id: "parede-1", start: [0, 0], end: [6, 0], thickness: .2, height: 2.8, openings: [{ id: "janela-1", kind: "window", offset: 2, width: 1.5, sill: .9, height: 1.2 }] },
  { id: "parede-2", start: [6, 0], end: [6, 4], thickness: .2, height: 2.8, openings: [] },
];
const length = (wall: Wall) => Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const fixed = (value: number) => Number(value.toFixed(3));

function planOutline(wall: Wall) {
  const size = length(wall);
  const nx = -(wall.end[1] - wall.start[1]) / size * wall.thickness / 2;
  const ny = (wall.end[0] - wall.start[0]) / size * wall.thickness / 2;
  return [[wall.start[0] + nx, wall.start[1] + ny], [wall.end[0] + nx, wall.end[1] + ny],
    [wall.end[0] - nx, wall.end[1] - ny], [wall.start[0] - nx, wall.start[1] - ny]];
}
function validation(wall: Wall): string[] {
  const errors: string[] = [];
  const size = length(wall);
  if (!Number.isFinite(size) || size < .1 || size > 1000) errors.push("Comprimento de parede inválido");
  if (!Number.isFinite(wall.thickness) || wall.thickness < .05 || wall.thickness > 1) errors.push("Espessura inválida");
  for (const opening of wall.openings) {
    if (![opening.offset, opening.width, opening.sill, opening.height].every(Number.isFinite) ||
        opening.offset < 0 || opening.width <= 0 || opening.offset + opening.width > size ||
        opening.sill < 0 || opening.height <= 0 || opening.sill + opening.height > wall.height)
      errors.push(`Abertura ${opening.id} fora da parede`);
  }
  for (let i = 0; i < wall.openings.length; i++) for (let j = i + 1; j < wall.openings.length; j++) {
    const a = wall.openings[i], b = wall.openings[j];
    if (a.offset < b.offset + b.width && b.offset < a.offset + a.width &&
        a.sill < b.sill + b.height && b.sill < a.sill + a.height)
      errors.push("Aberturas sobrepostas");
  }
  return errors;
}
function segment(wall: Wall, offset: number): Point {
  const t = offset / length(wall);
  return [wall.start[0] + (wall.end[0] - wall.start[0]) * t, wall.start[1] + (wall.end[1] - wall.start[1]) * t];
}
function iso(x: number, y: number, z = 0): Point {
  return [190 + (x - y) * 28, 265 - (x + y) * 12 - z * 34];
}

export default function RenderStudioParametricEditor() {
  const [walls, setWalls] = useState<Wall[]>(initial);
  const [active, setActive] = useState(initial[0].id);
  const [drag, setDrag] = useState<{ id: string; endpoint: "start" | "end" } | null>(null);
  const [revision, setRevision] = useState(0);
  const [snap, setSnap] = useState(true);
  const chosen = walls.find(wall => wall.id === active) ?? walls[0];
  const errors = useMemo(() => walls.flatMap(wall => validation(wall).map(message => `${wall.id}: ${message}`)), [walls]);
  const change = (id: string, action: (wall: Wall) => Wall) => {
    setWalls(previous => previous.map(wall => wall.id === id ? action(wall) : wall)); setRevision(old => old + 1);
  };
  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const svg = event.currentTarget, point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    if (!matrix) return;
    const p = point.matrixTransform(matrix);
    const position: Point = [fixed(snap ? Math.round((p.x - 45) / 35 * 4) / 4 : (p.x - 45) / 35),
      fixed(snap ? Math.round((p.y - 45) / 35 * 4) / 4 : (p.y - 45) / 35)];
    change(drag.id, wall => ({ ...wall, [drag.endpoint]: position }));
  }
  function addOpening() {
    const offset = Math.max(0, (length(chosen) - 1) / 2);
    change(chosen.id, wall => ({ ...wall, openings: [...wall.openings, {
      id: `abertura-${revision + 1}`, kind: "door", offset: fixed(offset), width: 1, sill: 0, height: 2.1,
    }] }));
  }
  const field = (label: string, value: number, edit: (n: number) => void, step = .05) =>
    <label className="text-xs space-y-1"><span className="block">{label} (m)</span><input type="number" step={step}
      className="w-full rounded border p-2" value={value}
      onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n)) edit(n); }} /></label>;
  const valid = errors.length === 0;
  return <section className="space-y-3 rounded-lg border p-4" aria-label="Editor paramétrico preliminar 2D e 3D">
    <div><h3 className="font-semibold">Modelo paramétrico — edição conjunta 2D/3D</h3>
      <p className="text-xs text-slate-600">Protótipo local independente do GLB importado: a planta e a projeção espacial utilizam os mesmos dados. Alterações não são salvas no projeto.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      {walls.map(wall => <button key={wall.id} type="button" aria-pressed={active === wall.id}
        className={`rounded border px-3 py-1 text-sm ${active === wall.id ? "bg-emerald-100 border-emerald-700" : ""}`}
        onClick={() => setActive(wall.id)}>{wall.id}</button>)}
      <button type="button" className="rounded border px-2 py-1 text-sm" onClick={() => {
        const number = walls.length + 1;
        setWalls(current => [...current, { id: `parede-${number}`, start: [0, number], end: [3, number], thickness: .2, height: 2.8, openings: [] }]);
        setActive(`parede-${number}`); setRevision(n => n + 1);
      }}>+ Parede</button>
      <label className="text-xs"><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /> Snap 25 cm</label>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border p-2"><p className="text-sm font-medium">Planta 2D — arraste os pontos</p>
        <svg viewBox="0 0 430 330" role="img" aria-label="Planta editável" className="w-full touch-none"
          onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
          {walls.filter(w => length(w) >= .1).map(wall => <g key={wall.id}>
            <polygon points={planOutline(wall).map(p => `${45 + p[0] * 35},${45 + p[1] * 35}`).join(" ")}
              fill={active === wall.id ? "#86efac" : "#cbd5e1"} stroke="#334155" strokeWidth="1.5" />
            {wall.openings.map(opening => {
              const a = segment(wall, opening.offset), b = segment(wall, opening.offset + opening.width);
              return <line key={opening.id} x1={45 + a[0] * 35} y1={45 + a[1] * 35} x2={45 + b[0] * 35} y2={45 + b[1] * 35}
                stroke={opening.kind === "door" ? "#2563eb" : "#d97706"} strokeWidth="5" />;
            })}
            {(["start", "end"] as const).map(endpoint => <circle key={endpoint}
              cx={45 + wall[endpoint][0] * 35} cy={45 + wall[endpoint][1] * 35} r="6"
              fill="#0f766e" stroke="white" strokeWidth="2" onPointerDown={event => {
                event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: wall.id, endpoint });
              }} />)}
          </g>)}
        </svg>
      </div>
      <div className="rounded border p-2"><p className="text-sm font-medium">Prévia 3D — mesma geometria</p>
        <svg viewBox="0 0 430 330" role="img" aria-label="Projeção 3D sincronizada" className="w-full">
          {walls.filter(w => length(w) >= .1).map(wall => {
            const a = wall.start, b = wall.end, h = wall.height, points = [iso(...a), iso(...b), iso(b[0], b[1], h), iso(a[0], a[1], h)];
            return <g key={wall.id}><polygon points={points.map(p => p.join(",")).join(" ")}
              fill={active === wall.id ? "#86efac" : "#cbd5e1"} fillOpacity=".6" stroke="#334155" />
              {wall.openings.map(o => {
                const p = segment(wall, o.offset), q = segment(wall, o.offset + o.width);
                const window = [iso(p[0], p[1], o.sill), iso(q[0], q[1], o.sill),
                  iso(q[0], q[1], o.sill + o.height), iso(p[0], p[1], o.sill + o.height)];
                return <polygon key={o.id} points={window.map(v => v.join(",")).join(" ")}
                  fill="white" stroke={o.kind === "door" ? "#2563eb" : "#d97706"} strokeWidth="2" />;
              })}</g>;
          })}
        </svg>
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      {field("Espessura", chosen.thickness, n => change(chosen.id, wall => ({ ...wall, thickness: n })))}
      {field("Altura", chosen.height, n => change(chosen.id, wall => ({ ...wall, height: n })))}
      <div className="self-end"><button type="button" onClick={addOpening} className="rounded border px-3 py-2 text-sm">+ Porta/janela</button></div>
      {chosen.openings.map(o => <div key={o.id} className="grid grid-cols-2 gap-2 rounded border p-2 sm:col-span-3">
        <label className="text-xs">Tipo<select className="block w-full rounded border p-2" value={o.kind}
          onChange={e => change(chosen.id, wall => ({ ...wall, openings: wall.openings.map(item =>
            item.id === o.id ? { ...item, kind: e.target.value as Aperture["kind"] } : item) }))}>
          <option value="door">Porta</option><option value="window">Janela</option></select></label>
        <button className="self-end text-sm underline" type="button" onClick={() => change(chosen.id, wall => ({
          ...wall, openings: wall.openings.filter(item => item.id !== o.id) }))}>Remover abertura</button>
        {(["offset", "width", "sill", "height"] as const).map(key => <div key={key}>{field(key, o[key], n =>
          change(chosen.id, wall => ({ ...wall, openings: wall.openings.map(item =>
            item.id === o.id ? { ...item, [key]: n } : item) })))}</div>)}
      </div>)}
    </div>
    <p role="status" className={valid ? "text-sm text-emerald-800" : "text-sm text-red-700"}>
      {valid ? `Revisão local ${revision}: dados preliminares consistentes.` : errors.join(" · ")}
    </p>
    <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">As vistas são um protótipo sincronizado, não malhas BIM consolidadas. Uniões L/T/cruz, vazios booleanos, persistência, IFC e quantitativos ainda requerem integração e validação.</p>
  </section>;
}
