import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "src");
const appRoutesPath = path.join(root, "AppLegacy.tsx");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(source, index) { return source.slice(0, index).split("\n").length; }
function compact(value) { return value.replace(/\s+/g, " ").trim().slice(0, 260); }
function normalizeRoute(raw) {
  if (!raw || !raw.startsWith("/")) return null;
  const cleaned = raw.split(/[?#]/)[0];
  if (cleaned === "/") return "/";
  return cleaned.replace(/\/+$/, "") || "/";
}
function escRegex(value) { return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&"); }
function routePatternToRegex(route) {
  const parts = route.split("/").filter(Boolean);
  const body = parts.map((part) => part.startsWith(":") ? "[^/]+" : escRegex(part)).join("/");
  return new RegExp("^/" + body + "/?$");
}

const files = walk(root);
const appRoutesSource = fs.readFileSync(appRoutesPath, "utf8");
const routeLiterals = [...appRoutesSource.matchAll(/<Route\s+path=["\']([^"\']+)["\']/g)].map((m) => normalizeRoute(m[1])).filter(Boolean);
const routeRegexes = routeLiterals.map(routePatternToRegex);
const findings = [];
const metrics = { filesScanned: files.length, pageFiles: 0, componentFiles: 0, moduleFiles: 0, nativeButtons: 0, uiButtons: 0, mutationFetches: 0, staticNavigations: 0 };

function add(severity, rule, file, index, source, message) {
  findings.push({ severity, rule, file: path.relative(process.cwd(), file), line: lineOf(source, index), message, snippet: compact(source.slice(Math.max(0, index - 120), Math.min(source.length, index + 360))) });
}

for (const file of files) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  if (rel.startsWith("pages/")) metrics.pageFiles++;
  if (rel.startsWith("components/")) metrics.componentFiles++;
  if (rel.startsWith("modules/")) metrics.moduleFiles++;
  const source = fs.readFileSync(file, "utf8");
  metrics.nativeButtons += (source.match(/<button\b/g) || []).length;
  metrics.uiButtons += (source.match(/<Button\b/g) || []).length;

  for (const m of source.matchAll(/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*(?:\{\s*\}|null|undefined)\s*\}/g)) add("BLOCKER", "empty-click-handler", file, m.index, source, "Botão possui onClick vazio.");
  for (const m of source.matchAll(/href\s*=\s*["\']#["\']/g)) add("BLOCKER", "hash-link", file, m.index, source, "Link aponta para # e não executa navegação real.");
  for (const m of source.matchAll(/disabled\s*=\s*\{\s*true\s*\}/g)) add("HIGH", "hard-disabled", file, m.index, source, "Controle está permanentemente desabilitado.");
  for (const m of source.matchAll(/(?:em breve|coming soon|not implemented|não implementad[oa]|funcionalidade indisponível)/gi)) add("MEDIUM", "unfinished-copy", file, m.index, source, "Texto sugere função/tela incompleta.");

  for (const formMatch of source.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const formSource = formMatch[0];
    const base = formMatch.index;
    for (const m of formSource.matchAll(/<button\b(?![^>]*\btype\s*=)[^>]*>/g)) add("HIGH", "native-button-no-type-in-form", file, base + m.index, source, "Button nativo dentro de form sem type pode disparar submit acidental.");
    for (const m of formSource.matchAll(/<Button\b(?![^>]*\btype\s*=)(?=[^>]*\bonClick\s*=)[^>]*>/g)) add("HIGH", "ui-button-no-type-in-form", file, base + m.index, source, "Button com onClick dentro de form sem type pode executar ação e submit ao mesmo tempo.");
  }

  const mutationRegex = /fetch\s*\(\s*([\s\S]{0,280}?)\s*,\s*\{([\s\S]{0,900}?)method\s*:\s*["\'](POST|PUT|PATCH|DELETE)["\']([\s\S]{0,700}?)\}\s*\)/g;
  for (const m of source.matchAll(mutationRegex)) {
    metrics.mutationFetches++;
    const window = source.slice(m.index, Math.min(source.length, m.index + 1600));
    if (!/(?:response|res|result)\.ok\b|\.status\b|throw\s+new\s+Error|toast\s*\(|catch\s*\(|parseResponse\s*\(|apiJson\s*\(|apiFetch\s*\(/.test(window)) add("HIGH", "mutation-without-visible-error-check", file, m.index, source, m[3] + " fetch sem tratamento de erro visível próximo.");
  }

  const navPatterns = [
    /(?:href|to)\s*=\s*["\'](\/[^"\'{}]+)["\']/g,
    /(?:setLocation|navigate)\(\s*["\'](\/[^"\']+)["\']/g,
    /window\.location\.(?:assign|replace)\(\s*["\'](\/[^"\']+)["\']/g,
    /window\.location\.href\s*=\s*["\'](\/[^"\']+)["\']/g,
  ];
  for (const re of navPatterns) {
    for (const m of source.matchAll(re)) {
      const target = normalizeRoute(m[1]);
      if (!target || target.startsWith("/api/")) continue;
      metrics.staticNavigations++;
      if (!routeRegexes.some((rx) => rx.test(target))) add("HIGH", "navigation-to-unknown-route", file, m.index, source, "Navegação estática para rota não declarada: " + target);
    }
  }
}

const counts = findings.reduce((acc, item) => { acc[item.severity] = (acc[item.severity] || 0) + 1; return acc; }, {});
const grouped = findings.reduce((acc, item) => { acc[item.rule] = (acc[item.rule] || 0) + 1; return acc; }, {});
console.log("\n[ui-integrity] varredura funcional completa");
console.log(JSON.stringify({ metrics, counts, grouped }, null, 2));
const important = findings.filter((item) => item.severity === "BLOCKER" || item.severity === "HIGH").slice(0, 220);
if (important.length) {
  console.log("\n[ui-integrity] achados BLOCKER/HIGH:");
  for (const item of important) {
    console.log("[" + item.severity + "] " + item.rule + " " + item.file + ":" + item.line + " — " + item.message);
    console.log("  " + item.snippet);
  }
}
if (findings.some((item) => item.severity === "BLOCKER")) console.warn("\n[ui-integrity] BLOCKERS encontrados. Etapa 102 permanece em modo relatório até a correção do baseline.");
