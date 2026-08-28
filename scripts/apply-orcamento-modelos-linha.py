from pathlib import Path

# ── Configurações: substituir modelo único por biblioteca tenant-scoped ────────
config_path = Path('artifacts/frontend/src/pages/Configuracoes.tsx')
config = config_path.read_text()
start_marker = '// ── Proposal Template Section ──────────────────────────────────────────────────\n'
end_marker = '// ── Contract Template Section ─────────────────────────────────────────────────\n'
start = config.index(start_marker)
end = config.index(end_marker, start)
new_component = r'''// ── Proposal Template Section ──────────────────────────────────────────────────
type ProposalLineTemplate = {
  id: string;
  name: string;
  productLine: string;
  url: string;
  fileName: string;
  contentType?: string;
  isDefault?: boolean;
  uploadedAt: string;
};

function ProposalTemplateSection({
  profileId, templateUrl, templateName, discoveryData, onUpdate,
}: {
  profileId: string;
  templateUrl: string | null;
  templateName: string | null;
  discoveryData: Record<string, unknown> | null;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [modelName, setModelName] = useState("");
  const [productLine, setProductLine] = useState("");
  const requestUploadUrl = useRequestUploadUrl();
  const updateProfile = useUpdateBusinessProfile();

  const rawTemplates = discoveryData?.proposalTemplates;
  const templates: ProposalLineTemplate[] = Array.isArray(rawTemplates)
    ? rawTemplates.filter((item): item is ProposalLineTemplate => !!item && typeof item === "object" && typeof (item as any).id === "string" && typeof (item as any).url === "string")
    : [];

  function previewUrl(url: string) {
    return url.startsWith("/objects/") ? `/api/storage${url}` : url;
  }

  function saveTemplates(next: ProposalLineTemplate[], extra: Record<string, unknown> = {}) {
    const nextDiscovery = { ...(discoveryData ?? {}), proposalTemplates: next };
    updateProfile.mutate(
      { id: profileId, data: { discoveryData: nextDiscovery as any, ...extra } as any },
      {
        onSuccess: () => { onUpdate(); },
        onError: () => toast({ title: "Erro ao salvar modelos de proposta.", variant: "destructive" }),
      },
    );
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!modelName.trim() || !productLine.trim()) {
      toast({ title: "Informe o nome do modelo e a linha de produto antes do upload.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } },
          { onSuccess: resolve, onError: reject },
        );
      });
      const uploadRes = await fetch(result.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Upload falhou");

      const first = templates.length === 0;
      const item: ProposalLineTemplate = {
        id: crypto.randomUUID(),
        name: modelName.trim(),
        productLine: productLine.trim(),
        url: result.objectPath,
        fileName: file.name,
        contentType: file.type || undefined,
        isDefault: first,
        uploadedAt: new Date().toISOString(),
      };
      const next = [...templates, item];
      saveTemplates(next, first ? { proposalTemplateUrl: item.url, proposalTemplateName: item.name } : {});
      setModelName("");
      setProductLine("");
      toast({ title: "Modelo adicionado", description: `Linha: ${item.productLine}` });
    } catch (err) {
      toast({ title: "Erro no upload do modelo.", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function setDefault(id: string) {
    const selected = templates.find((item) => item.id === id);
    if (!selected) return;
    const next = templates.map((item) => ({ ...item, isDefault: item.id === id }));
    saveTemplates(next, { proposalTemplateUrl: selected.url, proposalTemplateName: selected.name });
    toast({ title: "Modelo padrão atualizado." });
  }

  function removeTemplate(id: string) {
    const removed = templates.find((item) => item.id === id);
    const remaining = templates.filter((item) => item.id !== id);
    let next = remaining;
    const extra: Record<string, unknown> = {};
    if (removed?.isDefault) {
      if (remaining.length > 0) {
        next = remaining.map((item, index) => ({ ...item, isDefault: index === 0 }));
        extra.proposalTemplateUrl = next[0].url;
        extra.proposalTemplateName = next[0].name;
      } else {
        extra.proposalTemplateUrl = null;
        extra.proposalTemplateName = null;
      }
    }
    saveTemplates(next, extra);
    toast({ title: "Modelo removido." });
  }

  const legacyOnly = templates.length === 0 && templateUrl;

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".html,.htm,.txt,.md,.pdf,.doc,.docx"
        onChange={handleFile}
      />
      <div>
        <h2 className="font-semibold text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Modelos de Proposta por Linha de Produto
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cadastre vários modelos e associe cada um a uma linha. HTML, TXT, PDF e DOCX são lidos como referência pela IA; o modelo padrão continua sendo usado quando nenhum modelo específico é escolhido.
        </p>
      </div>

      {legacyOnly && (
        <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Modelo legado atual</p>
            <p className="text-xs text-muted-foreground truncate">{templateName || "modelo-proposta"}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={previewUrl(templateUrl!)} target="_blank" rel="noopener noreferrer">Visualizar</a>
          </Button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="space-y-2">
          {templates.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{item.name}</p>
                  <Badge variant="secondary">{item.productLine}</Badge>
                  {item.isDefault && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Padrão</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{item.fileName}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild><a href={previewUrl(item.url)} target="_blank" rel="noopener noreferrer">Ver</a></Button>
                {!item.isDefault && <Button variant="outline" size="sm" onClick={() => setDefault(item.id)}>Tornar padrão</Button>}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeTemplate(item.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end border-t pt-4">
        <div className="space-y-1.5">
          <Label>Nome do modelo</Label>
          <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Ex: Orçamento Pisos" />
        </div>
        <div className="space-y-1.5">
          <Label>Linha de produto</Label>
          <Input value={productLine} onChange={(e) => setProductLine(e.target.value)} placeholder="Ex: Pisos drenantes" />
        </div>
        <Button
          type="button"
          className="gap-2"
          disabled={uploading || !modelName.trim() || !productLine.trim()}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Adicionar modelo"}
        </Button>
      </div>
    </div>
  );
}

'''
config = config[:start] + new_component + config[end:]
old_call = '''            <ProposalTemplateSection
              profileId={profileQuery.data.id}
              templateUrl={profileQuery.data.proposalTemplateUrl ?? null}
              templateName={profileQuery.data.proposalTemplateName ?? null}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) })}
            />'''
