from pathlib import Path

p = Path('artifacts/frontend/src/components/video/VideoTimelineEditor.tsx')
s = p.read_text()

def rep(old: str, new: str, count: int = 1):
    global s
    if old not in s:
        raise SystemExit('missing anchor: ' + old[:180])
    s = s.replace(old, new, count)

# Types
rep('''type EditorSnapshot = {
  clips: VideoClip[];
  layers: EditorLayer[];
};''', '''type SfxCue = {
  id: string;
  assetId: string;
  name: string;
  url: string;
  start: number;
  duration: number;
  trimIn: number;
  volume: number;
  category: string;
};

type IntensityPoint = {
  time: number;
  score: number;
  reasons: string[];
};

type SfxSuggestion = {
  id: string;
  asset: MediaAsset;
  start: number;
  duration: number;
  volume: number;
  reason: string;
  category: string;
};

type EditorSnapshot = {
  clips: VideoClip[];
  layers: EditorLayer[];
  sfxCues?: SfxCue[];
};''')

rep('''type MusicVolumePoint = {
  id: string;
  time: number;
  value: number;
};''', '''type MusicVolumePoint = {
  id: string;
  time: number;
  value: number;
};''')

# Helpers after metadataRecord
rep('''function metadataRecord(asset: MediaAsset): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
}
''', '''function metadataRecord(asset: MediaAsset): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
}

function audioAssetKind(asset: MediaAsset): string {
  return normalizedText(metadataRecord(asset).audioKind || asset.role || "");
}

function sfxCategoryFor(asset: MediaAsset): string {
  const metadata = metadataRecord(asset);
  const haystack = normalizedText(`${assetName(asset)} ${metadata.category ?? ""} ${metadata.tags ?? ""} ${metadata.mood ?? ""}`);
  if (/(riser|rise|build|crescendo|sweep up)/.test(haystack)) return "riser";
  if (/(whoosh|woosh|swish|swoosh|sweep|transition)/.test(haystack)) return "whoosh";
  if (/(impact|hit|punch|boom|slam|kick)/.test(haystack)) return "impact";
  if (/(click|tap|pop|button|ui)/.test(haystack)) return "click";
  if (/(success|win|sparkle|chime|bell|ding)/.test(haystack)) return "success";
  return "other";
}

function sfxAutomationAllowed(asset: MediaAsset): boolean {
  const metadata = metadataRecord(asset);
  const raw = metadata.rights;
  const rights = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const status = normalizedText(rights.status);
  const origin = normalizedText(rights.origin);
  if (status === "restricted") return false;
  if (status === "cleared") return true;
  return (origin === "tenant_owned" || origin === "generated") && rights.commercialUse === true;
}
''')

# Snapshot clone
rep('''function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    clips: snapshot.clips.map((clip) => ({ ...clip })),
    layers: snapshot.layers.map((layer) => ({ ...layer, captionWords: layer.captionWords?.map((word) => ({ ...word })), keyframes: layer.keyframes?.map((frame) => ({ ...frame })) })),
  };
}''', '''function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    clips: snapshot.clips.map((clip) => ({ ...clip })),
    layers: snapshot.layers.map((layer) => ({ ...layer, captionWords: layer.captionWords?.map((word) => ({ ...word })), keyframes: layer.keyframes?.map((frame) => ({ ...frame })) })),
    sfxCues: (snapshot.sfxCues ?? []).map((cue) => ({ ...cue })),
  };
}''')

# Refs + state
rep('''  const clipsRef = useRef<VideoClip[]>([]);
  const layersRef = useRef<EditorLayer[]>([]);
  const historyRef = useRef<EditorSnapshot[]>([{ clips: [], layers: [] }]);''', '''  const clipsRef = useRef<VideoClip[]>([]);
  const layersRef = useRef<EditorLayer[]>([]);
  const sfxCuesRef = useRef<SfxCue[]>([]);
  const historyRef = useRef<EditorSnapshot[]>([{ clips: [], layers: [], sfxCues: [] }]);''')
