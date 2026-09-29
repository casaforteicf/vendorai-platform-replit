export type ArqdorRenderPreset =
  | "facade_exterior_preserve"
  | "interior_layout_preserve"
  | "material_detail_enhancer"
  | "distortion_correction"
  | "camera_perspective_lock"
  | "joinery_precision"
  | "roof_openings_lock"
  | "lighting_realism"
  | "landscape_controlled"
  | "pool_water_fidelity"
  | "glass_mirror_fidelity"
  | "outdoor_gourmet_preserve"
  | "deck_pergola_preserve"
  | "wall_gate_fidelity"
  | "night_lighting_exterior"
  | "guardrail_glass_precision"
  | "ceiling_led_linear"
  | "ambient_boost"
  | "shadow_softening"
  | "exposure_lift_controlled";

export type ArqdorVideoMovement =
  | "zoom_in_soft"
  | "zoom_out_soft"
  | "pan_left_soft"
  | "pan_right_soft"
  | "tilt_up_soft"
  | "tilt_down_soft"
  | "orbit_left_soft"
  | "orbit_right_soft"
  | "parallax_soft"
  | "cinematic_micro_movement";

const UNIVERSAL_PRESERVE = [
  "Treat the supplied image/model as the authoritative source of truth.",
  "Preserve the exact geometry, proportions, spatial relationships, openings, object positions, architectural boundaries, camera orientation and design intent.",
  "Do not redesign, reinterpret, relocate, resize, add or remove structural or fixed elements unless explicitly requested.",
  "The target is a believable professional architectural photograph of the completed real space, not a 3D render, illustration or stylized visualization.",
  "Any enhancement must be visual only: physically plausible materials, natural lighting, texture fidelity, realistic optical response and photographic quality.",
  "Keep subtle real-world material variation, micro-texture, contact shadows, natural highlight roll-off and restrained imperfections that make surfaces look photographed rather than digitally perfect.",
  "Avoid synthetic perfection: no plastic surfaces, uniform procedural textures, excessive smoothness, overly clean edges, game-engine lighting, CGI gloss or artificial HDR.",
  "When uncertain, preserve the original instead of inventing.",
].join(" ");

const NEGATIVE_GEOMETRY = [
  "deformed","distorted","disfigured","poorly drawn","bad architecture","impossible geometry",
  "warped windows","crooked walls","slanted walls","bent walls","floating elements",
  "collapsed structure","broken structure","misaligned openings","warped doors","uneven rooflines",
  "bent roof","twisted columns","inconsistent perspective","unrealistic proportions",
  "curved straight lines","asymmetrical facade","malformed stairs","unstable structure",
].join(", ");

const NEGATIVE_QUALITY = [
  "blurry","low quality","grainy","low resolution","error","cropped","jpeg artifacts",
  "shaky image","color fringing","overexposed","underexposed","noisy image",
  "washed out colors","oversaturated","banding","pixelated","out of focus",
  "motion blur","ghosting","compression artifacts",
].join(", ");

const NEGATIVE_REALISM = [
  "painting","illustration","drawing","sketch","cartoon","anime","clay model","miniature",
  "toy-like","stylized","abstract","fantasy style","low poly","hand-drawn","comic style",
  "watercolor","oil painting","CGI look","3D render look","game-engine look","Unreal Engine look","plastic surfaces","overly smooth materials","procedural-looking textures","synthetic perfection","artificial HDR",
].join(", ");

const NEGATIVE_CLUTTER = [
  "clutter","messy scene","visual clutter","excessive objects","too many decorations",
  "random objects","distracting background","crowded composition","unnecessary furniture",
  "duplicated objects","floating decor","chaotic layout","overdecorated","messy landscaping",
  "excessive props","random vehicles","random people",
].join(", ");

const NEGATIVE_TEXT = [
  "text","watermark","signature","caption","subtitle","label","brand name",
  "fake text","gibberish text","UI text","unreadable letters","distorted typography",
].join(", ");

const NEGATIVE_MATERIALS = [
  "fake materials","melted textures","plastic-looking surfaces","unnatural reflections",
  "inconsistent shadows","unrealistic lighting","texture stretching","texture seams",
  "repeated texture pattern","glossy concrete","fake wood grain","unnatural stone texture",
].join(", ");

