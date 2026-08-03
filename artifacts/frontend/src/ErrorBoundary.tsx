import * as React from "react";

// Temporário: sem isso, um erro de render deixa a tela toda branca sem
// nenhuma pista do que quebrou. Mostra a mensagem e o stack na tela mesmo
// em produção, só até acharmos e corrigirmos o bug real — depois disso dá
// pra tirar ou trocar por um design mais bonito.
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOAD_FLAG_KEY = "vendorai_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 10_000;

// Depois de um deploy novo, o navegador pode ter a página velha aberta
// tentando buscar um arquivo JS com hash antigo que não existe mais —
// isso não é bug de código, é só cache desatualizado. Em vez de mostrar
// erro pro usuário, recarrega sozinho uma vez. Se falhar de novo rápido
// (menos de 10s), desiste e mostra o erro normal — evita loop infinito.
function tentarRecuperarDeChunkAntigo(error: Error): boolean {
  if (!CHUNK_ERROR_PATTERN.test(error.message)) return false;
  const lastAttempt = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
  if (Date.now() - lastAttempt < RELOAD_COOLDOWN_MS) return false;
  sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; reloading: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, reloading: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary capturou:", error, info);
    if (tentarRecuperarDeChunkAntigo(error)) {
      this.setState({ reloading: true });
    }
  }

  render() {
    if (this.state.reloading) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", color: "#666" }}>
          Atualizando...
        </div>
      );
    }
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
