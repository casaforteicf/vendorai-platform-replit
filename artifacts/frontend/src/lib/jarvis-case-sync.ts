export type JarvisCaseSignal = {
  id: string;
  category: string;
  severity: "opportunity" | "attention" | "risk";
  title: string;
  detail: string;
  metric?: string | null;
  confidence?: number | null;
  impact?: number | null;
  href?: string | null;
};

export async function syncJarvisCases(
  token: string,
  signals: JarvisCaseSignal[],
  options?: { source?: string; evidence?: Record<string, unknown> | null },
): Promise<void> {
  if (!token || !signals.length) return;

  const response = await fetch("/api/jarvis/cases/sync", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      signals: signals.map((signal) => ({
        signalKey: signal.id,
        source: options?.source ?? "strategic_observer",
        category: signal.category,
        severity: signal.severity,
        title: signal.title,
        detail: signal.detail,
        metric: signal.metric ?? null,
        confidence: signal.confidence ?? null,
        impact: signal.impact ?? null,
        href: signal.href ?? null,
        evidence: options?.evidence ?? {
          origin: "StrategicObserver",
          window: "90d+current_pipeline",
        },
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao sincronizar Casos Vendor (${response.status})`);
  }
}
