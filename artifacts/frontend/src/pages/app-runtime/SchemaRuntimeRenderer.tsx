import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Info, LayoutGrid, Loader2, TriangleAlert, Zap } from "lucide-react";

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

type RuntimePage = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  blocks: RuntimeBlock[];
};

type RuntimeBlock = {
  id: string;
  type: "hero" | "text" | "callout" | "metrics" | "list" | "cards" | "divider";
  props: JsonObject;
};

type ActionField = {
  key: string;
  label: string;
  inputType: "text" | "email" | "tel" | "number" | "textarea";
  placeholder?: string;
  required?: boolean;
};

type RuntimeActionItem = {
  id: string;
  pageId: string;
  kind: "cta" | "form";
  actionKey: string;
  title: string;
  body?: string;
  buttonLabel: string;
  successMessage: string;
  input?: JsonObject;
  fields?: ActionField[];
};

type Props = {
  payload: RuntimePayload;
  lang: "pt" | "es";
};

const COPY = {
  pt: {
    empty: "Nenhum conteúdo foi publicado para este perfil.",
    navigation: "Navegação",
    actionError: "Não foi possível concluir esta ação.",
    saving: "Enviando...",
  },
  es: {
    empty: "No hay contenido publicado para este perfil.",
    navigation: "Navegación",
    actionError: "No fue posible completar esta acción.",
    saving: "Enviando...",
  },
} as const;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
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

