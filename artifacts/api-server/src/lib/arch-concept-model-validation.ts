type Item = Record<string, unknown>;
const record = (value: unknown): value is Item => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (...values: unknown[]) => values.every(value => typeof value === "number" && Number.isFinite(value));
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
const rectangle = (value: Item) => finite(value.x, value.y) && positive(value.width) && positive(value.depth) && finite(Number(value.x) + Number(value.width), Number(value.y) + Number(value.depth));
/** Validate the versioned persisted contract without coercing or changing geometry. */
export function architecturalModelError(input: unknown): string | null {
  if (input === undefined || input === null) return null; // Legacy snapshots.
  if (!record(input) || input.version !== 1) return "Modelo arquitetônico incompatível.";
  const keys = ["slabs", "stairs", "roofs", "openings"] as const;
  if (!keys.every(key => Array.isArray(input[key]))) return "Listas do modelo arquitetônico inválidas.";
  const ids = new Set<string>();
  for (const key of keys) for (const raw of input[key] as unknown[]) {
    if (!record(raw) || typeof raw.id !== "string" || !raw.id.trim() || ids.has(raw.id)) return "Identificador arquitetônico inválido ou duplicado.";
    ids.add(raw.id);
    if ((key === "slabs" || key === "stairs") && (!Number.isInteger(raw.floor) || Number(raw.floor) < 0)) return "Pavimento inválido.";
    if (key === "slabs") {
      if (!rectangle(raw) || !positive(raw.thickness) || !finite(raw.elevation) || !Array.isArray(raw.voids)) return "Laje inválida.";
      const holes = raw.voids;
      for (const hole of holes) {
        if (!record(hole) || !rectangle(hole) || Number(hole.x) < Number(raw.x) || Number(hole.y) < Number(raw.y) || Number(hole.x) + Number(hole.width) > Number(raw.x) + Number(raw.width) || Number(hole.y) + Number(hole.depth) > Number(raw.y) + Number(raw.depth)) return "Vão fora da laje.";
      }
      for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
        const a = holes[i] as Item, b = holes[j] as Item;
        if (Math.min(Number(a.x) + Number(a.width), Number(b.x) + Number(b.width)) > Math.max(Number(a.x), Number(b.x)) + 1e-9 && Math.min(Number(a.y) + Number(a.depth), Number(b.y) + Number(b.depth)) > Math.max(Number(a.y), Number(b.y)) + 1e-9) return "Vãos sobrepostos.";
      }
    } else if (key === "stairs") {
      const preferred = raw.preferredRiser ?? 0.175;
      if (!finite(raw.x, raw.y, preferred) || !positive(raw.width) || !positive(raw.run) || !positive(raw.rise) || Number(preferred) < 0.1 || Number(preferred) > 0.22 || (raw.openSlab !== undefined && typeof raw.openSlab !== "boolean")) return "Escada inválida.";
      const steps = Math.max(2, Math.round(Number(raw.rise) / Number(preferred)));
      const riser = Number(raw.rise) / steps, tread = Number(raw.run) / (steps - 1);
      if (riser < 0.1 || riser > 0.22 || tread < 0.2 || tread > 0.45) return "Proporções da escada inválidas.";
    } else if (key === "roofs") {
      if (!rectangle(raw) || !finite(raw.elevation, raw.pitchDegrees, raw.overhang) || Number(raw.overhang) < 0 || Number(raw.pitchDegrees) < 0 || Number(raw.pitchDegrees) > 60 || !["flat", "mono", "gable"].includes(String(raw.type)) || (raw.type === "flat" && raw.pitchDegrees !== 0)) return "Cobertura inválida.";
      const span = raw.type === "gable" ? Number(raw.depth) / 2 : raw.type === "mono" ? Number(raw.depth) : 0;
      if (!finite(Number(raw.elevation) + Math.tan(Number(raw.pitchDegrees) * Math.PI / 180) * span, Number(raw.width) + 2 * Number(raw.overhang), Number(raw.depth) + 2 * Number(raw.overhang), Number(raw.x) - Number(raw.overhang), Number(raw.y) - Number(raw.overhang))) return "Cobertura ultrapassa limites numéricos.";
    } else if (typeof raw.wallId !== "string" || !raw.wallId.trim() || !["door", "window"].includes(String(raw.type)) || !positive(raw.width) || !positive(raw.height) || !finite(raw.sillHeight, Number(raw.sillHeight) + Number(raw.height)) || Number(raw.sillHeight) < 0 || !Number.isInteger(raw.quantity) || Number(raw.quantity) < 1) return "Esquadria inválida.";
  }
  return null;
}
