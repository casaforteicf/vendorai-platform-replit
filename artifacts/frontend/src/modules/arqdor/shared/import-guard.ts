export type ArqdorImportKind = "floorplan" | "reference" | "photo" | "pdf";

export type ArqdorImportValidation = {
  ok: boolean;
  kind: ArqdorImportKind;
  message: string;
  warnings: string[];
};

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateArqdorImport(
  file: File,
  requestedKind: ArqdorImportKind = "reference",
): ArqdorImportValidation {
  const ext = extensionOf(file.name);
  const isPdf = file.type === "application/pdf" || ext === "pdf";
  const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(ext);
  const kind = requestedKind === "floorplan" ? "floorplan" : isPdf ? "pdf" : requestedKind;

  if (file.size <= 0) {
    return { ok: false, kind, message: "O arquivo está vazio.", warnings: [] };
  }

  if (!isPdf && !isImage) {
    return {
      ok: false,
      kind,
      message: "Formato não suportado nesta importação. Use PDF, JPG, PNG ou WEBP.",
      warnings: [],
    };
  }

  const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return {
      ok: false,
      kind,
      message: `Arquivo muito grande. Limite: ${Math.round(limit / 1024 / 1024)} MB.`,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  if (requestedKind === "floorplan") {
    warnings.push("A geometria da planta não deve ser alterada automaticamente sem conferência.");
    warnings.push("Se a escala não puder ser determinada com segurança, será necessária calibração por medida real.");
  }

  return {
    ok: true,
    kind,
    message: requestedKind === "floorplan"
      ? "Planta aceita para leitura e conferência arquitetônica."
      : "Arquivo aceito como referência visual.",
    warnings,
  };
}

export function validateRenderImage(file: File): string | null {
  const ext = extensionOf(file.name);
  const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(ext);
  if (!isImage) return "Envie uma imagem JPG, PNG ou WEBP.";
  if (file.size <= 0) return "A imagem selecionada está vazia.";
  if (file.size > MAX_IMAGE_BYTES) return "A imagem excede o limite de 20 MB.";
  return null;
}
