'use client';

/** Viewport 2D — desenha as Linha2D que o motor já derivou do BIM. Zero geometria aqui. */

import { useEffect, useRef } from 'react';
import type { Linha2D, TipoLinha2D } from '../bim/derivar2d';

const COR: Record<TipoLinha2D, string> = {
  parede: '#4ac59a',
  abertura: '#e0a24a',
  esquadria: '#6ba6e8',
  laje: '#8fa3a0',
  mobiliario: '#b28ce8',
  telhado: '#d08a4a',
};

export interface PropsViewport2D {
  linhas: readonly Linha2D[];
  selecionadoId: string | null;
}

export function Viewport2D({ linhas, selecionadoId }: PropsViewport2D) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas === null || container === null) return;

    const largura = container.clientWidth;
    const altura = Math.max(1, container.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio);
    canvas.width = largura * dpr;
    canvas.height = altura * dpr;
    canvas.style.width = largura + 'px';
    canvas.style.height = altura + 'px';

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, largura, altura);
    ctx.fillStyle = '#171f22';
    ctx.fillRect(0, 0, largura, altura);

    if (linhas.length === 0) {
      ctx.fillStyle = '#aab8b5';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('Sem elementos BIM.', 24, 36);
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const l of linhas) {
      minX = Math.min(minX, l.x1, l.x2);
      maxX = Math.max(maxX, l.x1, l.x2);
      minY = Math.min(minY, l.y1, l.y2);
      maxY = Math.max(maxY, l.y1, l.y2);
    }

    const margem = 32;
    const escala = Math.min((largura - margem * 2) / Math.max(0.001, maxX - minX), (altura - margem * 2) / Math.max(0.001, maxY - minY));
    const deslocarX = (largura - (maxX - minX) * escala) / 2 - minX * escala;
    const deslocarY = (altura - (maxY - minY) * escala) / 2 + maxY * escala;

    const paraTela = (x: number, y: number): [number, number] => [x * escala + deslocarX, deslocarY - y * escala];

    ctx.lineCap = 'round';
    for (const l of linhas) {
      const [x1, y1] = paraTela(l.x1, l.y1);
      const [x2, y2] = paraTela(l.x2, l.y2);
      ctx.beginPath();
      ctx.setLineDash(l.tracejada === true ? [6, 4] : []);
      ctx.strokeStyle = l.elementoId === selecionadoId ? '#4ac59a' : COR[l.tipo];
      ctx.lineWidth = l.tipo === 'parede' ? 3 : l.tipo === 'laje' ? 1.5 : 2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = '#aab8b5';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('escala: ' + escala.toFixed(0) + ' px/m', 12, altura - 12);
  }, [linhas, selecionadoId]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 360 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}