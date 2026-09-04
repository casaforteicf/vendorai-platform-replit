from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


# Meta Ads Facebook Login becomes the tenant-scoped credential that can also
# expose Professional Instagram identities for Business Discovery.
meta = "artifacts/api-server/src/services/meta-ads-oauth.ts"
replace_once(
    meta,
    'const META_ADS_SCOPE = "ads_management,ads_read,business_management";',
    'const META_ADS_SCOPE = "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,instagram_basic";',
)

route = "artifacts/api-server/src/routes/prospector.ts"
replace_once(
    route,
    '} from "../services/cnpjService.js";\n',
    '} from "../services/cnpjService.js";\nimport { getMetaAdsConnectionByTenantId } from "../services/meta-ads-oauth.js";\nimport {\n  InstagramProspectingError,\n  parseInstagramUsernames,\n  searchInstagramBusinessProfiles,\n} from "../services/instagramProspecting.js";\n',
)

replace_once(
    route,
    'inArray(leadsTable.source, ["prospector_auto", "prospector", "cnpj", "recem_aberta", "ad_library"]),',
    'inArray(leadsTable.source, ["prospector_auto", "prospector", "cnpj", "recem_aberta", "ad_library", "instagram"]),',
)

marker = '/** POST /prospector/ads/search — discover companies via Meta Ad Library */'
instagram_routes = r'''/** POST /prospector/instagram/search — Business Discovery for known Professional usernames */
router.post("/prospector/instagram/search", async (req, res) => {
  const schema = z.object({
    usernames: z.string().min(1).max(1200),
    minFollowers: z.number().int().min(0).optional(),
    maxFollowers: z.number().int().min(0).optional(),
    hasWebsite: z.boolean().optional(),
    activeWithinDays: z.number().int().min(1).max(365).optional(),
    tenantId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const usernames = parseInstagramUsernames(parsed.data.usernames);
  if (usernames.length === 0) return res.status(400).json({ error: "Informe pelo menos um @perfil válido" });

  const conn = await getMetaAdsConnectionByTenantId(tenantId);
  const expired = Boolean(conn?.tokenExpiresAt && conn.tokenExpiresAt <= new Date());
  if (!conn?.accessToken || conn.status === "disconnected" || conn.disconnectedAt || expired) {
    return res.status(409).json({
      error: expired
        ? "A conexão Meta expirou. Reconecte em Integrações para pesquisar perfis do Instagram."
        : "Conecte a Meta em Integrações para pesquisar perfis profissionais do Instagram.",
      code: "META_NOT_CONNECTED",
      reconnectRequired: true,
    });
  }

  try {
    const result = await searchInstagramBusinessProfiles({
      metaAccessToken: conn.accessToken,
      usernames,
      filters: {
        minFollowers: parsed.data.minFollowers,
        maxFollowers: parsed.data.maxFollowers,
        hasWebsite: parsed.data.hasWebsite,
        activeWithinDays: parsed.data.activeWithinDays,
      },
    });
    return res.json({ ...result, requested: usernames.length });
  } catch (error) {
    if (error instanceof InstagramProspectingError) {
      const reconnectRequired = ["META_NOT_CONNECTED", "INSTAGRAM_IDENTITY_NOT_AVAILABLE"].includes(error.code);
      return res.status(reconnectRequired ? 409 : error.code === "META_API_ERROR" ? 502 : 422).json({
        error: error.message,
        code: error.code,
        reconnectRequired,
      });
    }
    req.log.error({ error }, "prospector/instagram: Business Discovery failed");
    return res.status(500).json({ error: "Falha ao pesquisar perfis do Instagram" });
  }
});

/** POST /prospector/instagram/prospectar — send a verified Instagram profile into the canonical Revenue Scout */
router.post("/prospector/instagram/prospectar", async (req, res) => {
  const schema = z.object({
    id: z.string().min(1),
    username: z.string().min(1),
    name: z.string().nullish(),
    biography: z.string().nullish(),
    website: z.string().url().nullish(),
    profilePictureUrl: z.string().url().nullish(),
    followersCount: z.number().int().min(0).nullish(),
    followsCount: z.number().int().min(0).nullish(),
    mediaCount: z.number().int().min(0).nullish(),
    latestMediaAt: z.string().nullish(),
    latestMediaPermalink: z.string().url().nullish(),
    segmento: z.string().max(160).optional(),
    localidade: z.string().max(160).optional(),
    tenantId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const d = parsed.data;
  const username = d.username.trim().replace(/^@/, "").toLowerCase();
  const displayName = d.name?.trim() || `@${username}`;

  let place: PlacesResult | null = null;
  try {
    await checkApiQuota(tenantId, "google_places", req.log);
    place = await searchPlace(`${displayName}${d.localidade ? ` ${d.localidade}` : ""}`, req.log);
  } catch (error) {
    req.log.warn({ error, username }, "prospector/instagram: Google cross-enrichment unavailable (non-fatal)");
  }

  const website = d.website ?? place?.siteOficial ?? null;
  const telefone = place?.telefone ?? null;
  const currentOrigins = ["instagram_business_discovery"];
  const instagramSignal = {
    origem: "instagram_business_discovery",
    origens: currentOrigins,
    instagram_id: d.id,
    instagram_username: username,
    instagram_name: d.name ?? null,
    instagram_biography: d.biography ?? null,
    instagram_followers: d.followersCount ?? null,
    instagram_follows: d.followsCount ?? null,
    instagram_media_count: d.mediaCount ?? null,
    instagram_profile_picture_url: d.profilePictureUrl ?? null,
    instagram_latest_media_at: d.latestMediaAt ?? null,
    instagram_latest_media_permalink: d.latestMediaPermalink ?? null,
    instagram_metrics_verified: true,
    prospectado_em: new Date().toISOString(),
  };

  const [existing] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome, metadata: leadsTable.metadata })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, tenantId),
      or(
        sql`lower(${leadsTable.metadata}->>'instagram_username') = ${username}`,
        telefone ? eq(leadsTable.telefone, telefone) : sql`FALSE`,
        website ? eq(leadsTable.websiteUrl, website) : sql`FALSE`,
        sql`lower(${leadsTable.nome}) = lower(${displayName})`,
      ),
    ))
    .limit(1);

  if (existing) {
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    const origins = Array.isArray(metadata["origens"])
      ? [...new Set([...(metadata["origens"] as string[]), "instagram_business_discovery"])]
      : [...new Set([String(metadata["origem"] ?? "").trim(), "instagram_business_discovery"].filter(Boolean))];
    await db.update(leadsTable).set({
      telefone: telefone ?? undefined,
      websiteUrl: website ?? undefined,
      endereco: place?.endereco ?? undefined,
      mercadoSegmento: d.segmento ?? undefined,
      metadata: { ...metadata, ...instagramSignal, origens },
      priorityReason: `Perfil Instagram profissional verificado${d.followersCount != null ? ` — ${d.followersCount.toLocaleString("pt-BR")} seguidores` : ""}`,
      updatedAt: new Date(),
    }).where(eq(leadsTable.id, existing.id));
    enrichLead({ leadId: existing.id, tenantId, log: req.log }).catch(() => undefined);
    return res.status(200).json({ leadId: existing.id, dealId: null, merged: true, message: `Lead "${existing.nome}" atualizado com o perfil @${username}` });
  }

  const [lead] = await db.insert(leadsTable).values({
    tenantId,
    nome: displayName,
    empresa: d.name ?? displayName,
    telefone: telefone ?? undefined,
    endereco: place?.endereco ?? d.localidade ?? undefined,
    websiteUrl: website ?? undefined,
    source: "instagram",
    tipoPessoa: "juridica",
    enrichmentStatus: "pending",
    mercadoSegmento: d.segmento ?? undefined,
    priorityReason: `Perfil Instagram profissional verificado${d.followersCount != null ? ` — ${d.followersCount.toLocaleString("pt-BR")} seguidores` : ""}`,
    metadata: instagramSignal,
  }).returning({ id: leadsTable.id });
  if (!lead) return res.status(500).json({ error: "Falha ao criar lead Instagram" });

  const [firstFunil] = await db.select({ id: funisTable.id }).from(funisTable)
    .where(eq(funisTable.tenantId, tenantId)).orderBy(asc(funisTable.createdAt)).limit(1);
  let dealId: string | null = null;
  if (firstFunil) {
    const [deal] = await db.insert(dealsTable).values({
      tenantId, leadId: lead.id, funilId: firstFunil.id,
      titulo: `${displayName} — Prospector Instagram`, etapa: "novo",
    }).returning({ id: dealsTable.id });
    dealId = deal?.id ?? null;
  }

  await db.insert(activitiesTable).values({
    tenantId, leadId: lead.id, dealId, tipo: "tarefa",
    titulo: "Lead importado via Perfis Instagram",
    descricao: `Perfil profissional @${username} verificado via Business Discovery${d.followersCount != null ? ` com ${d.followersCount.toLocaleString("pt-BR")} seguidores` : ""}.`,
    status: "concluida",
  });

  if (dealId) {
    gerarBriefingDeal(
      tenantId, dealId, displayName, place?.endereco ?? d.localidade ?? null, telefone, website,
      place?.rating ?? null, place?.reviewCount ?? null,
      ["Perfil profissional do Instagram verificado", d.followersCount != null ? `${d.followersCount.toLocaleString("pt-BR")} seguidores` : "Presença ativa no Instagram"],
      ["Avaliar conversão da audiência social em oportunidades comerciais"], req.log,
    ).catch(() => undefined);
  }

  enrichLead({ leadId: lead.id, tenantId, log: req.log, scoreBoost: 3, boostReason: "instagram_profile" }).catch(() => undefined);
  return res.status(201).json({ leadId: lead.id, dealId, merged: false });
});

'''
replace_once(route, marker, instagram_routes + marker)

