import fs from "node:fs";

const [filePath, rawPayload] = process.argv.slice(2);
if (!filePath || !rawPayload) {
  throw new Error("Uso: node scripts/register-changelog.mjs <arquivo> <payload-base64>");
}

const payload = JSON.parse(Buffer.from(rawPayload, "base64").toString("utf8"));
if (!payload.merged || !payload.number || !payload.mergedAt) process.exit(0);

// Achado real (Marcos): virava "novidade" pra CLIENTE mesmo coisa que não
// tem nada a ver com o produto que ele usa -- sincronização de um módulo
// interno separado (TAD), correção de migration, hotfix de deploy. Filtra
// antes de qualquer coisa: se for só isso, nem cria a entrada.
const changedFiles = String(payload.changedFiles || "").split(",").map((f) => f.trim()).filter(Boolean);
const isInternalOnly =
  (changedFiles.length > 0 && changedFiles.every((f) => f.startsWith("tad/"))) ||
  /^(chore|ci|build|test)(\(|:)/i.test(String(payload.title || "")) ||
  /\b(migration|migração|hotfix|redeploy|deploy|sincronizar fonte|sync)\b/i.test(String(payload.title || ""));
if (isInternalOnly) process.exit(0);

const source = fs.readFileSync(filePath, "utf8");
const startMarker = "export const automaticChangelogEntries: AutomaticChangelogEntry[] = ";
const start = source.indexOf(startMarker);
const end = source.indexOf("\n];", start);
if (start < 0 || end < 0) throw new Error("Lista automática não encontrada");

const jsonStart = start + startMarker.length;
const entries = JSON.parse(source.slice(jsonStart, end + 2));
const id = `pr-${payload.number}`;
if (entries.some((entry) => entry.id === id)) process.exit(0);

const body = String(payload.body || "");
const novidadesSection = body.match(/##\s*(?:Novidades|Melhoria|Resultado|Novo comportamento|O que muda)\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1];
const bullets = (novidadesSection || "")
  .split("\n")
  .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
  .filter((line) => line && !line.startsWith("#"))
  .slice(0, 4);

// Sem uma seção explícita escrita em linguagem simples (## Novidades/
// Melhoria/...), não dá pra confiar que o corpo do PR (que é técnico, pra
// quem revisa código) vá virar algo apresentável pro cliente sem IA
// nenhuma resumindo. Nesse caso, não publica nada em vez de arriscar
// mostrar texto técnico -- fica só como PR normal no GitHub.
if (bullets.length === 0) process.exit(0);

const cleanTitle = String(payload.title)
  .replace(/^(feat|fix|refactor|chore)(\([^)]*\))?:\s*/i, "")
  .trim();

const lower = `${payload.title} ${body}`.toLowerCase();
const tipo = /\b(fix|corrig|erro|falha|bug)\b/.test(lower)
  ? "correcao"
  : /\b(melhor|ajust|refactor|aprimor)\b/.test(lower)
    ? "melhoria"
    : "novidade";

entries.unshift({
  id,
  titulo: cleanTitle || `Atualização #${payload.number}`,
  descricao: bullets.join(" "),
  tipo,
  publicadoEm: new Date(payload.mergedAt).toISOString(),
  pullRequest: Number(payload.number),
});

const next = source.slice(0, jsonStart) + JSON.stringify(entries, null, 2) + source.slice(end + 2);
fs.writeFileSync(filePath, next);
