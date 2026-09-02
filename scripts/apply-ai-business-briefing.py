from pathlib import Path

frontend = Path('artifacts/frontend/src/pages/SiteGenerator.tsx')
text = frontend.read_text()

text = text.replace(
    'type BriefingSuggestion = { value: string; source: "Perfil" | "Catálogo" | "Mercado"; productId?: string };',
    'type BriefingSuggestion = { value: string; source: "Perfil" | "Catálogo" | "Mercado" | "IA"; productId?: string };\ntype AiBusinessSuggestions = { audiences: Array<{ value: string; reason?: string }>; offers: Array<{ value: string; productId?: string; reason?: string }> };',
)

old_state = '  const [market, setMarket] = useState<{ tone?: string; keywords: Keyword[]; competitors: string[] } | null>(null); const [marketBusy, setMarketBusy] = useState(false);'
new_state = '  const [market, setMarket] = useState<{ tone?: string; keywords: Keyword[]; competitors: string[] } | null>(null); const [marketBusy, setMarketBusy] = useState(false); const [aiBusiness, setAiBusiness] = useState<AiBusinessSuggestions | null>(null); const [aiBusinessBusy, setAiBusinessBusy] = useState(false); const aiBusinessKey = useRef("");'
assert old_state in text, 'market state marker not found'
text = text.replace(old_state, new_state, 1)

old_audience = '''    const marketValues = market?.keywords.slice(0, 3).map((keyword) => ({ value: `Pessoas buscando ${keyword.termo}`, source: "Mercado" as const })) ?? [];
    return uniqueSuggestions([...profileValues, ...marketValues], 8);
  }, [rawProfile, market]);'''
new_audience = '''    const aiValues = aiBusiness?.audiences.map((item) => ({ value: item.value, source: "IA" as const })) ?? [];
    const marketValues = market?.keywords.slice(0, 3).map((keyword) => ({ value: `Pessoas buscando ${keyword.termo}`, source: "Mercado" as const })) ?? [];
    return uniqueSuggestions([...profileValues, ...aiValues, ...marketValues], 8);
  }, [rawProfile, market, aiBusiness]);'''
assert old_audience in text, 'audience marker not found'
text = text.replace(old_audience, new_audience, 1)

old_offer = '''    const productValues = catalog.slice(0, 8).map((product) => ({ value: product.nome, source: "Catálogo" as const, productId: product.id }));
    const categoryValues = groups.slice(0, 5).map(([category]) => ({ value: category, source: "Catálogo" as const }));
    return uniqueSuggestions([...profileValues, ...productValues, ...categoryValues], 10);
  }, [rawProfile, catalog, groups]);'''
new_offer = '''    const productValues = catalog.slice(0, 8).map((product) => ({ value: product.nome, source: "Catálogo" as const, productId: product.id }));
    const aiValues = aiBusiness?.offers.map((item) => ({ value: item.value, source: "IA" as const, productId: item.productId })) ?? [];
    const categoryValues = groups.slice(0, 5).map(([category]) => ({ value: category, source: "Catálogo" as const }));
    return uniqueSuggestions([...profileValues, ...productValues, ...aiValues, ...categoryValues], 10);
  }, [rawProfile, catalog, groups, aiBusiness]);'''
assert old_offer in text, 'offer marker not found'
text = text.replace(old_offer, new_offer, 1)

insert_before = '  function applyBusinessDefaults() {'
new_logic = r'''  async function loadAiBusinessSuggestions(force = false) {
    if (!tenantId || editor || aiBusinessBusy) return;
    const contextKey = `${tenantId}:${mode}:${profileName}:${profileSector}:${profileDesc}:${catalog.length}`;
    if (!force && aiBusinessKey.current === contextKey) return;
    aiBusinessKey.current = contextKey;
    setAiBusinessBusy(true);
    try {
      const response = await resilientFetch(`/api/tenants/${tenantId}/site-generator/briefing-suggestions`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ creationMode: mode }),
      }, 4);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Não foi possível analisar o perfil (${response.status})`);
      setAiBusiness({ audiences: Array.isArray(body.audiences) ? body.audiences : [], offers: Array.isArray(body.offers) ? body.offers : [] });
    } catch (error) {
      if (force) toast({ title: "Não foi possível atualizar as sugestões", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAiBusinessBusy(false);
    }
  }

  useEffect(() => {
    if (editor || !tenantId || (!bp && !catalog.length)) return;
    const timer = window.setTimeout(() => { void loadAiBusinessSuggestions(false); }, 700);
    return () => window.clearTimeout(timer);
  }, [tenantId, mode, bp, catalog.length, editor]);

'''
assert insert_before in text, 'apply defaults marker not found'
text = text.replace(insert_before, new_logic + insert_before, 1)

