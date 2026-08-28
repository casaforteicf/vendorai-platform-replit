from __future__ import annotations

import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
OLD_BASE = "4721e3f1e0c660cb33880e2810442ae1b2ffc634"
REAL_MODULES = "fcce56018bb6a255e0ea10b7878e658d92478ec5"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Trecho não encontrado: {label}")
    return text.replace(old, new, 1)


def copy_from(commit: str, path: str) -> None:
    data = subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


# ---------------------------------------------------------------------------
# 1) Reaproveitar apenas os módulos reais do PR #144 e o callback Google.
# ---------------------------------------------------------------------------
for p in [
    "artifacts/frontend/src/pages/leads/import-config.tsx",
    "artifacts/frontend/src/pages/contacts-nonleads/index.tsx",
    "artifacts/frontend/src/pages/erp/index.tsx",
]:
    copy_from(REAL_MODULES, p)

copy_from(OLD_BASE, "artifacts/frontend/src/pages/GoogleAuthSuccess.tsx")
copy_from(OLD_BASE, "artifacts/api-server/src/routes/google-login.ts")

# Google login: callback deve ser configuração explícita, sem hostname incorreto embutido.
p = "artifacts/api-server/src/routes/google-login.ts"
s = read(p)
s = re.sub(
    r'const DEFAULT_GOOGLE_CALLBACK_URL =\n\s*"[^"]+";\n\n',
    "",
    s,
    count=1,
)
s = must_replace(
    s,
    'callbackUrl: process.env.GOOGLE_CALLBACK_URL?.trim() || DEFAULT_GOOGLE_CALLBACK_URL,',
    'callbackUrl: process.env.GOOGLE_CALLBACK_URL?.trim() ?? "",',
    "google callback env",
)
s = must_replace(
    s,
    'if (!clientId || !clientSecret || !stateSecret()) {',
    'if (!clientId || !clientSecret || !callbackUrl || !stateSecret()) {',
    "google auth config check",
)
s = must_replace(
    s,
    'if (!clientId || !clientSecret || !code || !state || !isValidState(state)) {',
    'if (!clientId || !clientSecret || !callbackUrl || !code || !state || !isValidState(state)) {',
    "google callback config check",
)
write(p, s)

# .env.example: URI explícita e sem valor incorreto predefinido.
p = ".env.example"
s = read(p)
if "GOOGLE_CALLBACK_URL=" not in s:
    s = must_replace(
        s,
        "GOOGLE_CLIENT_SECRET=\n",
        "GOOGLE_CLIENT_SECRET=\nGOOGLE_CALLBACK_URL=\n",
        "env google callback",
    )
if "GOOGLE_REDIRECT_URI=" not in s:
    s = must_replace(
        s,
        "GOOGLE_CALLBACK_URL=\n",
        "GOOGLE_CALLBACK_URL=\nGOOGLE_REDIRECT_URI=\nFRONTEND_APP_URL=https://app.appvendorai.com\n",
        "env google calendar callback",
    )
write(p, s)

# Backend: registrar o login Google como rota pública oficial.
p = "artifacts/api-server/src/routes/index.ts"
s = read(p)
s = must_replace(
    s,
    'import authRouter, { authProtectedRouter } from "./auth";\n',
    'import authRouter, { authProtectedRouter } from "./auth";\nimport googleLoginRouter from "./google-login";\n',
    "import google login router",
)
s = must_replace(
    s,
    "router.use(authRouter);\n",
    "router.use(authRouter);\nrouter.use(googleLoginRouter);\n",
    "mount google login router",
)
write(p, s)