export const ARQDOR_NEGATIVE_PROMPTS = {
  architecture: [NEGATIVE_GEOMETRY, NEGATIVE_QUALITY, NEGATIVE_REALISM, NEGATIVE_CLUTTER, NEGATIVE_TEXT, NEGATIVE_MATERIALS].join(", "),
  interior: [
    NEGATIVE_GEOMETRY, NEGATIVE_QUALITY, NEGATIVE_REALISM, NEGATIVE_CLUTTER, NEGATIVE_TEXT, NEGATIVE_MATERIALS,
    "floating furniture, misaligned cabinets, warped furniture, floating shelves, broken joinery, uneven countertop, distorted chairs, fused objects, malformed decor",
  ].join(", "),
  material: [
    NEGATIVE_QUALITY, NEGATIVE_TEXT, NEGATIVE_MATERIALS,
    "warped alignment, broken alignment, distorted reflections, fake shadows",
  ].join(", "),
  video: [
    "scene change","geometry change","object transformation","morphing architecture","warped facade",
    "distorted walls","moving structure","flicker","unstable frame","shaking camera","sudden motion",
    "floating elements","inconsistent perspective","duplicated objects","random new objects",
    "people appearing","cars appearing","lighting flicker","texture crawling","melted textures",
    "text","watermark","logo","low quality","blurry","noisy image","broken alignment",
  ].join(", "),
} as const;

