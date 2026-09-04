from pathlib import Path
import re

path = Path('artifacts/frontend/src/components/video/VideoTimelineEditor.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {count}')
    text = text.replace(old, new, 1)


replace_once(
    'type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";\n',
    'type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";\n'
    'type LayerAnimation = "none" | "fade" | "pop" | "zoom" | "slide-up" | "slide-down" | "slide-left" | "slide-right";\n'
    'type TextAlign = "left" | "center" | "right";\n',
    'types',
)

replace_once(
    '  easing: EasingType;\n  keyframes?: LayerKeyframe[];\n',
    '  easing: EasingType;\n'
    '  textAlign: TextAlign;\n'
    '  enterAnimation: LayerAnimation;\n'
    '  exitAnimation: LayerAnimation;\n'
    '  animationDuration: number;\n'
    '  keyframes?: LayerKeyframe[];\n',
    'EditorLayer fields',
)

replace_once(
    '];\n\nfunction tokenHeaders',
    '''];

const CAPTION_TEMPLATES: Array<{
  name: string;
  text: string;
  fontSize: number;
  y: number;
  color: string;
  background: string;
  textAlign: TextAlign;
  enterAnimation: LayerAnimation;
}> = [
  { name: "Impacto Reels", text: "SUA LEGENDA AQUI", fontSize: 48, y: 70, color: "#ffffff", background: "#111827", textAlign: "center", enterAnimation: "pop" },
  { name: "Destaque", text: "PALAVRA-CHAVE", fontSize: 46, y: 72, color: "#111827", background: "#facc15", textAlign: "center", enterAnimation: "slide-up" },
  { name: "Minimal", text: "Mensagem clara e direta", fontSize: 42, y: 76, color: "#ffffff", background: "#1f2937", textAlign: "center", enterAnimation: "fade" },
  { name: "CTA Social", text: "FALE COM A GENTE", fontSize: 44, y: 80, color: "#ffffff", background: "#b91c1c", textAlign: "center", enterAnimation: "zoom" },
];

function tokenHeaders''',
    'caption templates',
)

replace_once(
    '\n\ntype CrossfadeWindow = {',
    '''

function resolveAnimatedLayerAtTime(layer: EditorLayer, time: number): EditorLayer {
  const resolved = resolveLayerAtTime(layer, time);
  const layerDuration = Math.max(0.1, layer.end - layer.start);
  const duration = Math.min(layerDuration / 2, Math.max(0.1, layer.animationDuration ?? 0.35));
  const enter = applyEasing(clamp((time - layer.start) / duration, 0, 1), layer.easing ?? "ease-in-out");
  const exit = applyEasing(clamp((layer.end - time) / duration, 0, 1), layer.easing ?? "ease-in-out");
  const next: EditorLayer = { ...resolved };

  const applyAnimation = (type: LayerAnimation, amount: number, entering: boolean) => {
    if (type === "none") return;
    if (type === "fade") next.opacity *= amount;
    if (type === "pop") next.scale *= entering ? 0.82 + 0.18 * amount : 0.9 + 0.1 * amount;
    if (type === "zoom") next.scale *= entering ? 0.68 + 0.32 * amount : 0.82 + 0.18 * amount;
    const offset = (1 - amount) * 8;
    if (type === "slide-up") next.y += entering ? offset : -offset;
    if (type === "slide-down") next.y += entering ? -offset : offset;
    if (type === "slide-left") next.x += entering ? offset : -offset;
    if (type === "slide-right") next.x += entering ? -offset : offset;
  };

  applyAnimation(layer.enterAnimation ?? "none", enter, true);
  applyAnimation(layer.exitAnimation ?? "none", exit, false);
  return next;
}

type CrossfadeWindow = {''',
    'animated resolver',
)

replace_once('    editorVersion: 6,', '    editorVersion: 7,', 'editor version')