# ---------------------------------------------------------------------------
# 2) Google Calendar/Agenda: mesma redirect_uri na autorização e no exchange;
#    callback volta ao frontend, e Agenda retorna para /agenda.
# ---------------------------------------------------------------------------
p = "artifacts/api-server/src/lib/google-calendar.ts"
s = read(p)
s = must_replace(
    s,
    'const PRODUCTION_HOSTS = ["appvendorai.com", "www.appvendorai.com"];',
    'const PRODUCTION_HOSTS = ["app.appvendorai.com", "appvendorai.com", "www.appvendorai.com"];',
    "calendar production hosts",
)
old_redirect = '''function getRedirectUri(host?: string): string {
  if (host && PRODUCTION_HOSTS.includes(host.toLowerCase())) {
    return `https://appvendorai.com${CALLBACK_PATH}`;
  }

  const explicit = process.env["GOOGLE_REDIRECT_URI"];
  if (explicit) return explicit;

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}${CALLBACK_PATH}`;
  return `http://localhost:${process.env["PORT"] ?? 5000}${CALLBACK_PATH}`;
}'''
new_redirect = '''function getRedirectUri(host?: string): string {
  // A mesma URI precisa ser usada ao gerar a autorização e ao trocar o code.
  // Por isso uma configuração explícita sempre tem prioridade.
  const explicit = process.env["GOOGLE_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;

  if (host && PRODUCTION_HOSTS.includes(host.toLowerCase())) {
    return `https://app.appvendorai.com${CALLBACK_PATH}`;
  }

  if (process.env.NODE_ENV === "production") {
    return `https://app.appvendorai.com${CALLBACK_PATH}`;
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}${CALLBACK_PATH}`;
  return `http://localhost:${process.env["PORT"] ?? 5000}${CALLBACK_PATH}`;
}'''
s = must_replace(s, old_redirect, new_redirect, "calendar redirect resolver")
write(p, s)

p = "artifacts/api-server/src/routes/agendas.ts"
s = read(p)
s = must_replace(
    s,
    "const url = buildAuthUrl(agenda.id, undefined, host);",
    'const url = buildAuthUrl(agenda.id, "/agenda", host);',
    "agenda return path",
)
old_app_url = '''  const reqHost = req.get("host") ?? "";
  const appUrl = reqHost
    ? `https://${reqHost}`
    : (process.env["APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");'''
new_app_url = '''  const reqHost = req.get("host") ?? "";
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  const appUrl = configuredFrontend
    ? configuredFrontend.replace(/\/$/, "")
    : process.env.NODE_ENV === "production"
      ? "https://app.appvendorai.com"
      : reqHost
        ? `https://${reqHost}`
        : (process.env["APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");'''
s = must_replace(s, old_app_url, new_app_url, "calendar frontend callback host")
s = must_replace(s, 'let returnTo: string = "/app/configuracoes";', 'let returnTo: string = "/agenda";', "calendar default return path")
write(p, s)

# ---------------------------------------------------------------------------
# 3) Login: botão Google no login real.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Login.tsx"
s = read(p)
insert_icon_after = '''const formSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});
'''
google_icon = insert_icon_after + '''
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.91A6.01 6.01 0 0 1 6.08 12c0-.66.11-1.3.31-1.91V7.5H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.5l3.35-2.59Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.5l3.35 2.59C7.18 7.72 9.39 5.96 12 5.96Z" />
    </svg>
  );
}
'''
s = must_replace(s, insert_icon_after, google_icon, "google icon")
s = must_replace(
    s,
    "  function onDemoLogin() {\n",
    '  function onGoogleLogin() {\n    window.location.assign("/api/auth/google");\n  }\n\n  function onDemoLogin() {\n',
    "google login handler",
)
old_demo = '''          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onDemoLogin}
            disabled={demoLoginMutation.isPending}
          >
            {demoLoginMutation.isPending ? "Entrando..." : "Acessar conta de demonstração"}
          </Button>'''
new_demo = '''          <div className="space-y-3">
            <Button type="button" variant="outline" className="w-full gap-2" onClick={onGoogleLogin}>
              <GoogleIcon />
              Entrar com Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onDemoLogin}
              disabled={demoLoginMutation.isPending}
            >
              {demoLoginMutation.isPending ? "Entrando..." : "Acessar conta de demonstração"}
            </Button>
          </div>'''
s = must_replace(s, old_demo, new_demo, "google login button")
write(p, s)

# ---------------------------------------------------------------------------
# 4) Falar com Vendas: rota funcional, sem formulário fake.
# ---------------------------------------------------------------------------
contact_sales = '''import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ContactSales() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 flex items-center justify-center">
      <Card className="w-full max-w-xl">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Falar com Vendas</h1>
            <p className="text-muted-foreground mt-2">Escolha um canal para conversar com o time comercial sobre a continuidade do Vendor.ai.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Button asChild className="h-12">
              <a href="mailto:vendas@appvendorai.com"><Mail className="h-4 w-4 mr-2" />E-mail comercial</a>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <a href="https://wa.me/5549988165795" target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</a>
            </Button>
          </div>
          <Button asChild variant="ghost" className="px-0">
            <a href="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />Voltar ao Vendor.ai</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
'''
write("artifacts/frontend/src/pages/demo/contact-sales.tsx", contact_sales)

