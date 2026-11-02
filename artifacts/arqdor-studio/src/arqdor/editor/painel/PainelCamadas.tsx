'use client';

import { useState } from 'react';
import type { EstadoCamadas } from '../bim/camadas';

export interface PropsPainelCamadas {
  camadas: EstadoCamadas;
  totalObjetos: number;
  aoAplicarModo: (modoId: string) => void;
  aoAlternarCamada: (camadaId: string) => void;
  aoCriarCamada: (nome: string) => void;
  aoRemoverCamada: (camadaId: string) => void;
  aoRevelarTodos: () => void;
}

export function PainelCamadas(props: PropsPainelCamadas) {
  const [nome, setNome] = useState('');
  const { camadas } = props;

  return (
    <aside style={{ width: 250, padding: 12, borderLeft: '1px solid #e2e8e2', background: '#fbfcfb', overflowY: 'auto' }}>
      <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#52605a', margin: '0 0 8px' }}>
        Modos
      </h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {camadas.modos.map((modo) => {
          const ativo = camadas.modoAtivoId === modo.id;
          return (
            <button
              key={modo.id}
              type="button"
              onClick={() => props.aoAplicarModo(modo.id)}
              style={{
                flex: 1,
                padding: '6px 4px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid ' + (ativo ? '#2e7d32' : '#d5ddd5'),
                background: ativo ? '#e8f5e9' : '#ffffff',
                color: ativo ? '#1b5e20' : '#1f2933',
                cursor: 'pointer',
              }}
            >
              {modo.nome}
            </button>
          );
        })}
      </div>

      <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#52605a', margin: '0 0 8px' }}>
        Camadas
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {camadas.camadas.map((camada) => (
          <li
            key={camada.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              borderRadius: 6,
              background: camadas.camadaAtivaId === camada.id ? '#e8f5e9' : 'transparent',
              marginBottom: 2,
            }}
          >
            <input
              type="checkbox"
              checked={camada.visivel}
              onChange={() => props.aoAlternarCamada(camada.id)}
              aria-label={'Visibilidade de ' + camada.nome}
            />
            <span style={{ flex: 1, fontSize: 13, color: '#1f2933' }}>{camada.nome}</span>
            {camada.padrao ? null : (
              <button
                type="button"
                onClick={() => props.aoRemoverCamada(camada.id)}
                title="Remover camada"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b91c1c', fontSize: 14 }}
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
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Nova camada"
          style={{ flex: 1, padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d5ddd5' }}
        />
        <button
          type="submit"
          style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #2e7d32', background: '#2e7d32', color: '#fff', cursor: 'pointer' }}
        >
          +
        </button>
      </form>

      <div style={{ marginTop: 16, fontSize: 12, color: '#52605a' }}>
        <div>{camadas.objetosOcultosIds.length} objeto(s) oculto(s)</div>
        {camadas.objetosOcultosIds.length > 0 ? (
          <button
            type="button"
            onClick={props.aoRevelarTodos}
            style={{ marginTop: 6, padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d5ddd5', background: '#fff', cursor: 'pointer' }}
          >
            Revelar todos
          </button>
        ) : null}
        <div style={{ marginTop: 10 }}>{props.totalObjetos} objeto(s) no modelo</div>
      </div>
    </aside>
  );
}