replace_once(
    '          easing: (["linear", "ease-in", "ease-out", "ease-in-out"] as string[]).includes(String(layer.easing)) ? layer.easing as EasingType : "ease-in-out",\n          keyframes:',
    '          easing: (["linear", "ease-in", "ease-out", "ease-in-out"] as string[]).includes(String(layer.easing)) ? layer.easing as EasingType : "ease-in-out",\n'
    '          textAlign: (["left", "center", "right"] as string[]).includes(String(layer.textAlign)) ? layer.textAlign as TextAlign : "left",\n'
    '          enterAnimation: (["none", "fade", "pop", "zoom", "slide-up", "slide-down", "slide-left", "slide-right"] as string[]).includes(String(layer.enterAnimation)) ? layer.enterAnimation as LayerAnimation : "none",\n'
    '          exitAnimation: (["none", "fade", "pop", "zoom", "slide-up", "slide-down", "slide-left", "slide-right"] as string[]).includes(String(layer.exitAnimation)) ? layer.exitAnimation as LayerAnimation : "none",\n'
    '          animationDuration: clamp(Number(layer.animationDuration) || 0.35, 0.1, 1.5),\n'
    '          keyframes:',
    'layer migration',
)

replace_once(
    '      background: "#000000",\n      opacity: 1,\n      scale: 1,\n      rotation: 0,\n      easing: "ease-in-out",\n',
    '      background: "#000000",\n'
    '      opacity: 1,\n'
    '      scale: 1,\n'
    '      rotation: 0,\n'
    '      easing: "ease-in-out",\n'
    '      textAlign: "center",\n'
    '      enterAnimation: kind === "cta" ? "pop" : kind === "title" ? "slide-up" : "fade",\n'
    '      exitAnimation: "fade",\n'
    '      animationDuration: 0.35,\n',
    'text defaults',
)

replace_once(
    '\n\n  const addCardLayer = (template = CARD_TEMPLATES[0]) => {',
    '''

  const addCaptionLayer = (template = CAPTION_TEMPLATES[0]) => {
    if (!template) return;
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const at = clamp(timelineTime, 0, Math.max(0, total - 0.1));
    const layer: EditorLayer = {
      id: uid("caption"),
      type: "text",
      name: `Legenda · ${template.name}`,
      text: template.text,
      start: at,
      end: Math.min(total, at + 3),
      x: 7,
      y: template.y,
      width: 86,
      fontSize: template.fontSize,
      color: template.color,
      background: template.background,
      opacity: 1,
      scale: 1,
      rotation: 0,
      easing: "ease-out",
      textAlign: template.textAlign,
      enterAnimation: template.enterAnimation,
      exitAnimation: "fade",
      animationDuration: 0.28,
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
  };

  const addCardLayer = (template = CARD_TEMPLATES[0]) => {''',
    'caption helper',
)

replace_once(
    '      color: template.color, background: template.background, opacity: 0.94, scale: 1, rotation: 0, easing: "ease-in-out",\n',
    '      color: template.color, background: template.background, opacity: 0.94, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "left", enterAnimation: "slide-up", exitAnimation: "fade", animationDuration: 0.35,\n',
    'card defaults',
)

old_image = '      x: 60, y: 8, width: 32, fontSize: 32, color: "#ffffff", background: "#000000", opacity: 1, scale: 1, rotation: 0, easing: "ease-in-out",\n'
count = text.count(old_image)
if count != 2:
    raise SystemExit(f'image defaults: esperado 2 matches, encontrado {count}')
text = text.replace(old_image, '      x: 60, y: 8, width: 32, fontSize: 32, color: "#ffffff", background: "#000000", opacity: 1, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "left", enterAnimation: "fade", exitAnimation: "fade", animationDuration: 0.35,\n')

