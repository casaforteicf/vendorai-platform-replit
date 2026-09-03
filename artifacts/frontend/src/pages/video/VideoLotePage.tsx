import { useLocation } from "wouter";
import { ArrowLeft, LayoutGrid, Sparkles } from "lucide-react";

export default function VideoLotePage() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <button onClick={() => navigate("/content-studio/video")} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar para Vídeo com IA
        </button>
        <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-300"><LayoutGrid className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-bold">Vídeo em lote — VendorAI Media Engine</h1>
              <p className="text-sm text-gray-400">Produção em lote será feita pelo motor próprio do VendorAI.</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex gap-3">
            <Sparkles className="h-5 w-5 text-cyan-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Em construção</p>
              <p className="text-xs text-gray-500 mt-1">O lote será liberado quando os perfis próprios de pessoa/voz e a geração audiovisual do VendorAI estiverem prontos. Nenhum provedor externo de avatar será usado.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
