from pathlib import Path
import re

FRONTEND = Path('artifacts/frontend/src/components/video/VideoTimelineEditor.tsx')
BACKEND = Path('artifacts/api-server/src/routes/video_processing.ts')

frontend = FRONTEND.read_text()
backend = BACKEND.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {count}')
    return text.replace(old, new, 1)

# ──────────────────────────────────────────────────────────────────────────────
# Backend: expose Whisper word timestamps as an async editable transcript job.
# ──────────────────────────────────────────────────────────────────────────────
backend = replace_once(
    backend,
    'function buildCaptionChunks(words: TranscriptionWord[]): { start: number; end: number; text: string }[] {\n  const chunks: { start: number; end: number; text: string }[] = [];',
    '''type EditableCaptionChunk = {\n  start: number;\n  end: number;\n  text: string;\n  words: TranscriptionWord[];\n};\n\nfunction buildCaptionChunks(words: TranscriptionWord[]): EditableCaptionChunk[] {\n  const chunks: EditableCaptionChunk[] = [];''',
    'backend caption chunk type',
)

backend = replace_once(
    backend,
    '''    chunks.push({\n      start: current[0]!.start,\n      end: current[current.length - 1]!.end,\n      text: current.map((w) => w.word).join(" ").trim(),\n    });''',
    '''    chunks.push({\n      start: current[0]!.start,\n      end: current[current.length - 1]!.end,\n      text: current.map((w) => w.word).join(" ").trim(),\n      words: current.map((word) => ({ ...word })),\n    });''',
    'backend caption chunks preserve words',
)

transcribe_route = '''router.post(\n  "/tenants/:tenantId/content-studio/video/transcribe",\n  upload.single("video"),\n  async (req, res) => {\n    if (!authCheck(req, res)) return;\n    if (!req.file) { res.status(422).json({ error: "Arquivo de vídeo obrigatório" }); return; }\n\n    const tenantId = String(req.params["tenantId"]);\n    const captionPreset = await resolveBrandCaptionPreset(tenantId);\n    const jobId = randomUUID();\n    await createMediaJob({\n      id: jobId,\n      tenantId,\n      operation: "video_transcribe",\n      input: { captionPreset, originalFilename: req.file.originalname },\n      snapshot: { status: "running", progress: 0, total: 3 },\n    });\n    res.status(202).json({ jobId, captionPreset });\n\n    void (async () => {\n      const inPath = join(tmpdir(), `transcribe-in-${jobId}.mp4`);\n      const audioPath = join(tmpdir(), `transcribe-audio-${jobId}.wav`);\n      try {\n        await writeFile(inPath, req.file!.buffer);\n        await updateMediaJob(jobId, tenantId, { status: "running", progress: 1, total: 3 });\n        await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", audioPath]);\n        const audioBuffer = await readFile(audioPath);\n        await updateMediaJob(jobId, tenantId, { status: "running", progress: 2, total: 3 });\n\n        const { text, words } = await transcribeAudioWithWordTimestamps(tenantId, "audio_transcription", audioBuffer, {\n          mimeType: "audio/wav",\n          language: "pt",\n          log: req.log,\n        });\n        if (!words.length) {\n          await updateMediaJob(jobId, tenantId, {\n            status: "error",\n            error: "Não foi possível identificar fala no vídeo — confirme se o áudio está audível.",\n          });\n          return;\n        }\n\n        const chunks = buildCaptionChunks(words);\n        await updateMediaJob(jobId, tenantId, {\n          status: "done",\n          progress: 3,\n          total: 3,\n          transcript: { text, words, chunks, language: "pt", captionPreset },\n        });\n      } catch (err) {\n        await updateMediaJob(jobId, tenantId, {\n          status: "error",\n          error: err instanceof Error ? err.message : "Erro na transcrição do vídeo",\n        }).catch(() => undefined);\n      } finally {\n        await unlink(inPath).catch(() => {});\n        await unlink(audioPath).catch(() => {});\n      }\n    })();\n  },\n);\n\n'''

backend = replace_once(
    backend,
    'router.post(\n  "/tenants/:tenantId/content-studio/video/caption",',
    transcribe_route + 'router.post(\n  "/tenants/:tenantId/content-studio/video/caption",',
    'backend editable transcription route',
)

