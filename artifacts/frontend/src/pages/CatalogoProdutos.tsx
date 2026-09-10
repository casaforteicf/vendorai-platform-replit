import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CatalogoModal } from "./Propostas";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FolderTree } from "lucide-react";

type CatalogProductSummary = {
  id: string;
  nome: string;
  ativo: boolean;
};

export default function CatalogoProdutos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId ?? "";

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    let produtos: CatalogProductSummary[] = [];

    const authHeaders = () => ({
      Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
      "Content-Type": "application/json",
    });

    const carregarProdutos = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/produtos-catalogo`, {
          headers: authHeaders(),
        });
        if (!response.ok) return;
        const data = await response.json() as CatalogProductSummary[];
        if (!cancelled) produtos = data;
      } catch {
        // O catálogo principal continua funcional mesmo se esta melhoria auxiliar falhar.
      }
    };

    const montarControleAtivo = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']"));
      const dialog = dialogs.find((item) => item.textContent?.includes("Editar Produto"));
      if (!dialog || dialog.querySelector("[data-catalog-active-control='true']")) return;

      const nomeInput = dialog.querySelector<HTMLInputElement>("input");
      const nomeAtual = nomeInput?.value?.trim();
      if (!nomeAtual) return;
      const produto = produtos.find((item) => item.nome.trim() === nomeAtual);
      if (!produto) return;

      const control = document.createElement("div");
      control.dataset.catalogActiveControl = "true";
      control.style.display = "flex";
      control.style.alignItems = "center";
      control.style.justifyContent = "space-between";
      control.style.gap = "12px";
      control.style.padding = "12px 14px";
      control.style.margin = "4px 0 12px";
      control.style.border = "1px solid hsl(var(--border))";
      control.style.borderRadius = "10px";
      control.style.background = "hsl(var(--muted) / .25)";

      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "Produto ativo";
      title.style.display = "block";
      title.style.fontSize = "14px";
      const description = document.createElement("span");
      description.textContent = "Desative para ocultar o produto dos fluxos e canais sem excluir o cadastro.";
      description.style.display = "block";
      description.style.marginTop = "2px";
      description.style.fontSize = "12px";
      description.style.color = "hsl(var(--muted-foreground))";
      copy.append(title, description);

      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-label", "Produto ativo");
      button.style.width = "46px";
      button.style.height = "26px";
      button.style.borderRadius = "999px";
      button.style.padding = "3px";
      button.style.border = "0";
      button.style.transition = "background 140ms ease";
      button.style.cursor = "pointer";
      button.style.flex = "0 0 auto";

      const knob = document.createElement("span");
      knob.style.display = "block";
      knob.style.width = "20px";
      knob.style.height = "20px";
      knob.style.borderRadius = "999px";
      knob.style.background = "white";
      knob.style.boxShadow = "0 1px 3px rgba(0,0,0,.18)";
      knob.style.transition = "transform 140ms ease";
      button.appendChild(knob);

      const render = (ativo: boolean, saving = false) => {
        button.setAttribute("aria-checked", String(ativo));
        button.disabled = saving;
        button.style.opacity = saving ? ".65" : "1";
        button.style.background = ativo ? "#16a34a" : "#d4d4d8";
        knob.style.transform = ativo ? "translateX(20px)" : "translateX(0)";
        title.textContent = ativo ? "Produto ativo" : "Produto inativo";
      };

      render(produto.ativo);

      button.addEventListener("click", async () => {
        const next = button.getAttribute("aria-checked") !== "true";
        render(!next, true);
        try {
          const response = await fetch(`/api/produtos-catalogo/${produto.id}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ ativo: next }),
          });
          if (!response.ok) throw new Error("Falha ao atualizar produto");
          produto.ativo = next;
          render(next, false);
          await queryClient.invalidateQueries({ queryKey: ["/tenants", tenantId, "produtos-catalogo"] });
          await queryClient.invalidateQueries({ queryKey: ["produtos-catalogo", tenantId] });
        } catch {
          render(produto.ativo, false);
        }
      });

      control.append(copy, button);
      const header = dialog.querySelector<HTMLElement>("[class*='SheetHeader'], [class*='DialogHeader']") ?? dialog.firstElementChild;
      if (header?.nextSibling) dialog.insertBefore(control, header.nextSibling);
      else dialog.prepend(control);
    };

    void carregarProdutos().then(() => montarControleAtivo());
    const observer = new MutationObserver(() => montarControleAtivo());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [tenantId, queryClient]);

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
