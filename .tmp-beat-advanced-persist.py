from pathlib import Path
p = Path('artifacts/frontend/src/components/video/VideoTimelineEditor.tsx')
s = p.read_text()

def r(a: str, b: str) -> None:
    global s
    if a not in s:
        raise SystemExit('missing anchor: ' + a[:120])
    s = s.replace(a, b, 1)

if 'const addManualBeatMarker' not in s:
    r('  const syncCutsToBeats = useCallback(() => {', '''  const addManualBeatMarker = useCallback(() => {
    const marker = Math.round(clamp(timelineTime, 0, realProjectDuration) * 1000) / 1000;
    setManualBeatMarkers((current) => [...current.filter((time) => Math.abs(time - marker) > 0.04), marker].sort((a, b) => a - b));
  }, [realProjectDuration, timelineTime]);

  const syncCutsToBeats = useCallback(() => {''')
    start = s.index('  const syncCutsToBeats = useCallback(() => {')
    end_marker = '  }, [activeBeatAnalysis, beatStep, beatTimes, commitEditor, toast]);'
    end = s.index(end_marker, start) + len(end_marker)
    new_sync = '''  const syncCutsToBeats = useCallback(() => {
    if (!activeBeatAnalysis || effectiveBeatCandidates.length === 0) {
      toast({ title: "Analise a trilha primeiro", description: "Detecte as batidas antes de sincronizar os cortes." });
      return;
    }
    if (clipsRef.current.length < 2) {
      toast({ title: "Adicione mais clipes", description: "O Beat Sync precisa de pelo menos dois clipes para alinhar cortes." });
      return;
    }
    if (!beatCutPreview.length) {
      toast({ title: "Nenhum ajuste necessário", description: "Os cortes já estão no ritmo, estão bloqueados ou ficaram fora da tolerância escolhida." });
      return;
    }

    const nextClips = clipsRef.current.map((clip) => ({ ...clip }));
    for (const item of beatCutPreview) {
      const clip = nextClips[item.index];
      if (!clip || clip.id !== item.clipId || clip.beatLocked) continue;
      const boundary = clipStartAt(item.index + 1, nextClips);
      const nextTrimOut = clamp(clip.trimOut + (item.target - boundary), clip.trimIn + 0.25, clip.sourceDuration);
      const accent: Partial<VideoClip> = {};
      if (syncVisualAccents && item.downbeat) {
        if (beatSyncStrength === "light") { accent.transitionOut = "fade"; accent.transitionDuration = 0.2; }
        else if (beatSyncStrength === "aggressive") { accent.transitionOut = "zoom"; accent.transitionDuration = 0.34; }
        else { accent.transitionOut = "crossfade"; accent.transitionDuration = 0.28; }
      }
      nextClips[item.index] = { ...clip, trimOut: nextTrimOut, ...accent };
      if (syncVisualAccents && item.downbeat && beatSyncStrength === "aggressive") {
        const following = nextClips[item.index + 1];
        if (following && !following.beatLocked && (following.motion ?? "none") === "none") {
          nextClips[item.index + 1] = { ...following, motion: item.index % 2 === 0 ? "zoom-in" : "zoom-out" };
        }
      }
    }

    const visualTolerance = beatSyncStrength === "light" ? 0.12 : beatSyncStrength === "aggressive" ? 0.34 : 0.22;
    let visualAccents = 0;
    const nextLayers = layersRef.current.map((layer) => {
      if (!syncVisualAccents) return layer;
      let nearest = effectiveBeatCandidates[0] ?? layer.start;
      let distance = Math.abs(nearest - layer.start);
      for (const candidate of effectiveBeatCandidates) {
        const d = Math.abs(candidate - layer.start);
        if (d < distance) { nearest = candidate; distance = d; }
      }
      if (distance > visualTolerance) return layer;
      const strong = downbeatTimes.some((time) => Math.abs(time - nearest) < 0.03);
      if (layer.contentKind === "caption") {
        if (!strong) return layer;
        visualAccents += 1;
        return { ...layer, enterAnimation: "pop" as LayerAnimation, animationDuration: Math.min(layer.animationDuration ?? 0.35, 0.22) };
      }
      const duration = Math.max(0.1, layer.end - layer.start);
      const shiftedStart = clamp(nearest, 0, Math.max(0, projectDurationFor(nextClips) - duration));
      if (Math.abs(shiftedStart - layer.start) < 0.01 && !strong) return layer;
      visualAccents += 1;
      return {
        ...layer,
        start: shiftedStart,
        end: shiftedStart + duration,
        enterAnimation: strong ? (beatSyncStrength === "aggressive" ? "zoom" : "pop") as LayerAnimation : layer.enterAnimation,
        animationDuration: strong ? Math.min(layer.animationDuration ?? 0.35, 0.24) : layer.animationDuration,
      };
    });

    commitEditor(nextClips, nextLayers);
    const nextDuration = projectDurationFor(nextClips);
    setTimelineTime((time) => clamp(time, 0, Math.max(0, nextDuration)));
    setMusicEnd((current) => Math.min(current, Math.max(0.1, nextDuration)));
    toast({ title: "Beat Sync avançado aplicado", description: `${beatCutPreview.length} corte${beatCutPreview.length === 1 ? "" : "s"} alinhado${beatCutPreview.length === 1 ? "" : "s"}${visualAccents ? ` · ${visualAccents} acento${visualAccents === 1 ? "" : "s"} visual${visualAccents === 1 ? "" : "is"}` : ""}.` });
  }, [activeBeatAnalysis, beatCutPreview, beatSyncStrength, commitEditor, downbeatTimes, effectiveBeatCandidates, syncVisualAccents, toast]);'''
    s = s[:start] + new_sync + s[end:]

