from pathlib import Path

p = Path("artifacts/api-server/src/services/google-ads-oauth.ts")
text = p.read_text()
old = '''export async function selectGoogleAdsAccount(tenantId: string, customerId: string): Promise<void> {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  const accessToken = await getFreshGoogleAdsAccessToken(tenantId);

  await assertCustomerNotOwnedByAnotherTenant(normalizedCustomerId, tenantId);'''
new = '''export async function selectGoogleAdsAccount(tenantId: string, customerId: string): Promise<void> {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn) throw new Error("Conexão Google Ads pendente não encontrada");
  const accessToken = await getFreshGoogleAdsAccessToken(tenantId);

  await assertCustomerNotOwnedByAnotherTenant(normalizedCustomerId, tenantId);'''
if old not in text:
    raise SystemExit("selection followup pattern not found")
p.write_text(text.replace(old, new, 1))
print("Google Ads selection followup applied")
