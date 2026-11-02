'use client';

/** Viewport 3D: desenha sólidos, faz picking (sólido e face) e hospeda o gizmo. */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Solido, Vetor3 } from '../modelador/schema';

export type ModoGizmo = 'mover' | 'rotacionar' | 'escalar' | null;
export type ModoInteracao = 'desenho' | 'selecionar' | 'pushpull';

export interface TransformacaoLida {
  posicao: Vetor3;
  rotacao: Vetor3;
  escala: Vetor3;
}

export interface PropsModeladorCanvas {
  solidos: readonly Solido[];
  selecionadoId: string | null;
  modo: ModoInteracao;
  gizmo: ModoGizmo;
  aoClicarNoPlano: (ponto: Vetor3) => void;
  aoSelecionar: (solidoId: string | null) => void;
  aoEscolherFace: (solidoId: string, faceId: string) => void;
  aoTransformar: (solidoId: string, transformacao: TransformacaoLida) => void;
}

const MODO_GIZMO: Record<Exclude<ModoGizmo, null>, 'translate' | 'rotate' | 'scale'> = {
  mover: 'translate',
  rotacionar: 'rotate',
  escalar: 'scale',
};

function construirSolido(solido: Solido, selecionado: boolean): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = solido.id;
  grupo.userData.solidoId = solido.id;

  const mapa = new Map(solido.vertices.map((v) => [v.id, v.posicao]));
  const posicoes: number[] = [];
  const mapaFaces: string[] = [];

  for (const face of solido.faces) {
    const pontos: Vetor3[] = [];
    for (const id of face.vertices) {
      const p = mapa.get(id);
      if (p !== undefined) pontos.push(p);
    }
    for (let i = 1; i < pontos.length - 1; i += 1) {
      posicoes.push(...pontos[0], ...pontos[i], ...pontos[i + 1]);
      mapaFaces.push(face.id);
    }
  }

  if (posicoes.length > 0) {
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
    geometria.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: selecionado ? 0x4ac59a : 0x6b7f79,
      side: THREE.DoubleSide,
      flatShading: true,
      roughness: 0.85,
    });
    const malha = new THREE.Mesh(geometria, material);
    malha.userData.mapaFaces = mapaFaces;
    grupo.add(malha);
  }

  const arestas: number[] = [];
  for (const aresta of solido.arestas) {
    const a = mapa.get(aresta.verticeA);
    const b = mapa.get(aresta.verticeB);
    if (a !== undefined && b !== undefined) arestas.push(...a, ...b);
  }
  if (arestas.length > 0) {
    const geometriaArestas = new THREE.BufferGeometry();
    geometriaArestas.setAttribute('position', new THREE.Float32BufferAttribute(arestas, 3));
    grupo.add(new THREE.LineSegments(geometriaArestas, new THREE.LineBasicMaterial({ color: 0x8fd8bd })));
  }

  const t = solido.transformacao;
  grupo.position.set(t.posicao[0], t.posicao[1], t.posicao[2]);
  grupo.rotation.set(t.rotacao[0], t.rotacao[1], t.rotacao[2]);
  grupo.scale.set(t.escala[0], t.escala[1], t.escala[2]);

  return grupo;
}

function liberar(objeto: THREE.Object3D): void {
  objeto.traverse((filho) => {
    const malha = filho as THREE.Mesh;
    if (malha.geometry !== undefined) malha.geometry.dispose();
    const material = (malha as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material !== undefined) material.dispose();
  });
}

