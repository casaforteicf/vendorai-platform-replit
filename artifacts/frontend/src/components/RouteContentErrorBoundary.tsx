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
