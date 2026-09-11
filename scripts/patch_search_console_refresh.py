from pathlib import Path

path = Path("artifacts/api-server/src/services/search-console-oauth.ts")
text = path.read_text()

old = '''export async function verifyAndActivateSearchConsole(tenantId: string): Promise<{ verified: boolean }> {
  const conn = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!conn || !conn.accessToken || !conn.siteUrl) {
    throw new Error("Conexão Search Console pendente não encontrada");
  }

  const verifyRes = await fetch(`${SITE_VERIFICATION_API}/webResource?verificationMethod=META`, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ site: { type: "SITE", identifier: conn.siteUrl } }),
  });

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    logger.warn({ status: verifyRes.status, body: text, tenantId }, "Verificação Search Console ainda não passou");
    return { verified: false };
  }
'''

new = '''export async function verifyAndActivateSearchConsole(tenantId: string): Promise<{ verified: boolean }> {
  let conn = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!conn || !conn.refreshToken || !conn.siteUrl) {
    throw new Error("Conexão Search Console pendente não encontrada");
  }

  const tokenExpiresAtMs = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : null;
  const tokenExpiredOrNearExpiry = !conn.accessToken || (tokenExpiresAtMs !== null && tokenExpiresAtMs <= Date.now() + 60_000);

  if (tokenExpiredOrNearExpiry) {
    await refreshSearchConsoleToken(conn.id);
    const refreshedConn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!refreshedConn?.accessToken) {
      throw new Error("Não foi possível renovar o token do Search Console");
    }
    conn = refreshedConn;
  }

  const verifyRequest = (accessToken: string) => fetch(`${SITE_VERIFICATION_API}/webResource?verificationMethod=META`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ site: { type: "SITE", identifier: conn!.siteUrl } }),
  });

  let verifyRes = await verifyRequest(conn.accessToken!);

  // O access token do Google expira. Se o tenant verificar depois, renovamos
  // automaticamente em vez de informar incorretamente que ainda está propagando.
  if (verifyRes.status === 401) {
    await refreshSearchConsoleToken(conn.id);
    const refreshedConn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!refreshedConn?.accessToken) {
      throw new Error("Não foi possível renovar o token do Search Console");
    }
    conn = refreshedConn;
    verifyRes = await verifyRequest(conn.accessToken);
  }

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    logger.warn({ status: verifyRes.status, body: text, tenantId }, "Verificação Search Console ainda não passou");
    if (verifyRes.status === 401 || verifyRes.status === 403) {
      throw new Error(`Falha de autorização da Site Verification API: ${verifyRes.status}`);
    }
    return { verified: false };
  }
'''

if old not in text:
    raise SystemExit("verification block marker not found")

path.write_text(text.replace(old, new, 1))