frontend = "artifacts/frontend/src/pages/Prospector.tsx"
replace_once(
    frontend,
    '''interface AdResult {
  pageId: string;
  pageName: string;
  snapshotUrl: string | null;
  startDate: string | null;
}
''',
    '''interface AdResult {
  pageId: string;
  pageName: string;
  snapshotUrl: string | null;
  startDate: string | null;
}

interface InstagramProfileResult {
  id: string;
  username: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  latestMediaAt: string | null;
  latestMediaPermalink: string | null;
  metricsVerified: true;
  source: "instagram_business_discovery";
}
''',
)

replace_once(
    frontend,
    '''  const [adsDuplicadosPageIds, setAdsDuplicadosPageIds] = useState<Set<string>>(new Set());
  const [selectedFilaLeadIds, setSelectedFilaLeadIds] = useState<Set<string>>(new Set());''',
    '''  const [adsDuplicadosPageIds, setAdsDuplicadosPageIds] = useState<Set<string>>(new Set());
  const [instagramUsernames, setInstagramUsernames] = useState("");
  const [instagramSegmento, setInstagramSegmento] = useState("");
  const [instagramLocalidade, setInstagramLocalidade] = useState("");
  const [instagramMinFollowers, setInstagramMinFollowers] = useState("");
  const [instagramMaxFollowers, setInstagramMaxFollowers] = useState("");
  const [instagramHasWebsite, setInstagramHasWebsite] = useState(false);
  const [instagramActiveWithinDays, setInstagramActiveWithinDays] = useState("qualquer");
  const [instagramProfiles, setInstagramProfiles] = useState<InstagramProfileResult[]>([]);
  const [instagramUnavailable, setInstagramUnavailable] = useState<string[]>([]);
  const [instagramSearched, setInstagramSearched] = useState(false);
  const [instagramSearching, setInstagramSearching] = useState(false);
  const [instagramReconnectRequired, setInstagramReconnectRequired] = useState(false);
  const [instagramProspectingUsername, setInstagramProspectingUsername] = useState<string | null>(null);
  const [instagramProspected, setInstagramProspected] = useState<Set<string>>(new Set());
  const [instagramMerged, setInstagramMerged] = useState<Set<string>>(new Set());
  const [selectedFilaLeadIds, setSelectedFilaLeadIds] = useState<Set<string>>(new Set());''',
)

