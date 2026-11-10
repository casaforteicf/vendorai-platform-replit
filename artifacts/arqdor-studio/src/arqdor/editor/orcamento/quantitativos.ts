/**
 * Pilar 4 — quantitativos (puro): medir → descontar vãos → perda → agrupar → Praça.ai.
 * Unidade nunca se mistura no agrupamento (10 m² e 3 m³ do mesmo material são grupos distintos).
 */

import type {
  ElementoBim,
  GeometriaEscada,
  GeometriaJanela,
  GeometriaLaje,
  GeometriaMobiliario,
  GeometriaParede,
  GeometriaPorta,
  GeometriaTelhado,
} from '../bim/schema';

export type Unidade = 'm2' | 'm3' | 'm' | 'un';

export type Categoria =
  | 'alvenaria'
  | 'estrutura'
  | 'acabamento'
  | 'esquadria'
  | 'mobiliario'
  | 'cobertura'
  | 'mep';

export function categoriaDe(tipo: ElementoBim['tipo']): Categoria {
  switch (tipo) {
    case 'parede':
      return 'alvenaria';
    case 'laje':
      return 'estrutura';
    case 'porta':
    case 'janela':
      return 'esquadria';
    case 'mobiliario':
      return 'mobiliario';
    case 'telhado':
      return 'cobertura';
    case 'escada':
      return 'estrutura';
  }
}

export const COEFICIENTE_PERDA_PADRAO: Record<Categoria, number> = {
  alvenaria: 1.05,
  estrutura: 1.03,
  acabamento: 1.1,
  esquadria: 1.02,
  mobiliario: 1.05,
  cobertura: 1.08,
  mep: 1.1,
};

const EPS = 1e-9;

function areaPoligono(contorno: readonly (readonly [number, number])[]): number {
  if (contorno.length < 3) return 0;
  let soma = 0;
  for (let i = 0; i < contorno.length; i += 1) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    soma += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(soma) / 2;
}

export interface Medicao {
  unidade: Unidade;
  quantidade: number;
}

export function vaosPorParede(elementos: readonly ElementoBim[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const el of elementos) {
    if (el.tipo === 'porta' || el.tipo === 'janela') {
      const g = el.geometria as GeometriaPorta | GeometriaJanela;
      mapa.set(g.parede_id, (mapa.get(g.parede_id) ?? 0) + g.largura * g.altura);
    }
  }
  return mapa;
}

export function medirElemento(el: ElementoBim, vaos: Map<string, number>): Medicao[] {
  switch (el.tipo) {
    case 'parede': {
      const g = el.geometria as GeometriaParede;
      const comprimento = Math.hypot(g.ponto_b[0] - g.ponto_a[0], g.ponto_b[1] - g.ponto_a[1]);
      if (comprimento < EPS) return [];
      let aberturas = vaos.get(el.id) ?? 0;
      for (const abertura of g.aberturas ?? []) aberturas += Math.PI * (abertura.diametro / 2) ** 2;
      const areaLiquida = Math.max(0, comprimento * g.altura - aberturas);
      return [
        { unidade: 'm2', quantidade: areaLiquida },
        { unidade: 'm3', quantidade: areaLiquida * g.espessura },
      ];
    }

    case 'laje': {
      const g = el.geometria as GeometriaLaje;
      const area = areaPoligono(g.contorno);
      return [
        { unidade: 'm2', quantidade: area },
        { unidade: 'm3', quantidade: area * g.espessura },
      ];
    }

    case 'telhado': {
      const g = el.geometria as GeometriaTelhado;
      const projetada = areaPoligono(g.contorno);
      const cos = Math.cos((g.inclinacaoGraus * Math.PI) / 180);
      const inclinada = cos > EPS ? projetada / cos : projetada;
      return [{ unidade: 'm2', quantidade: inclinada }];
    }

    case 'porta':
    case 'janela': {
      const g = el.geometria as GeometriaPorta | GeometriaJanela;
      return [
        { unidade: 'un', quantidade: 1 },
        { unidade: 'm2', quantidade: g.largura * g.altura },
      ];
    }

    case 'mobiliario': {
      const g = el.geometria as GeometriaMobiliario;
      void g;
      return [{ unidade: 'un', quantidade: 1 }];
    }

    case 'escada': {
      const g = el.geometria as GeometriaEscada;
      if (g.numeroDegraus < 1 || g.largura <= EPS || g.comprimento <= EPS) return [];
      const piso = g.comprimento / g.numeroDegraus;
      const espelho = g.alturaTotal / g.numeroDegraus;
      // Volume do prisma de degraus (igual ao sólido do modelador) — não é a caixa envolvente.
      const volume = (g.largura * piso * espelho * g.numeroDegraus * (g.numeroDegraus + 1)) / 2;
      return [
        { unidade: 'm2', quantidade: g.largura * g.comprimento },
        { unidade: 'm3', quantidade: volume },
        { unidade: 'un', quantidade: g.numeroDegraus },
        { unidade: 'm', quantidade: g.alturaTotal },
      ];
    }
  }
}