new_call = '''            <ProposalTemplateSection
              profileId={profileQuery.data.id}
              templateUrl={profileQuery.data.proposalTemplateUrl ?? null}
              templateName={profileQuery.data.proposalTemplateName ?? null}
              discoveryData={(profileQuery.data.discoveryData as Record<string, unknown>) ?? null}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: getGetBusinessProfileByTenantQueryKey(tenantId) })}
            />'''
assert old_call in config, 'ProposalTemplateSection invocation anchor missing'
config = config.replace(old_call, new_call, 1)
config_path.write_text(config)

# ── Backend: ler HTML/TXT/PDF/DOCX e escolher modelo tenant-scoped ─────────────
backend_path = Path('artifacts/api-server/src/routes/lead_proposals.ts')
backend = backend_path.read_text()
old_select = '''      proposalTemplateUrl: businessProfilesTable.proposalTemplateUrl,
      logoUrl: businessProfilesTable.logoUrl,'''
new_select = '''      proposalTemplateUrl: businessProfilesTable.proposalTemplateUrl,
      discoveryData: businessProfilesTable.discoveryData,
      logoUrl: businessProfilesTable.logoUrl,'''
assert old_select in backend, 'business profile select anchor missing'
backend = backend.replace(old_select, new_select, 1)
old_return = '''    proposalTemplateUrl: bp?.proposalTemplateUrl ?? null,
  };'''
new_return = '''    proposalTemplateUrl: bp?.proposalTemplateUrl ?? null,
    discoveryData: bp?.discoveryData ?? null,
  };'''
assert old_return in backend, 'context return anchor missing'
backend = backend.replace(old_return, new_return, 1)

guidance_start = backend.index('/** Fetch template content from object storage for AI guidance')
guidance_end = backend.index('/** Resolve object-storage relative paths', guidance_start)
new_guidance = r'''/** Fetch uploaded proposal model content for AI guidance (max 6000 chars).
 * Supports text/HTML, PDF and DOCX/DOC using dependencies already present in the API. */
async function fetchTemplateGuidance(templateUrl: string | null | undefined): Promise<string | null> {
  if (!templateUrl) return null;
  try {
    const port = process.env.PORT ?? "8080";
    const base = process.env.BASE_PATH ?? "";
    const url = templateUrl.startsWith("/objects/")
      ? `http://localhost:${port}${base}/api/storage${templateUrl}`
      : templateUrl;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const lowerUrl = url.toLowerCase();
    let text = "";

    if (ct.includes("pdf") || lowerUrl.endsWith(".pdf")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const pdfParse = (await import("pdf-parse")).default;
      text = (await pdfParse(buffer)).text ?? "";
    } else if (ct.includes("word") || ct.includes("officedocument") || lowerUrl.endsWith(".doc") || lowerUrl.endsWith(".docx")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value ?? "";
    } else {
      text = await res.text();
      if (ct.includes("html") || lowerUrl.endsWith(".html") || lowerUrl.endsWith(".htm")) {
        text = text.replace(/<[^>]+>/g, " ");
      }
    }

    const normalized = text.replace(/\s{2,}/g, " ").trim();
    return normalized ? normalized.slice(0, 6000) : null;
  } catch {
    return null;
  }
}

'''
backend = backend[:guidance_start] + new_guidance + backend[guidance_end:]

