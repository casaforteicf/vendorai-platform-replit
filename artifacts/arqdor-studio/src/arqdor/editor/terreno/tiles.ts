/**
 * Terreno — matemática de tiles (slippy map) e URL por provedor.
 *
 * Puro: sem rede. O canvas baixa a imagem; aqui só se calcula qual tile e qual URL.
 */

export type ProvedorTerreno = 'osm' | 'esri' | 'google';

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** Projeção Web Mercator (EPSG:3857) — padrão de OSM/Google/Esri. */
export function lonParaTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

export function latParaTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

export function tileDaLocalizacao(lat: number, lng: number, zoom: number): Tile {
  const n = Math.pow(2, zoom);
  const x = Math.floor(lonParaTileX(lng, zoom));
  const y = Math.floor(latParaTileY(lat, zoom));
  return { z: zoom, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Metros por pixel na latitude, no zoom do tile (256 px por tile). */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export interface OpcoesGoogle {
  chave: string;
  larguraPx: number;
  alturaPx: number;
  centro: { lat: number; lng: number };
  zoom: number;
  maptype?: 'satellite' | 'hybrid' | 'roadmap';
}

/**
 * URL da imagem. Google Static Maps exige chave e devolve a imagem já recortada;
 * OSM/Esri devolvem o tile — o tamanho do plano é calculado com `metrosPorPixel`.
 */
export function urlTerreno(
  provedor: ProvedorTerreno,
  tile: Tile,
  google?: OpcoesGoogle,
): string | null {
  if (provedor === 'osm') return 'https://tile.openstreetmap.org/' + String(tile.z) + '/' + String(tile.x) + '/' + String(tile.y) + '.png';
  if (provedor === 'esri') {
    return (
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' +
      String(tile.z) +
      '/' +
      String(tile.y) +
      '/' +
      String(tile.x)
    );
  }
  if (google === undefined || google.chave.trim().length === 0) return null;
  const centro = String(google.centro.lat) + ',' + String(google.centro.lng);
  return (
    'https://maps.googleapis.com/maps/api/staticmap?center=' +
    encodeURIComponent(centro) +
    '&zoom=' +
    String(google.zoom) +
    '&size=' +
    String(google.larguraPx) +
    'x' +
    String(google.alturaPx) +
    '&maptype=' +
    (google.maptype ?? 'satellite') +
    '&key=' +
    encodeURIComponent(google.chave)
  );
}

/** Atribuição obrigatória por licença. */
export function atribuicaoTerreno(provedor: ProvedorTerreno): string {
  if (provedor === 'osm') return '© OpenStreetMap contributors';
  if (provedor === 'esri') return 'Esri, Maxar, Earthstar Geographics';
  return 'Google Maps';
}