# ──────────────────────────────────────────────────────────────────────────────
# Frontend model + helpers.
# ──────────────────────────────────────────────────────────────────────────────
frontend = replace_once(
    frontend,
    'type TextAlign = "left" | "center" | "right";\n',
    '''type TextAlign = "left" | "center" | "right";\ntype CaptionStylePreset = "impact" | "highlight" | "clean" | "minimal";\n\ntype CaptionWord = {\n  word: string;\n  start: number;\n  end: number;\n};\n\ntype TranscriptChunk = {\n  start: number;\n  end: number;\n  text: string;\n  words: CaptionWord[];\n};\n\ntype TranscriptPayload = {\n  text: string;\n  words: CaptionWord[];\n  chunks: TranscriptChunk[];\n  language?: string;\n  captionPreset?: string;\n};\n''',
    'frontend caption types',
)

frontend = replace_once(
    frontend,
    '  animationDuration: number;\n  keyframes?: LayerKeyframe[];\n',
    '''  animationDuration: number;\n  contentKind?: "text" | "caption";\n  captionStyle?: CaptionStylePreset;\n  captionWords?: CaptionWord[];\n  activeWordColor?: string;\n  activeWordBackground?: string;\n  keyframes?: LayerKeyframe[];\n''',
    'frontend EditorLayer caption fields',
)

frontend = replace_once(
    frontend,
    '  { name: "CTA Social", text: "FALE COM A GENTE", fontSize: 44, y: 80, color: "#ffffff", background: "#b91c1c", textAlign: "center", enterAnimation: "zoom" },\n];\n\nfunction tokenHeaders',
    '''  { name: "CTA Social", text: "FALE COM A GENTE", fontSize: 44, y: 80, color: "#ffffff", background: "#b91c1c", textAlign: "center", enterAnimation: "zoom" },\n];\n\nconst AUTO_CAPTION_STYLES: Record<CaptionStylePreset, {\n  label: string;\n  fontSize: number;\n  y: number;\n  color: string;\n  background: string;\n  activeWordColor: string;\n  activeWordBackground: string;\n  enterAnimation: LayerAnimation;\n}> = {\n  impact: { label: "Impacto Reels", fontSize: 48, y: 70, color: "#ffffff", background: "#111827", activeWordColor: "#111827", activeWordBackground: "#facc15", enterAnimation: "pop" },\n  highlight: { label: "Destaque palavra", fontSize: 46, y: 72, color: "#ffffff", background: "#111827", activeWordColor: "#111827", activeWordBackground: "#22d3ee", enterAnimation: "slide-up" },\n  clean: { label: "Clean", fontSize: 40, y: 76, color: "#ffffff", background: "#000000", activeWordColor: "#facc15", activeWordBackground: "transparent", enterAnimation: "fade" },\n  minimal: { label: "Minimal", fontSize: 36, y: 80, color: "#ffffff", background: "transparent", activeWordColor: "#facc15", activeWordBackground: "transparent", enterAnimation: "fade" },\n};\n\nfunction tokenHeaders''',
    'frontend auto caption styles',
)

frontend = replace_once(
    frontend,
    '    layers: snapshot.layers.map((layer) => ({ ...layer, keyframes: layer.keyframes?.map((frame) => ({ ...frame })) })),',
    '    layers: snapshot.layers.map((layer) => ({ ...layer, captionWords: layer.captionWords?.map((word) => ({ ...word })), keyframes: layer.keyframes?.map((frame) => ({ ...frame })) })),',
    'frontend clone caption words',
)