rep('''  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [assets, setAssets] = useState<MediaAsset[]>([]);''', '''  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [sfxCues, setSfxCues] = useState<SfxCue[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);''')

# Derived SFX/intensity before canUndo
anchor = '  const canUndo = historyIndexRef.current > 0;'
insert = '''  const soundEffectAssets = useMemo(() => assets.filter((asset) => asset.type === "audio" && audioAssetKind(asset) === "sound_effect"), [assets]);
  const autoEligibleSfx = useMemo(() => soundEffectAssets.filter(sfxAutomationAllowed), [soundEffectAssets]);
  const intensityMap = useMemo<IntensityPoint[]>(() => {
    const duration = realProjectDuration;
    if (!duration || duration <= 0) return [];
    const bins = Math.min(48, Math.max(14, Math.round(duration * 1.4)));
    const boundaries = clips.slice(1).map((_, index) => clipStartAt(index + 1, clips));
    const points: IntensityPoint[] = [];
    for (let index = 0; index < bins; index += 1) {
      const time = bins === 1 ? 0 : duration * index / (bins - 1);
      let score = 16;
      const reasons: string[] = [];
      if (activeBeatAnalysis?.waveform.length) {
        const waveIndex = Math.min(activeBeatAnalysis.waveform.length - 1, Math.round(index / Math.max(1, bins - 1) * (activeBeatAnalysis.waveform.length - 1)));
        const energy = activeBeatAnalysis.waveform[waveIndex] ?? 0;
        score += energy * 34;
        if (energy > 0.72) reasons.push("energia da trilha");
      }
      if (downbeatTimes.some((beat) => Math.abs(beat - time) < 0.14)) { score += 12; reasons.push("downbeat"); }
      if (boundaries.some((boundary) => Math.abs(boundary - time) < 0.3)) { score += 10; reasons.push("corte/transição"); }
      const activeLayers = layers.filter((layer) => time >= layer.start && time <= layer.end);
      const nearbyVisual = layers.some((layer) => Math.abs(layer.start - time) < 0.25 || Math.abs(layer.end - time) < 0.2);
      if (nearbyVisual) { score += 7; reasons.push("entrada visual"); }
      const speech = activeLayers.filter((layer) => layer.contentKind === "caption").map((layer) => normalizedText(layer.text)).join(" ");
      if (speech) {
        score += 5;
        if (/(oferta|desconto|agora|hoje|novo|novidade|resultado|beneficio|garantia|econom|importante|melhor|exclusiv|chamada|whatsapp)/.test(speech)) {
          score += 19;
          reasons.push("fala de impacto");
        }
      }
      const narrativePeak = duration * 0.72;
      const narrativeDistance = Math.abs(time - narrativePeak) / Math.max(0.1, duration);
      score += Math.max(0, 7 * (1 - narrativeDistance * 7));
      points.push({ time, score: clamp(Math.round(score), 0, 100), reasons: Array.from(new Set(reasons)).slice(0, 3) });
    }
    return points;
  }, [activeBeatAnalysis, clips, downbeatTimes, layers, realProjectDuration]);
  const climaxPoint = useMemo(() => intensityMap.reduce<IntensityPoint | null>((best, point) => !best || point.score > best.score ? point : best, null), [intensityMap]);
  const sfxSuggestions = useMemo<SfxSuggestion[]>(() => {
    if (!autoEligibleSfx.length || !climaxPoint || realProjectDuration <= 0) return [];
    const pick = (categories: string[]) => autoEligibleSfx.find((asset) => categories.includes(sfxCategoryFor(asset))) ?? null;
    const result: SfxSuggestion[] = [];
    const impact = pick(["impact", "success", "click"]);
    if (impact) result.push({ id: `impact-${impact.id}-${climaxPoint.time.toFixed(2)}`, asset: impact, start: clamp(climaxPoint.time, 0, realProjectDuration), duration: Math.min(2.2, numberMetadata(impact as LibraryTrack, "durationSeconds") ?? 1.4), volume: 0.68, reason: `Clímax ${climaxPoint.score}/100`, category: sfxCategoryFor(impact) });
    const transitionTime = clips.length > 1 ? clipStartAt(1, clips) : layers.find((layer) => layer.type === "card")?.start;
    const whoosh = pick(["whoosh"]);
    if (whoosh && Number.isFinite(Number(transitionTime))) result.push({ id: `whoosh-${whoosh.id}-${Number(transitionTime).toFixed(2)}`, asset: whoosh, start: clamp(Number(transitionTime), 0, realProjectDuration), duration: Math.min(1.8, numberMetadata(whoosh as LibraryTrack, "durationSeconds") ?? 1), volume: 0.5, reason: "Entrada de corte/elemento visual", category: "whoosh" });
    const riser = pick(["riser"]);
    if (riser && climaxPoint.time > 0.7) result.push({ id: `riser-${riser.id}-${climaxPoint.time.toFixed(2)}`, asset: riser, start: clamp(climaxPoint.time - 0.8, 0, realProjectDuration), duration: Math.min(1.4, numberMetadata(riser as LibraryTrack, "durationSeconds") ?? 1.2), volume: 0.42, reason: "Construção antes do clímax", category: "riser" });
    return result.slice(0, 3);
  }, [autoEligibleSfx, climaxPoint, clips, layers, realProjectDuration]);

  const canUndo = historyIndexRef.current > 0;'''
