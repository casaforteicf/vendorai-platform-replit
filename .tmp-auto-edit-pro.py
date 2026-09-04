from pathlib import Path

frontend = Path('artifacts/frontend/src/components/video/VideoTimelineEditor.tsx')
backend = Path('artifacts/api-server/src/routes/content_studio.ts')
fs = frontend.read_text()
bs = backend.read_text()

def rep(text: str, old: str, new: str, count: int = 1) -> str:
    if old not in text:
        raise SystemExit('missing anchor: ' + old[:180])
    return text.replace(old, new, count)

# ---------- Frontend types ----------
fs = rep(fs, '''type MusicRecommendationProfile = {
  targetUses: MusicBrandUse[];
  paidCampaign: boolean;
  moodTerms: string[];
  bpmMin: number;
  bpmMax: number;
  label: string;
};

type MusicRecommendation = {
  track: LibraryTrack;
  score: number;
  reasons: string[];
};''', '''type MusicRecommendationProfile = {
  targetUses: MusicBrandUse[];
  paidCampaign: boolean;
  moodTerms: string[];
  genreTerms: string[];
  bpmMin: number;
  bpmMax: number;
  label: string;
};

type MusicRecommendation = {
  track: LibraryTrack;
  score: number;
  compatibility: number;
  reasons: string[];
};

type AutoEditPreset = {
  id: string;
  label: string;
  hint: string;
  goal: string;
  captionStyle: CaptionStylePreset;
  beatStrength: BeatSyncStrength;
  beatStep: BeatStep;
  audioMix: AudioMixPreset;
  syncVisualAccents: boolean;
  instruction: string;
};''')

# ---------- Presets ----------
old_goals = '''const AI_EDIT_GOALS = [
  { id: "commercial", label: "Mais comercial", hint: "Oferta, benefício e CTA com ritmo de venda" },
  { id: "dynamic", label: "Mais dinâmico", hint: "Movimento, destaques e variação visual" },
  { id: "reel", label: "Reel rápido", hint: "Gancho forte e retenção para vídeo curto" },
  { id: "offer", label: "Destacar oferta", hint: "Preço, condição, urgência e chamada final" },
  { id: "clean", label: "Profissional e clean", hint: "Ênfases discretas e acabamento institucional" },
];'''
new_goals = '''const AI_EDIT_GOALS = [
  { id: "commercial", label: "Mais comercial", hint: "Oferta, benefício e CTA com ritmo de venda" },
  { id: "dynamic", label: "Mais dinâmico", hint: "Movimento, destaques e variação visual" },
  { id: "reel", label: "Reel rápido", hint: "Gancho forte e retenção para vídeo curto" },
  { id: "offer", label: "Destacar oferta", hint: "Preço, condição, urgência e chamada final" },
  { id: "clean", label: "Profissional e clean", hint: "Ênfases discretas e acabamento institucional" },
  { id: "product", label: "Produto / demonstração", hint: "Valoriza produto, benefícios e demonstração sem inventar claims" },
  { id: "testimonial", label: "Depoimento / prova", hint: "Prioriza voz, credibilidade e leitura confortável" },
];

const AUTO_EDIT_PRESETS: AutoEditPreset[] = [
  { id: "sales", label: "Conversão", hint: "Venda e geração de lead", goal: "commercial", captionStyle: "impact", beatStrength: "balanced", beatStep: 2, audioMix: "balanced", syncVisualAccents: true, instruction: "Priorize benefício, clareza comercial e CTA. Preserve a fala e não invente preço, condição ou prova." },
  { id: "offer", label: "Oferta", hint: "Condição e chamada forte", goal: "offer", captionStyle: "highlight", beatStrength: "balanced", beatStep: 2, audioMix: "balanced", syncVisualAccents: true, instruction: "Destaque somente ofertas e condições realmente mencionadas. Termine com CTA claro e mantenha leitura rápida." },
  { id: "fast-reel", label: "Reel rápido", hint: "Retenção e ritmo alto", goal: "reel", captionStyle: "highlight", beatStrength: "aggressive", beatStep: 1, audioMix: "music", syncVisualAccents: true, instruction: "Priorize gancho nos primeiros segundos, ritmo visual forte e poucos elementos por vez. Preserve a compreensão da fala." },
  { id: "premium", label: "Premium", hint: "Elegante e discreto", goal: "clean", captionStyle: "minimal", beatStrength: "light", beatStep: 4, audioMix: "institutional", syncVisualAccents: false, instruction: "Use movimentos sutis, poucos elementos e acabamento premium. Evite excesso de stickers, zooms e cortes." },
  { id: "product", label: "Produto", hint: "Demonstração e benefícios", goal: "product", captionStyle: "impact", beatStrength: "balanced", beatStep: 2, audioMix: "balanced", syncVisualAccents: true, instruction: "Valorize o produto, demonstrações e benefícios realmente presentes no conteúdo. Não invente especificações ou resultados." },
  { id: "testimonial", label: "Depoimento", hint: "Voz e credibilidade", goal: "testimonial", captionStyle: "clean", beatStrength: "light", beatStep: 4, audioMix: "voice", syncVisualAccents: false, instruction: "Priorize a voz, pausas naturais e credibilidade. Use movimentos discretos e legendas fáceis de acompanhar." },
];'''
fs = rep(fs, old_goals, new_goals)

