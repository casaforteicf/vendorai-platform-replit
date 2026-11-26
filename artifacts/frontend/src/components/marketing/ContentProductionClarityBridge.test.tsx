import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ContentProductionClarityBridge } from "./ContentProductionClarityBridge";

function itemMarkup(index: number, status = "Em revisão") {
  return `
    <div class="rounded-lg border bg-background px-3 py-2.5"
         data-vendorai-queue-item
         data-vendorai-item-id="item-${index}"
         data-vendorai-item-status="${status}"
         data-vendorai-item-failures="0">
      <input type="checkbox" aria-label="Selecionar conteúdo" />
      <p>Aquisição de novas oportunidades · 20/10/2026</p>
      <p>Conteúdo ${index}: educação e critérios de compra</p>
      <button type="button">Aprovar</button>
    </div>`;
}

function buildQueue(items = 10) {
  return `
    <div data-vendorai-content-queue>
      <div class="rounded-2xl border">
        <div class="flex items-center gap-2">
          <div class="rounded-full border px-2">Conteúdos do plano</div>
          <div>Plano aprovado</div>
        </div>
        <p>Conteúdos da campanha</p>
        <div data-vendorai-queue-metrics>
          <div><p>Em revisão</p><p>${items}</p></div>
        </div>
      </div>
      <div data-vendorai-queue-toolbar>
        <button type="button">Todos (${items})</button>
        <button type="button" data-native-batch>Aprovar selecionados (2)</button>
      </div>
      <div class="space-y-2">${Array.from({ length: items }, (_, index) => itemMarkup(index + 1)).join("")}</div>
    </div>`;
}

function workspace() {
  return document.querySelector<HTMLElement>("[data-vendorai-review-workspace]");
}

function workspaceButton(label: string) {
  return Array.from(workspace()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (button) => button.textContent?.replace(/\s+/g, " ").trim() === label,
  ) ?? null;
}

function metricValue(label: string) {
  const metric = Array.from(workspace()?.querySelectorAll<HTMLElement>(".vendorai-review-metric") ?? []).find(
    (element) => element.querySelector("p")?.textContent?.trim() === label,
  );
  return metric?.querySelector("strong")?.textContent?.trim() ?? "";
}

describe("ContentProductionClarityBridge", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/content?tab=conteudos");
    document.body.innerHTML = buildQueue();
    render(<ContentProductionClarityBridge />);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("conta os conteúdos em revisão a partir da fila real", async () => {
    await waitFor(() => expect(workspace()).not.toBeNull());
    expect(metricValue("Para revisar")).toBe("10");
    expect(metricValue("A produzir")).toBe("0");
    expect(workspaceButton("Para revisar (10)")).not.toBeNull();
    expect(workspaceButton("Todos (10)")).not.toBeNull();
  });

  it("esconde o resumo e a barra nativos para não duplicar a tela", async () => {
    await waitFor(() => expect(workspace()).not.toBeNull());
    expect(document.querySelector("[data-vendorai-queue-metrics]")?.getAttribute("data-vendorai-review-hidden")).toBe("true");
    expect(document.querySelector("[data-vendorai-queue-toolbar]")?.getAttribute("data-vendorai-review-hidden")).toBe("true");
  });

  it("seleciona todos os itens visíveis e aprova em lote pelo botão nativo", async () => {
    await waitFor(() => expect(workspace()).not.toBeNull());
    const nativeBatch = document.querySelector<HTMLButtonElement>("[data-native-batch]");
    const clickSpy = vi.fn();
    nativeBatch?.addEventListener("click", clickSpy);

    workspaceButton("Selecionar todos")?.click();

    await waitFor(() => expect(workspaceButton("Aprovar selecionados (10)")).not.toBeNull());
    const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>("[data-vendorai-queue-item] input[type=checkbox]"));
    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);

    workspaceButton("Aprovar selecionados (10)")?.click();
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("não injeta checkbox dentro dos botões nativos", async () => {
    await waitFor(() => expect(workspace()).not.toBeNull());
    expect(document.querySelector("button input[type=checkbox]")).toBeNull();
  });

  it("filtra a lista pelo status escolhido", async () => {
    await waitFor(() => expect(workspace()).not.toBeNull());
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-vendorai-queue-item]"));
    workspaceButton("Para revisar (10)")?.click();
    expect(rows.every((row) => !row.hasAttribute("data-vendorai-filtered"))).toBe(true);

    (workspaceButton("Aprovados (0)") as HTMLButtonElement | null)?.click();
    expect(rows.every((row) => row.hasAttribute("data-vendorai-filtered"))).toBe(true);
  });
});
