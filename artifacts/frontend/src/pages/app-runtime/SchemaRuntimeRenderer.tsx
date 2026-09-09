import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Info, LayoutGrid, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

type JsonObject = Record<string, unknown>;

export type RuntimePayload = {
  runtimeVersion: number;
  publishedVersionId: string;
  publishedVersion: number;
  publishedAt?: string | null;
  app: {
    id: string;
    name: string;
    slug: string;
    theme?: JsonObject;
    whiteLabel?: JsonObject;
    navigation?: Array<{ id: string; label: string; pageId: string; icon?: string }>;
  };
  template: { versionId: string; version: number };
  runtime: {
    version: number;
    defaultPageId?: string | null;
    pages: RuntimePage[];
  };
};

export type RuntimeActionClient = {
  appId: string;
  token: string;
  onSuccess?: () => void;
  simulate?: boolean;
};

type RuntimePage = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  blocks: RuntimeBlock[];
};

type RuntimeBlock = {
  id: string;
  type: "hero" | "text" | "callout" | "metrics" | "list" | "cards" | "divider" | "action_form";
  props: JsonObject;
};

type Props = {
  payload: RuntimePayload;
  lang: "pt" | "es";
  actionClient?: RuntimeActionClient;
};

const COPY = {
  pt: {
    empty: "Nenhum conteúdo foi publicado para este perfil.",
    navigation: "Navegação",
    actionPreview: "Prévia interativa: validação concluída sem executar efeitos reais.",
    actionSending: "Enviando...",
    actionInvalid: "Revise os campos e tente novamente.",
    actionForbidden: "Seu perfil não tem permissão para executar esta ação.",
    actionError: "Não foi possível concluir esta ação.",
  },
  es: {
    empty: "No hay contenido publicado para este perfil.",
    navigation: "Navegación",
    actionPreview: "Vista previa interactiva: validación completada sin ejecutar efectos reales.",
    actionSending: "Enviando...",
    actionInvalid: "Revisa los campos e inténtalo de nuevo.",
    actionForbidden: "Tu perfil no tiene permiso para ejecutar esta acción.",
    actionError: "No fue posible completar esta acción.",
  },
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function sessionStorageKey(appId: string) {
  return `vendorai:app-user-session:${appId}`;
}

function toneClasses(tone: unknown) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-950";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-slate-200 bg-slate-50 text-slate-950";
}

function ToneIcon({ tone }: { tone: unknown }) {
  if (tone === "success") return <CheckCircle2 className="h-5 w-5" />;
  if (tone === "warning") return <TriangleAlert className="h-5 w-5" />;
  if (tone === "danger") return <AlertCircle className="h-5 w-5" />;
  return <Info className="h-5 w-5" />;
}

