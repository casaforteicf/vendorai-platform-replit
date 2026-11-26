import { useEffect } from "react";

const ROOT_ATTR = "data-vendorai-review-workspace";
const HIDDEN_ATTR = "data-vendorai-review-hidden";
const FILTERED_ATTR = "data-vendorai-filtered";
const STYLE_ID = "vendorai-review-workspace-style";

const QUEUE_SELECTOR = "[data-vendorai-content-queue]";
const ITEM_SELECTOR = "[data-vendorai-queue-item]";
const METRICS_SELECTOR = "[data-vendorai-queue-metrics]";
const TOOLBAR_SELECTOR = "[data-vendorai-queue-toolbar]";

type StatusBucket = "produzir" | "produzindo" | "revisao" | "aprovado" | "publicado" | "outro";
type FilterId = "todos" | "revisao" | "aprovado" | "erro";

type Counts = Record<StatusBucket, number> & { atencao: number };

interface ItemView {
  element: HTMLElement;
  bucket: StatusBucket;
  failures: number;
}

interface WorkspaceState {
  filter: FilterId;
  busy: boolean;
  queue: HTMLElement | null;
  root: HTMLElement | null;
  signature: string;
  onChange: (() => void) | null;
}

function textOf(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] ?? character));
}

function findExact(selector: string, values: string[], root: ParentNode = document) {
  const normalizedValues = values.map(normalize);
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find((element) =>
    normalizedValues.includes(normalize(textOf(element))),
  ) ?? null;
}

function nativeButton(label: string, root: ParentNode = document, visibleOnly = true) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    normalize(textOf(button)) === normalize(label) && (!visibleOnly || button.offsetParent !== null),
  ) ?? null;
}

function findQueue() {
  const direct = document.querySelector<HTMLElement>(QUEUE_SELECTOR);
  if (direct) return direct;

  // Compatibilidade: versões antigas do bundle não expõem o atributo estável.
  const title = findExact("p,div", ["Conteúdos da campanha", "Produção do Plano de Mídia", "Conteúdos do plano"]);
  if (!title) return null;
  const metrics = findExact("p", ["Em revisão"]);
  let current: HTMLElement | null = title;
  while (current && current !== document.body) {
    if (metrics && current.contains(metrics) && current.querySelectorAll("button").length > 2) return current;
    current = current.parentElement;
  }
  return null;
}

function bucketFor(label: string): StatusBucket {
  const value = normalize(label);
  if (!value) return "outro";
  if (value.includes("publicado")) return "publicado";
  if (value.includes("conteudo aprovado")) return "aprovado";
  if (value.includes("em revisao")) return "revisao";
  if (value.includes("em producao") || value.includes("produzindo")) return "produzindo";
  if (value.includes("pronto para produzir")) return "produzir";
  return "outro";
}

function fallbackStatusLabel(element: HTMLElement) {
  const content = normalize(textOf(element));
  const labels = [
    "Conteúdo aprovado",
    "Em revisão",
    "Em produção",
    "Pronto para produzir",
    "Publicado",
    "Recusado",
    "Ignorado",
  ];
  return labels.find((label) => content.includes(normalize(label))) ?? "";
}