const PRESETS: Record<ArqdorRenderPreset, string> = {
  facade_exterior_preserve: [
    "Professional architectural photography of the provided 3D model, eye-level perspective.",
    "Strictly preserve all original geometric volumes, building proportions, facade composition, rooflines, openings and structural shapes without adding new objects or modifying boundaries.",
    "Maintain exact architectural alignment and straight lines.",
    "Enhance only the existing materials, texture fidelity, glazing reflections and physically plausible depth.",
    "Use realistic soft shadows and controlled natural light. Photorealistic architectural photography, sharp focus, professional Brazilian architecture presentation.",
  ].join(" "),
  interior_layout_preserve: [
    "Professional real-estate and architectural interior photography of the exact layout provided.",
    "The final image must read as a photograph of a physically built room, never as CGI, concept art, illustration or a game-engine render.",
    "Do not alter, move, replace, resize or reinterpret any furniture, cabinetry, wall, opening or fixed element from the original image.",
    "Maintain strict layout fidelity, joinery alignment, proportions, exact object positions and original material colors.",
    "Enhance existing surfaces with physically believable micro-texture: natural wood pores and grain variation, visible textile weave, stone depth and subtle roughness, realistic paint response, controlled metal specular highlights and glass reflections.",
    "Use natural daylight plus plausible architectural artificial light, realistic indirect bounce, soft contact shadows, subtle ambient occlusion and restrained contrast.",
    "Preserve realistic tonal variation and slight material irregularity; avoid uniform smooth shading, plastic finishes, excessive gloss, oversharpening, overly perfect edges and synthetic HDR.",
    "Camera look: full-frame architectural photography, corrected verticals, natural 28–35mm perspective, realistic exposure and white balance, sharp but not digitally overprocessed.",
  ].join(" "),
  material_detail_enhancer: [
    "Macro architectural photography focusing on the material detail already shown.",
    "Maintain strict structural alignment and exact object positions from the base image.",
    "Enhance micro-texture sharpness, surface roughness, veins, grain and physically correct reflections while preserving the original design colors.",
    "Professional macro-lens look with controlled shallow depth of field and accurate white balance.",
  ].join(" "),
  distortion_correction: [
    "CORRECTION PASS: repair geometric and visual distortions only.",
    "Restore straight walls, true verticals, aligned windows and doors, stable roof/parapet lines, correct furniture and joinery geometry and the exact proportions visible in the source.",
    "Do not redesign or introduce new details. Preserve all correct regions unchanged.",
  ].join(" "),
  camera_perspective_lock: [
    "CAMERA LOCK: preserve the source camera position, horizon, focal perspective, visible extents and vanishing-point relationships.",
    "Keep architectural verticals vertical and straight lines straight. Avoid wide-angle stretching, barrel distortion, keystone distortion, crop drift or unintended zoom.",
  ].join(" "),
  joinery_precision: [
    "JOINERY LOCK: preserve cabinetry modules, door widths, drawer lines, handles/recesses, countertop thickness, appliance gaps, panel joints, shelves and all horizontal/vertical alignments exactly.",
    "No warped cabinets, floating shelves, uneven doors, duplicated modules or changed proportions.",
  ].join(" "),
  roof_openings_lock: [
    "OPENINGS AND ROOF LOCK: preserve the exact count, position, size relationship and alignment of every door and window.",
    "Preserve roof slopes, parapets, eaves, ridges, gutters and overhang geometry. Never bend, merge, relocate or invent openings or roof elements.",
  ].join(" "),
  lighting_realism: [
    "LIGHTING ONLY: improve illumination while preserving geometry, layout, materials and camera.",
    "Use physically plausible sun/sky or interior fixtures, consistent shadow direction, realistic exposure, balanced highlights and believable contact shadows.",
  ].join(" "),
  landscape_controlled: [
    "CONTROLLED LANDSCAPING: improve vegetation only where spatially plausible.",
    "Do not hide facade openings, entrances, garage, architectural edges or circulation. Never place plants through walls, slabs, paving or pool edges.",
  ].join(" "),
  pool_water_fidelity: [
    "POOL/WATER LOCK: preserve pool shape, spa shape, coping, waterline, level, deck boundaries, drains and all edge geometry exactly.",
    "Water must remain contained inside the pool/spa with physically plausible transparency, depth, caustics and reflections. No warped coping, flooded deck, melted water edges or invented overflow.",
  ].join(" "),
  glass_mirror_fidelity: [
    "GLASS/MIRROR LOCK: preserve the exact position, dimensions, proportions, frame alignment and boundaries of every glass panel, window, mirror and reflective surface.",
    "Glass must have physically plausible transparency, Fresnel reflections, controlled glare and light transmission without becoming opaque, milky or mirror-like unless it is actually mirrored glass.",
    "Mirrors must reflect the real surrounding scene consistently with the source camera and room geometry. Never invent openings, duplicate furniture, create impossible reflected objects or show a fake second room.",
    "No warped reflections, melted edges, doubled frames, broken mullions, floating glass, distorted silhouettes or grey flat mirror surfaces.",
  ].join(" "),
  outdoor_gourmet_preserve: [
    "OUTDOOR GOURMET LOCK: preserve barbecue/grill, oven, counters, sink, cabinetry, appliances, fixed furniture, pergola/supports, roof/soffit, openings and circulation exactly.",
    "Preserve all existing movable furniture positions and dimensions. Improve only material realism, lighting, vegetation coherence and photographic finish.",
    "Do not invent or relocate tables, chairs, stools, sofas, planters or appliances. Decorative additions are forbidden unless explicitly requested.",
  ].join(" "),
  deck_pergola_preserve: [
    "DECK/PERGOLA LOCK: preserve deck outline, board direction, steps, level changes, pergola posts, beams, slats, roof panels and structural spacing exactly.",
    "Enhance wood/metal texture, weathering realism, shadows and outdoor lighting without bending, multiplying, relocating or resizing any structural element.",
  ].join(" "),
  wall_gate_fidelity: [
    "WALL/GATE LOCK: preserve perimeter walls, fences, gates, pedestrian access, garage gate width, pillars, hinges, slats, openings and alignment exactly.",
    "Do not change height, spacing, material color, gate position or access geometry. Improve only texture fidelity, metal/glass response, lighting and realistic depth.",
  ].join(" "),
  night_lighting_exterior: [
    "EXTERIOR NIGHT LIGHTING ONLY: preserve geometry, materials, colors, landscaping, furniture and camera exactly while changing only the lighting condition to a physically plausible night scene.",
    "Use realistic warm/cool fixture temperatures, believable light falloff, controlled facade highlights, readable shadows and dark-sky exposure. Do not invent fixtures, windows, people, vehicles or glowing surfaces.",
  ].join(" "),
  guardrail_glass_precision: [
    "GUARDRAIL/GLASS PRECISION: preserve exact guardrail height, post spacing, handrail alignment, glass panel count, panel width, edges and mounting points.",
    "Glass must remain transparent with physically plausible reflections and edge thickness. Never remove posts, merge panels, bend rails, create gaps or alter safety geometry.",
  ].join(" "),
  ceiling_led_linear: [
    "INTERIOR CEILING LIGHT RULE: for indoor scenes, always use a realistic ceiling lighting solution as the main artificial light source.",
    "Prefer a linear LED bar/profile on the ceiling, recessed or surface-mounted, with elegant and coherent placement.",
    "If the scene has no visible fixture modeled, create a subtle architectural linear LED effect that fits the ceiling without changing the room geometry.",
    "Lighting must look technically plausible and improve the readability of materials, cabinetry and furniture without redesigning the space.",
  ].join(" "),
  ambient_boost: [
    "Increase ambient brightness in a controlled architectural way.",
    "Open heavy shadows, improve bounce light and raise overall readability while preserving real material colors.",
  ].join(" "),
  shadow_softening: [
    "Soften harsh shadows and improve shadow transitions while keeping natural depth and contrast.",
  ].join(" "),
  exposure_lift_controlled: [
    "Lift exposure moderately with highlight control, preserving white balance, color fidelity and material texture.",
  ].join(" "),
};

