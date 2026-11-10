/**
 * Terreno — matemática do mapa interativo (pixel ↔ coordenada).
 *
 * Sem Leaflet/Google: usa a mesma projeção de tiles (Web Mercator) do `tiles.ts`.
 * Puro, então o mapa pode ser testado sem navegador.
 */

import type { Tile } from './tiles';

export const TAMANHO_TILE = 256;

export interface LocalizacaoMapa {
  lat: number;
  lng: number;
}

export function lonParaPixelX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TAMANHO_TILE * Math.pow(2, zoom);
}

export function latParaPixelY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  const seno = Math.sin(rad);
  return (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * TAMANHO_TILE * Math.pow(2, zoom);
}

export function pixelParaLng(px: number, zoom: number): number {
  return (px / (TAMANHO_TILE * Math.pow(2, zoom))) * 360 - 180;
}

export function pixelParaLat(py: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * py) / (TAMANHO_TILE * Math.pow(2, zoom));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Coordenada de um pixel do MUNDO (não do viewport). */
export function localizacaoDoPixel(px: number, py: number, zoom: number): LocalizacaoMapa {
  return { lat: pixelParaLat(py, zoom), lng: pixelParaLng(px, zoom) };
}

export function pixelDaLocalizacao(local: LocalizacaoMapa, zoom: number): { x: number; y: number } {
  return { x: lonParaPixelX(local.lng, zoom), y: latParaPixelY(local.lat, zoom) };
}

/**
 * Tiles que cobrem a viewport, com o deslocamento em pixels de cada um.
 * `centro` é a coordenada no meio do mapa.
 */
export function tilesDaViewport(
  centro: LocalizacaoMapa,
  larguraPx: number,
  alturaPx: number,
  zoom: number,
): Array<{ tile: Tile; esquerda: number; topo: number }> {
  const centroPx = pixelDaLocalizacao(centro, zoom);
  const limiteX = Math.pow(2, zoom);
  const limiteY = Math.pow(2, zoom);

  const x0 = Math.floor((centroPx.x - larguraPx / 2) / TAMANHO_TILE);
  const x1 = Math.floor((centroPx.x + larguraPx / 2) / TAMANHO_TILE);
  const y0 = Math.floor((centroPx.y - alturaPx / 2) / TAMANHO_TILE);
  const y1 = Math.floor((centroPx.y + alturaPx / 2) / TAMANHO_TILE);

  const tiles: Array<{ tile: Tile; esquerda: number; topo: number }> = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (tx < 0 || ty < 0 || tx >= limiteX || ty >= limiteY) continue;
      tiles.push({
        tile: { z: zoom, x: tx, y: ty },
        esquerda: tx * TAMANHO_TILE - (centroPx.x - larguraPx / 2),
        topo: ty * TAMANHO_TILE - (centroPx.y - alturaPx / 2),
      });
    }
  }
  return tiles;
}

/** Desloca o centro pelo arrasto (em pixels de tela: direita/baixo movem o mapa). */
export function panCentro(centro: LocalizacaoMapa, deltaX: number, deltaY: number, zoom: number): LocalizacaoMapa {
  const px = pixelDaLocalizacao(centro, zoom);
  return localizacaoDoPixel(px.x - deltaX, px.y - deltaY, zoom);
}

/**
 * Zoom ancorado: o ponto que estava sob `ancoraTela` continua sob ela depois do zoom.
 */
export function zoomAncorado(
  centro: LocalizacaoMapa,
  zoomAtual: number,
  novoZoom: number,
  ancoraTela: { x: number; y: number },
  larguraPx: number,
  alturaPx: number,
): LocalizacaoMapa {
  const centroPx = pixelDaLocalizacao(centro, zoomAtual);
  const localAncora = localizacaoDoPixel(
    centroPx.x - larguraPx / 2 + ancoraTela.x,
    centroPx.y - alturaPx / 2 + ancoraTela.y,
    zoomAtual,
  );
  const ancoraNovo = pixelDaLocalizacao(localAncora, novoZoom);
  const centroNovo = {
    x: ancoraNovo.x + larguraPx / 2 - ancoraTela.x,
    y: ancoraNovo.y + alturaPx / 2 - ancoraTela.y,
  };
  return localizacaoDoPixel(centroNovo.x, centroNovo.y, novoZoom);
}
