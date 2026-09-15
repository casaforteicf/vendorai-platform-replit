import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";
const buildId = (process.env.VENDOR_BUILD_ID || process.env.GITHUB_SHA || "local")
  .replace(/[^a-zA-Z0-9_-]/g, "")
  .slice(0, 12) || "local";

// O produtor original do Plano de Mídia ainda assume que toda a fila cabe na
// franquia. Este transform limita cada rodada ao saldo realmente disponível e
// usa um snapshot de fila+saldo para retomar automaticamente depois que um
// pacote extra for pago, sem repetir indefinidamente a mesma rodada com falha.
const mediaPlanAvailableQuotaPlugin = {
  name: "media-plan-available-quota",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.split("?")[0]?.replace(/\\/g, "/") ?? id;
    if (!normalizedId.endsWith("/src/components/marketing/MediaPlanAutoProductionBridge.tsx")) return null;

    const replaceExact = (value: string, from: string, to: string, label: string) => {
      const first = value.indexOf(from);
      if (first < 0 || value.indexOf(from, first + from.length) >= 0) {
        throw new Error(`MediaPlan quota transform guard failed (${label})`);
      }
      return value.replace(from, to);
    };

    let contents = code;
    contents = replaceExact(
      contents,
      `  const [results, setResults] = useState<ProductionResult[]>([]);\n  const startingRef = useRef(false);`,
      `  const [results, setResults] = useState<ProductionResult[]>([]);\n  const [availableGenerations, setAvailableGenerations] = useState(0);\n  const startingRef = useRef(false);`,
      "available state",
    );
    contents = replaceExact(
      contents,
      `      const [planRes, calendarRes, projectsRes, imageRes, videoRes] = await Promise.all([\n        fetch(\`/api/tenants/\${tenantId}/media-plan\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/content-calendar\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/media/projects?limit=200\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/media/assets?type=image&limit=150\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/media/assets?type=video&limit=150\`, { headers: authHeaders(), cache: "no-store" }),\n      ]);`,
      `      const [planRes, calendarRes, projectsRes, imageRes, videoRes, usageRes] = await Promise.all([\n        fetch(\`/api/tenants/\${tenantId}/media-plan\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/content-calendar\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/media/projects?limit=200\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/media/assets?type=image&limit=150\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/media/assets?type=video&limit=150\`, { headers: authHeaders(), cache: "no-store" }),\n        fetch(\`/api/tenants/\${tenantId}/content\`, { headers: authHeaders(), cache: "no-store" }),\n      ]);`,
      "load usage",
    );
    contents = replaceExact(
      contents,
      `      if (projectsRes.ok) {\n        const data = await projectsRes.json() as { projects?: MediaProject[] };\n        setProjects(data.projects ?? []);\n      }\n      const nextAssets: MediaAsset[] = [];`,
      `      if (projectsRes.ok) {\n        const data = await projectsRes.json() as { projects?: MediaProject[] };\n        setProjects(data.projects ?? []);\n      }\n      if (usageRes.ok) {\n        const usage = await usageRes.json() as { availableGenerations?: number; monthlyUsed?: number; monthlyLimit?: number; extraRemaining?: number };\n        const fallback = Math.max(0, Number(usage.monthlyLimit ?? 0) - Number(usage.monthlyUsed ?? 0));\n        setAvailableGenerations(Math.max(0, Math.floor(Number(usage.availableGenerations ?? fallback))));\n      }\n      const nextAssets: MediaAsset[] = [];`,
      "apply usage",
    );
    contents = replaceExact(
      contents,
      `    const queue = missing.filter((item) => item.status === "aprovado" || item.status === "gerado");\n    if (queue.length === 0) return;`,
      `    const eligible = missing.filter((item) => item.status === "aprovado" || item.status === "gerado");\n    const queue = eligible.slice(0, Math.max(0, availableGenerations));\n    if (queue.length === 0) return;`,
      "partial queue",
    );
    contents = replaceExact(
      contents,
      `      sessionStorage.setItem(\`${AUTO_KEY_PREFIX}\${plan.id}\`, new Date().toISOString());`,
      `      sessionStorage.setItem(\`${AUTO_KEY_PREFIX}\${plan.id}\`, \`${missing.length}:\${availableGenerations}\`);`,
      "quota snapshot",
    );
    contents = replaceExact(
      contents,
      `  }, [load, materializeOne, missing, plan, running]);`,
      `  }, [availableGenerations, load, materializeOne, missing, plan, running]);`,
      "runAll deps",
    );
    contents = replaceExact(
      contents,
      `    if (!onPlanQueue || !plan || plan.conteudo.statusPlanejamento !== "aprovado" || missing.length === 0 || running || startingRef.current) return;\n    let alreadyStarted = false;\n    try { alreadyStarted = Boolean(sessionStorage.getItem(\`${AUTO_KEY_PREFIX}\${plan.id}\`)); } catch {}\n    if (alreadyStarted) return;`,
      `    if (!onPlanQueue || !plan || plan.conteudo.statusPlanejamento !== "aprovado" || missing.length === 0 || availableGenerations <= 0 || running || startingRef.current) return;\n    const snapshot = \`${missing.length}:\${availableGenerations}\`;\n    let alreadyStarted = false;\n    try { alreadyStarted = sessionStorage.getItem(\`${AUTO_KEY_PREFIX}\${plan.id}\`) === snapshot; } catch {}\n    if (alreadyStarted) return;`,
      "auto resume guard",
    );
    contents = replaceExact(
      contents,
      `  }, [missing.length, onPlanQueue, plan, runAll, running]);`,
      `  }, [availableGenerations, missing.length, onPlanQueue, plan, runAll, running]);`,
      "auto resume deps",
    );
    contents = replaceExact(
      contents,
      `<Play className="h-3.5 w-3.5" /> Produzir plano completo ({missing.length})`,
      `<Play className="h-3.5 w-3.5" /> Produzir agora ({Math.min(missing.length, availableGenerations)})`,
      "button label",
    );

    return { code: contents, map: null };
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    mediaPlanAvailableQuotaPlugin,
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Todo deploy recebe URLs novas, inclusive para chunks cujo conteúdo não
        // mudou. Isso impede que um 404/HTML antigo armazenado como immutable no
        // cache HTTP continue contaminando versões seguintes do aplicativo.
        entryFileNames: `assets/[name]-${buildId}-[hash].js`,
        chunkFileNames: `assets/[name]-${buildId}-[hash].js`,
        assetFileNames: `assets/[name]-${buildId}-[hash][extname]`,
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
