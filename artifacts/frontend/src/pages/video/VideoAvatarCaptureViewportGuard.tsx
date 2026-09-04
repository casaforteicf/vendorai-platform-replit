import { useEffect } from "react";

const MOBILE_BREAKPOINT = 820;

function findCurrentPoseLabel(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("p"));
  return candidates.find((element) => /^Foto\s+\d+\s+de\s+8$/i.test(element.textContent?.trim() ?? "")) ?? null;
}

function findStepSubtitle(step: number): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("p"));
  return candidates.find((element) => new RegExp(`^Etapa\\s+${step}\\s+de\\s+6`, "i").test(element.textContent?.trim() ?? "")) ?? null;
}

function focusCamera() {
  const video = document.querySelector<HTMLVideoElement>("video[playsinline]");
  const camera = video?.parentElement;
  if (!camera) return;

  camera.style.scrollMarginTop = "12px";
  camera.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
}

function applyVideoMobileLayout() {
  if (!findStepSubtitle(4)) return;

  const video = document.querySelector<HTMLVideoElement>("video[playsinline]");
  const camera = video?.parentElement;
  if (!video || !camera) return;

  // No celular, a câmera precisa continuar visível enquanto a pessoa lê.
  // O preview fica mais baixo e a legenda é lida no card logo abaixo,
  // em vez de cobrir o rosto dentro do vídeo.
  video.style.aspectRatio = "4 / 3";
  video.style.height = "auto";
  video.style.maxHeight = "none";
  video.style.objectFit = "cover";
  video.style.objectPosition = "center 32%";

  const cameraChildren = Array.from(camera.children).filter((child): child is HTMLElement => child instanceof HTMLElement);

  const teleprompterOverlay = cameraChildren.find((child) =>
    child.className.includes("bottom-4") && child.className.includes("absolute") && /\d+\s+de\s+6/i.test(child.textContent ?? ""),
  );
  if (teleprompterOverlay) teleprompterOverlay.style.display = "none";

  const cueOverlay = cameraChildren.find((child) => child.className.includes("left-3") && child.className.includes("top-3"));
  if (cueOverlay) {
    cueOverlay.style.maxWidth = "58%";
    cueOverlay.style.padding = "9px 11px";
    cueOverlay.style.fontSize = "12px";
    cueOverlay.style.lineHeight = "1.35";
  }

  const statusOverlay = cameraChildren.find((child) => child.className.includes("right-3") && child.className.includes("top-3"));
  if (statusOverlay) {
    statusOverlay.style.padding = "9px 11px";
    statusOverlay.style.fontSize = "12px";
  }

  const captionCard = camera.nextElementSibling instanceof HTMLElement ? camera.nextElementSibling : null;
  if (captionCard?.textContent?.includes("Trecho do roteiro atual")) {
    captionCard.style.marginTop = "12px";
    captionCard.style.padding = "16px";

    const script = Array.from(captionCard.querySelectorAll<HTMLElement>("p")).find((element) =>
      element.className.includes("text-lg") && !element.textContent?.includes("A legenda é apenas guia"),
    );
    if (script) {
      script.style.fontSize = "18px";
      script.style.lineHeight = "1.55";
      script.style.fontWeight = "500";
    }
  }
}

/**
 * Mobile UX guard for the guided Dublê capture.
 *
 * - Fotos: ao avançar de pose, traz o preview da câmera de volta para a viewport.
 * - Vídeo: remove o teleprompter que cobria o rosto e usa o roteiro logo abaixo
 *   da câmera como legenda de leitura, mantendo o preview visível.
 *
 * Não altera captura, Media Engine, arquivos ou consentimentos.
 */
export default function VideoAvatarCaptureViewportGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth > MOBILE_BREAKPOINT) return;

    let lastPoseLabel = "";
    let animationFrame = 0;
    let delayedFocus = 0;

    const sync = () => {
      applyVideoMobileLayout();

      const labelElement = findCurrentPoseLabel();
      const label = labelElement?.textContent?.trim() ?? "";
      if (!label || label === lastPoseLabel) return;

      lastPoseLabel = label;
      window.clearTimeout(delayedFocus);
      delayedFocus = window.setTimeout(() => focusCamera(), 120);
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    const initialTimer = window.setTimeout(sync, 350);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(delayedFocus);
      window.clearTimeout(initialTimer);
    };
  }, []);

  return null;
}
