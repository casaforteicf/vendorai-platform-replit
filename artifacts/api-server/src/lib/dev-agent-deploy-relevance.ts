export type BackendDriftClassification = {
  backendRelevant: boolean;
  changedFiles: string[];
  relevantFiles: string[];
  ignoredFiles: string[];
};

const NON_BACKEND_PREFIXES = [
  ".github/",
  "artifacts/frontend/",
  "artifacts/mobile/",
  "artifacts/website/",
  "docs/",
];

const NON_BACKEND_FILES = new Set([
  "Dockerfile.android-apk",
  "README.md",
]);

const BACKEND_PREFIXES = [
  "artifacts/api-server/",
  "lib/",
  "packages/",
  "scripts/",
];

const BACKEND_ROOT_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "railway.toml",
  "Dockerfile",
]);

export function isBackendRelevantPath(rawPath: string) {
  const path = String(rawPath ?? "").trim().replace(/^\.\//, "");
  if (!path) return false;

  if (NON_BACKEND_FILES.has(path)) return false;
  if (NON_BACKEND_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;

  if (BACKEND_ROOT_FILES.has(path)) return true;
  if (BACKEND_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;

  // Segurança: caminhos desconhecidos são tratados como relevantes para evitar
  // falso negativo em produção. Só ignoramos superfícies explicitamente não backend.
  return true;
}

export function classifyBackendDrift(paths: string[]): BackendDriftClassification {
  const changedFiles = [...new Set((Array.isArray(paths) ? paths : [])
    .map((path) => String(path ?? "").trim())
    .filter(Boolean))];
  const relevantFiles = changedFiles.filter(isBackendRelevantPath);
  const ignoredFiles = changedFiles.filter((path) => !isBackendRelevantPath(path));

  return {
    backendRelevant: relevantFiles.length > 0,
    changedFiles,
    relevantFiles,
    ignoredFiles,
  };
}
