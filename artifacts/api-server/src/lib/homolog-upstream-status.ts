/** Distinguish token rejection from an unavailable upstream auth service. */
export function classifyHomologUpstreamStatus(status: number): { status: number; error: string } | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return { status: 401, error: "upstream_token_rejected" };
  if (status === 403) return { status: 403, error: "upstream_permission_denied" };
  return { status: 502, error: "upstream_auth_unavailable" };
}
