from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, value: str) -> None:
    (ROOT / path).write_text(value, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Trecho não encontrado: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Verticais: editor operacional dentro do módulo real de Super Admin.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/AdminVerticals.tsx"
s = read(p)
s = replace_once(
    s,
    'import { cn } from "@/lib/utils";\n',
    'import { cn } from "@/lib/utils";\nimport { VerticalTemplateEditor } from "@/components/admin/VerticalTemplateEditor";\n',
    "vertical editor import",
)
s = replace_once(
    s,
    '  const { data: templates = [] } = useListSegmentTemplates();\n',
    '  const { data: templates = [], refetch: refetchTemplates } = useListSegmentTemplates();\n',
    "vertical template refetch",
)
marker = '''          {/* ── Funcionalidades do módulo ──────────────────────── */}
          <section className="space-y-2">'''
insert = '''          {template && (
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Configuração operacional</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Edite o funil, categorias e orientações dos agentes desta vertical sem alterar o layout nem os tenants existentes.
                </p>
              </div>
              <VerticalTemplateEditor
                template={template}
                onSaved={() => refetchTemplates()}
              />
            </section>
          )}

          {/* ── Funcionalidades do módulo ──────────────────────── */}
          <section className="space-y-2">'''
s = replace_once(s, marker, insert, "vertical editor section")
s = replace_once(
    s,
    '            Visualize qualquer layout sem tenant ou acesse módulos vinculados a clientes reais.\n',
    '            Visualize layouts, edite a configuração operacional das verticais e acesse módulos vinculados a clientes reais.\n',
    "vertical page subtitle",
)
write(p, s)


# ---------------------------------------------------------------------------
# Orçamentos: tornar as três origens já reais mais claras na UX.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/Propostas.tsx"
s = read(p)
s = replace_once(s, '                Template de Plano\n', '                Modelos de orçamento\n', "proposal template label")
s = replace_once(s, '                Do Catálogo\n', '                Catálogo\n', "proposal catalog label")
s = replace_once(
    s,
    '                <p className="text-sm text-muted-foreground">Selecione um plano para pré-preencher implantação + mensalidade.</p>\n',
    '                <p className="text-sm text-muted-foreground">Escolha um modelo pronto para criar o orçamento com itens e valores pré-configurados. Você poderá revisar antes de enviar.</p>\n',
    "proposal template helper",
)
s = replace_once(
    s,
    '            {/* Mode tabs */}\n            <div className="flex rounded-lg border overflow-hidden text-sm">\n',
    '            {/* Origens do orçamento: todas usam o mesmo fluxo e persistência real. */}\n            <div className="rounded-lg border bg-muted/20 p-3">\n              <p className="text-xs font-medium">Como deseja montar este orçamento?</p>\n              <p className="text-xs text-muted-foreground mt-0.5">Use um modelo pronto, selecione produtos do catálogo ou informe itens livres.</p>\n            </div>\n            <div className="flex rounded-lg border overflow-hidden text-sm">\n',
    "proposal source helper",
)
write(p, s)


# ---------------------------------------------------------------------------
# Relatório de ganhos: remover KPI fictício de meta e usar taxa real de ganho.
# ---------------------------------------------------------------------------
p = "artifacts/frontend/src/pages/RelatorioGanhosMes.tsx"
s = read(p)
s = replace_once(
    s,
    '  const totalGanho = ganhosMes.reduce((s, d) => s + parseFloat(String(d.valor ?? "0")), 0);\n  const qtdDeals = ganhosMes.length;\n  const ticketMedio = qtdDeals > 0 ? totalGanho / qtdDeals : 0;\n',
    '  const totalGanho = ganhosMes.reduce((s, d) => s + parseFloat(String(d.valor ?? "0")), 0);\n  const qtdDeals = ganhosMes.length;\n  const ticketMedio = qtdDeals > 0 ? totalGanho / qtdDeals : 0;\n  const dealsMovimentadosMes = deals.filter((d) => {\n    const updated = d.updatedAt ? new Date(d.updatedAt) : null;\n    return updated && updated >= primeiroDia && updated <= ultimoDia;\n  });\n  const taxaGanho = dealsMovimentadosMes.length > 0 ? (qtdDeals / dealsMovimentadosMes.length) * 100 : 0;\n',
    "real win rate",
)
s = replace_once(s, '            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Meta</CardTitle>\n', '            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Taxa de ganho</CardTitle>\n', "report KPI label")
s = replace_once(s, '            <p className="text-2xl font-bold">{qtdDeals > 0 ? "100%" : "—"}</p>\n            <p className="text-xs text-muted-foreground mt-0.5">meta atingida</p>\n', '            <p className="text-2xl font-bold">{dealsMovimentadosMes.length > 0 ? `${taxaGanho.toFixed(1)}%` : "—"}</p>\n            <p className="text-xs text-muted-foreground mt-0.5">ganhos ÷ negócios movimentados no mês</p>\n', "report KPI value")
write(p, s)
