import { useEffect, useMemo, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const POST_LOGIN_PATH_KEY = "vendorai_post_login_path";

type CaptureIdentity = {
  id: string;
  status: string;
  metadata?: { captureSessionId?: string } | null;
};

type CaptureIdentityDetail = {
  voices?: Array<{ id: string; status: string; metadata?: Record<string, unknown> | null }>;
  consents?: Array<{ id: string; scope: string; status: string }>;
};

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function jsonBody(init?: RequestInit): Record<string, unknown> | null {
  if (typeof init?.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function jsonResponse(payload: unknown, status = 201) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "X-VendorAI-Capture-Idempotent": "1" },
  });
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function VideoAvatarCaptureTenantGate({ children }: { children: ReactNode }) {
  const { user, rawUser, logout, setTenantOverride } = useAuth();
  const captureContext = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      tenantId: params.get("tenant")?.trim() ?? "",
    };
  }, []);

  const targetTenantId = captureContext.tenantId;
  const currentTenantId = user?.tenantId ?? "";
  const isSuperAdmin = rawUser?.platformRole === "super_admin";
  const tenantMismatch = Boolean(targetTenantId && currentTenantId !== targetTenantId);

  useEffect(() => {
    if (!isSuperAdmin || !targetTenantId || currentTenantId === targetTenantId) return;
    // A captura precisa operar no tenant que originou o QR. Para super admin,
    // o override é suficiente porque as APIs do Media Engine aceitam esse contexto.
    setTenantOverride({ id: targetTenantId, name: "Captura do Dublê", vertical: "" });
  }, [isSuperAdmin, targetTenantId, currentTenantId, setTenantOverride]);

  useEffect(() => {
    if (!targetTenantId || tenantMismatch) return;

    // Mantém a finalização idempotente enquanto a captura móvel estiver aberta.
    // Se um upload falhar e o usuário tocar em Finalizar novamente, a mesma
    // identidade draft e o mesmo perfil de voz são reutilizados, em vez de
    // criar cartões duplicados na tela Pessoas & Vozes.
    const originalFetch = window.fetch.bind(window);

    const guardedFetch: typeof window.fetch = async (input, init = {}) => {
      const url = requestUrl(input);
      const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (!url || url.origin !== window.location.origin || method !== "POST") {
        return originalFetch(input, init);
      }

      const identityCreateMatch = url.pathname.match(/^\/api\/tenants\/([^/]+)\/media-engine\/identities$/);
      if (identityCreateMatch?.[1] === targetTenantId) {
        const body = jsonBody(init);
        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata as Record<string, unknown>
          : null;
        const captureSessionId = typeof metadata?.captureSessionId === "string" ? metadata.captureSessionId : "";
        if (captureSessionId) {
          const existingResponse = await originalFetch(`/api/tenants/${targetTenantId}/media-engine/identities`, { headers: authHeaders() });
          if (existingResponse.ok) {
            const data = await existingResponse.json().catch(() => ({})) as { identities?: CaptureIdentity[] };
            const existing = (data.identities ?? []).find((item) => item.metadata?.captureSessionId === captureSessionId && item.status !== "archived");
            if (existing?.status === "draft") {
              return jsonResponse({ identity: existing });
            }
            if (existing?.status === "active") {
              return jsonResponse({ error: "Esta sessão de captura já foi finalizada e está salva em Pessoas & Vozes." }, 409);
            }
          }
        }
      }

      const voiceCreateMatch = url.pathname.match(/^\/api\/tenants\/([^/]+)\/media-engine\/identities\/([^/]+)\/voices$/);
      if (voiceCreateMatch?.[1] === targetTenantId) {
        const body = jsonBody(init);
        const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata as Record<string, unknown>
          : null;
        const captureSessionId = typeof metadata?.captureSessionId === "string" ? metadata.captureSessionId : "";
        if (captureSessionId) {
          const detailResponse = await originalFetch(`/api/tenants/${targetTenantId}/media-engine/identities/${voiceCreateMatch[2]}`, { headers: authHeaders() });
          if (detailResponse.ok) {
            const detail = await detailResponse.json().catch(() => ({})) as CaptureIdentityDetail;
            const existingVoice = (detail.voices ?? []).find((voice) => voice.metadata?.captureSessionId === captureSessionId);
            if (existingVoice) return jsonResponse({ voiceProfile: existingVoice });
          }
        }
      }

      const consentCreateMatch = url.pathname.match(/^\/api\/tenants\/([^/]+)\/media-engine\/identities\/([^/]+)\/consents$/);
      if (consentCreateMatch?.[1] === targetTenantId) {
        const body = jsonBody(init);
        const scope = typeof body?.scope === "string" ? body.scope : "";
        if (scope) {
          const detailResponse = await originalFetch(`/api/tenants/${targetTenantId}/media-engine/identities/${consentCreateMatch[2]}`, { headers: authHeaders() });
          if (detailResponse.ok) {
            const detail = await detailResponse.json().catch(() => ({})) as CaptureIdentityDetail;
            const existingConsent = (detail.consents ?? []).find((consent) => consent.scope === scope && consent.status === "active");
            if (existingConsent) return jsonResponse({ consent: existingConsent });
          }
        }
      }

      return originalFetch(input, init);
    };

    window.fetch = guardedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [targetTenantId, tenantMismatch]);

  const switchAccount = () => {
    const returnPath = `${window.location.pathname}${window.location.search}`;
    sessionStorage.setItem(POST_LOGIN_PATH_KEY, returnPath);
    logout();
  };

  if (isSuperAdmin && targetTenantId && currentTenantId !== targetTenantId) {
    return (
      <div className="min-h-screen bg-[#f7f8fb] px-5 py-12 text-slate-950">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#ff4b12]"><ShieldCheck className="h-7 w-7" /></div>
          <h1 className="mt-5 text-xl font-bold">Confirmando empresa da captura…</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">O QR Code está vinculando esta sessão ao tenant que iniciou o Dublê.</p>
        </div>
      </div>
    );
  }

  if (tenantMismatch) {
    return (
      <div className="min-h-screen bg-[#f7f8fb] px-5 py-10 text-slate-950">
        <div className="mx-auto max-w-md rounded-3xl border border-orange-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#ff4b12]"><AlertTriangle className="h-7 w-7" /></div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Esta captura pertence a outra empresa</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Para impedir que fotos, voz e vídeo sejam salvos no cliente errado, o VendorAI bloqueou a captura neste acesso.</p>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong className="text-slate-800">Conta atual:</strong> {user?.email ?? "conta autenticada"}</p>
            <p className="mt-1"><strong className="text-slate-800">Destino do QR:</strong> empresa que iniciou esta captura</p>
          </div>
          <button type="button" onClick={switchAccount} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] px-5 font-bold text-white"><LogIn className="h-4 w-4" /> Trocar conta e continuar</button>
          <button type="button" onClick={() => window.location.assign("/content-studio/video/avatar")} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" /> Cancelar</button>
          <p className="mt-5 text-center text-xs leading-5 text-slate-400">Nenhuma foto, áudio ou vídeo é enviado enquanto a empresa não corresponde ao QR Code.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