frontend = replace_once(
    frontend,
    'function layerIsVisible(layer: EditorLayer, time: number): boolean {\n  return time >= layer.start && time <= layer.end;\n}\n',
    '''function layerIsVisible(layer: EditorLayer, time: number): boolean {\n  return time >= layer.start && time <= layer.end;\n}\n\nfunction retimeCaptionWords(text: string, start: number, end: number, existing: CaptionWord[] = []): CaptionWord[] {\n  const tokens = text.trim().split(/\\s+/).filter(Boolean);\n  if (!tokens.length) return [];\n  if (tokens.length === existing.length) {\n    return existing.map((word, index) => ({ ...word, word: tokens[index] ?? word.word }));\n  }\n  const duration = Math.max(0.1, end - start);\n  const step = duration / tokens.length;\n  return tokens.map((word, index) => ({\n    word,\n    start: start + step * index,\n    end: index === tokens.length - 1 ? end : start + step * (index + 1),\n  }));\n}\n\nfunction splitCaptionWordLines(ctx: CanvasRenderingContext2D, words: CaptionWord[], maxWidth: number): CaptionWord[][] {\n  const lines: CaptionWord[][] = [];\n  let current: CaptionWord[] = [];\n  let width = 0;\n  const gap = ctx.measureText(" ").width;\n  for (const word of words) {\n    const wordWidth = ctx.measureText(word.word).width;\n    const nextWidth = width + (current.length ? gap : 0) + wordWidth;\n    if (current.length && nextWidth > maxWidth) {\n      lines.push(current);\n      current = [];\n      width = 0;\n    }\n    current.push(word);\n    width += (current.length > 1 ? gap : 0) + wordWidth;\n  }\n  if (current.length) lines.push(current);\n  return lines.slice(0, 4);\n}\n\nfunction drawCaptionWordsOnCanvas(\n  ctx: CanvasRenderingContext2D,\n  layer: EditorLayer,\n  time: number,\n  maxWidth: number,\n  fontSize: number,\n  padding: number,\n) {\n  const words = layer.captionWords ?? [];\n  if (!words.length) return;\n  const contentWidth = Math.max(40, maxWidth - padding * 2);\n  const lines = splitCaptionWordLines(ctx, words, contentWidth);\n  const lineHeight = fontSize * 1.22;\n  const blockHeight = lines.length * lineHeight + padding * 2;\n  if (layer.background && layer.background !== "transparent") {\n    ctx.fillStyle = layer.background;\n    ctx.fillRect(0, 0, maxWidth, blockHeight);\n  }\n  const gap = ctx.measureText(" ").width;\n  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {\n    const line = lines[lineIndex] ?? [];\n    const widths = line.map((word) => ctx.measureText(word.word).width);\n    const lineWidth = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, line.length - 1) * gap;\n    const align = layer.textAlign ?? "center";\n    let cursorX = align === "center" ? (maxWidth - lineWidth) / 2 : align === "right" ? maxWidth - padding - lineWidth : padding;\n    const y = padding + lineIndex * lineHeight;\n    for (let index = 0; index < line.length; index += 1) {\n      const word = line[index]!;\n      const wordWidth = widths[index] ?? 0;\n      const active = time >= word.start && time <= word.end;\n      if (active && layer.activeWordBackground && layer.activeWordBackground !== "transparent") {\n        ctx.fillStyle = layer.activeWordBackground;\n        ctx.fillRect(cursorX - padding * 0.22, y - padding * 0.12, wordWidth + padding * 0.44, lineHeight * 0.95);\n      }\n      ctx.fillStyle = active ? (layer.activeWordColor || layer.color) : layer.color;\n      ctx.textAlign = "left";\n      ctx.fillText(word.word, cursorX, y);\n      cursorX += wordWidth + gap;\n    }\n  }\n}\n''',
    'frontend caption timing and canvas helpers',
)

frontend = replace_once(frontend, '    editorVersion: 7,', '    editorVersion: 8,', 'frontend editor version')

frontend = replace_once(
    frontend,
    '  const [resultUrl, setResultUrl] = useState("");\n',
    '  const [resultUrl, setResultUrl] = useState("");\n  const [autoCaptionStyle, setAutoCaptionStyle] = useState<CaptionStylePreset>("impact");\n',
    'frontend caption style state',
)

frontend = replace_once(
    frontend,
    '          animationDuration: clamp(Number(layer.animationDuration) || 0.35, 0.1, 1.5),\n          keyframes:',
    '''          animationDuration: clamp(Number(layer.animationDuration) || 0.35, 0.1, 1.5),\n          contentKind: layer.contentKind === "caption" ? "caption" : "text",\n          captionStyle: (["impact", "highlight", "clean", "minimal"] as string[]).includes(String(layer.captionStyle)) ? layer.captionStyle as CaptionStylePreset : undefined,\n          captionWords: Array.isArray(layer.captionWords) ? layer.captionWords.map((word) => ({\n            word: String(word.word ?? "").trim(),\n            start: Math.max(0, Number(word.start) || 0),\n            end: Math.max(0, Number(word.end) || 0),\n          })).filter((word) => word.word && word.end >= word.start).sort((a, b) => a.start - b.start) : [],\n          activeWordColor: typeof layer.activeWordColor === "string" ? layer.activeWordColor : "#111827",\n          activeWordBackground: typeof layer.activeWordBackground === "string" ? layer.activeWordBackground : "#facc15",\n          keyframes:''',
    'frontend caption migration',
)

