import { useEffect } from "react";

function nativeSetValue(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function currentEditorialBrief() {
  if (window.location.pathname !== "/content") return null;
  const params = new URLSearchParams(window.location.search);
  if ((params.get("tab") ?? "gerador") !== "gerador") return null;
  if (params.get("from") !== "vendorai-editorial-strategy") return null;
  const brief = params.get("brief")?.trim();
  if (brief) return brief;
  try {
    const stored = JSON.parse(localStorage.getItem("vendorai_editorial_brief_v1") || "null") as { brief?: string } | null;
    return stored?.brief?.trim() || null;
  } catch {
    return null;
  }
}

function findBriefField(): HTMLTextAreaElement | HTMLInputElement | null {
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
  const preferredTextarea = textareas.find((field) => {
    const hint = `${field.placeholder || ""} ${field.getAttribute("aria-label") || ""}`.toLowerCase();
    return /brief|descri|conteúdo|conteudo|roteiro|prompt|tema|instru/.test(hint);
  });
  if (preferredTextarea) return preferredTextarea;
  if (textareas.length === 1) return textareas[0];

  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'));
  return inputs.find((field) => {
    const hint = `${field.placeholder || ""} ${field.getAttribute("aria-label") || ""}`.toLowerCase();
    return /brief|descri|conteúdo|conteudo|roteiro|prompt|tema|instru/.test(hint);
  }) ?? null;
}

export function EditorialBriefQueryBridge() {
  useEffect(() => {
    let appliedFor = "";
    const apply = () => {
      const brief = currentEditorialBrief();
      if (!brief || appliedFor === window.location.href) return;
      const field = findBriefField();
      if (!field) return;
      if (field.value.trim() && field.value.trim() !== brief) return;
      nativeSetValue(field, brief);
      field.dataset.vendoraiEditorialPrefill = "true";
      appliedFor = window.location.href;
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(apply, 500);
    window.addEventListener("popstate", apply);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("popstate", apply);
    };
  }, []);

  return null;
}
