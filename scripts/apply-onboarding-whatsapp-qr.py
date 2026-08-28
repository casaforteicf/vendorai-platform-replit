from pathlib import Path

frontend_path = Path('artifacts/frontend/src/pages/OnboardingIntegracoes.tsx')
backend_path = Path('artifacts/api-server/src/routes/onboarding.ts')

frontend = frontend_path.read_text()
backend = backend_path.read_text()

# ── Backend: onboarding reconhece Meta OU Evolution QR ───────────────────────
wa_anchor = '''  const [waConn] = await db\n    .select({ displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber, status: whatsappConnectionsTable.status })\n    .from(whatsappConnectionsTable)\n    .where(and(eq(whatsappConnectionsTable.tenantId, tenantId)));\n'''
wa_replacement = wa_anchor + '''\n  const [evolutionConn] = await db\n    .select({ connected: agentConfigsTable.evolutionConnected, phone: agentConfigsTable.evolutionPhone })\n    .from(agentConfigsTable)\n    .where(eq(agentConfigsTable.tenantId, tenantId));\n'''
if wa_anchor not in backend:
    raise SystemExit('backend WhatsApp anchor not found')
backend = backend.replace(wa_anchor, wa_replacement, 1)

wa_status_old = '''    whatsapp: {\n      connected: waConn?.status === "active",\n      phone: waConn?.displayPhoneNumber ?? null,\n    },'''
wa_status_new = '''    whatsapp: {\n      connected: waConn?.status === "active" || evolutionConn?.connected === true,\n      phone: waConn?.displayPhoneNumber ?? evolutionConn?.phone ?? null,\n    },'''
if wa_status_old not in backend:
    raise SystemExit('backend WhatsApp status block not found')
backend = backend.replace(wa_status_old, wa_status_new, 1)
backend_path.write_text(backend)

# ── Frontend imports / state ─────────────────────────────────────────────────
import_anchor = '''  MessageCircle,\n  Calendar,'''
import_replacement = '''  MessageCircle,\n  QrCode,\n  Calendar,'''
if import_anchor not in frontend:
    raise SystemExit('QrCode import anchor not found')
frontend = frontend.replace(import_anchor, import_replacement, 1)

state_anchor = '''  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<GoogleAdsAccount[]>([]);\n  const [selectedGoogleAdsAccount, setSelectedGoogleAdsAccount] = useState("");\n'''
state_replacement = state_anchor + '''  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);\n  const [whatsappQrConnecting, setWhatsappQrConnecting] = useState(false);\n'''
if state_anchor not in frontend:
    raise SystemExit('frontend state anchor not found')
frontend = frontend.replace(state_anchor, state_replacement, 1)

# Polling: enquanto QR estiver visível, aguarda conexão virar open.
poll_anchor = '''  }, [user?.tenantId]);\n\n  async function saveStep(newStep: number) {'''
poll_replacement = '''  }, [user?.tenantId]);\n\n  useEffect(() => {\n    if (!user?.tenantId || step !== 0 || !whatsappQrCode) return;\n    let active = true;\n\n    const checkEvolution = async () => {\n      try {\n        const evo = await apiFetch(`/api/tenants/${user.tenantId}/evolution-whatsapp/status`) as { connected: boolean; phone: string | null };\n        if (active && evo.connected) {\n          setStatus((current) => current ? { ...current, whatsapp: { connected: true, phone: evo.phone } } : current);\n          setWhatsappQrCode(null);\n          toast({ title: "WhatsApp conectado via QR Code!" });\n        }\n      } catch {\n        // mantém o QR aberto; uma falha transitória não interrompe o onboarding\n      }\n    };\n\n    void checkEvolution();\n    const timer = window.setInterval(() => void checkEvolution(), 2500);\n    return () => {\n      active = false;\n      window.clearInterval(timer);\n    };\n  }, [user?.tenantId, step, whatsappQrCode]);\n\n  async function saveStep(newStep: number) {'''
if poll_anchor not in frontend:
    raise SystemExit('polling anchor not found')
frontend = frontend.replace(poll_anchor, poll_replacement, 1)

# Função para gerar/regerar QR pela API Evolution já existente.
connect_anchor = '''  async function connectWhatsApp() {\n    try {\n      const data = (await apiFetch("/api/auth/whatsapp")) as { url?: string };\n      if (!data.url) {\n        throw new Error("O servidor não retornou a URL de conexão da Meta.");\n      }\n      window.location.assign(data.url);\n    } catch (error) {\n      toast({\n        title: "Não foi possível conectar o WhatsApp",\n        description:\n          error instanceof Error\n            ? error.message\n            : "Verifique a configuração da Meta e tente novamente.",\n        variant: "destructive",\n      });\n    }\n  }\n'''
connect_replacement = connect_anchor + '''\n  async function connectWhatsAppQr() {\n    if (!user?.tenantId) return;\n    setWhatsappQrConnecting(true);\n    try {\n      const data = await apiFetch(`/api/tenants/${user.tenantId}/evolution-whatsapp/connect`, { method: "POST" }) as {\n        qrCodeBase64: string | null;\n        alreadyConnected: boolean;\n      };\n\n      if (data.alreadyConnected) {\n        const evo = await apiFetch(`/api/tenants/${user.tenantId}/evolution-whatsapp/status`) as { connected: boolean; phone: string | null };\n        setStatus((current) => current ? { ...current, whatsapp: { connected: evo.connected, phone: evo.phone } } : current);\n        setWhatsappQrCode(null);\n        if (evo.connected) toast({ title: "WhatsApp já está conectado via QR Code." });\n        return;\n      }\n\n      if (!data.qrCodeBase64) throw new Error("A Evolution API não retornou um QR Code.");\n      setWhatsappQrCode(data.qrCodeBase64);\n    } catch (error) {\n      toast({\n        title: "Não foi possível gerar o QR Code",\n        description: error instanceof Error ? error.message : "Verifique a integração Evolution API.",\n        variant: "destructive",\n      });\n    } finally {\n      setWhatsappQrConnecting(false);\n    }\n  }\n'''
if connect_anchor not in frontend:
    raise SystemExit('connectWhatsApp anchor not found')
