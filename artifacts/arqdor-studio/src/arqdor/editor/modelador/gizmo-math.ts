/**
 * Matemática do gizmo — arrasto das setas.
 *
 * Por que existe: somar ângulos de Euler (`rotacao + delta`) está errado assim que existe mais
 * de um eixo. Y=90° seguido de X=90° não é o mesmo que uma única rotação (90,90,0) — e o sólido
 * "escapa" da seta. Aqui as rotações são compostas em QUATÉRNION e só no fim voltam para Euler,
 * que é o formato que o domínio guarda.
 *
 * Também concentra a projeção do arrasto num eixo, para que mover/rotacionar/escalar usem a
 * mesma convenção (delta medido no eixo da seta, em unidades do mundo).
 */

import type { Vetor3 } from './schema';

export type Quaternion = [number, number, number, number];

/** Euler XYZ (radianos, convenção do three.js) → quatérnion. */
export function eulerParaQuaternion(euler: Vetor3): Quaternion {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

/** Quatérnion → Euler XYZ, com a mesma convenção de `eulerParaQuaternion`. */
export function quaternionParaEuler(q: Quaternion): Vetor3 {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);

  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)];
  }
  // Travamento de gimbal: Y a 90° — X e Z ficam no mesmo plano, reparte em X.
  return [Math.atan2(m32, m22), ey, 0];
}

/** Produto de quatérnions: a rotação `b` aplicada DEPOIS de `a`. */
export function multiplicarQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Compõe a rotação atual com um delta (Euler, radianos) — em quatérnion, não somando ângulos.
 * Ordem: o delta é aplicado DEPOIS da rotação atual, então q = q_delta · q_atual
 * (matriz R_delta · R_atual). Inverter a multiplicação faz o sólido girar no eixo errado.
 */
export function comporRotacao(atual: Vetor3, delta: Vetor3): Vetor3 {
  const composta = multiplicarQuaternion(eulerParaQuaternion(delta), eulerParaQuaternion(atual));
  return quaternionParaEuler(composta);
}

/** Aplica uma rotação Euler a um vetor (mesma convenção usada no teste de composição). */
export function girarVetor(v: Vetor3, euler: Vetor3): Vetor3 {
  const [x, y, z, w] = eulerParaQuaternion(euler);
  const [vx, vy, vz] = v;
  // v' = q * v * q⁻¹
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** Quanto do arrasto caiu no eixo da seta (projeção do delta no vetor unitário). */
export function projetoNoEixo(delta: Vetor3, eixo: Vetor3): number {
  return delta[0] * eixo[0] + delta[1] * eixo[1] + delta[2] * eixo[2];
}

/** Fator de escala de um arrasto, sem dividir por zero (escala 0 é degenerada, vira 1). */
export function fatorDeEscala(escalaAtual: Vetor3, escalaArrastada: Vetor3): Vetor3 {
  const fator = (atual: number, novo: number): number => {
    if (Math.abs(atual) < 1e-9) return 1;
    if (!Number.isFinite(novo)) return 1;
    return novo / atual;
  };
  return [
    fator(escalaAtual[0], escalaArrastada[0]),
    fator(escalaAtual[1], escalaArrastada[1]),
    fator(escalaAtual[2], escalaArrastada[2]),
  ];
}