# ---------- Music profile ----------
start = fs.index('function buildMusicRecommendationProfile(')
end = fs.index('\nfunction clamp(', start)
new_profile = '''function buildMusicRecommendationProfile(channel: string, projectTitle: string, layers: EditorLayer[], goal: string): MusicRecommendationProfile {
  const content = normalizedText(`${projectTitle} ${layers.map((layer) => layer.text).join(" ")}`);
  const targetUses = new Set<MusicBrandUse>();
  if (channel === "reels" || channel === "shorts") targetUses.add("reels");
  if (channel === "stories") targetUses.add("stories");
  if (channel === "site" || channel === "youtube") targetUses.add("institutional");

  const paidCampaign = /(anuncio|ads|patrocin|campanha paga|trafego pago|performance max|google ads|meta ads)/.test(content);
  if (paidCampaign) targetUses.add("ads");
  if (/(produto|servico|oferta|promoc|lancamento|catalogo|colecao)/.test(content) || goal === "product" || goal === "offer") targetUses.add("product");
  if (/(institucional|empresa|marca|quem somos|corporativ|apresentacao)/.test(content) || goal === "clean" || goal === "testimonial") targetUses.add("institutional");

  const moodTerms: string[] = [];
  const genreTerms: string[] = [];
  if (/(premium|luxo|sofistic|arquitet|design|elegan)/.test(content) || goal === "clean") {
    moodTerms.push("elegante", "premium", "sofisticado", "cinematic", "cinematografico");
    genreTerms.push("cinematic", "ambient", "corporate", "instrumental");
  }
  if (/(oferta|promoc|lancamento|impacto|energia|novidade|rapido)/.test(content) || ["commercial", "dynamic", "reel", "offer", "product"].includes(goal)) {
    moodTerms.push("energetico", "energetic", "upbeat", "dynamic", "dinamico", "confiante");
    genreTerms.push("pop", "electronic", "corporate", "hip hop", "funk");
  }
  if (/(institucional|corporativ|profissional|empresa)/.test(content)) {
    moodTerms.push("institucional", "corporativo", "professional", "corporate");
    genreTerms.push("corporate", "ambient", "instrumental");
  }
  if (goal === "testimonial" || /(calmo|suave|bem-estar|relax|tranquil)/.test(content)) {
    moodTerms.push("calmo", "suave", "relax", "calm", "warm", "acolhedor", "authentic");
    genreTerms.push("acoustic", "ambient", "soft", "instrumental");
  }
  if (/(alegre|celebr|feliz|divert)/.test(content)) moodTerms.push("alegre", "feliz", "upbeat", "happy");

  const [bpmMin, bpmMax] = MUSIC_BPM_BY_CHANNEL[channel] ?? [85, 125];
  const adjustedMin = goal === "reel" || goal === "dynamic" ? Math.max(100, bpmMin) : goal === "clean" || goal === "testimonial" ? Math.min(bpmMin, 82) : bpmMin;
  const adjustedMax = goal === "reel" || goal === "dynamic" ? Math.max(132, bpmMax) : goal === "clean" || goal === "testimonial" ? Math.min(bpmMax, 112) : bpmMax;
  const channelLabel = CHANNELS.find((item) => item.id === channel)?.label ?? "Vídeo";
  return {
    targetUses: Array.from(targetUses),
    paidCampaign,
    moodTerms: Array.from(new Set(moodTerms)),
    genreTerms: Array.from(new Set(genreTerms)),
    bpmMin: adjustedMin,
    bpmMax: adjustedMax,
    label: channelLabel,
  };
}
'''
fs = fs[:start] + new_profile + fs[end:]

