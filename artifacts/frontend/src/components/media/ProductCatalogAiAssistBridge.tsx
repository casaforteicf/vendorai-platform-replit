import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const FIELD_LABELS: Record<string, string> = {
  descricaoCompleta: "Descrição completa",
  caracteristicas: "Características",
  beneficios: "Benefícios",
  diferenciais: "Diferenciais",
  aplicacoes: "Aplicações",
  publicoIndicado: "Público / cliente indicado",
  argumentosComerciais: "Argumentos comerciais",
  duvidasFrequentes: "Dúvidas frequentes",
  objecoesRespostas: "Objeções e respostas",
  garantia: "Garantia",
  instalacao: "Instalação / uso",
  entrega: "Entrega / prazo",
  observacoesIa: "Observações para IA",
  condicoesPagamento: "Preço parcelado",
  tags: "Tags",
};

function normalized(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

function findField(root: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement | null {
  const target = normalized(label);
  const labelNode = Array.from(root.querySelectorAll<HTMLLabelElement>("label"))
    .find((item) => normalized(item.textContent).startsWith(target));
  return labelNode?.querySelector<HTMLInputElement | HTMLTextAreaElement>("textarea,input") ?? null;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" };
}

export default function ProductCatalogAiAssistBridge() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();

  useEffect(() => {
    if (!tenantId) return;

    const install = () => {
      const root = document.querySelector<HTMLElement>('[data-product-knowledge-root="true"]');
      if (!root || root.querySelector('[data-product-ai-assist="true"]')) return;
      const aside = root.querySelector<HTMLElement>("aside");
      if (!aside) return;
      const availableTitle = Array.from(aside.querySelectorAll<HTMLElement>("p"))
        .find((node) => normalized(node.textContent) === normalized("Disponível para IA"));
      const referenceBlock = availableTitle?.closest<HTMLElement>("div.rounded-2xl");
      if (!referenceBlock?.parentElement) return;

      const wrapper = document.createElement("div");
      wrapper.dataset.productAiAssist = "true";
      wrapper.className = "rounded-2xl border border-blue-200 bg-blue-50 p-3";
      wrapper.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-blue-950">Apoio da IA</p>
            <p class="mt-1 text-xs leading-relaxed text-blue-800">Completa somente campos vazios com base no que já está cadastrado. Revise antes de salvar.</p>
          </div>
          <button type="button" data-product-ai-fill="true" class="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-blue-500 px-3 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-60">Preencher vazios</button>
        </div>`;
      referenceBlock.insertAdjacentElement("afterend", wrapper);

      const button = wrapper.querySelector<HTMLButtonElement>('[data-product-ai-fill="true"]');
      if (!button) return;
      button.addEventListener("click", async () => {
        const currentRoot = document.querySelector<HTMLElement>('[data-product-knowledge-root="true"]');
        const currentAside = currentRoot?.querySelector<HTMLElement>("aside");
        if (!currentAside) return;
        const productName = currentAside.querySelector<HTMLElement>("h2")?.textContent?.trim() ?? "";
        if (!productName) {
          toast({ title: "Selecione um produto antes de usar a IA", variant: "destructive" });
          return;
        }

        const current: Record<string, string> = {};
        for (const [key, label] of Object.entries(FIELD_LABELS)) {
          current[key] = findField(currentAside, label)?.value ?? "";
        }
        const subtitle = Array.from(currentAside.querySelectorAll<HTMLElement>("p"))
          .find((node) => node.textContent?.includes("·") && node.closest("div.flex"))?.textContent?.trim() ?? "";

        button.disabled = true;
        const previousText = button.textContent;
        button.textContent = "Gerando...";
        try {
          const response = await fetch(`/api/tenants/${tenantId}/product-knowledge/ai-fill`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              nome: productName,
              categoria: subtitle.split("·")[0]?.trim() ?? "",
              tipo: "produto",
              descricao: current.descricaoCompleta || "",
              current,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "A IA não conseguiu gerar sugestões.");
          const fields = body.fields ?? {};
          let filled = 0;
          for (const [key, label] of Object.entries(FIELD_LABELS)) {
            const element = findField(currentAside, label);
            const suggestion = typeof fields[key] === "string" ? fields[key].trim() : "";
            if (!element || element.value.trim() || !suggestion) continue;
            setNativeValue(element, suggestion);
            filled += 1;
          }
          toast({
            title: filled > 0 ? `${filled} campo(s) preenchido(s) pela IA` : "Nenhum campo vazio pôde ser preenchido",
            description: filled > 0 ? "Revise as sugestões e clique em Salvar informações." : "A IA não encontrou dados suficientes para sugerir sem inventar informações.",
          });
        } catch (error) {
          toast({ title: "Apoio da IA indisponível", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
        } finally {
          button.disabled = false;
          button.textContent = previousText || "Preencher vazios";
        }
      });
    };

    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll('[data-product-ai-assist="true"]').forEach((node) => node.remove());
    };
  }, [tenantId, toast]);

  return null;
}
