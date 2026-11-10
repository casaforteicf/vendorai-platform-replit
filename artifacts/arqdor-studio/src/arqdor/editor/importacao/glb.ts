/**
 * Importação — leitura de GLB (glTF binário).
 *
 * Sem dependência externa: lê o container, o JSON e os acessores de POSITION/índices.
 * Suporta o primeiro primitivo com POSITION de cada malha.
 */

export interface MalhaImportada {
  /** Coordenadas achatadas [x,y,z, x,y,z, ...]. */
  posicoes: number[];
  /** Índices de triângulo (3 por triângulo). */
  indices: number[];
}

export type ResultadoGlb =
  | { ok: true; malha: MalhaImportada }
  | { ok: false; erro: 'ARQUIVO_INVALIDO' | 'SEM_GEOMETRIA' };

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  count?: number;
  type?: string;
}

interface BufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  byteStride?: number;
}

interface Primitivo {
  attributes?: Record<string, number>;
  indices?: number;
}

interface GltfJson {
  buffers?: Array<{ byteLength?: number }>;
  bufferViews?: BufferView[];
  accessors?: Accessor[];
  meshes?: Array<{ primitives?: Primitivo[] }>;
}

const MAGIC_GLTF = 0x46546c67;
const TIPO_JSON = 0x4e4f534a;
const TIPO_BIN = 0x004e4942;

function lerFloatAcessor(
  bin: DataView,
  accessor: Accessor,
  view: BufferView,
): number[] | null {
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') return null;
  const count = accessor.count ?? 0;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const passo = view.byteStride ?? 12;
  const valores: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const deslocamento = base + i * passo;
    if (deslocamento + 12 > bin.byteLength) return null;
    valores.push(bin.getFloat32(deslocamento, true));
    valores.push(bin.getFloat32(deslocamento + 4, true));
    valores.push(bin.getFloat32(deslocamento + 8, true));
  }
  return valores;
}

function lerIndices(bin: DataView, accessor: Accessor, view: BufferView): number[] | null {
  const count = accessor.count ?? 0;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const tipo = accessor.componentType;
  const tamanho = tipo === 5121 ? 1 : tipo === 5123 ? 2 : tipo === 5125 ? 4 : 0;
  if (tamanho === 0) return null;
  const passo = view.byteStride ?? tamanho;
  const valores: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const deslocamento = base + i * passo;
    if (deslocamento + tamanho > bin.byteLength) return null;
    valores.push(
      tipo === 5121 ? bin.getUint8(deslocamento) : tipo === 5123 ? bin.getUint16(deslocamento, true) : bin.getUint32(deslocamento, true),
    );
  }
  return valores;
}

export function lerGlb(bytes: ArrayBuffer): ResultadoGlb {
  if (bytes.byteLength < 20) return { ok: false, erro: 'ARQUIVO_INVALIDO' };
  const visao = new DataView(bytes);

  if (visao.getUint32(0, true) !== MAGIC_GLTF) return { ok: false, erro: 'ARQUIVO_INVALIDO' };
  if (visao.getUint32(4, true) !== 2) return { ok: false, erro: 'ARQUIVO_INVALIDO' };

  let deslocamento = 12;
  let json: GltfJson | null = null;
  let bin: DataView | null = null;

  while (deslocamento + 8 <= bytes.byteLength) {
    const tamanho = visao.getUint32(deslocamento, true);
    const tipo = visao.getUint32(deslocamento + 4, true);
    const inicio = deslocamento + 8;
    if (inicio + tamanho > bytes.byteLength) return { ok: false, erro: 'ARQUIVO_INVALIDO' };

    if (tipo === TIPO_JSON) {
      const texto = new TextDecoder('utf-8').decode(new Uint8Array(bytes, inicio, tamanho));
      try {
        json = JSON.parse(texto) as GltfJson;
      } catch {
        return { ok: false, erro: 'ARQUIVO_INVALIDO' };
      }
    } else if (tipo === TIPO_BIN) {
      bin = new DataView(bytes, inicio, tamanho);
    }
    deslocamento = inicio + tamanho;
  }

  if (json === null) return { ok: false, erro: 'ARQUIVO_INVALIDO' };
  if (bin === null) return { ok: false, erro: 'SEM_GEOMETRIA' };

  const acessores = json.accessors ?? [];
  const views = json.bufferViews ?? [];
  const malhas = json.meshes ?? [];

  for (const malha of malhas) {
    for (const primitivo of malha.primitives ?? []) {
      const indicePosicao = primitivo.attributes?.['POSITION'];
      if (indicePosicao === undefined) continue;
      const acessorPos = acessores[indicePosicao];
      if (acessorPos === undefined) continue;
      const viewPos = views[acessorPos.bufferView ?? -1];
      if (viewPos === undefined) continue;
      const posicoes = lerFloatAcessor(bin, acessorPos, viewPos);
      if (posicoes === null || posicoes.length < 9) continue;

      let indices: number[] | null = null;
      if (primitivo.indices !== undefined) {
        const acessorIdx = acessores[primitivo.indices];
        if (acessorIdx !== undefined) {
          const viewIdx = views[acessorIdx.bufferView ?? -1];
          if (viewIdx !== undefined) indices = lerIndices(bin, acessorIdx, viewIdx);
        }
      }
      if (indices === null) {
        indices = [];
        for (let i = 0; i < posicoes.length / 3; i += 1) indices.push(i);
      }
      if (indices.length < 3) continue;
      return { ok: true, malha: { posicoes, indices } };
    }
  }

  return { ok: false, erro: 'SEM_GEOMETRIA' };
}
