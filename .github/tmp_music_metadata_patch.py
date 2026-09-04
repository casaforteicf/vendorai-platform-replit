from pathlib import Path

path = Path("artifacts/frontend/src/pages/MediaCenter.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"pattern not found: {old[:140]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'import AudioRightsPanel from "@/components/media/AudioRightsPanel";\n',
    'import AudioRightsPanel from "@/components/media/AudioRightsPanel";\nimport MusicMetadataPanel from "@/components/media/MusicMetadataPanel";\n',
)

replace_once(
    '  const [audioKindFilter, setAudioKindFilter] = useState<AudioKindFilter>("all");\n  const [uploadAudioKind, setUploadAudioKind] = useState<AudioKind>("other");\n',
    '  const [audioKindFilter, setAudioKindFilter] = useState<AudioKindFilter>("all");\n  const [uploadAudioKind, setUploadAudioKind] = useState<AudioKind>("other");\n  const [musicGenreFilter, setMusicGenreFilter] = useState("all");\n  const [musicMoodFilter, setMusicMoodFilter] = useState("all");\n  const [musicFavoritesOnly, setMusicFavoritesOnly] = useState(false);\n',
)

music_derivations = '''\n  const musicGenres = useMemo(\n    () => Array.from(new Set(\n      assets\n        .filter((asset) => assetAudioKind(asset) === "music")\n        .map((asset) => typeof asset.metadata?.genre === "string" ? asset.metadata.genre.trim() : "")\n        .filter(Boolean),\n    )).sort((a, b) => a.localeCompare(b, "pt-BR")),\n    [assets],\n  );\n\n  const musicMoods = useMemo(\n    () => Array.from(new Set(\n      assets\n        .filter((asset) => assetAudioKind(asset) === "music")\n        .map((asset) => typeof asset.metadata?.mood === "string" ? asset.metadata.mood.trim() : "")\n        .filter(Boolean),\n    )).sort((a, b) => a.localeCompare(b, "pt-BR")),\n    [assets],\n  );\n\n  const favoriteMusicCount = useMemo(\n    () => assets.filter((asset) => assetAudioKind(asset) === "music" && asset.metadata?.favorite === true).length,\n    [assets],\n  );\n'''
replace_once('\n  const visible = useMemo(\n', music_derivations + '\n  const visible = useMemo(\n')

replace_once(
    '        if (filter === "audio" && audioKindFilter !== "all" && assetAudioKind(asset) !== audioKindFilter) return false;\n        if (sourceFilter !== "all" && asset.source !== sourceFilter) return false;\n',
    '        if (filter === "audio" && audioKindFilter !== "all" && assetAudioKind(asset) !== audioKindFilter) return false;\n        if (filter === "audio" && musicGenreFilter !== "all") {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.genre !== musicGenreFilter) return false;\n        }\n        if (filter === "audio" && musicMoodFilter !== "all") {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.mood !== musicMoodFilter) return false;\n        }\n        if (filter === "audio" && musicFavoritesOnly) {\n          if (assetAudioKind(asset) !== "music" || asset.metadata?.favorite !== true) return false;\n        }\n        if (sourceFilter !== "all" && asset.source !== sourceFilter) return false;\n',
)

replace_once(
    '          typeof asset.metadata?.genre === "string" ? asset.metadata.genre : null,\n          typeof asset.metadata?.mood === "string" ? asset.metadata.mood : null,\n          sourceLabel(asset),\n',
    '          typeof asset.metadata?.genre === "string" ? asset.metadata.genre : null,\n          typeof asset.metadata?.mood === "string" ? asset.metadata.mood : null,\n          typeof asset.metadata?.energy === "string" ? asset.metadata.energy : null,\n          typeof asset.metadata?.bpm === "number" ? `${asset.metadata.bpm} BPM` : null,\n          sourceLabel(asset),\n',
)

replace_once(
    '    [assets, filter, audioKindFilter, sourceFilter, contextFilter, folderFilter, search],\n',
    '    [assets, filter, audioKindFilter, musicGenreFilter, musicMoodFilter, musicFavoritesOnly, sourceFilter, contextFilter, folderFilter, search],\n',
)

replace_once(
    '                        onClick={() => setAudioKindFilter(kind)}\n                        className={`folder-chip ${audioKindFilter === kind ? "folder-chip-active" : ""}`}\n',
    '                        onClick={() => {\n                          setAudioKindFilter(kind);\n                          if (kind !== "all" && kind !== "music") {\n                            setMusicGenreFilter("all");\n                            setMusicMoodFilter("all");\n                            setMusicFavoritesOnly(false);\n                          }\n                        }}\n                        className={`folder-chip ${audioKindFilter === kind ? "folder-chip-active" : ""}`}\n',
)

chip_anchor = '''                  </div>\n                </div>\n              )}\n\n              <div className="mt-5 rounded-2xl border bg-background p-3 shadow-sm">\n'''
chip_insert = '''                  </div>\n                  {(audioKindFilter === "all" || audioKindFilter === "music") && (\n                    <div className="mt-3 flex flex-wrap gap-2">\n                      <select value={musicGenreFilter} onChange={(event) => setMusicGenreFilter(event.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">\n                        <option value="all">Todos os gêneros</option>\n                        {musicGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}\n                      </select>\n                      <select value={musicMoodFilter} onChange={(event) => setMusicMoodFilter(event.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">\n                        <option value="all">Todos os moods</option>\n                        {musicMoods.map((mood) => <option key={mood} value={mood}>{mood}</option>)}\n                      </select>\n                      <button\n                        onClick={() => setMusicFavoritesOnly((current) => !current)}\n                        className={`folder-chip ${musicFavoritesOnly ? "folder-chip-active" : ""}`}\n                      >\n                        Favoritas · {favoriteMusicCount}\n                      </button>\n                    </div>\n                  )}\n                </div>\n              )}\n\n              <div className="mt-5 rounded-2xl border bg-background p-3 shadow-sm">\n'''
replace_once(chip_anchor, chip_insert)

context_anchor = '''                              {context && (\n                                <span className="max-w-full truncate rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">\n                                  <Link2 className="mr-1 inline h-3 w-3" />{CONTEXT_LABELS[context.type]} · {context.label}\n                                </span>\n                              )}\n'''
context_insert = context_anchor + '''                              {audioKind === "music" && typeof asset.metadata?.genre === "string" && asset.metadata.genre.trim() && (\n                                <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] text-violet-700 dark:text-violet-300">{asset.metadata.genre}</span>\n                              )}\n                              {audioKind === "music" && typeof asset.metadata?.bpm === "number" && Number.isFinite(asset.metadata.bpm) && (\n                                <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] text-sky-700 dark:text-sky-300">{asset.metadata.bpm} BPM</span>\n                              )}\n                              {audioKind === "music" && asset.metadata?.favorite === true && (\n                                <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] text-rose-700 dark:text-rose-300">Favorita</span>\n                              )}\n'''
replace_once(context_anchor, context_insert)

replace_once(
    '              {inspected.type === "audio" && assetAudioKind(inspected) === "music" && (\n                <AudioRightsPanel tenantId={tenantId} asset={inspected} onUpdated={loadAll} />\n              )}\n',
    '              {inspected.type === "audio" && assetAudioKind(inspected) === "music" && (\n                <>\n                  <MusicMetadataPanel tenantId={tenantId} asset={inspected} resolvedUrl={mediaUrl(inspected.storageUrl)} onUpdated={loadAll} />\n                  <AudioRightsPanel tenantId={tenantId} asset={inspected} onUpdated={loadAll} />\n                </>\n              )}\n',
)

path.write_text(text)
