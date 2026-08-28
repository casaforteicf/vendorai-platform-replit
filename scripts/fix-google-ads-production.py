from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found: {label} in {path}")
    p.write_text(text.replace(old, new, 1))


oauth = "artifacts/api-server/src/services/google-ads-oauth.ts"
replace_once(
    oauth,
    'return "https://appvendorai.com/api/auth/google-ads/callback";',
    'return "https://app.appvendorai.com/api/auth/google-ads/callback";',
    "canonical callback",
)

old_accessible = '''export interface AccessibleCustomer {
  customerId: string;
}

// Lista as contas Google Ads que o refresh token consegue acessar
// diretamente (contas próprias ou onde o usuário tem acesso direto —
// não percorre a hierarquia de uma MCC, o que não é necessário no
// modelo "cada lojista com a própria conta").
export async function listAccessibleCustomers(accessToken: string): Promise<AccessibleCustomer[]> {
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error(`Falha ao listar contas Google Ads acessíveis: status=${res.status} body=${text.slice(0, 500)}`);
    throw new Error(`List accessible customers failed: ${res.status}`);
  }
  const data = (await res.json()) as { resourceNames?: string[] };
  return (data.resourceNames ?? []).map((resourceName) => ({
    // resourceName vem no formato "customers/1234567890"
    customerId: resourceName.split("/")[1] ?? resourceName,
  }));
}

export interface GoogleAdsCustomerInfo {
  customerId: string;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
}
'''
new_accessible = '''export function normalizeGoogleAdsCustomerId(value: string): string {
  const normalized = value.trim().replace(/^customers\//i, "").replace(/-/g, "");
  if (!/^\d{10}$/.test(normalized)) {
    throw new Error("ID da conta Google Ads inválido — use os 10 dígitos da conta anunciante.");
  }
  return normalized;
}

export interface AccessibleCustomer {
  customerId: string;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  manager: boolean;
  status: string | null;
  testAccount: boolean;
}

// listAccessibleCustomers devolve apenas contas às quais o usuário tem
// acesso DIRETO. Enriquecemos cada ID para distinguir conta anunciante de
// conta gerente (MCC) antes de permitir a seleção no VendorAI.
export async function listAccessibleCustomers(accessToken: string): Promise<AccessibleCustomer[]> {
  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN não configurado no servidor");
  }
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error(`Falha ao listar contas Google Ads acessíveis: status=${res.status} body=${text.slice(0, 500)}`);
    throw new Error(`List accessible customers failed: ${res.status}`);
  }
  const data = (await res.json()) as { resourceNames?: string[] };
  const customers: AccessibleCustomer[] = [];
  for (const resourceName of data.resourceNames ?? []) {
    const customerId = normalizeGoogleAdsCustomerId(resourceName);
    customers.push(await fetchCustomerInfo(customerId, accessToken));
  }
  return customers;
}

export interface GoogleAdsCustomerInfo {
  customerId: string;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
  manager: boolean;
  status: string | null;
  testAccount: boolean;
}
'''
replace_once(oauth, old_accessible, new_accessible, "accessible customer enrichment")

replace_once(
    oauth,
    'const query = "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1";',
    'const query = "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status, customer.test_account FROM customer LIMIT 1";',
    "customer info query",
)
replace_once(
    oauth,
    '''  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };''',
    '''  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN não configurado no servidor");
  }
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };''',
    "developer token and normalize fetch info",
)
replace_once(
    oauth,
    'const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {',
    'const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${normalizedCustomerId}/googleAds:search`, {',
    "normalized customer info URL",
)
replace_once(
    oauth,
    '''      customer?: { descriptiveName?: string; currencyCode?: string; timeZone?: string };
    }>;
  };
  const customer = data.results?.[0]?.customer;

  return {
    customerId,
    descriptiveName: customer?.descriptiveName ?? null,
    currencyCode: customer?.currencyCode ?? null,
    timeZone: customer?.timeZone ?? null,
  };''',
    '''      customer?: {
        descriptiveName?: string;
        currencyCode?: string;
        timeZone?: string;
        manager?: boolean;
        status?: string;
        testAccount?: boolean;
      };
    }>;
  };
  const customer = data.results?.[0]?.customer;

  return {
    customerId: normalizedCustomerId,
    descriptiveName: customer?.descriptiveName ?? null,
    currencyCode: customer?.currencyCode ?? null,
    timeZone: customer?.timeZone ?? null,
    manager: customer?.manager ?? false,
    status: customer?.status ?? null,
    testAccount: customer?.testAccount ?? false,
  };''',
    "customer info result",
)

