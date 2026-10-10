/**
 * Arqdor MEP-01 graph validation. Pure, database-independent checks.
 * Technical dimensioning and clash detection are separate responsibilities.
 */
export type MepGraphNode = {
  id: string;
  tenantId: string;
  projectId: string;
  networkId: string;
  xMm: number;
  yMm: number;
  zMm: number;
};

export type MepGraphSegment = {
  id: string;
  tenantId: string;
  projectId: string;
  networkId: string;
  fromNodeId: string;
  toNodeId: string;
  nominalSizeMm?: number | null;
};

export type MepGraphIssue = {
  code: "duplicate_node" | "duplicate_segment" | "invalid_coordinate" | "missing_endpoint" | "cross_scope_endpoint" | "self_loop" | "invalid_size";
  elementId: string;
};

export function validateMepNetwork(
  scope: { tenantId: string; projectId: string; networkId: string },
  nodes: readonly MepGraphNode[],
  segments: readonly MepGraphSegment[],
): MepGraphIssue[] {
  const issues: MepGraphIssue[] = [];
  const index = new Map<string, MepGraphNode>();
  const seenSegments = new Set<string>();

  for (const node of nodes) {
    if (index.has(node.id)) issues.push({ code: "duplicate_node", elementId: node.id });
    else index.set(node.id, node);
    if (![node.xMm, node.yMm, node.zMm].every(Number.isSafeInteger)) {
      issues.push({ code: "invalid_coordinate", elementId: node.id });
    }
    if (node.tenantId !== scope.tenantId || node.projectId !== scope.projectId || node.networkId !== scope.networkId) {
      issues.push({ code: "cross_scope_endpoint", elementId: node.id });
    }
  }
  for (const segment of segments) {
    if (seenSegments.has(segment.id)) issues.push({ code: "duplicate_segment", elementId: segment.id });
    seenSegments.add(segment.id);
    if (segment.fromNodeId === segment.toNodeId) issues.push({ code: "self_loop", elementId: segment.id });
    if (segment.nominalSizeMm != null && (!Number.isSafeInteger(segment.nominalSizeMm) || segment.nominalSizeMm <= 0)) {
      issues.push({ code: "invalid_size", elementId: segment.id });
    }
    const from = index.get(segment.fromNodeId);
    const to = index.get(segment.toNodeId);
    if (!from || !to) issues.push({ code: "missing_endpoint", elementId: segment.id });
    if (
      segment.tenantId !== scope.tenantId ||
      segment.projectId !== scope.projectId ||
      segment.networkId !== scope.networkId ||
      [from, to].some(node => node && (
        node.tenantId !== segment.tenantId ||
        node.projectId !== segment.projectId ||
        node.networkId !== segment.networkId
      ))
    ) issues.push({ code: "cross_scope_endpoint", elementId: segment.id });
  }
  return issues;
}
