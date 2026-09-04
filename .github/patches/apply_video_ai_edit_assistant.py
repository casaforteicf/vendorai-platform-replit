from pathlib import Path

FRONT = Path("artifacts/frontend/src/components/video/VideoTimelineEditor.tsx")
BACK = Path("artifacts/api-server/src/routes/content_studio.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 ocorrência, encontrado {count}")
    return text.replace(old, new, 1)


front = FRONT.read_text()

front = replace_once(
    front,
    'type ToolPanel = "media" | "text" | "cards" | "stickers" | "audio" | "captions" | "settings";',
    'type ToolPanel = "media" | "text" | "cards" | "stickers" | "audio" | "captions" | "ai" | "settings";',
    "ToolPanel",
)

front = replace_once(
    front,
    '''type BrandKitPayload = {\n  brandKit?: {\n    default_music_asset_id?: string | null;\n  } | null;\n};\n''',
    '''type BrandKitPayload = {\n  brandKit?: {\n    default_music_asset_id?: string | null;\n  } | null;\n};\n\ntype AiEditSuggestion = {\n  id: string;\n  type: "sticker" | "cta" | "caption_motion" | "clip_motion";\n  start: number;\n  end: number;\n  reason: string;\n  layerId?: string;\n  clipId?: string;\n  text?: string;\n  emoji?: string;\n  motion?: CaptionMotion | ClipMotion;\n};\n\ntype AiEditPlan = {\n  goal: string;\n  summary: string;\n  suggestions: AiEditSuggestion[];\n  source?: "ai" | "fallback";\n};\n''',
    "AI types",
)

front = replace_once(
    front,
    '''const TOOL_ITEMS: Array<{ id: ToolPanel; label: string; icon: typeof Film }> = [\n  { id: "media", label: "Mídia", icon: Library },\n  { id: "text", label: "Texto", icon: Type },\n  { id: "cards", label: "Cards", icon: Square },\n  { id: "stickers", label: "Stickers", icon: WandSparkles },\n  { id: "audio", label: "Áudio", icon: Music2 },\n  { id: "captions", label: "Legendas", icon: Captions },\n  { id: "settings", label: "Ajustes", icon: Settings2 },\n];\n''',
    '''const TOOL_ITEMS: Array<{ id: ToolPanel; label: string; icon: typeof Film }> = [\n  { id: "media", label: "Mídia", icon: Library },\n  { id: "text", label: "Texto", icon: Type },\n  { id: "cards", label: "Cards", icon: Square },\n  { id: "stickers", label: "Stickers", icon: WandSparkles },\n  { id: "audio", label: "Áudio", icon: Music2 },\n  { id: "captions", label: "Legendas", icon: Captions },\n  { id: "ai", label: "Assistente IA", icon: WandSparkles },\n  { id: "settings", label: "Ajustes", icon: Settings2 },\n];\n\nconst AI_EDIT_GOALS = [\n  { id: "commercial", label: "Mais comercial", hint: "Oferta, benefício e CTA com ritmo de venda" },\n  { id: "dynamic", label: "Mais dinâmico", hint: "Movimento, destaques e variação visual" },\n  { id: "reel", label: "Reel rápido", hint: "Gancho forte e retenção para vídeo curto" },\n  { id: "offer", label: "Destacar oferta", hint: "Preço, condição, urgência e chamada final" },\n  { id: "clean", label: "Profissional e clean", hint: "Ênfases discretas e acabamento institucional" },\n];\n''',
    "tool items",
)

