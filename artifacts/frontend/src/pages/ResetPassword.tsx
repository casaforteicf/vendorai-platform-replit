import { useState, useEffect } from "react";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import logoLight from "/logo-full-dark.svg";

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  const mutation = useResetPassword({
    mutation: {
      onSuccess: (data) => {
        const d = data as any;
        if (d?.token && d?.user) {
          // Auto-login: token returned by backend after reset
          login(d.token, d.user);
        } else {
          // Fallback: redirect to login page manually
          toast({ title: "Senha redefinida com sucesso! Faça login para continuar." });
          setTimeout(() => setLocation("/login"), 1500);
        }
      },
      onError: (err: any) => {
        toast({
          title: "Erro ao redefinir senha",
          description: err?.response?.data?.error ?? err?.data?.error ?? "Link inválido ou expirado.",
          variant: "destructive",
        });
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    mutation.mutate({ data: { token, newPassword } });
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-muted-foreground">Link inválido. Solicite um novo link de redefinição.</p>
          <Button variant="outline" onClick={() => setLocation("/esqueci-senha")}>
            Solicitar novo link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <img src={logoLight} alt="Vendor.ai" className="h-10 w-auto mx-auto mb-6" />
          <h1 className="text-2xl font-bold tracking-tight">Nova senha</h1>
          <p className="text-muted-foreground text-sm">
            Escolha uma senha com pelo menos 8 caracteres.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nova senha</label>
            <Input
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirmar senha</label>
            <Input
              type="password"
              placeholder="Repita a senha"
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
            {mutation.isPending ? "Salvando..." : "Redefinir senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