rep(anchor, insert)

# Refs sync and history
rep('''  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { layersRef.current = layers; }, [layers]);''', '''  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { sfxCuesRef.current = sfxCues; }, [sfxCues]);''')
rep('''    const previous = historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [] };
    const serialize = (value: EditorSnapshot) => JSON.stringify({
      clips: value.clips.map(({ localFile: _localFile, ...clip }) => clip),
      layers: value.layers.map(({ localFile: _localFile, ...layer }) => layer),
    });''', '''    const previous = historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [], sfxCues: [] };
    const serialize = (value: EditorSnapshot) => JSON.stringify({
      clips: value.clips.map(({ localFile: _localFile, ...clip }) => clip),
      layers: value.layers.map(({ localFile: _localFile, ...layer }) => layer),
      sfxCues: value.sfxCues ?? [],
    });''')
rep('''  const commitEditor = useCallback((nextClips: VideoClip[], nextLayers: EditorLayer[]) => {
    clipsRef.current = nextClips;
    layersRef.current = nextLayers;
    setClips(nextClips);
    setLayers(nextLayers);
    recordHistory({ clips: nextClips, layers: nextLayers });
  }, [recordHistory]);''', '''  const commitEditor = useCallback((nextClips: VideoClip[], nextLayers: EditorLayer[], nextSfxCues: SfxCue[] = sfxCuesRef.current) => {
    clipsRef.current = nextClips;
    layersRef.current = nextLayers;
    sfxCuesRef.current = nextSfxCues;
    setClips(nextClips);
    setLayers(nextLayers);
    setSfxCues(nextSfxCues);
    recordHistory({ clips: nextClips, layers: nextLayers, sfxCues: nextSfxCues });
  }, [recordHistory]);''')
rep('''  const resetEditorHistory = useCallback((nextClips: VideoClip[], nextLayers: EditorLayer[]) => {
    const snapshot = cloneSnapshot({ clips: nextClips, layers: nextLayers });
    clipsRef.current = snapshot.clips;
    layersRef.current = snapshot.layers;
    setClips(snapshot.clips);
    setLayers(snapshot.layers);
    historyRef.current = [snapshot];''', '''  const resetEditorHistory = useCallback((nextClips: VideoClip[], nextLayers: EditorLayer[], nextSfxCues: SfxCue[] = []) => {
    const snapshot = cloneSnapshot({ clips: nextClips, layers: nextLayers, sfxCues: nextSfxCues });
    clipsRef.current = snapshot.clips;
    layersRef.current = snapshot.layers;
    sfxCuesRef.current = snapshot.sfxCues ?? [];
    setClips(snapshot.clips);
    setLayers(snapshot.layers);
    setSfxCues(snapshot.sfxCues ?? []);
    historyRef.current = [snapshot];''')