frontend = replace_once(
    frontend,
    '      animationDuration: 0.28,\n    };\n    commitEditor(clipsRef.current, [...layersRef.current, layer]);',
    '''      animationDuration: 0.28,\n      contentKind: "caption",\n      captionStyle: template.name === "Destaque" ? "highlight" : template.name === "Minimal" ? "minimal" : "impact",\n      activeWordColor: "#111827",\n      activeWordBackground: "#facc15",\n    };\n    commitEditor(clipsRef.current, [...layersRef.current, layer]);''',
    'frontend manual caption metadata',
)

frontend = replace_once(
    frontend,
    '''  const updateLayer = (patch: Partial<EditorLayer>) => {\n    if (!selectedLayerId) return;\n    commitEditor(clipsRef.current, layersRef.current.map((layer) => layer.id === selectedLayerId ? { ...layer, ...patch } : layer));\n  };''',
    '''  const updateLayer = (patch: Partial<EditorLayer>) => {\n    if (!selectedLayerId) return;\n    commitEditor(clipsRef.current, layersRef.current.map((layer) => layer.id === selectedLayerId ? { ...layer, ...patch } : layer));\n  };\n\n  const updateSelectedLayerText = (text: string) => {\n    if (!selectedLayer) return;\n    updateLayer({\n      text,\n      captionWords: selectedLayer.contentKind === "caption" && selectedLayer.captionWords?.length\n        ? retimeCaptionWords(text, selectedLayer.start, selectedLayer.end, selectedLayer.captionWords)\n        : selectedLayer.captionWords,\n    });\n  };''',
    'frontend caption text editing',
)

frontend = replace_once(
    frontend,
    '        const start = clamp(original.start + delta, 0, Math.max(0, total - originalDuration));\n        return { ...item, start, end: start + originalDuration };',
    '''        const start = clamp(original.start + delta, 0, Math.max(0, total - originalDuration));\n        const shift = start - original.start;\n        return {\n          ...item,\n          start,\n          end: start + originalDuration,\n          captionWords: item.captionWords?.map((word) => ({ ...word, start: word.start + shift, end: word.end + shift })),\n        };''',
    'frontend caption words move with layer',
)

# Poll transcript output using the existing media-job endpoint.
frontend = replace_once(
    frontend,
    '  const finalizeWebm = async (blob: Blob): Promise<string> => {',
    '''  const pollTranscriptJob = async (jobId: string): Promise<TranscriptPayload> => {\n    setJobStatus("processing");\n    setJobMessage("Transcrevendo fala e sincronizando cada palavra…");\n    for (let attempt = 0; attempt < 180; attempt += 1) {\n      await new Promise((resolve) => window.setTimeout(resolve, 3000));\n      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: tokenHeaders() });\n      const data = await response.json();\n      if (data.status === "done" && data.transcript) return data.transcript as TranscriptPayload;\n      if (data.status === "error") throw new Error(data.error ?? "Erro na transcrição do vídeo");\n    }\n    throw new Error("A transcrição excedeu o tempo esperado.");\n  };\n\n  const finalizeWebm = async (blob: Blob): Promise<string> => {''',
    'frontend transcript polling',
)

