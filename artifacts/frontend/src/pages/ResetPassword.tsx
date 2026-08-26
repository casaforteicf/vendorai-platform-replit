import { useState, useEffect } from "react";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import logoLight from "/logo-full-dark.svg";

const TOKEN_KEY = "vendorai_token";

export default function ResetPassword() {
  const searchString = useSearch();
  const token = new URLSearchParams(searchString).get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
          "Link inválido ou expirado.";
        toast({
          title: "Erro ao redefinir senha",
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

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-semibold">Senha redefinida!</h2>
          <p className="text-muted-foreground">Redirecionando para o login...</p>
          <Button onClick={() => setLocation("/login")}>Ir para o login</Button>
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
