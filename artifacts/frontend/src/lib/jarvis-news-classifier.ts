export type JarvisNewsSection =
  | "Notícias Locais"
  | "Política"
  | "Bolsa de Valores"
  | "Criptomoedas"
  | "Economia"
  | "Negócios"
  | "Governo & Regulação"
  | "Saúde"
  | "Tecnologia"
  | "Infraestrutura"
  | "Agro & Ambiente"
  | "Internacional"
  | "Geral";

export type JarvisNewsClassificationItem = {
  title: string;
  excerpt?: string | null;
  categories?: string[] | null;
  sourceScope?: string | null;
  sourceCode?: string | null;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9\s&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(text: string, ...terms: string[]): boolean {
  const haystack = ` ${normalizeText(text)} `;
  return terms.some((term) => {
    const needle = normalizeText(term);
    return needle.length > 0 && haystack.includes(` ${needle} `);
  });
}

function categorySet(item: JarvisNewsClassificationItem): Set<string> {
  return new Set((item.categories ?? []).map(normalizeText).filter(Boolean));
}

function hasCategory(categories: Set<string>, ...terms: string[]): boolean {
  return terms.some((term) => categories.has(normalizeText(term)));
}

export function primaryJarvisNewsSection(item: JarvisNewsClassificationItem): JarvisNewsSection {
  const scope = normalizeText(item.sourceScope ?? "");
  if (["local", "regional", "state", "estadual", "municipal"].includes(scope)) {
    return "Notícias Locais";
  }

  const sourceCode = normalizeText(item.sourceCode ?? "");
  if (sourceCode === "investing br acoes") return "Bolsa de Valores";
  if (sourceCode === "investing br cripto") return "Criptomoedas";
  if (sourceCode === "investing br politica") return "Política";

  const categories = categorySet(item);
  if (hasCategory(categories, "noticias-locais", "notícias locais")) return "Notícias Locais";
  if (hasCategory(categories, "criptomoedas", "bitcoin", "ethereum", "cripto")) return "Criptomoedas";
  if (hasCategory(categories, "bolsa-de-valores", "ações", "acoes", "ibovespa", "b3")) return "Bolsa de Valores";
  if (hasCategory(categories, "politica", "política", "eleitoral")) return "Política";
  if (hasCategory(categories, "saude", "saúde")) return "Saúde";
  if (hasCategory(categories, "ciencia", "ciência", "tecnologia", "inovacao", "inovação")) return "Tecnologia";
  if (hasCategory(categories, "infraestrutura", "transporte", "transito", "trânsito", "logistica", "logística")) return "Infraestrutura";
  if (hasCategory(categories, "agropecuaria", "agropecuária", "agronegocio", "agronegócio", "meio-ambiente", "sustentabilidade")) return "Agro & Ambiente";
  if (hasCategory(categories, "internacional", "geopolitica", "geopolítica", "comercio-exterior", "comércio exterior")) return "Internacional";
  if (hasCategory(categories, "economia", "macroeconomia", "tributos")) return "Economia";
  if (hasCategory(categories, "industria", "indústria", "comercio", "comércio", "empresas", "consumidor", "trabalho", "emprego")) return "Negócios";
  if (hasCategory(categories, "governo", "regulatorio", "regulatório", "regulacao", "regulação", "justica", "justiça", "legislativo", "administracao-publica", "administração pública")) return "Governo & Regulação";

  const text = `${item.title} ${item.excerpt ?? ""}`;

  if (hasPhrase(text,
    "bitcoin", "btc", "ethereum", "eth", "criptomoeda", "criptomoedas", "cripto",
    "blockchain", "stablecoin", "token", "altcoin", "exchange de cripto", "mercado cripto",
  )) return "Criptomoedas";

  if (hasPhrase(text,
    "ibovespa", "bovespa", "b3", "bolsa de valores", "mercado acionário", "mercado acionario",
    "ação", "acao", "ações", "acoes", "pregão", "pregao", "ipo", "follow on", "dividendos", "etf",
    "small caps", "nasdaq", "s&p 500", "dow jones", "wall street",
  )) return "Bolsa de Valores";

  if (hasPhrase(text,
    "política", "politica", "eleição", "eleicao", "eleições", "eleicoes", "eleitoral", "congresso",
    "senado", "senador", "câmara dos deputados", "camara dos deputados", "deputado", "presidente",
    "governador", "prefeito", "partido político", "partido politico",
  )) return "Política";

  if (hasPhrase(text, "saúde", "saude", "sus", "médico", "medico", "hospital", "clínica", "clinica")) return "Saúde";
  if (hasPhrase(text, "ciência", "ciencia", "tecnologia", "inovação", "inovacao", "digital", "inteligência artificial", "inteligencia artificial")) return "Tecnologia";
  if (hasPhrase(text, "infraestrutura", "transporte", "trânsito", "transito", "logística", "logistica", "rodovia", "obra", "obras")) return "Infraestrutura";
  if (hasPhrase(text, "agropecuária", "agropecuaria", "agronegócio", "agronegocio", "agro", "meio ambiente", "sustentabilidade", "clima")) return "Agro & Ambiente";
  if (hasPhrase(text, "internacional", "geopolítica", "geopolitica", "comércio exterior", "comercio exterior")) return "Internacional";
  if (hasPhrase(text, "economia", "macroeconomia", "tributo", "tributos", "crédito", "credito", "juros", "inflação", "inflacao", "câmbio", "cambio", "dólar", "dolar")) return "Economia";
  if (hasPhrase(text, "indústria", "industria", "comércio", "comercio", "consumidor", "trabalho", "emprego", "empresa", "empresas", "negócio", "negocio", "negócios", "negocios")) return "Negócios";
  if (hasPhrase(text, "governo", "legislativo", "administração pública", "administracao publica", "regulatório", "regulatorio", "regulação", "regulacao", "justiça", "justica", "lei", "decreto")) return "Governo & Regulação";

  return "Geral";
}
