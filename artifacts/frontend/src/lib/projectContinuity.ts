/** UI-01.8: shared project continuity contract for browser/mobile/desktop.
 * This code is pure, has no navigator/device dependencies and never grants access.
 * Server-authorized project memberships and revisions remain authoritative.
 */
export type ClientSurface = "web" | "mobile" | "desktop";
export type WorkMode = "online" | "offline";
export type ProjectCapability = "preproject" | "studio_2d" | "studio_3d" |
  "local_render_preview" | "ai_render" | "marketplace" | "execution" | "messages";
export interface ProjectContinuity {
  projectId: string;
  revision: string;
  contextId: string;
  capabilities: readonly ProjectCapability[];
}
const OFFLINE_SUPPORTED = new Set<ProjectCapability>([
  "preproject", "studio_2d", "studio_3d", "local_render_preview",
]);
const MOBILE_SUPPORTED = new Set<ProjectCapability>([
  "preproject", "messages", "marketplace", "execution",
]);
const ALL_CAPABILITIES = new Set<ProjectCapability>([
  "preproject", "studio_2d", "studio_3d", "local_render_preview",
  "ai_render", "marketplace", "execution", "messages",
]);
export function availableProjectCapabilities(
  project: ProjectContinuity,
  surface: ClientSurface,
  mode: WorkMode,
): ProjectCapability[] {
  return project.capabilities.filter(capability =>
    ALL_CAPABILITIES.has(capability) &&
    (surface !== "mobile" || MOBILE_SUPPORTED.has(capability)) &&
    (mode === "online" || OFFLINE_SUPPORTED.has(capability))
  );
}
export interface LocalChange {
  operationId: string;
  projectId: string;
  baseRevision: string;
  kind: "geometry" | "annotation" | "material";
}
/** Offline mutation is eligible for upload, never automatic overwrite. */
export function evaluateOfflineUpload(
  change: LocalChange,
  current: ProjectContinuity,
): "eligible" | "conflict" | "denied" {
  if (!change.operationId || !change.projectId || !change.baseRevision ||
      change.projectId !== current.projectId || !current.contextId) return "denied";
  if (change.baseRevision !== current.revision) return "conflict";
  return "eligible";
}