old_buttons = '<div className="flex items-center gap-2"><Badge variant="outline">{contextSourceCount}/3 fontes</Badge><Button size="sm" variant="outline" onClick={applyBusinessDefaults}><Sparkles className="mr-2 h-4 w-4" />Preencher campos vazios</Button></div>'
new_buttons = '<div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{contextSourceCount}/3 fontes</Badge><Button size="sm" variant="outline" onClick={() => void loadAiBusinessSuggestions(true)} disabled={aiBusinessBusy}>{aiBusinessBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Atualizar sugestões com IA</Button><Button size="sm" variant="outline" onClick={applyBusinessDefaults}>Preencher campos vazios</Button></div>'
assert old_buttons in text, 'context buttons marker not found'
text = text.replace(old_buttons, new_buttons, 1)

frontend.write_text(text)

server = Path('artifacts/api-server/src/routes/site_generator.ts')
text = server.read_text()

old_import = '''  contentAutopilotArticlesTable,
  db,'''
new_import = '''  businessProfilesTable,
  contentAutopilotArticlesTable,
  db,'''
assert old_import in text, 'server import marker not found'
text = text.replace(old_import, new_import, 1)

route_marker = 'router.get("/tenants/:tenantId/site-generator/content-signals", async (req, res) => {'
route = r'''const briefingSuggestionsSchema = z.object({ creationMode: z.string().trim().max(40).optional() });
router.post("/tenants/:tenantId/site-generator/briefing-suggestions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const parsed = briefingSuggestionsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: "Contexto do briefing inválido" });
    return;
  }
  try {
    const [[profile], products] = await Promise.all([
      db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
      db.select().from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId)).limit(40),
    ]);
    if (!profile && products.length === 0) {
      res.json({ audiences: [], offers: [], source: "empty" });
      return;
    }

    const safeProfile = profile
      ? Object.fromEntries(Object.entries(profile as Record<string, unknown>).filter(([key, value]) => {
          if (/token|secret|senha|password|api.?key|credential/i.test(key)) return false;
          return value !== null && value !== undefined && value !== "";
        }))
      : {};
    const catalog = products.map((product: any) => ({
      id: String(product.id ?? ""),
      nome: String(product.nome ?? product.name ?? "").slice(0, 180),
      categoria: String(product.categoria ?? "").slice(0, 120),
      marca: String(product.marca ?? "").slice(0, 120),
      descricao: String(product.descricao ?? "").slice(0, 500),
    })).filter((product) => product.nome);
    const prompt = `Analise o Perfil do Negócio e o catálogo do tenant atual e gere opções comerciais úteis para preencher um briefing de site/landing page.

REGRAS OBRIGATÓRIAS:
- O contexto abaixo pertence SOMENTE a este tenant. Não use conhecimento de outras empresas ou exemplos do VendorAI.
- Entenda o segmento a partir dos dados reais informados no perfil.
- Você pode INFERIR públicos comerciais plausíveis a partir do segmento/descrição, mas não transforme inferências em fatos sobre a empresa.
- Ofertas devem ser produtos, serviços, categorias ou formas plausíveis de apresentar o que a empresa realmente vende. Não invente preço, certificação, garantia, estoque, unidade, depoimento ou condição comercial.
- Se o catálogo tiver produto adequado, devolva exatamente o id informado em productId. Caso contrário, omita productId.
- Gere de 4 a 8 públicos e de 4 a 8 ofertas. Evite opções redundantes ou genéricas demais.
- Responda em português do Brasil.
- Retorne SOMENTE JSON válido: {"audiences":[{"value":"...","reason":"..."}],"offers":[{"value":"...","productId":"...","reason":"..."}]}.

MODO DE CRIAÇÃO: ${parsed.data.creationMode ?? "new-site"}
PERFIL DO NEGÓCIO: ${JSON.stringify(safeProfile).slice(0, 12000)}
CATÁLOGO: ${JSON.stringify(catalog).slice(0, 14000)}`;
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      system: "Você é o Business Context Resolver do VendorAI. Seu trabalho é entender cada tenant pelo próprio perfil e catálogo, sem misturar dados entre empresas e sem inventar fatos.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content.filter((block) => block.type === "text").map((block) => (block as { type: "text"; text: string }).text).join("\n");
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const result = JSON.parse(cleaned) as any;
    const validProductIds = new Set(catalog.map((product) => product.id));
    const audiences = (Array.isArray(result.audiences) ? result.audiences : [])
      .map((item: any) => ({ value: String(item?.value ?? "").trim().slice(0, 180), reason: String(item?.reason ?? "").trim().slice(0, 280) }))
      .filter((item: any) => item.value)
      .slice(0, 8);
    const offers = (Array.isArray(result.offers) ? result.offers : [])
      .map((item: any) => ({
        value: String(item?.value ?? "").trim().slice(0, 180),
        ...(validProductIds.has(String(item?.productId ?? "")) ? { productId: String(item.productId) } : {}),
        reason: String(item?.reason ?? "").trim().slice(0, 280),
      }))
      .filter((item: any) => item.value)
      .slice(0, 8);
    res.json({ audiences, offers, source: "tenant_business_context" });
  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/briefing-suggestions: falhou");
    res.status(502).json({ error: "Não foi possível gerar sugestões agora. O briefing manual e as sugestões locais continuam disponíveis." });
  }
});

'''
assert route_marker in text, 'content signals marker not found'
text = text.replace(route_marker, route + route_marker, 1)
server.write_text(text)
