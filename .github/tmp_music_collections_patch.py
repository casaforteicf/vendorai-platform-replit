from pathlib import Path

path = Path("artifacts/frontend/src/pages/MediaCenter.tsx")
text = path.read_text()


def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"pattern not found:\n{old[:240]}")
    text = text.replace(old, new, 1)


replace_once(
    'type AudioKindFilter = "all" | AudioKind;\n',
    'type AudioKindFilter = "all" | AudioKind;\ntype MusicBrandUse = "institutional" | "reels" | "ads" | "product" | "stories" | "presentation";\n',
)

replace_once(
    '''const AUDIO_KIND_SHORT_LABELS: Record<AudioKindFilter, string> = {\n  all: "Todos",\n  music: "Músicas",\n  voiceover: "Locuções",\n  sound_effect: "Efeitos",\n  jingle: "Jingles",\n  sonic_identity: "Identidade",\n  other: "Outros",\n};\n''',
    '''const AUDIO_KIND_SHORT_LABELS: Record<AudioKindFilter, string> = {\n  all: "Todos",\n  music: "Músicas",\n  voiceover: "Locuções",\n  sound_effect: "Efeitos",\n  jingle: "Jingles",\n  sonic_identity: "Identidade",\n  other: "Outros",\n};\n\nconst MUSIC_BRAND_USE_LABELS: Record<MusicBrandUse, string> = {\n  institutional: "Institucional",\n  reels: "Reels / Shorts",\n  ads: "Anúncios",\n  product: "Produto",\n  stories: "Stories",\n  presentation: "Apresentações",\n};\n''',
)

replace_once(
    '''function audioRole(kind: AudioKind): "source" | "voice" | "music" {\n  if (kind === "music") return "music";\n  if (kind === "voiceover") return "voice";\n  return "source";\n}\n''',
    '''function audioRole(kind: AudioKind): "source" | "voice" | "music" {\n  if (kind === "music") return "music";\n  if (kind === "voiceover") return "voice";\n  return "source";\n}\n\nfunction assetMusicCollections(asset: MediaAsset): string[] {\n  if (assetAudioKind(asset) !== "music" || !Array.isArray(asset.metadata?.collections)) return [];\n  return asset.metadata.collections\n    .filter((item): item is string => typeof item === "string")\n    .map((item) => item.trim())\n    .filter(Boolean);\n}\n\nfunction assetMusicBrandUse(asset: MediaAsset): MusicBrandUse[] {\n  if (assetAudioKind(asset) !== "music" || !Array.isArray(asset.metadata?.brandUse)) return [];\n  const valid = new Set<MusicBrandUse>(Object.keys(MUSIC_BRAND_USE_LABELS) as MusicBrandUse[]);\n  return asset.metadata.brandUse\n    .filter((item): item is string => typeof item === "string")\n    .filter((item): item is MusicBrandUse => valid.has(item as MusicBrandUse));\n}\n''',
)

replace_once(
    '''  const [musicGenreFilter, setMusicGenreFilter] = useState("all");\n  const [musicMoodFilter, setMusicMoodFilter] = useState("all");\n  const [musicFavoritesOnly, setMusicFavoritesOnly] = useState(false);\n''',
    '''  const [musicGenreFilter, setMusicGenreFilter] = useState("all");\n  const [musicMoodFilter, setMusicMoodFilter] = useState("all");\n  const [musicCollectionFilter, setMusicCollectionFilter] = useState("all");\n  const [musicBrandUseFilter, setMusicBrandUseFilter] = useState("all");\n  const [musicFavoritesOnly, setMusicFavoritesOnly] = useState(false);\n  const [musicBrandOfficialOnly, setMusicBrandOfficialOnly] = useState(false);\n''',
)

replace_once(
    '''  const favoriteMusicCount = useMemo(\n    () => assets.filter((asset) => assetAudioKind(asset) === "music" && asset.metadata?.favorite === true).length,\n    [assets],\n  );\n\n  const visible = useMemo(\n''',
    '''  const favoriteMusicCount = useMemo(\n    () => assets.filter((asset) => assetAudioKind(asset) === "music" && asset.metadata?.favorite === true).length,\n    [assets],\n  );\n\n  const musicCollections = useMemo(\n    () => Array.from(new Set(\n      assets.flatMap((asset) => assetMusicCollections(asset)),\n    )).sort((a, b) => a.localeCompare(b, "pt-BR")),\n    [assets],\n  );\n\n  const brandOfficialMusicCount = useMemo(\n    () => assets.filter((asset) => assetAudioKind(asset) === "music" && asset.metadata?.brandOfficial === true).length,\n    [assets],\n  );\n\n  const visible = useMemo(\n''',
)

replace_once(
    '''        if (filter === "audio" && musicMoodFilter !== "all") {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.mood !== musicMoodFilter) return false;\n        }\n        if (filter === "audio" && musicFavoritesOnly) {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.favorite !== true) return false;\n        }\n''',
    '''        if (filter === "audio" && musicMoodFilter !== "all") {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.mood !== musicMoodFilter) return false;\n        }\n        if (filter === "audio" && musicCollectionFilter !== "all") {\n          if (assetAudioKind(asset) !== "music" || !assetMusicCollections(asset).includes(musicCollectionFilter)) return false;\n        }\n        if (filter === "audio" && musicBrandUseFilter !== "all") {\n          if (assetAudioKind(asset) !== "music" || !assetMusicBrandUse(asset).includes(musicBrandUseFilter as MusicBrandUse)) return false;\n        }\n        if (filter === "audio" && musicFavoritesOnly) {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.favorite !== true) return false;\n        }\n        if (filter === "audio" && musicBrandOfficialOnly) {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.brandOfficial !== true) return false;\n        }\n''',
)

