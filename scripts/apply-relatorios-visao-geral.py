from pathlib import Path

app_path = Path('artifacts/frontend/src/App.tsx')
sidebar_path = Path('artifacts/frontend/src/components/layout/SidebarLayout.tsx')
report_path = Path('artifacts/frontend/src/pages/RelatoriosVisaoGeral.tsx')

app = app_path.read_text()
anchor_import = 'const AgentConfig        = lazy(() => import("@/pages/agents/AgentConfig"));\n'
new_import = anchor_import + 'const RelatoriosVisaoGeral = lazy(() => import("@/pages/RelatoriosVisaoGeral"));\n'
if 'const RelatoriosVisaoGeral' not in app:
    assert anchor_import in app, 'App import anchor not found'
    app = app.replace(anchor_import, new_import, 1)

route_anchor = '        <Route path="/relatorios/ganhos-mes">\n          {() => <ProtectedRoute component={RelatorioGanhosMes} />}\n        </Route>\n'
route_block = '        <Route path="/relatorios">\n          {() => <ProtectedRoute component={RelatoriosVisaoGeral} />}\n        </Route>\n' + route_anchor
if '<Route path="/relatorios">' not in app:
    assert route_anchor in app, 'App route anchor not found'
    app = app.replace(route_anchor, route_block, 1)
app_path.write_text(app)

sidebar = sidebar_path.read_text()
sidebar_anchor = '''              <Link
                href="/relatorios/ganhos-mes"
                onClick={onNavigate}
'''
sidebar_block = '''              <Link
                href="/relatorios"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  location === "/relatorios"
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Visão Geral
              </Link>
''' + sidebar_anchor
if 'href="/relatorios"' not in sidebar:
    assert sidebar_anchor in sidebar, 'Sidebar reports anchor not found'
    sidebar = sidebar.replace(sidebar_anchor, sidebar_block, 1)
sidebar_path.write_text(sidebar)

report = report_path.read_text()
report = report.replace('BriefcaseBusiness,', 'Briefcase,')
report = report.replace('<BriefcaseBusiness className="h-4 w-4" />', '<Briefcase className="h-4 w-4" />')
old_coverage = '''    const profileFields = activeLeads.reduce((sum, lead) => {
      return sum + Number(!!lead.genero || !!lead.dataNascimento || !!lead.tipoPessoa || !!lead.representanteProfissao || !!extractLocality(lead));
    }, 0);
    const profileCoverage = activeLeads.length ? (profileFields / activeLeads.length) * 100 : 0;
'''
new_coverage = '''    const profiledLeads = activeLeads.filter((lead) =>
      !!lead.genero || !!lead.dataNascimento || !!lead.representanteProfissao || !!extractLocality(lead)
    ).length;
    const profileCoverage = activeLeads.length ? (profiledLeads / activeLeads.length) * 100 : 0;
'''
assert old_coverage in report, 'Report coverage block not found'
report = report.replace(old_coverage, new_coverage, 1)
report = report.replace('percent(Math.min(100, metrics.profileCoverage))', 'percent(metrics.profileCoverage)')
report_path.write_text(report)
