import type { SpecObject } from "./specCatalogTypes";
import { getAuthHeaders } from "./specCatalogUtils";

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(value?: number | null, suffix = "") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${suffix}`;
}

function measurementSummary(item: SpecObject) {
  const parts = [
    item.areaM2 ? `${fmt(item.areaM2)} m²` : null,
    item.perimeterM ? `${fmt(item.perimeterM)} m perímetro` : null,
    item.volumeM3 ? `${fmt(item.volumeM3)} m³` : null,
    item.lengthMm ? `C ${fmt(item.lengthMm)} mm` : null,
    item.widthMm ? `L ${fmt(item.widthMm)} mm` : null,
    item.heightMm ? `A ${fmt(item.heightMm)} mm` : null,
    item.depthMm ? `P ${fmt(item.depthMm)} mm` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

function purchaseSummary(item: SpecObject) {
  const quantity = item.purchaseQuantity ?? item.quantity;
  const unit = item.purchaseUnit || item.unit || "un";
  const extras = [
    item.wasteFactor ? `perda ${fmt(item.wasteFactor)}%` : null,
    item.packageYield ? `rendimento ${fmt(item.packageYield)}` : null,
  ].filter(Boolean);
  return `${fmt(quantity)} ${esc(unit)}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
}

async function tenantBrand(tenantId?: string | null) {
  if (!tenantId) return { name: "ARQDOR", logoUrl: "", primaryColor: "#111827" };
  try {
    const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, { headers: getAuthHeaders() });
    if (!response.ok) return { name: "ARQDOR", logoUrl: "", primaryColor: "#111827" };
    const raw = await response.json();
    const rawColor = String(raw?.corPrimaria || raw?.cor_primaria || "");
    return {
      name: raw?.name || raw?.nome || "ARQDOR",
      logoUrl: raw?.logoUrl || raw?.logo_url || "",
      primaryColor: /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#111827",
    };
  } catch {
    return { name: "ARQDOR", logoUrl: "", primaryColor: "#111827" };
  }
}

export async function printSpecification(params: {
  tenantId?: string | null;
  projectTitle: string;
  items: SpecObject[];
}) {
  const brand = await tenantBrand(params.tenantId);
  const printable = params.items
    .filter((item) => item.status !== "archived" && item.revisionImpact !== "removed")
    .sort((a, b) =>
      String(a.region || "").localeCompare(String(b.region || ""), "pt-BR")
      || String(a.category || "").localeCompare(String(b.category || ""), "pt-BR")
      || a.name.localeCompare(b.name, "pt-BR"),
    );

  const rows = printable.map((item) => `
    <tr>
      <td>
        <strong>${esc(item.name)}</strong>
        <div class="muted">${esc(item.description || "")}</div>
        <div class="muted">${esc([item.productName, item.materialName, item.manufacturerName].filter(Boolean).join(" · "))}</div>
      </td>
      <td>${esc(item.region || "—")}</td>
      <td>${esc(item.category || "—")}</td>
      <td>
        ${fmt(item.quantity)} ${esc(item.unit)}
        <div class="muted">${measurementSummary(item)}</div>
      </td>
      <td>${purchaseSummary(item)}</td>
      <td>
        ${esc(item.projectRevision || item.measurementRevision || "—")}
        <div class="muted">${esc(item.measurementSource || "")}</div>
      </td>
      <td>${item.technicalApprovalStatus === "approved" ? "Aprovado" : "Pendente"}</td>
    </tr>
  `).join("");

  const createdAt = new Date().toLocaleString("pt-BR");
  const win = window.open("", "_blank");
  if (!win) throw new Error("O navegador bloqueou a janela de impressão.");
  try { win.opener = null; } catch { /* browser may block assignment */ }

  win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Especificação — ${esc(params.projectTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, Arial, sans-serif; color: #111827; background: #fff; }
  header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; border-bottom:3px solid ${esc(brand.primaryColor)}; padding-bottom:14px; margin-bottom:18px; }
  .brand { display:flex; align-items:center; gap:14px; }
  .brand img { max-width:180px; max-height:58px; object-fit:contain; }
  h1 { margin:0; font-size:24px; }
  .muted { margin-top:4px; color:#6b7280; font-size:11px; line-height:1.35; }
  .meta { text-align:right; font-size:11px; color:#6b7280; }
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  th { background:#f3f4f6; text-align:left; padding:9px 8px; border-bottom:1px solid #d1d5db; font-size:9px; text-transform:uppercase; letter-spacing:.04em; }
  td { padding:9px 8px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
  footer { margin-top:18px; display:flex; justify-content:space-between; gap:20px; color:#6b7280; font-size:9px; }
</style>
</head>
<body>
<header>
  <div class="brand">
    ${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}">` : ""}
    <div><div class="muted">${esc(brand.name)}</div><h1>Especificação técnica</h1><div class="muted">${esc(params.projectTitle)}</div></div>
  </div>
  <div class="meta">Gerado em ${esc(createdAt)}<br>${printable.length} item(ns)</div>
</header>
<table>
<thead><tr><th>Item</th><th>Ambiente</th><th>Categoria</th><th>Quantidade / medidas</th><th>Compra</th><th>Revisão</th><th>Aprovação</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7">Nenhum item disponível.</td></tr>'}</tbody>
</table>
<footer>
  <span>Documento gerado a partir da especificação vigente do projeto.</span>
  <span>Valores internos de custo não são exibidos.</span>
</footer>
<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script>
</body></html>`);
  win.document.close();
}
