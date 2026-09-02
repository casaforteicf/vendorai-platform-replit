from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# ── App routes ────────────────────────────────────────────────────────────────
replace_once(
    "artifacts/frontend/src/App.tsx",
    'const Deals              = lazy(() => import("@/pages/Deals"));\n',
    'const Deals              = lazy(() => import("@/pages/Deals"));\nconst PipelineOperacional = lazy(() => import("@/pages/PipelineOperacional"));\n',
)
replace_once(
    "artifacts/frontend/src/App.tsx",
    '''        <Route path="/negocios">\n          <ProtectedRoute component={Deals} />\n        </Route>\n''',
    '''        <Route path="/negocios">\n          <ProtectedRoute component={Deals} />\n        </Route>\n        <Route path="/pipeline-operacional">\n          <ProtectedRoute component={PipelineOperacional} />\n        </Route>\n''',
)

# ── Sidebar ──────────────────────────────────────────────────────────────────
replace_once(
    "artifacts/frontend/src/components/layout/SidebarLayout.tsx",
    'const START_PLAN_HREFS = new Set(["/", "/trabalho", "/catalogo", "/varejo/produtos", "/supermercado/produtos", "/farmacia", "/farmacia/produtos", "/deals", "/base-conhecimento", "/configuracoes", "/faq"]);',
    'const START_PLAN_HREFS = new Set(["/", "/trabalho", "/catalogo", "/varejo/produtos", "/supermercado/produtos", "/farmacia", "/farmacia/produtos", "/deals", "/pipeline-operacional", "/base-conhecimento", "/configuracoes", "/faq"]);',
)
replace_once(
    "artifacts/frontend/src/components/layout/SidebarLayout.tsx",
    '    leads:      ["/leads", "/deals"],',
    '    leads:      ["/leads", "/deals", "/pipeline-operacional"],',
)
replace_once(
    "artifacts/frontend/src/components/layout/SidebarLayout.tsx",
    '    { name: "Negócios",      href: "/deals",         icon: Briefcase,       sellerHidden: false, section: "crm", fn: ["vendedor", "entrega", "administrador", "outro"] as UserFunction[] },\n',
    '    { name: "Negócios",      href: "/deals",         icon: Briefcase,       sellerHidden: false, section: "crm", fn: ["vendedor", "entrega", "administrador", "outro"] as UserFunction[] },\n    { name: "Pipeline Execução / Suporte", href: "/pipeline-operacional", icon: KanbanSquare, sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },\n',
)

# ── Shortcut from commercial Deals ──────────────────────────────────────────
replace_once(
    "artifacts/frontend/src/pages/Deals.tsx",
    'Settings2, Trash2, RotateCcw } from "lucide-react";',
    'Settings2, Trash2, RotateCcw, KanbanSquare } from "lucide-react";',
)
replace_once(
    "artifacts/frontend/src/pages/Deals.tsx",
    '        <div className="flex flex-wrap items-center gap-2">\n        {isAdmin && <Dialog open={isStagesOpen} onOpenChange={setIsStagesOpen}>',
    '        <div className="flex flex-wrap items-center gap-2">\n        <Button variant="outline" className="gap-2" onClick={() => navigate("/pipeline-operacional")}><KanbanSquare className="h-4 w-4" /> Execução / Suporte</Button>\n        {isAdmin && <Dialog open={isStagesOpen} onOpenChange={setIsStagesOpen}>',
)

