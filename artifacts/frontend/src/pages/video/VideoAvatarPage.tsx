import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  FileAudio,
  ImagePlus,
  Loader2,
  Mic2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import TalkingVideoPanel from "@/components/video/TalkingVideoPanel";

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";

type MediaIdentity = {
  id: string;
  display_name: string;
  kind: "person" | "persona";
  status: string;
  face_reference_asset_id?: string | null;
  voice_profile_count?: number;
  active_consent_count?: number;
};

type VoiceProfile = {
  id: string;
  name: string;
  status: string;
  reference_asset_id?: string | null;
};

type Consent = {
  id: string;
  scope: ConsentScope;
  status: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type IdentityDetail = {
  identity: MediaIdentity;
  voices: VoiceProfile[];
  consents: Consent[];
};

type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
};

const CONSENT_OPTIONS: Array<{ scope: ConsentScope; label: string; description: string }> = [
  { scope: "face_use", label: "Uso de rosto/imagem", description: "Autoriza usar a referência visual desta pessoa." },
  { scope: "voice_use", label: "Uso de voz", description: "Autoriza usar o áudio de referência para síntese de voz." },
  { scope: "ai_generation", label: "Geração com IA", description: "Autoriza criar novos materiais sintéticos com esta identidade." },
  { scope: "organic_publish", label: "Publicação orgânica", description: "Autoriza publicação em canais conectados sem mídia paga." },
  { scope: "paid_ads", label: "Anúncios pagos", description: "Autoriza uso desta identidade em conteúdo patrocinado." },
];

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(Boolean(init?.body && !(init.body instanceof FormData))), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

