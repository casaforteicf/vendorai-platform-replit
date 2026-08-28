from pathlib import Path

# Backend: cadastro Praça.ai cria a conta, mas NÃO libera o marketplace.
auth_path = Path('artifacts/api-server/src/routes/auth.ts')
auth = auth_path.read_text()
start = auth.index('router.post("/auth/praca-signup"')
end = auth.index('router.post("/auth/demo-login"', start)
block = auth[start:end]
assert 'vendeNoPracaAi: true,' in block, 'praca-signup no longer auto-enables Praça.ai or anchor changed'
block = block.replace('vendeNoPracaAi: true,', 'vendeNoPracaAi: false,', 1)
block = block.replace(
    '// Cadastro gratuito e PERMANENTE pra vender no Praça.ai — diferente do\n'
    '// /auth/demo-signup acima (que é trial de 5 dias, isDemo=true). Aqui o\n'
    '// tenant nasce ativo, no plano Start (grátis, sem custo, ferramentas\n'
    '// mínimas: Catálogo/Pedidos/Configurações), já habilitado pra vender no\n'
    '// Praça.ai (vendeNoPracaAi=true) com a comissão padrão (8%, editável só\n'
    '// por super_admin depois, caso a caso). Lojista pode assinar um plano\n'
    '// pago a qualquer momento pra liberar mais ferramentas — nunca é cobrado\n'
    '// nesse cadastro.\n',
    '// Cadastro gratuito e PERMANENTE do lojista vindo do Praça.ai — diferente do\n'
    '// /auth/demo-signup acima (trial de 5 dias). A conta nasce ativa no plano\n'
    '// Start, mas o acesso operacional ao marketplace NÃO é liberado aqui.\n'
    '// vendeNoPracaAi permanece false até decisão explícita do SuperAdmin pelo\n'
    '// endpoint /superadmin/tenants/:id/praca-ai. O lojista pode configurar\n'
    '// catálogo e conta enquanto aguarda essa liberação.\n',
)
old_response = 'tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, comissaoPracaAiPercentual: tenant.comissaoPracaAiPercentual },'
new_response = 'tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, vendeNoPracaAi: tenant.vendeNoPracaAi, comissaoPracaAiPercentual: tenant.comissaoPracaAiPercentual },'
assert old_response in block, 'praca-signup response anchor not found'
block = block.replace(old_response, new_response, 1)
auth = auth[:start] + block + auth[end:]
auth_path.write_text(auth)

# Website: cadastro é imediato; publicação/venda na Praça.ai depende de aprovação.
site_path = Path('artifacts/website/src/pages/CadastroPraca.tsx')
site = site_path.read_text()
site = site.replace(
    'toast({ title: "Loja cadastrada!", description: "Redirecionando pro painel..." });',
    'toast({ title: "Loja cadastrada!", description: "Sua conta está pronta. A publicação no Praça.ai fica aguardando liberação da plataforma." });',
    1,
)
site = site.replace('Venda no Praça.ai de graça', 'Cadastre sua loja para vender no Praça.ai', 1)
site = site.replace(
    'Cadastre sua loja sem custo nenhum. Comece com o essencial e evolua no seu ritmo.',
    'Cadastre sua loja sem custo. Você já pode configurar o catálogo e o painel; a publicação na vitrine do Praça.ai acontece após liberação da plataforma.',
    1,
)
site = site.replace(
    '<p className="text-slate-500 mb-6">Gratuito. Sem cartão de crédito. Sem prazo pra expirar.</p>',
    '<p className="text-slate-500 mb-6">Gratuito. Sem cartão de crédito. Sem prazo pra expirar. Publicação sujeita à liberação da plataforma.</p>',
    1,
)
site_path.write_text(site)

# SuperAdmin: deixar claro que esse switch é a liberação mestre do marketplace.
admin_path = Path('artifacts/frontend/src/pages/AdminTenantDetail.tsx')
admin = admin_path.read_text()
admin = admin.replace('label="Vende no Praça.ai"', 'label="Liberação Praça.ai"', 1)
admin = admin.replace(
    '{tenant.vendeNoPracaAi ? "Ativo — produtos marcados aparecem na vitrine pública" : "Inativo"}',
    '{tenant.vendeNoPracaAi ? "Liberado pelo SuperAdmin — produtos marcados aparecem na vitrine pública" : "Aguardando liberação do SuperAdmin"}',
    1,
)
admin_path.write_text(admin)
