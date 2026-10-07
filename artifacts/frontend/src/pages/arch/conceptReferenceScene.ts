type SceneAnalysis = { kind?: string };

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível carregar a foto-base para o render.");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto-base."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Formato inválido da foto-base."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareScenePhotoRender(input: {
  url: string;
  designReferenceImage: string;
  analysis?: SceneAnalysis;
}) {
  return {
    originalImage: await toDataUrl(input.url),
    designReferenceImage: input.designReferenceImage,
    renderView: input.analysis?.kind === "room" ? "interior" as const : "exterior" as const,
  };
}