replace_once(
    oauth,
    '''export async function selectGoogleAdsAccount(tenantId: string, customerId: string): Promise<void> {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn || !conn.accessToken) {
    throw new Error("Conexão Google Ads pendente não encontrada");
  }

  await assertCustomerNotOwnedByAnotherTenant(customerId, tenantId);

  const info = await fetchCustomerInfo(customerId, conn.accessToken);''',
    '''export async function selectGoogleAdsAccount(tenantId: string, customerId: string): Promise<void> {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  const accessToken = await getFreshGoogleAdsAccessToken(tenantId);

  await assertCustomerNotOwnedByAnotherTenant(normalizedCustomerId, tenantId);

  const info = await fetchCustomerInfo(normalizedCustomerId, accessToken);
  if (info.manager) {
    throw new Error("Selecione uma conta anunciante, não uma conta gerente (MCC).");
  }
  if (info.status && info.status !== "ENABLED") {
    throw new Error(`A conta Google Ads selecionada não está ativa (status: ${info.status}).`);
  }''',
    "safe account selection",
)

anchor = '''export async function getGoogleAdsConnectionByTenantId(tenantId: string) {
  const [conn] = await db
    .select()
    .from(googleAdsConnectionsTable)
    .where(eq(googleAdsConnectionsTable.tenantId, tenantId));
  return conn ?? null;
}

export async function refreshGoogleAdsToken(connectionId: string): Promise<void> {'''
replacement = '''export async function getGoogleAdsConnectionByTenantId(tenantId: string) {
  const [conn] = await db
    .select()
    .from(googleAdsConnectionsTable)
    .where(eq(googleAdsConnectionsTable.tenantId, tenantId));
  return conn ?? null;
}

export async function getFreshGoogleAdsAccessToken(tenantId: string): Promise<string> {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn?.refreshToken) throw new Error("Conexão Google Ads não encontrada ou sem refresh token");

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (conn.accessToken && expiresAt > Date.now() + 2 * 60 * 1000) return conn.accessToken;

  await refreshGoogleAdsToken(conn.id);
  const refreshed = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!refreshed?.accessToken) throw new Error("Não foi possível renovar o acesso ao Google Ads");
  return refreshed.accessToken;
}

export async function refreshGoogleAdsToken(connectionId: string): Promise<void> {'''
replace_once(oauth, anchor, replacement, "fresh access token helper")

route = "artifacts/api-server/src/routes/google-ads-auth.ts"
replace_once(
    route,
    '''  getGoogleAdsConnectionByTenantId,
} from "../services/google-ads-oauth.js";''',
    '''  getGoogleAdsConnectionByTenantId,
  getFreshGoogleAdsAccessToken,
} from "../services/google-ads-oauth.js";''',
    "route fresh token import",
)
replace_once(
    route,
    '''    let accounts;
    try {
      accounts = await listAccessibleCustomers(tokens.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao listar contas Google Ads acessíveis");
      return res.redirect(`${appUrl}${returnTo}?googleAdsConnected=pending`);
    }

    if (accounts.length === 0) {
      logger.warn({ tenantId }, "Nenhuma conta Google Ads acessível para o usuário");
      return res.redirect(`${appUrl}${returnTo}?googleAdsError=no_account`);
    }

    if (accounts.length === 1 && accounts[0]) {''',
    '''    let accounts;
    try {
      accounts = await listAccessibleCustomers(tokens.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao listar contas Google Ads acessíveis");
      return res.redirect(`${appUrl}${returnTo}?googleAdsError=api_access`);
    }

    const advertiserAccounts = accounts.filter((account) => !account.manager && account.status === "ENABLED");
    if (advertiserAccounts.length === 0) {
      logger.warn({ tenantId, accessibleCount: accounts.length }, "Nenhuma conta anunciante Google Ads ativa acessível diretamente");
      return res.redirect(`${appUrl}${returnTo}?googleAdsError=no_advertiser_account`);
    }

    if (advertiserAccounts.length === 1 && advertiserAccounts[0]) {''',
    "callback advertiser accounts",
)
replace_once(
    route,
    '''        await selectGoogleAdsAccount(tenantId, accounts[0].customerId);
        logger.info({ tenantId, customerId: accounts[0].customerId }, "Google Ads conectado com sucesso");''',
    '''        await selectGoogleAdsAccount(tenantId, advertiserAccounts[0].customerId);
        logger.info({ tenantId, customerId: advertiserAccounts[0].customerId }, "Google Ads conectado com sucesso");''',
    "auto select advertiser",
)
replace_once(
    route,
    '''    logger.info({ tenantId, count: accounts.length }, "Múltiplas contas Google Ads encontradas, aguardando seleção");''',
    '''    logger.info({ tenantId, count: advertiserAccounts.length }, "Múltiplas contas anunciantes Google Ads encontradas, aguardando seleção");''',
    "pending advertiser count",
)
replace_once(
    route,
    '''    const conn = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!conn || !conn.accessToken) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const accounts = await listAccessibleCustomers(conn.accessToken);
    return res.json({ accounts });''',
    '''    const conn = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const accessToken = await getFreshGoogleAdsAccessToken(tenantId);
    const accounts = (await listAccessibleCustomers(accessToken))
      .filter((account) => !account.manager && account.status === "ENABLED");
    return res.json({ accounts });''',
    "fresh list accounts",
)
replace_once(
    route,
    '''  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao selecionar conta Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/google-ads-connection/refresh"''',
    '''  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao selecionar conta Google Ads");
    return res.status(422).json({ error: err instanceof Error ? err.message : "Não foi possível selecionar a conta Google Ads" });
  }
});

router.post("/tenants/:tenantId/google-ads-connection/refresh"''',
    "selection error response",
)