p = "artifacts/frontend/src/components/DemoBanner.tsx"
s = read(p)
s = must_replace(s, '<a href="/contato" target="_blank" rel="noopener noreferrer">', '<a href="/demo/contact-sales">', "demo sales href")
write(p, s)

# ---------------------------------------------------------------------------
# 5) FAQ real e navegação: substituir Guia pelo FAQ; Marketing é agrupador.
# ---------------------------------------------------------------------------
faq = '''import { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";

const SECTIONS = [
  { q: "Como começo a usar o Vendor.ai?", a: "Conclua o onboarding do negócio e, em seguida, a etapa de integrações. Depois cadastre ou importe seus leads e use Negócios para acompanhar o funil." },
  { q: "Como importar leads de outra planilha?", a: "Em Leads, abra Importar CSV. Para arquivos com cabeçalhos diferentes, use Mapeamento avançado para relacionar cada coluna da planilha aos campos do CRM antes de importar." },
  { q: "Onde acompanho oportunidades e etapas de venda?", a: "Use Negócios. O Kanban usa os dados reais do CRM e mantém as regras, SLAs, responsáveis, propostas e ações do processo comercial." },
  { q: "Onde ficam fornecedores, parceiros e outros contatos que não são leads?", a: "Em Leads, acesse Outros contatos. Esses registros ficam separados do pipeline comercial e não disparam automações de venda." },
  { q: "Onde configuro WhatsApp, Google Calendar e Instagram?", a: "As conexões ficam centralizadas no onboarding de integrações e nas opções de perfil pertinentes. Não é necessário usar uma segunda tela de integrações no menu principal." },
  { q: "Como conectar o Google Calendar?", a: "Abra Agenda, crie ou selecione uma agenda e use Conectar Google. Após autorizar sua conta, você retorna para a Agenda e os eventos podem ser sincronizados." },
  { q: "Onde ficam campanhas e criação de conteúdo?", a: "Abra Marketing no menu lateral. O gerador, campanhas e Content Autopilot ficam agrupados nessa área para evitar módulos duplicados." },
  { q: "Como lançar um documento no ERP sem digitar tudo?", a: "Abra Gestão ERP e use Capturar documento. Envie uma foto ou PDF, revise os dados sugeridos pela IA e só então confirme o lançamento." },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><HelpCircle className="h-6 w-6 text-primary" />Ajuda e FAQ</h1>
        <p className="text-sm text-muted-foreground mt-1">Respostas rápidas sobre os principais fluxos da plataforma.</p>
      </div>
      <div className="rounded-xl border bg-card divide-y overflow-hidden">
        {SECTIONS.map((item, index) => (
          <div key={item.q}>
            <button type="button" onClick={() => setOpen(open === index ? null : index)} className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-muted/40">
              <span className="font-medium">{item.q}</span>
              {open === index ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            </button>
            {open === index && <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{item.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
'''
write("artifacts/frontend/src/pages/faq/index.tsx", faq)

p = "artifacts/frontend/src/pages/ContentHub.tsx"
s = read(p)
s = must_replace(s, '<Sparkles className="h-6 w-6 text-primary" /> Conteúdo', '<Sparkles className="h-6 w-6 text-primary" /> Marketing', "content hub title")
s = must_replace(s, 'Criação, campanhas multicanal e Variedades do Praça.ai em um único lugar.', 'Conteúdo, campanhas e automação de marketing em um único lugar.', "content hub description")
write(p, s)

p = "artifacts/frontend/src/components/layout/SidebarLayout.tsx"
s = read(p)
s = s.replace('    { name: "Content Autopilot", href: "/content-autopilot", icon: Sparkles, sellerHidden: true, section: "crm", fn: ["administrador"] as UserFunction[] },\n', "")
s = s.replace('    { name: "Campanhas",     href: "/campanhas-nova", icon: Megaphone,      sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },\n', "")
s = s.replace('    { name: "Guia de Setup", href: "/guia-implantacao", icon: BookOpen,     sellerHidden: true,  section: "crm", fn: ["administrador", "outro"] as UserFunction[] },\n', "")
s = must_replace(
    s,
    '    { name: "Configurações", href: "/configuracoes", icon: Settings,        sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },\n',
    '    { name: "Configurações", href: "/configuracoes", icon: Settings,        sellerHidden: false, section: "crm", fn: ["administrador", "outro"] as UserFunction[] },\n    { name: "Ajuda / FAQ",   href: "/faq",           icon: HelpCircle,       sellerHidden: false, section: "crm", fn: ["vendedor", "financeiro", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },\n',
    "faq sidebar",
)
s = must_replace(s, 'const isConteudo = location === "/content" || location.startsWith("/content-studio");', 'const isConteudo = location === "/content" || location === "/content-autopilot";', "marketing active state")
s = must_replace(s, '              Conteúdo\n', '              Marketing\n', "marketing menu label")
# Remove somente o link do Content Studio do submenu; código/rotas ficam preservados por compatibilidade.
s = re.sub(
    r'''\n\s*<Link\n\s*href="/content-studio".*?</Link>''',
    "",
    s,
    count=1,
    flags=re.S,
)
needle = '''              <Link
                href="/content?tab=campanhas"'''
