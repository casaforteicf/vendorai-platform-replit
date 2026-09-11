import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type CatalogProduct = {
  id: string;
  nome: string;
  ativo?: boolean;
};

type AdvancedDefinition = {
  key: string;
  group: "commercial" | "after-sales" | "documents";
  titles: string[];
};

const ADVANCED_DEFINITIONS: AdvancedDefinition[] = [
  {
    key: "closing",
    group: "commercial",
    titles: ["Tipo de Fechamento Padrão"],
  },
  {
    key: "stock",
    group: "commercial",
    titles: ["Confirmação de Estoque antes do Financeiro"],
  },
  {
    key: "review",
    group: "after-sales",
    titles: ["Link de Avaliação do Google"],
  },
  {
    key: "proposal",
    group: "documents",
    titles: ["Modelos de Proposta por Linha de Produto", "Propostas — modelos por linha de produto"],
  },
  {
    key: "contract",
    group: "documents",
    titles: ["Modelo de Contrato", "Contratos — modelo padrão"],
  },
  {
    key: "saas-contract",
    group: "documents",
    titles: ["Parâmetros do Contrato SaaS", "Configurações do Contrato SaaS"],
  },
];

const ADVANCED_GROUPS = [
  {
    key: "commercial",
    title: "Regras comerciais",
    description: "Fechamento padrão e confirmação de estoque antes do financeiro.",
  },
  {
    key: "after-sales",
    title: "Pós-venda e avaliações",
    description: "Configuração do link de avaliação enviado após uma experiência positiva.",
  },
  {
    key: "documents",
    title: "Propostas e contratos",
    description: "Modelos de proposta, contrato padrão e parâmetros contratuais avançados.",
  },
] as const;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function ConfigurationCatalogProductsBridge() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  }), []);

  const loadProducts = useCallback(async () => {
    if (!tenantId) {
      setProducts([]);
      setError("Não foi possível identificar a empresa atual.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/produtos-catalogo`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const data = await response.json() as CatalogProduct[];
      setProducts(Array.isArray(data) ? data : []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Erro desconhecido";
      setError(`Não foi possível carregar o Catálogo: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, tenantId]);

  useEffect(() => {
    let currentLegacyBlock: HTMLElement | null = null;
    let currentHost: HTMLElement | null = null;

    const install = () => {
      if (currentHost?.isConnected) return;
      const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
      if (!root) return;

      const heading = Array.from(root.querySelectorAll<HTMLElement>("h2, h3, h4, label")).find((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        return text === "Produtos e Serviços" || text === "Produtos e Serviços — referência legada";
      });
      if (!heading) return;

      const legacyBlock = heading.closest<HTMLElement>(".space-y-2") ?? heading.parentElement;
      if (!legacyBlock) return;

      const existingHost = legacyBlock.parentElement?.querySelector<HTMLElement>("[data-live-catalog-products-host='true']");
      if (existingHost) {
        currentLegacyBlock = legacyBlock;
        currentHost = existingHost;
        legacyBlock.hidden = true;
        legacyBlock.setAttribute("aria-hidden", "true");
        setMountNode(existingHost);
        return;
      }

      const host = document.createElement("div");
      host.dataset.liveCatalogProductsHost = "true";
      legacyBlock.insertAdjacentElement("beforebegin", host);
      legacyBlock.hidden = true;
      legacyBlock.setAttribute("aria-hidden", "true");
      legacyBlock.dataset.replacedByLiveCatalog = "true";

      currentLegacyBlock = legacyBlock;
      currentHost = host;
      setMountNode(host);
    };

    install();
    const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
    const observer = new MutationObserver(install);
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentLegacyBlock?.dataset.replacedByLiveCatalog === "true") {
        currentLegacyBlock.hidden = false;
        currentLegacyBlock.removeAttribute("aria-hidden");
        delete currentLegacyBlock.dataset.replacedByLiveCatalog;
      }
      currentHost?.remove();
    };
  }, []);

  useEffect(() => {
    const openedGroups = new Set<string>();
    let currentIndex: HTMLElement | null = null;

    const findCompanyPanel = (root: HTMLElement) => {
      const companyTab = Array.from(root.querySelectorAll<HTMLElement>("[role='tab']")).find((tab) => {
        const label = normalizeText(tab.getAttribute("aria-label") ?? "");
        const text = normalizeText(tab.textContent ?? "");
        return label === "empresa" || text === "empresa" || text === "perfil";
      });
      const controls = companyTab?.getAttribute("aria-controls");
      if (controls) return document.getElementById(controls) as HTMLElement | null;
      return root.querySelector<HTMLElement>("[role='tabpanel'][data-state='active']");
    };

    const findCard = (panel: HTMLElement, definition: AdvancedDefinition) => {
      const candidates = Array.from(panel.querySelectorAll<HTMLElement>("h2, h3, h4, strong, summary"));
      const normalizedTitles = definition.titles.map(normalizeText);
      const heading = candidates.find((element) => {
        const text = normalizeText(element.textContent ?? "");
        return normalizedTitles.some((title) => text === title || text.includes(title));
      });
      if (!heading) return null;
      return heading.closest<HTMLElement>(".rounded-xl, section, article, details") ?? heading.parentElement;
    };

    const install = () => {
      const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
      if (!root) return;
      const panel = findCompanyPanel(root);
      if (!panel) return;

      const cards = ADVANCED_DEFINITIONS
        .map((definition) => ({ definition, card: findCard(panel, definition) }))
        .filter((item): item is { definition: AdvancedDefinition; card: HTMLElement } => Boolean(item.card));

      if (cards.length === 0) return;

      cards.forEach(({ definition, card }) => {
        card.dataset.settingsAdvancedCard = definition.key;
        const opened = openedGroups.has(definition.group);
        card.hidden = !opened;
        if (opened) card.removeAttribute("aria-hidden");
        else card.setAttribute("aria-hidden", "true");
      });

      if (!currentIndex?.isConnected) {
        currentIndex = document.createElement("section");
        currentIndex.dataset.settingsAdvancedIndex = "true";
        currentIndex.className = "settings-advanced-index";
        cards[0].card.insertAdjacentElement("beforebegin", currentIndex);
      }

      currentIndex.innerHTML = `
        <style>
          .settings-advanced-index { margin: 1rem 0; padding: 1rem; border: 1px solid hsl(var(--border)); border-radius: .85rem; background: hsl(var(--card)); }
          .settings-advanced-index__head { display: grid; gap: .2rem; margin-bottom: .75rem; }
          .settings-advanced-index__head strong { font-size: .95rem; color: hsl(var(--foreground)); }
          .settings-advanced-index__head span { font-size: .75rem; line-height: 1.4; color: hsl(var(--muted-foreground)); }
          .settings-advanced-index__rows { display: grid; gap: .5rem; }
          .settings-advanced-index__row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .7rem .8rem; border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--background)); text-align: left; }
          .settings-advanced-index__row:hover { background: hsl(var(--muted) / .42); }
          .settings-advanced-index__copy { display: grid; gap: .12rem; min-width: 0; }
          .settings-advanced-index__copy b { font-size: .78rem; color: hsl(var(--foreground)); }
          .settings-advanced-index__copy span { font-size: .68rem; line-height: 1.35; color: hsl(var(--muted-foreground)); }
          .settings-advanced-index__action { flex: 0 0 auto; font-size: .7rem; font-weight: 700; color: hsl(var(--primary)); }
          @media (max-width: 640px) { .settings-advanced-index__row { align-items: flex-start; } }
        </style>
        <div class="settings-advanced-index__head">
          <strong>Configurações relacionadas</strong>
          <span>Itens menos usados ficam recolhidos para manter a aba Empresa curta. Abra somente o grupo que quiser editar.</span>
        </div>
        <div class="settings-advanced-index__rows">
          ${ADVANCED_GROUPS.map((group) => `
            <button type="button" class="settings-advanced-index__row" data-settings-group="${group.key}">
              <span class="settings-advanced-index__copy">
                <b>${group.title}</b>
                <span>${group.description}</span>
              </span>
              <span class="settings-advanced-index__action">${openedGroups.has(group.key) ? "Recolher" : "Abrir"}</span>
            </button>
          `).join("")}
        </div>
      `;

      currentIndex.querySelectorAll<HTMLButtonElement>("[data-settings-group]").forEach((button) => {
        button.addEventListener("click", () => {
          const group = button.dataset.settingsGroup;
          if (!group) return;
          const wasOpen = openedGroups.has(group);
          if (wasOpen) openedGroups.delete(group);
          else openedGroups.add(group);
          install();
          if (!wasOpen) {
            const first = cards.find((item) => item.definition.group === group)?.card;
            window.setTimeout(() => first?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
          }
        });
      });
    };

    install();
    const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
    const observer = new MutationObserver(install);
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      currentIndex?.remove();
      document.querySelectorAll<HTMLElement>("[data-settings-advanced-card]").forEach((card) => {
        card.hidden = false;
        card.removeAttribute("aria-hidden");
        delete card.dataset.settingsAdvancedCard;
      });
    };
  }, []);

  useEffect(() => {
    if (mountNode) void loadProducts();
  }, [loadProducts, mountNode]);

  const activeCount = useMemo(() => products.filter((product) => product.ativo !== false).length, [products]);

  if (!mountNode) return null;

  return createPortal(
    <section className="config-live-catalog" aria-label="Produtos e serviços do Catálogo">
      <style>{`
        .config-live-catalog { display: grid; gap: .55rem; width: 100%; margin: .15rem 0 .75rem; }
        .config-live-catalog__title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .35rem .75rem; }
        .config-live-catalog__title > strong { font-size: .9rem; color: hsl(var(--foreground)); }
        .config-live-catalog__count { font-size: .72rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__source { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem .65rem; padding: .75rem .8rem; border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--muted) / .32); }
        .config-live-catalog__source-copy { display: grid; gap: .12rem; flex: 1 1 26rem; min-width: 0; }
        .config-live-catalog__source-copy strong { font-size: .78rem; }
        .config-live-catalog__source-copy span { font-size: .72rem; line-height: 1.35; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-left: auto; }
        .config-live-catalog__action { display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 2rem; padding: .38rem .6rem; border: 1px solid hsl(var(--border)); border-radius: .5rem; background: hsl(var(--background)); font-size: .7rem; font-weight: 600; }
        .config-live-catalog__action:hover { background: hsl(var(--muted) / .55); }
        .config-live-catalog__action:disabled { opacity: .55; cursor: wait; }
        .config-live-catalog__error { padding: .65rem .75rem; border: 1px solid hsl(0 70% 50% / .28); border-radius: .6rem; background: hsl(0 70% 50% / .07); font-size: .72rem; line-height: 1.35; color: hsl(0 55% 40%); }
        @media (max-width: 640px) {
          .config-live-catalog__source { align-items: stretch; }
          .config-live-catalog__actions { width: 100%; margin-left: 0; }
          .config-live-catalog__action { flex: 1 1 auto; }
        }
      `}</style>

      <div className="config-live-catalog__title">
        <strong>Produtos e Serviços</strong>
        <span className="config-live-catalog__count">
          {loading ? "Carregando..." : `${products.length} cadastrados · ${activeCount} ativos`}
        </span>
      </div>

      <div className="config-live-catalog__source">
        <div className="config-live-catalog__source-copy">
          <strong>Fonte oficial: Catálogo</strong>
          <span>Produtos, serviços, preços, estoque e imagens são administrados no módulo Catálogo. As Configurações mostram apenas este resumo.</span>
        </div>
        <div className="config-live-catalog__actions">
          <button type="button" className="config-live-catalog__action" onClick={() => void loadProducts()} disabled={loading}>
            <RefreshCw size={13} /> Atualizar
          </button>
          <a className="config-live-catalog__action" href="/catalogo">
            <ExternalLink size={13} /> Abrir Catálogo
          </a>
        </div>
      </div>

      {error && <div className="config-live-catalog__error" role="alert">{error}</div>}
    </section>,
    mountNode,
  );
}
