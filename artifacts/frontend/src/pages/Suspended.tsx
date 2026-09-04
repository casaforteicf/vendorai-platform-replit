import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/i18n";

const PT_COPY = {
  title: "Acesso suspenso",
  description: "Sua conta foi suspensa por inadimplência. Regularize o pagamento pendente para restaurar o acesso à plataforma.",
  howTo: "Como regularizar:",
  steps: [
    "Verifique seu e-mail para a cobrança em aberto",
    "Efetue o pagamento",
    "Aguarde até 1h para liberação automática",
  ],
  contact: "Dúvidas? Entre em contato:",
  logout: "Sair",
} as const;

const ES_COPY = {
  title: "Acceso suspendido",
  description: "Tu cuenta fue suspendida por un pago pendiente. Regulariza el pago para restaurar el acceso a la plataforma.",
  howTo: "Cómo regularizar:",
  steps: [
    "Revisa tu correo para ver el cobro pendiente",
    "Realiza el pago",
    "Espera hasta 1 hora para la habilitación automática",
  ],
  contact: "¿Tienes dudas? Contáctanos:",
  logout: "Salir",
} as const;

export default function Suspended() {
  const { logout } = useAuth();
  const { locale } = useI18n();
  const copy = locale.startsWith("es") ? ES_COPY : PT_COPY;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-5">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.description}</p>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4 text-sm text-left space-y-1">
          <p className="font-medium text-foreground">{copy.howTo}</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {copy.contact}{" "}
            <a href="mailto:vendorai@appvendorai.com" className="underline hover:text-foreground">
              vendorai@appvendorai.com
            </a>
          </p>
          <Button variant="outline" size="sm" onClick={logout}>
            {copy.logout}
          </Button>
        </div>
      </div>
    </div>
  );
}
