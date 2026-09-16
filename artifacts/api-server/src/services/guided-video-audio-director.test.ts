import { describe, expect, it } from "vitest";
import { buildGuidedAudioFilterGraph } from "./guided-video-audio-filter.js";

describe("buildGuidedAudioFilterGraph", () => {
  it("mantém locução curta sem repetir e completa a duração com silêncio", () => {
    const graph = buildGuidedAudioFilterGraph({ duration: 20, sceneCount: 4, indexes: { voiceover: 1 } });

    expect(graph).toContain("[1:a]aresample=48000");
    expect(graph).toContain("apad,atrim=0:20.000");
    expect(graph).toContain("amix=inputs=2");
    expect(graph).not.toContain("sidechaincompress");
  });

  it("faz ducking da trilha quando existe locução", () => {
    const graph = buildGuidedAudioFilterGraph({ duration: 20, sceneCount: 4, indexes: { voiceover: 1, music: 2 } });

    expect(graph).toContain("[voiceprep]asplit=2[voicemix][voicesc]");
    expect(graph).toContain("[musicraw][voicesc]sidechaincompress");
    expect(graph).toContain("afade=t=in:st=0:d=0.25");
    expect(graph).toContain("afade=t=out:st=19.350:d=0.65");
    expect(graph).toContain("amix=inputs=3");
  });

  it("distribui efeitos sonoros pelas transições do vídeo", () => {
    const graph = buildGuidedAudioFilterGraph({ duration: 20, sceneCount: 6, indexes: { sfx: 1 } });

    expect(graph).toContain("asplit=5[sfxsrc0][sfxsrc1][sfxsrc2][sfxsrc3][sfxsrc4]");
    expect(graph).toContain("adelay=3333|3333");
    expect(graph).toContain("adelay=10000|10000");
    expect(graph).toContain("adelay=16667|16667");
    expect(graph).toContain("amix=inputs=6");
  });

  it("posiciona assinatura sonora no encerramento", () => {
    const graph = buildGuidedAudioFilterGraph({ duration: 20, sceneCount: 4, indexes: { jingle: 1 } });

    expect(graph).toContain("atrim=0:3.000");
    expect(graph).toContain("adelay=17000|17000");
    expect(graph).toContain("[jinglemix]");
  });

  it("mantém normalização e limiter na master completa", () => {
    const graph = buildGuidedAudioFilterGraph({
      duration: 30,
      sceneCount: 6,
      indexes: { voiceover: 1, music: 2, sfx: 3, jingle: 4 },
    });

    expect(graph).toContain("aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo");
    expect(graph).toContain("amix=inputs=9");
    expect(graph).toContain("loudnorm=I=-16:LRA=11:TP=-1.5");
    expect(graph).toContain("alimiter=limit=0.95:level=false[aout]");
  });
});