rep('''    clipsRef.current = next.clips;
    layersRef.current = next.layers;
    setClips(next.clips);
    setLayers(next.layers);''', '''    clipsRef.current = next.clips;
    layersRef.current = next.layers;
    sfxCuesRef.current = next.sfxCues ?? [];
    setClips(next.clips);
    setLayers(next.layers);
    setSfxCues(next.sfxCues ?? []);''')
rep('''restoreSnapshot(historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [] });''', '''restoreSnapshot(historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [], sfxCues: [] });''', 2)

# SFX mutation functions after duplicate clip
marker = '''  const addManualBeatMarker = useCallback(() => {'''
funcs = '''  const commitSfxCues = useCallback((next: SfxCue[]) => {
    commitEditor(clipsRef.current, layersRef.current, next.sort((a, b) => a.start - b.start));
  }, [commitEditor]);

  const addSfxCue = useCallback((asset: MediaAsset, at = timelineTime, options?: Partial<Pick<SfxCue, "duration" | "volume" | "category">>) => {
    const url = assetUrl(asset);
    if (!url) return;
    const duration = clamp(options?.duration ?? numberMetadata(asset as LibraryTrack, "durationSeconds") ?? 1.4, 0.12, Math.max(0.12, realProjectDuration - at));
    const cue: SfxCue = {
      id: uid("sfx"), assetId: asset.id, name: assetName(asset), url,
      start: clamp(at, 0, Math.max(0, realProjectDuration - 0.05)), duration, trimIn: 0,
      volume: clamp(options?.volume ?? 0.58, 0, 1.2), category: options?.category ?? sfxCategoryFor(asset),
    };
    commitSfxCues([...sfxCuesRef.current, cue]);
  }, [commitSfxCues, realProjectDuration, timelineTime]);

  const updateSfxCue = useCallback((id: string, patch: Partial<SfxCue>) => {
    commitSfxCues(sfxCuesRef.current.map((cue) => cue.id === id ? { ...cue, ...patch, start: clamp(patch.start ?? cue.start, 0, Math.max(0, realProjectDuration)), duration: clamp(patch.duration ?? cue.duration, 0.12, Math.max(0.12, realProjectDuration)) } : cue));
  }, [commitSfxCues, realProjectDuration]);

  const removeSfxCue = useCallback((id: string) => {
    commitSfxCues(sfxCuesRef.current.filter((cue) => cue.id !== id));
  }, [commitSfxCues]);

  const applySuggestedSfx = useCallback(() => {
    if (!sfxSuggestions.length) return;
    const existingKeys = new Set(sfxCuesRef.current.map((cue) => `${cue.assetId}:${cue.start.toFixed(2)}`));
    const additions = sfxSuggestions.filter((item) => !existingKeys.has(`${item.asset.id}:${item.start.toFixed(2)}`)).map((item) => ({
      id: uid("sfx-auto"), assetId: item.asset.id, name: assetName(item.asset), url: assetUrl(item.asset), start: item.start,
      duration: item.duration, trimIn: 0, volume: item.volume, category: item.category,
    })).filter((cue) => cue.url);
    if (!additions.length) { toast({ title: "SFX já aplicados", description: "As sugestões atuais já estão na timeline." }); return; }
    commitSfxCues([...sfxCuesRef.current, ...additions]);
    toast({ title: "SFX inteligentes aplicados", description: `${additions.length} efeito${additions.length === 1 ? "" : "s"} entrou${additions.length === 1 ? "" : "aram"} nos momentos de maior impacto.` });
  }, [commitSfxCues, sfxSuggestions, toast]);

  const previewSfxAsset = useCallback(async (asset: MediaAsset) => {
    const url = assetUrl(asset);
    if (!url) return;
    try {
      const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
      if (!response.ok) throw new Error("Não foi possível carregar o efeito.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(blobUrl);
      audio.volume = 0.65;
      audio.onended = () => URL.revokeObjectURL(blobUrl);
      audio.onerror = () => URL.revokeObjectURL(blobUrl);
      await audio.play();
    } catch (error) {
      toast({ title: "Prévia indisponível", description: error instanceof Error ? error.message : "Falha ao reproduzir SFX", variant: "destructive" });
    }
  }, [toast]);

  const addManualBeatMarker = useCallback(() => {'''
