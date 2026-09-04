import { useState, useEffect } from "react";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import { useLocation, useSearch } from "wouter";
import logoLight from "/logo-full-dark.svg";

const TOKEN_KEY = "vendorai_token";

const PT_COPY = {
  invalidOrExpired: "Link inválido ou expirado.",
  errorTitle: "Erro ao redefinir senha",
  minimumError: "A senha deve ter pelo menos 8 caracteres",
  mismatchError: "As senhas não coincidem",
  invalidLink: "Link inválido. Solicite um novo link de redefinição.",
  requestNewLink: "Solicitar novo link",
  resetSuccess: "Senha redefinida!",
  redirecting: "Redirecionando para o login...",
  goLogin: "Ir para o login",
  title: "Nova senha",
  subtitle: "Escolha uma senha com pelo menos 8 caracteres.",
  newPassword: "Nova senha",
  minimumPlaceholder: "Mínimo 8 caracteres",
  confirmPassword: "Confirmar senha",
  repeatPassword: "Repita a senha",
  saving: "Salvando...",
  resetPassword: "Redefinir senha",
} as const;

const ES_COPY = {
  invalidOrExpired: "Enlace inválido o vencido.",
  errorTitle: "Error al restablecer la contraseña",
  minimumError: "La contraseña debe tener al menos 8 caracteres",
  mismatchError: "Las contraseñas no coinciden",
  invalidLink: "Enlace inválido. Solicita un nuevo enlace de restablecimiento.",
  requestNewLink: "Solicitar nuevo enlace",
  resetSuccess: "¡Contraseña restablecida!",
  redirecting: "Redirigiendo al inicio de sesión...",
  goLogin: "Ir al inicio de sesión",
  title: "Nueva contraseña",
  subtitle: "Elige una contraseña de al menos 8 caracteres.",
  newPassword: "Nueva contraseña",
  minimumPlaceholder: "Mínimo 8 caracteres",
  confirmPassword: "Confirmar contraseña",
  repeatPassword: "Repite la contraseña",
  saving: "Guardando...",
  resetPassword: "Restablecer contraseña",
} as const;

export default function ResetPassword() {
  const searchString = useSearch();
  const token = new URLSearchParams(searchString).get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { locale } = useI18n();
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;

  const mutation = useResetPassword({
    mutation: {
      onSuccess: (data) => {
        const d = data as any;
        if (d?.token) {
          // Save JWT directly to localStorage, then hard-navigate to dashboard
          // Hard navigation avoids React state race conditions (useGetMe vs setToken)
          localStorage.setItem(TOKEN_KEY, d.token);
          // Achado real: usava /app/dashboard (prefixo que não existe
          // como rota) -- rota real é só /dashboard, sem prefixo.
          window.location.href = window.location.origin + "/dashboard";
        } else {
          // Fallback: show success and redirect to login
          setDone(true);
        }
      },
      onError: (err: any) => {
        const msg =
          err?.response?.data?.error ??
          err?.data?.error ??
          copy.invalidOrExpired;
        toast({
          title: copy.errorTitle,
          description: msg,
          variant: "destructive",
        });
      },
    },
  });

  // Fallback redirect after success without token
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setLocation("/login"), 3000);
    return () => clearTimeout(t);
  }, [done]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: copy.minimumError, variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: copy.mismatchError, variant: "destructive" });
      return;
    }
    mutation.mutate({ data: { token, newPassword } });
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-muted-foreground">{copy.invalidLink}</p>
          <Button variant="outline" onClick={() => setLocation("/esqueci-senha")}>
            {copy.requestNewLink}
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-semibold">{copy.resetSuccess}</h2>
          <p className="text-muted-foreground">{copy.redirecting}</p>
          <Button onClick={() => setLocation("/login")}>{copy.goLogin}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <img src={logoLight} alt="Vendor.ai" className="h-10 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
          <p className="text-muted-foreground text-sm">{copy.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{copy.newPassword}</label>
            <Input
              type="password"
              placeholder={copy.minimumPlaceholder}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{copy.confirmPassword}</label>
            <Input
              type="password"
              placeholder={copy.repeatPassword}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || !newPassword || !confirmPassword}
          >
            {mutation.isPending ? copy.saving : copy.resetPassword}
          </Button>
        </form>
      </div>
    </div>
  );
}