config = "artifacts/frontend/src/pages/Configuracoes.tsx"
replace_once(
    config,
    'const [googleAdsAccounts, setGoogleAdsAccounts] = useState<Array<{ customerId: string }>>([]);',
    'const [googleAdsAccounts, setGoogleAdsAccounts] = useState<Array<{ customerId: string; descriptiveName?: string | null; currencyCode?: string | null }>>([]);',
    "config enriched account type",
)
replace_once(
    config,
    '''                          <SelectItem key={acc.customerId} value={acc.customerId}>
                            {acc.customerId}
                          </SelectItem>''',
    '''                          <SelectItem key={acc.customerId} value={acc.customerId}>
                            {acc.descriptiveName ? `${acc.descriptiveName} — ${acc.customerId}` : acc.customerId}
                          </SelectItem>''',
    "config account display",
)
replace_once(
    config,
    '''      if (!res.ok) throw new Error();
      toast({ title: "Conta Google Ads conectada com sucesso." });
      await loadGoogleAdsConnection();
    } catch {
      toast({ title: "Erro ao selecionar conta Google Ads.", variant: "destructive" });''',
    '''      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Não foi possível selecionar a conta Google Ads");
      toast({ title: "Conta Google Ads conectada com sucesso." });
      await loadGoogleAdsConnection();
    } catch (error) {
      toast({ title: "Erro ao selecionar conta Google Ads.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });''',
    "config selection error detail",
)

ads = "artifacts/frontend/src/pages/Ads.tsx"
replace_once(
    ads,
    'Veículos, imóveis e serviços usam texto gerado por IA (Google Search/Performance Max) ou foto gerada por IA (Meta).',
    'Veículos, imóveis e serviços usam texto gerado por IA (Google Search) ou foto gerada por IA (Meta).',
    "accurate Google product help",
)
replace_once(
    ads,
    'c.tipoAnuncio === "imagem" ? "Imagem" : "Search/PMax (IA)"',
    'c.tipoAnuncio === "imagem" ? "Imagem" : "Search (IA)"',
    "accurate Google campaign badge",
)

env = ".env.example"
replace_once(
    env,
    '''GOOGLE_PLACES_API_KEY=

# ─── IA''',
    '''GOOGLE_PLACES_API_KEY=

# ─── Google Ads ────────────────────────────────────────────────────────────────
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_REDIRECT_URI=https://app.appvendorai.com/api/auth/google-ads/callback

# ─── IA''',
    "document Google Ads env",
)
replace_once(
    env,
    'INSTAGRAM_REDIRECT_URI=https://appvendorai.com/api/auth/instagram/callback',
    'INSTAGRAM_REDIRECT_URI=https://app.appvendorai.com/api/auth/instagram/callback',
    "document Instagram callback",
)

print("Google Ads production patch applied")
