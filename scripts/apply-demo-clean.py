from pathlib import Path

auth_path = Path('artifacts/api-server/src/routes/auth.ts')
tenants_path = Path('artifacts/api-server/src/routes/tenants.ts')

auth = auth_path.read_text()
tenants = tenants_path.read_text()

old_auth = '''    const { seedDemoData } = await import("./tenants.js");\n    await seedDemoData(tenant.id);\n\n'''
new_auth = '''    // A Demo deve nascer limpa para o usuário conhecer o produto com os próprios\n    // dados. A fixture seedDemoData continua disponível internamente, mas não é\n    // executada automaticamente no cadastro de trial.\n\n'''
if old_auth not in auth:
    raise SystemExit('seed call do demo-signup não encontrado')
auth = auth.replace(old_auth, new_auth, 1)
auth_path.write_text(auth)

old_comment = '// Cria um tenant de demonstração com expiração de 5 dias e popula com dados fake'
new_comment = '// Cria um tenant de demonstração com expiração de 5 dias, sem dados fictícios'
if old_comment not in tenants:
    raise SystemExit('comentário admin demo não encontrado')
tenants = tenants.replace(old_comment, new_comment, 1)

old_admin_seed = '''  // Popular com dados fake\n  await seedDemoData(tenant.id);\n\n'''
new_admin_seed = '''  // Não popula produtos, leads, conversas ou negócios fictícios. A experiência\n  // Demo começa vazia e o usuário inclui seus próprios dados durante o uso.\n\n'''
if old_admin_seed not in tenants:
    raise SystemExit('seed call do admin demo não encontrado')
tenants = tenants.replace(old_admin_seed, new_admin_seed, 1)

old_seed_comment = '// ── Seed de dados fake para demo ──────────────────────────────────────────'
new_seed_comment = '// ── Fixture interna opcional para ambientes de teste/desenvolvimento ──────\n// Não chamar automaticamente em fluxos reais de criação de Demo.'
if old_seed_comment not in tenants:
    raise SystemExit('comentário da fixture não encontrado')
tenants = tenants.replace(old_seed_comment, new_seed_comment, 1)
tenants_path.write_text(tenants)

print('demo clean patch applied')