# Canvas renderer: branch into word-aware caption drawing.
canvas_pattern = re.compile(r'''            const lines = wrapText\(ctx, layer\.text, Math\.max\(40, maxWidth - padding \* 2\)\);\n            const lineHeight = fontSize \* 1\.18;\n            if \(layer\.type === "card"\) \{.*?            lines\.forEach\(\(line, index\) => ctx\.fillText\(line, textX, \(layer\.type === "card" \? padding : 0\) \+ index \* lineHeight, maxWidth - padding\)\);''', re.S)
canvas_replacement = '''            if (layer.contentKind === "caption" && layer.captionWords?.length) {\n              drawCaptionWordsOnCanvas(ctx, resolvedLayer, globalTime, maxWidth, fontSize, padding);\n            } else {\n              const lines = wrapText(ctx, layer.text, Math.max(40, maxWidth - padding * 2));\n              const lineHeight = fontSize * 1.18;\n              if (layer.type === "card") {\n                ctx.fillStyle = layer.background;\n                ctx.fillRect(0, 0, maxWidth, lines.length * lineHeight + padding * 2);\n              } else if (layer.background !== "transparent" && layer.background !== "") {\n                ctx.fillStyle = `${layer.background}cc`;\n                const textWidth = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + padding * 2);\n                ctx.fillRect(0, 0, textWidth, lines.length * lineHeight + padding * 2);\n              }\n              ctx.fillStyle = layer.color;\n              const align = resolvedLayer.textAlign ?? "left";\n              ctx.textAlign = align;\n              const textX = layer.type === "card"\n                ? align === "center" ? maxWidth / 2 : align === "right" ? maxWidth - padding : padding\n                : align === "center" ? maxWidth / 2 : align === "right" ? maxWidth : 0;\n              lines.forEach((line, index) => ctx.fillText(line, textX, (layer.type === "card" ? padding : 0) + index * lineHeight, maxWidth - padding));\n            }'''
frontend, count = canvas_pattern.subn(canvas_replacement, frontend, count=1)
if count != 1:
    raise SystemExit(f'frontend canvas caption renderer: esperado 1 match, encontrado {count}')

