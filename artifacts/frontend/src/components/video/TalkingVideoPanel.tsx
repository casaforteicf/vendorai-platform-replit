import { useMemo, useState } from "react";
import { Loader2, Sparkles, Video, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type VoiceProfile = {
  id: string;
  name: string;
  status: string;
  reference_asset_id?: string | null;
};

type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";

type TalkingVideoResult = {
  provider: "vendorai";
  operation: "talking_video";
  voice: {
    audioUrl: string;
    assetId: string;
    projectId: string;
    jobId: string;
    versionId: string;
  };
  video: {
    videoUrl: string;
    assetId: string;
    projectId: string;
    jobId: string;
    versionId: string;
  };
};

type Props = {
  tenantId: string;
  identityId: string;
  identityName: string;
  faceReferenceAssetId?: string | null;
  voices: VoiceProfile[];
  activeConsentScopes: Set<ConsentScope>;
  voiceEngineReady: boolean;
  lipSyncEngineReady: boolean;
};

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    "Content-Type": "application/json",
  };
}

export default function TalkingVideoPanel({
  tenantId,
  identityId,
  identityName,
  faceReferenceAssetId,
  voices,
  activeConsentScopes,
  voiceEngineReady,
  lipSyncEngineReady,
}: Props) {
  const { toast } = useToast();
  const readyVoices = useMemo(() => voices.filter((voice) => voice.status === "ready" && voice.reference_asset_id), [voices]);
  const [voiceProfileId, setVoiceProfileId] = useState(readyVoices[0]?.id ?? "");
  const [script, setScript] = useState("Olá! Este vídeo foi criado com minha identidade e voz autorizadas no VendorAI.");
  const [bboxShift, setBboxShift] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TalkingVideoResult | null>(null);

  const requiredConsentsReady = activeConsentScopes.has("face_use")
    && activeConsentScopes.has("voice_use")
    && activeConsentScopes.has("ai_generation");
  const faceReady = Boolean(faceReferenceAssetId);
  const selectedVoiceId = readyVoices.some((voice) => voice.id === voiceProfileId)
    ? voiceProfileId
    : readyVoices[0]?.id ?? "";
  const canGenerate = voiceEngineReady
    && lipSyncEngineReady
    && faceReady
    && requiredConsentsReady
    && Boolean(selectedVoiceId)
    && Boolean(script.trim())
    && !generating;

  const blockers = [
    !voiceEngineReady ? "motor de voz" : null,
    !lipSyncEngineReady ? "motor de lip-sync" : null,
    !faceReady ? "foto de referência" : null,
    readyVoices.length === 0 ? "voz pronta" : null,
    !activeConsentScopes.has("face_use") ? "autorização de rosto" : null,
    !activeConsentScopes.has("voice_use") ? "autorização de voz" : null,
    !activeConsentScopes.has("ai_generation") ? "autorização de geração IA" : null,
  ].filter(Boolean) as string[];

  const generate = async () => {
    if (!canGenerate || !selectedVoiceId) return;
    setGenerating(true);
    setResult(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/talking-video`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          voiceProfileId: selectedVoiceId,
          text: script.trim(),
          language: "pt-br",
          title: `Vídeo falado — ${identityName}`,
          bboxShift,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? `Falha ao gerar vídeo (${response.status})`);
      setResult(data as TalkingVideoResult);
      toast({ title: "Vídeo falado gerado", description: "A narração e o MP4 foram salvos na Biblioteca Audiovisual." });
    } catch (error) {
      toast({
        title: "Não foi possível gerar o vídeo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-purple-300" />
            <p className="text-sm font-semibold">Criar vídeo falado</p>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Texto → voz autorizada → sincronização labial → MP4 salvo na Biblioteca.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn("rounded-full border px-2 py-1 text-[10px]", voiceEngineReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>
            Voz {voiceEngineReady ? "pronta" : "aguardando GPU"}
          </span>
          <span className={cn("rounded-full border px-2 py-1 text-[10px]", lipSyncEngineReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>
            Lip-sync {lipSyncEngineReady ? "pronto" : "aguardando GPU"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-gray-300">Voz autorizada</span>
          <select
            value={selectedVoiceId}
            onChange={(event) => setVoiceProfileId(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-purple-500/50"
          >
            {readyVoices.length === 0 && <option value="">Nenhuma voz pronta</option>}
            {readyVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-gray-300">Ajuste facial</span>
          <input
            type="number"
            min={-20}
            max={20}
            value={bboxShift}
            onChange={(event) => setBboxShift(Math.max(-20, Math.min(20, Number(event.target.value) || 0)))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-purple-500/50"
          />
        </label>
      </div>

      <label className="space-y-1.5 block">
        <span className="text-xs font-medium text-gray-300">Roteiro da fala</span>
        <textarea
          value={script}
          onChange={(event) => setScript(event.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Digite o que a pessoa autorizada deve falar..."
          className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-purple-500/50"
        />
        <span className="block text-[10px] text-gray-600 text-right">{script.length}/5000</span>
      </label>

      {blockers.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
          Para gerar, falta: {blockers.join(", ")}.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={!canGenerate}
          onClick={() => void generate()}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "Gerando voz e vídeo..." : "Gerar vídeo falado"}
        </button>
        {generating && <span className="text-[11px] text-gray-500">A geração pode levar alguns minutos conforme a GPU e a duração da fala.</span>}
      </div>

      {result && (
        <div className="grid gap-3 lg:grid-cols-[1fr_220px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <video controls src={result.video.videoUrl} className="w-full max-h-[460px] rounded-lg bg-black" />
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-emerald-200">Vídeo pronto</p>
              <p className="text-[11px] text-gray-500 mt-1">MP4 e narração foram versionados na Biblioteca Audiovisual.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300"><Volume2 className="h-3.5 w-3.5 text-cyan-300" /> Narração gerada</div>
            <audio controls src={result.voice.audioUrl} className="h-8 w-full" />
          </div>
        </div>
      )}
    </section>
  );
}