if 'editorVersion: 13' not in s:
    r('    editorVersion: 12,', '    editorVersion: 13,')
    r('''        step: beatStep,
        showMarkers: showBeatMarkers,
        waveform: activeBeatAnalysis.waveform,''', '''        step: beatStep,
        showMarkers: showBeatMarkers,
        waveform: activeBeatAnalysis.waveform,
        downbeatIndex: activeBeatAnalysis.downbeatIndex,
        strength: beatSyncStrength,
        manualMarkers: manualBeatMarkers,
        syncVisualAccents,''')
    r('activeBeatAnalysis, beatStep, showBeatMarkers]);', 'activeBeatAnalysis, beatStep, showBeatMarkers, beatSyncStrength, manualBeatMarkers, syncVisualAccents]);')

if 'source: "metadata", waveform: [], downbeatIndex: 0' not in s:
    r('source: "metadata", waveform: [] });', 'source: "metadata", waveform: [], downbeatIndex: 0 });')

if 'beatLocked: raw.beatLocked === true' not in s:
    r('''              motion: (["none", "zoom-in", "zoom-out", "pan-left", "pan-right"] as string[]).includes(String(raw.motion)) ? raw.motion as ClipMotion : "none",
            };''', '''              motion: (["none", "zoom-in", "zoom-out", "pan-left", "pan-right"] as string[]).includes(String(raw.motion)) ? raw.motion as ClipMotion : "none",
              beatLocked: raw.beatLocked === true,
            };''')

if 'downbeatIndex: [0, 1, 2, 3].includes' not in s:
    r('''            waveform: Array.isArray(savedBeatSync.waveform) ? savedBeatSync.waveform.map((value: unknown) => clamp(Number(value) || 0, 0, 1)).slice(0, 160) : [],
          });
          if ([1, 2, 4].includes(Number(savedBeatSync.step))) setBeatStep(Number(savedBeatSync.step) as BeatStep);
          if (typeof savedBeatSync.showMarkers === "boolean") setShowBeatMarkers(savedBeatSync.showMarkers);''', '''            waveform: Array.isArray(savedBeatSync.waveform) ? savedBeatSync.waveform.map((value: unknown) => clamp(Number(value) || 0, 0, 1)).slice(0, 160) : [],
            downbeatIndex: [0, 1, 2, 3].includes(Number(savedBeatSync.downbeatIndex)) ? Number(savedBeatSync.downbeatIndex) : 0,
          });
          if ([1, 2, 4].includes(Number(savedBeatSync.step))) setBeatStep(Number(savedBeatSync.step) as BeatStep);
          if (typeof savedBeatSync.showMarkers === "boolean") setShowBeatMarkers(savedBeatSync.showMarkers);
          if (["light", "balanced", "aggressive"].includes(String(savedBeatSync.strength))) setBeatSyncStrength(savedBeatSync.strength as BeatSyncStrength);
          if (Array.isArray(savedBeatSync.manualMarkers)) setManualBeatMarkers(savedBeatSync.manualMarkers.map((time: unknown) => Math.max(0, Number(time) || 0)).slice(0, 80).sort((a: number, b: number) => a - b));
          if (typeof savedBeatSync.syncVisualAccents === "boolean") setSyncVisualAccents(savedBeatSync.syncVisualAccents);''')

p.write_text(s)
