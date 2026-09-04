import { useEffect } from "react";

const MOBILE_BREAKPOINT = 820;

function findCurrentPoseLabel(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("p"));
  return candidates.find((element) => /^Foto\s+\d+\s+de\s+8$/i.test(element.textContent?.trim() ?? "")) ?? null;
}

function focusCamera() {
  const video = document.querySelector<HTMLVideoElement>("video[playsinline]");
  const camera = video?.parentElement;
  if (!camera) return;

  camera.style.scrollMarginTop = "12px";
  camera.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
}

/**
 * Mobile UX guard for the guided Dublê capture.
 *
 * The photo flow advances poses automatically. On small screens the user can be
 * scrolled down to the instruction/thumbnails card when the next pose starts,
 * leaving the live camera above the viewport. This observer detects each pose
 * transition ("Foto N de 8") and brings the live preview back into view.
 *
 * It deliberately does not alter capture state or Media Engine behavior.
 */
export default function VideoAvatarCaptureViewportGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth > MOBILE_BREAKPOINT) return;

    let lastPoseLabel = "";
    let animationFrame = 0;
    let delayedFocus = 0;

    const sync = () => {
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
