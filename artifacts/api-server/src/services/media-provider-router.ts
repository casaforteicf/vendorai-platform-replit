export type MediaProvider = "openai" | "google-vertex" | "bfl" | "replicate" | "vendorai-worker";
export type MediaWorkload =
  | "image"
  | "render_preserve"
  | "render_create"
  | "render_fill"
  | "video_standard"
  | "video_cinema"
  | "audio"
  | "music";

export type MediaProviderRoute = {
  workload: MediaWorkload;
  primary: MediaProvider;
  fallbacks: MediaProvider[];
  reason: string;
};

function has(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export function mediaProviderAvailable(provider: MediaProvider, workload?: MediaWorkload): boolean {
  if (provider === "openai") return has("OPENAI_API_KEY") || has("OPENAI_API_KEY_ENCRYPTED");
  if (provider === "replicate") return has("REPLICATE_API_TOKEN");
  if (provider === "bfl") return has("BFL_API_KEY");
  if (provider === "google-vertex") {
    const project = has("GOOGLE_CLOUD_PROJECT");
    const output = has("VENDORAI_VERTEX_VIDEO_GCS_URI");
    const auth = has("GOOGLE_SERVICE_ACCOUNT_JSON") || has("GOOGLE_APPLICATION_CREDENTIALS");
    return project && output && auth;
  }
  if (provider === "vendorai-worker") {
    if (workload === "audio") return has("VENDORAI_MEDIA_WORKER_URL");
    if (workload === "music") return has("VENDORAI_MUSIC_WORKER_URL");
    return has("VENDORAI_MEDIA_WORKER_URL");
  }
  return false;
}

const ROUTES: Record<MediaWorkload, MediaProviderRoute> = {
  image: {
    workload: "image",
    primary: "openai",
    fallbacks: [],
    reason: "GPT Image permanece como motor principal de imagens gerais.",
  },
  render_preserve: {
    workload: "render_preserve",
    primary: "bfl",
    fallbacks: ["replicate"],
    reason: "BFL direto para FLUX e Replicate apenas como contingência.",
  },
  render_create: {
    workload: "render_create",
    primary: "bfl",
    fallbacks: ["replicate"],
    reason: "FLUX.2 Pro direto para criação arquitetônica; Replicate como fallback.",
  },
  render_fill: {
    workload: "render_fill",
    primary: "bfl",
    fallbacks: ["replicate"],
    reason: "BFL é o provedor preferencial do render; Fill pode cair no Replicate durante migração.",
  },
  video_standard: {
    workload: "video_standard",
    primary: "google-vertex",
    fallbacks: ["replicate"],
    reason: "Veo 3.1 Fast direto no Vertex AI; Replicate como fallback.",
  },
  video_cinema: {
    workload: "video_cinema",
    primary: "google-vertex",
    fallbacks: ["replicate"],
    reason: "Veo 3.1 direto no Vertex AI; Replicate como fallback.",
  },
  audio: {
    workload: "audio",
    primary: "vendorai-worker",
    fallbacks: [],
    reason: "Áudio continua abstraído pelo Vendor.ai Media Worker.",
  },
  music: {
    workload: "music",
    primary: "vendorai-worker",
    fallbacks: [],
    reason: "Música continua abstraída pelo Vendor.ai Media Worker.",
  },
};

export function mediaProviderRoute(workload: MediaWorkload): MediaProviderRoute {
  return ROUTES[workload];
}

export function resolveMediaProvider(workload: MediaWorkload): {
  provider: MediaProvider;
  route: MediaProviderRoute;
  fallbackUsed: boolean;
} {
  const route = ROUTES[workload];
  if (mediaProviderAvailable(route.primary, workload)) {
    return { provider: route.primary, route, fallbackUsed: false };
  }
  const fallback = route.fallbacks.find((provider) => mediaProviderAvailable(provider, workload));
  return {
    provider: fallback ?? route.primary,
    route,
    fallbackUsed: Boolean(fallback),
  };
}

export function mediaProviderStatus() {
  return Object.values(ROUTES).map((route) => {
    const resolved = resolveMediaProvider(route.workload);
    return {
      workload: route.workload,
      primary: route.primary,
      primaryReady: mediaProviderAvailable(route.primary, route.workload),
      activeProvider: resolved.provider,
      fallbackUsed: resolved.fallbackUsed,
      fallbacks: route.fallbacks.map((provider) => ({
        provider,
        ready: mediaProviderAvailable(provider, route.workload),
      })),
    };
  });
}
