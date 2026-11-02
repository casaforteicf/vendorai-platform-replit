'use client';

/** Ambiente "Modelagem 2D/3D" — rail de ferramentas, viewport dominante e inspetor à direita. */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { objetoVisivel } from './bim/camadas';
import { Icone } from './design/icones';
import { derivar2d } from './bim/derivar2d';
import { clicar, iniciar, operacoesDoComando } from './modelador/desenho';
import type { EstadoDesenho, FerramentaModelador } from './modelador/desenho';
import { PLANO_CHAO } from './modelador/schema';
import type { Vetor3 } from './modelador/schema';
import { ModeladorCanvas } from './modeladorcanvas/ModeladorCanvas';
import { ToolbarModelador } from './modeladorcanvas/ToolbarModelador';
import { PainelCamadas } from './painel/PainelCamadas';
import { PainelPropriedades } from './painel/PainelPropriedades';
import type { FaceEscolhida } from './painel/PainelPropriedades';
import { calcularPushPull } from './modelador/pushpull';
import { gerarOpEscalar, gerarOpMover, gerarOpRotacionar } from './modelador/gizmo';
import type { ModoGizmo, TransformacaoLida } from './modeladorcanvas/ModeladorCanvas';
import type { OperacaoModelador } from './modelador/schema';
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
  const selecionar = useModeladorStore((s) => s.selecionar);
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
  const carregarExemplo = useBIMStore((s) => s.carregarExemplo);
  const carregarBim = useBIMStore((s) => s.carregar);

  const [desenho, setDesenho] = useState<EstadoDesenho>(() => iniciar('linha'));
  const [gizmo, setGizmo] = useState<ModoGizmo>(null);
  const [face, setFace] = useState<FaceEscolhida | null>(null);
  const [altura, setAltura] = useState('2.8');

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

  const salvarAgora = (): void => {
    if (projeto === null) return;
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
  };

  const solidos = estadoModelador.solidos;
  const linhasPlanta = useMemo(
    () => derivar2d(elementos.filter((el) => objetoVisivel(camadas, el))),
    [elementos, camadas],
  );

  const solidoSelecionado = solidos.find((s) => s.id === selecionadoId);

  const renomearSolido = (nome: string): void => {
    if (solidoSelecionado === undefined) return;
    aplicar([{ tipo: 'atualizar_solido', antes: solidoSelecionado, depois: { ...solidoSelecionado, nome } }]);
  };

  const aplicarPushPull = (): void => {
    if (face === null) return;
    const alvo = solidos.find((s) => s.id === face.solidoId);
    if (alvo === undefined) {
      setAviso('O sólido desta face não existe mais.');
      setFace(null);
      return;
    }
    const alturaNum = Number(altura.replace(',', '.'));
    if (!Number.isFinite(alturaNum) || alturaNum === 0) {
      setAviso('Altura inválida — informe um número diferente de zero.');
      return;
    }
    const resultado = calcularPushPull(alvo, face.faceId, alturaNum);
    if (!resultado.ok) {
      setAviso('Push/Pull recusado: ' + resultado.erro.codigo + '.');
      return;
    }
    aplicar(resultado.operacoes);
    setAviso('Push/Pull de ' + String(alturaNum) + ' m aplicado em "' + alvo.nome + '".');
    setFace(null);
  };

  const transformarSolido = (solidoId: string, alvoTransformado: TransformacaoLida): void => {
    const alvo = solidos.find((s) => s.id === solidoId);
    if (alvo === undefined || gizmo === null) return;
    const atual = alvo.transformacao;
    const operacoes: OperacaoModelador[] = [];

    if (gizmo === 'mover') {
      const delta: Vetor3 = [
        alvoTransformado.posicao[0] - atual.posicao[0],
        alvoTransformado.posicao[1] - atual.posicao[1],
        alvoTransformado.posicao[2] - atual.posicao[2],
      ];
      if (Math.hypot(delta[0], delta[1], delta[2]) < 1e-6) return;
      operacoes.push(gerarOpMover(alvo, delta));
    } else if (gizmo === 'rotacionar') {
      const delta: Vetor3 = [
        alvoTransformado.rotacao[0] - atual.rotacao[0],
        alvoTransformado.rotacao[1] - atual.rotacao[1],
        alvoTransformado.rotacao[2] - atual.rotacao[2],
      ];
      if (Math.hypot(delta[0], delta[1], delta[2]) < 1e-6) return;
      operacoes.push(gerarOpRotacionar(alvo, delta));
    } else {
      const fator: Vetor3 = [
        atual.escala[0] === 0 ? 1 : alvoTransformado.escala[0] / atual.escala[0],
        atual.escala[1] === 0 ? 1 : alvoTransformado.escala[1] / atual.escala[1],
        atual.escala[2] === 0 ? 1 : alvoTransformado.escala[2] / atual.escala[2],
      ];
      if (Math.abs(fator[0] - 1) < 1e-6 && Math.abs(fator[1] - 1) < 1e-6 && Math.abs(fator[2] - 1) < 1e-6) return;
      operacoes.push(gerarOpEscalar(alvo, fator));
    }

    aplicar(operacoes);
  };

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
      const mapa: Record<string, FerramentaModelador> = {
        s: 'selecionar',
        l: 'linha',
        r: 'retangulo',
        c: 'circulo',
        a: 'arco',
        p: 'pushpull',
      };
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
    <AppShell
      projeto={projeto.nome}
      salvo={salvoEm !== null}
      acoes={
        <button type="button" className="arq-btn" onClick={salvarAgora}>
          <Icone nome="salvo" tamanho={16} />
          Salvar
        </button>
      }
    >
      <div className="arq-editor-page">
      <div className="arq-editor-toolbar">
        <div style={{ display: 'flex', gap: 4 }} role="tablist" aria-label="Vista">
          <button type="button" role="tab" className="arq-tool" aria-pressed={aba === 'modelo'} onClick={() => setAba('modelo')}>
            Modelo 3D
          </button>
          <button type="button" role="tab" className="arq-tool" aria-pressed={aba === 'planta'} onClick={() => setAba('planta')}>
            Planta 2D
          </button>
        </div>
        <div className="arq-header-spacer" />
        <span className="arq-muted">Modelagem de sólidos</span>
      </div>

      <div className="arq-editor-body">
        <ToolbarModelador
          ferramenta={ferramenta}
          aoEscolher={setFerramenta}
          aoNovoSolido={criarSolido}
          aoDesfazer={desfazer}
          aoRefazer={refazer}
          podeDesfazer={indice > 0}
          podeRefazer={indice < totalPassos - 1}
          temSolido={solidoSelecionado !== undefined}
          gizmo={gizmo}
          aoGizmo={setGizmo}
        />

        <div className="arq-editor-canvas">
          {aba === 'modelo' ? (
            <ModeladorCanvas
              solidos={solidos}
              selecionadoId={selecionadoId}
              modo={ferramenta === 'pushpull' ? 'pushpull' : ferramenta === 'selecionar' ? 'selecionar' : 'desenho'}
              gizmo={gizmo}
              aoClicarNoPlano={aoClicarNoPlano}
              aoSelecionar={selecionar}
              aoEscolherFace={(solidoId, faceId) => {
                setFace({ solidoId, faceId });
                setAviso('Face selecionada — informe a altura e aplique o Push/Pull.');
              }}
              aoTransformar={transformarSolido}
            />
          ) : (
            <Viewport2D linhas={linhasPlanta} selecionadoId={selecionadoId} />
          )}
          {aba === 'planta' && elementos.length === 0 ? (
            <div className="arq-vazio-overlay">
              <p>
                Nenhum elemento BIM ainda. A planta 2D é derivada de paredes, lajes e esquadrias — o
                modelador 3D cria sólidos, e eles ainda não viram elementos.
              </p>
              <button type="button" className="arq-btn" onClick={carregarExemplo}>
                Carregar modelo de exemplo
              </button>
            </div>
          ) : null}
        </div>

        <aside className="arq-editor-aside">
          <PainelPropriedades
            solido={solidoSelecionado ?? null}
            face={face}
            altura={altura}
            aoMudarAltura={setAltura}
            aoAplicarPushPull={aplicarPushPull}
            aoCancelarFace={() => setFace(null)}
            aoRenomear={renomearSolido}
          />
          <div style={{ height: 1, background: '#e5e7eb', margin: '14px 0' }} />
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
        <span style={{ color: '#52605a' }}>{aviso}</span>
        {ultimoErro !== null ? <span style={{ color: '#ea7373' }}>erro: {ultimoErro.codigo}</span> : null}
        <span style={{ marginLeft: 'auto' }}>S/L/R/C/A · P push/pull · M/O/E gizmo · Ctrl+Z</span>
      </div>
      </div>
    </AppShell>
  );
}