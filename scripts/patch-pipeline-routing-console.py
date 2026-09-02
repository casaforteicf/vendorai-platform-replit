from pathlib import Path

ROOT = Path('.')

def patch(path: str, old: str, new: str, label: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# PipelineNav: pathname real, evitando navegação apenas por query string.
patch(
    'artifacts/frontend/src/components/PipelineNav.tsx',
    '''  { key: "execucao", label: "Execução / Pedidos", href: "/pipeline-operacional?tab=execucao" },\n  { key: "suporte", label: "Suporte / Assistência", href: "/pipeline-operacional?tab=suporte" },\n  { key: "aquecimento", label: "Aquecimento", href: "/pipeline-relacionamento?tab=aquecimento" },\n  { key: "parceiros", label: "Parceiros", href: "/pipeline-relacionamento?tab=parceiros" },''',
    '''  { key: "execucao", label: "Execução / Pedidos", href: "/pipeline-operacional/execucao" },\n  { key: "suporte", label: "Suporte / Assistência", href: "/pipeline-operacional/suporte" },\n  { key: "aquecimento", label: "Aquecimento", href: "/pipeline-relacionamento/aquecimento" },\n  { key: "parceiros", label: "Parceiros", href: "/pipeline-relacionamento/parceiros" },''',
    'PipelineNav hrefs',
)

# App: aceita URLs novas por pathname e mantém URLs antigas como fallback.
patch(
    'artifacts/frontend/src/App.tsx',
    '''        <Route path="/pipeline-operacional">\n          <ProtectedRoute component={PipelineOperacional} />\n        </Route>\n        <Route path="/pipeline-relacionamento">\n          <ProtectedRoute component={PipelineRelacionamento} />\n        </Route>''',
    '''        <Route path="/pipeline-operacional/:tab">\n          <ProtectedRoute component={PipelineOperacional} />\n        </Route>\n        <Route path="/pipeline-operacional">\n          <ProtectedRoute component={PipelineOperacional} />\n        </Route>\n        <Route path="/pipeline-relacionamento/:tab">\n          <ProtectedRoute component={PipelineRelacionamento} />\n        </Route>\n        <Route path="/pipeline-relacionamento">\n          <ProtectedRoute component={PipelineRelacionamento} />\n        </Route>''',
    'App pipeline routes',
)

# Operacional: a tab agora acompanha pathname; query antiga continua suportada.
patch(
    'artifacts/frontend/src/pages/PipelineOperacional.tsx',
    '''  const params = new URLSearchParams(window.location.search);\n  const pipeline: PipelineKind = params.get("tab") === "suporte" ? "suporte" : "execucao";''',
    '''  const params = new URLSearchParams(window.location.search);\n  const pathTab = window.location.pathname.split("/").filter(Boolean).at(-1);\n  const pipeline: PipelineKind = pathTab === "suporte" || params.get("tab") === "suporte" ? "suporte" : "execucao";''',
    'PipelineOperacional active tab',
)
patch(
    'artifacts/frontend/src/pages/PipelineOperacional.tsx',
    '''  function setPipeline(next: PipelineKind | "comercial" | "aquecimento" | "parceiros") {\n    if (next === "comercial") navigate("/deals");\n    else if (next === "aquecimento" || next === "parceiros") navigate(`/pipeline-relacionamento?tab=${next}`);\n    else navigate(`/pipeline-operacional?tab=${next}`);\n  }''',
    '''  function setPipeline(next: PipelineKind | "comercial" | "aquecimento" | "parceiros") {\n    if (next === "comercial") navigate("/deals");\n    else if (next === "aquecimento" || next === "parceiros") navigate(`/pipeline-relacionamento/${next}`);\n    else navigate(`/pipeline-operacional/${next}`);\n  }''',
    'PipelineOperacional navigation',
)

# Relacionamento: mesma correção para Aquecimento/Parceiros.
patch(
    'artifacts/frontend/src/pages/PipelineRelacionamento.tsx',
    '''  const params = new URLSearchParams(window.location.search);\n  const tab = params.get("tab") === "parceiros" ? "parceiros" : "aquecimento";''',
    '''  const params = new URLSearchParams(window.location.search);\n  const pathTab = window.location.pathname.split("/").filter(Boolean).at(-1);\n  const tab = pathTab === "parceiros" || params.get("tab") === "parceiros" ? "parceiros" : "aquecimento";''',
    'PipelineRelacionamento active tab',
)
patch(
    'artifacts/frontend/src/pages/PipelineRelacionamento.tsx',
    '''  const nav = (next: string) => {\n    if (next === "comercial") navigate("/deals");\n    else if (next === "execucao" || next === "suporte") navigate(`/pipeline-operacional?tab=${next}`);\n    else navigate(`/pipeline-relacionamento?tab=${next}`);\n  };''',
    '''  const nav = (next: string) => {\n    if (next === "comercial") navigate("/deals");\n    else if (next === "execucao" || next === "suporte") navigate(`/pipeline-operacional/${next}`);\n    else navigate(`/pipeline-relacionamento/${next}`);\n  };''',
    'PipelineRelacionamento navigation',
)

# StoreSwitcher: o frontend estava chamando rotas que ainda não existem no backend.
patch(
    'artifacts/frontend/src/components/StoreSwitcher.tsx',
    '''const TOKEN_KEY = "vendorai_token";\n\nexport function StoreSwitcher() {''',
    '''const TOKEN_KEY = "vendorai_token";\nconst STORE_SWITCHER_ENABLED = import.meta.env.VITE_STORE_SWITCHER_ENABLED === "true";\n\nexport function StoreSwitcher() {''',
    'StoreSwitcher flag',
)
patch(
    'artifacts/frontend/src/components/StoreSwitcher.tsx',
    '''    enabled: !!token,''',
    '''    enabled: STORE_SWITCHER_ENABLED && !!token,''',
    'StoreSwitcher query enabled',
)
patch(
    'artifacts/frontend/src/components/StoreSwitcher.tsx',
    '''  if (isLoading || !data || data.tenants.length === 0) return null;''',
    '''  if (!STORE_SWITCHER_ENABLED || isLoading || !data || data.tenants.length === 0) return null;''',
    'StoreSwitcher render gate',
)

# Sidebar: não transformar UUID/valor inválido de logo em request relativo /<uuid>.
patch(
    'artifacts/frontend/src/components/layout/SidebarLayoutLegacy.tsx',
    '''  function resolveImgUrl(url: string | null | undefined): string | null {\n    if (!url) return null;\n    return url.startsWith("/objects/") ? `/api/storage${url}` : url;\n  }''',
    '''  function resolveImgUrl(url: string | null | undefined): string | null {\n    if (!url) return null;\n    const value = url.trim();\n    if (!value) return null;\n    if (value.startsWith("/objects/")) return `/api/storage${value}`;\n    if (value.startsWith("objects/")) return `/api/storage/${value}`;\n    if (/^(https?:|data:|blob:)/i.test(value) || value.startsWith("/api/") || value.startsWith("/")) return value;\n    // Valores antigos gravados apenas como UUID/chave não são URLs públicas.\n    // Ignorar evita requests como GET /500dad44-... => 404; o logo VendorAI vira fallback.\n    return null;\n  }''',
    'Sidebar logo URL normalization',
)

print('patch aplicado')