# Replace old burn-in-only caption action by editable transcript + preserve legacy burn-in.
old_auto_pattern = re.compile(r'''  const applyAutomaticCaption = async \(\) => \{.*?\n  \};\n\n  const mediaImages''', re.S)
new_auto = '''  const createEditableAutomaticCaptions = async () => {\n    if (!tenantId) return;\n    if (clipsRef.current.length > 1 && !resultUrl) {\n      toast({ title: "Finalize a sequência primeiro", description: "Com vários clipes, exporte o MP4 único antes de transcrever para a timeline." });\n      return;\n    }\n    const source = resultUrl || activeClip?.url;\n    if (!source) return;\n    setJobStatus("processing");\n    setJobMessage("Preparando fala para legendas editáveis…");\n    try {\n      const response = await fetch(source, { headers: source.startsWith("/api/") ? tokenHeaders() : undefined });\n      if (!response.ok) throw new Error("Não foi possível carregar o vídeo para transcrição.");\n      const blob = await response.blob();\n      const form = new FormData();\n      form.append("video", new File([blob], "video-transcricao.mp4", { type: blob.type || "video/mp4" }));\n      const start = await fetch(`/api/tenants/${tenantId}/content-studio/video/transcribe`, { method: "POST", headers: tokenHeaders(), body: form });\n      const data = await start.json();\n      if (!start.ok) throw new Error(data.error ?? "Falha ao iniciar transcrição");\n      const transcript = await pollTranscriptJob(String(data.jobId));\n      const style = AUTO_CAPTION_STYLES[autoCaptionStyle];\n      const usingRenderedSequence = Boolean(resultUrl);\n      const sourceOffset = usingRenderedSequence ? 0 : (activeClip?.trimIn ?? 0);\n      const maxTime = projectDurationFor(clipsRef.current);\n      const generated: EditorLayer[] = [];\n\n      for (const chunk of transcript.chunks ?? []) {\n        const adjustedWords = (chunk.words ?? []).map((word) => ({\n          word: String(word.word ?? "").trim(),\n          start: Number(word.start) - sourceOffset,\n          end: Number(word.end) - sourceOffset,\n        })).filter((word) => word.word && word.end > 0 && word.start < maxTime);\n        if (!adjustedWords.length) continue;\n        const words = adjustedWords.map((word) => ({ ...word, start: clamp(word.start, 0, maxTime), end: clamp(word.end, 0, maxTime) })).filter((word) => word.end > word.start);\n        if (!words.length) continue;\n        const layerStart = words[0]!.start;\n        const layerEnd = words[words.length - 1]!.end;\n        generated.push({\n          id: uid("caption-auto"),\n          type: "text",\n          name: `Legenda automática · ${style.label}`,\n          text: words.map((word) => word.word).join(" "),\n          start: layerStart,\n          end: Math.max(layerStart + 0.08, layerEnd),\n          x: 7,\n          y: style.y,\n          width: 86,\n          fontSize: style.fontSize,\n          color: style.color,\n          background: style.background,\n          opacity: 1,\n          scale: 1,\n          rotation: 0,\n          easing: "ease-out",\n          textAlign: "center",\n          enterAnimation: style.enterAnimation,\n          exitAnimation: "fade",\n          animationDuration: 0.18,\n          contentKind: "caption",\n          captionStyle: autoCaptionStyle,\n          captionWords: words,\n          activeWordColor: style.activeWordColor,\n          activeWordBackground: style.activeWordBackground,\n        });\n      }\n\n      if (!generated.length) throw new Error("A fala foi transcrita, mas não houve segmentos dentro do trecho editado.");\n      const preserved = layersRef.current.filter((layer) => !(layer.contentKind === "caption" && layer.name.startsWith("Legenda automática")));\n      commitEditor(clipsRef.current, [...preserved, ...generated]);\n      selectLayer(generated[0]!.id);\n      setTimelineTime(generated[0]!.start);\n      setTool("captions");\n      setJobStatus("done");\n      setJobMessage(`${generated.length} legenda${generated.length === 1 ? "" : "s"} sincronizada${generated.length === 1 ? "" : "s"} adicionada${generated.length === 1 ? "" : "s"} à timeline.`);\n      toast({ title: "Legendas editáveis criadas", description: "Cada frase está na timeline e a palavra falada recebe destaque automático." });\n    } catch (error) {\n      setJobStatus("error");\n      setJobMessage(error instanceof Error ? error.message : "Falha ao gerar legendas editáveis");\n    }\n  };\n\n  const applyBurnedAutomaticCaption = async () => {\n    if (!tenantId) return;\n    if (clipsRef.current.length > 1 && !resultUrl) {\n      toast({ title: "Finalize a sequência primeiro", description: "Com vários clipes, exporte o MP4 único antes de aplicar a legenda fixa." });\n      return;\n    }\n    const source = resultUrl || activeClip?.url;\n    if (!source) return;\n    setJobStatus("processing");\n    setJobMessage("Gerando versão com legenda fixa…");\n    try {\n      const response = await fetch(source, { headers: source.startsWith("/api/") ? tokenHeaders() : undefined });\n      if (!response.ok) throw new Error("Não foi possível carregar o vídeo para legendagem.");\n      const blob = await response.blob();\n      const form = new FormData();\n      form.append("video", new File([blob], "video-legenda.mp4", { type: blob.type || "video/mp4" }));\n      const start = await fetch(`/api/tenants/${tenantId}/content-studio/video/caption`, { method: "POST", headers: tokenHeaders(), body: form });\n      const data = await start.json();\n      if (!start.ok) throw new Error(data.error ?? "Falha ao iniciar legendagem");\n      const url = await pollJob(String(data.jobId));\n      setResultUrl(url);\n      setJobStatus("done");\n      setJobMessage("Versão com legenda fixa salva na Biblioteca Audiovisual.");\n    } catch (error) {\n      setJobStatus("error");\n      setJobMessage(error instanceof Error ? error.message : "Falha ao aplicar legenda");\n    }\n  };\n\n  const mediaImages'''
frontend, count = old_auto_pattern.subn(new_auto, frontend, count=1)
if count != 1:
    raise SystemExit(f'frontend automatic captions action: esperado 1 match, encontrado {count}')

# Inspector: caption identity, synchronized text edits, active-word colors and style preset.
frontend = replace_once(
    frontend,
    '{selectedLayer.type === "image" ? "Imagem" : selectedLayer.type === "card" ? "Card" : "Texto"}',
    '{selectedLayer.type === "image" ? "Imagem" : selectedLayer.type === "card" ? "Card" : selectedLayer.contentKind === "caption" ? "Legenda sincronizada" : "Texto"}',
    'frontend inspector caption label',
)
frontend = replace_once(
    frontend,
    '<textarea value={selectedLayer.text} onChange={(event) => updateLayer({ text: event.target.value })}',
    '<textarea value={selectedLayer.text} onChange={(event) => updateSelectedLayerText(event.target.value)}',
    'frontend synchronized textarea',
)

