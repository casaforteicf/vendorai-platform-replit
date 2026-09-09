import {
  jarvisPermissionEnabled,
  requestMicrophonePermission,
  updateJarvisPermission,
} from "./jarvisPermissions";

const JARVIS_PANEL_SELECTOR = 'div[aria-label="JARVIS"]';
const JARVIS_LAUNCHER_SELECTOR = 'button[aria-label="Abrir JARVIS"]';
const HANDS_FREE_SESSION_KEY = "jarvis_web_hands_free_session";

let permissionRequest: Promise<void> | null = null;

function findMicButton() {
  const panel = document.querySelector<HTMLElement>(JARVIS_PANEL_SELECTOR);
  if (!panel) return null;
  return Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.getAttribute("title") === "Falar com JARVIS") ?? null;
}

function startMicWhenPanelIsReady(attempt = 0) {
  const mic = findMicButton();
  if (mic && !mic.disabled) {
    if (jarvisPermissionEnabled("handsFree")) {
      try {
        sessionStorage.setItem(HANDS_FREE_SESSION_KEY, "1");
      } catch {
        // Sessão mãos livres é uma melhoria; falha de storage não deve bloquear voz.
      }
    }
    try {
      mic.click();
    } catch {
      // Alguns WebViews podem exigir outro gesto; o botão continuará disponível.
    }
    return;
  }

  if (attempt >= 24) return;
  window.setTimeout(() => startMicWhenPanelIsReady(attempt + 1), 80);
}

async function requestAndStartVoice() {
  const state = await requestMicrophonePermission();
  updateJarvisPermission("microphone", state === "granted");
  if (state !== "granted") return;
  startMicWhenPanelIsReady();
}

function installJarvisLauncherVoiceBridge() {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    const launcher = target?.closest?.(JARVIS_LAUNCHER_SELECTOR) as HTMLButtonElement | null;
    if (!launcher || launcher.disabled) return;

    // Se o painel já está aberto, o mesmo botão serve para fechar; não solicite voz novamente.
    if (document.querySelector(JARVIS_PANEL_SELECTOR)) return;

    // O pedido começa no gesto real do usuário para que Android/Chrome possam exibir a permissão.
    permissionRequest = requestAndStartVoice().finally(() => {
      permissionRequest = null;
    });
  }, true);

  // Fallback para navegadores que não disparam pointerdown como esperado.
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const launcher = target?.closest?.(JARVIS_LAUNCHER_SELECTOR) as HTMLButtonElement | null;
    if (!launcher || launcher.disabled || permissionRequest) return;
    if (!document.querySelector(JARVIS_PANEL_SELECTOR)) return;

    if (jarvisPermissionEnabled("microphone")) {
      startMicWhenPanelIsReady();
    }
  }, true);
}

if (typeof window !== "undefined") {
  installJarvisLauncherVoiceBridge();
}

export {};
