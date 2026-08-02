import * as React from "react";

// Temporário: sem isso, um erro de render deixa a tela toda branca sem
// nenhuma pista do que quebrou. Mostra a mensagem e o stack na tela mesmo
// em produção, só até acharmos e corrigirmos o bug real — depois disso dá
// pra tirar ou trocar por um design mais bonito.
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary capturou:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", background: "#1a1a1a", color: "#ff6b6b", minHeight: "100vh" }}>
          <h1 style={{ color: "#fff", fontSize: 18 }}>Erro ao carregar a tela</h1>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{this.state.error.message}</p>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 12, fontSize: 12, color: "#999" }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