export default function VideoAvatarPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const faceInput = useRef<HTMLInputElement>(null);
  const voiceInput = useRef<HTMLInputElement>(null);

  const [identities, setIdentities] = useState<MediaIdentity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IdentityDetail | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<"person" | "persona">("person");
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [consents, setConsents] = useState<Record<ConsentScope, boolean>>({
    face_use: true,
    voice_use: true,
    ai_generation: true,
    organic_publish: false,
    paid_ads: false,
  });
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [testText, setTestText] = useState("Olá! Esta é uma amostra da minha voz autorizada no VendorAI.");
  const [testingVoice, setTestingVoice] = useState(false);
  const [testAudioUrl, setTestAudioUrl] = useState("");

  const activeConsentScopes = useMemo(() => {
    const now = Date.now();
    return new Set(
      (detail?.consents ?? [])
        .filter((item) => item.status === "active" && !item.revoked_at && (!item.expires_at || new Date(item.expires_at).getTime() > now))
        .map((item) => item.scope),
    );
  }, [detail]);

  const voiceEngineReady = capabilities?.capabilities?.voice_synthesize === "ready";
  const lipSyncEngineReady = capabilities?.capabilities?.avatar_lipsync === "ready";

  const loadIdentity = async (identityId: string) => {
    if (!tenantId) return;
    const data = await apiJson<IdentityDetail>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`);
    setDetail(data);
    setSelectedId(identityId);
  };

  const loadAll = async (keepSelection = true) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [identityData, capabilityData] = await Promise.all([
        apiJson<{ identities: MediaIdentity[] }>(`/api/tenants/${tenantId}/media-engine/identities`),
        apiJson<Capabilities>(`/api/tenants/${tenantId}/media-engine/capabilities`),
      ]);
      setIdentities(identityData.identities ?? []);
      setCapabilities(capabilityData);
      const nextId = keepSelection && selectedId
        ? selectedId
        : identityData.identities?.[0]?.id ?? null;
      if (nextId) await loadIdentity(nextId);
      else {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error) {
      toast({ title: "Não foi possível carregar Pessoas & Vozes", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const uploadReference = async (file: File, type: "image" | "audio", role: "reference" | "voice") => {
    const request = await apiJson<{ uploadURL: string; objectPath: string }>(`/api/tenants/${tenantId}/media/assets/request-upload`, {
      method: "POST",
      body: JSON.stringify({ name: file.name, contentType: file.type || (type === "audio" ? "audio/wav" : "image/jpeg"), type, size: file.size }),
    });

    const upload = await fetch(request.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!upload.ok) throw new Error("Falha ao enviar arquivo para a Biblioteca Audiovisual");

    const registered = await apiJson<{ asset: { id: string } }>(`/api/tenants/${tenantId}/media/assets`, {
      method: "POST",
      body: JSON.stringify({
        type,
        role,
        source: "upload",
        storageUrl: request.objectPath,
        originalFilename: file.name,
        mimeType: file.type || null,
        fileSize: file.size,
        metadata: { usage: role === "voice" ? "authorized_voice_reference" : "authorized_face_reference" },
      }),
    });
    return registered.asset.id;
  };

  const resetCreate = () => {
    setDisplayName("");
    setKind("person");
    setFaceFile(null);
    setVoiceFile(null);
    setAuthorizationConfirmed(false);
    setConsents({ face_use: true, voice_use: true, ai_generation: true, organic_publish: false, paid_ads: false });
    if (faceInput.current) faceInput.current.value = "";
    if (voiceInput.current) voiceInput.current.value = "";
  };

  const createIdentity = async () => {
    if (!tenantId || !displayName.trim()) return;
    if (!authorizationConfirmed) {
      toast({ title: "Confirme a autorização", description: "O VendorAI só cadastra pessoa/voz quando você declara possuir autorização para os usos selecionados.", variant: "destructive" });
      return;
    }
    if (kind === "person" && !faceFile && !voiceFile) {
      toast({ title: "Adicione uma referência", description: "Envie uma foto ou um áudio autorizado para criar uma pessoa real.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const created = await apiJson<{ identity: MediaIdentity }>(`/api/tenants/${tenantId}/media-engine/identities`, {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim(), kind, metadata: { authorizationDeclaredInUi: true } }),
      });
      const identityId = created.identity.id;

      let faceAssetId: string | null = null;
      if (faceFile) {
        faceAssetId = await uploadReference(faceFile, "image", "reference");
        await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, {
          method: "PATCH",
          body: JSON.stringify({ faceReferenceAssetId: faceAssetId }),
        });
      }

      let voiceCreated = false;
      if (voiceFile) {
        const voiceAssetId = await uploadReference(voiceFile, "audio", "voice");
        const voice = await apiJson<{ voiceProfile: VoiceProfile }>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices`, {
          method: "POST",
          body: JSON.stringify({
            name: `${displayName.trim()} — voz principal`,
            referenceAssetId: voiceAssetId,
            metadata: { authorizedReference: true },
          }),
        });
        await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${voice.voiceProfile.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "ready" }),
        });
        voiceCreated = true;
      }

      for (const option of CONSENT_OPTIONS) {
        if (!consents[option.scope]) continue;
        await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/consents`, {
          method: "POST",
          body: JSON.stringify({
            scope: option.scope,
            consentVersion: "1",
            metadata: { source: "content_studio", declaredByAuthenticatedUser: true },
          }),
        });
      }

      await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });

      toast({
        title: "Pessoa/Persona cadastrada",
        description: voiceCreated ? "Identidade, voz e autorizações foram salvas." : "Identidade e autorizações foram salvas.",
      });
      resetCreate();
      setShowCreate(false);
      setSelectedId(identityId);
      await loadAll(true);
      await loadIdentity(identityId);
    } catch (error) {
      toast({ title: "Não foi possível concluir o cadastro", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testVoice = async () => {
    const voice = detail?.voices.find((item) => item.status === "ready");
    if (!detail || !voice || !testText.trim()) return;
    setTestingVoice(true);
    setTestAudioUrl("");
    try {
      const data = await apiJson<{ audioUrl: string }>(
        `/api/tenants/${tenantId}/media-engine/identities/${detail.identity.id}/voices/${voice.id}/synthesize`,
        { method: "POST", body: JSON.stringify({ text: testText.trim(), language: "pt-br", title: `Teste de voz — ${detail.identity.display_name}` }) },
      );
      setTestAudioUrl(data.audioUrl);
      toast({ title: "Amostra de voz gerada", description: "O áudio foi salvo também na Biblioteca Audiovisual." });
    } catch (error) {
      toast({ title: "Não foi possível gerar a amostra", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setTestingVoice(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button onClick={() => navigate("/content-studio/video")} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-3">
              <ArrowLeft className="h-4 w-4" /> Voltar para Vídeo com IA
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-purple-500/20 text-purple-300"><UserRound className="h-6 w-6" /></div>
              <div>
                <h1 className="text-xl font-bold">Pessoas & Vozes autorizadas</h1>
                <p className="text-sm text-gray-400">Cadastre identidades reais ou personas para o VendorAI Media Engine.</p>
              </div>
            </div>
          </div>
          <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Nova pessoa/persona
          </button>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex gap-3 text-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-200">Identidade protegida por consentimento</p>
            <p className="text-xs text-gray-400 mt-0.5">Rosto, voz, geração por IA, publicação orgânica e anúncios são autorizações independentes. Revogar uma autorização bloqueia novos usos daquele escopo.</p>
          </div>
        </div>

        {showCreate && (
          <section className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-5">
            <div>
              <h2 className="font-bold text-white">Cadastrar identidade audiovisual</h2>
              <p className="text-xs text-gray-400 mt-1">Use apenas materiais próprios ou de pessoas que autorizaram explicitamente o uso.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-gray-300">Nome da pessoa/persona</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Marcos — Comercial" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-purple-500/50" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-gray-300">Tipo</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as "person" | "persona")} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-purple-500/50">
                  <option value="person">Pessoa real autorizada</option>
                  <option value="persona">Persona da marca</option>
                </select>
              </label>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <button type="button" onClick={() => faceInput.current?.click()} className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-left hover:border-purple-500/40 transition-colors">
                <ImagePlus className="h-5 w-5 text-purple-300 mb-2" />
                <p className="text-sm font-semibold">Foto de referência</p>
                <p className="text-xs text-gray-500 mt-1 truncate">{faceFile?.name ?? "JPG, PNG ou WebP da pessoa autorizada"}</p>
                <input ref={faceInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setFaceFile(event.target.files?.[0] ?? null)} />
              </button>
              <button type="button" onClick={() => voiceInput.current?.click()} className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-left hover:border-cyan-500/40 transition-colors">
                <FileAudio className="h-5 w-5 text-cyan-300 mb-2" />
                <p className="text-sm font-semibold">Áudio de referência da voz</p>
                <p className="text-xs text-gray-500 mt-1 truncate">{voiceFile?.name ?? "WAV, MP3, M4A ou áudio limpo da pessoa"}</p>
                <input ref={voiceInput} type="file" accept="audio/*" className="hidden" onChange={(event) => setVoiceFile(event.target.files?.[0] ?? null)} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Autorizações de uso</p>
              <div className="grid md:grid-cols-2 gap-2">
                {CONSENT_OPTIONS.map((option) => (
                  <label key={option.scope} className={cn("flex gap-3 rounded-xl border p-3 cursor-pointer", consents[option.scope] ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]")}>
                    <input type="checkbox" checked={consents[option.scope]} onChange={() => setConsents((current) => ({ ...current, [option.scope]: !current[option.scope] }))} className="mt-1 accent-emerald-500" />
                    <span><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-gray-500 mt-0.5">{option.description}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <label className={cn("flex gap-3 rounded-xl border p-4 cursor-pointer", authorizationConfirmed ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/5")}>
              <input type="checkbox" checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} className="mt-1 accent-emerald-500" />
              <span>
                <span className="block text-sm font-semibold">Declaro que possuo autorização para os usos selecionados</span>
                <span className="block text-xs text-gray-400 mt-1">Esta confirmação não substitui documentos legais necessários ao seu caso. Ela registra no VendorAI quem cadastrou e quais finalidades foram autorizadas.</span>
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => { resetCreate(); setShowCreate(false); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300">Cancelar</button>
              <button disabled={saving || !displayName.trim()} onClick={() => void createIdentity()} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Salvar identidade autorizada
              </button>
            </div>
          </section>
        )}

        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2 min-h-[420px]">
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Identidades</p>
              <button onClick={() => void loadAll(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400" aria-label="Atualizar"><RefreshCw className="h-3.5 w-3.5" /></button>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-purple-400" /></div>
            ) : identities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-gray-500">Nenhuma pessoa/persona cadastrada ainda.</div>
            ) : identities.map((identity) => (
              <button key={identity.id} onClick={() => void loadIdentity(identity.id)} className={cn("w-full rounded-xl border p-3 text-left transition-colors", selectedId === identity.id ? "border-purple-500/40 bg-purple-500/10" : "border-white/5 bg-black/10 hover:border-white/15")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{identity.display_name}</p>
                  <span className={cn("text-[10px] rounded-full px-2 py-0.5", identity.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-500/15 text-gray-300")}>{identity.status === "active" ? "Ativa" : identity.status}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">{identity.kind === "person" ? "Pessoa real" : "Persona"} · {Number(identity.voice_profile_count ?? 0)} voz(es) · {Number(identity.active_consent_count ?? 0)} autorizações</p>
              </button>
            ))}
          </aside>

          <main className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 min-h-[420px]">
            {!detail ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center">
                <UserRound className="h-9 w-9 text-gray-600 mb-3" />
                <p className="text-sm font-semibold text-gray-300">Selecione ou cadastre uma identidade</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">Aqui ficam foto, voz e permissões que poderão ser usadas para criação audiovisual.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><h2 className="text-lg font-bold">{detail.identity.display_name}</h2><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>
                    <p className="text-xs text-gray-500 mt-1">{detail.identity.kind === "person" ? "Pessoa real autorizada" : "Persona da marca"} · Provider oficial: VendorAI</p>
                  </div>
                  <div className={cn("rounded-lg border px-3 py-2 text-xs", voiceEngineReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>
                    {voiceEngineReady ? "Motor de voz conectado" : "Motor de voz aguardando GPU/configuração"}
                  </div>
                </div>

                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Autorizações ativas</p>
                  <div className="flex flex-wrap gap-2">
                    {CONSENT_OPTIONS.map((option) => (
                      <span key={option.scope} className={cn("rounded-full border px-2.5 py-1 text-[11px]", activeConsentScopes.has(option.scope) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.02] text-gray-500")}>
                        {activeConsentScopes.has(option.scope) ? "✓ " : "— "}{option.label}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-3">
                  <div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Perfis de voz</p></div>
                  {detail.voices.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhum áudio de referência foi cadastrado para esta identidade.</p>
                  ) : detail.voices.map((voice) => (
                    <div key={voice.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                      <div><p className="text-sm">{voice.name}</p><p className="text-[11px] text-gray-500">{voice.reference_asset_id ? "Áudio de referência salvo na Biblioteca" : "Sem referência de áudio"}</p></div>
                      <span className={cn("text-[10px] rounded-full px-2 py-0.5", voice.status === "ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-500/15 text-gray-300")}>{voice.status === "ready" ? "Pronta" : voice.status}</span>
                    </div>
                  ))}
                </section>

                <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Testar voz autorizada</p></div><p className="text-[11px] text-gray-500 mt-1">Exige perfil de voz pronto + autorizações de voz e geração IA.</p></div>
                    {!voiceEngineReady && <span className="text-[10px] text-amber-300">Disponível após conectar GPU</span>}
                  </div>
                  <textarea value={testText} onChange={(event) => setTestText(event.target.value)} rows={3} maxLength={5000} className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-500/40" />
                  <div className="flex flex-wrap items-center gap-3">
                    <button disabled={!voiceEngineReady || testingVoice || !detail.voices.some((voice) => voice.status === "ready") || !activeConsentScopes.has("voice_use") || !activeConsentScopes.has("ai_generation")} onClick={() => void testVoice()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">
                      {testingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar amostra
                    </button>
                    {testAudioUrl && <audio controls src={testAudioUrl} className="h-8 max-w-full" />}
                  </div>
                </section>

                <TalkingVideoPanel
                  tenantId={tenantId}
                  identityId={detail.identity.id}
                  identityName={detail.identity.display_name}
                  faceReferenceAssetId={detail.identity.face_reference_asset_id}
                  voices={detail.voices}
                  activeConsentScopes={activeConsentScopes}
                  voiceEngineReady={voiceEngineReady}
                  lipSyncEngineReady={lipSyncEngineReady}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
