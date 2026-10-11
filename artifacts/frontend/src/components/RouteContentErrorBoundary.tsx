import React from "react";

type Props = {
  children: React.ReactNode;
  routeKey: string;
};

type State = {
  error: Error | null;
};

export class RouteContentErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report only the first stable route segment; never transmit dynamic IDs,
    // user-provided paths, stack traces, messages or component props.
    try {
      const routeKey = "/" + (window.location.pathname.split("/").filter(Boolean)[0] ?? "root");
      // Only fixed application modules may be reported. The first URL segment
      // may otherwise be an arbitrary customer slug or identifier.
      const allowedModules = new Set([
        "/dashboard", "/leads", "/negocios", "/conversas", "/agenda",
        "/propostas", "/app", "/configuracoes", "/admin", "/obras",
        "/arqdor", "/prospector",
      ]);
      const authToken = localStorage.getItem("vendorai_token");
      // Client throttling is best-effort; the API also has a rate limiter.
      const throttleKey = "vendorai_ux_report_" + routeKey;
      const last = Number(sessionStorage.getItem(throttleKey) || 0);
      if (authToken && allowedModules.has(routeKey) &&
          (Date.now() - last > 60_000)) {
        sessionStorage.setItem(throttleKey, String(Date.now()));
        const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
        const isHomolog = window.location.hostname === "homolog.appvendorai.com";
        const endpoint = isHomolog && apiBase
          ? apiBase + "/ux/runtime-error"
          : "/api/ux/runtime-error";
        void fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ routeKey, errorKind: "react_render" }),
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // Telemetry is best-effort and cannot break the error boundary.
    }
    console.error("[VendorAI] Erro de renderização na rota", {
      route: this.props.routeKey,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[50vh] w-full flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Não foi possível abrir esta tela</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta página encontrou um erro de renderização. O restante do VendorAI continua disponível.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Recarregar esta tela
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm font-medium"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
            >
              Voltar ao painel
            </button>
          </div>

          <details className="mt-4 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer">Detalhes técnicos</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted p-3">
              {this.props.routeKey}
              {"\n"}
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
