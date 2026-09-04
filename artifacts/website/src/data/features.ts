import type { LucideIcon } from "lucide-react";
import { Globe, FileSearch, Newspaper, LayoutTemplate, CalendarRange } from "lucide-react";

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
  {
    slug: "plano-de-midia",
    icon: CalendarRange,
    eyebrow: "Estratégia de marketing pronta, não uma planilha vazia",
    title: "Plano de Mídia com IA",
    subtitle:
      "A IA analisa seu negócio, seus concorrentes reais e as buscas do seu mercado, e devolve um plano de mídia completo: quais canais priorizar, quanto do orçamento colocar em cada um e o que publicar — não um relatório genérico de agência.",
    howItWorks: [
      { title: "Diagnóstico automático", desc: "A IA mapeia pontos fortes atuais e oportunidades reais, com base no seu perfil de negócio e no que já está sendo feito." },
      { title: "Canais priorizados com % de orçamento", desc: "Cada canal recomendado vem com prioridade (alta/média/baixa), o motivo da recomendação, e quanto do orçamento sugerir alocar ali." },
      { title: "Vira calendário de conteúdo", desc: "Os pilares de conteúdo do plano se transformam num calendário editorial de verdade — por semana, por pilar, por formato (feed, stories, reels)." },
    ],
    seo: {
      title: "Baseado em concorrentes e buscas reais, não achismo",
      desc: "O plano lista concorrentes realmente encontrados na pesquisa e as palavras-chave com volume de busca do seu mercado — a estratégia nasce de dado, não de intuição de agência.",
    },
    learning: {
      title: "Ações imediatas, não só teoria",
      desc: "Além do diagnóstico, o plano entrega uma lista de ações imediatas pra começar a executar — e se conecta direto com o Content Autopilot pra colocar o calendário no ar sozinho.",
    },
    ctaLabel: "Gerar meu plano de mídia",
  },
];

