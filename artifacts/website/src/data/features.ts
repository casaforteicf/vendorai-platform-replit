import type { LucideIcon } from "lucide-react";
import { Globe, FileSearch, Newspaper, LayoutTemplate } from "lucide-react";

export type FeatureDetail = {
  slug: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle: string;
  howItWorks: { title: string; desc: string }[];
  seo: { title: string; desc: string };
  learning: { title: string; desc: string };
  ctaLabel: string;
};

export const FEATURES: FeatureDetail[] = [
  {
    slug: "gerador-de-sites",
    icon: Globe,
    eyebrow: "Presença digital em minutos",
    title: "Gerador de Sites com IA",
    subtitle:
      "Você descreve sua empresa, seu público e o que vende. A IA monta o site inteiro — estrutura, textos, seções e identidade visual — pronto pra publicar, sem depender de agência ou desenvolvedor.",
    howItWorks: [
      { title: "Descreva seu negócio", desc: "Nome, segmento, diferenciais e o que você vende — em texto livre, do seu jeito." },
      { title: "A IA monta a estrutura", desc: "Seções escolhidas de acordo com o tipo de negócio: institucional, produto único ou catálogo completo." },
      { title: "Revise e publique", desc: "Ajuste textos, imagens e cores direto na tela — o site já sai com domínio próprio em *.appvendorai.com." },
    ],
    seo: {
      title: "SEO já embutido, não um plugin à parte",
      desc: "Cada página gerada já sai com meta title, meta description, dados estruturados e hierarquia de headings corretos — a base técnica de SEO que a maioria dos sites feitos às pressas nunca tem.",
    },
    learning: {
      title: "Aprende com o que já funciona no seu mercado",
      desc: "O gerador usa os mesmos 50 perfis verticais do Revenue Scout — o site nasce já falando a língua do seu segmento, em vez de um texto genérico reaproveitado de qualquer nicho.",
    },
    ctaLabel: "Gerar meu site grátis",
  },
  {
    slug: "analise-de-site",
    icon: FileSearch,
    eyebrow: "Diagnóstico antes de qualquer ação",
    title: "Análise do seu site atual",
    subtitle:
      "Cole a URL do site que você já tem. A IA lê a estrutura, o conteúdo e os sinais de SEO, e devolve exatamente o que está custando visita e conversão — antes de sugerir qualquer mudança.",
    howItWorks: [
      { title: "Cole a URL", desc: "Sem instalar nada, sem acesso ao servidor — só o endereço público do site." },
      { title: "A IA lê a página inteira", desc: "Estrutura de seções, textos, chamadas pra ação e sinais técnicos de SEO." },
      { title: "Receba o diagnóstico", desc: "O que está fraco, o que está faltando, e o que priorizar primeiro pra melhorar conversão." },
    ],
    seo: {
      title: "Aponta os erros técnicos que ninguém vê",
      desc: "Título ausente, hierarquia de headings quebrada, meta description genérica ou repetida — os detalhes técnicos que afastam buscador e visitante, mas que passam despercebidos numa leitura visual do site.",
    },
    learning: {
      title: "Vira ponto de partida pro remodelamento",
      desc: "O diagnóstico alimenta diretamente o Gerador de Sites — se você decidir refazer, a IA já sabe o que evitar repetir.",
    },
    ctaLabel: "Analisar meu site",
  },
  {
    slug: "content-autopilot",
    icon: Newspaper,
    eyebrow: "Marketing de conteúdo sem redator",
    title: "Content Autopilot",
    subtitle:
      "A IA pesquisa as palavras-chave do seu mercado, escreve artigos otimizados pra SEO e publica sozinha, todo dia — sem você abrir uma tela de redação ou contratar agência de conteúdo.",
    howItWorks: [
      { title: "Pesquisa de palavras-chave", desc: "A IA identifica o que seu público real está buscando no seu segmento." },
      { title: "Geração do artigo", desc: "Pesquisador → Criador → Otimizador → Publicador: cada etapa do pipeline melhora o texto antes de ir ao ar." },
      { title: "Publicação automática", desc: "O artigo sai direto no seu blog, já indexável, sem revisão manual obrigatória (mas você pode revisar antes se preferir)." },
    ],
    seo: {
      title: "Otimização real, não só texto bonito",
      desc: "Cada artigo passa por uma etapa dedicada de otimização — densidade de palavra-chave, estrutura de headings, meta description — antes de ser publicado.",
    },
    learning: {
      title: "Melhora com o que gera resultado",
      desc: "O Content Autopilot está conectado à mesma inteligência comercial do CRM: sabe quais temas geram lead de verdade, não só tráfego vazio.",
    },
    ctaLabel: "Ver o Content Autopilot",
  },
  {
    slug: "lps-por-vertical",
    icon: LayoutTemplate,
    eyebrow: "Uma página de venda pra cada mercado",
    title: "50 Landing Pages por Vertical",
    subtitle:
      "Cada um dos 50 perfis de mercado do Vendor.ai tem sua própria LP, com estrutura de venda SPIN Selling — não é um template genérico com o nome trocado.",
    howItWorks: [
      { title: "Escolha seu mercado", desc: "Varejo, clínicas, concessionárias, distribuidoras, serviços profissionais, indústrias — 6 macrossegmentos, 50 mercados." },
      { title: "A LP já nasce contextualizada", desc: "Jornada, dores, agentes prioritários e sinais de oportunidade específicos daquele mercado, não genéricos." },
      { title: "Conecta direto no CRM", desc: "Todo lead que preenche o formulário já entra no pipeline certo, com o Agente de Recepção assumindo o primeiro contato." },
    ],
    seo: {
      title: "Página específica rankeia melhor que página genérica",
      desc: "Uma LP falando a língua exata de 'distribuidora de autopeças' compete muito melhor no Google do que uma página genérica de 'CRM pra empresas' tentando servir todo mundo.",
    },
    learning: {
      title: "Cada mercado tem seu próprio Revenue Scout",
      desc: "Não é só o texto que muda — a LP já reflete os sinais de oportunidade que o Revenue Scout daquele mercado específico sabe procurar.",
    },
    ctaLabel: "Ver as LPs por segmento",
  },
];
