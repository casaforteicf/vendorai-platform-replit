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

// Política do Super Admin: a conta de plataforma precisa enxergar todas as
// telas do sistema, inclusive quando abre/visualiza um tenant específico.
// Os filtros de plano, vertical, função e entitlement continuam valendo
// normalmente para todos os usuários de tenant.
const superAdminFullVisibilityPlugin = {
  name: "super-admin-full-visibility",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.split("?")[0]?.replace(/\\/g, "/") ?? id;

    code = code.replace(/\r\n/g, "\n");

    const replaceExact = (value: string, from: string, to: string, label: string) => {
      const first = value.indexOf(from);
      if (first < 0 || value.indexOf(from, first + from.length) >= 0) {
        throw new Error(`Super Admin visibility transform guard failed (${label})`);
      }
      return value.replace(from, to);
    };

    if (normalizedId.endsWith("/src/components/layout/SidebarLayoutLegacy.tsx")) {
      const alreadyApplied = `  function isVisible(item: typeof allNavItems[0]) {\n    if (isSuperAdmin) return true;`;
      if (code.includes(alreadyApplied)) return null;

      const from = `  function isVisible(item: typeof allNavItems[0]) {\n    if (isStartPlan && !START_PLAN_HREFS.has(item.href)) return false;`;
      const to = `  function isVisible(item: typeof allNavItems[0]) {\n    if (isSuperAdmin) return true;\n    if (isStartPlan && !START_PLAN_HREFS.has(item.href)) return false;`;

      return { code: replaceExact(code, from, to, "legacy menu bypass"), map: null };
    }

    if (!normalizedId.endsWith("/src/components/layout/SidebarLayout.tsx")) return null;

    // A navegação atual já aplica as regras de Super Admin diretamente no
    // SidebarLayout. O transform abaixo existe apenas para a implementação
    // legada; tentar reescrever o layout declarativo novo quebra o build quando
    // a estrutura do menu evolui.
    const usesDeclarativeTenantNavigation =
      code.includes("const pracaAiVisible = isPureSuperAdmin;") &&
      code.includes("Arqdor é renderizado declarativamente pelo SidebarLayoutLegacy");
    if (usesDeclarativeTenantNavigation) return null;

    let contents = code;
    contents = replaceExact(
      contents,
      `  const effectiveTenantId = user?.tenantId ?? "";`,
      `  const effectiveTenantId = user?.tenantId ?? "";\n  const isSuperAdmin = user?.platformRole === "super_admin";`,
      "wrapper super admin flag",
    );
    contents = replaceExact(
      contents,
      `      document.querySelectorAll<HTMLAnchorElement>('a[href="/arch"]').forEach((archLink) => {\n        if (archLink.dataset.arqdorToolEntry === "true") return;\n        const group = archLink.parentElement;`,
      `      document.querySelectorAll<HTMLAnchorElement>('a[href="/arch"]').forEach((archLink) => {\n        if (archLink.dataset.arqdorToolEntry === "true") return;\n        if (isSuperAdmin) return;\n        const group = archLink.parentElement;`,
      "keep full Arqdor navigation for super admin",
    );
    contents = replaceExact(
      contents,
      `      if (!arqdorVisible) {\n        injected.forEach((entry) => entry.remove());\n        observer.observe(document.body, { childList: true, subtree: true });\n        return;\n      }`,
      `      if (isSuperAdmin) {\n        injected.forEach((entry) => entry.remove());\n        observer.observe(document.body, { childList: true, subtree: true });\n        return;\n      }\n\n      if (!arqdorVisible) {\n        injected.forEach((entry) => entry.remove());\n        observer.observe(document.body, { childList: true, subtree: true });\n        return;\n      }`,
      "skip tenant Arqdor injector for super admin",
    );
    contents = replaceExact(
      contents,
      `  }, [arqdorVisible, location, setLocation]);`,
      `  }, [arqdorVisible, isSuperAdmin, location, setLocation]);`,
      "Arqdor effect dependencies",
    );
    contents = replaceExact(
      contents,
      `  useEffect(() => {\n    const isPureSuperAdmin = user?.platformRole === "super_admin" && !tenantOverride;\n    if (isPureSuperAdmin || tenantNavModulesLoading || tenantQuery.isLoading) return;`,
      `  useEffect(() => {\n    if (isSuperAdmin || tenantNavModulesLoading || tenantQuery.isLoading) return;`,
      "Arqdor route bypass",
    );
    contents = replaceExact(
      contents,
      `  }, [arqdorVisible, location, setLocation, tenantNavModulesLoading, tenantOverride, tenantQuery.isLoading, user?.platformRole]);`,
      `  }, [arqdorVisible, isSuperAdmin, location, setLocation, tenantNavModulesLoading, tenantQuery.isLoading]);`,
      "Arqdor route effect dependencies",
    );
    contents = replaceExact(
      contents,
      `        const nextDisplay = erpEntitled ? "" : "none";`,
      `        const nextDisplay = isSuperAdmin || erpEntitled ? "" : "none";`,
      "ERP super admin visibility",
    );
    contents = replaceExact(
      contents,
      `  }, [erpEntitled]);`,
      `  }, [erpEntitled, isSuperAdmin]);`,
      "ERP effect dependencies",
    );
    contents = replaceExact(
      contents,
      `    const enforceBudgetSidebarPolicy = () => {\n      document.querySelectorAll<HTMLAnchorElement>('a[href="/propostas"]').forEach((link) => {`,
      `    const enforceBudgetSidebarPolicy = () => {\n      if (isSuperAdmin) return;\n      document.querySelectorAll<HTMLAnchorElement>('a[href="/propostas"]').forEach((link) => {`,
      "budget super admin visibility",
    );
    contents = replaceExact(
      contents,
      `    };\n  }, []);\n\n  useEffect(() => {\n    if (!PRACA_AI_LINK_SELECTOR) return;`,
      `    };\n  }, [isSuperAdmin]);\n\n  useEffect(() => {\n    if (!PRACA_AI_LINK_SELECTOR) return;`,
      "budget effect dependencies",
    );
    contents = replaceExact(
      contents,
      `        const nextDisplay = pracaAiEntitled ? "" : "none";`,
      `        const nextDisplay = isSuperAdmin || pracaAiEntitled ? "" : "none";`,
      "Praça.ai super admin visibility",
    );
    contents = replaceExact(
      contents,
      `  }, [pracaAiEntitled]);`,
      `  }, [isSuperAdmin, pracaAiEntitled]);`,
      "Praça.ai effect dependencies",
    );
    contents = replaceExact(
      contents,
      `    if (!effectiveTenantId || tenantNavModulesLoading || pracaAiEntitled) return;`,
      `    if (isSuperAdmin || !effectiveTenantId || tenantNavModulesLoading || pracaAiEntitled) return;`,
      "Praça.ai route bypass",
    );
    contents = replaceExact(
      contents,
      `  }, [effectiveTenantId, location, pracaAiEntitled, setLocation, tenantNavModulesLoading]);`,
      `  }, [effectiveTenantId, isSuperAdmin, location, pracaAiEntitled, setLocation, tenantNavModulesLoading]);`,
      "Praça.ai route effect dependencies",
    );

    return { code: contents, map: null };
  },
};