# ---------- State ----------
fs = rep(fs, '  const [aiGoal, setAiGoal] = useState("commercial");\n  const [aiInstructions, setAiInstructions] = useState("");', '  const [aiGoal, setAiGoal] = useState("commercial");\n  const [selectedAutoPresetId, setSelectedAutoPresetId] = useState("sales");\n  const [aiInstructions, setAiInstructions] = useState(AUTO_EDIT_PRESETS[0]?.instruction ?? "");')

# ---------- Apply preset ----------
anchor = '''  const addMusicVolumePoint = useCallback(() => {
    const time = clamp(timelineTime, musicStart, Math.max(musicStart, musicEnd));'''
preset_fn = '''  const applyAutoEditPreset = useCallback((presetId: string) => {
    const preset = AUTO_EDIT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedAutoPresetId(preset.id);
    setAiGoal(preset.goal);
    setAiInstructions(preset.instruction);
    setAutoCaptionStyle(preset.captionStyle);
    setBeatSyncStrength(preset.beatStrength);
    setBeatStep(preset.beatStep);
    setSyncVisualAccents(preset.syncVisualAccents);
    const mix = AUDIO_MIX_PRESETS.find((item) => item.id === preset.audioMix);
    if (mix) {
      setOriginalVolume(mix.original);
      setMusicVolume(mix.music);
      setDuckingReduction(mix.duck);
      setMusicFadeIn(mix.fadeIn);
      setMusicFadeOut(mix.fadeOut);
      setLoudnessTarget(mix.lufs);
      setDuckingEnabled(true);
      setNormalizeAudio(true);
    }
    setAiPlan(null);
    setAiSelectedIds(new Set<string>());
    toast({ title: `Preset ${preset.label} aplicado`, description: "IA, legenda, Beat Sync e mix foram preparados para este objetivo." });
  }, [toast]);

  const addMusicVolumePoint = useCallback(() => {
    const time = clamp(timelineTime, musicStart, Math.max(musicStart, musicEnd));'''
fs = rep(fs, anchor, preset_fn)

# ---------- Music score ----------
fs = rep(fs, '''  const musicRecommendationProfile = useMemo(
    () => buildMusicRecommendationProfile(channel, projectTitle, layers),
    [channel, layers, projectTitle],
  );''', '''  const musicRecommendationProfile = useMemo(
    () => buildMusicRecommendationProfile(channel, projectTitle, layers, aiGoal),
    [aiGoal, channel, layers, projectTitle],
  );''')
score_start = fs.index('  const recommendedMusicTracks = useMemo<MusicRecommendation[]>(() => {')
score_end = fs.index('  const canUndo =', score_start)
new_score = '''  const recommendedMusicTracks = useMemo<MusicRecommendation[]>(() => {
    const projectLength = Math.max(0, realProjectDuration);
    return musicTracks
      .flatMap((track) => {
        const usage = track.usage;
        const allowed = musicRecommendationProfile.paidCampaign
          ? usage?.paidAdsAllowed === true
          : usage?.organicAllowed === true;
        if (!allowed || usage?.expired === true) return [];

        const metadata = metadataRecord(track);
        const reasons: string[] = [];
        let score = 0;
        if (metadata.brandOfficial === true) { score += 14; reasons.push("Oficial da marca"); }
        if (track.id === brandDefaultTrackId) { score += 8; reasons.push("Brand Kit"); }

        const uses = trackBrandUses(track);
        const matchedUses = musicRecommendationProfile.targetUses.filter((use) => uses.includes(use));
        if (matchedUses.length) {
          score += 14 + Math.min(8, Math.max(0, matchedUses.length - 1) * 4);
          reasons.push(matchedUses.map((use) => MUSIC_BRAND_USE_LABELS[use]).join(" + "));
        }

        const mood = normalizedText(metadata.mood);
        if (mood && musicRecommendationProfile.moodTerms.some((term) => mood.includes(normalizedText(term)))) {
          score += 16;
          reasons.push(`Mood · ${String(metadata.mood)}`);
        }

        const genre = Array.isArray(metadata.genre)
          ? normalizedText(stringList(metadata.genre).join(" "))
          : normalizedText(metadata.genre);
        if (genre && musicRecommendationProfile.genreTerms.some((term) => genre.includes(normalizedText(term)))) {
          score += 12;
          reasons.push(`Gênero · ${Array.isArray(metadata.genre) ? stringList(metadata.genre).join(", ") : String(metadata.genre)}`);
        }

        const bpm = numberMetadata(track, "bpm");
        if (bpm !== null) {
          if (bpm >= musicRecommendationProfile.bpmMin && bpm <= musicRecommendationProfile.bpmMax) {
            score += 18;
            reasons.push(`${Math.round(bpm)} BPM`);
          } else {
            const distance = bpm < musicRecommendationProfile.bpmMin ? musicRecommendationProfile.bpmMin - bpm : bpm - musicRecommendationProfile.bpmMax;
            score += Math.max(0, 10 - distance / 3);
          }
        }

        if (metadata.favorite === true) score += 4;
        const duration = numberMetadata(track, "durationSeconds");
        if (duration !== null && projectLength > 0) {
          if (duration >= projectLength) score += 6;
          else if (duration >= projectLength * 0.6) score += 3;
        }

        const compatibility = clamp(Math.round(score), 0, 100);
        if (!reasons.length) reasons.push("Direitos compatíveis; faltam metadados criativos para pontuação maior");
        return [{ track, score: compatibility, compatibility, reasons: reasons.slice(0, 4) }];
      })
      .sort((left, right) => right.compatibility - left.compatibility || assetName(left.track).localeCompare(assetName(right.track), "pt-BR"))
      .slice(0, 3);
  }, [brandDefaultTrackId, musicRecommendationProfile, musicTracks, realProjectDuration]);
'''
fs = fs[:score_start] + new_score + fs[score_end:]

