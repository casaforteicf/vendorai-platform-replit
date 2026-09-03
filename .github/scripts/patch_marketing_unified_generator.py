from pathlib import Path
import re

PATH = Path("artifacts/frontend/src/pages/Content.tsx")
text = PATH.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperava 1 ocorrência, encontrei {count}")
    text = text.replace(old, new, 1)


def sub_once(pattern: str, replacement: str, label: str) -> None:
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: esperava 1 ocorrência, encontrei {count}")


# O seletor de produto passa a viver apenas no contexto unificado.
sub_once(
    r'\nfunction verticalProductLabel\(vertical: string \| null \| undefined\): string \{.*?\n\}\n',
    '\n',
    'remover helper de label duplicado',
)

replace_once(
    '  const [desiredCta, setDesiredCta] = useState("");\n',
    '  const [desiredCta, setDesiredCta] = useState("");\n  const [showCreativeControls, setShowCreativeControls] = useState(false);\n',
    'estado de ajustes avançados',
)

# O gerador deixa tema e dor opcionais: quando vazios, a IA deriva do contexto estratégico.
sub_once(
    r'  function handleGenerate\(\) \{.*?\n  \}\n\n  const monthlyUsed',
    '''  function handleGenerate() {
    if (!marketingContext.nicheId || marketingContext.productIds.length === 0) {
      toast({ title: "Defina o público e ao menos uma oferta", variant: "destructive" });
      return;
    }

    const resolvedTheme = theme.trim()
      || marketingContext.campaignGoal?.trim()
      || `Divulgar ${marketingContext.productNames.join(", ")} para ${marketingContext.audienceNiche || marketingContext.audienceSegment || "o público selecionado"}`;

    setLastResult(null);
    const styleRefs = uploadedImages.filter((img) => img.purpose === "style_reference" && !img.uploading).map((img) => img.url);
    const materialImgs = uploadedImages.filter((img) => img.purpose === "post_material" && !img.uploading).map((img) => img.url);
    generateMutation.mutate({
      type: activeTab,
      theme: `${resolvedTheme} | Nicho: ${marketingContext.nicheName} | Produtos: ${marketingContext.productNames.join(", ")}`,
      productId: productId !== "none" ? productId : undefined,
      productSource,
      variations,
      imageCount: (activeTab === "reels" || activeTab === "tiktok") ? 1 : imageCount,
      imageUrls: styleRefs.length > 0 ? styleRefs : undefined,
      postMaterialUrls: materialImgs.length > 0 ? materialImgs : undefined,
      contentFormat,
      aspectRatio,
      customerPain: customerPain.trim() || undefined,
      postObjective: postObjective || undefined,
      voiceTone: voiceTone || undefined,
      desiredCta: desiredCta || undefined,
    });
  }

  const monthlyUsed''',
    'unificar validação e geração',
)

replace_once(
    '<div className="max-w-5xl mx-auto space-y-6">',
    '<div className="max-w-6xl mx-auto space-y-5">',
    'largura do gerador',
)
replace_once(
    '<h1 className="text-2xl font-bold tracking-tight">Conteúdo para Instagram</h1>\n          <p className="text-muted-foreground text-sm mt-1">\n            Gere legendas, Stories e roteiros de Reels com IA, usando o contexto da sua marca.\n          </p>',
    '<h1 className="text-2xl font-bold tracking-tight">Criar conteúdo</h1>\n          <p className="text-muted-foreground text-sm mt-1">\n            Um único gerador para Feed, Stories, Reels, LinkedIn, YouTube e TikTok — usando o mesmo público, oferta e objetivo.\n          </p>',
    'título multicanal',
)

replace_once(
    '<MarketingContextSelector tenantId={tenantId} value={marketingContext} onChange={(next) => { setMarketingContext(next); if (next.productIds[0]) setProductId(next.productIds[0]); }} />',
    '''<MarketingContextSelector
        tenantId={tenantId}
        value={marketingContext}
        compact
        productsOverride={products}
        onChange={(next) => {
          setMarketingContext(next);
          const selectedCatalogId = next.productIds.find((id) => !id.startsWith("custom:"));
          setProductId(selectedCatalogId ?? "none");
        }}
      />''',
    'contexto compacto',
)

