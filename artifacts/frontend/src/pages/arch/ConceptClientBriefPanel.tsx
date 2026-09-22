import { useMemo, useState } from "react";
import {
  BedDouble,
  CarFront,
  ChefHat,
  Check,
  Home,
  Laptop,
  Layers3,
  Sparkles,
  Waves,
} from "lucide-react";
import type { ClientBrief } from "./conceptClientBrief";

type Props = {
  onGenerate: (brief: ClientBrief) => void;
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
  children: React.ReactNode;
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
  icon: typeof Home;
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

export default function ConceptClientBriefPanel({ onGenerate }: Props) {
  const [brief, setBrief] = useState<ClientBrief>(DEFAULT_BRIEF);

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
              Escolha as necessidades principais. O Arqdor monta uma primeira planta e você ajusta depois.
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
        onClick={() => onGenerate(brief)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600"
      >
        <Sparkles className="h-4 w-4" />
        Gerar planta sugerida
      </button>

      <p className="text-center text-[10px] leading-4 text-slate-400">
        A proposta é inicial. Depois você pode mover ambientes, alterar medidas, portas, janelas e materiais.
      </p>
    </div>
  );
}
