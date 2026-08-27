import { useEffect } from "react";
import { useLocation } from "wouter";

const SITE_ORIGIN = "https://appvendorai.com";

const STATIC_META: Record<string, { title: string; description: string; index: boolean }> = {
  "/": {
    title: "Vendor.ai — CRM com IA para WhatsApp e Instagram | PMEs Brasileiras",
    description: "Sistema Operacional Empresarial com IA para PMEs. Prospecção, atendimento, orçamento e fechamento direto no WhatsApp e Instagram, com agentes de IA trabalhando 24/7.",
    index: true,
  },
  "/funcionalidades": {
    title: "Funcionalidades Vendor.ai — CRM e Agentes de IA para Vendas",
    description: "Conheça os recursos da Vendor.ai para atendimento, vendas, automação comercial, WhatsApp, Instagram e operação empresarial com IA.",
    index: true,
  },
  "/precos": {
    title: "Preços e Planos Vendor.ai — CRM com IA para Empresas",
    description: "Conheça os planos da Vendor.ai e escolha a estrutura de CRM, automação e agentes de IA adequada à sua operação.",
    index: true,
  },
  "/sobre": {
    title: "Sobre a Vendor.ai — Inteligência Artificial para Operações Comerciais",
    description: "Conheça a Vendor.ai e a proposta de unir CRM, automação e agentes de IA em uma plataforma para operações comerciais.",
    index: true,
  },
  "/contato": {
    title: "Contato Vendor.ai — Fale com Nossa Equipe",
    description: "Fale com a equipe Vendor.ai para conhecer a plataforma, tirar dúvidas e avaliar a aplicação no seu negócio.",
    index: true,
  },
  "/blog": {
    title: "Blog Vendor.ai — Vendas, CRM, WhatsApp e Inteligência Artificial",
    description: "Conteúdos da Vendor.ai sobre vendas, CRM, automação, WhatsApp, atendimento e inteligência artificial aplicada a negócios.",
    index: true,
  },
  "/cadastro-praca": {
    title: "Cadastro PraçaAI — Vendor.ai",
    description: "Página de cadastro operacional do PraçaAI.",
    index: false,
  },
  "/privacy": {
    title: "Política de Privacidade — Vendor.ai",
    description: "Política de Privacidade da Vendor.ai.",
    index: false,
  },
  "/terms": {
    title: "Termos de Uso — Vendor.ai",
    description: "Termos de Uso da Vendor.ai.",
    index: false,
  },
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = href;
}

export default function RouteSeo() {
  const [location] = useLocation();

  useEffect(() => {
    const normalized = location === "/" ? "/" : location.replace(/\/$/, "");
    const canonical = `${SITE_ORIGIN}${normalized === "/" ? "/" : normalized}`;
    const isBlogPost = /^\/blog\/[^/]+$/.test(normalized);
    const isKnownVertical = /^\/verticais\/(varejo|b2b|saude|beauty|imoveis|arch)$/.test(normalized);
    const isPartner = normalized === "/parceiros";
    const isGeneratedLp = /^\/lp\/[^/]+$/.test(normalized);
    const meta = STATIC_META[normalized];
    const shouldIndex = meta?.index ?? (isBlogPost || isKnownVertical || isPartner);

    if (meta) {
      document.title = meta.title;
      upsertMeta('meta[name="description"]', { name: "description", content: meta.description });
      upsertMeta('meta[property="og:title"]', { property: "og:title", content: meta.title });
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: meta.description });
      upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: meta.title });
      upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: meta.description });
    }

    upsertCanonical(canonical);
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: shouldIndex && !isGeneratedLp ? "index, follow" : "noindex, nofollow",
    });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[name="twitter:url"]', { name: "twitter:url", content: canonical });
  }, [location]);

  return null;
}