front = replace_once(
    front,
    '''  const [resultUrl, setResultUrl] = useState("");\n  const [autoCaptionStyle, setAutoCaptionStyle] = useState<CaptionStylePreset>("impact");\n\n  const [handoffFile, setHandoffFile] = useState<File | null>(null);''',
    '''  const [resultUrl, setResultUrl] = useState("");\n  const [autoCaptionStyle, setAutoCaptionStyle] = useState<CaptionStylePreset>("impact");\n  const [aiGoal, setAiGoal] = useState("commercial");\n  const [aiInstructions, setAiInstructions] = useState("");\n  const [aiPlan, setAiPlan] = useState<AiEditPlan | null>(null);\n  const [aiAnalyzing, setAiAnalyzing] = useState(false);\n  const [aiSelectedIds, setAiSelectedIds] = useState<Set<string>>(new Set());\n\n  const [handoffFile, setHandoffFile] = useState<File | null>(null);''',
    "AI state",
)

front = replace_once(
    front,
    '''  const serializedContext = useMemo(() => ({\n    editorVersion: 9,\n    channel,''',
    '''  const serializedContext = useMemo(() => ({\n    editorVersion: 10,\n    channel,''',
    "editor version",
)

front = replace_once(
    front,
    '''    layers: layers.map(({ localFile: _localFile, ...layer }) => layer),\n    audio: {''',
    '''    layers: layers.map(({ localFile: _localFile, ...layer }) => layer),\n    aiEditPlan: aiPlan,\n    audio: {''',
    "serialize AI plan",
)

front = replace_once(
    front,
    ''')}), [channel, ratio, quality, clips, layers, musicMode, musicAssetId, musicVolume, originalVolume, musicStart, musicEnd]);''',
    ''')}), [channel, ratio, quality, clips, layers, aiPlan, musicMode, musicAssetId, musicVolume, originalVolume, musicStart, musicEnd]);''',
    "serialized deps",
)

front = replace_once(
    front,
    '''        if (context.channel) setChannel(context.channel);\n        if (["9:16", "16:9", "1:1", "4:5"].includes(context.ratio)) setRatio(context.ratio);\n        if (["720p", "1080p"].includes(context.quality)) setQuality(context.quality);\n\n        let nextClips: VideoClip[] = [];''',
    '''        if (context.channel) setChannel(context.channel);\n        if (["9:16", "16:9", "1:1", "4:5"].includes(context.ratio)) setRatio(context.ratio);\n        if (["720p", "1080p"].includes(context.quality)) setQuality(context.quality);\n        if (context.aiEditPlan && Array.isArray(context.aiEditPlan.suggestions)) {\n          const restoredPlan = context.aiEditPlan as AiEditPlan;\n          setAiPlan(restoredPlan);\n          setAiSelectedIds(new Set(restoredPlan.suggestions.map((item) => item.id)));\n        }\n\n        let nextClips: VideoClip[] = [];''',
    "restore AI plan",
)

