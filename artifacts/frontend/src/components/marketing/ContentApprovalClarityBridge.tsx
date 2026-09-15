import { useEffect } from "react";

const BLOCKED_ATTR = "data-vendorai-content-blocked";
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
    return text === "Produção automática do planejamento" || text === "Produção do Plano de Mídia";
  });
  if (!title) return null;

  let card: HTMLElement | null = title;
  while (card && card !== document.body) {
    const className = typeof card.className === "string" ? card.className : "";
    if (className.includes("border") && className.includes("rounded")) break;
    card = card.parentElement;
  }

  return card?.parentElement ?? null;
}

function installStyle() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (style) return style;

  style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${BLOCKED_ATTR}="true"] { display: none !important; }
    ${LEGACY_GATE_SELECTOR} { display: none !important; }
  `;
  document.head.appendChild(style);
  return style;
}

function removeClarityGate() {
  document.querySelectorAll<HTMLElement>(`[${GATE_ATTR}]`).forEach((node) => node.remove());
}

function restoreProduction() {
  document.querySelectorAll<HTMLElement>(`[${BLOCKED_ATTR}="true"]`).forEach((node) => {
    node.removeAttribute(BLOCKED_ATTR);
  });
  document.getElementById(STYLE_ID)?.remove();
  removeClarityGate();
}

function createGate() {
  const wrapper = document.createElement("div");
  wrapper.setAttribute(GATE_ATTR, "true");
  wrapper.className = "mx-4 mt-5 md:mx-6";
  wrapper.innerHTML = `
    <div class="rounded-xl border border-primary/20 bg-background p-5 shadow-sm md:p-6">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="max-w-3xl">
          <p class="text-xs font-semibold uppercase tracking-wide text-primary">Próximo passo</p>
          <h2 class="mt-1 text-lg font-semibold text-foreground">Aprove o planejamento para liberar os conteúdos</h2>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
            Nada precisa ser produzido nesta tela antes da aprovação. Revise o planejamento uma vez; depois a IA inicia automaticamente os conteúdos e criativos do plano.
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span class="rounded-full border bg-muted/30 px-3 py-1.5 font-medium text-foreground">1. Aprovar planejamento</span>
            <span aria-hidden="true">→</span>
            <span class="rounded-full border px-3 py-1.5">2. IA produz</span>
            <span aria-hidden="true">→</span>
            <span class="rounded-full border px-3 py-1.5">3. Você revisa</span>
          </div>
        </div>
        <button type="button" data-vendorai-review-planning class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Revisar e aprovar planejamento
        </button>
      </div>
    </div>`;

  wrapper.querySelector<HTMLButtonElement>("[data-vendorai-review-planning]")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/content?tab=planejamento");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  return wrapper;
}

function applyClarityState() {
  const params = new URLSearchParams(window.location.search);
  const onContentStep = window.location.pathname === "/content" && params.get("tab") === "conteudos";
  if (!onContentStep) {
    restoreProduction();
    return;
  }

  const inReview = Boolean(findExact("Plano em revisão"));
  const productionRoot = findProductionRoot();
  if (!inReview || !productionRoot) {
    restoreProduction();
    return;
  }

  installStyle();
  productionRoot.setAttribute(BLOCKED_ATTR, "true");

  const existingGate = document.querySelector<HTMLElement>(`[${GATE_ATTR}]`);
  if (!existingGate) {
    productionRoot.insertAdjacentElement("beforebegin", createGate());
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
    };
  }, []);

  return null;
}
