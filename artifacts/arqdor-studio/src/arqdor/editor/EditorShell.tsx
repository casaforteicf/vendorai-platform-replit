'use client';

/** Casca visual do editor: toolbar + viewport + painel de camadas. Toda regra vem do motor puro. */

import { useEffect, useMemo, useState } from 'react';
import { objetoVisivel } from './bim/camadas';
import { derivar2d } from './bim/derivar2d';
import { clicar, iniciar, operacoesDoComando } from './modelador/desenho';
import type { EstadoDesenho, FerramentaModelador } from './modelador/desenho';
import { PLANO_CHAO } from './modelador/schema';
import type { Vetor3 } from './modelador/schema';
import { ModeladorCanvas } from './modeladorcanvas/ModeladorCanvas';
import { ToolbarModelador } from './modeladorcanvas/ToolbarModelador';
import { PainelCamadas } from './painel/PainelCamadas';
import { useBIMStore } from './stores/useBIMStore';
import { useModeladorStore } from './stores/useModeladorStore';
import { Viewport2D } from './viewport2d/Viewport2D';

const PASSO_GRADE = 0.05;

function aposGrade(valor: number): number {
  return Math.round(valor / PASSO_GRADE) * PASSO_GRADE;
}

export function EditorShell() {
  const [aba, setAba] = useState<'modelador' | 'planta'>('modelador');
  const [aviso, setAviso] = useState<string | null>('Crie um sólido e clique no plano para desenhar.');

  const solidos = useModeladorStore((s) => s.estado.solidos);
  const ferramenta = useModeladorStore((s) => s.ferramenta);
  const setFerramenta = useModeladorStore((s) => s.setFerramenta);
  const selecionadoId = useModeladorStore((s) => s.solidoSelecionadoId);
  const selecionar = useModeladorStore((s) => s.selecionar);
  const indice = useModeladorStore((s) => s.indice);
  const totalPassos = useModeladorStore((s) => s.historico.length);
  const criarSolido = useModeladorStore((s) => s.criarSolido);
  const aplicar = useModeladorStore((s) => s.aplicar);
  const desfazer = useModeladorStore((s) => s.desfazer);
  const refazer = useModeladorStore((s) => s.refazer);
  const ultimoErro = useModeladorStore((s) => s.ultimoErro);

  const camadas = useBIMStore((s) => s.camadas);
  const elementos = useBIMStore((s) => s.bim.elementos);
  const setModo = useBIMStore((s) => s.setModo);
  const toggleCamada = useBIMStore((s) => s.toggleCamada);
  const novaCamada = useBIMStore((s) => s.novaCamada);
  const removerCamada = useBIMStore((s) => s.removerCamada);
  const revelarTodos = useBIMStore((s) => s.revelarTodos);
  const carregarExemplo = useBIMStore((s) => s.carregarExemplo);

  const [desenho, setDesenho] = useState<EstadoDesenho>(() => iniciar('linha'));

  useEffect(() => {
    setDesenho(iniciar(ferramenta));
  }, [ferramenta]);

  const linhas = useMemo(
    () => derivar2d(elementos.filter((el) => objetoVisivel(camadas, el))),
    [elementos, camadas],
  );

  const solidoSelecionado = solidos.find((s) => s.id === selecionadoId);

  const aoClicarNoPlano = (ponto: Vetor3): void => {
    if (solidoSelecionado === undefined) {
      setAviso('Crie um sólido ("+ Novo sólido") antes de desenhar.');
      return;
    }
    const p: Vetor3 = [aposGrade(ponto[0]), 0, aposGrade(ponto[2])];
    const resultado = clicar(desenho, p);

    if (!resultado.pronto) {
      const faltam = resultado.estado.pontos.length;
      setDesenho(resultado.estado);
      setAviso('Ponto ' + String(faltam) + ' registrado. Clique no próximo ponto.');
      return;
    }

    const operacoes = operacoesDoComando(resultado.estado, { solido: solidoSelecionado, plano: PLANO_CHAO });
    if (!operacoes.ok) {
      setAviso('Não foi possível desenhar: ' + operacoes.erro.codigo + '.');
      setDesenho(iniciar(ferramenta));
      return;
    }
    if (operacoes.operacoes.length === 0) {
      setAviso('Pontos coincidentes — nada foi criado.');
    } else {
      aplicar(operacoes.operacoes);
      setAviso('Desenhado em "' + solidoSelecionado.nome + '".');
    }
    setDesenho(iniciar(ferramenta));
  };

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo !== null && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;

      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'z') {
        evento.preventDefault();
        if (evento.shiftKey) refazer();
        else desfazer();
        return;
      }
      const mapa: Record<string, FerramentaModelador> = { l: 'linha', r: 'retangulo', c: 'circulo', a: 'arco' };
      const escolhida = mapa[evento.key.toLowerCase()];
      if (escolhida !== undefined) setFerramenta(escolhida);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [desfazer, refazer, setFerramenta]);

  const abaBotao = (id: 'modelador' | 'planta', rotulo: string): React.ReactElement => (
    <button
      type="button"
      onClick={() => setAba(id)}
      style={{
        padding: '8px 16px',
        fontSize: 13,
        border: 'none',
        borderBottom: '2px solid ' + (aba === id ? '#2e7d32' : 'transparent'),
        background: 'transparent',
        color: aba === id ? '#1b5e20' : '#52605a',
        fontWeight: aba === id ? 600 : 500,
        cursor: 'pointer',
      }}
    >
      {rotulo}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f7f5', color: '#1f2933' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #e2e8e2', background: '#ffffff' }}>
        <strong style={{ fontSize: 15, color: '#2e7d32', letterSpacing: 0.3 }}>ARQDOR Studio 2.0</strong>
        <nav style={{ display: 'flex', marginLeft: 12 }}>
          {abaBotao('modelador', 'Modelador 3D')}
          {abaBotao('planta', 'Planta 2D')}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={carregarExemplo}
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #d5ddd5', background: '#fff', cursor: 'pointer' }}
          >
            Carregar exemplo
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ToolbarModelador
          ferramenta={ferramenta}
          aoEscolher={setFerramenta}
          aoNovoSolido={criarSolido}
          aoDesfazer={desfazer}
          aoRefazer={refazer}
          podeDesfazer={indice > 0}
          podeRefazer={indice < totalPassos - 1}
          temSolido={solidoSelecionado !== undefined}
        />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, background: '#ffffff' }}>
            {aba === 'modelador' ? (
              <ModeladorCanvas solidos={solidos} selecionadoId={selecionadoId} aoClicarNoPlano={aoClicarNoPlano} />
            ) : (
              <Viewport2D linhas={linhas} selecionadoId={selecionadoId} />
            )}
          </div>

          <div style={{ padding: '6px 12px', fontSize: 12, borderTop: '1px solid #e2e8e2', background: '#ffffff', display: 'flex', gap: 16 }}>
            <span>{aviso ?? ''}</span>
            {ultimoErro !== null ? <span style={{ color: '#b91c1c' }}>erro: {ultimoErro.codigo}</span> : null}
            <span style={{ marginLeft: 'auto', color: '#52605a' }}>
              {String(solidos.length)} sólido(s) · {String(elementos.length)} elemento(s) · {String(linhas.length)} linha(s)
            </span>
          </div>
        </main>

        <PainelCamadas
          camadas={camadas}
          totalObjetos={elementos.length}
          aoAplicarModo={setModo}
          aoAlternarCamada={toggleCamada}
          aoCriarCamada={novaCamada}
          aoRemoverCamada={removerCamada}
          aoRevelarTodos={revelarTodos}
        />
      </div>

      <div style={{ padding: '4px 12px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #e2e8e2', background: '#fbfcfb' }}>
        atalhos: L linha · R retângulo · C círculo · A arco · Ctrl+Z desfazer · Ctrl+Shift+Z refazer · selecionado: {solidoSelecionado?.nome ?? 'nenhum'}
      </div>
    </div>
  );
}