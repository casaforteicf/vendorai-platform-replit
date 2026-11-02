/**
 * Datas do módulo A&B.
 *
 * O fuso do hotel é o local do navegador. `new Date().toISOString().slice(0, 10)`
 * parece inofensivo, mas devolve o dia em UTC: no Brasil (UTC-3), a partir das 21h
 * o registro de sobra cairia no dia seguinte — e um fechamento de dia errado é
 * praticamente impossível de auditar depois.
 */

/** Data local de hoje no formato `yyyy-mm-dd` (o que `<input type="date">` espera). */
export function hojeISO(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** `2026-11-02` → `02/11/2026`. Devolve a entrada se não for uma data válida. */
export function formatarDataBR(iso: string): string {
  if (!iso) return "";
  const data = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString("pt-BR");
}