rep(marker, funcs)

# Persistence
rep('    editorVersion: 14,', '    editorVersion: 15,')
rep('''    autoEditPresetId: selectedAutoPresetId || null,
    audio: {''', '''    autoEditPresetId: selectedAutoPresetId || null,
    sfx: sfxCues,
    audio: {''')
rep('''selectedAutoPresetId, musicMode,''', '''selectedAutoPresetId, sfxCues, musicMode,''')

# Restore cues
rep('''        resetEditorHistory(nextClips, nextLayers);
        setActiveClipId(nextClips[0]?.id ?? "");''', '''        const restoredSfx: SfxCue[] = Array.isArray(context.sfx) ? context.sfx.map((raw: Partial<SfxCue>) => ({
          id: String(raw.id || uid("sfx-restored")), assetId: String(raw.assetId || ""), name: String(raw.name || "SFX"), url: String(raw.url || ""),
          start: clamp(Number(raw.start) || 0, 0, Math.max(0, projectDurationFor(nextClips))), duration: clamp(Number(raw.duration) || 1, 0.12, Math.max(0.12, projectDurationFor(nextClips))),
          trimIn: Math.max(0, Number(raw.trimIn) || 0), volume: clamp(Number(raw.volume) || 0.55, 0, 1.2), category: String(raw.category || "other"),
        })).filter((cue: SfxCue) => cue.assetId && cue.url) : [];
        resetEditorHistory(nextClips, nextLayers, restoredSfx);
        setActiveClipId(nextClips[0]?.id ?? "");''')

# Render SFX runtime
rep('''      const renderLayers = layersRef.current.map((layer) => ({ ...layer }));''', '''      const renderLayers = layersRef.current.map((layer) => ({ ...layer }));
      const renderSfxCues = sfxCuesRef.current.map((cue) => ({ ...cue })).filter((cue) => cue.start < totalDuration && cue.duration > 0);''')
rep('''      let duckingLevel = 0;

      if (audioContext) {''', '''      let duckingLevel = 0;
      const sfxRuntime: Array<{ source: AudioBufferSourceNode; gain: GainNode; cue: SfxCue; buffer: AudioBuffer }> = [];

      if (audioContext) {''')
rep('''          musicSourceNode.connect(musicGainNode).connect(destination);
        }
      }

      const outputStream''', '''          musicSourceNode.connect(musicGainNode).connect(destination);
        }
        for (const cue of renderSfxCues) {
          try {
            const response = await fetch(cue.url, { headers: cue.url.startsWith("/api/") ? tokenHeaders() : undefined });
            if (!response.ok) continue;
            const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
            const sourceNode = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            sourceNode.buffer = buffer;
            gainNode.gain.value = clamp(cue.volume, 0, 1.2);
            sourceNode.connect(gainNode).connect(destination);
            sfxRuntime.push({ source: sourceNode, gain: gainNode, cue, buffer });
          } catch { /* efeito inválido é ignorado sem interromper o render */ }
        }
      }

      const outputStream''')
