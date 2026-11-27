import { type EscalaState } from "./escala-ab";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ORDEM_SETORES = ["Cozinha", "Salão", "Confeitaria", "Quiosque"];

function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mesLabel(start: string): string {
  const d = new Date(`${start}T12:00:00`);
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function diasDoMes(start: string) {
  const base = new Date(`${start}T12:00:00`);
  const ano = base.getFullYear();
  const mes = base.getMonth();
  const total = new Date(ano, mes + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => {
    const data = new Date(ano, mes, i + 1, 12);
    const semana = data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
    return { indice: i, dia: String(i + 1).padStart(2, "0"), mes: String(mes + 1).padStart(2, "0"), semana };
  });
}

function setoresVisiveis(estado: EscalaState, setor?: string): string[] {
  if (setor && setor !== "Todos") return [setor];
  const presentes = new Set(estado.staff.map((s) => s.sector));
  return ORDEM_SETORES.filter((s) => presentes.has(s));
}

function origem(): string {
  return typeof location !== "undefined" ? location.origin : "";
}

function cabecalho(titulo: string, subtitulo: string, paisagem: boolean): string {
  return `<header>
    <img src="${origem()}/logo-full-light.svg" alt="Vendor.ai" />
    <div>
      <h1>${esc(titulo)}</h1>
      <div class="meta">${esc(subtitulo)}</div>
    </div>
  </header>`;
}

function estilos(paisagem: boolean): string {
  return `<style>
    @page { size: A4 ${paisagem ? "landscape" : "portrait"}; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; }
    .setor { page-break-inside: auto; }
    .setor:not(:last-child) { page-break-after: always; }
    header { display: block; border-bottom: 2px solid #b8860b; padding-bottom: 5px; margin-bottom: 8px; }
    header img { height: 20px; width: auto; display: block; margin-bottom: 3px; }
    h1 { font-size: 13pt; margin: 0; }
    h2 { font-size: 10pt; margin: 8px 0 4px; color: #7a5c00; text-transform: uppercase; letter-spacing: .04em; }
    .meta { font-size: 7.5pt; color: #444; margin-top: 2px; }
    .sub { font-size: 8pt; color: #333; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5pt; }
    th, td { border: .5px solid #8a8a8a; padding: 1.5px 2px; vertical-align: middle; overflow: hidden; }
    th { background: #f1e3b8; font-weight: 600; }
    th.dia, td.dia { text-align: center; padding: 1px; }
    th.dia small { display: block; font-weight: 400; font-size: 5.5pt; color: #555; }
    td.f { background: #f4d06f; font-weight: 700; text-align: center; }
    td.t { text-align: center; color: #777; }
    .nome { min-width: 120px; font-weight: 600; }
    .rodape { margin-top: 6px; font-size: 7pt; color: #555; display: flex; justify-content: space-between; gap: 12px; }
    .folgas td.datas { font-size: 7pt; }
    .folgas td.num { text-align: center; font-weight: 700; }
    .total { background: #f7f0da; font-weight: 700; }
  </style>`;
}

/** HTML imprimível da escala mensal (T/F), uma página por setor. */
export function htmlEscala(estado: EscalaState, setor?: string): string {
  const dias = diasDoMes(estado.start);
  const setores = setoresVisiveis(estado, setor);
  const emitido = new Date().toLocaleString("pt-BR");
  const blocos = setores.map((s) => {
    const pessoas = estado.staff.filter((p) => p.sector === s);
    const linhas = pessoas.map((p) => {
      const celulas = dias.map((d) => {
        const v = p.schedule[d.indice] === "T" ? "T" : "F";
        return `<td class="dia ${v === "F" ? "f" : "t"}">${v === "F" ? "F" : ""}</td>`;
      }).join("");
      return `<tr>
        <td class="nome">${esc(p.name || "Sem nome")}</td>
        <td>${esc(p.sector)} ${esc(p.shift)}</td>
        <td>${esc(p.regime)}</td>
        <td>${esc(p.start)}–${esc(p.end)}</td>
        ${celulas}
      </tr>`;
    }).join("");
    const folgas = pessoas.reduce((total, p) => total + dias.filter((d) => p.schedule[d.indice] !== "T").length, 0);
    return `<section class="setor">
      ${cabecalho(`Escala A&B — ${mesLabel(estado.start)}`, `Setor: ${s} · ${pessoas.length} colaborador(es) · emitido em ${emitido}`, true)}
      <table>
        <colgroup><col style="width:14%"><col style="width:8%"><col style="width:8%"><col style="width:9%">${dias.map(() => `<col style="width:${(61 / dias.length).toFixed(3)}%">`).join("")}</colgroup>
        <thead><tr>
          <th class="nome">Colaborador</th><th>Setor / turno</th><th>Regime</th><th>Horário</th>
          ${dias.map((d) => `<th class="dia">${d.dia}<small>${d.semana}</small></th>`).join("")}
        </tr></thead>
        <tbody>${linhas || `<tr><td colspan="${4 + dias.length}">Nenhum colaborador neste setor.</td></tr>`}</tbody>
      </table>
      <div class="rodape"><span>Legenda: F = folga · T = trabalha.</span><span>${folgas} folga(s) no mês.</span></div>
    </section>`;
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Escala A&B — ${esc(mesLabel(estado.start))}</title>${estilos(true)}</head><body>${blocos.join("")}</body></html>`;
}

/** HTML imprimível das folgas do mês, com datas e total por setor. */
export function htmlFolgas(estado: EscalaState, setor?: string): string {
  const dias = diasDoMes(estado.start);
  const setores = setoresVisiveis(estado, setor);
  const emitido = new Date().toLocaleString("pt-BR");
  const blocos = setores.map((s) => {
    const pessoas = estado.staff.filter((p) => p.sector === s);
    let totalSetor = 0;
    const linhas = pessoas.map((p) => {
      const folgas = dias.filter((d) => p.schedule[d.indice] !== "T");
      totalSetor += folgas.length;
      const datas = folgas.map((d) => `${d.dia}/${d.mes} ${d.semana}`).join(" · ") || "—";
      return `<tr>
        <td class="nome">${esc(p.name || "Sem nome")}</td>
        <td>${esc(p.sector)} ${esc(p.shift)}</td>
        <td>${esc(p.regime)}</td>
        <td class="num">${folgas.length}</td>
        <td class="datas">${datas}</td>
      </tr>`;
    }).join("");
    return `<section class="setor">
      ${cabecalho(`Folgas — ${mesLabel(estado.start)}`, `Setor: ${s} · ${pessoas.length} colaborador(es) · emitido em ${emitido}`, false)}
      <table class="folgas">
        <colgroup><col style="width:28%"><col style="width:18%"><col style="width:18%"><col style="width:8%"><col style="width:28%"></colgroup>
        <thead><tr><th>Colaborador</th><th>Setor / turno</th><th>Regime</th><th>Folgas</th><th>Datas</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="5">Nenhum colaborador neste setor.</td></tr>`}
          <tr class="total"><td colspan="3">Total do setor</td><td class="num">${totalSetor}</td><td></td></tr>
        </tbody>
      </table>
      <div class="rodape"><span>Folgas do mês de ${esc(mesLabel(estado.start))}.</span><span>Conferir com o RH antes de publicar.</span></div>
    </section>`;
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Folgas — ${esc(mesLabel(estado.start))}</title>${estilos(false)}</head><body>${blocos.join("")}</body></html>`;
}

/** Abre a impressão em iframe oculto (sem popup). */
export function imprimirHtml(html: string): void {
  if (typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const remover = () => iframe.remove();
  win?.addEventListener("afterprint", remover, { once: true });
  setTimeout(() => {
    try {
      win?.focus();
      win?.print();
    } catch {
      remover();
    }
  }, 600);
  setTimeout(remover, 60000);
}
