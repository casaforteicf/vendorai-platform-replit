import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleStop, Globe2, Loader2, Mic2, Plus, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type MarketCode = "BR" | "PY" | "AR" | "UY" | "BO";
type CaptureMethod = "recorded" | "upload" | null;

export type MultilingualVoiceProfile = {
  id: string;
  name: string;
  status: string;
  reference_asset_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MarketDefinition = {
  code: MarketCode;
  name: string;
  locale: string;
  currency: string;
  scriptVersion: string;
  script: string[];
};

type Props = {
  tenantId: string;
  identityId: string;
  identityName: string;
  voices: MultilingualVoiceProfile[];
  voiceUseAuthorized: boolean;
  onVoiceAdded: (voice: MultilingualVoiceProfile) => void;
};

const PT_BR = [
  "Olá, meu nome é [NOME]. Esta é uma amostra adicional da minha voz em português do Brasil.",
  "Vou falar de forma natural, com o mesmo ritmo que uso em uma conversa normal.",
  "Quando explico alguma coisa, gosto de ser claro, objetivo e transmitir confiança.",
  "Também existem momentos em que preciso falar com mais energia. Essa é uma ótima oportunidade e pode trazer um excelente resultado!",
  "Agora vou fazer uma pergunta: você já imaginou uma forma mais simples de resolver isso?",
  "Podemos conversar hoje, amanhã pela manhã ou sexta-feira à tarde.",
  "Perfeito. Esta gravação representa minha maneira natural de falar em português.",
];

const ES_VOSEO = [
  "Hola, mi nombre es [NOME]. Esta es una muestra adicional de mi voz en español.",
  "Voy a hablar de forma natural, con el mismo ritmo que uso en una conversación normal.",
  "Cuando explico algo, me gusta ser claro, directo y transmitir confianza.",
  "También hay momentos en los que necesito hablar con más energía. ¡Esta es una gran oportunidad y puede generar un excelente resultado!",
  "Ahora voy a hacer una pregunta: ¿alguna vez imaginaste una forma más simple de resolver esto?",
  "Podemos hablar hoy, mañana por la mañana o el viernes por la tarde.",
  "Perfecto. Esta grabación representa mi manera natural de hablar en español.",
];

const ES_NEUTRAL = [
  "Hola, mi nombre es [NOME]. Esta es una muestra adicional de mi voz en español.",
  "Voy a hablar de forma natural, con el mismo ritmo que uso en una conversación normal.",
  "Cuando explico algo, me gusta ser claro, objetivo y transmitir confianza.",
  "También hay momentos en los que necesito hablar con más energía. ¡Esta es una gran oportunidad y puede generar un excelente resultado!",
  "Ahora voy a hacer una pregunta: ¿ha imaginado una forma más simple de resolver esto?",
  "Podemos hablar hoy, mañana por la mañana o el viernes por la tarde.",
  "Perfecto. Esta grabación representa mi manera natural de hablar en español.",
];

const MARKETS: Record<MarketCode, MarketDefinition> = {
  BR: { code: "BR", name: "Brasil", locale: "pt-BR", currency: "BRL", scriptVersion: "pt-BR-voice-extra-v1", script: PT_BR },
  PY: { code: "PY", name: "Paraguai", locale: "es-PY", currency: "PYG", scriptVersion: "es-PY-voice-extra-v1", script: ES_VOSEO },
  AR: { code: "AR", name: "Argentina", locale: "es-AR", currency: "ARS", scriptVersion: "es-AR-voice-extra-v1", script: ES_VOSEO },
  UY: { code: "UY", name: "Uruguai", locale: "es-UY", currency: "UYU", scriptVersion: "es-UY-voice-extra-v1", script: ES_VOSEO },
  BO: { code: "BO", name: "Bolívia", locale: "es-BO", currency: "BOB", scriptVersion: "es-BO-voice-extra-v1", script: ES_NEUTRAL },
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(Boolean(init?.body && !(init.body instanceof FormData))), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

function metadataLocale(voice: MultilingualVoiceProfile): string | null {
  const value = voice.metadata?.locale;
  return typeof value === "string" && value.trim() ? value : null;
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

async function mediaDuration(file: File): Promise<number | null> {
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const finish = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

export default function MultilingualVoicePanel({ tenantId, identityId, identityName, voices, voiceUseAuthorized, onVoiceAdded }: Props) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<MarketCode>("PY");
  const [file, setFile] = useState<File | null>(null);
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  const selected = MARKETS[market];
  const locales = useMemo(() => new Set(voices.map(metadataLocale).filter((value): value is string => Boolean(value))), [voices]);
  const hasExactLocale = locales.has(selected.locale);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const reset = () => {
    setFile(null);
    setCaptureMethod(null);
    setDuration(null);
    setElapsed(0);
    if (fileInput.current) fileInput.current.value = "";
  };

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setCaptureMethod(next ? "upload" : null);
    setDuration(next ? await mediaDuration(next) : null);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Gravação não suportada", description: "Envie um arquivo de áudio ou use um navegador com acesso ao microfone.", variant: "destructive" });
      return;
    }
    try {
      const inputStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      stream.current = inputStream;
      chunks.current = [];
      const mediaRecorder = new MediaRecorder(inputStream);
      recorder.current = mediaRecorder;
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        const next = new File(chunks.current, `voz-${selected.locale.toLowerCase()}-${Date.now()}.webm`, { type: mediaRecorder.mimeType || "audio/webm" });
        setFile(next);
        setCaptureMethod("recorded");
        setDuration(seconds);
        setElapsed(seconds);
        setRecording(false);
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
      };
      mediaRecorder.start(500);
    } catch (error) {
      toast({ title: "Não foi possível acessar o microfone", description: error instanceof Error ? error.message : "Verifique a permissão do navegador.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const save = async () => {
    if (!file || !voiceUseAuthorized) return;
    setSaving(true);
    try {
      const uploadRequest = await apiJson<{ uploadURL: string; objectPath: string }>(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        body: JSON.stringify({ name: file.name, contentType: file.type || "audio/webm", type: "audio", size: file.size }),
      });
      const upload = await fetch(uploadRequest.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!upload.ok) throw new Error("Falha ao enviar a voz para a Biblioteca Audiovisual");

      const asset = await apiJson<{ asset: { id: string } }>(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        body: JSON.stringify({
          type: "audio",
          role: "voice",
          source: "upload",
          storageUrl: uploadRequest.objectPath,
          originalFilename: file.name,
          mimeType: file.type || null,
          fileSize: file.size,
          metadata: { usage: "authorized_multilingual_voice_reference", market: selected.code, country: selected.code, region: "MERCOSUL", locale: selected.locale, currency: selected.currency },
        }),
      });

      const created = await apiJson<{ voiceProfile: MultilingualVoiceProfile }>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices`, {
        method: "POST",
        body: JSON.stringify({
          name: `${identityName} — ${selected.name} (${selected.locale})`,
          referenceAssetId: asset.asset.id,
          metadata: {
            authorizedReference: true,
            multilingual: true,
            primary: false,
            market: selected.code,
            country: selected.code,
            region: "MERCOSUL",
            locale: selected.locale,
            currency: selected.currency,
            captureMethod,
            durationSeconds: duration,
            scriptVersion: selected.scriptVersion,
            qualityAnalysisStatus: "pending",
          },
        }),
      });
      const ready = await apiJson<{ voiceProfile: MultilingualVoiceProfile }>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${created.voiceProfile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ready" }),
      });
      onVoiceAdded(ready.voiceProfile);
      toast({ title: "Voz adicional cadastrada", description: `${selected.name} · ${selected.locale} agora está disponível para esta Identidade Audiovisual.` });
      reset();
      setOpen(false);
    } catch (error) {
      toast({ title: "Não foi possível cadastrar a voz", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Vozes por idioma · Mercosul</p></div>
          <p className="text-[11px] text-gray-500 mt-1">A mesma pessoa pode manter referências próprias em português e espanhol. O rosto e o Dublê não precisam ser recriados.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100"><Plus className="h-3.5 w-3.5" /> Adicionar idioma</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {voices.length === 0 ? <span className="text-[11px] text-gray-500">Nenhum perfil de voz cadastrado.</span> : voices.filter((voice) => voice.status !== "archived").map((voice) => {
          const locale = metadataLocale(voice) ?? "locale não informado";
          return <span key={voice.id} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", voice.status === "ready" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-gray-400")}>{voice.status === "ready" && <CheckCircle2 className="h-3 w-3" />}{locale}</span>;
        })}
      </div>

      {open && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium text-gray-300">Novo perfil de voz</span><select value={market} disabled={recording} onChange={(event) => { setMarket(event.target.value as MarketCode); reset(); }} className="w-full rounded-lg border border-white/10 bg-[#171126] px-3 py-2 text-xs outline-none focus:border-cyan-500/50">{Object.values(MARKETS).map((item) => <option key={item.code} value={item.code}>{item.name} · {item.locale}</option>)}</select></label>
            <div className="rounded-lg border border-white/10 p-3"><p className="text-[11px] text-gray-500">Status</p><p className={cn("text-xs font-medium mt-1", hasExactLocale ? "text-amber-200" : "text-emerald-200")}>{hasExactLocale ? `Já existe uma voz em ${selected.locale}; você pode adicionar uma nova versão.` : `Ainda não há referência em ${selected.locale}.`}</p></div>
          </div>

          <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3">
            <p className="text-xs font-semibold text-cyan-100">Roteiro curto · {selected.locale}</p>
            <p className="text-[10px] text-gray-500 mt-1">Grave aproximadamente 45–90 segundos. Fale no seu sotaque natural; não tente imitar outro país.</p>
            <div className="mt-3 max-h-40 overflow-y-auto space-y-2 pr-2">{selected.script.map((paragraph, index) => <p key={index} className="text-xs leading-5 text-gray-300">{paragraph.replace("[NOME]", identityName)}</p>)}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => recording ? stopRecording() : void startRecording()} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white", recording ? "bg-red-600 hover:bg-red-500" : "bg-cyan-600 hover:bg-cyan-500")}>{recording ? <CircleStop className="h-3.5 w-3.5" /> : <Mic2 className="h-3.5 w-3.5" />}{recording ? `Parar · ${formatDuration(elapsed)}` : "Gravar áudio"}</button>
            <button type="button" disabled={recording} onClick={() => fileInput.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-40"><Upload className="h-3.5 w-3.5" /> Enviar áudio</button>
          </div>
          <input ref={fileInput} type="file" accept="audio/*" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
          <p className="text-[11px] text-gray-500">{file ? `${file.name} · ${formatDuration(duration)}` : "Nenhum áudio selecionado"}</p>

          {!voiceUseAuthorized && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">A autorização “Uso de voz” precisa estar ativa para cadastrar outra referência.</div>}
          {duration !== null && (duration < 30 || duration > 150) && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">Duração fora da faixa ideal. Recomendado: 45–90 segundos.</div>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-400">Cancelar</button>
            <button type="button" disabled={!file || saving || recording || !voiceUseAuthorized} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}{saving ? "Salvando..." : `Salvar voz ${selected.locale}`}</button>
          </div>
        </div>
      )}
    </section>
  );
}
