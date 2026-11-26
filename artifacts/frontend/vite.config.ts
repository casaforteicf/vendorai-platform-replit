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

export default defineConfig({
  base: basePath,
  plugins: [
    superAdminFullVisibilityPlugin,
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
