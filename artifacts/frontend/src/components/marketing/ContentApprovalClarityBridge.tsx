import { useEffect } from "react";

const GATE_ATTR = "data-vendorai-content-clarity-gate";
const STYLE_ID = "vendorai-content-approval-clarity-style";
const LEGACY_GATE_SELECTOR = '[data-vendorai-campaign-guidance="content-approval"]';

function textOf(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function findExact(text: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("span,div,p")).find(
    (element) => textOf(element) === text,
  ) ?? null;
}

function findProductionRoot() {
  const title = Array.from(document.querySelectorAll<HTMLElement>("p,div")).find((element) => {
    const text = textOf(element);
    return text === "Produção automática do planejamento"
      || text === "Produção do Plano de Mídia"
      || text === "Conteúdos do plano"
      || text === "Conteúdos & Criativos";
  });
  if (!title) return null;

  let card: HTMLElement | null = title;
  while (card && card !== document.body) {
    const className = typeof card.className === "string" ? card.className : "";
    if (className.includes("border") && className.includes("rounded")) break;
    card = card.parentElement;
  }

  return card?.parentElement ?? card;
}

function installStyle() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (style) return style;

  style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${LEGACY_GATE_SELECTOR} { display: none !important; }`;
  document.head.appendChild(style);
  return style;
}

function removeClarityGate() {
  document.querySelectorAll<HTMLElement>(`[${GATE_ATTR}]`).forEach((node) => node.remove());
}

function restoreProduction() {
  // Compatibilidade com a versão antiga do bridge: nunca deixe a produção escondida.
  document.querySelectorAll<HTMLElement>('[data-vendorai-content-blocked="true"]').forEach((node) => {
    node.removeAttribute("data-vendorai-content-blocked");
  });
  removeClarityGate();
}

function planningUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", "planejamento");
  return `/content?${params.toString()}`;
}

function createGate(productionRoot: HTMLElement) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute(GATE_ATTR, "true");
  wrapper.className = "mx-4 mt-5 md:mx-6";
  wrapper.innerHTML = `
    <div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm md:p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Novo lote aguardando aprovação</p>
          <h2 class="mt-1 text-base font-semibold text-foreground">Os materiais já gerados continuam disponíveis para revisão</h2>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
            Você pode revisar, editar e aprovar normalmente o que já foi produzido. Aprovar o próximo lote não inicia IA: a produção só começa quando um usuário autorizado clicar em “Produzir lote”.
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button type="button" data-vendorai-continue-review class="inline-flex min-h-10 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/40">
            Continuar revisando materiais
          </button>
          <button type="button" data-vendorai-review-planning class="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
            Revisar lote pendente
          </button>
        </div>
      </div>
    </div>`;

  wrapper.querySelector<HTMLButtonElement>("[data-vendorai-continue-review]")?.addEventListener("click", () => {
    productionRoot.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  wrapper.querySelector<HTMLButtonElement>("[data-vendorai-review-planning]")?.addEventListener("click", () => {
    window.history.pushState({}, "", planningUrl());
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  return wrapper;
}

function applyClarityState() {
  const params = new URLSearchParams(window.location.search);
  const onContentStep = window.location.pathname === "/content" && params.get("tab") === "conteudos";
  if (!onContentStep) {
    removeClarityGate();
    return;
  }

  // Na operação em lotes, o plano pode estar "em revisão" enquanto conteúdos de
  // lotes anteriores já existem. Portanto, status do planejamento NÃO pode mais
  // bloquear nem esconder materiais produzidos.
  restoreProduction();

  const inReview = Boolean(findExact("Plano em revisão"));
  const productionRoot = findProductionRoot();
  if (!inReview || !productionRoot) return;

  installStyle();
  const existingGate = document.querySelector<HTMLElement>(`[${GATE_ATTR}]`);
  if (!existingGate) {
    productionRoot.insertAdjacentElement("beforebegin", createGate(productionRoot));
  }
}

export function ContentApprovalClarityBridge() {
  useEffect(() => {
    let scheduled = false;
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        applyClarityState();
      });
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("popstate", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", run);
      restoreProduction();
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);

  return null;
}
