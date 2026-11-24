/**
 * Terreno — leitura de localização (lat/long ou link de mapa).
 *
 * Aceita colar coordenadas, link do Google Maps, link do OpenStreetMap ou `geo:`.
 * Nada de rede aqui: é só interpretação, e por isso é testável.
 */

export interface Localizacao {
  lat: number;
  lng: number;
  /** Zoom quando o link informa (Google usa 17z etc.). */
  zoom?: number;
}

export type ErroLocalizacao = 'VAZIO' | 'FORMATO_INVALIDO' | 'COORDENADA_FORA_DA_FAIXA';

export type ResultadoLocalizacao =
  | { ok: true; localizacao: Localizacao }
  | { ok: false; erro: ErroLocalizacao };

const NUM = '-?\\d+(?:[.,]\\d+)?';

function paraNumero(bruto: string): number {
  return Number(bruto.replace(',', '.'));
}

function validar(lat: number, lng: number, zoom?: number): ResultadoLocalizacao {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, erro: 'FORMATO_INVALIDO' };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, erro: 'COORDENADA_FORA_DA_FAIXA' };
  }
  if (zoom !== undefined && (!Number.isFinite(zoom) || zoom < 1 || zoom > 22)) {
    return { ok: false, erro: 'FORMATO_INVALIDO' };
  }
  return { ok: true, localizacao: zoom === undefined ? { lat, lng } : { lat, lng, zoom } };
}

export function interpretarLocalizacao(entrada: string): ResultadoLocalizacao {
  const texto = entrada.trim();
  if (texto.length === 0) return { ok: false, erro: 'VAZIO' };

  // Google Maps: .../@-23.5505,-46.6333,17z/...
  const arroba = texto.match(new RegExp('@(' + NUM + '),(' + NUM + ')(?:,(\\d+(?:[.,]\\d+)?)z)?'));
  if (arroba !== null) {
    return validar(paraNumero(arroba[1]), paraNumero(arroba[2]), arroba[3] === undefined ? undefined : paraNumero(arroba[3]));
  }

  // Google/OSM com parâmetro: ?q=lat,lng · &query=lat,lng · &ll=lat,lng · &mlat=&mlon=
  const consulta = texto.match(new RegExp('[?&](?:q|query|ll|center)=' + '(' + NUM + '),(' + NUM + ')', 'i'));
  if (consulta !== null) return validar(paraNumero(consulta[1]), paraNumero(consulta[2]));

  const osm = texto.match(new RegExp('[?&]mlat=(' + NUM + ')[^\\d-]*[?&]mlon=(' + NUM + ')', 'i'));
  if (osm !== null) return validar(paraNumero(osm[1]), paraNumero(osm[2]));

  // geo:-23.55,-46.63
  const geo = texto.match(new RegExp('^geo:(' + NUM + '),(' + NUM + ')', 'i'));
  if (geo !== null) return validar(paraNumero(geo[1]), paraNumero(geo[2]));

  // Coordenadas soltas: "-23.5505, -46.6333" ou "−23,5505; −46,6333"
  const soltas = texto.match(new RegExp('^(' + NUM + ')\\s*[,;\\s]\\s*(' + NUM + ')$'));
  if (soltas !== null) return validar(paraNumero(soltas[1]), paraNumero(soltas[2]));

  return { ok: false, erro: 'FORMATO_INVALIDO' };
}
