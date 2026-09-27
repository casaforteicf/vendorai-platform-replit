export const dashboardSnapshotQueryKey = (tenantId: string) => ["dashboard-snapshot", tenantId] as const;

export async function fetchDashboardSnapshot(token: string) {
  const response = await fetch("/api/dashboard", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Falha ao carregar visão executiva");
  return response.json();
}
