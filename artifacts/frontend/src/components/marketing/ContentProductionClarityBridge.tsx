import { useEffect } from "react";

const ROOT_ATTR = "data-vendorai-review-workspace";
const HIDDEN_ATTR = "data-vendorai-review-hidden";
const ROW_ATTR = "data-vendorai-review-row";
const CHECK_ATTR = "data-vendorai-review-check";
const DRAWER_ATTR = "data-vendorai-review-drawer";
const STYLE_ID = "vendorai-review-workspace-style";

function textOf(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function findExact(selector: string, values: string[], root: ParentNode = document) {
  const normalizedValues = values.map(normalize);
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find((element) =>
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

function nativeButton(label: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    normalize(textOf(button)) === normalize(label) && button.offsetParent !== null,
  ) ?? null;
}

function findProductionOverview() {
  const title = findExact("p,div", ["Produção automática do planejamento", "Produção do Plano de Mídia", "Conteúdos do plano"]);
  return title ? closestBorderedCard(title) : null;
}

function numberNearLabel(root: HTMLElement, labels: string[]) {
  const normalizedLabels = labels.map(normalize);
  const label = Array.from(root.querySelectorAll<HTMLElement>("p,span,div")).find((element) =>
    normalizedLabels.includes(normalize(textOf(element))),
  );
  if (!label) return 0;
  const card = closestBorderedCard(label) ?? label.parentElement;
  if (!card) return 0;
  const numeric = Array.from(card.querySelectorAll<HTMLElement>("p,span,div"))
    .map(textOf)
    .find((value) => /^\d+$/.test(value));
  return numeric ? Number(numeric) : 0;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${HIDDEN_ATTR}="true"] { display: none !important; }
    [${ROOT_ATTR}] { margin: .25rem 0 .75rem; }
    .vendorai-review-shell { border:1px solid hsl(var(--border)); border-radius:16px; background:hsl(var(--background)); overflow:hidden; }
    .vendorai-review-context { display:grid; grid-template-columns:minmax(0,1.7fr) auto minmax(220px,.8fr); gap:14px; align-items:center; padding:14px 16px; border-bottom:1px solid hsl(var(--border)); }
    .vendorai-review-label { font-size:11px; color:hsl(var(--muted-foreground)); margin-bottom:4px; }
    .vendorai-review-select { min-height:46px; border:1px solid hsl(var(--border)); border-radius:10px; padding:8px 12px; background:hsl(var(--background)); }
    .vendorai-review-select strong { display:block; font-size:13px; }
    .vendorai-review-select span { display:block; margin-top:2px; font-size:11px; color:hsl(var(--muted-foreground)); }
    .vendorai-review-secondary { min-height:40px; border:1px solid hsl(var(--border)); border-radius:10px; background:hsl(var(--background)); padding:0 14px; font-size:12px; font-weight:600; cursor:pointer; }
    .vendorai-review-journey { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; padding:16px; border-bottom:1px solid hsl(var(--border)); }
    .vendorai-journey-step { position:relative; min-width:0; }
    .vendorai-journey-head { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:700; }
    .vendorai-journey-dot { width:20px; height:20px; display:grid; place-items:center; border-radius:999px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); font-size:11px; }
    .vendorai-journey-step.done .vendorai-journey-dot { background:#059669; border-color:#059669; color:white; }
    .vendorai-journey-step.active .vendorai-journey-dot { border:3px solid #2563eb; }
    .vendorai-journey-help { margin:5px 0 0 27px; font-size:10px; color:hsl(var(--muted-foreground)); }
    .vendorai-review-metrics { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; padding:14px 16px; }
    .vendorai-review-metric { border:1px solid hsl(var(--border)); border-radius:12px; padding:11px 12px; background:hsl(var(--background)); }
    .vendorai-review-metric.active { border-color:#fed7aa; background:#fff7ed; }
    .vendorai-review-metric.attn { border-color:#fecaca; background:#fff7f7; }
    .vendorai-review-metric p:first-child { font-size:10px; color:hsl(var(--muted-foreground)); text-transform:uppercase; letter-spacing:.04em; }
    .vendorai-review-metric strong { display:block; margin-top:3px; font-size:20px; line-height:1; }
    .vendorai-review-alert { margin:0 16px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #fed7aa; background:#fff7ed; border-radius:12px; padding:10px 12px; font-size:12px; }
    .vendorai-review-alert strong { color:#c2410c; }
    .vendorai-review-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 0; }
    .vendorai-filter { min-height:32px; border:1px solid hsl(var(--border)); border-radius:999px; background:hsl(var(--background)); padding:0 12px; font-size:11px; cursor:pointer; }
    .vendorai-filter.active { background:#2563eb; color:white; border-color:#2563eb; }
    .vendorai-review-spacer { flex:1; }
    .vendorai-batch { min-height:34px; border:1px solid hsl(var(--border)); border-radius:9px; background:hsl(var(--background)); padding:0 12px; font-size:11px; font-weight:600; cursor:pointer; }
    [${ROW_ATTR}] { position:relative; transition:.15s ease; padding-left:44px !important; }
    [${ROW_ATTR}].vendorai-review-selected { border-color:#bfdbfe !important; box-shadow:0 0 0 1px rgba(37,99,235,.18); }
    [${CHECK_ATTR}] { position:absolute; left:14px; top:18px; width:16px; height:16px; accent-color:#2563eb; }
    [${ROW_ATTR}] button { white-space:nowrap; }
    .vendorai-open-preview { border-color:hsl(var(--border)) !important; background:hsl(var(--background)) !important; }
    [${DRAWER_ATTR}] { position:fixed; z-index:80; right:14px; top:74px; bottom:14px; width:min(390px,calc(100vw - 28px)); background:hsl(var(--background)); border:1px solid hsl(var(--border)); border-radius:16px; box-shadow:0 18px 55px rgba(15,23,42,.18); overflow:auto; }
    .vendorai-drawer-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; padding:14px 16px; background:hsl(var(--background)); border-bottom:1px solid hsl(var(--border)); }
    .vendorai-drawer-body { padding:14px 16px 18px; }
    .vendorai-drawer-preview { border:1px solid hsl(var(--border)); border-radius:14px; overflow:hidden; background:hsl(var(--muted)/.25); min-height:180px; display:grid; place-items:center; }
    .vendorai-drawer-preview img { width:100%; max-height:420px; object-fit:cover; }
    .vendorai-drawer-copy { margin-top:12px; white-space:pre-wrap; font-size:12px; line-height:1.55; }
    .vendorai-drawer-meta { margin-top:12px; display:grid; gap:7px; font-size:11px; }
    .vendorai-drawer-meta div { display:grid; grid-template-columns:92px 1fr; gap:8px; }
    .vendorai-drawer-meta span:first-child { color:hsl(var(--muted-foreground)); }
    .vendorai-drawer-actions { margin-top:16px; display:grid; gap:8px; }
    .vendorai-drawer-primary { min-height:42px; border:0; border-radius:10px; background:#2563eb; color:white; font-weight:700; cursor:pointer; }
    .vendorai-drawer-secondary-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .vendorai-drawer-secondary { min-height:38px; border:1px solid hsl(var(--border)); border-radius:9px; background:hsl(var(--background)); font-size:11px; font-weight:600; cursor:pointer; }
    @media (max-width:1100px) { .vendorai-review-metrics { grid-template-columns:repeat(3,1fr); } .vendorai-review-context{grid-template-columns:1fr auto;} .vendorai-review-context > :last-child{grid-column:1/-1;} }
    @media (max-width:760px) { .vendorai-review-journey{grid-template-columns:1fr 1fr;} .vendorai-review-metrics{grid-template-columns:1fr 1fr;} .vendorai-review-context{grid-template-columns:1fr;} .vendorai-drawer-secondary-grid{grid-template-columns:1fr;} }
  `;
  document.head.appendChild(style);
}

function hide(element: HTMLElement | null) {
  if (element) element.setAttribute(HIDDEN_ATTR, "true");
}

function restore() {
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((element) => element.removeAttribute(HIDDEN_ATTR));
  document.querySelectorAll<HTMLElement>(`[${ROOT_ATTR}], [${DRAWER_ATTR}]`).forEach((element) => element.remove());
  document.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`).forEach((element) => {
    element.removeAttribute(ROW_ATTR);
    element.classList.remove("vendorai-review-selected");
    element.querySelector<HTMLInputElement>(`[${CHECK_ATTR}]`)?.remove();
  });
  document.getElementById(STYLE_ID)?.remove();
}

function findRows(overview: HTMLElement) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
    const label = normalize(textOf(button));
    return ["revisar", "fechar", "aprovar", "nova versao", "gerar automatico", "abrir executor"].includes(label);
  });
  const rows: HTMLElement[] = [];
  buttons.forEach((button) => {
    const card = closestBorderedCard(button);
    if (card && card !== overview && !overview.contains(card) && !rows.includes(card)) rows.push(card);
  });
  return rows;
}

function rowStatus(row: HTMLElement) {
  const value = normalize(textOf(row));
  if (value.includes("com erro") || value.includes("falha")) return "erro";
  if (value.includes("conteudo aprovado") || value.includes("aprovado")) return "aprovado";
  if (value.includes("em revisao")) return "revisao";
  if (value.includes("em producao")) return "produzindo";
  if (value.includes("pronto para produzir")) return "produzir";
  if (value.includes("publicado")) return "publicado";
  return "outro";
}

function createDrawer(row: HTMLElement) {
  document.querySelector<HTMLElement>(`[${DRAWER_ATTR}]`)?.remove();
  const drawer = document.createElement("aside");
  drawer.setAttribute(DRAWER_ATTR, "true");
  const title = Array.from(row.querySelectorAll<HTMLElement>("p")).map(textOf).find((value) => value.length > 8) ?? "Conteúdo gerado";
  const badges = Array.from(row.querySelectorAll<HTMLElement>("span")).map(textOf).filter(Boolean).slice(0, 6);
  const metaLine = Array.from(row.querySelectorAll<HTMLElement>("p")).map(textOf).find((value) => value.includes(" · ")) ?? "";
  const previewText = Array.from(row.querySelectorAll<HTMLElement>("p")).map(textOf).filter((value) => value.length > 20 && value !== title).join("\n\n");
  const image = row.querySelector<HTMLImageElement>("img");
  const refText = badges.find((value) => /\d+ ref\./i.test(value)) ?? "Referências do plano";

  drawer.innerHTML = `
    <div class="vendorai-drawer-head"><strong>Prévia do conteúdo</strong><button type="button" data-close style="border:0;background:transparent;font-size:22px;cursor:pointer">×</button></div>
    <div class="vendorai-drawer-body">
      <div class="vendorai-drawer-preview">${image ? `<img src="${image.src}" alt="Prévia do conteúdo" />` : `<div style="padding:30px;text-align:center;color:hsl(var(--muted-foreground));font-size:12px">Abra a prévia para carregar o visual completo.</div>`}</div>
      <h3 style="margin-top:12px;font-size:14px;font-weight:700">${title}</h3>
      <div class="vendorai-drawer-meta">
        <div><span>Campanha</span><strong>${metaLine.split(" · ")[0] || "Campanha atual"}</strong></div>
        <div><span>Canal / Formato</span><strong>${badges.slice(0,2).join(" · ") || "Conteúdo"}</strong></div>
        <div><span>Status</span><strong>${badges.find((value) => /revis|aprov|produ|public|erro/i.test(value)) || "Em revisão"}</strong></div>
        <div><span>Referências</span><strong>${refText}</strong></div>
      </div>
      ${previewText ? `<div class="vendorai-drawer-copy">${previewText}</div>` : ""}
      <div class="vendorai-drawer-actions">
        <button type="button" class="vendorai-drawer-primary" data-approve>Aprovar conteúdo</button>
        <div class="vendorai-drawer-secondary-grid">
          <button type="button" class="vendorai-drawer-secondary" data-edit>Editar conteúdo</button>
          <button type="button" class="vendorai-drawer-secondary" data-brief>Editar briefing</button>
          <button type="button" class="vendorai-drawer-secondary" data-regenerate>Gerar novamente</button>
        </div>
      </div>
    </div>`;

  drawer.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => drawer.remove());
  drawer.querySelector<HTMLButtonElement>("[data-approve]")?.addEventListener("click", () => nativeButton("Aprovar", row)?.click());
  drawer.querySelector<HTMLButtonElement>("[data-edit]")?.addEventListener("click", () => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "gerador");
    params.set("mode", "avulso");
    window.history.pushState({}, "", `/content?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  drawer.querySelector<HTMLButtonElement>("[data-brief]")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/content?tab=planejamento");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  drawer.querySelector<HTMLButtonElement>("[data-regenerate]")?.addEventListener("click", () => {
    (nativeButton("Nova versão", row) ?? nativeButton("Gerar automático", row) ?? nativeButton("Abrir executor", row))?.click();
  });
  document.body.appendChild(drawer);
}

function enhanceRows(overview: HTMLElement) {
  const rows = findRows(overview);
  rows.forEach((row, index) => {
    row.setAttribute(ROW_ATTR, String(index));
    if (!row.querySelector(`[${CHECK_ATTR}]`)) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute(CHECK_ATTR, "true");
      checkbox.addEventListener("change", () => row.classList.toggle("vendorai-review-selected", checkbox.checked));
      row.prepend(checkbox);
    }

    const review = nativeButton("Revisar", row) ?? nativeButton("Fechar", row);
    if (review) {
      review.classList.add("vendorai-open-preview");
      if (normalize(textOf(review)) === "revisar") review.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.textContent = "Abrir prévia";
      });
      if (!review.dataset.vendoraiDrawerBound) {
        review.dataset.vendoraiDrawerBound = "true";
        review.addEventListener("click", () => window.setTimeout(() => createDrawer(row), 80));
      }
    }

    const approve = nativeButton("Aprovar", row);
    if (approve) approve.classList.add("vendorai-review-approve");
  });
  return rows;
}

function createWorkspace(overview: HTMLElement, rows: HTMLElement[]) {
  const ready = numberNearLabel(overview, ["Prontos", "Prontos para gerar"]);
  const review = numberNearLabel(overview, ["Em revisão"]);
  const approved = numberNearLabel(overview, ["Aprovados"]);
  const published = numberNearLabel(overview, ["Publicados"]);
  const pending = numberNearLabel(overview, ["Outros", "Pendentes"]);
  const attention = rows.filter((row) => rowStatus(row) === "erro").length;
  const producing = rows.filter((row) => rowStatus(row) === "produzindo").length;
  const campaignLine = rows.map((row) => Array.from(row.querySelectorAll<HTMLElement>("p")).map(textOf).find((value) => value.includes(" · "))).find(Boolean) ?? "Campanha atual";
  const campaign = campaignLine.split(" · ")[0] || "Campanha atual";

  const root = document.createElement("section");
  root.setAttribute(ROOT_ATTR, "true");
  root.innerHTML = `
    <div class="vendorai-review-shell">
      <div class="vendorai-review-context">
        <div><div class="vendorai-review-label">Campanha</div><div class="vendorai-review-select"><strong>${campaign}</strong><span>Produção, revisão e aprovação dos conteúdos do plano.</span></div></div>
        <button class="vendorai-review-secondary" type="button" data-avulso>+ Conteúdo avulso</button>
        <div><div class="vendorai-review-label">Período</div><div class="vendorai-review-select"><strong>Plano atual</strong><span>Conteúdos organizados por data sugerida.</span></div></div>
      </div>
      <div class="vendorai-review-journey">
        <div class="vendorai-journey-step done"><div class="vendorai-journey-head"><span class="vendorai-journey-dot">✓</span>Planejamento</div><div class="vendorai-journey-help">Briefing e estratégia</div></div>
        <div class="vendorai-journey-step done"><div class="vendorai-journey-head"><span class="vendorai-journey-dot">✓</span>Produção</div><div class="vendorai-journey-help">IA produz os conteúdos</div></div>
        <div class="vendorai-journey-step active"><div class="vendorai-journey-head"><span class="vendorai-journey-dot"></span>Revisão</div><div class="vendorai-journey-help">Você revisa e aprova</div></div>
        <div class="vendorai-journey-step"><div class="vendorai-journey-head"><span class="vendorai-journey-dot"></span>Publicação</div><div class="vendorai-journey-help">Publicação nos canais</div></div>
        <div class="vendorai-journey-step"><div class="vendorai-journey-head"><span class="vendorai-journey-dot"></span>Resultados</div><div class="vendorai-journey-help">Acompanhe os resultados</div></div>
      </div>
      <div class="vendorai-review-metrics">
        <div class="vendorai-review-metric"><p>A produzir</p><strong>${ready + pending}</strong></div>
        <div class="vendorai-review-metric"><p>Produzindo</p><strong>${producing}</strong></div>
        <div class="vendorai-review-metric active"><p>Para revisar</p><strong>${review}</strong></div>
        <div class="vendorai-review-metric"><p>Aprovados</p><strong>${approved}</strong></div>
        <div class="vendorai-review-metric"><p>Publicados</p><strong>${published}</strong></div>
        <div class="vendorai-review-metric attn"><p>Atenção</p><strong>${attention}</strong></div>
      </div>
      ${attention > 0 ? `<div class="vendorai-review-alert"><div><strong>${attention} conteúdo(s) precisam de atenção</strong><div style="margin-top:2px;color:hsl(var(--muted-foreground))">Revise as pendências ou tente corrigir novamente.</div></div><button type="button" class="vendorai-review-secondary" data-retry>Corrigir automaticamente</button></div>` : ""}
    </div>
    <div class="vendorai-review-toolbar">
      <button type="button" class="vendorai-filter active" data-filter="todos">Todos (${rows.length})</button>
      <button type="button" class="vendorai-filter" data-filter="revisao">Para revisar (${review})</button>
      <button type="button" class="vendorai-filter" data-filter="aprovado">Aprovados (${approved})</button>
      <button type="button" class="vendorai-filter" data-filter="erro">Com erro (${attention})</button>
      <span class="vendorai-review-spacer"></span>
      <button type="button" class="vendorai-batch" data-select-all>Selecionar todos</button>
      <button type="button" class="vendorai-batch" data-approve-selected>Aprovar selecionados</button>
    </div>`;

  root.querySelector<HTMLButtonElement>("[data-avulso]")?.addEventListener("click", () => {
    (nativeButton("Criação avulsa") ?? nativeButton("Criar fora do plano"))?.click();
  });
  root.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => {
    const retry = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => normalize(textOf(button)).includes("tentar novamente") || normalize(textOf(button)).includes("produzir plano completo"));
    retry?.click();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll(".vendorai-filter").forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
      const filter = button.dataset.filter ?? "todos";
      rows.forEach((row) => { row.style.display = filter === "todos" || rowStatus(row) === filter ? "" : "none"; });
    });
  });
  root.querySelector<HTMLButtonElement>("[data-select-all]")?.addEventListener("click", () => {
    const checks = rows.filter((row) => row.style.display !== "none").map((row) => row.querySelector<HTMLInputElement>(`[${CHECK_ATTR}]`)).filter(Boolean) as HTMLInputElement[];
    const shouldCheck = checks.some((check) => !check.checked);
    checks.forEach((check) => { check.checked = shouldCheck; check.dispatchEvent(new Event("change")); });
  });
  root.querySelector<HTMLButtonElement>("[data-approve-selected]")?.addEventListener("click", () => {
    rows.forEach((row) => {
      const check = row.querySelector<HTMLInputElement>(`[${CHECK_ATTR}]`);
      if (check?.checked) nativeButton("Aprovar", row)?.click();
    });
  });
  return root;
}

function applyReviewWorkspace() {
  const params = new URLSearchParams(window.location.search);
  const onContent = window.location.pathname === "/content" && params.get("tab") === "conteudos";
  const approved = Boolean(findExact("span,div", ["Plano aprovado"]));
  if (!onContent || !approved) {
    restore();
    return;
  }

  const overview = findProductionOverview();
  if (!overview) return;
  ensureStyle();

  const title = findExact("p", ["Produção automática do planejamento", "Produção do Plano de Mídia", "Conteúdos do plano"], overview);
  if (title) title.textContent = "Conteúdos & Criativos";
  const intro = title?.parentElement?.querySelectorAll<HTMLParagraphElement>("p")[1];
  if (intro) intro.textContent = "A IA produz os materiais do planejamento e traz tudo aqui para você revisar, aprovar, editar ou gerar novamente.";

  const rows = enhanceRows(overview);
  let workspace = document.querySelector<HTMLElement>(`[${ROOT_ATTR}]`);
  const fresh = createWorkspace(overview, rows);
  if (!workspace) {
    overview.insertAdjacentElement("beforebegin", fresh);
    workspace = fresh;
  } else if (workspace.innerHTML !== fresh.innerHTML) {
    workspace.replaceWith(fresh);
    workspace = fresh;
  }

  hide(overview);

  const failureNotice = Array.from(document.querySelectorAll<HTMLElement>("div,p,span")).find((element) => {
    const value = normalize(textOf(element));
    return value.includes("material(is) com falha") || value.includes("producao protegida:");
  }) ?? null;
  const failureCard = failureNotice ? closestBorderedCard(failureNotice) ?? failureNotice : null;
  if (failureCard && !failureCard.hasAttribute(ROOT_ATTR)) hide(failureCard);
}

export function ContentProductionClarityBridge() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyReviewWorkspace);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("popstate", schedule);
    const timer = window.setInterval(schedule, 1000);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
      restore();
    };
  }, []);
  return null;
}
