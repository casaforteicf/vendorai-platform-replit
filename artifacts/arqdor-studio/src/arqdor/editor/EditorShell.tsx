'use client';

/** Ambiente "Modelagem 2D/3D" — rail de ferramentas, viewport dominante e inspetor à direita. */

import Link from 'next/link';
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
import type { DocumentoArqdor } from './persistencia/documento';
import { VERSAO_DOCUMENTO } from './persistencia/documento';
import { obterProjeto, projetoAtivoId, salvarProjeto } from './persistencia/localStore';
import { AppShell } from './shell/AppShell';
import { useBIMStore } from './stores/useBIMStore';
import { useModeladorStore } from './stores/useModeladorStore';
import { Viewport2D } from './viewport2d/Viewport2D';

const PASSO_GRADE = 0.05;

function aposGrade(valor: number): number {
  return Math.round(valor / PASSO_GRADE) * PASSO_GRADE;
}

export function EditorShell() {
  const [carregado, setCarregado] = useState(false);
  const [aba, setAba] = useState<'modelo' | 'planta'>('modelo');
  const [aviso, setAviso] = useState('Clique em "Novo sólido" e depois no plano.');
  const [projeto, setProjeto] = useState<{ id: string; nome: string; criadoEm: string } | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);

  const estadoModelador = useModeladorStore((s) => s.estado);
  const ferramenta = useModeladorStore((s) => s.ferramenta);
  const setFerramenta = useModeladorStore((s) => s.setFerramenta);
  const selecionadoId = useModeladorStore((s) => s.solidoSelecionadoId);
  const indice = useModeladorStore((s) => s.indice);
  const totalPassos = useModeladorStore((s) => s.historico.length);
  const criarSolido = useModeladorStore((s) => s.criarSolido);
  const aplicar = useModeladorStore((s) => s.aplicar);
  const desfazer = useModeladorStore((s) => s.desfazer);
  const refazer = useModeladorStore((s) => s.refazer);
  const carregarModelador = useModeladorStore((s) => s.carregar);
  const ultimoErro = useModeladorStore((s) => s.ultimoErro);

  const camadas = useBIMStore((s) => s.camadas);
  const elementos = useBIMStore((s) => s.bim.elementos);
  const setModo = useBIMStore((s) => s.setModo);
  const toggleCamada = useBIMStore((s) => s.toggleCamada);
  const novaCamada = useBIMStore((s) => s.novaCamada);
  const removerCamada = useBIMStore((s) => s.removerCamada);
  const revelarTodos = useBIMStore((s) => s.revelarTodos);
  const carregarBim = useBIMStore((s) => s.carregar);

  const [desenho, setDesenho] = useState<EstadoDesenho>(() => iniciar('linha'));

  useEffect(() => {
    setDesenho(iniciar(ferramenta));
  }, [ferramenta]);

  useEffect(() => {
    const id = projetoAtivoId();
    const documento = id !== null ? obterProjeto(id) : null;
    if (documento !== null) {
      carregarModelador(documento.modelador);
      carregarBim({ ...documento.camadas, objetosOcultosIds: [] }, documento.bim);
      setProjeto({ id: documento.projeto.id, nome: documento.projeto.nome, criadoEm: documento.projeto.criadoEm });
    }
    setCarregado(true);
  }, [carregarModelador, carregarBim]);

  useEffect(() => {
    if (!carregado || projeto === null) return undefined;
    const temporizador = setTimeout(() => {
      const documento: DocumentoArqdor = {
        versao: VERSAO_DOCUMENTO,
        projeto: { ...projeto, atualizadoEm: new Date().toISOString() },
        camadas: {
          camadas: camadas.camadas,
          modos: camadas.modos,
          camadaAtivaId: camadas.camadaAtivaId,
          modoAtivoId: camadas.modoAtivoId,
        },
        bim: elementos,
        modelador: estadoModelador,
        mep: [],
      };
      salvarProjeto(documento);
      setSalvoEm(new Date().toLocaleTimeString('pt-BR'));
    }, 700);
    return () => clearTimeout(temporizador);
  }, [carregado, projeto, camadas, elementos, estadoModelador]);

  const solidos = estadoModelador.solidos;
  const linhasPlanta = useMemo(
    () => derivar2d(elementos.filter((el) => objetoVisivel(camadas, el))),
    [elementos, camadas],
  );

  const solidoSelecionado = solidos.find((s) => s.id === selecionadoId);

  const aoClicarNoPlano = (ponto: Vetor3): void => {
    if (solidoSelecionado === undefined) {
      setAviso('Crie um sólido ("Novo sólido") antes de desenhar.');
      return;
    }
    const p: Vetor3 = [aposGrade(ponto[0]), 0, aposGrade(ponto[2])];
    const resultado = clicar(desenho, p);

    if (!resultado.pronto) {
      setDesenho(resultado.estado);
      setAviso('Ponto ' + String(resultado.estado.pontos.length) + ' registrado.');
      return;
    }

    const operacoes = operacoesDoComando(resultado.estado, { solido: solidoSelecionado, plano: PLANO_CHAO });
    if (!operacoes.ok) {
      setAviso('Não foi possível desenhar: ' + operacoes.erro.codigo + '.');
    } else if (operacoes.operacoes.length === 0) {
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

  if (!carregado) {
    return (
      <AppShell>
        <div className="arq-page-pad arq-muted">Carregando projeto…</div>
      </AppShell>
    );
  }

  if (projeto === null) {
    return (
      <AppShell>
        <div className="arq-page-pad">
          <h1 className="arq-dashboard-title">Nenhum projeto ativo</h1>
          <p className="arq-dashboard-sub">Abra um projeto na área de Projetos para começar a modelar.</p>
          <Link className="arq-btn arq-btn-primary" href="/">
            Ir para Projetos
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell projeto={projeto.nome} salvo={salvoEm !== null}>
      <div className="arq2-toolbar">
        <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="Vista">
          <button type="button" role="tab" className="arq-tool" aria-pressed={aba === 'modelo'} onClick={() => setAba('modelo')}>
            Modelo 3D
          </button>
          <button type="button" role="tab" className="arq-tool" aria-pressed={aba === 'planta'} onClick={() => setAba('planta')}>
            Planta 2D
          </button>
        </div>
        <div className="arq-header-spacer" />
        <span className="arq-muted">{aviso}</span>
      </div>

      <div className="arq-editor">
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

        <div className="arq-editor-canvas">
          {aba === 'modelo' ? (
            <ModeladorCanvas solidos={solidos} selecionadoId={selecionadoId} aoClicarNoPlano={aoClicarNoPlano} />
          ) : (
            <Viewport2D linhas={linhasPlanta} selecionadoId={selecionadoId} />
          )}
        </div>

        <aside className="arq-editor-aside">
          <PainelCamadas
            camadas={camadas}
            totalObjetos={elementos.length}
            aoAplicarModo={setModo}
            aoAlternarCamada={toggleCamada}
            aoCriarCamada={novaCamada}
            aoRemoverCamada={removerCamada}
            aoRevelarTodos={revelarTodos}
          />
        </aside>
      </div>

      <div className="arq-statusbar">
        <span>{String(solidos.length)} sólido(s)</span>
        <span>{String(elementos.length)} elemento(s)</span>
        <span>selecionado: {solidoSelecionado?.nome ?? 'nenhum'}</span>
        {ultimoErro !== null ? <span style={{ color: '#ea7373' }}>erro: {ultimoErro.codigo}</span> : null}
        <span style={{ marginLeft: 'auto' }}>L linha · R retângulo · C círculo · A arco · Ctrl+Z desfazer</span>
      </div>
    </AppShell>
  );
}