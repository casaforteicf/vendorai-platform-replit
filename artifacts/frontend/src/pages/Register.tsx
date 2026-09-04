import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Compatibilidade para o antigo /register.
 *
 * A criação oficial de tenants acontece em /admin/tenants, onde o perfil
 * regional/internacional é provisionado corretamente. Mantemos este arquivo e
 * a rota antiga para não quebrar links existentes, mas não expomos mais o
 * formulário legado que chamava /auth/register.
 */
export default function Register() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    setLocation(user?.platformRole === "super_admin" ? "/admin/tenants" : "/login", {
      replace: true,
    });
  }, [isLoading, user?.platformRole, setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