ai_functions = r'''

  const analyzeVideoWithAi = async () => {
    if (!tenantId || !clipsRef.current.length || aiAnalyzing) return;
    const captions = layersRef.current
      .filter((layer) => layer.contentKind === "caption" && layer.text.trim())
      .sort((a, b) => a.start - b.start);
    if (!captions.length) {
      toast({ title: "A IA precisa entender a fala", description: "Gere as legendas inteligentes primeiro. Elas fornecem o texto e os tempos exatos para a análise." });
      setTool("captions");
      return;
    }

    setAiAnalyzing(true);
    try {
      const currentClips = clipsRef.current;
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/ai-edit-plan`, {
        method: "POST",
        headers: tokenHeaders(true),
        body: JSON.stringify({
          goal: aiGoal,
          instructions: aiInstructions.trim(),
          channel,
          ratio,
          duration: projectDurationFor(currentClips),
          clips: currentClips.map((clip, index) => ({
            id: clip.id,
            name: clip.name,
            start: clipStartAt(index, currentClips),
            end: clipStartAt(index, currentClips) + clipDuration(clip),
          })),
          captions: captions.map((layer) => ({ id: layer.id, start: layer.start, end: layer.end, text: layer.text })),
        }),
      });
      const data = await response.json() as { plan?: AiEditPlan; error?: string };
      if (!response.ok || !data.plan) throw new Error(data.error ?? "A IA não retornou um plano de edição");
      setAiPlan(data.plan);
      setAiSelectedIds(new Set(data.plan.suggestions.map((item) => item.id)));
      toast({ title: "Plano de edição pronto", description: `${data.plan.suggestions.length} melhoria${data.plan.suggestions.length === 1 ? "" : "s"} encontrada${data.plan.suggestions.length === 1 ? "" : "s"}. Revise e aplique na timeline.` });
    } catch (error) {
      toast({ title: "Não foi possível analisar o vídeo", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const toggleAiSuggestion = (id: string) => {
    setAiSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyAiEditPlan = () => {
    if (!aiPlan) return;
    const suggestions = aiPlan.suggestions.filter((item) => aiSelectedIds.has(item.id)).sort((a, b) => a.start - b.start);
    if (!suggestions.length) {
      toast({ title: "Selecione ao menos uma melhoria" });
      return;
    }

    let nextClips = clipsRef.current.map((clip) => ({ ...clip }));
    let nextLayers = layersRef.current.map((layer) => ({ ...layer, captionWords: layer.captionWords?.map((word) => ({ ...word })) }));

    for (const suggestion of suggestions) {
      if (suggestion.type === "caption_motion" && suggestion.layerId) {
        nextLayers = nextLayers.map((layer) => layer.id === suggestion.layerId && layer.contentKind === "caption"
          ? { ...layer, captionMotion: (suggestion.motion as CaptionMotion) || "word-pop" }
          : layer);
        continue;
      }

      if (suggestion.type === "sticker") {
        const start = clamp(suggestion.start, 0, projectDurationFor(nextClips));
        const end = clamp(Math.max(start + 0.4, suggestion.end), start + 0.4, projectDurationFor(nextClips));
        nextLayers.push({
          id: uid("ai-sticker"), type: "text", name: "Sticker · IA", text: suggestion.emoji || "✨",
          start, end, x: 72, y: 12, width: 16, fontSize: 72, color: "#ffffff", background: "transparent",
          opacity: 1, scale: 1, rotation: 0, easing: "ease-out", textAlign: "center", enterAnimation: "pop", exitAnimation: "fade", animationDuration: 0.2,
          contentKind: "sticker",
        });
        continue;
      }

      if (suggestion.type === "cta") {
        const start = clamp(suggestion.start, 0, projectDurationFor(nextClips));
        const end = clamp(Math.max(start + 0.8, suggestion.end), start + 0.8, projectDurationFor(nextClips));
        nextLayers.push({
          id: uid("ai-cta"), type: "card", name: "CTA · IA", text: suggestion.text || "Fale com nossa equipe",
          start, end, x: 8, y: 68, width: 84, fontSize: 36, color: "#ffffff", background: "#111827",
          opacity: 0.94, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "center", enterAnimation: "slide-up", exitAnimation: "fade", animationDuration: 0.3,
        });
        continue;
      }

      if (suggestion.type === "clip_motion") {
        const total = projectDurationFor(nextClips);
        const start = clamp(suggestion.start, 0, Math.max(0, total - 0.1));
        const end = clamp(Math.max(start + 0.5, suggestion.end), start + 0.5, total);
        const located = locateClip(start, nextClips);
        if (!located) continue;
        const centerEndGlobal = Math.min(end, located.end);
        const sourceStart = located.clip.trimIn + (start - located.start);
        const sourceEnd = located.clip.trimIn + (centerEndGlobal - located.start);
        if (sourceEnd - sourceStart < 0.25) continue;

        const pieces: VideoClip[] = [];
        if (sourceStart - located.clip.trimIn > 0.08) {
          pieces.push({ ...located.clip, id: uid("clip-ai"), name: `${located.clip.name} · antes`, trimOut: sourceStart, transitionOut: "cut", motion: located.clip.motion ?? "none" });
        }
        pieces.push({
          ...located.clip,
          id: uid("clip-ai-focus"),
          name: `${located.clip.name} · destaque IA`,
          trimIn: sourceStart,
          trimOut: sourceEnd,
          transitionOut: "cut",
          motion: (suggestion.motion as ClipMotion) || "zoom-in",
        });
        if (located.clip.trimOut - sourceEnd > 0.08) {
          pieces.push({ ...located.clip, id: uid("clip-ai"), name: `${located.clip.name} · depois`, trimIn: sourceEnd });
        } else if (pieces.length) {
          const last = pieces[pieces.length - 1]!;
          last.transitionOut = located.clip.transitionOut;
          last.transitionDuration = located.clip.transitionDuration;
        }
        if (pieces.length > 1) {
          const last = pieces[pieces.length - 1]!;
          last.transitionOut = located.clip.transitionOut;
          last.transitionDuration = located.clip.transitionDuration;
        }
        const replacement = [...nextClips];
        replacement.splice(located.index, 1, ...pieces);
        nextClips = replacement;
      }
    }

    commitEditor(nextClips, nextLayers);
    const active = locateClip(clamp(timelineTime, 0, Math.max(0, projectDurationFor(nextClips) - 0.001)), nextClips);
    if (active) {
      setActiveClipId(active.clip.id);
      setSelectedClipId("");
    }
    setSelectedLayerId("");
    toast({ title: "Melhorias aplicadas", description: `${suggestions.length} ajuste${suggestions.length === 1 ? "" : "s"} entrou${suggestions.length === 1 ? "" : "aram"} na timeline. Tudo continua editável e pode ser desfeito.` });
  };
'''

