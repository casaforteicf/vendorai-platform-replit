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
  aoRenomearCamada: (camadaId: string, nome: string) => void;
  /** Reordena pela lista de ids na ordem nova (índice 0 = primeira). */
  aoReordenarCamadas: (idsNaOrdem: string[]) => void;
  aoRemoverCamada: (camadaId: string) => void;
  aoRevelarTodos: () => void;
}

const CORES_CAMADA = ['#00c896', '#38bdf8', '#f59e0b', '#a78bfa', '#84cc16', '#f472b6'];

/** Conteúdo do inspetor direito (300px) — sem wrapper próprio. */
export function PainelCamadas(props: PropsPainelCamadas) {
  const [nome, setNome] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const { camadas } = props;

  const confirmarRenome = (): void => {
    if (editandoId === null) return;
    if (textoEdicao.trim().length > 0) props.aoRenomearCamada(editandoId, textoEdicao.trim());
    setEditandoId(null);
    setTextoEdicao('');
  };

  const soltarSobre = (destinoId: string): void => {
    if (arrastandoId === null || arrastandoId === destinoId) return;
    const ids = camadas.camadas.map((camada) => camada.id);
    const de = ids.indexOf(arrastandoId);
    const para = ids.indexOf(destinoId);
    if (de < 0 || para < 0) return;
    const semOrigem = ids.filter((id) => id !== arrastandoId);
    const indiceDestino = semOrigem.indexOf(destinoId);
    semOrigem.splice(para > de ? indiceDestino + 1 : indiceDestino, 0, arrastandoId);
    props.aoReordenarCamadas(semOrigem);
    setArrastandoId(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icone nome="camadas" />
        <span className="arq-panel-title">Camadas</span>
      </div>

      <div className="arq-muted" style={{ marginBottom: 4 }}>Modos</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {camadas.modos.map((modo) => (
          <button
            key={modo.id}
            type="button"
            className="arq-tool"
            style={{ flex: 1 }}
            aria-pressed={camadas.modoAtivoId === modo.id}
            onClick={() => props.aoAplicarModo(modo.id)}
          >
            {modo.nome}
          </button>
        ))}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className="arq-layer-list">
        {camadas.camadas.map((camada, indice) => (
          <li
            key={camada.id}
            className={'arq-layer-item' + (camada.visivel ? '' : ' is-hidden')}
            draggable
            onDragStart={() => setArrastandoId(camada.id)}
            onDragOver={(evento) => evento.preventDefault()}
            onDrop={() => soltarSobre(camada.id)}
            onDoubleClick={() => {
              setEditandoId(camada.id);
              setTextoEdicao(camada.nome);
            }}
            style={{
              background: camadas.camadaAtivaId === camada.id ? 'rgba(23,109,89,0.15)' : 'transparent',
              cursor: 'grab',
            }}
          >
            <span className="arq-layer-swatch" style={{ backgroundColor: CORES_CAMADA[indice % CORES_CAMADA.length], opacity: camada.visivel ? 1 : 0.25 }} aria-hidden="true" />
            {editandoId === camada.id ? (
              <input
                autoFocus
                className="arq-field"
                value={textoEdicao}
                onChange={(evento) => setTextoEdicao(evento.target.value)}
                onBlur={confirmarRenome}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') confirmarRenome();
                  if (evento.key === 'Escape') setEditandoId(null);
                }}
                aria-label={'Novo nome da camada ' + camada.nome}
                style={{ flex: 1, height: 24, fontSize: 12 }}
              />
            ) : (
              <button
                type="button"
                className="arq-layer-name"
                onClick={() => {
                  setEditandoId(camada.id);
                  setTextoEdicao(camada.nome);
                }}
                title="Clique para renomear"
                style={{ border: 0, background: 'transparent', cursor: 'text', padding: 0 }}
              >
                {camada.nome}
              </button>
            )}
            <button
              type="button"
              className="arq-layer-eye"
              onClick={() => props.aoAlternarCamada(camada.id)}
              aria-label={(camada.visivel ? 'Ocultar' : 'Mostrar') + ' camada ' + camada.nome}
              aria-pressed={camada.visivel}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: camada.visivel ? '#00c896' : '#374151' }}
            >
              {camada.visivel ? '◉' : '○'}
            </button>
            {camada.padrao ? (
              <span className="arq-muted">padrão</span>
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
          className="arq-field"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Nova camada"
          aria-label="Nome da nova camada"
          style={{ flex: 1 }}
        />
        <button type="submit" className="arq-tool" aria-label="Criar camada" style={{ border: '1px solid #3a4649' }}>
          <Icone nome="mais" />
        </button>
      </form>

      <div className="arq-muted" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>{camadas.objetosOcultosIds.length} objeto(s) oculto(s)</span>
        {camadas.objetosOcultosIds.length > 0 ? (
          <button type="button" className="arq-tool" style={{ border: '1px solid #3a4649' }} onClick={props.aoRevelarTodos}>
            Revelar todos
          </button>
        ) : null}
        <span>{props.totalObjetos} objeto(s) no modelo</span>
      </div>
    </div>
  );
}