old_prompt_line = '    templateGuidance: await fetchTemplateGuidance(ctx.proposalTemplateUrl),\n'
new_prompt_lines = '''    templateGuidance: await fetchTemplateGuidance((() => {
      const dd = (ctx.discoveryData ?? {}) as Record<string, unknown>;
      const raw = Array.isArray(dd["proposalTemplates"]) ? dd["proposalTemplates"] as Array<Record<string, unknown>> : [];
      const requestedId = typeof req.body?.proposalTemplateId === "string" ? req.body.proposalTemplateId : null;
      const requested = requestedId ? raw.find((item) => item["id"] === requestedId) : null;
      const defaultModel = raw.find((item) => item["isDefault"] === true);
      const selected = requested ?? defaultModel;
      return typeof selected?.["url"] === "string" ? selected["url"] as string : ctx.proposalTemplateUrl;
    })()),
'''
assert old_prompt_line in backend, 'template guidance prompt anchor missing'
backend = backend.replace(old_prompt_line, new_prompt_lines, 1)
backend_path.write_text(backend)

# ── Lead proposal UI: selector do modelo + envio do ID ────────────────────────
lead_path = Path('artifacts/frontend/src/pages/LeadPropostaTab.tsx')
lead = lead_path.read_text()
old_profile = '''  const hasProposalTemplate = !!(profileQuery.data as any)?.proposalTemplateUrl;
  const proposalTemplateName = (profileQuery.data as any)?.proposalTemplateName as string | null;
'''
new_profile = '''  type ProposalLineTemplate = { id: string; name: string; productLine: string; url: string; isDefault?: boolean };
  const profileDiscovery = (((profileQuery.data as any)?.discoveryData ?? {}) as Record<string, unknown>);
  const proposalLineTemplates: ProposalLineTemplate[] = Array.isArray(profileDiscovery.proposalTemplates)
    ? (profileDiscovery.proposalTemplates as ProposalLineTemplate[]).filter((item) => item && typeof item.id === "string" && typeof item.url === "string")
    : [];
  const legacyProposalTemplate = !!(profileQuery.data as any)?.proposalTemplateUrl;
  const hasProposalTemplate = legacyProposalTemplate || proposalLineTemplates.length > 0;
  const proposalTemplateName = (profileQuery.data as any)?.proposalTemplateName as string | null;
  const [selectedProposalTemplateId, setSelectedProposalTemplateId] = useState<string>("__auto__");
'''
assert old_profile in lead, 'lead profile template anchor missing'
lead = lead.replace(old_profile, new_profile, 1)

body_anchor = '          propostaId: selectedOrcamentoId !== "__none__" ? selectedOrcamentoId : undefined,\n          refinementNotes: notes?.trim() || undefined,'
body_new = '          propostaId: selectedOrcamentoId !== "__none__" ? selectedOrcamentoId : undefined,\n          proposalTemplateId: selectedProposalTemplateId !== "__auto__" ? selectedProposalTemplateId : undefined,\n          refinementNotes: notes?.trim() || undefined,'
assert body_anchor in lead, 'generation body anchor missing'
lead = lead.replace(body_anchor, body_new, 1)

old_header = '''          {/* Template de proposta */}
          <Link href="/configuracoes?tab=perfil" className="flex items-center gap-1.5 text-xs mt-1 no-underline">
            {hasProposalTemplate ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <FileText className="h-3 w-3" />
                Modelo ativo: <span className="font-medium truncate max-w-[160px]">{proposalTemplateName || "modelo-proposta"}</span>
                <span className="text-muted-foreground ml-1">· Trocar</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
                <Upload className="h-3 w-3" />
                Importar modelo de proposta da empresa
              </span>
            )}
          </Link>'''
new_header = '''          {/* Modelo de proposta por linha */}
          <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
            {proposalLineTemplates.length > 0 ? (
              <Select value={selectedProposalTemplateId} onValueChange={setSelectedProposalTemplateId}>
                <SelectTrigger className="h-8 w-full sm:w-[280px] text-xs">
                  <SelectValue placeholder="Modelo da proposta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Automático — usar modelo padrão</SelectItem>
                  {proposalLineTemplates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name} — {item.productLine}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : hasProposalTemplate ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                <FileText className="h-3 w-3" /> Modelo ativo: {proposalTemplateName || "modelo-proposta"}
              </span>
            ) : null}
            <Link href="/configuracoes?tab=perfil" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary no-underline">
              <Upload className="h-3 w-3" /> {hasProposalTemplate ? "Gerenciar modelos" : "Adicionar modelos"}
            </Link>
          </div>'''
assert old_header in lead, 'template UI block missing'
lead = lead.replace(old_header, new_header, 1)
lead_path.write_text(lead)
