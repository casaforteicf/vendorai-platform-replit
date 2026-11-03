'use client';

/**
 * Painel de terreno (protótipo de comportamento; o DeepSeek refaz o visual).
 *
 * Não calcula geometria: chama `criarTerreno` (motor) e aplica UMA operação no modelador.
 * Ajuda o usuário a obter as coordenadas: link para o Google Maps + colar da área de transferência.
 */

import { useState } from 'react';
import { useModeladorStore } from '../stores/useModeladorStore';
import { criarTerreno } from './terreno';
import type { ResultadoTerreno } from './terreno';

export interface PainelTerrenoProps {
  aberto: boolean;
  aoFechar: () => void;
  /** Recebe o maior lado do terreno (m) para a câmera enquadrar o lote. */
  aoCriar: (info: { ladoM: number }) => void;
}

const EXEMPLO = '-23.5505, -46.6333';

export function PainelTerreno({ aberto, aoFechar, aoCriar }: PainelTerrenoProps) {
  const [localizacao, setLocalizacao] = useState(EXEMPLO);
  const [resultado, setResultado] = useState<ResultadoTerreno | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  if (!aberto) return null;

  const colar = async (): Promise<void> => {
    try {
      if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
        setAviso('Este navegador não libera a área de transferência aqui. Selecione o campo e use Ctrl+V.');
        return;
      }
      const texto = (await navigator.clipboard.readText()).trim();
      if (texto.length === 0) {
        setAviso('A área de transferência está vazia. Copie as coordenadas no Google Maps.');
        return;
      }
      setLocalizacao(texto);
      setAviso(null);
      setCopiado(texto);
    } catch {
      setAviso('Não foi possível ler a área de transferência (permissão negada). Selecione o campo e use Ctrl+V.');
    }
  };

  const criar = (): void => {
    const id = 'terreno_' + Date.now().toString(36);
    const lido = criarTerreno({ id, localizacao });

    if (!lido.ok) {
      setResultado(null);
      setAviso(
        lido.erro === 'LOCALIZACAO_INVALIDA'
          ? 'Não entendi a localização. Cole coordenadas ("-23.55, -46.63") ou um link do Google/OSM.'
          : lido.erro === 'PROVEDOR_REQUER_CHAVE'
            ? 'Google Static Maps exige chave; use OSM (padrão).'
            : 'Dimensões inválidas.',
      );
      return;
    }

    useModeladorStore.getState().aplicar([{ tipo: 'criar_solido', solido: lido.solido }]);

    // Maior lado do quad para a câmera enquadrar o lote inteiro.
    const xs = lido.solido.vertices.map((vertice) => vertice.posicao[0]);
    const zs = lido.solido.vertices.map((vertice) => vertice.posicao[2]);
    const ladoM = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...zs) - Math.min(...zs),
    );

    setResultado(lido);
    setAviso(null);
    setCopiado(null);
    aoCriar({ ladoM });
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        width: 380,
        maxHeight: '78vh',
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
      aria-label="Terreno por coordenadas"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#00c896' }}>TERRENO</span>
        <button
          type="button"
          onClick={aoFechar}
          style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#9fb3ad', cursor: 'pointer', fontSize: 16 }}
          aria-label="Fechar terreno"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={localizacao}
          onChange={(evento) => setLocalizacao(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              criar();
            }
          }}
          aria-label="Localização do terreno"
          placeholder="-23.5505, -46.6333 ou link do mapa"
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.32)', color: '#fff', font: 'inherit', fontSize: 12 }}
        />
        <button
          type="button"
          onClick={criar}
          style={{ padding: '8px 12px', borderRadius: 8, border: 0, background: '#00c896', color: '#06231b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
        >
          Criar
        </button>
      </div>

      <p style={{ margin: '6px 0 10px', fontSize: 11, color: '#8fa39c', lineHeight: 1.5 }}>
        Copie as coordenadas do Google Maps (botão direito &gt; clicar no número) e cole aqui.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <a
          href="https://maps.google.com"
          target="_blank"
          rel="noreferrer"
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(0,200,150,.3)', background: 'rgba(0,200,150,.1)', color: '#00c896', fontSize: 11.5, fontWeight: 600, textDecoration: 'none' }}
        >
          Abrir no Google Maps ↗
        </a>
        <button
          type="button"
          onClick={() => void colar()}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#e6eeea', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
        >
          Colar Coordenadas
        </button>
      </div>

      {aviso !== null ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#fca5a5', lineHeight: 1.5 }}>{aviso}</p>
      ) : null}

      {copiado !== null ? (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8fa39c' }}>Colado: {copiado.slice(0, 80)}</p>
      ) : null}

      {resultado !== null && resultado.ok ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11.5, lineHeight: 1.5 }}>{resultado.resumo}</p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#8fa39c' }}>
            {resultado.textura.metrosPorPixel} m/px · aplicado como <strong>1 passo</strong> · câmera enquadrada no lote
          </p>
          {resultado.textura.url !== null ? (
            <a href={resultado.textura.url} target="_blank" rel="noreferrer">
              <img
                src={resultado.textura.url}
                alt="Prévia do terreno"
                style={{ width: '100%', borderRadius: 8, display: 'block' }}
                onError={() => setAviso('Imagem do provedor não carregou (rede/bloqueio). A geometria foi criada mesmo assim.')}
              />
            </a>
          ) : (
            <p style={{ margin: 0, fontSize: 11, color: '#fca5a5' }}>Sem URL de imagem para este provedor.</p>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 10.5, color: '#6b7c76' }}>{resultado.textura.atribuicao}</p>
        </div>
      ) : null}
    </div>
  );
}