rep('''      if (musicSourceNode) {
        const start = Math.min(totalDuration, Math.max(0, musicStart));
        const end = Math.min(totalDuration, Math.max(start + 0.1, musicEnd));
        musicSourceNode.start(audioNow + start);
        musicSourceNode.stop(audioNow + end);
      }

      for (let clipIndex''', '''      if (musicSourceNode) {
        const start = Math.min(totalDuration, Math.max(0, musicStart));
        const end = Math.min(totalDuration, Math.max(start + 0.1, musicEnd));
        musicSourceNode.start(audioNow + start);
        musicSourceNode.stop(audioNow + end);
      }
      for (const runtime of sfxRuntime) {
        const start = clamp(runtime.cue.start, 0, totalDuration);
        const offset = clamp(runtime.cue.trimIn, 0, Math.max(0, runtime.buffer.duration - 0.02));
        const duration = Math.min(runtime.cue.duration, runtime.buffer.duration - offset, totalDuration - start);
        if (duration > 0.02) runtime.source.start(audioNow + start, offset, duration);
      }

      for (let clipIndex''')
rep('''      musicSourceNode?.disconnect();
      await audioContext?.close();''', '''      musicSourceNode?.disconnect();
      for (const runtime of sfxRuntime) { try { runtime.source.disconnect(); runtime.gain.disconnect(); } catch { /* noop */ } }
      await audioContext?.close();''')

# SFX block in audio panel
head = '''if (tool === "audio") return <div className="space-y-4"><div><p className="text-sm font-semibold">Áudio e trilha</p><p className="text-xs text-muted-foreground">Uma trilha contínua pode atravessar todos os clipes.</p></div>'''
sfx_ui = '''if (tool === "audio") return <div className="space-y-4"><div><p className="text-sm font-semibold">Áudio e trilha</p><p className="text-xs text-muted-foreground">Trilha, mixagem, efeitos sonoros e mapa de intensidade do vídeo.</p></div><div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold">SFX inteligente + clímax</p><p className="mt-0.5 text-[10px] text-muted-foreground">Combina fala, cortes, elementos visuais, downbeats e energia da trilha.</p></div>{climaxPoint && <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[9px] font-semibold tabular-nums">Clímax {timeLabel(climaxPoint.time)} · {climaxPoint.score}</span>}</div>{intensityMap.length > 0 && <div><div className="flex h-11 items-end gap-px rounded-lg bg-background px-1.5 py-1">{intensityMap.map((point, index) => <button key={`${point.time}-${index}`} type="button" onClick={() => seekTimeline(point.time)} className={cn("min-w-[2px] flex-1 rounded-sm bg-cyan-500/65 transition-opacity hover:opacity-100", climaxPoint && Math.abs(point.time - climaxPoint.time) < 0.01 ? "opacity-100 ring-1 ring-cyan-400" : "opacity-70")} style={{ height: `${Math.max(8, point.score)}%` }} title={`${timeLabel(point.time)} · intensidade ${point.score}/100${point.reasons.length ? ` · ${point.reasons.join(", ")}` : ""}`} />)}</div><p className="mt-1 text-[9px] text-muted-foreground">Clique no mapa para levar o cursor ao ponto analisado.</p></div>}{sfxSuggestions.length > 0 ? <div className="space-y-1.5"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold">Sugestões seguras</span><button type="button" onClick={applySuggestedSfx} className="rounded-lg bg-cyan-600 px-2 py-1 text-[9px] font-semibold text-white">Aplicar {sfxSuggestions.length}</button></div>{sfxSuggestions.map((suggestion) => <div key={suggestion.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2 py-1.5 text-[9px]"><span className="min-w-0 truncate"><strong>{suggestion.category}</strong> · {assetName(suggestion.asset)} · {suggestion.reason}</span><span className="shrink-0 tabular-nums text-muted-foreground">{timeLabel(suggestion.start)}</span></div>)}</div> : <div className="rounded-lg border border-dashed bg-background p-2 text-[9px] text-muted-foreground">A automação usa somente SFX com direitos liberados. Valide efeitos na Central de Mídias para receber sugestões automáticas.</div>}{soundEffectAssets.length > 0 ? <div className="space-y-1.5"><p className="text-[10px] font-semibold">Biblioteca de efeitos</p><div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">{soundEffectAssets.map((asset) => <div key={asset.id} className="flex items-center gap-2 rounded-lg border bg-background p-2"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium">{assetName(asset)}</p><p className={cn("text-[9px]", sfxAutomationAllowed(asset) ? "text-emerald-600" : "text-amber-600")}>{sfxCategoryFor(asset)} · {sfxAutomationAllowed(asset) ? "direitos liberados" : "uso manual · revisar direitos"}</p></div><button type="button" onClick={() => void previewSfxAsset(asset)} className="rounded-md border p-1.5" title="Ouvir"><Play className="h-3 w-3" /></button><button type="button" onClick={() => addSfxCue(asset)} className="rounded-md bg-foreground px-2 py-1 text-[9px] font-semibold text-background">+ cursor</button></div>)}</div></div> : <button type="button" onClick={() => navigate("/media")} className="w-full rounded-lg border border-dashed bg-background p-2.5 text-[10px] text-muted-foreground">Nenhum efeito sonoro cadastrado · abrir Central de Mídias</button>}{sfxCues.length > 0 && <div className="space-y-1.5"><p className="text-[10px] font-semibold">SFX na timeline · {sfxCues.length}</p>{sfxCues.map((cue) => <div key={cue.id} className="space-y-1 rounded-lg border bg-background p-2"><div className="flex items-center gap-2"><button type="button" onClick={() => seekTimeline(cue.start)} className="min-w-0 flex-1 truncate text-left text-[9px] font-medium">{timeLabel(cue.start)} · {cue.name}</button><button type="button" onClick={() => removeSfxCue(cue.id)} className="rounded p-1 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button></div><div className="flex items-center gap-2"><span className="text-[8px] text-muted-foreground">volume</span><input type="range" min={0} max={1.2} step={0.05} value={cue.volume} onChange={(event) => updateSfxCue(cue.id, { volume: Number(event.target.value) })} className="flex-1 accent-cyan-500" /><span className="w-7 text-right text-[8px] tabular-nums">{Math.round(cue.volume * 100)}%</span></div></div>)}</div>}</div>'''
rep(head, sfx_ui)

