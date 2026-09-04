import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

const PT_COPY = {
  mismatch: "As senhas não coincidem",
  minimum: "A senha deve ter no mínimo 8 caracteres",
  changeError: "Erro ao trocar senha",
  success: "Senha alterada com sucesso! Bem-vindo(a)!",
  networkError: "Não foi possível trocar a senha. Tente novamente.",
  title: "Troque sua senha",
  description: "Por segurança, você precisa criar uma nova senha antes de continuar.",
  newPassword: "Nova senha",
  minimumPlaceholder: "Mínimo 8 caracteres",
  confirmPassword: "Confirmar nova senha",
  repeatPassword: "Repita a nova senha",
  save: "Salvar nova senha",
} as const;

const ES_COPY = {
  mismatch: "Las contraseñas no coinciden",
  minimum: "La contraseña debe tener al menos 8 caracteres",
  changeError: "Error al cambiar la contraseña",
  success: "¡Contraseña actualizada correctamente! ¡Bienvenido/a!",
  networkError: "No fue posible cambiar la contraseña. Inténtalo de nuevo.",
  title: "Cambia tu contraseña",
  description: "Por seguridad, debes crear una nueva contraseña antes de continuar.",
  newPassword: "Nueva contraseña",
  minimumPlaceholder: "Mínimo 8 caracteres",
  confirmPassword: "Confirmar nueva contraseña",
  repeatPassword: "Repite la nueva contraseña",
  save: "Guardar nueva contraseña",
} as const;

export default function ForcePasswordChange() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const copy = locale === "pt-BR" ? PT_COPY : ES_COPY;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast({ title: copy.mismatch, variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: copy.minimum, variant: "destructive" });
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
        toast({ title: data.error ?? copy.changeError, variant: "destructive" });
        return;
      }
      qc.setQueryData(getGetMeQueryKey(), (current: any) =>
        current ? { ...current, forcePasswordReset: false } : current,
      );
      toast({ title: copy.success });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard", { replace: true });
    } catch {
      toast({ title: copy.networkError, variant: "destructive" });
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
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">{copy.newPassword}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={copy.minimumPlaceholder}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{copy.confirmPassword}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={copy.repeatPassword}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving || !newPassword || !confirm}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {copy.save}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
