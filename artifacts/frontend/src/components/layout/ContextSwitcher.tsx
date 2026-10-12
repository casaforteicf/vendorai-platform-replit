import { useMemo, useState } from "react";
import type { ExperienceContext } from "@/lib/unifiedExperienceCatalog";
import { canPresentContext, visibleExperiences } from "@/lib/unifiedExperienceCatalog";

export interface ContextSwitcherProps {
  /** Contexts must come from a server endpoint that verified memberships. */
  contexts: readonly ExperienceContext[];
  currentContextId: string;
  /** Identity scope must originate from authenticated server data, not URL params. */
  tenantId?: string;
  projectId?: string;
  onRequestSwitch: (context: ExperienceContext) => void;
  disabled?: boolean;
}

/**
 * Presentation-only, opt-in context selector.
 * Host must revalidate membership server-side before changing active context.
 * Deliberately does not mutate localStorage, authentication or navigation.
 */
export function ContextSwitcher({
  contexts, currentContextId, tenantId, projectId, onRequestSwitch, disabled = false,
}: ContextSwitcherProps) {
  const [requestedId, setRequestedId] = useState("");
  const allowed = useMemo(
    () => contexts.filter((ctx) => canPresentContext(ctx, { tenantId, projectId })),
    [contexts, tenantId, projectId],
  );
  const current = allowed.find((ctx) => ctx.id === currentContextId);
  const selectedId = allowed.some((ctx) => ctx.id === requestedId) ? requestedId : (current?.id ?? "");
  const next = allowed.find((ctx) => ctx.id === selectedId);
  return (
    <section aria-label="Espaço de trabalho" className="flex flex-col gap-2">
      <label htmlFor="ui01-context" className="text-sm font-medium">Espaço de trabalho</label>
      <select
        id="ui01-context"
        value={selectedId}
        disabled={disabled || allowed.length === 0}
        onChange={(event) => setRequestedId(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {allowed.length === 0 && <option value="">Nenhum espaço autorizado</option>}
        {allowed.map((ctx) => (
          <option key={ctx.id} value={ctx.id}>{ctx.label}</option>
        ))}
      </select>
      {next && (
        <>
          <p className="text-xs text-muted-foreground">
            {visibleExperiences(next).map((experience) => experience.title).join(" · ") || "Sem módulos habilitados"}
          </p>
          <button
            type="button"
            disabled={disabled || next.id === currentContextId}
            onClick={() => onRequestSwitch(next)}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >Solicitar troca de espaço</button>
        </>
      )}
    </section>
  );
}
