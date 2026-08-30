import { useLocation, Link } from "wouter";
import { CatalogoModal } from "./Propostas";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FolderTree } from "lucide-react";

export default function CatalogoProdutos() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre, importe e organize os produtos publicados nos canais de venda.
          </p>
        </div>
        <Link href="/catalogo/categorias">
          <Button type="button" variant="outline" size="sm">
            <FolderTree className="h-4 w-4 mr-1.5" />
            Gerenciar categorias
          </Button>
        </Link>
      </div>
      <CatalogoModal open tenantId={tenantId} onClose={() => navigate("/")} />
    </div>
  );
}