export interface OpcoesQuantitativo {
  coeficientes?: Partial<Record<Categoria, number>>;
  coeficientePorMaterial?: Record<string, number>;
}

export interface ItemQuantitativo {
  elementoId: string;
  tipo: ElementoBim['tipo'];
  nivel: number;
  categoria: Categoria;
  materialId: string | null;
  unidade: Unidade;
  quantidadeBruta: number;
  coeficientePerda: number;
  quantidadeComPerda: number;
}

export interface GrupoQuantitativo {
  chave: string;
  categoria: Categoria;
  materialId: string | null;
  unidade: Unidade;
  itens: ItemQuantitativo[];
  quantidadeBruta: number;
  quantidadeComPerda: number;
}

export interface ResumoQuantitativo {
  itens: ItemQuantitativo[];
  grupos: GrupoQuantitativo[];
  totalPorUnidade: Array<{ unidade: Unidade; quantidadeComPerda: number }>;
}

export function coeficienteDe(
  tipo: ElementoBim['tipo'],
  materialId: string | null,
  opcoes: OpcoesQuantitativo,
): number {
  if (materialId !== null && opcoes.coeficientePorMaterial !== undefined) {
    const porMaterial = opcoes.coeficientePorMaterial[materialId];
    if (porMaterial !== undefined) return porMaterial;
  }
  const categoria = categoriaDe(tipo);
  const porCategoria = opcoes.coeficientes?.[categoria];
  return porCategoria !== undefined ? porCategoria : COEFICIENTE_PERDA_PADRAO[categoria];
}

export function quantitativos(elementos: readonly ElementoBim[], opcoes: OpcoesQuantitativo = {}): ResumoQuantitativo {
  const vaos = vaosPorParede(elementos);
  const itens: ItemQuantitativo[] = [];

  for (const el of elementos) {
    const materialId = el.materialId ?? null;
    const categoria = categoriaDe(el.tipo);
    const coeficiente = coeficienteDe(el.tipo, materialId, opcoes);

    for (const medicao of medirElemento(el, vaos)) {
      // Perda é para material contínuo. Unidade 'un' é contagem: ninguém compra 1,03 porta.
      const coeficienteAplicado = medicao.unidade === 'un' ? 1 : coeficiente;
      itens.push({
        elementoId: el.id,
        tipo: el.tipo,
        nivel: el.nivel,
        categoria,
        materialId,
        unidade: medicao.unidade,
        quantidadeBruta: medicao.quantidade,
        coeficientePerda: coeficienteAplicado,
        quantidadeComPerda: medicao.quantidade * coeficienteAplicado,
      });
    }
  }

  const mapa = new Map<string, GrupoQuantitativo>();
  for (const item of itens) {
    const chave = item.categoria + '|' + String(item.materialId) + '|' + item.unidade;
    const existente = mapa.get(chave);
    if (existente === undefined) {
      mapa.set(chave, {
        chave,
        categoria: item.categoria,
        materialId: item.materialId,
        unidade: item.unidade,
        itens: [item],
        quantidadeBruta: item.quantidadeBruta,
        quantidadeComPerda: item.quantidadeComPerda,
      });
    } else {
      existente.itens.push(item);
      existente.quantidadeBruta += item.quantidadeBruta;
      existente.quantidadeComPerda += item.quantidadeComPerda;
    }
  }

  const porUnidade = new Map<Unidade, number>();
  for (const item of itens) {
    porUnidade.set(item.unidade, (porUnidade.get(item.unidade) ?? 0) + item.quantidadeComPerda);
  }

  return {
    itens,
    grupos: [...mapa.values()].sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0)),
    totalPorUnidade: [...porUnidade.entries()].map(([unidade, quantidadeComPerda]) => ({ unidade, quantidadeComPerda })),
  };
}

