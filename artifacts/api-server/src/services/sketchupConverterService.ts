type SketchupConversionResult = {
  glb: Buffer;
  manifest: Record<string, unknown> | null;
  engine: string;
};

function converterUrl(): string {
  const raw = process.env["SKETCHUP_CONVERTER_URL"]?.trim();
  if (!raw) {
    throw new Error("SKETCHUP_CONVERTER_URL não configurado.");
  }
  return raw.replace(/\/$/, "");
}

function decodeBase64Glb(value: unknown): Buffer | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const buffer = Buffer.from(value, "base64");
    return buffer.length ? buffer : null;
  } catch {
    return null;
  }
}

export async function convertSketchupToGlb(input: {
  buffer: Buffer;
  originalName: string;
}): Promise<SketchupConversionResult> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.buffer)], { type: "application/octet-stream" }),
    input.originalName || "projeto.skp",
  );
  form.append("output", "glb");
  form.append("includeManifest", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${converterUrl()}/convert/sketchup`, {
      method: "POST",
      body: form,
      signal: controller.signal,
      headers: process.env["SKETCHUP_CONVERTER_TOKEN"]
        ? { Authorization: `Bearer ${process.env["SKETCHUP_CONVERTER_TOKEN"]}` }
        : undefined,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(`Conversor SketchUp retornou HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("model/gltf-binary") || contentType.includes("application/octet-stream")) {
      const glb = Buffer.from(await response.arrayBuffer());
      if (!glb.length) throw new Error("Conversor retornou GLB vazio.");
      return {
        glb,
        manifest: null,
        engine: response.headers.get("x-converter-engine") ?? "sketchup-converter",
      };
    }

    const payload = await response.json() as {
      glbBase64?: string;
      manifest?: Record<string, unknown>;
      engine?: string;
    };
    const glb = decodeBase64Glb(payload.glbBase64);
    if (!glb) throw new Error("Conversor não retornou glbBase64 válido.");

    return {
      glb,
      manifest: payload.manifest && typeof payload.manifest === "object" ? payload.manifest : null,
      engine: payload.engine?.trim() || "sketchup-converter",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Conversão do SketchUp excedeu 120 segundos.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