// Proteção do produtor do Plano de Mídia. A produção é sempre deliberada:
// nunca inicia por effect/abertura de tela, passa pelo gate de permissão do
// backend, processa somente itens aprovados sem geração e no máximo 10 por clique.
// A franquia disponível continua sendo respeitada como uma barreira adicional.
const mediaPlanAvailableQuotaPlugin = {
  name: "media-plan-available-quota",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.split("?")[0]?.replace(/\\/g, "/") ?? id;

    // O controle novo chama o produtor legado por botão. Aceite o rótulo novo
    // "Produzir lote" e mantenha compatibilidade com rótulos anteriores.
    if (normalizedId.endsWith("/src/components/marketing/MediaPlanBatchControl.tsx")) {
      const from = `.find((button) => normalizedText(button.textContent ?? "").startsWith("Produzir plano completo"));`;
      const to = `.find((button) => ["Produzir lote", "Produzir plano completo", "Produzir agora"]\n      .some((prefix) => normalizedText(button.textContent ?? "").startsWith(prefix)));`;
      if (!code.includes(from)) {
        throw new Error("MediaPlan batch-control transform guard failed (production button)");
      }
      return { code: code.replace(from, to), map: null };
    }

    if (!normalizedId.endsWith("/src/components/marketing/MediaPlanAutoProductionBridge.tsx")) return null;

    const replaceExact = (value: string, from: string, to: string, label: string) => {
      const first = value.indexOf(from);
      if (first < 0 || value.indexOf(from, first + from.length) >= 0) {
        throw new Error(`MediaPlan quota transform guard failed (${label})`);
      }
      return value.replace(from, to);
    };

    // Vite preserves the checkout's line endings here. Normalize them so the
    // guarded transforms behave identically on Windows and Linux runners.
    let contents = code.replace(/\r\n/g, "\n");
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
      `    const payload = await response.json().catch(() => ({})) as ContentGeneration & { error?: string };\n    if (!response.ok || !payload.id) throw new Error(payload.error ?? "O gerador não criou o rascunho.");`,
      `    const payload = await response.json().catch(() => ({})) as ContentGeneration & { error?: string };\n    if (!response.ok || !payload.id) {\n      if (response.status === 402) throw new Error("quota_exhausted:" + (payload.error ?? "Franquia de gerações esgotada."));\n      throw new Error(payload.error ?? "O gerador não criou o rascunho.");\n    }`,
      "quota error marker",
    );
    contents = replaceExact(
      contents,
      `    } catch (error) {\n      await updateProject(project, {\n        materializationStatus: "failed",\n        executorKind: item.tipo,\n        executorDetail: error instanceof Error ? error.message : "Falha na produção",\n      }).catch(() => null);\n      throw error;\n    }`,
      `    } catch (error) {\n      const quotaExhausted = error instanceof Error && error.message.startsWith("quota_exhausted:");\n      await updateProject(project, {\n        materializationStatus: quotaExhausted ? "planned" : "failed",\n        executorKind: item.tipo,\n        executorDetail: quotaExhausted ? "Aguardando novas gerações" : error instanceof Error ? error.message : "Falha na produção",\n      }).catch(() => null);\n      throw error;\n    }`,
      "pending on quota exhaustion",
    );
    contents = replaceExact(
      contents,
      `    const queue = missing.filter((item) => item.status === "aprovado" || item.status === "gerado");\n    if (queue.length === 0) return;`,
      `    const eligible = missing.filter((item) => item.status === "aprovado" && !item.contentGenerationId);\n    const authorizationResponse = await fetch(\`/api/tenants/\${tenantId}/content-calendar/\${plan.id}/autorizar-producao-lote\`, {\n      method: "POST",\n      headers: authHeaders(true),\n      body: JSON.stringify({}),\n    });\n    const authorizationPayload = await authorizationResponse.json().catch(() => ({})) as { authorized?: boolean; itemIds?: string[]; items?: number; error?: string };\n    if (!authorizationResponse.ok || !authorizationPayload.authorized) {\n      setResults([{\n        itemId: "authorization",\n        status: "failed",\n        kind: "permission",\n        label: "Produção não autorizada",\n        detail: authorizationPayload.error ?? "Somente Administradores ou usuários com permissão explícita de Marketing podem iniciar produção com IA.",\n      }]);\n      return;\n    }\n    const authorizedIds = new Set(authorizationPayload.itemIds ?? []);\n    const maxAllowed = Math.max(0, Math.min(10, availableGenerations, authorizationPayload.items ?? 10));\n    const queue = eligible.filter((item) => authorizedIds.has(item.id)).slice(0, maxAllowed);\n    if (queue.length === 0) return;`,
      "permission gate and safe batch",
    );
    contents = replaceExact(
      contents,
      `      sessionStorage.setItem(\`\${AUTO_KEY_PREFIX}\${plan.id}\`, new Date().toISOString());`,
      `      sessionStorage.setItem(\`\${AUTO_KEY_PREFIX}\${plan.id}\`, \`manual:\${queue.length}:\${availableGenerations}\`);`,
      "manual snapshot",
    );
    contents = replaceExact(
      contents,
      `        } catch (error) {\n          failed += 1;\n          output.push({ itemId: item.id, status: "failed", kind: item.tipo, label: item.temaSugerido, detail: error instanceof Error ? error.message : "Falha na produção" });\n        }\n        done += 1;`,
      `        } catch (error) {\n          if (error instanceof Error && error.message.startsWith("quota_exhausted:")) {\n            setAvailableGenerations(0);\n            return;\n          }\n          failed += 1;\n          output.push({ itemId: item.id, status: "failed", kind: item.tipo, label: item.temaSugerido, detail: error instanceof Error ? error.message : "Falha na produção" });\n        }\n        done += 1;`,
      "stop worker at quota",
    );
    contents = replaceExact(
      contents,
      `  }, [load, materializeOne, missing, plan, running]);`,
      `  }, [availableGenerations, load, materializeOne, missing, plan, running, tenantId]);`,
      "runAll deps",
    );
    contents = replaceExact(
      contents,
      `  useEffect(() => {\n    if (!onPlanQueue || !plan || plan.conteudo.statusPlanejamento !== "aprovado" || missing.length === 0 || running || startingRef.current) return;\n    let alreadyStarted = false;\n    try { alreadyStarted = Boolean(sessionStorage.getItem(\`\${AUTO_KEY_PREFIX}\${plan.id}\`)); } catch {}\n    if (alreadyStarted) return;\n    const timer = window.setTimeout(() => { void runAll(); }, 1200);\n    return () => window.clearTimeout(timer);\n  }, [missing.length, onPlanQueue, plan, runAll, running]);`,
      `  // Segurança de custo: produção nunca inicia ao abrir a tela ou por efeito.\n  // Somente um clique explícito no botão de produção pode chamar runAll().`,
      "disable auto start",
    );
    contents = replaceExact(
      contents,
      `<Play className="h-3.5 w-3.5" /> Produzir plano completo ({missing.length})`,
      `<Play className="h-3.5 w-3.5" /> Produzir lote ({Math.min(missing.filter((item) => item.status === "aprovado" && !item.contentGenerationId).length, 10, availableGenerations)})`,
      "button label",
    );

    return { code: contents, map: null };
  },
};

