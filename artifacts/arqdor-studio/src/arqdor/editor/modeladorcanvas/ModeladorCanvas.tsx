'use client';

/** Viewport 3D do modelador. three.js fica só aqui; o domínio não conhece a lib. */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Solido, Vetor3 } from '../modelador/schema';

export interface PropsModeladorCanvas {
  solidos: readonly Solido[];
  selecionadoId: string | null;
  aoClicarNoPlano: (ponto: Vetor3) => void;
}

function construirSolido(solido: Solido, selecionado: boolean): THREE.Group {
  const grupo = new THREE.Group();
  const posicoes: number[] = [];
  const mapa = new Map(solido.vertices.map((v) => [v.id, v.posicao]));

  for (const face of solido.faces) {
    const pontos: Vetor3[] = [];
    for (const id of face.vertices) {
      const p = mapa.get(id);
      if (p !== undefined) pontos.push(p);
    }
    for (let i = 1; i < pontos.length - 1; i += 1) {
      posicoes.push(...pontos[0], ...pontos[i], ...pontos[i + 1]);
    }
  }

  if (posicoes.length > 0) {
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
    geometria.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: selecionado ? 0x2e7d32 : 0xb9c7b9,
      side: THREE.DoubleSide,
      flatShading: true,
      roughness: 0.85,
    });
    grupo.add(new THREE.Mesh(geometria, material));
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
    grupo.add(new THREE.LineSegments(geometriaArestas, new THREE.LineBasicMaterial({ color: 0x1b5e20 })));
  }

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

export function ModeladorCanvas({ solidos, selecionadoId, aoClicarNoPlano }: PropsModeladorCanvas) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cenaRef = useRef<THREE.Scene | null>(null);
  const gruposRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cliqueRef = useRef(aoClicarNoPlano);
  cliqueRef.current = aoClicarNoPlano;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    const cena = new THREE.Scene();
    cena.background = new THREE.Color(0xf5f7f5);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / Math.max(1, container.clientHeight), 0.05, 500);
    camera.position.set(7, 6, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controles = new OrbitControls(camera, renderer.domElement);
    controles.target.set(2.5, 0.6, 2);
    controles.update();

    cena.add(new THREE.HemisphereLight(0xffffff, 0x9fbf9f, 1.15));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(6, 12, 8);
    cena.add(sol);
    cena.add(new THREE.GridHelper(20, 40, 0x2e7d32, 0xc8d6c8));

    const grupos = new THREE.Group();
    cena.add(grupos);

    cenaRef.current = cena;
    gruposRef.current = grupos;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    let vivo = true;
    const animar = (): void => {
      if (!vivo) return;
      controles.update();
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
      if (Math.abs(evento.clientX - inicioX) > 4 || Math.abs(evento.clientY - inicioY) > 4) return;
      const caixa = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((evento.clientX - caixa.left) / caixa.width) * 2 - 1,
        -(((evento.clientY - caixa.top) / caixa.height) * 2 - 1),
      );
      const raio = new THREE.Raycaster();
      raio.setFromCamera(ndc, camera);
      const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const alvo = new THREE.Vector3();
      const acertou = raio.ray.intersectPlane(plano, alvo);
      if (acertou !== null) cliqueRef.current([alvo.x, alvo.y, alvo.z]);
    };
    renderer.domElement.addEventListener('pointerdown', aoPressionar);
    renderer.domElement.addEventListener('pointerup', aoSoltar);

    return () => {
      vivo = false;
      observador.disconnect();
      renderer.domElement.removeEventListener('pointerdown', aoPressionar);
      renderer.domElement.removeEventListener('pointerup', aoSoltar);
      controles.dispose();
      liberar(grupos);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      cenaRef.current = null;
      gruposRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
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
    for (const solido of solidos) {
      grupos.add(construirSolido(solido, solido.id === selecionadoId));
    }
  }, [solidos, selecionadoId]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 360 }} />;
}