replace_once(
    '''          typeof asset.metadata?.energy === "string" ? asset.metadata.energy : null,\n          typeof asset.metadata?.bpm === "number" ? `${asset.metadata.bpm} BPM` : null,\n          sourceLabel(asset),\n''',
    '''          typeof asset.metadata?.energy === "string" ? asset.metadata.energy : null,\n          typeof asset.metadata?.bpm === "number" ? `${asset.metadata.bpm} BPM` : null,\n          assetMusicCollections(asset).join(" "),\n          assetMusicBrandUse(asset).map((value) => MUSIC_BRAND_USE_LABELS[value]).join(" "),\n          asset.metadata?.brandOfficial === true ? "trilha oficial marca identidade sonora" : null,\n          sourceLabel(asset),\n''',
)

replace_once(
    '''    [assets, filter, audioKindFilter, musicGenreFilter, musicMoodFilter, musicFavoritesOnly, sourceFilter, contextFilter, folderFilter, search],\n''',
    '''    [assets, filter, audioKindFilter, musicGenreFilter, musicMoodFilter, musicCollectionFilter, musicBrandUseFilter, musicFavoritesOnly, musicBrandOfficialOnly, sourceFilter, contextFilter, folderFilter, search],\n''',
)

replace_once(
    '''                          if (kind !== "all" && kind !== "music") {\n                            setMusicGenreFilter("all");\n                            setMusicMoodFilter("all");\n                            setMusicFavoritesOnly(false);\n                          }\n''',
    '''                          if (kind !== "all" && kind !== "music") {\n                            setMusicGenreFilter("all");\n                            setMusicMoodFilter("all");\n                            setMusicCollectionFilter("all");\n                            setMusicBrandUseFilter("all");\n                            setMusicFavoritesOnly(false);\n                            setMusicBrandOfficialOnly(false);\n                          }\n''',
)

replace_once(
    '''                      <button\n                        onClick={() => setMusicFavoritesOnly((current) => !current)}\n                        className={`folder-chip ${musicFavoritesOnly ? "folder-chip-active" : ""}`}\n                      >\n                        Favoritas · {favoriteMusicCount}\n                      </button>\n                    </div>\n''',
    '''                      <select value={musicCollectionFilter} onChange={(event) => setMusicCollectionFilter(event.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">\n                        <option value="all">Todas as coleções</option>\n                        {musicCollections.map((collection) => <option key={collection} value={collection}>{collection}</option>)}\n                      </select>\n                      <select value={musicBrandUseFilter} onChange={(event) => setMusicBrandUseFilter(event.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">\n                        <option value="all">Todos os usos da marca</option>\n                        {(Object.keys(MUSIC_BRAND_USE_LABELS) as MusicBrandUse[]).map((value) => <option key={value} value={value}>{MUSIC_BRAND_USE_LABELS[value]}</option>)}\n                      </select>\n                      <button\n                        onClick={() => setMusicFavoritesOnly((current) => !current)}\n                        className={`folder-chip ${musicFavoritesOnly ? "folder-chip-active" : ""}`}\n                      >\n                        Favoritas · {favoriteMusicCount}\n                      </button>\n                      <button\n                        onClick={() => setMusicBrandOfficialOnly((current) => !current)}\n                        className={`folder-chip ${musicBrandOfficialOnly ? "folder-chip-active" : ""}`}\n                      >\n                        Oficiais da marca · {brandOfficialMusicCount}\n                      </button>\n                    </div>\n''',
)

replace_once(
    '''                      const audioKind = assetAudioKind(asset);\n                      const isSelected = selected.includes(asset.id);\n''',
    '''                      const audioKind = assetAudioKind(asset);\n                      const musicCollectionsForAsset = assetMusicCollections(asset);\n                      const isSelected = selected.includes(asset.id);\n''',
)

replace_once(
    '''                              {audioKind === "music" && asset.metadata?.favorite === true && (\n                                <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] text-rose-700 dark:text-rose-300">Favorita</span>\n                              )}\n''',
    '''                              {audioKind === "music" && asset.metadata?.favorite === true && (\n                                <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] text-rose-700 dark:text-rose-300">Favorita</span>\n                              )}\n                              {audioKind === "music" && musicCollectionsForAsset.length > 0 && (\n                                <span className="max-w-full truncate rounded-full bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-700 dark:text-indigo-300">Coleção · {musicCollectionsForAsset[0]}{musicCollectionsForAsset.length > 1 ? ` +${musicCollectionsForAsset.length - 1}` : ""}</span>\n                              )}\n                              {audioKind === "music" && asset.metadata?.brandOfficial === true && (\n                                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Oficial da marca</span>\n                              )}\n''',
)

path.write_text(text)
