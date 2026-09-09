import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canSpeakJarvis, speakJarvis, VOICE_READY_EVENT } from "@/lib/jarvisVoiceResponseBridge";

type VoiceReadyDetail = {
  content?: string;
  supported?: boolean;
  autoEnabled?: boolean;
};

export function JarvisVoiceReplayControl() {
  const [lastResponse, setLastResponse] = useState("");
  const [supported, setSupported] = useState(() => canSpeakJarvis());

  useEffect(() => {
    const onVoiceReady = (event: Event) => {
      const detail = (event as CustomEvent<VoiceReadyDetail>).detail;
      if (typeof detail?.supported === "boolean") setSupported(detail.supported);
      if (typeof detail?.content === "string" && detail.content.trim()) {
        setLastResponse(detail.content.trim());
      }
    };

    window.addEventListener(VOICE_READY_EVENT, onVoiceReady);
    return () => window.removeEventListener(VOICE_READY_EVENT, onVoiceReady);
  }, []);

  if (!lastResponse) return null;

  return (
    <div className="jarvis-voice-replay-control fixed bottom-4 right-20 z-[51]">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-12 w-12 rounded-full bg-background shadow-lg"
        onClick={() => {
          if (supported) speakJarvis(lastResponse);
        }}
        disabled={!supported}
        title={supported ? "Ouvir novamente a última resposta do JARVIS" : "Síntese de voz indisponível neste dispositivo"}
        aria-label={supported ? "Ouvir última resposta do JARVIS" : "Voz indisponível neste dispositivo"}
      >
        {supported ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </Button>
    </div>
  );
}