function collectItems(queue: HTMLElement): ItemView[] {
  let elements = Array.from(queue.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
  if (elements.length === 0) {
    elements = Array.from(queue.querySelectorAll<HTMLElement>("div.rounded-lg.border")).filter((element) =>
      Boolean(fallbackStatusLabel(element)),
    );
  }
  return elements.map((element) => {
    const label = element.getAttribute("data-vendorai-item-status") ?? fallbackStatusLabel(element);
    const failures = Number(element.getAttribute("data-vendorai-item-failures") ?? 0)
      || (normalize(textOf(element)).includes("falha") ? 1 : 0);
    return { element, bucket: bucketFor(label), failures };
  });
}

function countItems(items: ItemView[]): Counts {
  const counts: Counts = { produzir: 0, produzindo: 0, revisao: 0, aprovado: 0, publicado: 0, outro: 0, atencao: 0 };
  for (const item of items) {
    counts[item.bucket] += 1;
    if (item.failures > 0) counts.atencao += 1;
  }
  return counts;
}

function campaignNameFor(items: ItemView[]) {
  for (const item of items) {
    const line = Array.from(item.element.querySelectorAll<HTMLElement>("p"))
      .map(textOf)
      .find((value) => value.includes(" · "));
    if (line) {
      const [campaign] = line.split(" · ");
      if (campaign?.trim()) return campaign.trim();
    }
  }
  return "";
}

function rowCheckbox(row: HTMLElement) {
  return row.querySelector<HTMLInputElement>('input[type="checkbox"]');
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${HIDDEN_ATTR}="true"] { display: none !important; }
    [${FILTERED_ATTR}="true"] { display: none !important; }
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
    .vendorai-batch:disabled { opacity:.55; cursor:not-allowed; }
    .vendorai-open-preview { border-color:hsl(var(--border)) !important; background:hsl(var(--background)) !important; }
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
  document.querySelectorAll<HTMLElement>(`[${FILTERED_ATTR}]`).forEach((element) => element.removeAttribute(FILTERED_ATTR));
  document.querySelectorAll<HTMLElement>(`[${ROOT_ATTR}]`).forEach((element) => element.remove());
  document.getElementById(STYLE_ID)?.remove();
}

