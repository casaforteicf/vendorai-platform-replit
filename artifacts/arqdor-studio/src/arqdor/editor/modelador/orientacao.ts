/**
 * Orientação de faces de um sólido fechado.
 *
 * Escrever o winding à mão e acertar em todas as faces é fonte clássica de sólido "do avesso"
 * (foi o defeito da caixa, registrado em `caixa.ts`). Aqui a garantia é aritmética: calcula-se o
 * volume assinado pelo teorema da divergência; se vier negativo, TODAS as faces são invertidas.
 * Resultado: normal sempre para fora, independente de como a malha foi escrita.
 */

import type { Face, Vetor3, Vertice } from './schema';

function cruz(a: Vetor3, b: Vetor3): Vetor3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function produto(a: Vetor3, b: Vetor3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Volume assinado (positivo = faces apontando para fora). Triangula cada face em leque. */
export function volumeAssinado(vertices: readonly Vertice[], faces: readonly Face[]): number {
  const mapa = new Map(vertices.map((vertice) => [vertice.id, vertice.posicao]));
  let soma = 0;
  for (const face of faces) {
    const primeiro = mapa.get(face.vertices[0]);
    if (primeiro === undefined) continue;
    for (let i = 1; i < face.vertices.length - 1; i += 1) {
      const b = mapa.get(face.vertices[i]);
      const c = mapa.get(face.vertices[i + 1]);
      if (b === undefined || c === undefined) continue;
      soma += produto(primeiro, cruz(b, c));
    }
  }
  return soma / 6;
}

/**
 * Devolve as faces com winding consistente e para fora.
 *
 * Inverter "todas se o volume for negativo" só corrige o sinal GLOBAL: se a malha já vier com
 * uma face torta, o volume sai menor que o real (telhado com beiral deu 58,33 em vez de 63).
 * Aqui a coerência é propagada pela topologia — faces vizinhas percorrem a aresta compartilhada
 * em sentidos opostos — e só no fim o sinal global é fechado pelo volume.
 */
export function orientarParaFora(vertices: readonly Vertice[], faces: readonly Face[]): Face[] {
  const ordenadas: Face[] = faces.map((face) => ({ ...face, vertices: [...face.vertices] }));
  const chave = (a: string, b: string): string => (a < b ? a + '|' + b : b + '|' + a);

  // meia-aresta -> faces que a possuem, com o sentido canônico (a < b) registrado
  const porAresta = new Map<string, Array<{ indice: number; canonica: boolean }>>();
  ordenadas.forEach((face, indice) => {
    face.vertices.forEach((a, i) => {
      const b = face.vertices[(i + 1) % face.vertices.length];
      const lista = porAresta.get(chave(a, b)) ?? [];
      lista.push({ indice, canonica: a < b });
      porAresta.set(chave(a, b), lista);
    });
  });

  const inverter = new Array<boolean>(ordenadas.length).fill(false);
  const visto = new Array<boolean>(ordenadas.length).fill(false);

  for (let inicio = 0; inicio < ordenadas.length; inicio += 1) {
    if (visto[inicio]) continue;
    visto[inicio] = true;
    const fila: number[] = [inicio];

    while (fila.length > 0) {
      const atual = fila.shift() as number;
      const face = ordenadas[atual];
      for (let i = 0; i < face.vertices.length; i += 1) {
        const a = face.vertices[i];
        const b = face.vertices[(i + 1) % face.vertices.length];
        for (const vizinho of porAresta.get(chave(a, b)) ?? []) {
          if (vizinho.indice === atual || visto[vizinho.indice]) continue;
          // sentido efetivo nesta face depois de um eventual flip
          const sentidoAtual = (a < b) !== inverter[atual];
          // a vizinha precisa percorrer a mesma aresta no sentido OPOSTO
          inverter[vizinho.indice] = vizinho.canonica === sentidoAtual;
          visto[vizinho.indice] = true;
          fila.push(vizinho.indice);
        }
      }
    }
  }

  const consistentes: Face[] = ordenadas.map((face, indice) =>
    inverter[indice] ? { ...face, vertices: [...face.vertices].reverse() } : face,
  );

  if (volumeAssinado(vertices, consistentes) >= 0) return consistentes;
  return consistentes.map((face) => ({ ...face, vertices: [...face.vertices].reverse() }));
}

/** Arestas fechadas: cada aresta compartilhada por exatamente duas faces. */
export function malhaFechada(faces: readonly Face[]): boolean {
  const contagem = new Map<string, number>();
  for (const face of faces) {
    for (let i = 0; i < face.vertices.length; i += 1) {
      const a = face.vertices[i];
      const b = face.vertices[(i + 1) % face.vertices.length];
      const chave = a < b ? a + '|' + b : b + '|' + a;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
  }
  for (const usos of contagem.values()) {
    if (usos !== 2) return false;
  }
  return contagem.size > 0;
}
