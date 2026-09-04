from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# Backend: FFmpeg fallback + structured telemetry
route = Path("artifacts/api-server/src/routes/video_processing.ts")
s = route.read_text()
s = replace_once(
    s,
    'import { transcribeAudioWithWordTimestamps, type TranscriptionWord } from "../lib/ai-gateway.js";\n',
    'import { transcribeAudioWithWordTimestamps, type TranscriptionWord } from "../lib/ai-gateway.js";\nimport { analyzePcm16Beats } from "../lib/audio-beat-analysis.js";\n',
    "backend import",
)
s = replace_once(
    s,
    'const PRIVATE_DIR    = process.env["PRIVATE_OBJECT_DIR"] ?? "";\n',
    '''const PRIVATE_DIR    = process.env["PRIVATE_OBJECT_DIR"] ?? "";
const VIDEO_EDITOR_EVENTS = new Set([
  "beat_analyzed",
  "beat_fallback_server",
  "render_started",
  "render_completed",
  "render_failed",
  "auto_edit_applied",
  "sfx_applied",
]);
''',
    "event allowlist",
)
endpoints = r'''
// ── Robustez do editor: análise musical + telemetria ─────────────────────────

router.post(
  "/tenants/:tenantId/content-studio/video/analyze-audio",
  upload.single("audio"),
  async (req, res) => {
    if (!authCheck(req, res)) return;
    if (!req.file) { res.status(422).json({ error: "Arquivo de áudio obrigatório" }); return; }

    const tenantId = String(req.params["tenantId"]);
    const requestId = randomUUID();
    const inputPath = join(tmpdir(), `beat-input-${requestId}`);
    const pcmPath = join(tmpdir(), `beat-pcm-${requestId}.s16le`);
    const parsedHint = Number((req.body as Record<string, string | undefined>)["bpmHint"] ?? "");
    const bpmHint = Number.isFinite(parsedHint) && parsedHint > 0 ? Math.max(60, Math.min(200, parsedHint)) : null;

    try {
      await writeFile(inputPath, req.file.buffer);
      await execFileAsync("ffmpeg", [
        "-y", "-v", "error", "-i", inputPath,
        "-t", "120", "-vn", "-ac", "1", "-ar", "16000",
        "-f", "s16le", pcmPath,
      ]);
      const pcm = await readFile(pcmPath);
      if (pcm.byteLength < 4) throw new Error("O áudio não possui amostras suficientes para análise");
      const samples = new Int16Array(Math.floor(pcm.byteLength / 2));
      for (let index = 0; index < samples.length; index += 1) samples[index] = pcm.readInt16LE(index * 2);
      const analysis = analyzePcm16Beats(samples, 16000, bpmHint);
      req.log.info({ tenantId, userId: req.user?.sub ?? null, bpm: analysis.bpm, confidence: analysis.confidence, source: "server" }, "video-editor: beat analysis fallback");
      res.json({ analysis: { ...analysis, source: "server" } });
    } catch (error) {
      req.log.warn({ err: error, tenantId, userId: req.user?.sub ?? null }, "video-editor: beat analysis fallback failed");
      res.status(422).json({ error: error instanceof Error ? error.message : "Falha na análise musical no servidor" });
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(pcmPath).catch(() => undefined);
    }
  },
);

router.post("/tenants/:tenantId/content-studio/video/editor-events", async (req, res) => {
  if (!authCheck(req, res)) return;
  const tenantId = String(req.params["tenantId"]);
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const event = String(body["event"] ?? "");
  if (!VIDEO_EDITOR_EVENTS.has(event)) { res.status(422).json({ error: "Evento do editor inválido" }); return; }
  const metadata = body["metadata"] && typeof body["metadata"] === "object" && !Array.isArray(body["metadata"])
    ? body["metadata"] as Record<string, unknown>
    : {};
  req.log.info({
    event,
    tenantId,
    userId: req.user?.sub ?? null,
    projectId: typeof body["projectId"] === "string" ? body["projectId"] : null,
    metadata,
  }, "video-editor:event");
  res.status(202).json({ accepted: true });
});

'''
s = replace_once(s, '// ── Job status (shared) ───────────────────────────────────────────────────────\n', endpoints + '// ── Job status (shared) ───────────────────────────────────────────────────────\n', "backend endpoints")
route.write_text(s)

# Frontend: server fallback, telemetry, mobile layout
editor = Path("artifacts/frontend/src/components/video/VideoTimelineEditor.tsx")
s = editor.read_text()
s = replace_once(s, 'source: "audio" | "metadata";', 'source: "audio" | "metadata" | "server";', "beat source type")