handler_marker = '''  const adsProspectMutation = useMutation({'''
handlers = r'''  async function handleInstagramProfileSearch() {
    if (!instagramUsernames.trim()) return;
    setInstagramSearching(true);
    setInstagramReconnectRequired(false);
    try {
      const minFollowers = instagramMinFollowers ? Number(instagramMinFollowers) : undefined;
      const maxFollowers = instagramMaxFollowers ? Number(instagramMaxFollowers) : undefined;
      const activeWithinDays = instagramActiveWithinDays !== "qualquer" ? Number(instagramActiveWithinDays) : undefined;
      const res = await fetch("/api/prospector/instagram/search", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          usernames: instagramUsernames,
          minFollowers: Number.isFinite(minFollowers) ? minFollowers : undefined,
          maxFollowers: Number.isFinite(maxFollowers) ? maxFollowers : undefined,
          hasWebsite: instagramHasWebsite || undefined,
          activeWithinDays: Number.isFinite(activeWithinDays) ? activeWithinDays : undefined,
          tenantId,
        }),
      });
      const data = await res.json() as { profiles?: InstagramProfileResult[]; unavailableUsernames?: string[]; error?: string; reconnectRequired?: boolean };
      if (!res.ok) {
        setInstagramReconnectRequired(Boolean(data.reconnectRequired));
        toast({ title: data.error ?? "Falha na pesquisa de perfis", variant: "destructive" });
        return;
      }
      setInstagramProfiles(data.profiles ?? []);
      setInstagramUnavailable(data.unavailableUsernames ?? []);
      setInstagramSearched(true);
    } finally {
      setInstagramSearching(false);
    }
  }

  const instagramProspectMutation = useMutation({
    mutationFn: async (profile: InstagramProfileResult) => {
      const res = await fetch("/api/prospector/instagram/prospectar", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...profile, segmento: instagramSegmento || undefined, localidade: instagramLocalidade || undefined, tenantId }),
      });
      const data = await res.json() as { leadId?: string; dealId?: string | null; merged?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Falha ao prospectar perfil Instagram");
      return data;
    },
    onSuccess: (data, profile) => {
      if (data.merged) {
        setInstagramMerged((prev) => new Set(prev).add(profile.username));
        toast({ title: "Lead já estava no CRM", description: data.message ?? `Perfil @${profile.username} foi mesclado.` });
      } else {
        setInstagramProspected((prev) => new Set(prev).add(profile.username));
        toast({ title: "Lead Instagram criado", description: "Enriquecimento, score, briefing e fila foram acionados." });
      }
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
    },
    onError: (error) => toast({ title: "Falha ao prospectar perfil", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

'''
replace_once(frontend, handler_marker, handlers + handler_marker)