autopilot_link = '''              <Link
                href="/content-autopilot"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/content-autopilot"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Content Autopilot
              </Link>
'''
if needle not in s:
    raise RuntimeError("Trecho não encontrado: inserir Content Autopilot no Marketing")
s = s.replace(needle, autopilot_link + needle, 1)
s = s.replace('"/configuracoes", "/guia-implantacao"', '"/configuracoes", "/faq"')
s = s.replace('settings:   ["/configuracoes"],', 'settings:   ["/configuracoes", "/faq"],')
write(p, s)

# ---------------------------------------------------------------------------
# 6) App: registrar rotas no roteador principal, sem not-found/launcher.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/App.tsx"
s = read(p)
s = must_replace(
    s,
    'const ResetPassword      = lazy(() => import("@/pages/ResetPassword"));\n',
    'const ResetPassword      = lazy(() => import("@/pages/ResetPassword"));\nconst GoogleAuthSuccess  = lazy(() => import("@/pages/GoogleAuthSuccess"));\nconst ContactSales       = lazy(() => import("@/pages/demo/contact-sales"));\n',
    "app public imports",
)
s = must_replace(
    s,
    'const Leads              = lazy(() => import("@/pages/Leads"));\n',
    'const Leads              = lazy(() => import("@/pages/Leads"));\nconst ImportConfig       = lazy(() => import("@/pages/leads/import-config"));\nconst NonLeadContacts    = lazy(() => import("@/pages/contacts-nonleads"));\n',
    "app lead extension imports",
)
s = must_replace(
    s,
    'const GestaoErp          = lazy(() => import("@/pages/GestaoErp"));\n',
    'const GestaoErp          = lazy(() => import("@/pages/GestaoErp"));\nconst ErpCapture         = lazy(() => import("@/pages/erp"));\n',
    "app erp capture import",
)
s = must_replace(
    s,
    'const GuiaImplantacao    = lazy(() => import("@/pages/GuiaImplantacao"));\n',
    'const GuiaImplantacao    = lazy(() => import("@/pages/GuiaImplantacao"));\nconst FAQ                 = lazy(() => import("@/pages/faq"));\n',
    "app faq import",
)
s = must_replace(
    s,
    '''        <Route path="/register">
          <RegisterRoute />
        </Route>''',
    '''        <Route path="/register">
          <RegisterRoute />
        </Route>
        <Route path="/auth/success">
          {() => <GoogleAuthSuccess />}
        </Route>
        <Route path="/demo/contact-sales">
          {() => <ContactSales />}
        </Route>''',
    "app public routes",
)
s = must_replace(
    s,
    '''        <Route path="/leads">
          <ProtectedRoute component={Leads} />
        </Route>''',
    '''        <Route path="/leads/import-config">
          <ProtectedRoute component={ImportConfig} />
        </Route>
        <Route path="/contacts-nonleads">
          <ProtectedRoute component={NonLeadContacts} />
        </Route>
        <Route path="/leads">
          <ProtectedRoute component={Leads} />
        </Route>''',
    "app lead routes",
)
s = must_replace(
    s,
    '''        <Route path="/erp">
          {() => <ProtectedRoute component={GestaoErp} />}
        </Route>''',
    '''        <Route path="/erp/captura">
          {() => <ProtectedRoute component={ErpCapture} />}
        </Route>
        <Route path="/erp">
          {() => <ProtectedRoute component={GestaoErp} />}
        </Route>''',
    "app erp routes",
)
s = must_replace(
    s,
    '''        <Route path="/guia-implantacao">
          {() => <ProtectedRoute component={GuiaImplantacao} />}
        </Route>''',
    '''        <Route path="/faq">
          {() => <ProtectedRoute component={FAQ} />}
        </Route>
        <Route path="/guia-implantacao">
          <RedirectPage to="/faq" />
        </Route>''',
    "app faq route",
)
write(p, s)