export function ModeladorCanvas(props: PropsModeladorCanvas) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cenaRef = useRef<THREE.Scene | null>(null);
  const gruposRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gizmoRef = useRef<TransformControls | null>(null);
  const selecionadoRef = useRef<string | null>(null);

  const cliqueRef = useRef(props.aoClicarNoPlano);
  const selecionarRef = useRef(props.aoSelecionar);
  const faceRef = useRef(props.aoEscolherFace);
  const transformarRef = useRef(props.aoTransformar);
  const modoRef = useRef(props.modo);
  cliqueRef.current = props.aoClicarNoPlano;
  selecionarRef.current = props.aoSelecionar;
  faceRef.current = props.aoEscolherFace;
  transformarRef.current = props.aoTransformar;
  modoRef.current = props.modo;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const cena = new THREE.Scene();
    cena.background = new THREE.Color(0x0f1618);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / Math.max(1, container.clientHeight), 0.05, 500);
    camera.position.set(7, 6, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const orbitais = new OrbitControls(camera, renderer.domElement);
    orbitais.target.set(2.5, 0.6, 2);
    orbitais.update();

    cena.add(new THREE.HemisphereLight(0xffffff, 0x9fbf9f, 1.15));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(6, 12, 8);
    cena.add(sol);
    cena.add(new THREE.GridHelper(20, 40, 0x1f7a5f, 0x253230));

    const grupos = new THREE.Group();
    cena.add(grupos);

    const controle = new TransformControls(camera, renderer.domElement);
    controle.setSize(0.9);
    const helper = (controle as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.();
    cena.add(helper ?? (controle as unknown as THREE.Object3D));
    controle.addEventListener('dragging-changed', (evento) => {
      const valor = (evento as unknown as { value: boolean }).value;
      orbitais.enabled = !valor;
    });
    controle.addEventListener('mouseUp', () => {
      const objeto = controle.object;
      const id = objeto !== null && objeto !== undefined ? (objeto.userData.solidoId as string | undefined) : undefined;
      if (id === undefined) return;
      transformarRef.current(id, {
        posicao: [objeto.position.x, objeto.position.y, objeto.position.z],
        rotacao: [objeto.rotation.x, objeto.rotation.y, objeto.rotation.z],
        escala: [objeto.scale.x, objeto.scale.y, objeto.scale.z],
      });
    });

    cenaRef.current = cena;
    gruposRef.current = grupos;
    cameraRef.current = camera;
    gizmoRef.current = controle;

    // Seam de teste (só em desenvolvimento): projeta a ponta de um eixo do gizmo para
    // que o teste E2E consiga arrastar o ponto certo em vez de adivinhar coordenadas.
    if (process.env.NODE_ENV !== 'production') {
      const janelaTeste = window as unknown as { __arqTeste?: unknown };
      janelaTeste.__arqTeste = {
        pontaEixo: (eixo: 'x' | 'y' | 'z', fracao: number): { x: number; y: number } | null => {
          const alvo = selecionadoRef.current;
          const grupo = alvo === null ? undefined : grupos.children.find((filho) => filho.userData.solidoId === alvo);
          if (grupo === undefined) return null;
          const distancia = grupo.position.distanceTo(camera.position);
          const escala = distancia * (0.9 / 7);
          const ponto = grupo.position.clone();
          if (eixo === 'x') ponto.x += escala * fracao;
          if (eixo === 'y') ponto.y += escala * fracao;
          if (eixo === 'z') ponto.z += escala * fracao;
          ponto.project(camera);
          const caixaTela = renderer.domElement.getBoundingClientRect();
          return {
            x: caixaTela.left + ((ponto.x + 1) / 2) * caixaTela.width,
            y: caixaTela.top + ((1 - ponto.y) / 2) * caixaTela.height,
          };
        },
      };
    }

    let vivo = true;
    const animar = (): void => {
      if (!vivo) return;
      orbitais.update();
      renderer.render(cena, camera);
      requestAnimationFrame(animar);
    };
    animar();

    const observador = new ResizeObserver(() => {
      const largura = container.clientWidth;
      const altura = Math.max(1, container.clientHeight);
      camera.aspect = largura / altura;
      camera.updateProjectionMatrix();
      renderer.setSize(largura, altura);
    });
    observador.observe(container);

    let inicioX = 0;
    let inicioY = 0;
    const aoPressionar = (evento: PointerEvent): void => {
      inicioX = evento.clientX;
      inicioY = evento.clientY;
    };

    const aoSoltar = (evento: PointerEvent): void => {
      const mexeu = Math.abs(evento.clientX - inicioX) > 4 || Math.abs(evento.clientY - inicioY) > 4;
      if (mexeu) return;
      if (controle.dragging === true) return;

      const caixa = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((evento.clientX - caixa.left) / caixa.width) * 2 - 1,
        -(((evento.clientY - caixa.top) / caixa.height) * 2 - 1),
      );
      const raio = new THREE.Raycaster();
      raio.setFromCamera(ndc, camera);

      const modo = modoRef.current;

      if (modo !== 'desenho') {
        const atingidos = raio
          .intersectObjects(grupos.children, true)
          .filter((acerto) => (acerto.object as THREE.Mesh).isMesh === true);
        const primeiro = atingidos[0];
        if (primeiro !== undefined) {
          let alvo: THREE.Object3D | null = primeiro.object;
          while (alvo !== null && alvo.userData.solidoId === undefined) alvo = alvo.parent;
          const solidoId = alvo !== null ? (alvo.userData.solidoId as string | undefined) : undefined;
          if (solidoId !== undefined) {
            selecionarRef.current(solidoId);
            if (modo === 'pushpull') {
              const mapaFaces = (primeiro.object as THREE.Mesh).userData.mapaFaces as string[] | undefined;
              const indice = primeiro.faceIndex;
              if (mapaFaces !== undefined && indice !== null && indice !== undefined) {
                const faceId = mapaFaces[indice];
                if (faceId !== undefined) faceRef.current(solidoId, faceId);
              }
            }
            return;
          }
        }
        if (modo === 'selecionar') {
          selecionarRef.current(null);
          return;
        }
      }

      const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const alvoPlano = new THREE.Vector3();
      const acertou = raio.ray.intersectPlane(plano, alvoPlano);
      if (acertou !== null) cliqueRef.current([alvoPlano.x, alvoPlano.y, alvoPlano.z]);
    };

    renderer.domElement.addEventListener('pointerdown', aoPressionar);
    renderer.domElement.addEventListener('pointerup', aoSoltar);

    return () => {
      vivo = false;
      observador.disconnect();
      renderer.domElement.removeEventListener('pointerdown', aoPressionar);
      renderer.domElement.removeEventListener('pointerup', aoSoltar);
      controle.detach();
      controle.dispose();
      orbitais.dispose();
      liberar(grupos);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      cenaRef.current = null;
      gruposRef.current = null;
      cameraRef.current = null;
      gizmoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const grupos = gruposRef.current;
    if (grupos === null) return;
    liberar(grupos);
    while (grupos.children.length > 0) {
      const filho = grupos.children[0];
      grupos.remove(filho);
    }
    for (const solido of props.solidos) {
      grupos.add(construirSolido(solido, solido.id === props.selecionadoId));
    }
    selecionadoRef.current = props.selecionadoId;
  }, [props.solidos, props.selecionadoId]);

  useEffect(() => {
    const controle = gizmoRef.current;
    const grupos = gruposRef.current;
    if (controle === null || grupos === null) return;

    const alvo = props.gizmo !== null && props.selecionadoId !== null
      ? grupos.children.find((filho) => filho.userData.solidoId === props.selecionadoId)
      : undefined;

    if (alvo === undefined || props.gizmo === null) {
      controle.detach();
      return;
    }
    controle.setMode(MODO_GIZMO[props.gizmo]);
    controle.attach(alvo);
  }, [props.gizmo, props.selecionadoId, props.solidos]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}