anchor = '''  const activeBeatAnalysis = beatAnalysis?.trackKey === currentMusicKey ? beatAnalysis : null;
  const applyAudioMixPreset = useCallback((presetId: AudioMixPreset) => {'''
replacement = '''  const activeBeatAnalysis = beatAnalysis?.trackKey === currentMusicKey ? beatAnalysis : null;
  const logEditorEvent = useCallback((event: "beat_analyzed" | "beat_fallback_server" | "render_started" | "render_completed" | "render_failed" | "auto_edit_applied" | "sfx_applied", metadata: Record<string, unknown> = {}) => {
    if (!tenantId) return;
    void fetch(`/api/tenants/${tenantId}/content-studio/video/editor-events`, {
      method: "POST",
      headers: tokenHeaders(true),
      body: JSON.stringify({ event, projectId: projectId || null, metadata }),
    }).catch(() => undefined);
  }, [projectId, tenantId]);
  const applyAudioMixPreset = useCallback((presetId: AudioMixPreset) => {'''
s = replace_once(s, anchor, replacement, "telemetry helper")

old_analyze = '''  const analyzeMusicBeats = useCallback(async () => {
    if (!currentMusicKey || beatAnalyzing) return;
    const bpmHint = selectedTrack ? numberMetadata(selectedTrack, "bpm") : null;
    setBeatAnalyzing(true);
    try {
      let rawAudio: ArrayBuffer;
      if (musicMode === "upload" && musicFile) {
        rawAudio = await musicFile.arrayBuffer();
      } else if (selectedTrack) {
        const url = assetUrl(selectedTrack);
        if (!url) throw new Error("A trilha selecionada não possui arquivo de áudio.");
        const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
        if (!response.ok) throw new Error("Não foi possível carregar a trilha para análise.");
        rawAudio = await response.arrayBuffer();
      } else {
        throw new Error("Selecione uma trilha antes de analisar as batidas.");
      }

      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("Seu navegador não oferece análise de áudio compatível.");
      const audioContext = new AudioContextCtor();
      try {
        const buffer = await audioContext.decodeAudioData(rawAudio.slice(0));
        const analysis = analyzeAudioBufferBeats(buffer, bpmHint);
        setBeatAnalysis({ ...analysis, trackKey: currentMusicKey });
        setShowBeatMarkers(true);
        toast({ title: "Batidas detectadas", description: `${analysis.bpm.toFixed(1)} BPM · grade sincronizada com a trilha.` });
      } finally {
        await audioContext.close().catch(() => undefined);
      }
    } catch (error) {
      if (bpmHint && bpmHint > 0) {
        setBeatAnalysis({ trackKey: currentMusicKey, bpm: bpmHint, offset: 0, confidence: 0.35, source: "metadata", waveform: [], downbeatIndex: 0 });
        setShowBeatMarkers(true);
        toast({ title: "Grade criada pelo BPM", description: "Não foi possível ler a forma de onda; usei o BPM cadastrado no Music Hub." });
      } else {
        toast({ title: "Não foi possível detectar as batidas", description: error instanceof Error ? error.message : "Falha na análise da trilha", variant: "destructive" });
      }
    } finally {
      setBeatAnalyzing(false);
    }
  }, [beatAnalyzing, currentMusicKey, musicFile, musicMode, selectedTrack, toast]);'''