function ActionFormBlock({ block, lang, actionClient }: { block: RuntimeBlock; lang: "pt" | "es"; actionClient?: RuntimeActionClient }) {
  const copy = COPY[lang];
  const props = block.props ?? {};
  const fields = objectArray(props.fields);
  const actionKey = stringValue(props.actionKey) ?? "";
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionClient || !actionKey) {
      setSuccess(false);
      setMessage(copy.actionPreview);
      return;
    }

    const input: Record<string, unknown> = {};
    for (const field of fields) {
      const name = stringValue(field.name);
      const type = stringValue(field.type) ?? "text";
      if (!name) continue;
      if (type === "checkbox") {
        input[name] = values[name] === true;
        continue;
      }
      const raw = typeof values[name] === "string" ? String(values[name]).trim() : "";
      if (!raw) continue;
      if (type === "number") {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          setSuccess(false);
          setMessage(copy.actionInvalid);
          return;
        }
        input[name] = numeric;
      } else {
        input[name] = raw;
      }
    }

    const minProperties = typeof props.minProperties === "number" ? Math.max(0, Math.floor(props.minProperties)) : 0;
    if (Object.keys(input).length < minProperties) {
      setSuccess(false);
      setMessage(copy.actionInvalid);
      return;
    }

    setBusy(true);
    setMessage(null);
    setSuccess(false);
    try {
      if (actionClient.simulate) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        setSuccess(true);
        setMessage(stringValue(props.successMessage) ?? copy.actionPreview);
        actionClient.onSuccess?.();
        return;
      }

      const response = await fetch(
        `/api/app-runtime/apps/${encodeURIComponent(actionClient.appId)}/actions/${encodeURIComponent(actionKey)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${actionClient.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ input }),
        },
      );
      if (!response.ok) {
        if (response.status === 403) throw new Error("forbidden");
        if (response.status === 422) throw new Error("invalid");
        throw new Error("failed");
      }
      setSuccess(true);
      setMessage(stringValue(props.successMessage) ?? (lang === "pt" ? "Ação concluída com sucesso." : "Acción completada con éxito."));
      actionClient.onSuccess?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : "failed";
      setSuccess(false);
      setMessage(code === "forbidden" ? copy.actionForbidden : code === "invalid" ? copy.actionInvalid : copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{stringValue(props.title) ?? "Formulário"}</h3>
          {stringValue(props.body) && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">{stringValue(props.body)}</p>}
        </div>
        <Badge variant="outline" className="font-mono text-[10px]"><ShieldCheck className="mr-1 h-3 w-3" />{actionKey}</Badge>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field, index) => {
            const name = stringValue(field.name) ?? `field-${index}`;
            const label = stringValue(field.label) ?? name;
            const type = stringValue(field.type) ?? "text";
            const required = field.required === true;
            const placeholder = stringValue(field.placeholder) ?? "";
            const options = Array.isArray(field.options) ? field.options.filter((item): item is string => typeof item === "string") : [];

            if (type === "checkbox") {
              return (
                <label key={name} className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-slate-700">
                  <input type="checkbox" checked={values[name] === true} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.checked }))} required={required} className="h-4 w-4 rounded border-slate-300" />
                  <span>{label}</span>
                </label>
              );
            }

            if (type === "select") {
              return (
                <label key={name} className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">{label}{required ? " *" : ""}</span>
                  <select value={typeof values[name] === "string" ? String(values[name]) : ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} required={required} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500">
                    <option value="">—</option>
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              );
            }

            if (type === "textarea") {
              return (
                <label key={name} className="space-y-1.5 md:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{label}{required ? " *" : ""}</span>
                  <textarea rows={4} value={typeof values[name] === "string" ? String(values[name]) : ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={placeholder} required={required} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500" />
                </label>
              );
            }

            return (
              <label key={name} className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">{label}{required ? " *" : ""}</span>
                <input type={type === "email" || type === "tel" || type === "number" ? type : "text"} value={typeof values[name] === "string" ? String(values[name]) : ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={placeholder} required={required} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500" />
              </label>
            );
          })}
        </div>

        {message && <div className={`rounded-lg border px-3 py-2 text-xs leading-5 ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{message}</div>}

        <button type="submit" disabled={busy || !actionClient} className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? copy.actionSending : stringValue(props.submitLabel) ?? "Enviar"}
        </button>
        {actionClient?.simulate && <p className="text-xs text-slate-400">{copy.actionPreview}</p>}
      </form>
    </section>
  );
}