front = replace_once(
    front,
    '''  const mediaImages = assets.filter((asset) => asset.type === "image");''',
    ai_functions + '''\n  const mediaImages = assets.filter((asset) => asset.type === "image");''',
    "AI functions",
)

ai_tool = r'''    if (tool === "ai") return <div className="space-y-4">
      <div><p className="text-sm font-semibold">Assistente de edição IA</p><p className="text-xs text-muted-foreground">Analisa a fala e cria ajustes reais na timeline. Você revisa antes de aplicar.</p></div>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Objetivo</span><select value={aiGoal} onChange={(event) => setAiGoal(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{AI_EDIT_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}</select><p className="text-[10px] text-muted-foreground">{AI_EDIT_GOALS.find((goal) => goal.id === aiGoal)?.hint}</p></label>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Orientação adicional · opcional</span><textarea value={aiInstructions} onChange={(event) => setAiInstructions(event.target.value)} rows={3} placeholder="Ex.: destaque a condição comercial e termine chamando para o WhatsApp" className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-xs outline-none focus:border-primary" /></label>
      {!layers.some((layer) => layer.contentKind === "caption" && layer.text.trim()) && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-xs font-semibold">Transcrição necessária</p><p className="mt-1 text-[11px] text-muted-foreground">A IA usa as legendas sincronizadas para saber o que é dito e em qual segundo acontece.</p><button onClick={() => setTool("captions")} className="mt-2 rounded-lg border bg-background px-2.5 py-1.5 text-[10px] font-medium">Ir para Legendas</button></div>}
      <button disabled={aiAnalyzing || !clips.length || !layers.some((layer) => layer.contentKind === "caption" && layer.text.trim())} onClick={() => void analyzeVideoWithAi()} className="w-full rounded-xl bg-foreground px-3 py-3 text-sm font-semibold text-background disabled:opacity-40">{aiAnalyzing ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Analisando roteiro e timeline…</> : <><WandSparkles className="mr-2 inline h-4 w-4" />Analisar e sugerir</>}</button>
      {aiPlan && <div className="space-y-3"><div className="rounded-xl border bg-primary/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Plano de edição</p><span className="rounded-full border bg-background px-2 py-0.5 text-[9px] text-muted-foreground">{aiPlan.source === "fallback" ? "Automação segura" : "IA"}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{aiPlan.summary}</p></div><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{aiPlan.suggestions.map((suggestion) => { const selected = aiSelectedIds.has(suggestion.id); const label = suggestion.type === "sticker" ? `Sticker ${suggestion.emoji || "✨"}` : suggestion.type === "cta" ? "CTA" : suggestion.type === "caption_motion" ? "Movimento da legenda" : "Zoom / câmera"; return <label key={suggestion.id} className={cn("flex cursor-pointer gap-2 rounded-xl border p-2.5", selected && "border-primary/40 bg-primary/5")}><input type="checkbox" checked={selected} onChange={() => toggleAiSuggestion(suggestion.id)} className="mt-0.5 accent-primary" /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold">{label}</span><span className="text-[9px] tabular-nums text-muted-foreground">{timeLabel(suggestion.start)}–{timeLabel(suggestion.end)}</span></span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{suggestion.reason}</span>{suggestion.type === "cta" && suggestion.text && <span className="mt-1 block rounded bg-background px-1.5 py-1 text-[10px] font-medium">{suggestion.text}</span>}</span></label>; })}</div><button disabled={aiSelectedIds.size === 0} onClick={applyAiEditPlan} className="w-full rounded-xl border border-primary bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">Aplicar {aiSelectedIds.size} melhoria{aiSelectedIds.size === 1 ? "" : "s"} na timeline</button><p className="text-[10px] text-muted-foreground">Os ajustes viram clipes/camadas comuns. Você pode mover, editar, excluir ou usar Desfazer.</p></div>}
    </div>;
'''