replace_once(
    '      <RangeField label="Rotação" value={selectedLayer.rotation ?? 0} min={-180} max={180} step={1} suffix="°" onChange={(value) => updateLayer({ rotation: value })} />\n      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Curva da animação</span><select value={selectedLayer.easing ?? "ease-in-out"} onChange={(event) => updateLayer({ easing: event.target.value as EasingType })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="linear">Linear</option><option value="ease-in">Acelera</option><option value="ease-out">Desacelera</option><option value="ease-in-out">Suave · acelera e desacelera</option></select></label>\n',
    '''      <RangeField label="Rotação" value={selectedLayer.rotation ?? 0} min={-180} max={180} step={1} suffix="°" onChange={(value) => updateLayer({ rotation: value })} />
      {selectedLayer.type !== "image" && <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Alinhamento</span><select value={selectedLayer.textAlign ?? "left"} onChange={(event) => updateLayer({ textAlign: event.target.value as TextAlign })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="left">Esquerda</option><option value="center">Centralizado</option><option value="right">Direita</option></select></label>}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
        <div><p className="text-xs font-semibold">Entrada e saída</p><p className="text-[10px] text-muted-foreground">Animações prontas para texto, card ou imagem, aplicadas também no MP4 final.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Entrada</span><select value={selectedLayer.enterAnimation ?? "none"} onChange={(event) => updateLayer({ enterAnimation: event.target.value as LayerAnimation })} className="h-9 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="none">Sem efeito</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="zoom">Zoom</option><option value="slide-up">Subir</option><option value="slide-down">Descer</option><option value="slide-left">Entrar da direita</option><option value="slide-right">Entrar da esquerda</option></select></label>
          <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Saída</span><select value={selectedLayer.exitAnimation ?? "none"} onChange={(event) => updateLayer({ exitAnimation: event.target.value as LayerAnimation })} className="h-9 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="none">Sem efeito</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="zoom">Zoom</option><option value="slide-up">Subir</option><option value="slide-down">Descer</option><option value="slide-left">Sair à esquerda</option><option value="slide-right">Sair à direita</option></select></label>
        </div>
        <RangeField label="Duração do efeito" value={selectedLayer.animationDuration ?? 0.35} min={0.1} max={1.5} step={0.05} suffix="s" onChange={(value) => updateLayer({ animationDuration: value })} />
      </div>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Curva da animação</span><select value={selectedLayer.easing ?? "ease-in-out"} onChange={(event) => updateLayer({ easing: event.target.value as EasingType })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="linear">Linear</option><option value="ease-in">Acelera</option><option value="ease-out">Desacelera</option><option value="ease-in-out">Suave · acelera e desacelera</option></select></label>
''',
    'properties animation controls',
)

pattern = re.compile(r'    if \(tool === "captions"\) return .*?;\n    if \(tool === "settings"\)', re.S)
replacement = '''    if (tool === "captions") return <div className="space-y-3"><div><p className="text-sm font-semibold">Legendas modernas</p><p className="text-xs text-muted-foreground">Modelos rápidos para Reels, Stories e vídeos comerciais, além da legenda automática.</p></div><div className="space-y-2">{CAPTION_TEMPLATES.map((template) => <button key={template.name} onClick={() => addCaptionLayer(template)} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><div className="rounded-lg px-2.5 py-2 text-xs font-bold" style={{ background: template.background, color: template.color, textAlign: template.textAlign }}>{template.text}</div><p className="mt-2 text-xs font-medium">{template.name}</p><p className="text-[10px] text-muted-foreground">Entrada {template.enterAnimation === "pop" ? "Pop" : template.enterAnimation === "slide-up" ? "Subir" : template.enterAnimation === "zoom" ? "Zoom" : "Fade"} · editável na timeline</p></button>)}</div><button disabled={!clips.length || jobStatus === "processing"} onClick={() => void applyAutomaticCaption()} className="w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-semibold text-background disabled:opacity-40"><Captions className="mr-2 inline h-4 w-4" />Legenda automática</button><p className="text-[11px] text-muted-foreground">As faixas estilizadas ficam totalmente editáveis. Em projetos com vários clipes, exporte a sequência antes de aplicar a legenda automática.</p></div>;
    if (tool === "settings")'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'captions panel: esperado 1 match, encontrado {count}')

replace_once(
    '          const resolvedLayer = resolveLayerAtTime(layer, globalTime);',
    '          const resolvedLayer = resolveAnimatedLayerAtTime(layer, globalTime);',
    'render resolver',
)

replace_once(
    '            ctx.fillStyle = layer.color;\n            lines.forEach((line, index) => ctx.fillText(line, layer.type === "card" ? padding : 0, (layer.type === "card" ? padding : 0) + index * lineHeight, maxWidth - padding));\n',
    '''            ctx.fillStyle = layer.color;
            const align = resolvedLayer.textAlign ?? "left";
            ctx.textAlign = align;
            const textX = layer.type === "card"
              ? align === "center" ? maxWidth / 2 : align === "right" ? maxWidth - padding : padding
              : align === "center" ? maxWidth / 2 : align === "right" ? maxWidth : 0;
            lines.forEach((line, index) => ctx.fillText(line, textX, (layer.type === "card" ? padding : 0) + index * lineHeight, maxWidth - padding));