sub_once(
    r'      \{\/\* Mode toggle \*\/\}\n      <div className="flex gap-2">.*?\n      </div>\n\n      \{\/\* Main content \*\/\}',
    '''      {/* O mesmo gerador pode ser preenchido por detalhes ou por linguagem natural. */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Como você quer orientar a IA?</p>
          <p className="text-[11px] text-muted-foreground">É o mesmo gerador. Muda apenas quanto controle você quer exercer sobre a peça.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={!strategyMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setStrategyMode(false); setStrategyResult(null); }}
          >
            Configurar detalhes
          </Button>
          <Button
            variant={strategyMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setStrategyMode(true); setLastResult(null); }}
          >
            Comando simples
          </Button>
        </div>
      </div>

      {/* Main content */}''',
    'toggle integrado',
)

# O comando simples também recebe o mesmo contexto de público/oferta/objetivo.
replace_once(
    '                              command: simpleCommand.trim(),\n                              contentType: key,',
    '''                              command: [
                                marketingContext.nicheName && `Contexto estratégico: ${marketingContext.nicheName}`,
                                marketingContext.productNames.length > 0 && `Ofertas: ${marketingContext.productNames.join(", ")}`,
                                `Pedido do usuário: ${simpleCommand.trim()}`,
                              ].filter(Boolean).join("\\n"),
                              contentType: key,''',
    'contexto do comando simples',
)

replace_once(
    '{strategyMode ? "Comando simples" : "Configurar geração"}',
    '{strategyMode ? "Comando simples" : "Detalhes da peça"}',
    'título do card',
)

# Remove o primeiro seletor de catálogo duplicado dentro do card de geração.
sub_once(
    r'\n                        <div className="space-y-1\.5">\n                          <Label>\{verticalProductLabel\(vertical\)\} \(opcional\)</Label>.*?\n                        </div>\n',
    '\n',
    'seletor de produto duplicado',
)

# O produto interno VendorAI continua existindo, mas migra para Ajustes avançados.
sub_once(
    r'\n                        \{produtosInternos\.length > 0 && \(\n                          <div className="space-y-1\.5">.*?\n                          </div>\n                        \)\}\n',
    '\n',
    'mover produto interno para avançado',
)

replace_once(
    '<Label>Tema / contexto da publicação <span className="text-destructive">*</span></Label>',
    '<Label>Direção criativa <span className="text-muted-foreground font-normal">(opcional)</span></Label>',
    'tema opcional',
)
replace_once(
    '                              TYPE_CONFIG[key].placeholder\n                            }',
    '                              `Opcional — descreva uma ideia específica, ou deixe em branco para a IA definir a abordagem com base na estratégia acima. Ex.: ${TYPE_CONFIG[key].placeholder.replace("Ex: ", "")}`\n                            }',
    'placeholder da direção criativa',
)