replace_once(
    frontend,
    '''        <TabsContent value="anunciantes" className="mt-4 space-y-4">
          <Card>''',
    '''        <TabsContent value="anunciantes" className="mt-4 space-y-4">
          <Tabs defaultValue="meta" className="space-y-4">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="meta" className="gap-1.5"><Megaphone className="h-4 w-4" /> Anunciantes Meta</TabsTrigger>
              <TabsTrigger value="instagram" className="gap-1.5"><Instagram className="h-4 w-4" /> Perfis Instagram</TabsTrigger>
            </TabsList>
            <TabsContent value="meta" className="space-y-4">
          <Card>''',
)

close_marker = '''        </TabsContent>

        <TabsContent value="fila" className="mt-4 space-y-4">'''
instagram_ui = r'''            </TabsContent>

            <TabsContent value="instagram" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-pink-600" /> Perfis profissionais do Instagram
                  </CardTitle>
                  <CardDescription>
                    Consulte até 20 @perfis Business/Creator conhecidos com dados verificados pela API oficial e envie os melhores para o mesmo Revenue Scout.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>@perfis</Label>
                    <Textarea
                      value={instagramUsernames}
                      onChange={(e) => setInstagramUsernames(e.target.value)}
                      placeholder="@arquiteturaabc, @clinicaexemplo\nTambém aceita URLs do Instagram"
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      A API oficial não oferece um diretório geral por cidade/segmento. Use usernames conhecidos; segmento e localidade abaixo enriquecem o contexto comercial depois da descoberta.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Seguidores mín.</Label>
                      <Input type="number" min={0} placeholder="Ex: 1000" value={instagramMinFollowers} onChange={(e) => setInstagramMinFollowers(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Seguidores máx.</Label>
                      <Input type="number" min={0} placeholder="Ex: 50000" value={instagramMaxFollowers} onChange={(e) => setInstagramMaxFollowers(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Atividade recente</Label>
                      <Select value={instagramActiveWithinDays} onValueChange={setInstagramActiveWithinDays}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qualquer">Qualquer</SelectItem>
                          <SelectItem value="7">Últimos 7 dias</SelectItem>
                          <SelectItem value="30">Últimos 30 dias</SelectItem>
                          <SelectItem value="90">Últimos 90 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <div className="flex items-center justify-between w-full border rounded-md px-3 h-10">
                        <Label htmlFor="ig-has-site" className="text-sm">Somente com site</Label>
                        <Switch id="ig-has-site" checked={instagramHasWebsite} onCheckedChange={setInstagramHasWebsite} />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Segmento / nicho para o CRM</Label>
                      <Input placeholder="Ex: escritórios de arquitetura" value={instagramSegmento} onChange={(e) => setInstagramSegmento(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Localidade para enriquecimento</Label>
                      <Input placeholder="Ex: Chapecó, SC" value={instagramLocalidade} onChange={(e) => setInstagramLocalidade(e.target.value)} />
                    </div>
                  </div>

                  <Button className="w-full" onClick={handleInstagramProfileSearch} disabled={instagramSearching || !instagramUsernames.trim()}>
                    {instagramSearching ? <><Spinner className="h-4 w-4 mr-2" /> Consultando...</> : <><Search className="h-4 w-4 mr-2" /> Pesquisar perfis</>}
                  </Button>

                  {instagramReconnectRequired && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      A conexão Meta precisa ser autorizada para Páginas + Instagram. Reconecte em <strong>Configurações → Integrações → Meta Ads</strong> e tente novamente.
                    </div>
                  )}
                </CardContent>
              </Card>

              {instagramSearched && (
                <div className="space-y-3">
                  {instagramProfiles.length === 0 ? (
                    <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">Nenhum perfil profissional passou pelos filtros.</CardContent></Card>
                  ) : instagramProfiles.map((profile) => {
                    const done = instagramProspected.has(profile.username) || instagramMerged.has(profile.username);
                    const loading = instagramProspectingUsername === profile.username && instagramProspectMutation.isPending;
                    return (
                      <Card key={profile.id}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <a href={`https://instagram.com/${profile.username}`} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">@{profile.username}</a>
                                <Badge variant="secondary">Verificado via API</Badge>
                              </div>
                              {profile.name && <p className="text-sm font-medium">{profile.name}</p>}
                              {profile.biography && <p className="text-sm text-muted-foreground line-clamp-2">{profile.biography}</p>}
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {profile.followersCount != null && <span><strong className="text-foreground">{profile.followersCount.toLocaleString("pt-BR")}</strong> seguidores</span>}
                                {profile.mediaCount != null && <span>{profile.mediaCount.toLocaleString("pt-BR")} publicações</span>}
                                {profile.latestMediaAt && <span>Última atividade: {new Date(profile.latestMediaAt).toLocaleDateString("pt-BR")}</span>}
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {profile.website && <Button size="sm" variant="outline" asChild><a href={profile.website} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5 mr-1" /> Site</a></Button>}
                                {profile.latestMediaPermalink && <Button size="sm" variant="outline" asChild><a href={profile.latestMediaPermalink} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Post recente</a></Button>}
                              </div>
                            </div>
                            <Button size="sm" disabled={done || instagramProspectMutation.isPending} variant={done ? "outline" : "default"} onClick={() => {
                              setInstagramProspectingUsername(profile.username);
                              instagramProspectMutation.mutate(profile, { onSettled: () => setInstagramProspectingUsername(null) });
                            }}>
                              {loading ? <><Spinner className="h-3.5 w-3.5 mr-1" /> Prospectando...</> : instagramMerged.has(profile.username) ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Já no CRM</> : instagramProspected.has(profile.username) ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Prospectado</> : <><UserPlus className="h-3.5 w-3.5 mr-1" /> Prospectar</>}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {instagramUnavailable.length > 0 && (
                    <p className="text-xs text-muted-foreground">Não disponíveis como Business/Creator: {instagramUnavailable.map((u) => `@${u}`).join(", ")}.</p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="fila" className="mt-4 space-y-4">'''
replace_once(frontend, close_marker, instagram_ui)