const FEATURES_ES: Record<string, Omit<FeatureDetail, "slug" | "icon">> = {
  "gerador-de-sites": {
    eyebrow: "Presencia digital en minutos",
    title: "Generador de Sitios con IA",
    subtitle: "Describe tu empresa, tu público y lo que vendes. La IA crea el sitio completo — estructura, textos, secciones e identidad visual — listo para publicar, sin depender de una agencia o desarrollador.",
    howItWorks: [
      { title: "Describe tu negocio", desc: "Nombre, segmento, diferenciales y lo que vendes — en texto libre, a tu manera." },
      { title: "La IA arma la estructura", desc: "Selecciona las secciones según el tipo de negocio: institucional, producto único o catálogo completo." },
      { title: "Revisa y publica", desc: "Ajusta textos, imágenes y colores directamente en pantalla — el sitio puede salir con dominio propio en *.appvendorai.com." },
    ],
    seo: { title: "SEO incorporado, no como plugin aparte", desc: "Cada página generada ya incluye meta title, meta description, datos estructurados y jerarquía correcta de headings — la base técnica de SEO que muchos sitios hechos con prisa no tienen." },
    learning: { title: "Aprende de lo que ya funciona en tu mercado", desc: "El generador usa los mismos 50 perfiles verticales de Revenue Scout, por lo que el sitio nace hablando el idioma de tu segmento en vez de reutilizar un texto genérico para cualquier nicho." },
    ctaLabel: "Generar mi sitio gratis",
  },
  "analise-de-site": {
    eyebrow: "Diagnóstico antes de cualquier acción",
    title: "Análisis de tu sitio actual",
    subtitle: "Pega la URL del sitio que ya tienes. La IA analiza estructura, contenido y señales de SEO y muestra exactamente qué está perjudicando visitas y conversión antes de sugerir cambios.",
    howItWorks: [
      { title: "Pega la URL", desc: "Sin instalar nada y sin acceso al servidor: solamente la dirección pública del sitio." },
      { title: "La IA analiza toda la página", desc: "Estructura de secciones, textos, llamadas a la acción y señales técnicas de SEO." },
      { title: "Recibe el diagnóstico", desc: "Qué está débil, qué falta y qué conviene priorizar primero para mejorar la conversión." },
    ],
    seo: { title: "Detecta errores técnicos que pasan desapercibidos", desc: "Título ausente, jerarquía de headings incorrecta, meta description genérica o repetida: detalles técnicos que afectan buscadores y visitantes aunque visualmente no sean evidentes." },
    learning: { title: "Se convierte en el punto de partida para rediseñar", desc: "El diagnóstico alimenta directamente al Generador de Sitios; si decides rehacerlo, la IA ya sabe qué errores no debe repetir." },
    ctaLabel: "Analizar mi sitio",
  },
  "content-autopilot": {
    eyebrow: "Marketing de contenido sin redactor",
    title: "Content Autopilot",
    subtitle: "La IA investiga palabras clave de tu mercado, redacta artículos optimizados para SEO y los publica automáticamente, sin que tengas que abrir una pantalla de redacción o contratar una agencia de contenido.",
    howItWorks: [
      { title: "Investigación de palabras clave", desc: "La IA identifica qué está buscando realmente tu público dentro de tu segmento." },
      { title: "Generación del artículo", desc: "Investigador → Creador → Optimizador → Publicador: cada etapa del pipeline mejora el texto antes de publicarlo." },
      { title: "Publicación automática", desc: "El artículo va directo al blog, listo para indexarse, con revisión manual opcional si prefieres validar antes." },
    ],
    seo: { title: "Optimización real, no solamente un texto atractivo", desc: "Cada artículo pasa por una etapa dedicada de optimización de densidad de palabras clave, estructura de headings y meta description antes de publicarse." },
    learning: { title: "Mejora con lo que genera resultados", desc: "Content Autopilot está conectado con la misma inteligencia comercial del CRM y aprende qué temas generan leads reales, no solamente tráfico." },
    ctaLabel: "Ver Content Autopilot",
  },
  "lps-por-vertical": {
    eyebrow: "Una página de venta para cada mercado",
    title: "50 Landing Pages por Vertical",
    subtitle: "Cada uno de los 50 perfiles de mercado de VendorAI tiene su propia LP con estructura de venta SPIN Selling; no es una plantilla genérica con el nombre cambiado.",
    howItWorks: [
      { title: "Elige tu mercado", desc: "Retail, clínicas, concesionarias, distribuidoras, servicios profesionales e industrias: 6 macrosegmentos y 50 mercados." },
      { title: "La LP ya nace contextualizada", desc: "Jornada, dolores, agentes prioritarios y señales de oportunidad específicos de ese mercado." },
      { title: "Se conecta directamente con el CRM", desc: "Cada lead que completa el formulario entra en el pipeline correcto con el Agente de Recepción tomando el primer contacto." },
    ],
    seo: { title: "Una página específica compite mejor que una página genérica", desc: "Una LP que habla el lenguaje exacto de una distribuidora de autopartes puede competir mejor en Google que una página genérica de CRM para empresas que intenta atender a todos." },
    learning: { title: "Cada mercado tiene su propio Revenue Scout", desc: "No cambia solamente el texto: la LP refleja las señales de oportunidad que Revenue Scout de ese mercado sabe buscar." },
    ctaLabel: "Ver las LPs por segmento",
  },
  "plano-de-midia": {
    eyebrow: "Estrategia de marketing lista, no una hoja vacía",
    title: "Plan de Medios con IA",
    subtitle: "La IA analiza tu negocio, competidores y búsquedas del mercado y entrega un plan de medios completo: canales prioritarios, distribución sugerida del presupuesto y qué publicar.",
    howItWorks: [
      { title: "Diagnóstico automático", desc: "La IA mapea fortalezas actuales y oportunidades reales a partir del perfil del negocio y de lo que ya se está haciendo." },
      { title: "Canales priorizados con % de presupuesto", desc: "Cada canal recomendado incluye prioridad, motivo y una distribución sugerida del presupuesto." },
      { title: "Se convierte en calendario de contenido", desc: "Los pilares del plan se transforman en un calendario editorial por semana, pilar y formato: feed, stories y reels." },
    ],
    seo: { title: "Basado en competidores y búsquedas reales", desc: "El plan utiliza competidores encontrados en la investigación y palabras clave relevantes del mercado para construir una estrategia basada en datos." },
    learning: { title: "Acciones inmediatas, no solamente teoría", desc: "Además del diagnóstico, el plan entrega acciones para comenzar a ejecutar y puede conectarse con Content Autopilot para poner el calendario en marcha." },
    ctaLabel: "Generar mi plan de medios",
  },
};

export function localizeFeatureDetail(feature: FeatureDetail, isSpanish: boolean): FeatureDetail {
  if (!isSpanish) return feature;
  const localized = FEATURES_ES[feature.slug];
  return localized ? { ...feature, ...localized } : feature;
}
