export function buildConceptRenderPromptExtras(input: {
  renderView: "exterior" | "interior";
  lightingMode: string;
  kontextSummary: string;
  brief: string;
  openingSummary: string;
}) {
  const renderProfile = input.renderView === "interior"
    ? [
        "INTERIOR CAMERA PROFILE: eye-level architectural photography, approximately 1.55m camera height, 24-28mm full-frame equivalent, vertical lines corrected, natural perspective, no fisheye, no exaggerated wide angle.",
        `INTERIOR LIGHTING: obey the selected ${input.lightingMode} scenario with physically plausible practical lights, soft indirect bounce, realistic contact shadows, preserved window directions and room proportions.`,
      ]
    : [
        "EXTERIOR CAMERA PROFILE: professional architectural exterior photography, 28-35mm full-frame equivalent, corrected verticals, realistic perspective, natural sky exposure, no drone distortion unless the reference clearly shows an elevated view.",
        `EXTERIOR LIGHTING: obey the selected ${input.lightingMode} scenario, physically plausible light direction, soft global illumination, realistic facade reflections, glazing, vegetation and ground contact shadows.`,
      ];

  return [
    input.kontextSummary ? `${input.kontextSummary}\n---DETALHES---` : "",
    input.brief,
    ...renderProfile,
    input.openingSummary ? `OPENINGS TO PRESERVE EXACTLY: ${input.openingSummary}` : "",
    "PRESERVATION LOCK: keep the exact floor plan, wall positions, openings, room proportions, object positions, furniture layout, facade massing, roof shape and camera composition from the reference. Do not move, add, remove or resize architectural elements unless explicitly described.",
    "MATERIAL FIDELITY: preserve the specified PBR/material identity, realistic roughness, reflectance and texture scale. Glass must remain glass, wood must preserve grain direction, metals must not become plastic, stone/porcelain joints must remain proportionally realistic.",
    "FINAL OUTPUT TARGET: high-end photoreal architectural visualization, physically plausible materials and lighting, ray-traced look, realistic glass, realistic water when present, natural contact shadows, subtle ambient occlusion, balanced exposure, professional architectural photography composition, no geometry changes, no invented openings, no structural modifications, no fantasy styling, no extra furniture.",
  ].filter(Boolean).join("\n");
}
