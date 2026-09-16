import { useEffect } from "react";

function normalizedText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function replaceTextNode(root: HTMLElement, from: string, to: string) {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && normalizedText(node.textContent) === from) {
      node.textContent = to;
      return true;
    }
  }
  return false;
}

function unifyCompanyLibraryUi() {
  document
    .querySelectorAll<HTMLAnchorElement>('[data-marketing-flow-menu] a[href="/midias/informacoes"]')
    .forEach((link) => {
      link.hidden = true;
      link.style.display = "none";
      link.setAttribute("aria-hidden", "true");
      link.tabIndex = -1;
    });

  document
    .querySelectorAll<HTMLAnchorElement>('[data-marketing-flow-menu] a[href="/midias"]')
    .forEach((link) => {
      const label = Array.from(link.querySelectorAll<HTMLElement>("span"))
        .find((node) => normalizedText(node.textContent) === "Mídias");
      if (label) label.textContent = "Biblioteca da Empresa";
      link.setAttribute("aria-label", "Biblioteca da Empresa");
      link.setAttribute("title", "Biblioteca da Empresa");
    });

  const library = document.getElementById("biblioteca-midias");
  if (!library) return;

  Array.from(library.querySelectorAll<HTMLElement>("h1")).forEach((heading) => {
    if (normalizedText(heading.textContent) === "Biblioteca de Informações") {
      heading.textContent = "Biblioteca da Empresa";
    }
  });

  Array.from(library.querySelectorAll<HTMLButtonElement>("button")).forEach((button) => {
    const text = normalizedText(button.textContent);
    if (text === "Adicionar mídia") {
      replaceTextNode(button, "Adicionar mídia", "Adicionar à biblioteca");
      button.setAttribute("aria-label", "Adicionar à biblioteca");
      button.setAttribute("title", "Adicionar fotos, vídeos, áudios ou documentos à Biblioteca da Empresa");
    }
  });

  Array.from(library.querySelectorAll<HTMLElement>("h2")).forEach((heading) => {
    if (normalizedText(heading.textContent) === "Referências da empresa") {
      heading.textContent = "Categorias da Biblioteca";
    }
  });

  Array.from(library.querySelectorAll<HTMLElement>("p")).forEach((paragraph) => {
    const text = normalizedText(paragraph.textContent);
    if (text === "Organize cada mídia pelo assunto que ela representa para a IA.") {
      paragraph.textContent = "Escolha uma categoria para encontrar e organizar as informações que a IA deve consultar.";
    }
  });

  Array.from(library.querySelectorAll<HTMLElement>("span, p, div")).forEach((element) => {
    const text = normalizedText(element.textContent);
    if (text === "Base IA") element.textContent = "Conhecimento da IA";
    if (text === "BASE IA") element.textContent = "IA";
  });

  Array.from(library.querySelectorAll<HTMLButtonElement>("button")).forEach((button) => {
    if (normalizedText(button.textContent) !== "Apresentações") return;
    const label = Array.from(button.querySelectorAll<HTMLElement>("p, span"))
      .find((node) => normalizedText(node.textContent) === "Apresentações");
    if (label) label.textContent = "Documentos e arquivos";
  });
}

export default function MediaLibrarySourceGuide() {
  useEffect(() => {
    unifyCompanyLibraryUi();
    const observer = new MutationObserver(unifyCompanyLibraryUi);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", unifyCompanyLibraryUi);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", unifyCompanyLibraryUi);
    };
  }, []);

  return null;
}
