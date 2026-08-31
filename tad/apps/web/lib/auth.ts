export function bearerToken(req: Request): string | null {
  const value = req.headers.get('authorization') || '';
  if (!value.startsWith('Bearer ')) return null;
  const token = value.slice(7).trim();
  return token || null;
}
