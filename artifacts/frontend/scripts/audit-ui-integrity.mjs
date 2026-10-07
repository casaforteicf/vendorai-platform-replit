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

function balancedCall(source, start) {
  const open = source.indexOf("(", start);
  if (open < 0) return null;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return { start, end: i + 1, text: source.slice(start, i + 1) };
    }
  }
  return null;
}

function generatedMutateAsyncCalls(source) {
  const hooks = new Map();

  const destructured = /\bconst\s*\{[^}]*\bmutateAsync(?:\s*:\s*([A-Za-z_$][\w$]*))?[^}]*\}\s*=\s*(use[A-Z][A-Za-z0-9_$]*)\s*\(/g;
  for (const match of source.matchAll(destructured)) {
    if (match[2] === "useMutation") continue;
    hooks.set(match[1] || "mutateAsync", { hook: match[2], mode: "function" });
  }

  const objectDeclaration = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(use[A-Z][A-Za-z0-9_$]*)\s*\(/g;
  for (const match of source.matchAll(objectDeclaration)) {
    if (match[2] === "useMutation") continue;
    hooks.set(match[1], { hook: match[2], mode: "object" });
  }

  const calls = [];
  for (const [variable, metadata] of hooks) {
    const re = metadata.mode === "function"
      ? new RegExp("\\b" + escRegex(variable) + "\\s*\\(", "g")
      : new RegExp("\\b" + escRegex(variable) + "\\.mutateAsync\\s*\\(", "g");
    for (const callMatch of source.matchAll(re)) {
      const call = balancedCall(source, callMatch.index);
      if (call) calls.push({ ...call, variable, hook: metadata.hook });
    }
  }
  return calls;
}

function generatedMutationCalls(source) {
  const hooks = new Map();
  const declaration = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(use(?:Create|Update|Delete|Upsert|Patch|Post|Put)[A-Za-z0-9_$]*)\s*\(/g;
  for (const match of source.matchAll(declaration)) {
    const declarationCall = balancedCall(source, source.indexOf(match[2], match.index));
    hooks.set(match[1], { hook: match[2], hasConfiguredError: Boolean(declarationCall && /\bonError\s*:/.test(declarationCall.text)) });
  }

  const destructured = /\bconst\s*\{\s*mutate\s*:\s*([A-Za-z_$][\w$]*)[^}]*\}\s*=\s*(use(?:Create|Update|Delete|Upsert|Patch|Post|Put)[A-Za-z0-9_$]*)\s*\(/g;
  for (const match of source.matchAll(destructured)) {
    const declarationCall = balancedCall(source, source.indexOf(match[2], match.index));
    hooks.set(match[1], { hook: match[2], mode: "function", hasConfiguredError: Boolean(declarationCall && /\bonError\s*:/.test(declarationCall.text)) });
  }

  const calls = [];
  for (const [variable, metadata] of hooks) {
    const re = metadata.mode === "function"
      ? new RegExp("\\b" + escRegex(variable) + "\\s*\\(", "g")
      : new RegExp("\\b" + escRegex(variable) + "\\.mutate\\s*\\(", "g");
    for (const match of source.matchAll(re)) {
      const call = balancedCall(source, match.index);
      if (call) calls.push({ ...call, variable, hook: metadata.hook, hasConfiguredError: metadata.hasConfiguredError });
    }
  }
  return calls;
}

function fetchCalls(source) {
  const calls = [];
  const re = /\bfetch\s*\(/g;
  for (const match of source.matchAll(re)) {
    const start = match.index;
    const open = source.indexOf("(", start);
    if (open < 0) continue;
    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = -1;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end > open) calls.push({ start, end, text: source.slice(start, end) });
  }
  return calls;
}

const files = walk(root);
const appRoutesSource = fs.readFileSync(appRoutesPath, "utf8");
const routeLiterals = [...appRoutesSource.matchAll(/<Route\s+path=["\']([^"\']+)["\']/g)].map((m) => normalizeRoute(m[1])).filter(Boolean);
const routeRegexes = routeLiterals.map(routePatternToRegex);
const dynamicRoutePrefixes = routeLiterals
  .filter((route) => route.includes("/:"))
  .map((route) => normalizeRoute(route.slice(0, route.indexOf("/:"))))
  .filter(Boolean);

function isDomSelectorLiteral(source, index) {
  const before = source.slice(Math.max(0, index - 160), index);
  return /(?:querySelector(?:All)?|closest|matches)\s*\(\s*["'][^"']*$/.test(before);
}

function matchesDeclaredRoute(target) {
  if (routeRegexes.some((rx) => rx.test(target))) return true;
  return dynamicRoutePrefixes.includes(target);
}

const findings = [];
const metrics = { filesScanned: files.length, pageFiles: 0, componentFiles: 0, moduleFiles: 0, nativeButtons: 0, uiButtons: 0, mutationFetches: 0, generatedMutationCalls: 0, generatedMutateAsyncCalls: 0, staticNavigations: 0 };

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
  for (const m of source.matchAll(/\bon[A-Z][A-Za-z0-9_]*\s*=\s*\{\s*\([^)]*\)\s*=>\s*\{\s*\}\s*\}/g)) add("HIGH", "noop-callback-prop", file, m.index, source, "Callback de interação foi conectado a uma função vazia.");
  for (const m of source.matchAll(/href\s*=\s*["\']#["\']/g)) add("BLOCKER", "hash-link", file, m.index, source, "Link aponta para # e não executa navegação real.");
  for (const m of source.matchAll(/disabled\s*=\s*\{\s*true\s*\}/g)) add("HIGH", "hard-disabled", file, m.index, source, "Controle está permanentemente desabilitado.");
  const unfinishedPatterns = [
    /(?:coming soon|not (?:yet )?implemented|não implementad[oa]|funcionalidade indisponível)/gi,
    /(?:disponível|integração|recurso|função|funcionalidade|suporte|export(?:ação)?|import(?:ação)?)\s+(?:em breve|brevemente)/gi,
    /(?:em breve|brevemente)\s+(?:disponível|integrado|implementado|suportado)/gi,
  ];
  for (const re of unfinishedPatterns) {
    for (const m of source.matchAll(re)) add("MEDIUM", "unfinished-copy", file, m.index, source, "Texto sugere função/tela incompleta.");
  }

  for (const formMatch of source.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const formSource = formMatch[0];
    const base = formMatch.index;
    for (const m of formSource.matchAll(/<button\b(?![^>]*\btype\s*=)[^>]*>/g)) add("HIGH", "native-button-no-type-in-form", file, base + m.index, source, "Button nativo dentro de form sem type pode disparar submit acidental.");
    for (const m of formSource.matchAll(/<Button\b(?![^>]*\btype\s*=)(?=[^>]*\bonClick\s*=)[^>]*>/g)) add("HIGH", "ui-button-no-type-in-form", file, base + m.index, source, "Button com onClick dentro de form sem type pode executar ação e submit ao mesmo tempo.");
  }

  for (const call of generatedMutateAsyncCalls(source)) {
    metrics.generatedMutateAsyncCalls++;
    const before = source.slice(Math.max(0, call.start - 700), call.start);
    const after = source.slice(call.end, Math.min(source.length, call.end + 1600));
    const guardedByTry = /\btry\s*\{[\s\S]*$/.test(before);
    const handledCatch = /\bcatch\s*\([^)]*\)\s*\{[\s\S]{0,1000}?(?:toast\s*\(|setError|set[A-Z][A-Za-z0-9_]*Error)/.test(after);
    const explicitlyPropagated = /ui-integrity:\s*error-propagates-to-caller/.test(before.slice(-260));
    if (!(guardedByTry && handledCatch) && !explicitlyPropagated) {
      add("HIGH", "generated-mutate-async-without-visible-error", file, call.start, source, call.hook + " executa mutateAsync sem try/catch com feedback visível nem propagação explícita para caller protegido.");
    }
  }

  for (const call of generatedMutationCalls(source)) {
    metrics.generatedMutationCalls++;
    const follow = source.slice(call.end, Math.min(source.length, call.end + 900));
    const nearby = call.text + follow;
    const callbackHasError = /\bonError\s*:/.test(call.text);
    const renderedError = new RegExp("\\b" + escRegex(call.variable) + "\\.(?:error|isError)\\b").test(nearby);
    if (!call.hasConfiguredError && !callbackHasError && !renderedError) {
      add("HIGH", "generated-mutation-without-visible-error", file, call.start, source, call.hook + " executa .mutate(...) sem onError nem erro renderizado próximo.");
    }
  }

  for (const call of fetchCalls(source)) {
    const method = call.text.match(/method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/i)?.[1]?.toUpperCase();
    if (!method) continue;
    metrics.mutationFetches++;
    const follow = source.slice(call.end, Math.min(source.length, call.end + 1400));
    const nearby = call.text + follow;
    const hasHttpStatusCheck = /(?:response|res|result|r)\.ok\b|(?:response|res|result|r)\.status\b|parseResponse\s*\(|readJson\s*\(|apiJson\s*\(|apiFetch\s*\(/.test(nearby);
    const hasVisibleErrorHandling = /toast\s*\(|catch\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,700}?(?:toast|setError|set[A-Z][A-Za-z0-9_]*Error)|\.(?:error|isError)\b/.test(nearby);
    if (!hasHttpStatusCheck) add("HIGH", "mutation-without-http-status-check", file, call.start, source, method + " fetch não valida response.ok/status antes de considerar sucesso.");
    else if (!hasVisibleErrorHandling) add("HIGH", "mutation-without-visible-error-check", file, call.start, source, method + " fetch valida HTTP, mas não possui tratamento de erro visível próximo.");
  }

  const navPatterns = [
    /(?:href|to)\s*=\s*["\'](\/[^"\'{}]+)["\']/g,
    /(?:setLocation|navigate)\(\s*["\'](\/[^"\']+)["\']/g,
    /window\.location\.(?:assign|replace)\(\s*["\'](\/[^"\']+)["\']/g,
    /window\.location\.href\s*=\s*["\'](\/[^"\']+)["\']/g,
  ];
  for (const re of navPatterns) {
    for (const m of source.matchAll(re)) {
      if (isDomSelectorLiteral(source, m.index)) continue;
      const target = normalizeRoute(m[1]);
      if (!target || target.startsWith("/api/")) continue;
      metrics.staticNavigations++;
      if (!matchesDeclaredRoute(target)) add("HIGH", "navigation-to-unknown-route", file, m.index, source, "Navegação estática para rota não declarada: " + target);
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
const blockerCount = findings.filter((item) => item.severity === "BLOCKER").length;
const httpContractHighs = findings.filter((item) => item.rule === "mutation-without-http-status-check").length;
const visibleErrorHighs = findings.filter((item) => item.rule === "mutation-without-visible-error-check").length;
const generatedMutationErrorHighs = findings.filter((item) => item.rule === "generated-mutation-without-visible-error").length;
const generatedMutateAsyncErrorHighs = findings.filter((item) => item.rule === "generated-mutate-async-without-visible-error").length;
const unknownRouteHighs = findings.filter((item) => item.rule === "navigation-to-unknown-route").length;
const hardDisabledHighs = findings.filter((item) => item.rule === "hard-disabled").length;
const noopCallbackHighs = findings.filter((item) => item.rule === "noop-callback-prop").length;
const formButtonHighs = findings.filter((item) => item.rule === "native-button-no-type-in-form" || item.rule === "ui-button-no-type-in-form").length;

// Baseline progressivo: o passivo já conhecido não bloqueia o deploy,
// mas qualquer regressão acima dos limites abaixo continua falhando o gate.
// À medida que o passivo for corrigido, estes números devem apenas diminuir.
const blockingBaseline = {
  blockerCount: 0,
  httpContractHighs: 170,
  visibleErrorHighs: 56,
  generatedMutationErrorHighs: 14,
  generatedMutateAsyncErrorHighs: 23,
  // Current main already contains 2 known static-navigation findings; keep blocking any increase.
  unknownRouteHighs: 2,
  hardDisabledHighs: 0,
  noopCallbackHighs: 0,
  formButtonHighs: 0,
};

const blockingCurrent = {
  blockerCount,
  httpContractHighs,
  visibleErrorHighs,
  generatedMutationErrorHighs,
  generatedMutateAsyncErrorHighs,
  unknownRouteHighs,
  hardDisabledHighs,
  noopCallbackHighs,
  formButtonHighs,
};

const regressions = Object.entries(blockingCurrent)
  .filter(([key, value]) => value > blockingBaseline[key])
  .map(([key, value]) => ({ key, value, baseline: blockingBaseline[key] }));

if (regressions.length > 0) {
  console.error("\n[ui-integrity] GATE BLOQUEADO POR REGRESSÃO.");
  for (const regression of regressions) {
    console.error("[ui-integrity] " + regression.key + ": " + regression.value + " (baseline " + regression.baseline + ").");
  }
  console.error("[ui-integrity] Corrija as novas regressões antes de integrar esta mudança.");
  process.exitCode = 1;
} else {
  console.log("\n[ui-integrity] Gate aprovado dentro do baseline progressivo.");
  console.log("[ui-integrity] Dívida conhecida: " + httpContractHighs + " contratos HTTP, " + visibleErrorHighs + " feedbacks de erro, " + generatedMutationErrorHighs + " mutations e " + generatedMutateAsyncErrorHighs + " mutateAsync.");
  console.log("[ui-integrity] Qualquer aumento acima do baseline volta a bloquear o build.");
}
