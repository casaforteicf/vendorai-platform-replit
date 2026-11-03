'use client';

/**
 * Painel de terreno com mapa interativo (protótipo de comportamento).
 *
 * O clique no mapa define a coordenada e cria o terreno na hora; a câmera enquadra o lote.
 * Nenhuma geometria é calculada aqui — só `criarTerreno` (motor).
 */

import { useState } from 'react';
import { useModeladorStore } from '../stores/useModeladorStore';
import { MapaTerreno } from './MapaTerreno';
import { criarTerreno } from './terreno';
import type { ResultadoTerreno } from './terreno';

export interface PainelTerrenoProps {
  aberto: boolean;
  aoFechar: () => void;
  /** Recebe o maior lado do terreno (m) para a câmera enquadrar o lote. */
  aoCriar: (info: { ladoM: number }) => void;
}

const INICIAL = { lat: -23.5505, lng: -46.6333 };

export function PainelTerreno({ aberto, aoFechar, aoCriar }: PainelTerrenoProps) {
  const [resultado, setResultado] = useState<ResultadoTerreno | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [largura, setLargura] = useState('20');
  const [profundidade, setProfundidade] = useState('30');

  if (!aberto) return null;

  const numero = (valor: string): number => Number(valor.replace(',', '.'));
  const loteLargura = numero(largura);
  const loteProfundidade = numero(profundidade);

  const criar = (local: { lat: number; lng: number }): void => {
    if (!(loteLargura > 0) || !(loteProfundidade > 0)) {
      setAviso('Informe largura e profundidade maiores que zero.');
      return;
    }
    const id = 'terreno_' + Date.now().toString(36);
    const lido = criarTerreno({
      id,
      localizacao: local.lat.toFixed(6) + ',' + local.lng.toFixed(6),
      largura: loteLargura,
      profundidade: loteProfundidade,
    });

    if (!lido.ok) {
      setResultado(null);
      setAviso(
        lido.erro === 'LOCALIZACAO_INVALIDA'
          ? 'Não foi possível ler a coordenada do clique. Tente de novo.'
          : lido.erro === 'PROVEDOR_REQUER_CHAVE'
            ? 'Google Static Maps exige chave; use OSM (padrão).'
            : 'Dimensões inválidas.',
      );
      return;
    }

    useModeladorStore.getState().aplicar([{ tipo: 'criar_solido', solido: lido.solido }]);

    const xs = lido.solido.vertices.map((vertice) => vertice.posicao[0]);
    const zs = lido.solido.vertices.map((vertice) => vertice.posicao[2]);
    const ladoM = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));

    setResultado(lido);
    setAviso(null);
    aoCriar({ ladoM });
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        width: 588,
        maxHeight: '86vh',
        overflowY: 'auto',
        background: '#0f1f1a',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 12,
        boxShadow: '0 18px 40px rgba(0,0,0,.45)',
        zIndex: 70,
        fontFamily: 'Montserrat, Segoe UI, sans-serif',
        color: '#e6eeea',
        padding: 12,
      }}
      role="dialog"
      aria-label="Terreno por mapa"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#00c896' }}>TERRENO</span>
        <span style={{ fontSize: 10.5, color: '#8fa39c' }}>clique no lote para criar</span>
        <button
          type="button"
          onClick={aoFechar}
          style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#9fb3ad', cursor: 'pointer', fontSize: 16 }}
          aria-label="Fechar terreno"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <label style={{ flex: 1, fontSize: 11, color: '#8fa39c' }}>
          Largura (m)
          <input
            value={largura}
            onChange={(evento) => setLargura(evento.target.value)}
            inputMode="decimal"
            aria-label="Largura do lote em metros"
            style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.32)', color: '#fff', font: 'inherit', fontSize: 12, textAlign: 'right' }}
          />
        </label>
        <label style={{ flex: 1, fontSize: 11, color: '#8fa39c' }}>
          Profundidade (m)
          <input
            value={profundidade}
            onChange={(evento) => setProfundidade(evento.target.value)}
            inputMode="decimal"
            aria-label="Profundidade do lote em metros"
            style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.32)', color: '#fff', font: 'inherit', fontSize: 12, textAlign: 'right' }}
          />
        </label>
      </div>

      <MapaTerreno
        inicial={INICIAL}
        aoEscolher={criar}
        loteMetros={
          loteLargura > 0 && loteProfundidade > 0
            ? { largura: loteLargura, profundidade: loteProfundidade }
            : undefined
        }
      />

      {aviso !== null ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#fca5a5', lineHeight: 1.5 }}>{aviso}</p>
      ) : null}

      {resultado !== null && resultado.ok ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11.5, lineHeight: 1.5 }}>{resultado.resumo}</p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#8fa39c' }}>
            {resultado.textura.metrosPorPixel} m/px · <strong>1 passo</strong> · câmera enquadrada · grade oculta
          </p>
          {resultado.textura.url !== null ? (
            <img
              src={resultado.textura.url}
              alt="Prévia do terreno"
              style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              onError={() => setAviso('Imagem do provedor não carregou (rede/bloqueio). A geometria foi criada mesmo assim.')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
