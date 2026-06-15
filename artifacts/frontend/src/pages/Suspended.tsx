import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function Suspended() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-5">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Acesso Suspenso</h1>
          <p className="text-muted-foreground">
            Sua conta foi suspensa por inadimplência. Regularize o pagamento
            pendente para restaurar o acesso à plataforma.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4 text-sm text-left space-y-1">
          <p className="font-medium text-foreground">Como regularizar:</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
            <li>Verifique seu e-mail para o boleto/PIX em aberto</li>
            <li>Efetue o pagamento</li>
            <li>Aguarde até 1h para liberação automática</li>
          </ol>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Dúvidas? Entre em contato:{" "}
            <a href="mailto:suporte@vendor.ai" className="underline hover:text-foreground">
              suporte@vendor.ai
            </a>
          </p>
          <Button variant="outline" size="sm" onClick={logout}>
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
