export const JARVIS_PERMISSIONS_KEY = "vendorai_jarvis_permissions_v1";
export const JARVIS_PERMISSIONS_EVENT = "vendorai:jarvis-permissions-changed";

export type JarvisPermissions = {
  microphone: boolean;
  wakeWord: boolean;
  voiceReplies: boolean;
  handsFree: boolean;
  notifications: boolean;
  screenContext: boolean;
  attachments: boolean;
  proactiveAlerts: boolean;
  proactiveVoice: boolean;
  createOperationalTasks: boolean;
  editOperationalData: boolean;
  undoReversibleActions: boolean;
  alwaysConfirmSensitiveActions: true;
};

export const DEFAULT_JARVIS_PERMISSIONS: JarvisPermissions = {
  microphone: false,
  wakeWord: false,
  voiceReplies: true,
  handsFree: true,
  notifications: false,
  screenContext: true,
  attachments: true,
  proactiveAlerts: true,
  proactiveVoice: false,
  createOperationalTasks: true,
  editOperationalData: true,
  undoReversibleActions: true,
  alwaysConfirmSensitiveActions: true,
};

export const RECOMMENDED_JARVIS_PERMISSIONS: JarvisPermissions = {
  ...DEFAULT_JARVIS_PERMISSIONS,
  microphone: true,
  wakeWord: true,
  handsFree: true,
  proactiveVoice: true,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadJarvisPermissions(): JarvisPermissions {
  if (typeof window === "undefined") return DEFAULT_JARVIS_PERMISSIONS;
  try {
    const raw = localStorage.getItem(JARVIS_PERMISSIONS_KEY);
    if (!raw) return DEFAULT_JARVIS_PERMISSIONS;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return DEFAULT_JARVIS_PERMISSIONS;
    return {
      ...DEFAULT_JARVIS_PERMISSIONS,
      ...parsed,
      alwaysConfirmSensitiveActions: true,
    } as JarvisPermissions;
  } catch {
    return DEFAULT_JARVIS_PERMISSIONS;
  }
}

export function saveJarvisPermissions(next: JarvisPermissions) {
  if (typeof window === "undefined") return;
  const safe: JarvisPermissions = {
    ...next,
    alwaysConfirmSensitiveActions: true,
  };
  localStorage.setItem(JARVIS_PERMISSIONS_KEY, JSON.stringify(safe));

  // Compatibilidade com bridges existentes durante a migração para o centro único.
  localStorage.setItem("jarvis_voice_replies", safe.voiceReplies ? "on" : "off");
  if (!safe.proactiveVoice) {
    localStorage.setItem("jarvis_proactive_voice_muted_until", String(Number.MAX_SAFE_INTEGER));
  } else if (Number(localStorage.getItem("jarvis_proactive_voice_muted_until") ?? 0) === Number.MAX_SAFE_INTEGER) {
    localStorage.removeItem("jarvis_proactive_voice_muted_until");
  }
  if (!safe.handsFree) sessionStorage.removeItem("jarvis_web_hands_free_session");

  window.dispatchEvent(new CustomEvent(JARVIS_PERMISSIONS_EVENT, { detail: safe }));
}

export function updateJarvisPermission<K extends keyof JarvisPermissions>(
  key: K,
  value: JarvisPermissions[K],
) {
  const current = loadJarvisPermissions();
  const next = { ...current, [key]: value, alwaysConfirmSensitiveActions: true } as JarvisPermissions;
  saveJarvisPermissions(next);
  return next;
}

export function jarvisPermissionEnabled(key: keyof JarvisPermissions) {
  return loadJarvisPermissions()[key] === true;
}

export type DevicePermissionState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export async function getMicrophonePermissionState(): Promise<DevicePermissionState> {
  if (typeof navigator === "undefined") return "unsupported";
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state as DevicePermissionState;
  } catch {
    return typeof navigator.mediaDevices?.getUserMedia === "function" ? "prompt" : "unsupported";
  }
}

export async function requestMicrophonePermission(): Promise<DevicePermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    return "unknown";
  }
}

export function getNotificationPermissionState(): DevicePermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "prompt";
}

export async function requestNotificationPermission(): Promise<DevicePermissionState> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "prompt";
  } catch {
    return "unknown";
  }
}
