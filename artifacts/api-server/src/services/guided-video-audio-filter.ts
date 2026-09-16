export type GuidedAudioInputRole = "voiceover" | "music" | "sfx" | "jingle";
export type GuidedAudioIndexes = Partial<Record<GuidedAudioInputRole, number>>;

export type GuidedAudioFilterGraphInput = {
  duration: number;
  sceneCount: number;
  indexes: GuidedAudioIndexes;
};

function normalizedAudio(label: string): string {
  return `${label}aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`;
}

export function buildGuidedAudioFilterGraph(input: GuidedAudioFilterGraphInput): string {
  const durationSeconds = Math.max(0.1, Number(input.duration) || 0.1);
  const sceneCount = Math.max(1, Math.round(Number(input.sceneCount) || 1));
  const duration = durationSeconds.toFixed(3);
  const filter: string[] = [`[0:a]atrim=0:${duration},asetpts=N/SR/TB[bed]`];
  const mixLabels = ["[bed]"];
  const voiceIndex = input.indexes.voiceover;
  const musicIndex = input.indexes.music;

  if (typeof voiceIndex === "number") {
    filter.push(`${normalizedAudio(`[${voiceIndex}:a]`)},volume=1,apad,atrim=0:${duration},asetpts=N/SR/TB[voiceprep]`);
    if (typeof musicIndex === "number") {
      filter.push("[voiceprep]asplit=2[voicemix][voicesc]");
      mixLabels.push("[voicemix]");
    } else {
      mixLabels.push("[voiceprep]");
    }
  }

  if (typeof musicIndex === "number") {
    const fadeOutStart = Math.max(0, durationSeconds - 0.65).toFixed(3);
    filter.push(`${normalizedAudio(`[${musicIndex}:a]`)},volume=0.24,atrim=0:${duration},afade=t=in:st=0:d=0.25,afade=t=out:st=${fadeOutStart}:d=0.65,asetpts=N/SR/TB[musicraw]`);
    if (typeof voiceIndex === "number") {
      filter.push("[musicraw][voicesc]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=300[musicmix]");
      mixLabels.push("[musicmix]");
    } else {
      mixLabels.push("[musicraw]");
    }
  }

  const sfxIndex = input.indexes.sfx;
  if (typeof sfxIndex === "number") {
    const count = Math.max(1, Math.min(5, sceneCount - 1));
    const sourceLabels = Array.from({ length: count }, (_, index) => `sfxsrc${index}`);
    const preparedLabel = "sfxprepared";
    filter.push(`${normalizedAudio(`[${sfxIndex}:a]`)}[${preparedLabel}]`);
    if (count > 1) filter.push(`[${preparedLabel}]asplit=${count}${sourceLabels.map((label) => `[${label}]`).join("")}`);
    for (let index = 0; index < count; index += 1) {
      const source = count > 1 ? `[${sourceLabels[index]}]` : `[${preparedLabel}]`;
      const positionSeconds = sceneCount > 1 ? (durationSeconds * (index + 1)) / (count + 1) : 0;
      const delay = Math.max(0, Math.round(positionSeconds * 1000));
      const label = `sfxmix${index}`;
      filter.push(`${source}atrim=0:0.85,volume=0.30,adelay=${delay}|${delay},asetpts=N/SR/TB[${label}]`);
      mixLabels.push(`[${label}]`);
    }
  }

  const jingleIndex = input.indexes.jingle;
  if (typeof jingleIndex === "number") {
    const windowSeconds = Math.min(3, durationSeconds);
    const delay = Math.max(0, Math.round((durationSeconds - windowSeconds) * 1000));
    filter.push(`${normalizedAudio(`[${jingleIndex}:a]`)},atrim=0:${windowSeconds.toFixed(3)},volume=0.48,adelay=${delay}|${delay},asetpts=N/SR/TB[jinglemix]`);
    mixLabels.push("[jinglemix]");
  }

  filter.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,loudnorm=I=-16:LRA=11:TP=-1.5,alimiter=limit=0.95:level=false[aout]`);
  return filter.join(";");
}
