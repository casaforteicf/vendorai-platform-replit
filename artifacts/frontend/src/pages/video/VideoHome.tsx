import { useLocation } from "wouter";
import { ArrowRight, Mic2, ShoppingBag, Scissors, Clapperboard, LayoutGrid, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoCard {
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  iconBg: string;
  route: string;
  badge?: string;
  badgeColor?: string;
}

const CARDS: VideoCard[] = [
  {
    title: "Avatar falando",
    description: "Gere um vídeo com avatar narrando seu conteúdo a partir de um roteiro ou foto.",
    icon: Mic2,
    gradient: "from-purple-600/30 via-violet-500/20 to-purple-900/10",
    iconBg: "bg-purple-500/20 text-purple-300",
    route: "/content-studio/video/avatar",
    badge: "Disponível",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  {
    title: "Vídeo de Produto",
    description: "Gere storyboard e roteiro completo para apresentar um produto em Stories ou Reels.",
    icon: ShoppingBag,
    gradient: "from-amber-600/30 via-orange-500/20 to-amber-900/10",
    iconBg: "bg-amber-500/20 text-amber-300",
    route: "/content-studio/video/produto",
    badge: "Disponível",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  {
    title: "Edição automática",
    description: "Suba um vídeo bruto e a IA remove silêncios e palavras de preenchimento.",
    icon: Scissors,
    gradient: "from-emerald-600/30 via-teal-500/20 to-emerald-900/10",
    iconBg: "bg-emerald-500/20 text-emerald-300",
    route: "/content-studio/video/edicao",
    badge: "Disponível",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  {
    title: "Clipes automáticos",
    description: "Transforme vídeos longos em 2–4 clipes curtos no formato 9:16 para Reels e Stories.",
    icon: Clapperboard,
    gradient: "from-rose-600/30 via-pink-500/20 to-rose-900/10",
    iconBg: "bg-rose-500/20 text-rose-300",
    route: "/content-studio/video/clipes",
    badge: "Disponível",
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  {
    title: "Vídeo em lote",
    description: "Gere dezenas de vídeos personalizados de uma vez a partir de uma planilha de leads.",
    icon: LayoutGrid,
    gradient: "from-blue-600/30 via-indigo-500/20 to-blue-900/10",
    iconBg: "bg-blue-500/20 text-blue-300",
    route: "/content-studio/video/lote",
    badge: "Disponível",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
];

export default function VideoHome() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-7">

        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h1 className="text-2xl font-extrabold bg-gradient-to-r from-[#A78BFA] to-[#22D3EE] bg-clip-text text-transparent">
              Vídeo com IA
            </h1>
          </div>
          <p className="text-sm text-gray-400 ml-7">
            Escolha o tipo de vídeo que você quer criar para sua empresa
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => {
            const Icon = card.icon;
            const isAvailable = card.badge === "Disponível";
            return (
              <button
                key={card.route}
                onClick={() => navigate(card.route)}
                disabled={!isAvailable}
                className={cn(
                  "group relative text-left rounded-2xl border p-5 transition-all duration-200",
                  "bg-gradient-to-br border-white/10",
                  card.gradient,
                  isAvailable
                    ? "hover:border-white/25 hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-900/20 cursor-pointer"
                    : "opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={cn("p-2.5 rounded-xl", card.iconBg)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  {card.badge && (
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", card.badgeColor)}>
                      {card.badge}
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-white mb-1.5 text-sm">{card.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">{card.description}</p>

                {isAvailable && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">
                    Criar agora
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