frontend = frontend.replace(connect_anchor, connect_replacement, 1)

# Normaliza base64 para src da imagem.
isdone_anchor = '''  const isDone = step >= STEPS.length;\n\n  return ('''
isdone_replacement = '''  const isDone = step >= STEPS.length;\n  const whatsappQrSrc = whatsappQrCode\n    ? (whatsappQrCode.startsWith("data:") ? whatsappQrCode : `data:image/png;base64,${whatsappQrCode}`)\n    : null;\n\n  return ('''
if isdone_anchor not in frontend:
    raise SystemExit('isDone anchor not found')
frontend = frontend.replace(isdone_anchor, isdone_replacement, 1)

# Substitui só a UI da etapa WhatsApp; as demais etapas permanecem intactas.
step_old = '''          {/* STEP 0 — WhatsApp */}\n          {step === 0 && (\n            <StepCard\n              icon={<MessageCircle className="h-8 w-8 text-green-500" />}\n              title="Conecte seu WhatsApp"\n              subtitle="Receba e responda mensagens dos seus clientes direto na plataforma"\n              connected={status?.whatsapp?.connected}\n              connectedLabel={status?.whatsapp?.phone ? `WhatsApp — ${status.whatsapp.phone}` : "WhatsApp conectado"}\n              onSkip={skip}\n              onConnect={connectWhatsApp}\n              connectLabel="Conectar via Meta"\n              advancing={submitting}\n              onAdvance={advance}\n            />\n          )}\n'''
step_new = '''          {/* STEP 0 — WhatsApp */}\n          {step === 0 && (\n            <div className="space-y-6">\n              <div className="flex flex-col items-center text-center gap-3">\n                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-50">\n                  <MessageCircle className="h-8 w-8 text-green-600" />\n                </div>\n                <h2 className="text-xl font-bold">Conecte seu WhatsApp</h2>\n                <p className="text-muted-foreground text-sm max-w-sm">\n                  Escolha a conexão oficial via Meta ou conecte rapidamente escaneando um QR Code.\n                </p>\n              </div>\n\n              {status?.whatsapp?.connected ? (\n                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">\n                  <CheckCircle2 className="h-4 w-4 shrink-0" />\n                  {status.whatsapp.phone ? `WhatsApp — ${status.whatsapp.phone}` : "WhatsApp conectado"}\n                </div>\n              ) : (\n                <div className="space-y-4">\n                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">\n                    <Button onClick={connectWhatsApp} className="gap-2" disabled={whatsappQrConnecting}>\n                      <MessageCircle className="h-4 w-4" />\n                      Meta oficial\n                    </Button>\n                    <Button variant="outline" onClick={connectWhatsAppQr} className="gap-2" disabled={whatsappQrConnecting}>\n                      {whatsappQrConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}\n                      {whatsappQrCode ? "Gerar novo QR" : "Conectar por QR Code"}\n                    </Button>\n                  </div>\n\n                  {whatsappQrSrc && (\n                    <div className="rounded-xl border bg-card p-5 space-y-4 text-center">\n                      <div>\n                        <p className="font-medium text-sm">Escaneie com o WhatsApp</p>\n                        <p className="text-xs text-muted-foreground mt-1">\n                          No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.\n                        </p>\n                      </div>\n                      <img src={whatsappQrSrc} alt="QR Code para conectar WhatsApp" className="w-56 h-56 mx-auto rounded-lg border bg-white p-2" />\n                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">\n                        <Loader2 className="h-3.5 w-3.5 animate-spin" />\n                        Aguardando leitura do QR Code…\n                      </div>\n                    </div>\n                  )}\n                </div>\n              )}\n\n              <div className="flex gap-3">\n                <Button variant="outline" className="flex-1 gap-2" onClick={skip} disabled={submitting}>\n                  <SkipForward className="h-4 w-4" /> Pular\n                </Button>\n                {status?.whatsapp?.connected && (\n                  <Button className="flex-1 gap-2" onClick={advance} disabled={submitting}>\n                    Continuar <ChevronRight className="h-4 w-4" />\n                  </Button>\n                )}\n              </div>\n            </div>\n          )}\n'''
if step_old not in frontend:
    raise SystemExit('STEP 0 WhatsApp block not found')
frontend = frontend.replace(step_old, step_new, 1)

frontend_path.write_text(frontend)
print('onboarding WhatsApp QR patch applied')
