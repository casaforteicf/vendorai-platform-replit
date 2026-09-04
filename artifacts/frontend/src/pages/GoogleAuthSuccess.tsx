import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

const POST_LOGIN_PATH_KEY = "vendorai_post_login_path";

const PT_COPY = {
  accountNotFound: "Este e-mail do Google ainda não possui acesso à plataforma.",
  loginError: "Não foi possível concluir o login com Google.",
  tokenMissing: "Token de autenticação não recebido.",
  sessionInvalid: "Sessão inválida",
  sessionValidationError: "A sessão do Google não pôde ser validada.",
  title: "Login com Google",
  backToLogin: "Voltar ao login",
  completing: "Concluindo login com Google...",
} as const;

const ES_COPY = {
  accountNotFound: "Este correo de Google todavía no tiene acceso a la plataforma.",
  loginError: "No fue posible completar el inicio de sesión con Google.",
  tokenMissing: "No se recibió el token de autenticación.",
  sessionInvalid: "Sesión no válida",
  sessionValidationError: "No fue posible validar la sesión de Google.",
  title: "Inicio de sesión con Google",
  backToLogin: "Volver al inicio de sesión",
  completing: "Completando el inicio de sesión con Google...",
} as const;

function consumeSafePostLoginPath(): string | null {
  const path = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  return path;
}

export default function GoogleAuthSuccess() {
  const { login } = useAuth();
  const { locale } = useI18n();
  const [copy] = useState(() => locale.startsWith("es") ? ES_COPY : PT_COPY);
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
            ? copy.accountNotFound
            : copy.loginError,
        );
        return;
      }

      if (!token) {
        setError(copy.tokenMissing);
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error(copy.sessionInvalid);
        }

        const user = await response.json();
        if (!cancelled) {
          const returnPath = consumeSafePostLoginPath();
          login(token, user);
          if (returnPath) window.location.assign(returnPath);
        }
      } catch {
        if (!cancelled) setError(copy.sessionValidationError);
      }
    }

    void completeLogin();
    return () => {
      cancelled = true;
    };
  }, [login, copy]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-muted-foreground">{error}</p>
          <a href="/login" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            {copy.backToLogin}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{copy.completing}</p>
      </div>
    </div>
  );
}