new_analyze = '''  const analyzeMusicBeats = useCallback(async () => {
    if (!currentMusicKey || beatAnalyzing) return;
    const bpmHint = selectedTrack ? numberMetadata(selectedTrack, "bpm") : null;
    const loadAnalysisBlob = async (): Promise<Blob> => {
      if (musicMode === "upload" && musicFile) return musicFile;
      if (selectedTrack) {
        const url = assetUrl(selectedTrack);
        if (!url) throw new Error("A trilha selecionada não possui arquivo de áudio.");
        const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
        if (!response.ok) throw new Error("Não foi possível carregar a trilha para análise.");
        return await response.blob();
      }
      throw new Error("Selecione uma trilha antes de analisar as batidas.");
    };

    setBeatAnalyzing(true);
    let browserError: unknown = null;
    try {
      const blob = await loadAnalysisBlob();
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("Seu navegador não oferece análise de áudio compatível.");
      const audioContext = new AudioContextCtor();
      try {
        const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
        const analysis = analyzeAudioBufferBeats(buffer, bpmHint);
        setBeatAnalysis({ ...analysis, trackKey: currentMusicKey });
        setShowBeatMarkers(true);
        logEditorEvent("beat_analyzed", { bpm: analysis.bpm, confidence: analysis.confidence, source: "browser" });
        toast({ title: "Batidas detectadas", description: `${analysis.bpm.toFixed(1)} BPM · grade sincronizada com a trilha.` });
        return;
      } finally {
        await audioContext.close().catch(() => undefined);
      }
    } catch (error) {
      browserError = error;
    }

    try {
      const blob = await loadAnalysisBlob();
      const form = new FormData();
      form.append("audio", new File([blob], musicFile?.name ?? selectedTrack ? assetName(selectedTrack!) : "trilha-audio", { type: blob.type || "audio/mpeg" }));
      if (bpmHint) form.append("bpmHint", String(bpmHint));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/analyze-audio`, { method: "POST", headers: tokenHeaders(), body: form });
      const data = await response.json() as { analysis?: Omit<BeatAnalysis, "trackKey">; error?: string };
      if (!response.ok || !data.analysis) throw new Error(data.error ?? "O servidor não conseguiu analisar a trilha");
      const analysis: BeatAnalysis = { ...data.analysis, source: "server", trackKey: currentMusicKey };
      setBeatAnalysis(analysis);
      setShowBeatMarkers(true);
      logEditorEvent("beat_fallback_server", { bpm: analysis.bpm, confidence: analysis.confidence, browserError: browserError instanceof Error ? browserError.message : String(browserError ?? "") });
      toast({ title: "Batidas detectadas no servidor", description: `${analysis.bpm.toFixed(1)} BPM · fallback seguro aplicado.` });
    } catch (serverError) {
      if (bpmHint && bpmHint > 0) {
        setBeatAnalysis({ trackKey: currentMusicKey, bpm: bpmHint, offset: 0, confidence: 0.35, source: "metadata", waveform: [], downbeatIndex: 0 });
        setShowBeatMarkers(true);
        toast({ title: "Grade criada pelo BPM", description: "A análise de áudio falhou, então usei o BPM cadastrado no Music Hub." });
      } else {
        const message = serverError instanceof Error ? serverError.message : browserError instanceof Error ? browserError.message : "Falha na análise da trilha";
        toast({ title: "Não foi possível detectar as batidas", description: message, variant: "destructive" });
      }
    } finally {
      setBeatAnalyzing(false);
    }
  }, [beatAnalyzing, currentMusicKey, logEditorEvent, musicFile, musicMode, selectedTrack, tenantId, toast]);'''
s = replace_once(s, old_analyze, new_analyze, "beat analysis function")

s = replace_once(
    s,
    '''    commitSfxCues([...sfxCuesRef.current, ...additions]);
    toast({ title: "SFX inteligentes aplicados", description: `${additions.length} efeito${additions.length === 1 ? "" : "s"} entrou${additions.length === 1 ? "" : "aram"} nos momentos de maior impacto.` });
  }, [commitSfxCues, sfxSuggestions, toast]);''',
    '''    commitSfxCues([...sfxCuesRef.current, ...additions]);
    logEditorEvent("sfx_applied", { count: additions.length, climaxScore: climaxPoint?.score ?? null });
    toast({ title: "SFX inteligentes aplicados", description: `${additions.length} efeito${additions.length === 1 ? "" : "s"} entrou${additions.length === 1 ? "" : "aram"} nos momentos de maior impacto.` });
  }, [climaxPoint?.score, commitSfxCues, logEditorEvent, sfxSuggestions, toast]);''',
    "sfx telemetry",
)

