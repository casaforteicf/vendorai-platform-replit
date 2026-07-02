import { useLocation } from "wouter";
import { ArrowLeft, LayoutGrid } from "lucide-react";

export default function VideoLotePage() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8] flex flex-col">
      <div className="max-w-3xl mx-auto px-4 py-8 w-full space-y-6">
        <button
          onClick={() => navigate("/content-studio/video")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20">
            <LayoutGrid className="h-5 w-5 text-blue-300" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">Vídeo em lote</h1>
            <p className="text-sm text-gray-400">Gere dezenas de vídeos personalizados a partir de uma planilha</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-3">
          <p className="text-gray-300 font-medium">Em construção</p>
          <p className="text-sm text-gray-500">Este fluxo será implementado na próxima etapa do briefing (Passo 5).</p>
        </div>
      </div>
    </div>
  );
}