# ── LeadDetail: Assistência as a first-class activity ────────────────────────
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '  feedback_entrega: "Feedback pós-entrega",\n};',
    '  feedback_entrega: "Feedback pós-entrega",\n  assistencia: "Assistência",\n};',
)
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    'const [newActivityTipo, setNewActivityTipo] = useState<"ligacao" | "whatsapp" | "email" | "visita" | "tarefa" | "reuniao">("tarefa");',
    'const [newActivityTipo, setNewActivityTipo] = useState<"ligacao" | "whatsapp" | "email" | "visita" | "tarefa" | "reuniao" | "assistencia">("tarefa");',
)
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '  const anexoInputRef = useRef<HTMLInputElement>(null);\n',
    '''  const anexoInputRef = useRef<HTMLInputElement>(null);\n  // Assistência — coleta estruturada antes de enviar ao suporte.\n  const [newAssistenciaCategoria, setNewAssistenciaCategoria] = useState("defeito");\n  const [newAssistenciaRelato, setNewAssistenciaRelato] = useState("");\n  const [newAssistenciaDealId, setNewAssistenciaDealId] = useState("");\n  const [newAssistenciaProdutos, setNewAssistenciaProdutos] = useState("");\n  const [newAssistenciaPrioridade, setNewAssistenciaPrioridade] = useState("normal");\n  const [newAssistenciaFiles, setNewAssistenciaFiles] = useState<File[]>([]);\n''',
)

# Reset support form when dialog opens.
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '    setNewActivityNomeGatekeeper("");\n    setIsNewActivityOpen(true);',
    '''    setNewActivityNomeGatekeeper("");\n    setNewAssistenciaCategoria("defeito");\n    setNewAssistenciaRelato("");\n    setNewAssistenciaDealId("");\n    setNewAssistenciaProdutos("");\n    setNewAssistenciaPrioridade("normal");\n    setNewAssistenciaFiles([]);\n    setIsNewActivityOpen(true);''',
)

# Assistance branch before the normal generated activity call. It deliberately
# returns early, so TypeScript narrows newActivityTipo back to the legacy API
# union for the existing code below.
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '''  async function handleCreateActivity() {\n    if (!tenantId || !id || !newActivityTitulo.trim()) return;\n    const responsavelId = newActivityResponsavelId === "__ia__" ? undefined : newActivityResponsavelId;\n    const isReuniao = newActivityTipo === "reuniao";\n''',
    '''  async function handleCreateActivity() {\n    if (!tenantId || !id || !newActivityTitulo.trim()) return;\n\n    if (newActivityTipo === "assistencia") {\n      const responsavelId = newActivityResponsavelId === "__ia__" ? "" : newActivityResponsavelId;\n      if (!responsavelId) {\n        toast({ title: "Assistência precisa de um responsável", variant: "destructive" });\n        return;\n      }\n      if (newAssistenciaRelato.trim().length < 10) {\n        toast({ title: "Descreva claramente o problema antes de abrir o chamado", variant: "destructive" });\n        return;\n      }\n\n      setIsUploadingAnexo(true);\n      try {\n        const proposal = newAssistenciaDealId\n          ? (leadPropostas ?? []).find((p) => p.dealId === newAssistenciaDealId)\n          : undefined;\n        const supportRes = await fetch(`/api/tenants/${tenantId}/support-cases`, {\n          method: "POST",\n          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },\n          body: JSON.stringify({\n            leadId: id,\n            dealId: newAssistenciaDealId || null,\n            propostaId: proposal?.id ?? null,\n            titulo: newActivityTitulo.trim(),\n            relato: newAssistenciaRelato.trim(),\n            categoria: newAssistenciaCategoria,\n            produtos: newAssistenciaProdutos.split(/[\\n,;]/).map((v) => v.trim()).filter(Boolean),\n            responsavelId,\n            prioridade: newAssistenciaPrioridade,\n            dataVencimento: newActivityData || undefined,\n            origem: "humano",\n          }),\n        });\n        const supportBody = await supportRes.json().catch(() => ({}));\n        if (!supportRes.ok) throw new Error(supportBody.error || "Falha ao abrir assistência");\n\n        const files = [\n          ...newAssistenciaFiles,\n          ...(newActivityAnexoFile ? [newActivityAnexoFile] : []),\n        ];\n        for (const file of files) {\n          const metaRes = await fetch("/api/storage/uploads/request-url", {\n            method: "POST",\n            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },\n            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),\n          });\n          if (!metaRes.ok) throw new Error(`Falha ao preparar o anexo ${file.name}`);\n          const { uploadURL, objectPath } = await metaRes.json();\n          const putRes = await fetch(uploadURL, {\n            method: "PUT",\n            body: file,\n            headers: { "Content-Type": file.type || "application/octet-stream" },\n          });\n          if (!putRes.ok) throw new Error(`Falha ao enviar ${file.name}`);\n          const attachmentRes = await fetch(`/api/work-cards/${supportBody.card.id}/attachments`, {\n            method: "POST",\n            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },\n            body: JSON.stringify({\n              nome: file.name,\n              url: `/api/storage${objectPath}`,\n              mimeType: file.type || "application/octet-stream",\n              tamanho: file.size,\n              origem: "abertura_chamado",\n            }),\n          });\n          if (!attachmentRes.ok) throw new Error(`Falha ao registrar ${file.name}`);\n        }\n\n        await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey(tenantId, { leadId: id }) });\n        setIsNewActivityOpen(false);\n        setNewActivityTitulo("");\n        setNewActivityDescricao("");\n        setNewActivityData("");\n        setNewActivityTipo("tarefa");\n        setNewActivityResponsavelId("__ia__");\n        setNewActivityAnexoFile(null);\n        setNewAssistenciaRelato("");\n        setNewAssistenciaDealId("");\n        setNewAssistenciaProdutos("");\n        setNewAssistenciaFiles([]);\n        toast({\n          title: `Assistência ${supportBody.card.codigo} aberta`,\n          description: "O card já está na Pipeline de Suporte e foi atribuído ao responsável.",\n        });\n      } catch (error) {\n        toast({ title: "Erro ao abrir assistência", description: String(error), variant: "destructive" });\n      } finally {\n        setIsUploadingAnexo(false);\n      }\n      return;\n    }\n\n    const responsavelId = newActivityResponsavelId === "__ia__" ? undefined : newActivityResponsavelId;\n    const isReuniao = newActivityTipo === "reuniao";\n''',
)