s = replace_once(
    s,
    '''    setJobStatus("rendering");
    setJobMessage("Preparando sequência de clipes…");
    setResultUrl("");
    try {''',
    '''    setJobStatus("rendering");
    setJobMessage("Preparando sequência de clipes…");
    setResultUrl("");
    logEditorEvent("render_started", { clips: renderClips.length, sfx: sfxCuesRef.current.length, ratio, quality });
    try {''',
    "render started telemetry",
)
s = replace_once(
    s,
    '''      setResultUrl(finalUrl);
      setJobStatus("done");
      setJobMessage("Sequência final pronta e salva na Biblioteca Audiovisual.");
      toast({ title: "Vídeo finalizado", description: `${renderClips.length} clipe${renderClips.length === 1 ? "" : "s"} foram unidos em um único MP4 na Central de Mídias.` });''',
    '''      setResultUrl(finalUrl);
      setJobStatus("done");
      setJobMessage("Sequência final pronta e salva na Biblioteca Audiovisual.");
      logEditorEvent("render_completed", { clips: renderClips.length, sfx: renderSfxCues.length, duration: totalDuration, ratio, quality });
      toast({ title: "Vídeo finalizado", description: `${renderClips.length} clipe${renderClips.length === 1 ? "" : "s"} foram unidos em um único MP4 na Central de Mídias.` });''',
    "render completed telemetry",
)
s = replace_once(
    s,
    '''      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao renderizar o vídeo");
      toast({ title: "Falha na renderização", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });''',
    '''      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao renderizar o vídeo");
      logEditorEvent("render_failed", { message: error instanceof Error ? error.message : "Falha desconhecida", clips: renderClips.length, ratio, quality });
      toast({ title: "Falha na renderização", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });''',
    "render failed telemetry",
)
s = replace_once(
    s,
    '''    setSelectedLayerId("");
    toast({ title: "Melhorias aplicadas", description: `${suggestions.length} ajuste${suggestions.length === 1 ? "" : "s"} entrou${suggestions.length === 1 ? "" : "aram"} na timeline. Tudo continua editável e pode ser desfeito.` });''',
    '''    setSelectedLayerId("");
    logEditorEvent("auto_edit_applied", { count: suggestions.length, goal: aiGoal, preset: selectedAutoPresetId || null });
    toast({ title: "Melhorias aplicadas", description: `${suggestions.length} ajuste${suggestions.length === 1 ? "" : "s"} entrou${suggestions.length === 1 ? "" : "aram"} na timeline. Tudo continua editável e pode ser desfeito.` });''',
    "auto edit telemetry",
)

s = replace_once(s, 'activeBeatAnalysis.source === "audio" ? "Forma de onda analisada" : "BPM do Music Hub"', 'activeBeatAnalysis.source === "audio" ? "Forma de onda analisada" : activeBeatAnalysis.source === "server" ? "Análise segura no servidor" : "BPM do Music Hub"', "server source label")

# Mobile responsiveness: compact header, bounded panels, smaller timeline minimum width.
s = replace_once(s, 'className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 lg:px-6"', 'className="flex min-h-16 flex-wrap items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 lg:px-6"', "header mobile")
s = replace_once(s, 'className="min-w-[180px] flex-1"', 'className="min-w-0 flex-[1_1_220px]"', "title mobile")
s = replace_once(s, 'className="w-full max-w-md bg-transparent text-base font-semibold outline-none"', 'className="w-full max-w-md bg-transparent text-sm font-semibold outline-none sm:text-base"', "title font mobile")
s = replace_once(s, '>Salvar</button>', '><span className="hidden sm:inline">Salvar</span></button>', "save mobile label")
s = replace_once(s, '<WandSparkles className="h-4 w-4" />Exportar MP4</button>', '<WandSparkles className="h-4 w-4" /><span className="hidden sm:inline">Exportar MP4</span><span className="sm:hidden">Exportar</span></button>', "export mobile label")
s = replace_once(s, 'className="grid min-h-[660px] grid-cols-1 xl:grid-cols-[76px_270px_minmax(420px,1fr)_280px]"', 'className="grid min-h-0 grid-cols-1 xl:min-h-[660px] xl:grid-cols-[76px_270px_minmax(420px,1fr)_280px]"', "editor grid mobile")
s = replace_once(s, 'className="max-h-[660px] overflow-y-auto border-b bg-card p-4 xl:border-b-0 xl:border-r"', 'className="max-h-[46vh] overflow-y-auto border-b bg-card p-3 sm:max-h-[520px] sm:p-4 xl:max-h-[660px] xl:border-b-0 xl:border-r"', "tool panel mobile")
s = replace_once(s, 'className="flex flex-1 items-center justify-center p-4 lg:p-6"', 'className="flex flex-1 items-center justify-center p-2 sm:p-4 lg:p-6"', "preview padding mobile")
s = replace_once(s, 'className="max-h-[660px] overflow-y-auto border-t bg-card p-4 xl:border-l xl:border-t-0"', 'className="max-h-[46vh] overflow-y-auto border-t bg-card p-3 sm:max-h-[520px] sm:p-4 xl:max-h-[660px] xl:border-l xl:border-t-0"', "properties mobile")
s = replace_once(s, '<div className="overflow-x-auto p-3"><div className="min-w-[900px]">', '<div className="overflow-x-auto p-2 sm:p-3"><div className="min-w-[720px] sm:min-w-[900px]">', "timeline mobile")
editor.write_text(s)