export default defineConfig({
  base: basePath,
  plugins: [
    superAdminFullVisibilityPlugin,
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
    // Evita deadlock de preload em atualizações: cada import dinâmico carrega seu chunk diretamente.
    modulePreload: false,
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
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          // Peel the Concept pure-logic helpers (lowercase concept*.ts geometry,
          // templates, wall network, etc.) out of the ConceptPlanner entry chunk
          // into a sibling chunk loaded in parallel. Keeps behavior identical and
          // trims the ConceptPlanner chunk under its size budget.
          if (normalized.includes("/src/pages/arch/concept")) return "arch-concept-logic";
          if (!normalized.includes("/node_modules/")) return undefined;
          if (normalized.includes("/html2pdf.js/")) return "vendor-html2pdf";
          if (normalized.includes("/jspdf/")) return "vendor-jspdf";
          if (normalized.includes("/html2canvas/")) return "vendor-html2canvas";
          if (normalized.includes("/xlsx/")) return "vendor-xlsx";
          if (normalized.includes("/recharts/") || normalized.includes("/d3-")) return "vendor-charts";
          if (normalized.includes("/leaflet/") || normalized.includes("/react-leaflet/")) return "vendor-maps";
          if (normalized.includes("/three/")) return "vendor-three";
          if (normalized.includes("/framer-motion/")) return "vendor-motion";
          if (normalized.includes("/react/") || normalized.includes("/react-dom/") || normalized.includes("/scheduler/")) return "vendor-react";
          if (normalized.includes("/@tanstack/")) return "vendor-query";
          if (normalized.includes("/@radix-ui/") || normalized.includes("/lucide-react/")) return "vendor-ui";
          return undefined;
        },
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
        target:
          process.env.VITE_PROXY_API_ORIGIN ||
          process.env.API_ORIGIN ||
          "http://localhost:8080",
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