color_block = '''      {selectedLayer.type !== "image" && <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><span className="text-xs text-muted-foreground">Texto</span><input type="color" value={selectedLayer.color} onChange={(event) => updateLayer({ color: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label><label className="space-y-1.5"><span className="text-xs text-muted-foreground">Fundo</span><input type="color" value={selectedLayer.background || "#000000"} onChange={(event) => updateLayer({ background: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label></div>}'''
color_replacement = color_block + '''\n      {selectedLayer.contentKind === "caption" && <div className="space-y-3 rounded-xl border bg-muted/20 p-3"><div><p className="text-xs font-semibold">Destaque palavra a palavra</p><p className="text-[10px] text-muted-foreground">{selectedLayer.captionWords?.length ?? 0} palavras sincronizadas com a fala.</p></div><label className="block space-y-1.5"><span className="text-[10px] text-muted-foreground">Estilo</span><select value={selectedLayer.captionStyle ?? "impact"} onChange={(event) => { const preset = event.target.value as CaptionStylePreset; const style = AUTO_CAPTION_STYLES[preset]; updateLayer({ captionStyle: preset, fontSize: style.fontSize, y: style.y, color: style.color, background: style.background, activeWordColor: style.activeWordColor, activeWordBackground: style.activeWordBackground, enterAnimation: style.enterAnimation }); }} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">{Object.entries(AUTO_CAPTION_STYLES).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><span className="text-[10px] text-muted-foreground">Palavra ativa</span><input type="color" value={selectedLayer.activeWordColor || "#111827"} onChange={(event) => updateLayer({ activeWordColor: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label><label className="space-y-1.5"><span className="text-[10px] text-muted-foreground">Fundo ativo</span><input type="color" value={selectedLayer.activeWordBackground && selectedLayer.activeWordBackground !== "transparent" ? selectedLayer.activeWordBackground : "#facc15"} onChange={(event) => updateLayer({ activeWordBackground: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label></div></div>}'''
frontend = replace_once(frontend, color_block, color_replacement, 'frontend caption inspector colors')

# Tool panel: style choice + editable transcription + legacy fixed version.
caption_tool_pattern = re.compile(r'''    if \(tool === "captions"\) return <div className="space-y-3">.*?</div>;\n    if \(tool === "settings"\)''', re.S)
caption_tool = '''    if (tool === "captions") return <div className="space-y-4"><div><p className="text-sm font-semibold">Legendas inteligentes</p><p className="text-xs text-muted-foreground">Transcreva a fala para a timeline e destaque cada palavra no momento exato.</p></div><div className="space-y-2"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estilo automático</p><div className="grid grid-cols-2 gap-2">{Object.entries(AUTO_CAPTION_STYLES).map(([id, style]) => <button key={id} onClick={() => setAutoCaptionStyle(id as CaptionStylePreset)} className={cn("rounded-xl border p-2 text-left", autoCaptionStyle === id ? "border-primary bg-primary/5" : "hover:border-primary/30")}><div className="truncate text-xs font-semibold">{style.label}</div><div className="mt-1 flex gap-1"><span className="h-2 w-5 rounded-sm" style={{ background: style.color }} /><span className="h-2 w-5 rounded-sm" style={{ background: style.activeWordBackground === "transparent" ? style.activeWordColor : style.activeWordBackground }} /></div></button>)}</div></div><button disabled={!clips.length || jobStatus === "processing" || jobStatus === "rendering"} onClick={() => void createEditableAutomaticCaptions()} className="w-full rounded-xl bg-foreground px-3 py-3 text-sm font-semibold text-background disabled:opacity-40"><Captions className="mr-2 inline h-4 w-4" />Transcrever para a timeline</button><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs font-semibold">Adicionar manualmente</p><div className="mt-2 space-y-2">{CAPTION_TEMPLATES.map((template) => <button key={template.name} onClick={() => addCaptionLayer(template)} className="w-full rounded-lg border bg-background p-2 text-left hover:border-primary/40"><div className="rounded-md px-2 py-1.5 text-[10px] font-bold" style={{ background: template.background, color: template.color, textAlign: template.textAlign }}>{template.text}</div><p className="mt-1.5 text-[10px] font-medium">{template.name}</p></button>)}</div></div><button disabled={!clips.length || jobStatus === "processing" || jobStatus === "rendering"} onClick={() => void applyBurnedAutomaticCaption()} className="w-full rounded-xl border px-3 py-2.5 text-xs font-medium disabled:opacity-40">Gerar versão com legenda fixa</button><p className="text-[11px] text-muted-foreground">A opção principal cria faixas editáveis e mantém o original intacto. A versão fixa continua disponível para compatibilidade.</p></div>;\n    if (tool === "settings")'''
frontend, count = caption_tool_pattern.subn(caption_tool, frontend, count=1)
if count != 1:
    raise SystemExit(f'frontend caption tool panel: esperado 1 match, encontrado {count}')