''',
    'render text alignment',
)

replace_once(
    '    const resolvedLayer = resolveLayerAtTime(layer, timelineTime);\n    const style: CSSProperties = { position: "absolute", left: `${resolvedLayer.x}%`, top: `${resolvedLayer.y}%`, width: `${resolvedLayer.width}%`, opacity: resolvedLayer.opacity, transform: `rotate(${resolvedLayer.rotation ?? 0}deg) scale(${resolvedLayer.scale ?? 1})`, transformOrigin: "top left" };\n    const selected = selectedLayerId === layer.id;\n    return <div key={layer.id} style={style} className={cn("group touch-none select-none", selected && "z-20")} onPointerDown={(event) => startStageGesture(event, layer, "move")}>{layer.type === "image" ? <img src={layer.url} alt="" draggable={false} className={cn("block h-auto max-h-[85%] w-full object-contain", selected && "outline outline-2 outline-primary")} /> : <div style={{ color: layer.color, background: layer.type === "card" ? layer.background : "transparent", fontSize: `${Math.max(11, layer.fontSize * 0.38)}px`, whiteSpace: "pre-wrap" }} className={cn("rounded-lg p-2 font-bold leading-tight", selected && "outline outline-2 outline-primary")}>{layer.text}</div>}{selected && <button type="button" aria-label="Redimensionar camada" onPointerDown={(event) => startStageGesture(event, layer, "resize")} className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow" />}</div>;\n',
    '''    const resolvedLayer = resolveAnimatedLayerAtTime(layer, timelineTime);
    const style: CSSProperties = { position: "absolute", left: `${resolvedLayer.x}%`, top: `${resolvedLayer.y}%`, width: `${resolvedLayer.width}%`, opacity: resolvedLayer.opacity, transform: `rotate(${resolvedLayer.rotation ?? 0}deg) scale(${resolvedLayer.scale ?? 1})`, transformOrigin: "top left" };
    const selected = selectedLayerId === layer.id;
    const previewBackground = layer.type === "card" || (resolvedLayer.background && resolvedLayer.background !== "transparent") ? resolvedLayer.background : "transparent";
    return <div key={layer.id} style={style} className={cn("group touch-none select-none", selected && "z-20")} onPointerDown={(event) => startStageGesture(event, layer, "move")}>{layer.type === "image" ? <img src={layer.url} alt="" draggable={false} className={cn("block h-auto max-h-[85%] w-full object-contain", selected && "outline outline-2 outline-primary")} /> : <div style={{ color: layer.color, background: previewBackground, fontSize: `${Math.max(11, layer.fontSize * 0.38)}px`, whiteSpace: "pre-wrap", textAlign: resolvedLayer.textAlign ?? "left" }} className={cn("rounded-lg p-2 font-bold leading-tight", selected && "outline outline-2 outline-primary")}>{layer.text}</div>}{selected && <button type="button" aria-label="Redimensionar camada" onPointerDown={(event) => startStageGesture(event, layer, "resize")} className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow" />}</div>;
''',
    'preview animated layer',
)

path.write_text(text)