# ---------- Persistence ----------
fs = rep(fs, '    editorVersion: 13,', '    editorVersion: 14,')
fs = rep(fs, '''    aiEditPlan: aiPlan,
    audio: {''', '''    aiEditPlan: aiPlan,
    aiGoal,
    aiInstructions,
    autoEditPresetId: selectedAutoPresetId || null,
    audio: {''')
fs = rep(fs, '  }), [channel, ratio, quality, clips, layers, aiPlan, musicMode,', '  }), [channel, ratio, quality, clips, layers, aiPlan, aiGoal, aiInstructions, selectedAutoPresetId, musicMode,')

restore_anchor = '''        if (["720p", "1080p"].includes(context.quality)) setQuality(context.quality);
        if (context.aiEditPlan && Array.isArray(context.aiEditPlan.suggestions)) {'''
restore_new = '''        if (["720p", "1080p"].includes(context.quality)) setQuality(context.quality);
        if (typeof context.aiGoal === "string" && AI_EDIT_GOALS.some((goal) => goal.id === context.aiGoal)) setAiGoal(context.aiGoal);
        if (typeof context.aiInstructions === "string") setAiInstructions(context.aiInstructions.slice(0, 800));
        if (typeof context.autoEditPresetId === "string" && AUTO_EDIT_PRESETS.some((preset) => preset.id === context.autoEditPresetId)) setSelectedAutoPresetId(context.autoEditPresetId);
        if (context.aiEditPlan && Array.isArray(context.aiEditPlan.suggestions)) {'''
fs = rep(fs, restore_anchor, restore_new)

# ---------- AI tool UI ----------
ai_header = '''      <div><p className="text-sm font-semibold">Assistente de edição IA</p><p className="text-xs text-muted-foreground">Analisa a fala e cria ajustes reais na timeline. Você revisa antes de aplicar.</p></div>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Objetivo</span><select value={aiGoal} onChange={(event) => setAiGoal(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{AI_EDIT_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}</select><p className="text-[10px] text-muted-foreground">{AI_EDIT_GOALS.find((goal) => goal.id === aiGoal)?.hint}</p></label>'''
ai_header_new = '''      <div><p className="text-sm font-semibold">Assistente de edição IA</p><p className="text-xs text-muted-foreground">Analisa a fala e cria ajustes reais na timeline. Você revisa antes de aplicar.</p></div>
      <div className="space-y-2"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">Presets completos</p><p className="text-[10px] text-muted-foreground">Preparam IA, legendas, Beat Sync e mixagem em um clique.</p></div>{selectedAutoPresetId && <span className="rounded-full border bg-primary/5 px-2 py-0.5 text-[9px] font-medium text-primary">{AUTO_EDIT_PRESETS.find((preset) => preset.id === selectedAutoPresetId)?.label}</span>}</div><div className="grid grid-cols-2 gap-2">{AUTO_EDIT_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyAutoEditPreset(preset.id)} className={cn("rounded-xl border p-2.5 text-left transition-colors", selectedAutoPresetId === preset.id ? "border-primary bg-primary/5" : "hover:border-primary/30")}><span className="block text-[11px] font-semibold">{preset.label}</span><span className="mt-0.5 block text-[9px] leading-3.5 text-muted-foreground">{preset.hint}</span></button>)}</div></div>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Objetivo</span><select value={aiGoal} onChange={(event) => { setAiGoal(event.target.value); setSelectedAutoPresetId(""); setAiPlan(null); }} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{AI_EDIT_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}</select><p className="text-[10px] text-muted-foreground">{AI_EDIT_GOALS.find((goal) => goal.id === aiGoal)?.hint}</p></label>'''
