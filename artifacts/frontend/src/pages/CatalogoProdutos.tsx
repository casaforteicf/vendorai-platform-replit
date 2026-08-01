import { useLocation } from "wouter";
import { CatalogoModal } from "./Propostas";
import { useAuth } from "@/contexts/AuthContext";

export default function CatalogoProdutos() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catálogo de Produtos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastre, importe e organize os produtos publicados nos canais de venda.
        </p>
      </div>
      <CatalogoModal open tenantId={tenantId} onClose={() => navigate("/")} />
    </div>
  );
}