function RuntimeBlockView({ block }: { block: RuntimeBlock }) {
  const props = block.props ?? {};

  if (block.type === "hero") {
    const align = props.align === "center" ? "text-center" : "text-left";
    const imageUrl = stringValue(props.imageUrl);
    return (
      <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${imageUrl ? "grid lg:grid-cols-[1.15fr_0.85fr]" : ""}`}>
        <div className={`flex flex-col justify-center p-6 sm:p-8 lg:p-10 ${align}`}>
          {stringValue(props.badge) && <div><Badge variant="secondary">{stringValue(props.badge)}</Badge></div>}
          {stringValue(props.eyebrow) && <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{stringValue(props.eyebrow)}</p>}
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{stringValue(props.title)}</h2>
          {stringValue(props.body) && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">{stringValue(props.body)}</p>}
        </div>
        {imageUrl && <img src={imageUrl} alt="" className="h-full min-h-56 w-full object-cover" />}
      </section>
    );
  }

  if (block.type === "text") {
    return (
      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        {stringValue(props.title) && <h3 className="text-lg font-semibold text-slate-950">{stringValue(props.title)}</h3>}
        <p className={`${stringValue(props.title) ? "mt-3" : ""} whitespace-pre-line text-sm leading-7 text-slate-600`}>{stringValue(props.body)}</p>
      </section>
    );
  }

  if (block.type === "callout") {
    return (
      <section className={`rounded-2xl border p-5 sm:p-6 ${toneClasses(props.tone)}`}>
        <div className="flex items-start gap-3">
          <ToneIcon tone={props.tone} />
          <div className="min-w-0">
            {stringValue(props.title) && <h3 className="font-semibold">{stringValue(props.title)}</h3>}
            <p className={`${stringValue(props.title) ? "mt-1" : ""} whitespace-pre-line text-sm leading-6 opacity-80`}>{stringValue(props.body)}</p>
          </div>
        </div>
      </section>
    );
  }

  if (block.type === "metrics") {
    const items = objectArray(props.items);
    return (
      <section>
        {stringValue(props.title) && <h3 className="mb-3 text-sm font-semibold text-slate-900">{stringValue(props.title)}</h3>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item, index) => (
            <div key={`${block.id}-metric-${index}`} className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{stringValue(item.label)}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{stringValue(item.value)}</p>
              {stringValue(item.detail) && <p className="mt-1 text-xs leading-5 text-slate-500">{stringValue(item.detail)}</p>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "list") {
    const items = objectArray(props.items);
    return (
      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        {stringValue(props.title) && <h3 className="text-lg font-semibold text-slate-950">{stringValue(props.title)}</h3>}
        <div className={`${stringValue(props.title) ? "mt-4" : ""} divide-y`}>
          {items.map((item, index) => (
            <div key={`${block.id}-item-${index}`} className="flex gap-3 py-4 first:pt-0 last:pb-0">
              {stringValue(item.label) && <Badge variant="outline" className="mt-0.5 h-fit shrink-0">{stringValue(item.label)}</Badge>}
              <div className="min-w-0">
                {stringValue(item.title) && <p className="text-sm font-semibold text-slate-900">{stringValue(item.title)}</p>}
                {stringValue(item.body) && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-500">{stringValue(item.body)}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === "cards") {
    const items = objectArray(props.items);
    return (
      <section>
        {stringValue(props.title) && <h3 className="mb-3 text-sm font-semibold text-slate-900">{stringValue(props.title)}</h3>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <article key={`${block.id}-card-${index}`} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              {stringValue(item.imageUrl) && <img src={stringValue(item.imageUrl)} alt="" className="h-40 w-full object-cover" />}
              <div className="p-5">
                {stringValue(item.badge) && <Badge variant="secondary" className="mb-3">{stringValue(item.badge)}</Badge>}
                <h4 className="font-semibold text-slate-950">{stringValue(item.title)}</h4>
                {stringValue(item.body) && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">{stringValue(item.body)}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 text-xs uppercase tracking-wider text-slate-400">
      <div className="h-px flex-1 bg-slate-200" />
      {stringValue(props.label) && <span>{stringValue(props.label)}</span>}
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function ActionCard({
  item,
  busy,
  message,
  values,
  onValue,
  onExecute,
  copy,
}: {
  item: RuntimeActionItem;
  busy: boolean;
  message?: { ok: boolean; text: string };
  values: Record<string, string>;
  onValue: (key: string, value: string) => void;
  onExecute: (input: JsonObject) => void;
  copy: typeof COPY.pt | typeof COPY.es;
}) {
  if (item.kind === "cta") {
    return (
      <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>{item.body && <p className="mt-2 text-sm leading-6 text-slate-500">{item.body}</p>}</div>
          <Button type="button" className="shrink-0" onClick={() => onExecute(item.input ?? {})} disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.saving}</> : <><Zap className="mr-2 h-4 w-4" />{item.buttonLabel}</>}</Button>
        </div>
        {message && <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
      <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
      {item.body && <p className="mt-2 text-sm leading-6 text-slate-500">{item.body}</p>}
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const input = Object.fromEntries((item.fields ?? []).flatMap((field) => { const value = values[field.key]?.trim() ?? ""; return value ? [[field.key, field.inputType === "number" ? Number(value) : value]] : []; })); onExecute(input); }}>
        {(item.fields ?? []).map((field) => <label key={field.key} className={field.inputType === "textarea" ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</span>{field.inputType === "textarea" ? <Textarea value={values[field.key] ?? ""} onChange={(event) => onValue(field.key, event.target.value)} placeholder={field.placeholder} required={field.required} rows={4} /> : <Input type={field.inputType} value={values[field.key] ?? ""} onChange={(event) => onValue(field.key, event.target.value)} placeholder={field.placeholder} required={field.required} />}</label>)}
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.saving}</> : item.buttonLabel}</Button></div>
      </form>
      {message && <p className={`mt-4 rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    </section>
  );
}

export default function SchemaRuntimeRenderer({ payload, lang }: Props) {
  const copy = COPY[lang];
  const pages = payload.runtime.pages ?? [];
  const availableIds = useMemo(() => new Set(pages.map((page) => page.id)), [pages]);
  const navigation = useMemo(() => {
    const configured = (payload.app.navigation ?? []).filter((item) => availableIds.has(item.pageId));
    if (configured.length > 0) return configured;
    return pages.map((page) => ({ id: `page-${page.id}`, label: page.title, pageId: page.id }));
  }, [availableIds, pages, payload.app.navigation]);
  const initial = payload.runtime.defaultPageId && availableIds.has(payload.runtime.defaultPageId)
    ? payload.runtime.defaultPageId
    : pages[0]?.id ?? "";
  const [selectedPageId, setSelectedPageId] = useState(initial);
  const [actionItems, setActionItems] = useState<RuntimeActionItem[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessages, setActionMessages] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!selectedPageId || !availableIds.has(selectedPageId)) setSelectedPageId(initial);
  }, [availableIds, initial, selectedPageId]);

  useEffect(() => {
    let alive = true;
    const token = typeof window !== "undefined" ? localStorage.getItem(`vendorai:app-user-session:${payload.app.id}`) : null;
    if (!token) {
      setActionItems([]);
      return;
    }
    void fetch(`/api/app-runtime/apps/${encodeURIComponent(payload.app.id)}/action-ui`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) return { items: [] as RuntimeActionItem[] };
        return response.json() as Promise<{ items?: RuntimeActionItem[] }>;
      })
      .then((result) => { if (alive) setActionItems(Array.isArray(result.items) ? result.items : []); })
      .catch(() => { if (alive) setActionItems([]); });
    return () => { alive = false; };
  }, [payload.app.id, payload.publishedVersionId]);

  const page = pages.find((item) => item.id === selectedPageId) ?? pages[0];
  const pageActions = useMemo(() => actionItems.filter((item) => item.pageId === page?.id), [actionItems, page?.id]);

  async function executeAction(item: RuntimeActionItem, input: JsonObject) {
    const token = localStorage.getItem(`vendorai:app-user-session:${payload.app.id}`);
    if (!token) return;
    setActionBusy(item.id);
    setActionMessages((current) => ({ ...current, [item.id]: undefined as never }));
    try {
      const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(payload.app.id)}/actions/${encodeURIComponent(item.actionKey)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!response.ok) throw new Error("action_failed");
      setActionMessages((current) => ({ ...current, [item.id]: { ok: true, text: item.successMessage } }));
    } catch {
      setActionMessages((current) => ({ ...current, [item.id]: { ok: false, text: copy.actionError } }));
    } finally {
      setActionBusy(null);
    }
  }

  if (!page) {
    return <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500"><LayoutGrid className="mx-auto mb-3 h-6 w-6 text-slate-400" />{copy.empty}</div>;
  }

  return (
    <div className="space-y-5">
      {navigation.length > 1 && (
        <nav aria-label={copy.navigation} className="overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm">
          <div className="flex min-w-max gap-1">
            {navigation.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedPageId(item.pageId)} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${item.pageId === page.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{item.label}</button>
            ))}
          </div>
        </nav>
      )}

      <div><h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{page.title}</h1>{page.subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{page.subtitle}</p>}</div>

      <div className="space-y-5">
        {page.blocks.length > 0 ? page.blocks.map((block) => <RuntimeBlockView key={block.id} block={block} />) : pageActions.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">{copy.empty}</div> : null}
        {pageActions.map((item) => <ActionCard key={item.id} item={item} busy={actionBusy === item.id} message={actionMessages[item.id]} values={formValues[item.id] ?? {}} onValue={(key, value) => setFormValues((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? {}), [key]: value } }))} onExecute={(input) => void executeAction(item, input)} copy={copy} />)}
      </div>
    </div>
  );
}
