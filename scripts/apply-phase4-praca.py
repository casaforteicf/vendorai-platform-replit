from pathlib import Path

repo = Path('.')

tenants_path = repo / 'artifacts/api-server/src/routes/tenants.ts'
admin_path = repo / 'artifacts/frontend/src/pages/AdminTenantDetail.tsx'

tenants = tenants_path.read_text()

anchor = '''router.post("/superadmin/tenants/:id/zapi-test", requireRole("super_admin"), async (req, res) => {\n  const tenantId = String(req.params.id);\n  const phone = String(req.body?.phone ?? "").replace(/\\D/g, "");\n  const message = String(req.body?.message ?? "").trim();\n  if (phone.length < 10 || phone.length > 15) {\n    return res.status(422).json({ error: "Informe um telefone válido com DDD." });\n  }\n  if (!message || message.length > 500) {\n    return res.status(422).json({ error: "A mensagem deve ter entre 1 e 500 caracteres." });\n  }\n\n  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));\n  if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });\n\n  try {\n    await sendDirectWhatsAppMessage(tenantId, phone, message, req.log);\n    return res.json({ ok: true, phone });\n  } catch (error) {\n    req.log.error({ error, tenantId }, "superadmin tenant zapi test failed");\n    return res.status(502).json({ error: error instanceof Error ? error.message : "Falha ao enviar mensagem de teste." });\n  }\n});\n'''

if anchor not in tenants:
    raise SystemExit('anchor zapi-test não encontrado')

praca_route = anchor + '''\n// Liberação mestre do Praça.ai é uma decisão de plataforma. O lojista pode\n// escolher quais itens publicar depois de habilitado, mas não pode liberar\n// o próprio tenant no marketplace.\nrouter.patch("/superadmin/tenants/:id/praca-ai", requireRole("super_admin"), async (req, res) => {\n  const tenantId = String(req.params.id);\n  const enabled = req.body?.enabled;\n\n  if (typeof enabled !== "boolean") {\n    return res.status(422).json({ error: "O campo enabled deve ser booleano." });\n  }\n\n  const [tenant] = await db\n    .update(tenantsTable)\n    .set({ vendeNoPracaAi: enabled, updatedAt: new Date() })\n    .where(eq(tenantsTable.id, tenantId))\n    .returning({\n      id: tenantsTable.id,\n      vendeNoPracaAi: tenantsTable.vendeNoPracaAi,\n      comissaoPracaAiPercentual: tenantsTable.comissaoPracaAiPercentual,\n    });\n\n  if (!tenant) {\n    return res.status(404).json({ error: "Tenant não encontrado." });\n  }\n\n  req.log.info(\n    { tenantId, enabled, actorId: req.user?.sub },\n    "superadmin updated tenant Praça.ai access",\n  );\n\n  return res.json(tenant);\n});\n'''

tenants = tenants.replace(anchor, praca_route, 1)

old_guard = '''  // Comissão do Praça.ai é negociação de plataforma — nem o próprio lojista\n  // (tenant_admin) pode mudar isso, só o super_admin.\n  if ("comissaoPracaAiPercentual" in parsed.data && parsed.data.comissaoPracaAiPercentual !== undefined && req.user?.platformRole !== "super_admin") {\n    res.status(403).json({ error: "Só o admin da plataforma pode alterar a comissão do Praça.ai" });\n    return;\n  }\n'''
new_guard = '''  // Liberação do tenant no Praça.ai e comissão são decisões de plataforma.\n  // O lojista gerencia os itens publicados somente depois que o SuperAdmin\n  // libera o tenant; ele não pode habilitar o próprio acesso via API.\n  const PRACA_AI_PLATFORM_FIELDS = ["comissaoPracaAiPercentual", "vendeNoPracaAi"] as const;\n  const hasPracaAiPlatformField = PRACA_AI_PLATFORM_FIELDS.some(\n    (field) => field in parsed.data && parsed.data[field] !== undefined,\n  );\n  if (hasPracaAiPlatformField && req.user?.platformRole !== "super_admin") {\n    res.status(403).json({ error: "Só o admin da plataforma pode alterar a liberação ou comissão do Praça.ai" });\n    return;\n  }\n'''
if old_guard not in tenants:
    raise SystemExit('guard Praça.ai antigo não encontrado')
tenants = tenants.replace(old_guard, new_guard, 1)
tenants_path.write_text(tenants)

admin = admin_path.read_text()
old_toggle = '''  async function handleToggleVendeNoPracaAi(novoValor: boolean) {\n    setSavingVendeNoPracaAi(true);\n    try {\n      const r = await fetch(`/api/tenants/${id}`, {\n        method: "PATCH",\n        headers: { ...authHeaders, "Content-Type": "application/json" },\n        body: JSON.stringify({ vendeNoPracaAi: novoValor }),\n      });\n      const data = await r.json() as { error?: string };\n      if (!r.ok) {\n        toast({ title: data.error ?? "Erro ao atualizar Praça.ai", variant: "destructive" });\n        return;\n      }\n      void qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] });\n      toast({ title: novoValor ? "Loja ativada no Praça.ai" : "Loja desativada do Praça.ai" });\n    } finally {\n      setSavingVendeNoPracaAi(false);\n    }\n  }\n'''
new_toggle = '''  async function handleToggleVendeNoPracaAi(novoValor: boolean) {\n    setSavingVendeNoPracaAi(true);\n    try {\n      const r = await fetch(`/api/superadmin/tenants/${id}/praca-ai`, {\n        method: "PATCH",\n        headers: { ...authHeaders, "Content-Type": "application/json" },\n        body: JSON.stringify({ enabled: novoValor }),\n      });\n      const data = await r.json() as { error?: string };\n      if (!r.ok) {\n        toast({ title: data.error ?? "Erro ao atualizar Praça.ai", variant: "destructive" });\n        return;\n      }\n      await Promise.all([\n        qc.invalidateQueries({ queryKey: ["admin-tenant-detail", id] }),\n        qc.invalidateQueries({ queryKey: getListTenantsQueryKey() }),\n      ]);\n      toast({ title: novoValor ? "Loja liberada no Praça.ai" : "Loja removida do Praça.ai" });\n    } finally {\n      setSavingVendeNoPracaAi(false);\n    }\n  }\n'''
if old_toggle not in admin:
    raise SystemExit('toggle Praça.ai antigo não encontrado')
admin = admin.replace(old_toggle, new_toggle, 1)
admin_path.write_text(admin)

print('phase4 Praça.ai patch applied')
