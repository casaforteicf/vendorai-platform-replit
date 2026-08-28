from pathlib import Path

path = Path('artifacts/frontend/src/pages/Configuracoes.tsx')
text = path.read_text()

state_anchor = '''  const [integracoesUnlocked, setIntegracoesUnlocked] = useState(false);\n  const [integracoesPasswordInput, setIntegracoesPasswordInput] = useState("");\n'''
state_replacement = '''  const [integracoesUnlocked, setIntegracoesUnlocked] = useState(false);\n  const [showAdvancedIntegrations, setShowAdvancedIntegrations] = useState(false);\n  const [integracoesPasswordInput, setIntegracoesPasswordInput] = useState("");\n'''
if state_anchor not in text:
    raise SystemExit('state anchor not found')
text = text.replace(state_anchor, state_replacement, 1)

text = text.replace('''        {/* ── Tab: Integrações ERP ────────────────────────────────────────── */}''', '''        {/* ── Tab: Integrações ────────────────────────────────────────────── */}''', 1)

official_marker = '''            {/* WhatsApp — OAuth via Meta */}'''
recommended = '''            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">\n              <p className="text-sm font-semibold">Conexões recomendadas</p>\n              <p className="text-sm text-muted-foreground">\n                Para WhatsApp, priorize a integração oficial via Meta ou a conexão rápida por QR Code.\n                Configurações manuais e provedores alternativos continuam disponíveis em Opções avançadas.\n              </p>\n            </div>\n\n            {/* WhatsApp — OAuth via Meta */}'''
if official_marker not in text:
    raise SystemExit('official WhatsApp marker not found')
text = text.replace(official_marker, recommended, 1)

manual_anchor = '''            {/* Meta WhatsApp Cloud API — Legacy Manual */}\n            <div className="rounded-xl border bg-card p-6 space-y-5">'''
manual_replacement = '''            {/* Meta WhatsApp Cloud API — Legacy Manual */}\n            <div className={cn("rounded-xl border bg-card p-6 space-y-5", !showAdvancedIntegrations && "hidden")}>'''
if manual_anchor not in text:
    raise SystemExit('manual WhatsApp card anchor not found')
text = text.replace(manual_anchor, manual_replacement, 1)

zapi_anchor = '''            {/* Z-API — WhatsApp não-oficial via Baileys */}\n            <div className="rounded-xl border bg-card p-6 space-y-5">'''
zapi_replacement = '''            <div className="rounded-xl border border-dashed bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">\n              <div>\n                <p className="text-sm font-medium">Opções avançadas de WhatsApp</p>\n                <p className="text-xs text-muted-foreground mt-0.5">\n                  Configuração manual da Meta e Z-API ficam preservadas para cenários específicos e compatibilidade.\n                </p>\n              </div>\n              <Button\n                type="button"\n                variant="outline"\n                size="sm"\n                className="gap-2 shrink-0"\n                onClick={() => setShowAdvancedIntegrations((current) => !current)}\n              >\n                {showAdvancedIntegrations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}\n                {showAdvancedIntegrations ? "Ocultar avançado" : "Mostrar avançado"}\n              </Button>\n            </div>\n\n            {/* Z-API — WhatsApp não-oficial via Baileys */}\n            <div className={cn("rounded-xl border bg-card p-6 space-y-5", !showAdvancedIntegrations && "hidden")}>'''
if zapi_anchor not in text:
    raise SystemExit('Z-API card anchor not found')
text = text.replace(zapi_anchor, zapi_replacement, 1)

path.write_text(text)
print('integracoes UX patch applied')
