import { useMemo } from "react";
import { CONCEPT_TYPOLOGIES, type ConceptTypology } from "./conceptTemplates";

type Props = {
  typology: ConceptTypology;
  lotWidth: number;
  lotDepth: number;
  variant?: number;
};

const REAL_PROJECT_IMAGES: Record<ConceptTypology, { src: string; position?: string }> = {
  terrea_2q: {
    src: "https://images.pexels.com/photos/9976121/pexels-photo-9976121.jpeg?auto=compress&dpr=1&h=750&w=1260",
    position: "center",
  },
  terrea_3q: {
    src: "https://images.pexels.com/photos/7587880/pexels-photo-7587880.jpeg?auto=compress&dpr=1&h=750&w=1260",
    position: "center",
  },
  terrea_lazer: {
    src: "https://images.pexels.com/photos/29334485/pexels-photo-29334485/free-photo-of-modern-brazilian-patio-with-pool-and-seating.png?auto=compress&dpr=1&h=750&w=1260",
    position: "center",
  },
  sobrado_3q: {
    src: "https://images.pexels.com/photos/32666364/pexels-photo-32666364.jpeg?cs=tinysrgb&w=1260&fit=max",
    position: "center",
  },
  sobrado_master: {
    src: "https://images.pexels.com/photos/29334668/pexels-photo-29334668/free-photo-of-modern-luxury-villa-with-pool-in-brazil.png?auto=compress&dpr=1&h=750&w=1260",
    position: "center",
  },
};

export default function ConceptTypologyPreview({
  typology,
  lotWidth,
  lotDepth,
}: Props) {
  const template = useMemo(
    () => CONCEPT_TYPOLOGIES.find((item) => item.id === typology) ?? CONCEPT_TYPOLOGIES[0],
    [typology],
  );

  const image = REAL_PROJECT_IMAGES[typology];

  return (
    <div
      className="relative h-full min-h-[190px] overflow-hidden rounded-xl bg-slate-200"
      role="img"
      aria-label={`Referência visual real para ${template.title}`}
    >
      <img
        src={image.src}
        alt={`Referência arquitetônica real de ${template.title}`}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
        style={{ objectPosition: image.position ?? "center" }}
        loading="lazy"
        referrerPolicy="no-referrer"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45" />

      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/30 bg-black/55 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
          {template.floors === 1 ? "Casa térrea" : "Sobrado"}
        </span>
        <span className="rounded-full border border-white/30 bg-white/90 px-2.5 py-1 text-[10px] font-bold text-slate-700 backdrop-blur-sm">
          Referência real
        </span>
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
        <div className="rounded-lg bg-black/45 px-2.5 py-1.5 text-white backdrop-blur-sm">
          <div className="text-xs font-extrabold">{template.suggestedArea} m²</div>
          <div className="text-[10px] font-medium text-white/85">
            lote {lotWidth.toFixed(0)} × {lotDepth.toFixed(0)} m
          </div>
        </div>
      </div>
    </div>
  );
}
