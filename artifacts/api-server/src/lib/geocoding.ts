/**
 * Geocodificação de endereço e cálculo de distância — usa Nominatim
 * (OpenStreetMap), gratuito, mesma família de serviço já usada no mapa ao
 * vivo de Fretes (Leaflet/OSM). Sem chave paga, mas tem limite de uso justo
 * (1 req/s) — por isso sempre prefira coordenadas já salvas quando existirem
 * em vez de geocodificar de novo.
 */

interface LatLng {
  lat: number;
  lng: number;
}

/** Geocodifica um endereço em texto. Retorna null se não encontrar ou em caso de erro (nunca lança). */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!address?.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VendorAI-Fretes/1.0 (contato@appvendorai.com)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = data[0];
    if (!first) return null;
    return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
  } catch {
    return null;
  }
}

/**
 * Mesma coisa, mas nunca deixa quem chamou refém da latência (ou de um
 * travamento) do Nominatim — usado em qualquer fluxo que não pode
 * bloquear a resposta esperando geocoding (ex: criação de lead/vendedor).
 * Timeout = resultado null, cai pro comportamento sem coordenadas.
 */
export async function geocodeAddressWithTimeout(address: string, ms = 2500): Promise<LatLng | null> {
  try {
    return await Promise.race([
      geocodeAddress(address),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

/** Distância em km entre dois pontos (fórmula de Haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Cotação automática simples: taxa base + valor por km rodado + valor por kg.
 * É uma estimativa de ponto de partida — o despachante sempre pode editar o
 * valor final antes de aprovar. Parâmetros calibráveis por enquanto fixos;
 * dá pra virar configuração por tenant depois se precisar.
 */
export function estimarValorFrete(distanciaKm: number, pesoKg: number | null): number {
  const TAXA_BASE = 15;
  const POR_KM = 1.8;
  const POR_KG = pesoKg && pesoKg > 50 ? 0.05 : 0; // só cobra por peso acima de 50kg
  const valor = TAXA_BASE + distanciaKm * POR_KM + (pesoKg ?? 0) * POR_KG;
  return Math.round(valor * 100) / 100;
}

/** ETA em minutos, assumindo velocidade média urbana de 30km/h. */
export function estimarEtaMinutos(distanciaKm: number): number {
  const VELOCIDADE_MEDIA_KMH = 30;
  return Math.round((distanciaKm / VELOCIDADE_MEDIA_KMH) * 60);
}