function createWorkspace(items: ItemView[], counts: Counts, filter: FilterId) {
  const toProduce = counts.produzir + counts.outro;
  const phase = toProduce > 0 || counts.produzindo > 0
    ? 0
    : counts.revisao > 0
      ? 1
      : counts.aprovado > 0
        ? 2
        : counts.publicado > 0
          ? 3
          : 0;

  const campaign = escapeHtml(campaignNameFor(items) || "Campanha atual");
  const steps: Array<[string, string, string]> = [
    ["Planejamento", "Briefing e estratégia", "done"],
    ["Produção", "IA produz os conteúdos", phase > 0 ? "done" : "active"],
    ["Revisão", "Você revisa e aprova", phase === 1 ? "active" : phase > 1 ? "done" : ""],
    ["Publicação", "Publicação nos canais", phase === 2 ? "active" : phase > 2 ? "done" : ""],
    ["Resultados", "Acompanhe os resultados", phase === 3 ? "active" : ""],
  ];

  const metrics: Array<[string, number, string]> = [
    ["A produzir", toProduce, ""],
    ["Produzindo", counts.produzindo, ""],
    ["Para revisar", counts.revisao, "active"],
    ["Aprovados", counts.aprovado, ""],
    ["Publicados", counts.publicado, ""],
    ["Atenção", counts.atencao, "attn"],
  ];

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
        ${steps.map(([label, help, state]) => `
          <div class="vendorai-journey-step ${state}">
            <div class="vendorai-journey-head"><span class="vendorai-journey-dot">${state === "done" ? "✓" : ""}</span>${label}</div>
            <div class="vendorai-journey-help">${help}</div>
          </div>`).join("")}
      </div>
      <div class="vendorai-review-metrics">
        ${metrics.map(([label, value, state]) => `
          <div class="vendorai-review-metric ${state}"><p>${label}</p><strong>${value}</strong></div>`).join("")}
      </div>
      ${counts.revisao > 0 ? `
        <div class="vendorai-review-alert">
          <div>
            <strong>${counts.revisao} conteúdo(s) aguardando sua aprovação</strong>
            <div style="margin-top:2px;color:hsl(var(--muted-foreground))">Selecione os itens e clique em “Aprovar selecionados”, ou aprove um a um, para liberar a publicação.</div>
          </div>
          <button type="button" class="vendorai-review-secondary" data-select-all>Selecionar todos</button>
        </div>` : ""}
      ${counts.atencao > 0 ? `
        <div class="vendorai-review-alert">
          <div><strong>${counts.atencao} conteúdo(s) precisam de atenção</strong><div style="margin-top:2px;color:hsl(var(--muted-foreground))">Revise as pendências ou tente corrigir novamente.</div></div>
          <button type="button" class="vendorai-review-secondary" data-retry>Corrigir automaticamente</button>
        </div>` : ""}
    </div>
    <div class="vendorai-review-toolbar">
      <button type="button" class="vendorai-filter ${filter === "todos" ? "active" : ""}" data-filter="todos">Todos (${items.length})</button>
      <button type="button" class="vendorai-filter ${filter === "revisao" ? "active" : ""}" data-filter="revisao">Para revisar (${counts.revisao})</button>
      <button type="button" class="vendorai-filter ${filter === "aprovado" ? "active" : ""}" data-filter="aprovado">Aprovados (${counts.aprovado})</button>
      <button type="button" class="vendorai-filter ${filter === "erro" ? "active" : ""}" data-filter="erro">Com erro (${counts.atencao})</button>
      <span class="vendorai-review-spacer"></span>
      <button type="button" class="vendorai-batch" data-select-all>Selecionar todos</button>
      <button type="button" class="vendorai-batch" data-approve-selected disabled>Aprovar selecionados</button>
    </div>`;

  return root;
}

function applyFilter(state: WorkspaceState) {
  if (!state.queue) return;
  for (const item of collectItems(state.queue)) {
    const matches = state.filter === "todos"
      || (state.filter === "revisao" && item.bucket === "revisao")
      || (state.filter === "aprovado" && item.bucket === "aprovado")
      || (state.filter === "erro" && item.failures > 0);
    if (matches) item.element.removeAttribute(FILTERED_ATTR);
    else item.element.setAttribute(FILTERED_ATTR, "true");
  }
}

function selectedRows(state: WorkspaceState) {
  if (!state.queue) return [] as Array<{ element: HTMLElement; checkbox: HTMLInputElement }>;
  return collectItems(state.queue)
    .map((item) => ({ element: item.element, checkbox: rowCheckbox(item.element) }))
    .filter((entry): entry is { element: HTMLElement; checkbox: HTMLInputElement } => Boolean(entry.checkbox?.checked));
}

function syncSelection(state: WorkspaceState) {
  const root = state.root;
  if (!root) return;
  const approve = root.querySelector<HTMLButtonElement>("[data-approve-selected]");
  if (!approve || approve.dataset.busy === "true") return;
  const count = selectedRows(state).length;
  approve.disabled = state.busy || count === 0;
  approve.textContent = count > 0 ? `Aprovar selecionados (${count})` : "Aprovar selecionados";
}

function bindWorkspace(state: WorkspaceState) {
  const root = state.root;
  if (!root) return;

  root.querySelector<HTMLButtonElement>("[data-avulso]")?.addEventListener("click", () => {
    (nativeButton("Criação avulsa") ?? nativeButton("Criar fora do plano"))?.click();
  });

  root.querySelector<HTMLButtonElement>("[data-retry]")?.addEventListener("click", () => {
    const retry = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      normalize(textOf(button)).includes("tentar novamente") || normalize(textOf(button)).includes("produzir plano completo"),
    );
    retry?.click();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = (button.dataset.filter as FilterId | undefined) ?? "todos";
      root.querySelectorAll<HTMLElement>(".vendorai-filter").forEach((entry) => {
        entry.classList.toggle("active", entry === button);
      });
      applyFilter(state);
      syncSelection(state);
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-select-all]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.queue) return;
      const checks = collectItems(state.queue)
        .filter((item) => !item.element.hasAttribute(FILTERED_ATTR))
        .map((item) => rowCheckbox(item.element))
        .filter((checkbox): checkbox is HTMLInputElement => Boolean(checkbox));
      const shouldCheck = checks.some((checkbox) => !checkbox.checked);
      checks.forEach((checkbox) => {
        if (checkbox.checked !== shouldCheck) checkbox.click();
      });
      syncSelection(state);
    });
  });

  root.querySelector<HTMLButtonElement>("[data-approve-selected]")?.addEventListener("click", () => {
    void approveSelected(state);
  });
}

async function approveSelected(state: WorkspaceState) {
  const queue = state.queue;
  const root = state.root;
  if (!queue || !root || state.busy) return;

  const targets = selectedRows(state);
  if (targets.length === 0) return;

  state.busy = true;
  const button = root.querySelector<HTMLButtonElement>("[data-approve-selected]");
  if (button) {
    button.dataset.busy = "true";
    button.disabled = true;
    button.textContent = "Aprovando…";
  }

  try {
    // Dá tempo do React registrar a seleção feita nos checkboxes nativos.
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    const nativeBatch = Array.from(queue.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
      !root.contains(candidate) && normalize(textOf(candidate)).startsWith("aprovar selecionados"),
    );

    if (nativeBatch && !nativeBatch.disabled) {
      nativeBatch.click();
    } else {
      for (const target of targets) {
        const approve = nativeButton("Aprovar", target.element);
        if (approve && !approve.disabled) {
          approve.click();
          await new Promise((resolve) => window.setTimeout(resolve, 700));
        }
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  } finally {
    state.busy = false;
    if (button) {
      delete button.dataset.busy;
    }
    syncSelection(state);
    refresh(state);
  }
}

function refresh(state: WorkspaceState) {
  const queue = state.queue;
  if (!queue) return;
  const items = collectItems(queue);
  const counts = countItems(items);
  const signature = [
    counts.produzir,
    counts.produzindo,
    counts.revisao,
    counts.aprovado,
    counts.publicado,
    counts.outro,
    counts.atencao,
  ].join(":");

  if (!state.root || !state.root.isConnected || state.signature !== signature) {
    const fresh = createWorkspace(items, counts, state.filter);
    document.querySelectorAll<HTMLElement>(`[${ROOT_ATTR}]`).forEach((element) => {
      if (element !== state.root) element.remove();
    });
    if (state.root?.isConnected) state.root.replaceWith(fresh);
    else queue.prepend(fresh);
    state.root = fresh;
    state.signature = signature;
    bindWorkspace(state);
  }

  if (queue.firstElementChild !== state.root) queue.prepend(state.root);
  hide(queue.querySelector<HTMLElement>(METRICS_SELECTOR));
  hide(queue.querySelector<HTMLElement>(TOOLBAR_SELECTOR));
  applyFilter(state);
  syncSelection(state);
}

function applyReviewWorkspace(state: WorkspaceState) {
  const params = new URLSearchParams(window.location.search);
  const onContent = window.location.pathname === "/content" && params.get("tab") === "conteudos";
  const approved = Boolean(findExact("span,div", ["Plano aprovado"]));
  const queue = onContent && approved ? findQueue() : null;

  if (!queue) {
    restore();
    state.queue = null;
    state.root = null;
    state.signature = "";
    return;
  }

  ensureStyle();
  state.queue = queue;
  refresh(state);
}

export function ContentProductionClarityBridge() {
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const state: WorkspaceState = {
      filter: "todos",
      busy: false,
      queue: null,
      root: null,
      signature: "",
      onChange: null,
    };

    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!disposed) applyReviewWorkspace(state);
      });
    };

    state.onChange = () => syncSelection(state);
    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("popstate", schedule);
    const timer = window.setInterval(schedule, 1000);

    const bindSelectionListener = () => {
      if (state.queue && state.onChange && !state.queue.dataset.vendoraiSelectionBound) {
        state.queue.dataset.vendoraiSelectionBound = "true";
        state.queue.addEventListener("change", state.onChange);
      }
    };
    const selectionTimer = window.setInterval(bindSelectionListener, 1000);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      window.clearInterval(timer);
      window.clearInterval(selectionTimer);
      if (state.queue && state.onChange) {
        state.queue.removeEventListener("change", state.onChange);
        delete state.queue.dataset.vendoraiSelectionBound;
      }
      restore();
    };
  }, []);
  return null;
}