# Estratégia manual vira um painel avançado opcional, mantendo todos os campos anteriores.
sub_once(
    r'                        \{\/\* ── Campos estratégicos ─+ \*\/\}.*?\n                        \{\/\* Passo 2 — Format selector \*\/\}',
    '''                        {/* Controles finos permanecem disponíveis, mas não repetem o briefing principal. */}
                        <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setShowCreativeControls((open) => !open)}
                            className="w-full flex items-center justify-between gap-3 p-3 text-left"
                          >
                            <div>
                              <p className="text-xs font-semibold">Ajustes avançados</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">Opcional — se ficar fechado, a IA define dor, objetivo da peça, tom e CTA a partir da estratégia acima.</p>
                            </div>
                            {showCreativeControls ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </button>

                          {showCreativeControls && (
                            <div className="border-t p-3 space-y-3 bg-background/60">
                              {produtosInternos.length > 0 && (
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Produto interno VendorAI <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select
                                    value={produtoInternoId}
                                    onValueChange={(id) => {
                                      setProdutoInternoId(id);
                                      const p = produtosInternos.find((x) => x.id === id);
                                      if (p) setTheme(`${p.nome}: ${p.descricaoUso}`);
                                    }}
                                  >
                                    <SelectTrigger className="text-sm h-9">
                                      <SelectValue placeholder="Usar uma funcionalidade do VendorAI como tema" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Nenhum</SelectItem>
                                      {produtosInternos.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.categoria} — {p.nome}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <Label className="text-xs">Dor do cliente <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                <Textarea
                                  placeholder="Se quiser forçar uma dor específica, descreva aqui."
                                  value={customerPain}
                                  onChange={(e) => setCustomerPain(e.target.value)}
                                  rows={2}
                                  className="resize-none text-sm"
                                />
                              </div>

                              <div className="grid sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Objetivo da peça <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select value={postObjective} onValueChange={setPostObjective}>
                                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="IA decide" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="atrair_dor">Atrair atenção pra dor</SelectItem>
                                      <SelectItem value="prova_social">Prova social</SelectItem>
                                      <SelectItem value="educar">Educar</SelectItem>
                                      <SelectItem value="vender_direto">Vender direto</SelectItem>
                                      <SelectItem value="bastidores">Bastidores</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs">Tom de voz <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select value={voiceTone} onValueChange={setVoiceTone}>
                                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="IA decide" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="direto_comercial">Direto e comercial</SelectItem>
                                      <SelectItem value="storytelling">Storytelling</SelectItem>
                                      <SelectItem value="educativo">Educativo</SelectItem>
                                      <SelectItem value="bastidores_casual">Bastidores casual</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs">CTA <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select value={desiredCta} onValueChange={setDesiredCta}>
                                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="IA decide" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="comentar_palavra">Comentar palavra-chave</SelectItem>
                                      <SelectItem value="chamar_direct">Chamar no direct</SelectItem>
                                      <SelectItem value="clicar_link">Clicar no link</SelectItem>
                                      <SelectItem value="sem_cta">Nenhum (sem CTA)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Passo 2 — Format selector */}''',
    'painel de ajustes avançados',
)

# Antes da geração, o lado direito já explica o briefing consolidado em vez de mandar preencher outro campo.
replace_once(
    '''                    {!generateMutation.isPending && !lastResult && (
                      <Card className="border-dashed">
                        <CardContent className="py-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
                          <Sparkles className="h-10 w-10 opacity-30" />
                          <p className="text-sm">Preencha “Tema / contexto da publicação” ao lado e toque em <strong>Gerar com IA</strong></p>
                        </CardContent>
                      </Card>
                    )}''',
    '''                    {!generateMutation.isPending && !lastResult && (
                      <Card className="border-dashed">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Resumo da peça
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Oferta</p>
                              <p className="font-medium mt-0.5">{marketingContext.productNames.join(", ") || "Defina acima"}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Público</p>
                              <p className="font-medium mt-0.5">{[marketingContext.audienceSegment, marketingContext.audienceNiche].filter(Boolean).join(" · ") || "Defina acima"}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Objetivo</p>
                              <p className="font-medium mt-0.5">{marketingContext.campaignGoal || "A IA usará a melhor abordagem para o contexto"}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Canal e formato</p>
                              <p className="font-medium mt-0.5">{TYPE_CONFIG[key].label} · {aspectRatio}</p>
                            </div>
                          </div>
                          <div className="rounded-md border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                            A IA define automaticamente tema, dor, tom e CTA quando você não especificar esses itens em <strong>Ajustes avançados</strong>.
                          </div>
                          <p className="text-xs text-center text-muted-foreground">Revise a estratégia acima e toque em <strong>Gerar com IA</strong>.</p>
                        </CardContent>
                      </Card>
                    )}''',
    'resumo antes da geração',
)

PATH.write_text(text)
print("Content.tsx atualizado com gerador unificado")
