import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BedDouble,
  CarFront,
  ChefHat,
  Check,
  Home,
  Laptop,
  Layers3,
  Sparkles,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  buildClientBriefAlternatives,
  type ClientBrief,
  type ClientBriefAlternative,
} from "./conceptClientBrief";

type Props = {
  lotWidth: number;
  lotDepth: number;
  onGenerate: (alternative: ClientBriefAlternative) => void;
};

const DEFAULT_BRIEF: ClientBrief = {
  bedrooms: 3,
  suites: 1,
  floors: 1,
  garageSpaces: 2,
  gourmet: true,
  pool: false,
  office: false,
  integratedKitchen: true,
  privateAwaySocial: true,
};

function ChoiceButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "rounded-xl border-2 border-orange-500 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800"
        : "rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
    >
      {children}
    </button>
  );
}

function ToggleCard({
  active,
  icon: Icon,
  title,
  helper,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "flex w-full items-start gap-3 rounded-xl border-2 border-orange-500 bg-orange-50 p-3 text-left"
        : "flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left hover:border-slate-300"}
    >
      <span className={active
        ? "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500 text-white"
        : "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{helper}</span>
      </span>
      <span className={active
        ? "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-orange-500 text-white"
        : "h-5 w-5 shrink-0 rounded-full border bg-white"}
      >
        {active && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function roomFill(kind: string) {
  if (kind === "sala") return "#fde68a";
  if (kind === "cozinha") return "#fdba74";
  if (kind === "suite") return "#ddd6fe";
  if (kind === "quarto") return "#e0e7ff";
  if (kind === "banheiro") return "#bae6fd";
  if (kind === "garagem") return "#cbd5e1";
  if (kind === "gourmet") return "#fed7aa";
  if (kind === "piscina") return "#7dd3fc";
  if (kind === "lavanderia") return "#bfdbfe";
  if (kind === "escada") return "#d6d3d1";
  return "#e2e8f0";
}

function roomShortLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("garagem")) return "GAR";
  if (normalized.includes("sala")) return "SALA";
  if (normalized.includes("cozinha")) return "COZ";
  if (normalized.includes("suíte") || normalized.includes("suite")) return "SUÍTE";
  if (normalized.includes("quarto")) return "QTO";
  if (normalized.includes("banheiro")) return "BWC";
  if (normalized.includes("gourmet")) return "GOUR";
  if (normalized.includes("piscina")) return "PISC";
  if (normalized.includes("lavanderia")) return "LAV";
  if (normalized.includes("escritório")) return "ESC";
  if (normalized.includes("escada")) return "ESCADA";
  return label.slice(0, 5).toUpperCase();
}

function PlanMiniPreview({
  alternative,
  lotWidth,
  lotDepth,
}: {
  alternative: ClientBriefAlternative;
  lotWidth: number;
  lotDepth: number;
}) {
  const floor = 0;
  const rooms = alternative.rooms.filter((room) => room.floor === floor);
  const padding = 0.35;

  return (
    <div className="overflow-hidden rounded-xl border bg-[#f8fafc]">
      <svg
        viewBox={`${-padding} ${-padding} ${lotWidth + padding * 2} ${lotDepth + padding * 2}`}
        className="h-40 w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Prévia da ${alternative.title}`}
      >
        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="#ffffff" stroke="#94a3b8" strokeWidth="0.08" strokeDasharray="0.25 0.2" />
        {rooms.map((room) => (
          <g key={room.id}>
            <rect
              x={room.x}
              y={room.y}
              width={room.width}
              height={room.depth}
              rx="0.08"
              fill={roomFill(room.kind)}
              stroke="#334155"
              strokeWidth="0.08"
            />
            {room.width >= 2.3 && room.depth >= 1.8 && (
              <text
                x={room.x + room.width / 2}
                y={room.y + room.depth / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="0.38"
                fontWeight="700"
                fill="#334155"
              >
                {roomShortLabel(room.label)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function ConceptClientBriefPanel({
  lotWidth,
  lotDepth,
  onGenerate,
}: Props) {
  const [brief, setBrief] = useState<ClientBrief>(DEFAULT_BRIEF);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const summary = useMemo(() => {
    const items = [
      `${brief.bedrooms} dormitórios`,
      `${brief.suites} ${brief.suites === 1 ? "suíte" : "suítes"}`,
      `${brief.garageSpaces} ${brief.garageSpaces === 1 ? "vaga" : "vagas"}`,
      brief.floors === 2 ? "sobrado" : "casa térrea",
      brief.gourmet ? "gourmet" : null,
      brief.pool ? "piscina" : null,
      brief.office ? "escritório" : null,
    ].filter(Boolean);
    return items.join(" · ");
  }, [brief]);

  const alternatives = useMemo(
    () => showAlternatives ? buildClientBriefAlternatives(brief, lotWidth, lotDepth) : [],
    [brief, lotWidth, lotDepth, showAlternatives],
  );

  if (showAlternatives) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-slate-900">Escolha uma planta inicial</div>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                Geramos três organizações diferentes para o mesmo briefing. Todas continuam editáveis.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Seu briefing</div>
          <div className="mt-1 text-[11px] font-semibold leading-5 text-slate-700">{summary}</div>
        </div>

        <div className="space-y-3">
          {alternatives.map((alternative) => (
            <div key={alternative.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">{alternative.title}</div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{alternative.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                    ≈ {alternative.suggestedArea} m²
                  </span>
                </div>

                <div className="mt-3">
                  <PlanMiniPreview
                    alternative={alternative}
                    lotWidth={lotWidth}
                    lotDepth={lotDepth}
                  />
                </div>

                {alternative.floors > 1 && (
                  <div className="mt-2 text-[10px] font-semibold text-slate-500">
                    Prévia mostra o térreo · projeto com {alternative.floors} pavimentos
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onGenerate(alternative)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <Check className="h-4 w-4" />
                  Usar esta opção
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAlternatives(false)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Alterar necessidades
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">O que sua casa precisa?</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              Escolha as necessidades principais. O Arqdor gera três propostas para você comparar.
            </p>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <BedDouble className="h-4 w-4 text-slate-500" />
          Dormitórios
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([2, 3, 4] as const).map((value) => (
            <ChoiceButton
              key={value}
              active={brief.bedrooms === value}
              onClick={() => setBrief((current) => ({
                ...current,
                bedrooms: value,
                suites: Math.min(current.suites, value) as ClientBrief["suites"],
              }))}
            >
              {value} quartos
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-bold text-slate-800">Suítes</div>
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((value) => (
            <ChoiceButton
              key={value}
              active={brief.suites === value}
              onClick={() => setBrief((current) => ({ ...current, suites: value }))}
            >
              {value === 0 ? "Sem suíte" : value === 1 ? "1 suíte" : "2 suítes"}
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <Layers3 className="h-4 w-4 text-slate-500" />
          Pavimentos
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceButton
            active={brief.floors === 1}
            onClick={() => setBrief((current) => ({ ...current, floors: 1 }))}
          >
            Casa térrea
          </ChoiceButton>
          <ChoiceButton
            active={brief.floors === 2}
            onClick={() => setBrief((current) => ({ ...current, floors: 2 }))}
          >
            Sobrado
          </ChoiceButton>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <CarFront className="h-4 w-4 text-slate-500" />
          Garagem
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((value) => (
            <ChoiceButton
              key={value}
              active={brief.garageSpaces === value}
              onClick={() => setBrief((current) => ({ ...current, garageSpaces: value }))}
            >
              {value} {value === 1 ? "vaga" : "vagas"}
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-bold text-slate-800">Opcionais</div>
        <ToggleCard
          active={brief.gourmet}
          icon={ChefHat}
          title="Área gourmet"
          helper="Mantém cozinha e lazer próximos."
          onClick={() => setBrief((current) => ({ ...current, gourmet: !current.gourmet }))}
        />
        <ToggleCard
          active={brief.pool}
          icon={Waves}
          title="Piscina"
          helper="Reserva a área de lazer no fundo do lote."
          onClick={() => setBrief((current) => ({ ...current, pool: !current.pool }))}
        />
        <ToggleCard
          active={brief.office}
          icon={Laptop}
          title="Escritório"
          helper="Adiciona um ambiente dedicado para trabalho."
          onClick={() => setBrief((current) => ({ ...current, office: !current.office }))}
        />
      </section>

      <section className="space-y-2">
        <div className="text-xs font-bold text-slate-800">Preferências de organização</div>
        <ToggleCard
          active={brief.integratedKitchen}
          icon={Home}
          title="Sala e cozinha integradas"
          helper="Prioriza a área social aberta e conectada."
          onClick={() => setBrief((current) => ({ ...current, integratedKitchen: !current.integratedKitchen }))}
        />
        <ToggleCard
          active={brief.privateAwaySocial}
          icon={BedDouble}
          title="Área íntima reservada"
          helper="Afasta quartos da entrada e do convívio social."
          onClick={() => setBrief((current) => ({ ...current, privateAwaySocial: !current.privateAwaySocial }))}
        />
      </section>

      <div className="rounded-xl border bg-slate-50 p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Resumo</div>
        <div className="mt-1 text-[11px] font-semibold leading-5 text-slate-700">{summary}</div>
      </div>

      <button
        type="button"
        onClick={() => setShowAlternatives(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600"
      >
        <Sparkles className="h-4 w-4" />
        Gerar 3 opções de planta
      </button>

      <p className="text-center text-[10px] leading-4 text-slate-400">
        Você escolhe a melhor base e depois pode mover ambientes, alterar medidas, portas, janelas e materiais.
      </p>
    </div>
  );
}