# Type selector: when Assistência is selected, immediately choose a human
# responsibility instead of leaving the card assigned to the AI pseudo-option.
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '''              <Select\n                value={newActivityTipo}\n                onValueChange={(v) => setNewActivityTipo(v as typeof newActivityTipo)}\n              >''',
    '''              <Select\n                value={newActivityTipo}\n                onValueChange={(v) => {\n                  const next = v as typeof newActivityTipo;\n                  setNewActivityTipo(next);\n                  if (next === "assistencia" && newActivityResponsavelId === "__ia__") {\n                    setNewActivityResponsavelId(user?.id ?? (tenantUsers ?? [])[0]?.id ?? "");\n                  }\n                }}\n              >''',
)
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '                  <SelectItem value="__ia__">🤖 IA</SelectItem>\n',
    '                  {newActivityTipo !== "assistencia" && <SelectItem value="__ia__">🤖 IA</SelectItem>}\n',
)

# Structured assistance fields immediately after title.
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '''            {/* Descrição */}\n            <div className="space-y-1.5">''',
    '''            {newActivityTipo === "assistencia" && (\n              <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-3">\n                <div className="flex items-center gap-2">\n                  <Wrench className="h-4 w-4 text-primary" />\n                  <p className="text-sm font-semibold">Abertura estruturada da assistência</p>\n                </div>\n                <div className="grid gap-3 sm:grid-cols-2">\n                  <div className="space-y-1.5">\n                    <label className="text-sm font-medium">Categoria *</label>\n                    <Select value={newAssistenciaCategoria} onValueChange={setNewAssistenciaCategoria}>\n                      <SelectTrigger><SelectValue /></SelectTrigger>\n                      <SelectContent>\n                        <SelectItem value="defeito">Defeito</SelectItem>\n                        <SelectItem value="instalacao">Instalação</SelectItem>\n                        <SelectItem value="funcionamento">Funcionamento</SelectItem>\n                        <SelectItem value="avaria">Avaria</SelectItem>\n                        <SelectItem value="falta_material">Falta de material</SelectItem>\n                        <SelectItem value="erro_medida">Erro de medida</SelectItem>\n                        <SelectItem value="duvida_tecnica">Dúvida técnica</SelectItem>\n                        <SelectItem value="garantia">Garantia</SelectItem>\n                        <SelectItem value="manutencao">Manutenção</SelectItem>\n                        <SelectItem value="outro">Outro</SelectItem>\n                      </SelectContent>\n                    </Select>\n                  </div>\n                  <div className="space-y-1.5">\n                    <label className="text-sm font-medium">Pedido relacionado</label>\n                    <Select value={newAssistenciaDealId || "__none__"} onValueChange={(v) => setNewAssistenciaDealId(v === "__none__" ? "" : v)}>\n                      <SelectTrigger><SelectValue /></SelectTrigger>\n                      <SelectContent>\n                        <SelectItem value="__none__">Sem pedido específico</SelectItem>\n                        {(leadDeals ?? []).map((deal) => <SelectItem key={deal.id} value={deal.id}>{deal.titulo}</SelectItem>)}\n                      </SelectContent>\n                    </Select>\n                  </div>\n                </div>\n                <div className="space-y-1.5">\n                  <label className="text-sm font-medium">Itens/produtos afetados</label>\n                  <Input value={newAssistenciaProdutos} onChange={(e) => setNewAssistenciaProdutos(e.target.value)} placeholder="Ex: janela suíte, porta varanda, motor..." />\n                </div>\n                <div className="space-y-1.5">\n                  <label className="text-sm font-medium">Relato claro do problema *</label>\n                  <Textarea rows={5} value={newAssistenciaRelato} onChange={(e) => setNewAssistenciaRelato(e.target.value)} placeholder="Descreva o sintoma, quando começou, onde ocorre, o que já foi testado e tudo que o suporte precisa saber antes de ir ao cliente." />\n                  <p className="text-xs text-muted-foreground">IA ou humano devem coletar informação suficiente antes de enviar o chamado ao suporte.</p>\n                </div>\n                <div className="grid gap-3 sm:grid-cols-2">\n                  <div className="space-y-1.5">\n                    <label className="text-sm font-medium">Prioridade</label>\n                    <Select value={newAssistenciaPrioridade} onValueChange={setNewAssistenciaPrioridade}>\n                      <SelectTrigger><SelectValue /></SelectTrigger>\n                      <SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent>\n                    </Select>\n                  </div>\n                  <div className="space-y-1.5">\n                    <label className="text-sm font-medium">Fotos, vídeos, áudios e documentos</label>\n                    <Input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setNewAssistenciaFiles(Array.from(e.target.files ?? []))} />\n                    <p className="text-xs text-muted-foreground">{newAssistenciaFiles.length ? `${newAssistenciaFiles.length} arquivo(s)` : "Opcional"}</p>\n                  </div>\n                </div>\n              </div>\n            )}\n\n            {/* Descrição */}\n            <div className="space-y-1.5">''',
)

# Assistance validation in the save button.
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '''                !newActivityTitulo.trim() ||\n                (newActivityTipo === "reuniao" && (!newActivityAgendaId || !newActivityDataHoraInicio || !newActivityDataHoraFim))\n''',
    '''                !newActivityTitulo.trim() ||\n                (newActivityTipo === "reuniao" && (!newActivityAgendaId || !newActivityDataHoraInicio || !newActivityDataHoraFim)) ||\n                (newActivityTipo === "assistencia" && (newActivityResponsavelId === "__ia__" || !newActivityResponsavelId || newAssistenciaRelato.trim().length < 10))\n''',
)

# Ensure Wrench icon exists in LeadDetail imports.
replace_once(
    "artifacts/frontend/src/pages/LeadDetail.tsx",
    '  Tag,\n} from "lucide-react";',
    '  Tag,\n  Wrench,\n} from "lucide-react";',
)

print("operational UI patch applied")
