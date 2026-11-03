'use client';

/**
 * Mapa interativo do terreno (OpenStreetMap, sem dependência externa).
 *
 * O usuário arrasta/zoom, clica no lote e o clique vira coordenada — que já cria o terreno.
 * A matemática de pixel↔coordenada vive em `mapa.ts` (testada fora do navegador).
 */

import { useMemo, useRef, useState } from 'react';
import { panCentro, pixelDaLocalizacao, tilesDaViewport, zoomAncorado } from './mapa';
import type { LocalizacaoMapa } from './mapa';
import { urlTerreno } from './tiles';

export interface MapaTerrenoProps {
  inicial: LocalizacaoMapa;
  larguraPx?: number;
  alturaPx?: number;
  /** Clique no mapa: coordenada escolhida (cria o terreno). */
  aoEscolher: (local: LocalizacaoMapa) => void;
}

const ZOOM_MIN = 3;
const ZOOM_MAX = 19;

export function MapaTerreno({ inicial, larguraPx = 540, alturaPx = 320, aoEscolher }: MapaTerrenoProps) {
  const [centro, setCentro] = useState<LocalizacaoMapa>(inicial);
  const [zoom, setZoom] = useState(17);
  const [aviso, setAviso] = useState<string | null>(null);
  const arrasto = useRef<{ x: number; y: number; moveu: boolean } | null>(null);

  const tiles = useMemo(
    () => tilesDaViewport(centro, larguraPx, alturaPx, zoom),
    [centro, larguraPx, alturaPx, zoom],
  );

  const localDoEvento = (evento: React.MouseEvent<HTMLDivElement>): LocalizacaoMapa => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    const y = evento.clientY - caixa.top;
    const centroPx = pixelDaLocalizacao(centro, zoom);
    const px = centroPx.x - larguraPx / 2 + x;
    const py = centroPx.y - alturaPx / 2 + y;
    return {
      lat: pixelParaLatLocal(py, zoom),
      lng: pixelParaLngLocal(px, zoom),
    };
  };

  const clicar = (evento: React.MouseEvent<HTMLDivElement>): void => {
    if (arrasto.current !== null && arrasto.current.moveu) return;
    aoEscolher(localDoEvento(evento));
  };

  const usarMinhaLocalizacao = (): void => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      setAviso('Este navegador não expõe geolocalização.');
      return;
    }
    setAviso('Obtendo sua localização…');
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const local = { lat: posicao.coords.latitude, lng: posicao.coords.longitude };
        setCentro(local);
        setAviso(null);
        aoEscolher(local);
      },
      () => setAviso('Permissão de localização negada. Navegue no mapa e clique no lote.'),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const mudarZoom = (delta: number): void => {
    const alvo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta));
    if (alvo === zoom) return;
    setCentro(zoomAncorado(centro, zoom, alvo, { x: larguraPx / 2, y: alturaPx / 2 }, larguraPx, alturaPx));
    setZoom(alvo);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Mapa: clique no lote para criar o terreno"
        onMouseDown={(evento) => {
          arrasto.current = { x: evento.clientX, y: evento.clientY, moveu: false };
        }}
        onMouseMove={(evento) => {
          const atual = arrasto.current;
          if (atual === null) return;
          const dx = evento.clientX - atual.x;
          const dy = evento.clientY - atual.y;
          if (Math.abs(dx) + Math.abs(dy) < 3) return;
          atual.moveu = true;
          atual.x = evento.clientX;
          atual.y = evento.clientY;
          setCentro((atualCentro) => panCentro(atualCentro, dx, dy, zoom));
        }}
        onMouseUp={() => {
          window.setTimeout(() => {
            arrasto.current = null;
          }, 0);
        }}
        onMouseLeave={() => {
          arrasto.current = null;
        }}
        onClick={clicar}
        style={{
          position: 'relative',
          width: larguraPx,
          height: alturaPx,
          overflow: 'hidden',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,.14)',
          background: '#0b1512',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
      >
        {tiles.map(({ tile, esquerda, topo }) => {
          const url = urlTerreno('osm', tile);
          if (url === null) return null;
          return (
            <img
              key={String(tile.z) + '/' + String(tile.x) + '/' + String(tile.y)}
              src={url}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left: esquerda, top: topo, width: 256, height: 256, pointerEvents: 'none' }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 18,
            height: 18,
            marginLeft: -9,
            marginTop: -9,
            borderRadius: '50%',
            border: '2px solid #00c896',
            boxShadow: '0 0 0 2px rgba(0,0,0,.5)',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
        <span style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 9.5, color: 'rgba(255,255,255,.75)', textShadow: '0 1px 2px #000' }}>
          © OpenStreetMap contributors
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => mudarZoom(1)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#e6eeea', cursor: 'pointer', fontSize: 12 }}>
          +
        </button>
        <button type="button" onClick={() => mudarZoom(-1)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#e6eeea', cursor: 'pointer', fontSize: 12 }}>
          −
        </button>
        <button type="button" onClick={usarMinhaLocalizacao} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,200,150,.3)', background: 'rgba(0,200,150,.1)', color: '#00c896', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}>
          Usar Minha Localização
        </button>
        <a
          href="https://maps.google.com"
          target="_blank"
          rel="noreferrer"
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#cfe0da', fontSize: 11.5, textDecoration: 'none' }}
        >
          Google Maps ↗
        </a>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 10.5, color: '#8fa39c' }}>
          zoom {zoom} · {centro.lat.toFixed(5)}, {centro.lng.toFixed(5)}
        </span>
      </div>

      {aviso !== null ? <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#fca5a5' }}>{aviso}</p> : null}
    </div>
  );
}

// Reexport local para evitar string longa de import na conversão de pixel.
function pixelParaLatLocal(py: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * py) / (256 * Math.pow(2, zoom));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function pixelParaLngLocal(px: number, zoom: number): number {
  return (px / (256 * Math.pow(2, zoom))) * 360 - 180;
}