# ---------------------------------------------------------------------------
# 7) Leads: recursos avançados ficam dentro do módulo, não na Sidebar.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Leads.tsx"
s = read(p)
# Botão para contatos paralelos no header.
needle = '''        <div className="flex gap-2 flex-wrap">
          {/* Import button + dialog */}'''
replacement = '''        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation("/contacts-nonleads")}>Outros contatos</Button>
          {/* Import button + dialog */}'''
s = must_replace(s, needle, replacement, "leads other contacts button")
# Link para mapeamento avançado dentro do fluxo de importação existente.
needle = '''                  <Button variant="ghost" size="sm" className="gap-2 text-primary" onClick={downloadTemplate}>
                    <FileDown className="h-4 w-4" />
                    Baixar planilha modelo
                  </Button>'''
replacement = needle + '''
                  <Button variant="outline" size="sm" onClick={() => { setIsImportOpen(false); setLocation("/leads/import-config"); }}>
                    Mapeamento avançado
                  </Button>'''
s = must_replace(s, needle, replacement, "advanced lead mapping button")
write(p, s)

# ---------------------------------------------------------------------------
# 8) ERP: captura é ação do ERP, não item de menu.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/GestaoErp.tsx"
s = read(p)
s = must_replace(
    s,
    'import { ArrowDownCircle, ArrowUpCircle, Banknote, Barcode, Boxes, FileCheck2, FileText, Landmark, Loader2, PackageCheck, Plus, Receipt, RefreshCw, Scale, ShieldCheck, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";',
    'import { ArrowDownCircle, ArrowUpCircle, Banknote, Barcode, Boxes, Camera, FileCheck2, FileText, Landmark, Loader2, PackageCheck, Plus, Receipt, RefreshCw, Scale, ShieldCheck, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";',
    "erp camera import",
)
old_buttons = '<div className="flex gap-2"><Button variant="outline" onClick={()=>sync.mutate()} disabled={sync.isPending}>{sync.isPending?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<RefreshCw className="h-4 w-4 mr-2"/>}Sincronizar operação</Button><Button onClick={()=>setTitleOpen(true)}><Plus className="h-4 w-4 mr-2"/>Novo lançamento</Button></div>'
new_buttons = '<div className="flex gap-2 flex-wrap"><Button asChild variant="outline"><Link href="/erp/captura"><Camera className="h-4 w-4 mr-2"/>Capturar documento</Link></Button><Button variant="outline" onClick={()=>sync.mutate()} disabled={sync.isPending}>{sync.isPending?<Loader2 className="h-4 w-4 mr-2 animate-spin"/>:<RefreshCw className="h-4 w-4 mr-2"/>}Sincronizar operação</Button><Button onClick={()=>setTitleOpen(true)}><Plus className="h-4 w-4 mr-2"/>Novo lançamento</Button></div>'
s = must_replace(s, old_buttons, new_buttons, "erp capture button")
write(p, s)

# ---------------------------------------------------------------------------
# 9) Kanban real: header permanece visível, cards rolam verticalmente e a
#    rolagem horizontal fica dentro da área do quadro.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Deals.tsx"
s = read(p)
s = must_replace(s, '<div className="flex flex-col w-72 shrink-0">\n      {/* Column header */}', '<div className="flex flex-col w-72 shrink-0 h-full min-h-0">\n      {/* Column header */}', "kanban column height")
s = must_replace(s, '<div className="flex items-center justify-between mb-3 px-1">', '<div className="sticky top-0 z-10 flex items-center justify-between mb-2 px-1 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">', "kanban sticky header")
s = must_replace(s, 'className={`flex-1 min-h-[400px] rounded-lg p-2 space-y-2 transition-colors ${', 'className={`flex-1 min-h-0 overflow-y-auto rounded-lg p-2 space-y-2 transition-colors ${', "kanban cards scroll")
s = must_replace(s, '<div className="flex gap-4 overflow-x-auto pb-6 flex-1">', '<div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 flex-1 min-h-0">', "kanban horizontal viewport")
write(p, s)

print("Correções da especificação original aplicadas com sucesso.")
