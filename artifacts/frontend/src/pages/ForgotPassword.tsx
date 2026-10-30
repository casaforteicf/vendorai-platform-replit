import { VendorBackButton } from "@/components/ui/back-button";
import { useState } from "react";
import { useForgotPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import {} from "lucide-react";
import { useLocation } from "wouter";
import logoLight from "/logo-full-dark.svg";

const PT_COPY = {
  errorTitle: "Erro ao enviar e-mail",
  errorDescription: "Tente novamente em alguns instantes.",
  title: "Esqueceu a senha?",
  sentSubtitle: "Verifique sua caixa de entrada.",
  subtitle: "Digite seu e-mail e enviaremos um link para redefinir sua senha.",
  sentMessage: "Se o e-mail estiver cadastrado, você receberá o link em breve.",
  expiration: "O link expira em 1 hora. Verifique também sua pasta de spam.",
  backLogin: "Voltar para o login",
  email: "E-mail",
  emailPlaceholder: "seu@email.com",
  sending: "Enviando...",
  sendLink: "Enviar link de redefinição",
} as const;

const ES_COPY = {
  errorTitle: "Error al enviar el correo",
  errorDescription: "Inténtalo de nuevo en unos instantes.",
  title: "¿Olvidaste tu contraseña?",
  sentSubtitle: "Revisa tu bandeja de entrada.",
  subtitle: "Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.",
  sentMessage: "Si el correo está registrado, recibirás el enlace en breve.",
  expiration: "El enlace vence en 1 hora. Revisa también tu carpeta de spam.",
  backLogin: "Volver al inicio de sesión",
  email: "Correo electrónico",
  emailPlaceholder: "tu@email.com",
  sending: "Enviando...",
  sendLink: "Enviar enlace de restablecimiento",
} as const;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { locale } = useI18n();
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;

  const mutation = useForgotPassword({
    mutation: {
      onSuccess: () => {
        setSent(true);
      },
      onError: () => {
        toast({
          title: copy.errorTitle,
          description: copy.errorDescription,
          variant: "destructive",
        });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    mutation.mutate({ data: { email: email.trim() } });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <img src={logoLight} alt="Vendor.ai" className="h-10 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
          <p className="text-muted-foreground text-sm">
            {sent ? copy.sentSubtitle : copy.subtitle}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm text-emerald-800 font-medium">{copy.sentMessage}</p>
              <p className="text-xs text-emerald-700 mt-1">{copy.expiration}</p>
            </div>
            <VendorBackButton to="/login" label={copy.backLogin} className="w-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{copy.email}</label>
              <Input
                type="email"
                placeholder={copy.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || !email.trim()}
            >
              {mutation.isPending ? copy.sending : copy.sendLink}
            </Button>
            <VendorBackButton to="/login" label={copy.backLogin} className="w-full" />
          </form>
        )}
      </div>
    </div>
  );
}
