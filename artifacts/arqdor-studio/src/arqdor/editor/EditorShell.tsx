'use client';

/** Ambiente "Modelagem 2D/3D" — rail de ferramentas, viewport dominante e inspetor à direita. */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { objetoVisivel } from './bim/camadas';
import { Icone } from './design/icones';
import { derivar2d } from './bim/derivar2d';
import { abrirVao, vaosDaParede } from './bim/esquadrias';
import { formatarMedida, interpretarMedida } from './modelador/medida';
import { loopDaFace, loopDeAresta } from './modelador/loop';
import { aplicarBooleana, booleanaDisponivel, inicializarBooleana } from './modelador/booleana';
import { classificarSolido, materializarSolidos } from './bim/materializar';
import { PainelConflitos } from './conflitos/PainelConflitos';
import type { ElementoMEP } from './mep/schema';
import { clicar, iniciar, operacoesDoComando } from './modelador/desenho';
import type { EstadoDesenho, FerramentaModelador } from './modelador/desenho';
import { PLANO_CHAO } from './modelador/schema';
import type { Vetor3 } from './modelador/schema';
import { ModeladorCanvas } from './modeladorcanvas/ModeladorCanvas';
import { ToolbarModelador } from './modeladorcanvas/ToolbarModelador';
import { PainelCamadas } from './painel/PainelCamadas';
import { BarraMedidas } from './painel/BarraMedidas';
import { ModalInserir } from './painel/ModalInserir';
import type { MedidasInsercao } from './painel/ModalInserir';
import { PainelPropriedades } from './painel/PainelPropriedades';
import type { FaceEscolhida, PreviaBim } from './painel/PainelPropriedades';
import { calcularPushPull } from './modelador/pushpull';
import { offsetDaFace } from './modelador/offset';
import { gerarOpEscalar, gerarOpMover, gerarOpRotacionar } from './modelador/gizmo';
import type { ModoGizmo, TransformacaoLida } from './modeladorcanvas/ModeladorCanvas';
import type { OperacaoModelador } from './modelador/schema';
import { aplicarPasso } from './modelador/store-core';
import type { DocumentoArqdor } from './persistencia/documento';
import { VERSAO_DOCUMENTO } from './persistencia/documento';
import { obterProjeto, salvarProjeto } from './persistencia/apiStore';
import { projetoAtivoId } from './persistencia/localStore';
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
  const [aba, setAba] = useState<'modelo' | 'planta' | 'conflitos'>('modelo');
  const [mep, setMep] = useState<ElementoMEP[]>([]);
  const [modalInserir, setModalInserir] = useState(false);
  const [booleanaPronta, setBooleanaPronta] = useState(false);
  const [selecaoNivel, setSelecaoNivel] = useState<{ nivel: string; arestas: number; ids: string[]; solidoId: string; faceId: string | null } | null>(null);
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
  const inserirCaixa = useModeladorStore((s) => s.inserirCaixa);
  const inserirTelhado = useModeladorStore((s) => s.inserirTelhado);
  const inserirEscada = useModeladorStore((s) => s.inserirEscada);
  const removerSolido = useModeladorStore((s) => s.removerSolido);
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
  const aplicarBim = useBIMStore((s) => s.aplicar);
  const carregarBim = useBIMStore((s) => s.carregar);

  const [desenho, setDesenho] = useState<EstadoDesenho>(() => iniciar('linha'));
  const [gizmo, setGizmo] = useState<ModoGizmo>(null);
  const [face, setFace] = useState<FaceEscolhida | null>(null);
  const [altura, setAltura] = useState('2.8');
  const [focoMedida, setFocoMedida] = useState(0);
  const [painelAberto, setPainelAberto] = useState(true);

  useEffect(() => {
    setDesenho(iniciar(ferramenta));
  }, [ferramenta]);

  useEffect(() => {
    let vivo = true;
    if (booleanaDisponivel()) {
      setBooleanaPronta(true);
      return () => {
        vivo = false;
      };
    }
    void inicializarBooleana().then((resultado) => {
      if (!vivo) return;
      if (resultado.ok) {
        setBooleanaPronta(true);
      } else {
        setAviso('Motor de booleanas indisponível: ' + resultado.erro);
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    const id = projetoAtivoId();
    if (id === null) {
      setCarregado(true);
      return () => {
        vivo = false;
      };
    }
    void obterProjeto(id)
      .then((documento) => {
        if (!vivo) return;
        if (documento !== null) {
          carregarModelador(documento.modelador);
          carregarBim({ ...documento.camadas, objetosOcultosIds: [] }, documento.bim);
          setMep(documento.mep);
          setProjeto({ id: documento.projeto.id, nome: documento.projeto.nome, criadoEm: documento.projeto.criadoEm });
        }
        setCarregado(true);
      })
      .catch((erro: unknown) => {
        if (!vivo) return;
        setAviso('Servidor indisponível: ' + (erro instanceof Error ? erro.message : String(erro)));
        setCarregado(true);
      });
    return () => {
      vivo = false;
    };
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
        mep,
      };
      void salvarProjeto(documento)
        .then(() => setSalvoEm(new Date().toLocaleTimeString('pt-BR')))
        .catch((erro: unknown) => {
          setSalvoEm(null);
          setAviso('Não salvou: ' + (erro instanceof Error ? erro.message : String(erro)));
        });
    }, 700);
    return () => clearTimeout(temporizador);
  }, [carregado, projeto, camadas, elementos, estadoModelador, mep]);

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
      mep,
    };
    void salvarProjeto(documento)
      .then(() => setSalvoEm(new Date().toLocaleTimeString('pt-BR')))
      .catch((erro: unknown) => {
        setSalvoEm(null);
        setAviso('Não salvou: ' + (erro instanceof Error ? erro.message : String(erro)));
      });
  };

  const solidos = estadoModelador.solidos;
  const linhasPlanta = useMemo(
    () => derivar2d(elementos.filter((el) => objetoVisivel(camadas, el))),
    [elementos, camadas],
  );

  const solidoSelecionado = solidos.find((s) => s.id === selecionadoId);
  const paredeDoSolido = solidoSelecionado === undefined
    ? undefined
    : elementos.find((el) => el.id === 'el_' + solidoSelecionado.id && el.tipo === 'parede');
  const vaosDoSolido = paredeDoSolido === undefined ? [] : vaosDaParede(elementos, paredeDoSolido.id);

  /** Ids de sólidos que já viraram elemento BIM (prefixo `el_`). */
  const solidosMaterializados = useMemo<string[]>(
    () => elementos.filter((elemento) => elemento.id.startsWith('el_')).map((elemento) => elemento.id.slice(3)),
    [elementos],
  );
  const selecionadoMaterializado =
    solidoSelecionado !== undefined && solidosMaterializados.includes(solidoSelecionado.id);

  /** Prévia da regra D12 — o painel diz no que o sólido vai virar antes de converter. */
  const previa = useMemo<PreviaBim | null>(() => {
    if (solidoSelecionado === undefined || projeto === null) return null;
    const resultado = classificarSolido(solidoSelecionado, {
      projetoId: projeto.id,
      camadaId: camadas.camadaAtivaId,
    });
    if (!resultado.ok) {
      return { titulo: 'Não conversível', detalhe: resultado.erro.codigo, conversivel: false };
    }
    const { tipo, geometria, metricas } = resultado.classificacao;
    const m = (valor: number): string => valor.toFixed(2).replace('.', ',') + ' m';
    if (tipo === 'parede') {
      const g = geometria as { ponto_a: [number, number]; ponto_b: [number, number]; altura: number; espessura: number };
      const comprimento = Math.hypot(g.ponto_b[0] - g.ponto_a[0], g.ponto_b[1] - g.ponto_a[1]);
      return {
        titulo: 'Parede',
        detalhe: m(comprimento) + ' de comprimento · ' + m(g.altura) + ' de altura · ' + m(g.espessura) + ' de espessura',
        conversivel: true,
      };
    }
    if (tipo === 'laje') {
      const g = geometria as { espessura: number };
      return {
        titulo: 'Laje',
        detalhe: metricas.areaPlanta.toFixed(2).replace('.', ',') + ' m² de área · ' + m(g.espessura) + ' de espessura',
        conversivel: true,
      };
    }
    if (tipo === 'telhado') {
      const g = geometria as { inclinacaoGraus: number };
      return {
        titulo: 'Telhado',
        detalhe: g.inclinacaoGraus.toFixed(1).replace('.', ',') + '° de inclinação',
        conversivel: true,
      };
    }
    return {
      titulo: 'Mobiliário',
      detalhe: m(metricas.larguraX) + ' × ' + m(metricas.profundidadeZ) + ' × ' + m(metricas.altura),
      conversivel: true,
    };
  }, [solidoSelecionado, projeto, camadas.camadaAtivaId]);

  const materializarSelecionado = (): void => {
    if (projeto === null || solidoSelecionado === undefined) return;
    const lote = materializarSolidos(
      [solidoSelecionado],
      { projetoId: projeto.id, camadaId: camadas.camadaAtivaId },
      elementos,
    );
    if (lote.erros.length > 0) {
      setAviso('Não foi possível converter "' + solidoSelecionado.nome + '": ' + lote.erros[0].codigo + '.');
      return;
    }
    if (lote.operacoes.length > 0) {
      aplicarBim(lote.operacoes);
      setAviso('"' + solidoSelecionado.nome + '" agora é ' + (previa === null ? 'elemento BIM' : previa.titulo) + '.');
    } else {
      setAviso('Este elemento já está atualizado no BIM.');
    }
  };

  const inserir = (medidas: MedidasInsercao): void => {
    const { largura, altura: alturaMedida, profundidade } = medidas.dimensoes;
    if (medidas.tipo === 'telhado') {
      inserirTelhado({
        nome: medidas.nome,
        posicao: medidas.posicao,
        larguraX: largura,
        profundidadeZ: profundidade,
        altura: alturaMedida,
      });
    } else if (medidas.tipo === 'escada') {
      inserirEscada({
        nome: medidas.nome,
        posicao: medidas.posicao,
        largura,
        alturaTotal: alturaMedida,
        profundidadeDegrau: profundidade,
      });
    } else {
      inserirCaixa(medidas);
    }
    setModalInserir(false);
    setAba('modelo');
    setAviso(
      medidas.nome +
        ' inserido em (' + medidas.posicao.join(', ') + ') com ' +
        String(medidas.dimensoes.largura) + ' × ' + String(medidas.dimensoes.altura) + ' × ' + String(medidas.dimensoes.profundidade) + ' m.',
    );
  };

  const excluirSelecionado = (): void => {
    if (solidoSelecionado === undefined) return;
    const vinculo = elementos.find((el) => el.id === 'el_' + solidoSelecionado.id);
    aplicarBim(vinculo === undefined ? [] : [{ tipo: 'remover_elemento_bim', elemento: vinculo }]);
    removerSolido(solidoSelecionado.id);
    setAviso('"' + solidoSelecionado.nome + '" excluído. Ctrl+Z desfaz.');
  };

  const transformarSelecionado = (transformacao: { posicao: [number, number, number]; escala: [number, number, number] }): void => {
    if (solidoSelecionado === undefined) return;
    aplicar([
      {
        tipo: 'atualizar_solido',
        antes: solidoSelecionado,
        depois: { ...solidoSelecionado, transformacao: { ...solidoSelecionado.transformacao, ...transformacao } },
      },
    ]);
  };

  const carregarBooleana = (): void => {
    void inicializarBooleana().then((resultado) => {
      if (resultado.ok) setBooleanaPronta(true);
      else setAviso('Motor de booleanas indisponível: ' + resultado.erro);
    });
  };

  const booleanaComSelecionado = (outroId: string, operacao: 'uniao' | 'diferenca' | 'intersecao'): void => {
    if (solidoSelecionado === undefined) return;
    const outro = solidos.find((item) => item.id === outroId);
    if (outro === undefined) {
      setAviso('Sólido de referência não existe mais.');
      return;
    }
    const resultado = aplicarBooleana(solidoSelecionado, outro, operacao);
    if (!resultado.ok) {
      setAviso('Booleana recusada: ' + resultado.erro.codigo + ('detalhe' in resultado.erro ? ' — ' + resultado.erro.detalhe : ''));
      return;
    }
    aplicar([resultado.operacao]);
    setAviso('Booleana aplicada: ' + operacao + ' (Ctrl+Z desfaz).');
  };

  const aplicarMedidaDigitada = (texto: string): string | null => {
    const lido = interpretarMedida(texto);
    if (lido.tipo === 'vazio') return 'Digite uma medida.';
    if (lido.tipo === 'invalido') return 'Medida inválida — use 2,8 ou 3x4.';

    if (ferramenta === 'pushpull') {
      if (lido.tipo !== 'escalar') return 'Push/Pull aceita um número (ex.: 2,8).';
      if (face === null) return 'Clique na face antes de digitar a altura.';
      aplicarPushPull(formatarMedida(lido.valor).replace(' m', '').replace('.', ','));
      return null;
    }

    if (ferramenta === 'retangulo') {
      if (lido.tipo !== 'dimensoes') return 'Retângulo aceita largura x profundidade (ex.: 3x4).';
      if (solidoSelecionado === undefined) return 'Crie um sólido antes de desenhar.';
      if (desenho.pontos.length !== 1) return 'Clique no primeiro canto no plano.';
      const a = desenho.pontos[0];
      const b: Vetor3 = [a[0] + lido.largura, 0, a[2] + lido.profundidade];
      const resultado = operacoesDoComando({ ferramenta: 'retangulo', pontos: [a, b] }, { solido: solidoSelecionado, plano: PLANO_CHAO });
      if (!resultado.ok) return 'Não foi possível desenhar: ' + resultado.erro.codigo + '.';
      aplicar(resultado.operacoes);
      setDesenho(iniciar('retangulo'));
      setAviso('Retângulo de ' + String(lido.largura) + ' × ' + String(lido.profundidade) + ' m criado.');
      return null;
    }

    return 'Esta ferramenta ainda não aceita medida digitada.';
  };

  const cliquesRef = useRef(0);
  const ultimoAlvoRef = useRef<string | null>(null);
  const tempoCliqueRef = useRef(0);

  /** 1 clique = face/aresta · 2 = loop · 3 = sólido inteiro. */
  const registrarAlvo = (info: { solidoId: string; faceId: string | null; arestaId: string | null }): void => {
    const chave = info.solidoId + '|' + String(info.faceId) + '|' + String(info.arestaId);
    const agora = Date.now();
    if (ultimoAlvoRef.current === chave && agora - tempoCliqueRef.current < 450) {
      cliquesRef.current += 1;
    } else {
      cliquesRef.current = 1;
    }
    ultimoAlvoRef.current = chave;
    tempoCliqueRef.current = agora;

    const solido = solidos.find((item) => item.id === info.solidoId);
    if (solido === undefined) return;

    if (cliquesRef.current >= 3) {
      setSelecaoNivel({ nivel: 'sólido', arestas: solido.arestas.length, ids: [], solidoId: info.solidoId, faceId: info.faceId });
      setAviso('Sólido inteiro: ' + String(solido.vertices.length) + ' vértices, ' + String(solido.faces.length) + ' faces.');
      return;
    }

    if (cliquesRef.current === 2) {
      const arestas = info.faceId !== null ? loopDaFace(solido, info.faceId) : info.arestaId !== null ? loopDeAresta(solido, info.arestaId) : [];
      setSelecaoNivel({ nivel: 'loop', arestas: arestas.length, ids: arestas, solidoId: info.solidoId, faceId: info.faceId });
      setAviso('Loop selecionado: ' + String(arestas.length) + ' aresta(s).');
      return;
    }

    setSelecaoNivel({ nivel: info.faceId !== null ? 'face' : 'aresta', arestas: 0, ids: [], solidoId: info.solidoId, faceId: info.faceId });
    setAviso(info.faceId !== null ? 'Face selecionada.' : 'Aresta selecionada.');
  };

  const adicionarMep = (elemento: ElementoMEP): void => {
    setMep((atual) => [...atual, elemento]);
    setAviso('Tubo ' + elemento.camada + ' adicionado — confira a lista de conflitos.');
  };

  const removerMep = (id: string): void => {
    setMep((atual) => atual.filter((item) => item.id !== id));
  };

  const abrirVaoNaParede = (
    tipo: 'porta' | 'janela',
    medidas: { offset: number; largura: number; altura: number; peitoril: number },
  ): void => {
    if (projeto === null || solidoSelecionado === undefined) return;
    const parede = elementos.find((el) => el.id === 'el_' + solidoSelecionado.id && el.tipo === 'parede');
    if (parede === undefined) {
      setAviso('Converta o sólido em Parede antes de abrir vão.');
      return;
    }
    const resultado = abrirVao(parede, tipo, medidas, {
      projetoId: projeto.id,
      camadaId: camadas.camadaAtivaId,
    });
    if (!resultado.ok) {
      const erro = resultado.erro;
      setAviso('Vão recusado: ' + erro.codigo + ('detalhe' in erro ? ' — ' + erro.detalhe : ''));
      return;
    }
    aplicarBim([{ tipo: 'criar_elemento_bim', elemento: resultado.elemento }]);
    setAviso(
      (tipo === 'porta' ? 'Porta' : 'Janela') +
        ' adicionada (' + String(medidas.largura) + ' × ' + String(medidas.altura) + ' m).',
    );
  };

  const renomearSolido = (nome: string): void => {
    if (solidoSelecionado === undefined) return;
    aplicar([{ tipo: 'atualizar_solido', antes: solidoSelecionado, depois: { ...solidoSelecionado, nome } }]);
  };

  /**
   * Aplica geometria no modelador e, se o sólido já é Elemento BIM, reprojeta o elemento na
   * hora. É isto que faz o Push/Pull de uma parede convertida virar altura da parede no modelo,
   * sem o passo manual de "Atualizar no BIM".
   */
  const aplicarGeometria = (operacoes: OperacaoModelador[], solidoId: string): void => {
    if (operacoes.length === 0) return;
    const previsto = aplicarPasso(estadoModelador, operacoes, 'direta');
    aplicar(operacoes);
    if (!previsto.ok || projeto === null) return;
    if (!solidosMaterializados.includes(solidoId)) return;
    const novo = previsto.estado.solidos.find((item) => item.id === solidoId);
    if (novo === undefined) return;
    const lote = materializarSolidos(
      [novo],
      { projetoId: projeto.id, camadaId: camadas.camadaAtivaId },
      elementos,
    );
    if (lote.operacoes.length > 0) aplicarBim(lote.operacoes);
  };

  const aplicarPushPull = (alturaDigitada?: string): void => {
    if (face === null) return;
    const alvo = solidos.find((s) => s.id === face.solidoId);
    if (alvo === undefined) {
      setAviso('O sólido desta face não existe mais.');
      setFace(null);
      return;
    }
    const fonte = typeof alturaDigitada === 'string' ? alturaDigitada : altura;
    const alturaNum = Number(fonte.replace(',', '.'));
    if (!Number.isFinite(alturaNum) || alturaNum === 0) {
      setAviso('Altura inválida — informe um número diferente de zero.');
      return;
    }
    const resultado = calcularPushPull(alvo, face.faceId, alturaNum);
    if (!resultado.ok) {
      setAviso('Push/Pull recusado: ' + resultado.erro.codigo + '.');
      return;
    }
    const eraBim = solidosMaterializados.includes(alvo.id);
    aplicarGeometria(resultado.operacoes, alvo.id);
    setAviso(
      'Push/Pull de ' + String(alturaNum) + ' m aplicado em "' + alvo.nome + '"' +
        (eraBim ? ' — elemento BIM atualizado.' : '.'),
    );
    setFace(null);
  };

  /** Offset de face (SketchUp): borda paralela interna, em qualquer plano da face. */
  const aplicarOffset = (texto: string): string | null => {
    if (face === null) return 'Selecione uma face antes de aplicar o offset.';
    const alvo = solidos.find((s) => s.id === face.solidoId);
    if (alvo === undefined) {
      setFace(null);
      return 'O sólido desta face não existe mais.';
    }
    const distancia = Number(texto.replace(',', '.'));
    if (!Number.isFinite(distancia) || distancia === 0) {
      return 'Distância inválida — use 0,15.';
    }

    const resultado = offsetDaFace(alvo, face.faceId, distancia);
    if (!resultado.ok) {
      setAviso('Offset recusado: ' + resultado.erro + '.');
      if (resultado.erro === 'OFFSET_COLAPSOU') return 'Offset grande demais — encolheu até sumir.';
      return 'Não foi possível: ' + resultado.erro + '.';
    }

    const eraBim = solidosMaterializados.includes(alvo.id);
    aplicarGeometria(
      [
        { tipo: 'adicionar_vertices', solidoId: alvo.id, vertices: resultado.vertices },
        { tipo: 'adicionar_arestas', solidoId: alvo.id, arestas: resultado.arestas },
      ],
      alvo.id,
    );
    setAviso(
      'Offset de ' + formatarMedida(distancia) + ' — borda paralela criada' +
        (eraBim ? ' (BIM atualizado).' : ' (Ctrl+Z desfaz).'),
    );
    return null;
  };

  /**
   * Duplo clique numa face abre a barra de medidas com foco — em qualquer ferramenta.
   * Se a ferramenta ativa não aceita medida, passa para Push/Pull (a medida da face é a extrusão).
   */
  const abrirMedidaDaFace = (solidoId: string, faceId: string): void => {
    selecionar(solidoId);
    setFace({ solidoId, faceId });
    setSelecaoNivel({ nivel: 'face', arestas: 0, ids: [], solidoId, faceId });
    if (ferramenta !== 'pushpull') setFerramenta('pushpull');
    setFocoMedida((atual) => atual + 1);
    setAviso('Face escolhida — digite a altura e Enter (Esc cancela).');
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

    aplicarGeometria(operacoes, solidoId);
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
      <AppShell imersivo>
        <div className="arq-page-pad arq-muted">Carregando projeto…</div>
      </AppShell>
    );
  }

  if (projeto === null) {
    return (
      <AppShell imersivo>
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
      imersivo
      projeto={projeto.nome}
      salvo={salvoEm !== null}
      acoes={
        <button type="button" className="arq-btn arq-btn-salvar" onClick={salvarAgora}>
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
          <button type="button" role="tab" className="arq-tool" aria-pressed={aba === 'conflitos'} onClick={() => setAba('conflitos')}>
            Conflitos
          </button>
        </div>
        <div className="arq-header-spacer" />
        <button
          type="button"
          className="arq-tool arq-tool-icone"
          aria-pressed={painelAberto}
          aria-label={painelAberto ? 'Esconder inspetor' : 'Mostrar inspetor'}
          title={painelAberto ? 'Esconder inspetor' : 'Mostrar inspetor'}
          onClick={() => setPainelAberto((aberto) => !aberto)}
        >
          <Icone nome="lista" tamanho={18} />
        </button>
      </div>

      <div className="arq-editor-body" data-aside={painelAberto ? 'aberto' : 'fechado'}>
        {aba === 'conflitos' ? null : (
        <ToolbarModelador
          ferramenta={ferramenta}
          aoEscolher={(escolhida) => {
            // Ferramenta de desenho é desenho livre: jamais abre o modal por tabela.
            setModalInserir(false);
            setFerramenta(escolhida);
          }}
          aoNovoSolido={criarSolido}
          aoAbrirInsercao={() => setModalInserir(true)}
          aoDesfazer={desfazer}
          aoRefazer={refazer}
          podeDesfazer={indice > 0}
          podeRefazer={indice < totalPassos - 1}
          temSolido={solidoSelecionado !== undefined}
          gizmo={gizmo}
          aoGizmo={setGizmo}
          aoOffset={() => {
            setPainelAberto(true);
            setAviso('Offset: escolha a face e informe a distância no inspetor.');
          }}
          aoExcluir={excluirSelecionado}
          podeExcluir={solidoSelecionado !== undefined}
        />
        )}

        <div className="arq-editor-canvas">
          {aba === 'conflitos' ? (
            <PainelConflitos elementos={elementos} mep={mep} aoAdicionar={adicionarMep} aoRemover={removerMep} />
          ) : aba === 'modelo' ? (
            <ModeladorCanvas
              solidos={solidos}
              selecionadoId={selecionadoId}
              solidosMaterializados={solidosMaterializados}
              modo={ferramenta === 'pushpull' ? 'pushpull' : ferramenta === 'selecionar' ? 'selecionar' : 'desenho'}
              gizmo={gizmo}
              aoClicarNoPlano={aoClicarNoPlano}
              aoSelecionar={selecionar}
              aoEscolherFace={(solidoId, faceId) => {
                setFace({ solidoId, faceId });
                setAviso('Face selecionada — informe a altura e aplique o Push/Pull.');
              }}
              aoTransformar={transformarSolido}
              aoClicarPeca={registrarAlvo}
              aoDuploCliqueFace={abrirMedidaDaFace}
              faceSelecionada={
                selecaoNivel !== null && selecaoNivel.nivel === 'face' && selecaoNivel.faceId !== null
                  ? { solidoId: selecaoNivel.solidoId, faceId: selecaoNivel.faceId }
                  : null
              }
              loopSelecionado={
                selecaoNivel !== null && selecaoNivel.nivel === 'loop' && selecaoNivel.ids.length > 0
                  ? { solidoId: selecaoNivel.solidoId, arestas: selecaoNivel.ids }
                  : null
              }
            />
          ) : (
            <Viewport2D linhas={linhasPlanta} selecionadoId={selecionadoId} />
          )}
          {aba === 'modelo' ? (
            <BarraMedidas
              dica={
                ferramenta === 'pushpull'
                  ? 'Altura do Push/Pull (m)'
                  : ferramenta === 'retangulo'
                    ? 'Largura x profundidade (ex.: 3x4)'
                    : 'Medida'
              }
              aoAplicar={aplicarMedidaDigitada}
              focarEm={focoMedida}
            />
          ) : null}
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

        {aba === 'conflitos' ? null : (
        <aside className="arq-editor-aside">
          <div className="arq-inspetor-head">
            <h2>Inspetor</h2>
          </div>
          {solidoSelecionado !== undefined ? (
          <PainelPropriedades
            solido={solidoSelecionado ?? null}
            face={face}
            altura={altura}
            aoMudarAltura={setAltura}
            aoAplicarPushPull={aplicarPushPull}
            aoOffset={aplicarOffset}
            aoCancelarFace={() => setFace(null)}
            aoRenomear={renomearSolido}
            previa={previa}
            materializado={selecionadoMaterializado}
            aoMaterializar={materializarSelecionado}
            paredeId={paredeDoSolido === undefined ? null : paredeDoSolido.id}
            vaosExistentes={vaosDoSolido.length}
            aoAbrirVao={abrirVaoNaParede}
            aoTransformar={transformarSelecionado}
            aoExcluir={excluirSelecionado}
            outrosSolidos={solidos.filter((item) => item.id !== selecionadoId).map((item) => ({ id: item.id, nome: item.nome }))}
            booleanaPronta={booleanaPronta}
            aoCarregarBooleana={carregarBooleana}
            aoBooleana={booleanaComSelecionado}
          />
          ) : null}
          {solidoSelecionado !== undefined ? <div className="arq-sep" /> : null}
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
        )}
      </div>

      <div className="arq-statusbar">
        <span>{String(solidos.length)} sólido(s)</span>
        <span>{String(elementos.length)} elemento(s)</span>
        <span>selecionado: {solidoSelecionado?.nome ?? 'nenhum'}</span>
        <span>nível: {selecaoNivel === null ? '—' : selecaoNivel.nivel}{selecaoNivel !== null && selecaoNivel.arestas > 0 ? ' (' + String(selecaoNivel.arestas) + ' arestas)' : ''}</span>
        <span style={{ color: 'var(--arq-ed-suave)' }}>{aviso}</span>
        {ultimoErro !== null ? <span style={{ color: '#ea7373' }}>erro: {ultimoErro.codigo}</span> : null}
        <span style={{ marginLeft: 'auto' }}>S/L/R/C/A · P push/pull · M/O/E gizmo · Ctrl+Z</span>
      </div>
      </div>
      <ModalInserir aberto={modalInserir} aoFechar={() => setModalInserir(false)} aoInserir={inserir} />
    </AppShell>
  );
}