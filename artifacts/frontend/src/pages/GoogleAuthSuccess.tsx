import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function GoogleAuthSuccess() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const googleError = params.get("google_error");

      // Remove o token da barra de endereço imediatamente após a leitura.
      window.history.replaceState({}, document.title, window.location.pathname);

      if (googleError) {
        setError(
          googleError === "account_not_found"
            ? "Este e-mail do Google ainda não possui acesso ao Vendor.ai."
            : "Não foi possível concluir o login com Google.",
        );
        return;
      }

      if (!token) {
        setError("Token de autenticação não recebido.");
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Sessão inválida");
        }

        const user = await response.json();
        if (!cancelled) login(token, user);
      } catch {
        if (!cancelled) setError("A sessão do Google não pôde ser validada.");
      }
    }

    void completeLogin();
    return () => {
      cancelled = true;
    };
  }, [login]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Login com Google</h1>
          <p className="text-muted-foreground">{error}</p>
          <a href="/login" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Voltar ao login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Concluindo login com Google...</p>
      </div>
    </div>
  );
}
