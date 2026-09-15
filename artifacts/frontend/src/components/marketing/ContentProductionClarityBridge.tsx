import { useEffect } from "react";

const SUMMARY_ATTR = "data-vendorai-simple-production-summary";
const DETAILS_ATTR = "data-vendorai-production-details";
const HIDDEN_ATTR = "data-vendorai-production-secondary-hidden";
const STYLE_ID = "vendorai-production-clarity-style";

function textOf(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function findExact(selector: string, values: string[]) {
  const normalizedValues = values.map(normalize);
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) =>
    normalizedValues.includes(normalize(textOf(element))),
  ) ?? null;
}

function closestBorderedCard(element: HTMLElement | null) {
  let current = element;
  while (current && current !== document.body) {
    const className = typeof current.className === "string" ? current.className : "";
    if (className.includes("border") && (className.includes("rounded") || className.includes("shadow"))) return current;
    current = current.parentElement;
  }
  return null;
}

function findProductionOverview() {
  const title = findExact("p,div", ["Produção automática do planejamento", "Produção do Plano de Mídia"]);
  if (!title) return null;
  return closestBorderedCard(title);
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${HIDDEN_ATTR}="true"] { display: none !important; }
    [${SUMMARY_ATTR}] { margin-top: .25rem; }
    [${SUMMARY_ATTR}] .vendorai-simple-metric {
      min-width: 0;
      border: 1px solid hsl(var(--border));
      border-radius: .75rem;
      background: hsl(var(--background));
      padding: .85rem 1rem;
    }
    [${SUMMARY_ATTR}] .vendorai-simple-metric-label {
      font-size: .7rem;
      line-height: 1rem;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: hsl(var(--muted-foreground));
    }
    [${SUMMARY_ATTR}] .vendorai-simple-metric-value {
      margin-top: .2rem;
      font-size: 1.35rem;
      line-height: 1.75rem;
      font-weight: 700;
      color: hsl(var(--foreground));
    }
    [${SUMMARY_ATTR}] .vendorai-simple-metric-help {
      margin-top: .15rem;
      font-size: .7rem;
      color: hsl(var(--muted-foreground));
    }
    [${DETAILS_ATTR}] summary { list-style: none; cursor: pointer; }
    [${DETAILS_ATTR}] summary::-webkit-details-marker { display: none; }
  `;
  document.head.appendChild(style);
}

function hideSecondary(element: HTMLElement | null) {
  if (!element) return;
  element.setAttribute(HIDDEN_ATTR, "true");
}

function restoreSecondary() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((element) => element.removeAttribute(HIDDEN_ATTR));
  document.querySelectorAll<HTMLElement>(`[${SUMMARY_ATTR}], [${DETAILS_ATTR}]`).forEach((element) => element.remove());
  document.getElementById(STYLE_ID)?.remove();
}

function numberNearLabel(root: HTMLElement, labels: string[]) {
  const label = Array.from(root.querySelectorAll<HTMLElement>("p,span,div")).find((element) =>
    labels.map(normalize).includes(normalize(textOf(element))),
  );
  if (!label) return 0;
  const card = closestBorderedCard(label) ?? label.parentElement;
  if (!card) return 0;
  const numeric = Array.from(card.querySelectorAll<HTMLElement>("p,span,div")).map(textOf).find((value) => /^\d+$/.test(value));
  return numeric ? Number(numeric) : 0;
}

function findMetricGrid(root: HTMLElement) {
  const ready = Array.from(root.querySelectorAll<HTMLElement>("p,span,div")).find((element) => {
    const text = normalize(textOf(element));
    return text === "prontos" || text === "prontos para gerar";
  });
  if (!ready) return null;
  let current = ready.parentElement;
  while (current && current !== root) {
    const text = normalize(textOf(current));
    if (text.includes("em revisao") && text.includes("publicados") && current.children.length >= 3) return current;
    current = current.parentElement;
  }
  return null;
}

function createSummary(root: HTMLElement) {
  const ready = numberNearLabel(root, ["Prontos", "Prontos para gerar"]);
  const review = numberNearLabel(root, ["Em revisão"]);
  const approved = numberNearLabel(root, ["Aprovados"]);
  const published = numberNearLabel(root, ["Publicados"]);
  const pending = numberNearLabel(root, ["Outros", "Pendentes"]);

  const summary = document.createElement("div");
  summary.setAttribute(SUMMARY_ATTR, "true");
  summary.className = "grid grid-cols-1 gap-2 sm:grid-cols-3";
  summary.innerHTML = `
    <div class="vendorai-simple-metric">
      <p class="vendorai-simple-metric-label">Para produzir</p>
      <p class="vendorai-simple-metric-value">${ready + pending}</p>
      <p class="vendorai-simple-metric-help">A IA ainda precisa preparar estas peças.</p>
    </div>
    <div class="vendorai-simple-metric">
      <p class="vendorai-simple-metric-label">Para revisar</p>
      <p class="vendorai-simple-metric-value">${review}</p>
      <p class="vendorai-simple-metric-help">Conteúdos prontos aguardando sua decisão.</p>
    </div>
    <div class="vendorai-simple-metric">
      <p class="vendorai-simple-metric-label">Concluídos</p>
      <p class="vendorai-simple-metric-value">${approved + published}</p>
      <p class="vendorai-simple-metric-help">Aprovados ou já publicados.</p>
    </div>`;
  return summary;
}

function findFailureNotice() {
  return Array.from(document.querySelectorAll<HTMLElement>("div,p,span")).find((element) => {
    const text = normalize(textOf(element));
    return text.includes("material(is) com falha") || text.includes("producao protegida:");
  }) ?? null;
}

function nativeButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    normalize(textOf(button)) === normalize(label) && button.offsetParent !== null,
  ) ?? null;
}

function createDetails(root: HTMLElement, failureText: string, usageText: string) {
  const details = document.createElement("details");
  details.setAttribute(DETAILS_ATTR, "true");
  details.className = "rounded-xl border bg-muted/10 px-4 py-3";
  details.innerHTML = `
    <summary class="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
      <span>Opções e detalhes</span>
      <span class="text-xs font-normal text-muted-foreground">Biblioteca, consumo e problemas técnicos</span>
    </summary>
    <div class="mt-3 border-t pt-3 space-y-3">
      <div class="flex flex-wrap gap-2">
        <a href="/midias" class="inline-flex min-h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted">Biblioteca de Mídias</a>
        <button type="button" data-vendorai-create-outside class="inline-flex min-h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted">Criar fora do plano</button>
        <button type="button" data-vendorai-refresh-production class="inline-flex min-h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted">Atualizar dados</button>
      </div>
      ${usageText ? `<p class="text-xs text-muted-foreground">${usageText}</p>` : ""}
      ${failureText ? `<div class="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800"><strong>Problemas técnicos:</strong> ${failureText}</div>` : ""}
    </div>`;

  details.querySelector<HTMLButtonElement>("[data-vendorai-create-outside]")?.addEventListener("click", () => {
    const original = document.querySelector<HTMLButtonElement>('[data-vendorai-original-create-outside="true"]');
    if (original) original.click();
    else {
      window.history.pushState({}, "", "/content?tab=gerador&mode=avulso");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  });

  details.querySelector<HTMLButtonElement>("[data-vendorai-refresh-production]")?.addEventListener("click", () => {
    document.querySelector<HTMLButtonElement>('[data-vendorai-original-refresh="true"]')?.click();
  });

  return details;
}

function simplifyApprovedProduction() {
  const params = new URLSearchParams(window.location.search);
  const onContent = window.location.pathname === "/content" && params.get("tab") === "conteudos";
  const approved = Boolean(findExact("span,div", ["Plano aprovado"]));
  if (!onContent || !approved) {
    restoreSecondary();
    return;
  }

  const overview = findProductionOverview();
  if (!overview) return;
  ensureStyle();

  const title = findExact("p", ["Produção automática do planejamento", "Produção do Plano de Mídia"]);
  if (title) title.textContent = "Conteúdos do plano";
  const intro = title?.parentElement?.querySelectorAll<HTMLParagraphElement>("p")[1];
  if (intro) intro.textContent = "A IA prepara o que falta. Sua principal tarefa aqui é revisar e aprovar o que estiver pronto.";

  const flow = overview.querySelector<HTMLElement>('[data-vendorai-content-flow-help]');
  if (flow) flow.innerHTML = "<span>1. Produzir</span><span>2. Revisar</span><span>3. Publicar</span>";

  const metricGrid = findMetricGrid(overview);
  if (metricGrid) hideSecondary(metricGrid);

  let summary = overview.querySelector<HTMLElement>(`[${SUMMARY_ATTR}]`);
  const freshSummary = createSummary(overview);
  if (!summary) {
    const anchor = flow?.parentElement ?? title?.parentElement ?? overview.firstElementChild;
    anchor?.insertAdjacentElement("afterend", freshSummary);
    summary = freshSummary;
  } else if (summary.innerHTML !== freshSummary.innerHTML) {
    summary.replaceWith(freshSummary);
    summary = freshSummary;
  }

  const referenceTitle = findExact("p", ["Referências reais do negócio"]);
  const referenceBlock = referenceTitle ? closestBorderedCard(referenceTitle) : null;
  if (referenceBlock) hideSecondary(referenceBlock);

  const allTextRows = Array.from(overview.querySelectorAll<HTMLElement>("div,p"));
  const usageRow = allTextRows.find((element) => {
    const text = normalize(textOf(element));
    return text.includes("geracoes usadas no periodo") || text.includes("geracoes usadas no período");
  }) ?? null;
  const usageText = usageRow ? textOf(usageRow) : "";
  if (usageRow) hideSecondary(usageRow);

  const createOutside = nativeButton("Criar fora do plano") ?? nativeButton("Criação avulsa");
  if (createOutside) {
    createOutside.setAttribute("data-vendorai-original-create-outside", "true");
    hideSecondary(createOutside);
  }
  const refresh = nativeButton("Atualizar");
  if (refresh) {
    refresh.setAttribute("data-vendorai-original-refresh", "true");
    hideSecondary(refresh);
  }

  const failureNotice = findFailureNotice();
  const failureText = failureNotice ? textOf(failureNotice) : "";
  const failureCard = failureNotice ? closestBorderedCard(failureNotice) ?? failureNotice : null;
  if (failureCard && !overview.contains(failureCard)) hideSecondary(failureCard);

  document.querySelectorAll<HTMLElement>("span").forEach((span) => {
    if (/^\d+\s+falha\(s\)$/i.test(textOf(span))) hideSecondary(span);
  });

  let details = overview.querySelector<HTMLElement>(`[${DETAILS_ATTR}]`);
  const freshDetails = createDetails(overview, failureText, usageText);
  if (!details) {
    overview.appendChild(freshDetails);
  } else if (details.innerHTML !== freshDetails.innerHTML) {
    const wasOpen = (details as HTMLDetailsElement).open;
    freshDetails.open = wasOpen;
    details.replaceWith(freshDetails);
  }
}

export function ContentProductionClarityBridge() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(simplifyApprovedProduction);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("popstate", schedule);
    const timer = window.setInterval(schedule, 900);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
      restoreSecondary();
    };
  }, []);

  return null;
}
