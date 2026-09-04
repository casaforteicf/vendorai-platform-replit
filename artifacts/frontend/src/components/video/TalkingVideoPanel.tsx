import { useEffect, useState } from "react";
import AutomaticVoiceSelectionNotice from "./AutomaticVoiceSelectionNotice";
import TalkingVideoPanelCore from "./TalkingVideoPanelCore";
import MultilingualVoicePanel, { type MultilingualVoiceProfile } from "./MultilingualVoicePanel";

type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";

type Props = {
  tenantId: string;
  identityId: string;
  identityName: string;
  faceReferenceAssetId?: string | null;
  voices: MultilingualVoiceProfile[];
  activeConsentScopes: Set<ConsentScope>;
  voiceEngineReady: boolean;
  lipSyncEngineReady: boolean;
};

export default function TalkingVideoPanel(props: Props) {
  const [voices, setVoices] = useState<MultilingualVoiceProfile[]>(props.voices);

  useEffect(() => {
    setVoices(props.voices);
  }, [props.identityId, props.voices]);

  const handleVoiceAdded = (voice: MultilingualVoiceProfile) => {
    setVoices((current) => [voice, ...current.filter((item) => item.id !== voice.id)]);
  };

  return (
    <div className="space-y-5">
      <MultilingualVoicePanel
        tenantId={props.tenantId}
        identityId={props.identityId}
        identityName={props.identityName}
        voices={voices}
        voiceUseAuthorized={props.activeConsentScopes.has("voice_use")}
        onVoiceAdded={handleVoiceAdded}
      />
      <AutomaticVoiceSelectionNotice voices={voices} />
      <TalkingVideoPanelCore
        tenantId={props.tenantId}
        identityId={props.identityId}
        identityName={props.identityName}
        faceReferenceAssetId={props.faceReferenceAssetId}
        voices={voices}
        activeConsentScopes={props.activeConsentScopes}
        voiceEngineReady={props.voiceEngineReady}
        lipSyncEngineReady={props.lipSyncEngineReady}
      />
    </div>
  );
}