export function inferArqdorRenderPresets(input: {
  ambiente?: string | null;
  renderView?: string | null;
  source?: string | null;
  userNotes?: string | null;
  explicit?: ArqdorRenderPreset[];
}): ArqdorRenderPreset[] {
  const explicit = input.explicit ?? [];
  const text = `${input.ambiente ?? ""} ${input.renderView ?? ""} ${input.source ?? ""} ${input.userNotes ?? ""}`.toLowerCase();
  const result: ArqdorRenderPreset[] = [...explicit];
  const hasBasePreset = result.includes("facade_exterior_preserve") || result.includes("interior_layout_preserve");
  if (!hasBasePreset) {
    if (/fachada|exterior|facade|jardim|paisag|piscina|pool|spa|gourmet|deck|pergol|varanda|terra[cç]o|muro|port[aã]o/.test(text)) {
      result.push("facade_exterior_preserve", "camera_perspective_lock", "roof_openings_lock");
    } else {
      result.push("interior_layout_preserve", "camera_perspective_lock");
    }
  } else if (!result.includes("camera_perspective_lock")) {
    result.push("camera_perspective_lock");
  }
  if (/cozinha|roupeiro|arm[aá]rio|marcenaria|cabinet|joinery/.test(text)) result.push("joinery_precision");
  if (/cozinha|sala|quarto|banheiro|escrit[oó]rio|hall|interior/.test(text)) result.push("ceiling_led_linear");
  if (/mais luz|mais_luz|more light|bright|brightness|claro|clarear/.test(text)) {
    result.push("ceiling_led_linear", "ambient_boost", "shadow_softening", "exposure_lift_controlled");
  }
  if (/piscina|pool|spa|agua|água/.test(text)) result.push("pool_water_fidelity");
  if (/jardim|paisag|landscap/.test(text)) result.push("landscape_controlled");
  if (/vidro|glass|espelho|mirror/.test(text)) result.push("glass_mirror_fidelity");
  if (/gourmet|churrasque|barbecue|grill|outdoor kitchen/.test(text)) result.push("outdoor_gourmet_preserve");
  if (/deck|pergol|pergola/.test(text)) result.push("deck_pergola_preserve");
  if (/muro|cerca|port[aã]o|gate|fence/.test(text)) result.push("wall_gate_fidelity");
  if (/guarda[- ]?corpo|guardrail|balustr/.test(text)) result.push("guardrail_glass_precision");
  if (/noturn|night|noite/.test(text) && /fachada|exterior|facade|jardim|piscina|gourmet|deck|varanda|terra[cç]o/.test(text)) result.push("night_lighting_exterior");
  if (/detalhe|close|macro|material/.test(text)) result.push("material_detail_enhancer");
  return Array.from(new Set(result));
}

export function buildArqdorFidelityBlock(input: {
  presets: ArqdorRenderPreset[];
  negativeKind?: "architecture" | "interior" | "material";
}): string {
  const negativeKind = input.negativeKind ?? (input.presets.includes("facade_exterior_preserve") ? "architecture" : "interior");
  return [
    "ARQDOR FIDELITY POLICY:",
    UNIVERSAL_PRESERVE,
    ...input.presets.map((preset) => PRESETS[preset]),
    `AVOID / NEGATIVE CONSTRAINTS: ${ARQDOR_NEGATIVE_PROMPTS[negativeKind]}.`,
    "FINAL FIDELITY CHECK: compare the result against the source before finishing. If a requested enhancement conflicts with source geometry, preserve the source geometry.",
  ].join("\n");
}

const MOVEMENT_TEXT: Record<ArqdorVideoMovement, string> = {
  zoom_in_soft: "very slow dolly-in / zoom-in, no geometry change",
  zoom_out_soft: "very slow dolly-out / zoom-out, no geometry change",
  pan_left_soft: "slow horizontal camera pan to the left",
  pan_right_soft: "slow horizontal camera pan to the right",
  tilt_up_soft: "slow controlled tilt upward",
  tilt_down_soft: "slow controlled tilt downward",
  orbit_left_soft: "very subtle left orbit with minimal parallax",
  orbit_right_soft: "very subtle right orbit with minimal parallax",
  parallax_soft: "subtle camera parallax with extremely small displacement",
  cinematic_micro_movement: "almost-static cinematic micro movement with gentle depth drift",
};

export function buildArqdorRenderToVideoPrompt(movement: ArqdorVideoMovement): string {
  return [
    "Use the supplied architectural render as the absolute source-of-truth first frame.",
    "Preserve architecture, geometry, facade/interior composition, openings, roof, materials, furniture, landscaping, lighting logic and all visible objects exactly as shown.",
    "Do not add, remove, relocate, redesign, resize, morph or replace anything.",
    `Camera movement: ${MOVEMENT_TEXT[movement]}.`,
    "The camera movement must be subtle, stable and physically plausible.",
    "Only animate camera motion and natural micro-reflections. Do not animate the building or objects.",
    "Maintain straight architectural lines, stable texture coordinates and consistent exposure through the full clip.",
    "Photorealistic premium architectural presentation.",
  ].join(" ");
}