fs = rep(fs, ai_header, ai_header_new)

# ---------- Score UI ----------
fs = rep(fs, 'recommendedMusicTracks.map(({ track, reasons }, index) =>', 'recommendedMusicTracks.map(({ track, reasons, compatibility }, index) =>')
fs = rep(fs, '''<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">#{index + 1}</span><p className="truncate text-xs font-medium">{assetName(track)}</p>''', '''<span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">#{index + 1}</span><span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tabular-nums">{compatibility}%</span><p className="truncate text-xs font-medium">{assetName(track)}</p>''')
fs = rep(fs, '''<p className="mt-1.5 text-[9px] text-emerald-700 dark:text-emerald-300">{musicRecommendationProfile.paidCampaign ? "Direitos para mídia paga liberados" : "Direitos para uso orgânico liberado"}</p>''', '''<p className="mt-1.5 text-[9px] text-emerald-700 dark:text-emerald-300">{musicRecommendationProfile.paidCampaign ? "Direitos para mídia paga liberados" : "Direitos para uso orgânico liberado"} · score criativo {compatibility}/100</p>''')

# ---------- Backend goals + guidance ----------
bs = rep(bs, '''const AI_EDIT_GOAL_LABELS: Record<string, string> = {
  commercial: "mais comercial, com benefício, oferta e CTA",
  dynamic: "mais dinâmico, com retenção e variação visual",
  reel: "Reel rápido, direto e com gancho forte",
  offer: "destacar oferta, condição e chamada para ação",
  clean: "profissional, clean e institucional",
};''', '''const AI_EDIT_GOAL_LABELS: Record<string, string> = {
  commercial: "mais comercial, com benefício, oferta e CTA",
  dynamic: "mais dinâmico, com retenção e variação visual",
  reel: "Reel rápido, direto e com gancho forte",
  offer: "destacar oferta, condição e chamada para ação",
  clean: "profissional, clean e institucional",
  product: "valorizar produto, demonstração e benefícios comprovados no conteúdo",
  testimonial: "priorizar depoimento, credibilidade, voz e leitura confortável",
};

const AI_EDIT_GOAL_GUIDANCE: Record<string, string> = {
  commercial: "Equilibre ritmo e clareza. Destaque benefício e CTA, sem transformar todos os segundos em efeito.",
  dynamic: "Use variação visual e movimentos curtos em pontos relevantes, preservando respiro entre destaques.",
  reel: "Fortaleça os primeiros segundos e a retenção. Prefira intervenções curtas e rápidas.",
  offer: "Destaque apenas condição, preço, urgência e CTA que estejam realmente presentes na transcrição ou orientação.",
  clean: "Mantenha edição discreta, elegante e institucional. Evite excesso de stickers e movimentos agressivos.",
  product: "Priorize demonstração, atributos e benefícios explicitamente mencionados. Não invente especificações ou resultados.",
  testimonial: "Preserve pausas e naturalidade da fala. Use legendas e movimentos sutis; evite elementos que disputem atenção com a pessoa.",
};''')
bs = rep(bs, '''OBJETIVO: ${AI_EDIT_GOAL_LABELS[goal]}\nCANAL:''', '''OBJETIVO: ${AI_EDIT_GOAL_LABELS[goal]}\nDIREÇÃO: ${AI_EDIT_GOAL_GUIDANCE[goal]}\nCANAL:''')
bs = rep(bs, '''emoji: input.goal === "offer" ? "💰" : "✨",''', '''emoji: input.goal === "offer" ? "💰" : input.goal === "product" ? "🛍️" : input.goal === "testimonial" ? "⭐" : "✨",''')

frontend.write_text(fs)
backend.write_text(bs)
