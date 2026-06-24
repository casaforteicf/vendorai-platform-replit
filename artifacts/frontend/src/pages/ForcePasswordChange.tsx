import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

export default function ForcePasswordChange() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast({ title: "As senhas não coincidem", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "A senha deve ter no mínimo 8 caracteres", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Erro ao trocar senha", variant: "destructive" });
        return;
      }
      toast({ title: "Senha alterada com sucesso! Bem-vindo(a)!" });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
              <KeyRound className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <CardTitle>Troque sua senha</CardTitle>
          <CardDescription>
            Por segurança, você precisa criar uma nova senha antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !newPassword || !confirm}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
