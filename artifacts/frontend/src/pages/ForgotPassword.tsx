import { useState } from "react";
import { useForgotPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import logoLight from "/logo-full-dark.svg";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const mutation = useForgotPassword({
    mutation: {
      onSuccess: () => {
        setSent(true);
      },
      onError: () => {
        toast({
          title: "Erro ao enviar e-mail",
          description: "Tente novamente em alguns instantes.",
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
          <h1 className="text-2xl font-bold tracking-tight">Esqueceu a senha?</h1>
          <p className="text-muted-foreground text-sm">
            {sent
              ? "Verifique sua caixa de entrada."
              : "Digite seu e-mail e enviaremos um link para redefinir sua senha."}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm text-emerald-800 font-medium">
                Se o e-mail estiver cadastrado, você receberá o link em breve.
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                O link expira em 1 hora. Verifique também sua pasta de spam.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/login")}
            >
              Voltar para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">E-mail</label>
              <Input
                type="email"
                placeholder="seu@email.com"
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
              {mutation.isPending ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setLocation("/login")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para o login
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