export const MAPA_PRACA_PADRAO: Record<Categoria, string> = {
  alvenaria: 'PRC-ALV-001',
  estrutura: 'PRC-EST-002',
  acabamento: 'PRC-ACA-003',
  esquadria: 'PRC-ESQ-004',
  mobiliario: 'PRC-MOB-005',
  cobertura: 'PRC-COB-006',
  mep: 'PRC-MEP-007',
};

export interface ItemPraca {
  codigoPraca: string;
  unidade: Unidade;
  quantidade: number;
}

export function codigoPracaDe(item: ItemQuantitativo, mapa: Record<string, string> = MAPA_PRACA_PADRAO): string {
  if (item.materialId !== null) {
    const porMaterial = mapa[item.materialId];
    if (porMaterial !== undefined) return porMaterial;
  }
  const porCategoria = mapa[item.categoria];
  return porCategoria !== undefined ? porCategoria : 'PRC-INDEFINIDO';
}

export function paraPraca(
  grupos: readonly GrupoQuantitativo[],
  mapa: Record<string, string> = MAPA_PRACA_PADRAO,
): ItemPraca[] {
  const mapaItens = new Map<string, ItemPraca>();
  for (const grupo of grupos) {
    const porMaterial = grupo.materialId !== null ? mapa[grupo.materialId] : undefined;
    const codigo = porMaterial !== undefined ? porMaterial : (mapa[grupo.categoria] ?? 'PRC-INDEFINIDO');
    const chave = codigo + '|' + grupo.unidade;
    const existente = mapaItens.get(chave);
    if (existente === undefined) {
      mapaItens.set(chave, { codigoPraca: codigo, unidade: grupo.unidade, quantidade: grupo.quantidadeComPerda });
    } else {
      existente.quantidade += grupo.quantidadeComPerda;
    }
  }
  return [...mapaItens.values()].sort((a, b) => (a.codigoPraca < b.codigoPraca ? -1 : a.codigoPraca > b.codigoPraca ? 1 : 0));
}

export const BANDA_PRACA = { minimo: 0.5, maximo: 3 } as const;

export type ValidacaoPreco =
  | { ok: true; fator: number }
  | { ok: false; motivo: 'ABAIXO_DO_PISO' | 'ACIMA_DO_TETO' | 'REFERENCIA_INVALIDA'; fator: number };

export function validarPrecoPraca(referencia: number, cotado: number): ValidacaoPreco {
  if (!Number.isFinite(referencia) || referencia <= 0) return { ok: false, motivo: 'REFERENCIA_INVALIDA', fator: 0 };
  const fator = cotado / referencia;
  if (fator < BANDA_PRACA.minimo) return { ok: false, motivo: 'ABAIXO_DO_PISO', fator };
  if (fator > BANDA_PRACA.maximo) return { ok: false, motivo: 'ACIMA_DO_TETO', fator };
  return { ok: true, fator };
}