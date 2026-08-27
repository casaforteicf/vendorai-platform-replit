import { useEffect } from "react";

interface SeoMeta {
  title: string;
  description?: string;
}

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
}

export function useSeoMeta({ title, description }: SeoMeta) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[property="og:title"]', { property: "og:title", content: title });
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });

    if (description) {
      setMeta('meta[name="description"]', { name: "description", content: description });
      setMeta('meta[property="og:description"]', { property: "og:description", content: description });
      setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    }
  }, [title, description]);
}