# Preview renderer with live active-word highlighting.
preview_pattern = re.compile(r'''  const renderPreviewLayer = \(layer: EditorLayer\) => \{.*?\n  \};\n\n  const renderTimelineLayer''', re.S)
preview_replacement = '''  const renderPreviewLayer = (layer: EditorLayer) => {\n    const resolvedLayer = resolveAnimatedLayerAtTime(layer, timelineTime);\n    const style: CSSProperties = { position: "absolute", left: `${resolvedLayer.x}%`, top: `${resolvedLayer.y}%`, width: `${resolvedLayer.width}%`, opacity: resolvedLayer.opacity, transform: `rotate(${resolvedLayer.rotation ?? 0}deg) scale(${resolvedLayer.scale ?? 1})`, transformOrigin: "top left" };\n    const selected = selectedLayerId === layer.id;\n    const synchronized = layer.contentKind === "caption" && Boolean(layer.captionWords?.length);\n    return <div key={layer.id} style={style} className={cn("group touch-none select-none", selected && "z-20")} onPointerDown={(event) => startStageGesture(event, layer, "move")}>{layer.type === "image" ? <img src={layer.url} alt="" draggable={false} className={cn("block h-auto max-h-[85%] w-full object-contain", selected && "outline outline-2 outline-primary")} /> : <div style={{ color: layer.color, background: layer.type === "card" || layer.contentKind === "caption" ? layer.background : "transparent", fontSize: `${Math.max(11, layer.fontSize * 0.38)}px`, whiteSpace: "normal", textAlign: layer.textAlign ?? "left" }} className={cn("rounded-lg p-2 font-bold leading-tight", selected && "outline outline-2 outline-primary")}>{synchronized ? layer.captionWords!.map((word, index) => { const active = timelineTime >= word.start && timelineTime <= word.end; return <span key={`${word.start}-${index}`} className="inline-block rounded px-0.5" style={{ color: active ? (layer.activeWordColor || layer.color) : layer.color, background: active && layer.activeWordBackground !== "transparent" ? (layer.activeWordBackground || "transparent") : "transparent" }}>{word.word}{index < layer.captionWords!.length - 1 ? " " : ""}</span>; }) : layer.text}</div>}{selected && <button type="button" aria-label="Redimensionar camada" onPointerDown={(event) => startStageGesture(event, layer, "resize")} className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow" />}</div>;\n  };\n\n  const renderTimelineLayer'''
frontend, count = preview_pattern.subn(preview_replacement, frontend, count=1)
if count != 1:
    raise SystemExit(f'frontend preview caption renderer: esperado 1 match, encontrado {count}')

# Split captions into their own timeline row.
frontend = replace_once(
    frontend,
    '    { id: "text", label: "Texto", icon: Type, items: layers.filter((layer) => layer.type === "text") },\n    { id: "card", label: "Cards", icon: Square, items: layers.filter((layer) => layer.type === "card") },',
    '    { id: "text", label: "Texto", icon: Type, items: layers.filter((layer) => layer.type === "text" && layer.contentKind !== "caption") },\n    { id: "caption", label: "Legendas", icon: Captions, items: layers.filter((layer) => layer.contentKind === "caption") },\n    { id: "card", label: "Cards", icon: Square, items: layers.filter((layer) => layer.type === "card") },',
    'frontend captions timeline row',
)

FRONTEND.write_text(frontend)
BACKEND.write_text(backend)
print('patched editable automatic captions')
