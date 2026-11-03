/**
 * Aplicação de material — por ELEMENTO BIM e por FACE do sólido.
 *
 * Precedência decidida no D6: face > elemento > categoria. A face é a intenção do arquiteto;
 * o elemento é o padrão da parede inteira.
 *
 * Puro: recebe e devolve estruturas novas, nunca muta o que veio.
 */

import type { ElementoBim } from '../bim/schema';
import type { Solido } from '../modelador/schema';

export type MaterialPorFace = ReadonlyMap<string, string>;

export type ResultadoElementos =
  | { ok: true; elementos: ElementoBim[] }
  | { ok: false; erro: 'ELEMENTO_NAO_ENCONTRADO' };

export function aplicarMaterialEmElemento(
  elementos: readonly ElementoBim[],
  elementoId: string,
  materialId: string,
): ResultadoElementos {
  let achou = false;
  const atualizados = elementos.map((elemento) => {
    if (elemento.id !== elementoId) return elemento;
    achou = true;
    return { ...elemento, materialId };
  });
  if (!achou) return { ok: false, erro: 'ELEMENTO_NAO_ENCONTRADO' };
  return { ok: true, elementos: atualizados };
}

/** Remove o material do elemento (volta a herdar o padrão da categoria). */
export function removerMaterialDoElemento(elementos: readonly ElementoBim[], elementoId: string): ResultadoElementos {
  let achou = false;
  const atualizados = elementos.map((elemento) => {
    if (elemento.id !== elementoId) return elemento;
    achou = true;
    const { materialId: _descartado, ...resto } = elemento;
    void _descartado;
    return resto;
  });
  if (!achou) return { ok: false, erro: 'ELEMENTO_NAO_ENCONTRADO' };
  return { ok: true, elementos: atualizados };
}

export type ResultadoSolido =
  | { ok: true; solido: Solido }
  | { ok: false; erro: 'FACE_NAO_ENCONTRADA' };

export function aplicarMaterialEmFace(solido: Solido, faceId: string, materialId: string): ResultadoSolido {
  if (!solido.faces.some((face) => face.id === faceId)) return { ok: false, erro: 'FACE_NAO_ENCONTRADA' };
  return {
    ok: true,
    solido: {
      ...solido,
      faces: solido.faces.map((face) =>
        face.id === faceId
          ? { ...face, material: { ...(face.material ?? {}), materialId } }
          : face,
      ),
    },
  };
}

export function aplicarMaterialEmSolido(solido: Solido, materialId: string): Solido {
  return {
    ...solido,
    faces: solido.faces.map((face) => ({ ...face, material: { ...(face.material ?? {}), materialId } })),
  };
}

export function materialDaFace(solido: Solido, faceId: string): string | null {
  const face = solido.faces.find((item) => item.id === faceId);
  return face?.material?.materialId ?? null;
}

/**
 * Resolve o material efetivo de cada face: face > elemento.
 * É a função que o render e o memorial devem usar — cada um por um motivo diferente.
 */
export function materiaisEfetivos(solido: Solido, materialDoElemento: string | null): MaterialPorFace {
  const mapa = new Map<string, string>();
  for (const face of solido.faces) {
    const daFace = face.material?.materialId;
    if (daFace !== undefined) {
      mapa.set(face.id, daFace);
    } else if (materialDoElemento !== null) {
      mapa.set(face.id, materialDoElemento);
    }
  }
  return mapa;
}
