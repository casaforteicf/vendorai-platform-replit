import { useLocation } from "wouter";
import { ArrowLeft, Mic2, ShieldCheck, Sparkles } from "lucide-react";

export default function VideoAvatarPage() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <button onClick={() => navigate("/content-studio/video")} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar para Vídeo com IA
        </button>
        <section className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-300"><Mic2 className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-bold">Pessoa / Avatar — VendorAI Media Engine</h1>
              <p className="text-sm text-gray-400">Motor próprio em construção, sem provedor externo de avatar.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <ShieldCheck className="h-4 w-4 text-emerald-400 mb-2" />
              <p className="font-semibold">Identidade autorizada</p>
              <p className="text-xs text-gray-500 mt-1">Pessoa, rosto e voz serão cadastrados com consentimento e permissões de uso.</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <Sparkles className="h-4 w-4 text-cyan-400 mb-2" />
              <p className="font-semibold">Geração própria</p>
              <p className="text-xs text-gray-500 mt-1">Persona, voz e lip-sync serão executados pelo Media Engine do VendorAI.</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">Enquanto este motor é concluído, edição, clipes e legendagem já funcionam no VendorAI Media Engine.</p>
        </section>
      </div>
    </div>
  );
}