front = replace_once(
    front,
    '''  const ToolContent = (() => {\n    if (tool === "text") return''',
    '''  const ToolContent = (() => {\n''' + ai_tool + '''    if (tool === "text") return''',
    "AI tool panel",
)

FRONT.write_text(front)

back = BACK.read_text()
backend_insert = r'''

// ─── Assistente IA para edição não destrutiva de vídeo ───────────────────────

type VideoAiSuggestionType = "sticker" | "cta" | "caption_motion" | "clip_motion";
type VideoAiSuggestion = {
  id: string;
  type: VideoAiSuggestionType;
  start: number;
  end: number;
  reason: string;
  layerId?: string;
  clipId?: string;
  text?: string;
  emoji?: string;
  motion?: string;
};

type VideoAiInput = {
  goal?: string;
  instructions?: string;
  channel?: string;
  ratio?: string;
  duration?: number;
  clips?: Array<{ id: string; name?: string; start: number; end: number }>;
  captions?: Array<{ id: string; start: number; end: number; text: string }>;
};

const CAPTION_AI_MOTIONS = new Set(["none", "word-pop", "word-bounce", "pulse", "karaoke"]);
const CLIP_AI_MOTIONS = new Set(["zoom-in", "zoom-out", "pan-left", "pan-right"]);
const AI_EDIT_GOAL_LABELS: Record<string, string> = {
  commercial: "mais comercial, com benefício, oferta e CTA",
  dynamic: "mais dinâmico, com retenção e variação visual",
  reel: "Reel rápido, direto e com gancho forte",
  offer: "destacar oferta, condição e chamada para ação",
  clean: "profissional, clean e institucional",
};

function bounded(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
}

function extractJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Resposta da IA sem JSON válido");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function fallbackVideoEditPlan(input: Required<Pick<VideoAiInput, "goal" | "duration" | "clips" | "captions">>) {
  const suggestions: VideoAiSuggestion[] = [];
  const captions = input.captions;
  const duration = input.duration;
  const impact = captions.find((item) => /oferta|desconto|preço|valor|agora|hoje|benef[ií]cio|resultado|novo|novidade|garantia|econom/i.test(item.text)) ?? captions[0];
  if (impact) {
    suggestions.push({ id: `fallback-caption-${impact.id}`, type: "caption_motion", start: impact.start, end: impact.end, layerId: impact.id, motion: input.goal === "clean" ? "pulse" : "word-pop", reason: "Dá ênfase à frase mais relevante sem alterar o texto falado." });
    if (input.goal !== "clean") suggestions.push({ id: `fallback-sticker-${impact.id}`, type: "sticker", start: impact.start, end: Math.min(duration, Math.max(impact.end, impact.start + 1.4)), emoji: input.goal === "offer" ? "💰" : "✨", reason: "Cria um ponto visual de atenção no trecho de maior intenção comercial." });
  }
  const firstClip = input.clips[0];
  if (firstClip && firstClip.end - firstClip.start > 1.2) {
    suggestions.push({ id: `fallback-motion-${firstClip.id}`, type: "clip_motion", start: firstClip.start, end: Math.min(firstClip.end, firstClip.start + 1.8), clipId: firstClip.id, motion: "zoom-in", reason: "Adiciona movimento curto no início para aumentar a retenção visual." });
  }
  if (duration > 1) {
    suggestions.push({ id: "fallback-cta-final", type: "cta", start: Math.max(0, duration - 4), end: duration, text: "Fale com nossa equipe", reason: "Fecha o vídeo com uma chamada clara sem inventar condição comercial." });
  }
  return { goal: input.goal, summary: "Plano seguro criado a partir da timeline e da transcrição.", suggestions, source: "fallback" as const };
}

router.post("/tenants/:tenantId/content-studio/video/ai-edit-plan", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const input = (req.body ?? {}) as VideoAiInput;
  const duration = bounded(input.duration, 0.1, 7_200);
  const clips = Array.isArray(input.clips) ? input.clips.filter((item) => item && typeof item.id === "string").slice(0, 80) : [];
  const captions = Array.isArray(input.captions)
    ? input.captions.filter((item) => item && typeof item.id === "string" && typeof item.text === "string" && item.text.trim()).slice(0, 300)
    : [];
  if (!clips.length) { res.status(422).json({ error: "Adicione ao menos um clipe antes da análise." }); return; }
  if (!captions.length) { res.status(422).json({ error: "Gere as legendas inteligentes antes da análise por IA." }); return; }

  const goal = typeof input.goal === "string" && input.goal in AI_EDIT_GOAL_LABELS ? input.goal : "commercial";
  const safeInstructions = typeof input.instructions === "string" ? input.instructions.trim().slice(0, 800) : "";
  const captionIds = new Set(captions.map((item) => item.id));
  const clipIds = new Set(clips.map((item) => item.id));
  const transcript = captions.map((item) => `[${item.start.toFixed(2)}-${item.end.toFixed(2)}] (${item.id}) ${item.text}`).join("\n");
  const clipMap = clips.map((item) => `[${item.start.toFixed(2)}-${item.end.toFixed(2)}] (${item.id}) ${item.name ?? "Clipe"}`).join("\n");

  const fallback = fallbackVideoEditPlan({ goal, duration, clips, captions });
  try {
    const prompt = `Crie um plano de edição de vídeo NÃO DESTRUTIVO para o editor VendorAI.\n\nOBJETIVO: ${AI_EDIT_GOAL_LABELS[goal]}\nCANAL: ${String(input.channel ?? "reels")}\nFORMATO: ${String(input.ratio ?? "9:16")}\nDURAÇÃO: ${duration.toFixed(2)}s\nORIENTAÇÃO ADICIONAL: ${safeInstructions || "nenhuma"}\n\nCLIPES:\n${clipMap}\n\nTRANSCRIÇÃO SINCRONIZADA:\n${transcript}\n\nRetorne APENAS JSON válido, sem markdown, no formato:\n{\n  "summary": "resumo curto",\n  "suggestions": [\n    { "id":"s1", "type":"sticker", "start":1.2, "end":2.8, "emoji":"✨", "reason":"..." },\n    { "id":"s2", "type":"cta", "start":20, "end":24, "text":"texto curto", "reason":"..." },\n    { "id":"s3", "type":"caption_motion", "start":3, "end":5, "layerId":"id de legenda existente", "motion":"word-pop", "reason":"..." },\n    { "id":"s4", "type":"clip_motion", "start":5, "end":7, "clipId":"id de clipe existente", "motion":"zoom-in", "reason":"..." }\n  ]\n}\n\nREGRAS:\n- no máximo 8 sugestões; menos é melhor que exagerar;\n- use somente ids de clipes/legendas fornecidos;\n- caption_motion permitido: none, word-pop, word-bounce, pulse, karaoke;\n- clip_motion permitido: zoom-in, zoom-out, pan-left, pan-right;\n- stickers devem ser emojis simples e contextuais;\n- CTA deve usar apenas informação presente na fala/orientação. Se não houver CTA explícito, use uma chamada neutra como \"Fale com nossa equipe\";\n- nunca invente preço, desconto, prazo, garantia, prova social, telefone ou link;\n- não altere o conteúdo falado;\n- não aplique efeitos em todos os trechos: preserve respiro visual;\n- cada sugestão precisa explicar por que melhora retenção, clareza ou conversão.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      system: "Você é um editor profissional de vídeo curto dentro do VendorAI. Responda estritamente com JSON válido e nunca invente fatos comerciais.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content.filter((block) => block.type === "text").map((block) => (block as { type: "text"; text: string }).text).join("\n");
    const parsed = extractJsonObject(raw) as { summary?: unknown; suggestions?: unknown };
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [];
    const suggestions: VideoAiSuggestion[] = [];

    for (let index = 0; index < rawSuggestions.length; index += 1) {
      const candidate = rawSuggestions[index] as Record<string, unknown>;
      const type = String(candidate.type ?? "") as VideoAiSuggestionType;
      if (!["sticker", "cta", "caption_motion", "clip_motion"].includes(type)) continue;
      const start = bounded(candidate.start, 0, duration);
      const end = bounded(candidate.end, Math.min(duration, start + 0.1), duration);
      if (end <= start) continue;
      const suggestion: VideoAiSuggestion = {
        id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `ai-${type}-${index + 1}`,
        type,
        start,
        end,
        reason: typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 240) : "Melhoria sugerida pela IA.",
      };
      if (type === "sticker") suggestion.emoji = typeof candidate.emoji === "string" ? candidate.emoji.trim().slice(0, 12) : "✨";
      if (type === "cta") suggestion.text = typeof candidate.text === "string" && candidate.text.trim() ? candidate.text.trim().slice(0, 100) : "Fale com nossa equipe";
      if (type === "caption_motion") {
        const layerId = String(candidate.layerId ?? "");
        const motion = String(candidate.motion ?? "word-pop");
        if (!captionIds.has(layerId) || !CAPTION_AI_MOTIONS.has(motion)) continue;
        suggestion.layerId = layerId;
        suggestion.motion = motion;
      }
      if (type === "clip_motion") {
        const clipId = String(candidate.clipId ?? "");
        const motion = String(candidate.motion ?? "zoom-in");
        if (!clipIds.has(clipId) || !CLIP_AI_MOTIONS.has(motion)) continue;
        suggestion.clipId = clipId;
        suggestion.motion = motion;
      }
      suggestions.push(suggestion);
    }

    if (!suggestions.length) {
      res.json({ plan: fallback });
      return;
    }
    res.json({ plan: { goal, summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 320) : "Plano de edição criado a partir da fala e da timeline.", suggestions, source: "ai" } });
  } catch (err) {
    req.log.warn({ err, tenantId }, "content-studio: AI edit plan fell back to deterministic plan");
    res.json({ plan: fallback });
  }
});
'''

back = replace_once(back, "\nexport default router;\n", backend_insert + "\nexport default router;\n", "backend endpoint")
BACK.write_text(back)

print("Video AI edit assistant patch applied")