function RuntimeBlockView({ block, lang, actionClient }: { block: RuntimeBlock; lang: "pt" | "es"; actionClient?: RuntimeActionClient }) {
  const props = block.props ?? {};
  if (block.type === "action_form") return <ActionFormBlock block={block} lang={lang} actionClient={actionClient} />;

  if (block.type === "hero") {
    const align = props.align === "center" ? "text-center" : "text-left";
    const imageUrl = stringValue(props.imageUrl);
    return <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${imageUrl ? "grid lg:grid-cols-[1.15fr_0.85fr]" : ""}`}><div className={`flex flex-col justify-center p-6 sm:p-8 lg:p-10 ${align}`}>{stringValue(props.badge) && <div><Badge variant="secondary">{stringValue(props.badge)}</Badge></div>}{stringValue(props.eyebrow) && <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{stringValue(props.eyebrow)}</p>}<h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{stringValue(props.title)}</h2>{stringValue(props.body) && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">{stringValue(props.body)}</p>}</div>{imageUrl && <img src={imageUrl} alt="" className="h-full min-h-56 w-full object-cover" />}</section>;
  }

  if (block.type === "text") return <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">{stringValue(props.title) && <h3 className="text-lg font-semibold text-slate-950">{stringValue(props.title)}</h3>}<p className={`${stringValue(props.title) ? "mt-3" : ""} whitespace-pre-line text-sm leading-7 text-slate-600`}>{stringValue(props.body)}</p></section>;

  if (block.type === "callout") return <section className={`rounded-2xl border p-5 sm:p-6 ${toneClasses(props.tone)}`}><div className="flex items-start gap-3"><ToneIcon tone={props.tone} /><div className="min-w-0">{stringValue(props.title) && <h3 className="font-semibold">{stringValue(props.title)}</h3>}<p className={`${stringValue(props.title) ? "mt-1" : ""} whitespace-pre-line text-sm leading-6 opacity-80`}>{stringValue(props.body)}</p></div></div></section>;

  if (block.type === "metrics") {
    const items = objectArray(props.items);
    return <section>{stringValue(props.title) && <h3 className="mb-3 text-sm font-semibold text-slate-900">{stringValue(props.title)}</h3>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map((item, index) => <div key={`${block.id}-metric-${index}`} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{stringValue(item.label)}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{stringValue(item.value)}</p>{stringValue(item.detail) && <p className="mt-1 text-xs leading-5 text-slate-500">{stringValue(item.detail)}</p>}</div>)}</div></section>;
  }

  if (block.type === "list") {
    const items = objectArray(props.items);
    return <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">{stringValue(props.title) && <h3 className="text-lg font-semibold text-slate-950">{stringValue(props.title)}</h3>}<div className={`${stringValue(props.title) ? "mt-4" : ""} divide-y`}>{items.map((item, index) => <div key={`${block.id}-item-${index}`} className="flex gap-3 py-4 first:pt-0 last:pb-0">{stringValue(item.label) && <Badge variant="outline" className="mt-0.5 h-fit shrink-0">{stringValue(item.label)}</Badge>}<div className="min-w-0">{stringValue(item.title) && <p className="text-sm font-semibold text-slate-900">{stringValue(item.title)}</p>}{stringValue(item.body) && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-500">{stringValue(item.body)}</p>}</div></div>)}</div></section>;
  }

  if (block.type === "cards") {
    const items = objectArray(props.items);
    return <section>{stringValue(props.title) && <h3 className="mb-3 text-sm font-semibold text-slate-900">{stringValue(props.title)}</h3>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => <article key={`${block.id}-card-${index}`} className="overflow-hidden rounded-2xl border bg-white shadow-sm">{stringValue(item.imageUrl) && <img src={stringValue(item.imageUrl)} alt="" className="h-40 w-full object-cover" />}<div className="p-5">{stringValue(item.badge) && <Badge variant="secondary" className="mb-3">{stringValue(item.badge)}</Badge>}<h4 className="font-semibold text-slate-950">{stringValue(item.title)}</h4>{stringValue(item.body) && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">{stringValue(item.body)}</p>}</div></article>)}</div></section>;
  }

  return <div className="flex items-center gap-3 py-2 text-xs uppercase tracking-wider text-slate-400"><div className="h-px flex-1 bg-slate-200" />{stringValue(props.label) && <span>{stringValue(props.label)}</span>}<div className="h-px flex-1 bg-slate-200" /></div>;
}

export default function SchemaRuntimeRenderer({ payload, lang, actionClient }: Props) {
  const copy = COPY[lang];
  const [livePayload, setLivePayload] = useState(payload);

  useEffect(() => { setLivePayload(payload); }, [payload]);

  const effectiveActionClient = useMemo<RuntimeActionClient | undefined>(() => {
    if (actionClient) return actionClient;
    if (typeof window === "undefined" || livePayload.app.id.startsWith("preview-")) return undefined;
    const token = window.localStorage.getItem(sessionStorageKey(livePayload.app.id));
    if (!token) return undefined;
    return {
      appId: livePayload.app.id,
      token,
      onSuccess: () => {
        void (async () => {
          try {
            const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(livePayload.app.id)}/runtime`, {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            });
            if (!response.ok) return;
            setLivePayload(await response.json() as RuntimePayload);
          } catch {
            // A Action já foi concluída; falha de refresh não desfaz a operação.
          }
        })();
      },
    };
  }, [actionClient, livePayload.app.id]);

  const pages = livePayload.runtime.pages ?? [];
  const availableIds = useMemo(() => new Set(pages.map((page) => page.id)), [pages]);
  const navigation = useMemo(() => {
    const configured = (livePayload.app.navigation ?? []).filter((item) => availableIds.has(item.pageId));
    if (configured.length > 0) return configured;
    return pages.map((page) => ({ id: `page-${page.id}`, label: page.title, pageId: page.id }));
  }, [availableIds, livePayload.app.navigation, pages]);
  const initial = livePayload.runtime.defaultPageId && availableIds.has(livePayload.runtime.defaultPageId) ? livePayload.runtime.defaultPageId : pages[0]?.id ?? "";
  const [selectedPageId, setSelectedPageId] = useState(initial);

  useEffect(() => {
    if (!selectedPageId || !availableIds.has(selectedPageId)) setSelectedPageId(initial);
  }, [availableIds, initial, selectedPageId]);

  const page = pages.find((item) => item.id === selectedPageId) ?? pages[0];
  if (!page) return <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500"><LayoutGrid className="mx-auto mb-3 h-6 w-6 text-slate-400" />{copy.empty}</div>;

  return <div className="space-y-5">
    {navigation.length > 1 && <nav aria-label={copy.navigation} className="overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm"><div className="flex min-w-max gap-1">{navigation.map((item) => <button key={item.id} type="button" onClick={() => setSelectedPageId(item.pageId)} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${item.pageId === page.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</button>)}</div></nav>}
    <div><h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{page.title}</h1>{page.subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{page.subtitle}</p>}</div>
    <div className="space-y-5">{page.blocks.length > 0 ? page.blocks.map((block) => <RuntimeBlockView key={block.id} block={block} lang={lang} actionClient={effectiveActionClient} />) : <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">{copy.empty}</div>}</div>
  </div>;
}
