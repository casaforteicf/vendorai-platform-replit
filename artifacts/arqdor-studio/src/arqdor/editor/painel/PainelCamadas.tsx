'use client';

import { useState } from 'react';
import type { EstadoCamadas } from '../bim/camadas';
import { Icone } from '../design/icones';

export interface PropsPainelCamadas {
  camadas: EstadoCamadas;
  totalObjetos: number;
  aoAplicarModo: (modoId: string) => void;
  aoAlternarCamada: (camadaId: string) => void;
  aoCriarCamada: (nome: string) => void;
  aoRemoverCamada: (camadaId: string) => void;
  aoRevelarTodos: () => void;
}

/** Conteúdo do inspetor direito (300px) — sem wrapper próprio. */
export function PainelCamadas(props: PropsPainelCamadas) {
  const [nome, setNome] = useState('');
  const { camadas } = props;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icone nome="camadas" />
        <span className="arq2-panel-title">Camadas</span>
      </div>

      <div className="arq2-label" style={{ marginBottom: 4 }}>Modos</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {camadas.modos.map((modo) => (
          <button
            key={modo.id}
            type="button"
            className="arq2-tool-button"
            style={{ flex: 1 }}
            aria-pressed={camadas.modoAtivoId === modo.id}
            onClick={() => props.aoAplicarModo(modo.id)}
          >
            {modo.nome}
          </button>
        ))}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {camadas.camadas.map((camada) => (
          <li
            key={camada.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 30,
              padding: '2px 6px',
              borderRadius: 6,
              background: camadas.camadaAtivaId === camada.id ? 'rgba(23,109,89,0.15)' : 'transparent',
            }}
          >
            <input
              type="checkbox"
              checked={camada.visivel}
              onChange={() => props.aoAlternarCamada(camada.id)}
              aria-label={'Visibilidade de ' + camada.nome}
              style={{ accentColor: '#176d59' }}
            />
            <span style={{ flex: 1, fontSize: 12 }}>{camada.nome}</span>
            {camada.padrao ? (
              <span className="arq2-label">padrão</span>
            ) : (
              <button
                type="button"
                onClick={() => props.aoRemoverCamada(camada.id)}
                title="Remover camada"
                aria-label={'Remover camada ' + camada.nome}
                style={{ border: 0, background: 'transparent', color: '#ea7373', cursor: 'pointer', fontSize: 15 }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          props.aoCriarCamada(nome);
          setNome('');
        }}
        style={{ display: 'flex', gap: 6, marginTop: 10 }}
      >
        <input
          className="arq2-field"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Nova camada"
          aria-label="Nome da nova camada"
          style={{ flex: 1 }}
        />
        <button type="submit" className="arq2-tool-button" aria-label="Criar camada" style={{ border: '1px solid #3a4649' }}>
          <Icone nome="mais" />
        </button>
      </form>

      <div className="arq2-label" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>{camadas.objetosOcultosIds.length} objeto(s) oculto(s)</span>
        {camadas.objetosOcultosIds.length > 0 ? (
          <button type="button" className="arq2-tool-button" style={{ border: '1px solid #3a4649' }} onClick={props.aoRevelarTodos}>
            Revelar todos
          </button>
        ) : null}
        <span>{props.totalObjetos} objeto(s) no modelo</span>
      </div>
    </div>
  );
}