# Timeline dedicated SFX row before Audio row
track_anchor = '''          <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><Volume2 className="h-3.5 w-3.5" />Áudio</div>'''
track_new = '''          <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><WandSparkles className="h-3.5 w-3.5" />SFX</div><div className="relative h-8 flex-1 rounded-md bg-cyan-500/10" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekTimeline((event.clientX - rect.left) / rect.width * realProjectDuration); }}>{sfxCues.map((cue) => <button key={cue.id} type="button" onClick={(event) => { event.stopPropagation(); seekTimeline(cue.start); setTool("audio"); }} className="absolute inset-y-1 overflow-hidden rounded bg-cyan-600/80 px-1 text-[9px] leading-6 text-white" style={{ left: `${clamp(cue.start / projectDuration * 100, 0, 100)}%`, width: `${Math.max(0.8, clamp(cue.duration / projectDuration * 100, 0, 100))}%` }} title={`${cue.name} · ${Math.round(cue.volume * 100)}%`}>{cue.category}</button>)}<div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${realProjectDuration > 0 ? timelineTime / projectDuration * 100 : 0}%` }} /></div></div>
          <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><Volume2 className="h-3.5 w-3.5" />Áudio</div>'''
rep(track_anchor, track_new)

# Timeline summary include sfx count
rep('''{clips.length} clipe{clips.length === 1 ? "" : "s"} · {layers.length} camada{layers.length === 1 ? "" : "s"}''', '''{clips.length} clipe{clips.length === 1 ? "" : "s"} · {layers.length} camada{layers.length === 1 ? "" : "s"} · {sfxCues.length} SFX''')

p.write_text(s)
