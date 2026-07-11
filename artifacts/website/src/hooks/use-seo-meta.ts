import { useEffect } from "react";

interface SeoMeta {
  title: string;
  description?: string;
}

export function useSeoMeta({ title, description }: SeoMeta) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;

    let descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = descEl?.getAttribute("content") ?? "";

    if (description) {
      if (!descEl) {
        descEl = document.createElement("meta");
        descEl.setAttribute("name", "description");
        document.head.appendChild(descEl);
      }
      descEl.setAttribute("content", description);
    }

    return () => {
      document.title = prev;
      if (descEl && prevDesc) descEl.setAttribute("content", prevDesc);
    };
  }, [title, description]);
}
