/**
 * Store BIM — funções puras.
 * Aplica `OperacaoBIM` com snapshot, inverte, ordena por nível e calcula áreas.
 */

import type { ElementoBim, GeometriaParede, GeometriaPorta, GeometriaJanela, OperacaoBIM } from './schema';

export interface EstadoBim {
  elementos: ElementoBim[];
}

export type ErroBim =
  | { codigo: 'ELEMENTO_NAO_ENCONTRADO'; elementoId: string }
  | { codigo: 'ELEMENTO_DUPLICADO'; elementoId: string }
  | { codigo: 'NAO_E_PAREDE'; elementoId: string };

export type ResultadoBim = { ok: true; estado: EstadoBim } | { ok: false; erro: ErroBim };

export const ESTADO_BIM_INICIAL: EstadoBim = { elementos: [] };

function falha(erro: ErroBim): ResultadoBim {
  return { ok: false, erro };
}

function ehParede(el: ElementoBim): el is ElementoBim & { geometria: GeometriaParede } {
  return el.tipo === 'parede';
}

export function aplicarOperacaoBim(estado: EstadoBim, op: OperacaoBIM): ResultadoBim {
  switch (op.tipo) {
    case 'criar_elemento_bim': {
      if (estado.elementos.some((e) => e.id === op.elemento.id)) {
        return falha({ codigo: 'ELEMENTO_DUPLICADO', elementoId: op.elemento.id });
      }
      return { ok: true, estado: { elementos: [...estado.elementos, op.elemento] } };
    }

    case 'remover_elemento_bim': {
      if (!estado.elementos.some((e) => e.id === op.elemento.id)) {
        return falha({ codigo: 'ELEMENTO_NAO_ENCONTRADO', elementoId: op.elemento.id });
      }
      return { ok: true, estado: { elementos: estado.elementos.filter((e) => e.id !== op.elemento.id) } };
    }

    case 'atualizar_elemento_bim': {
      if (!estado.elementos.some((e) => e.id === op.antes.id)) {
        return falha({ codigo: 'ELEMENTO_NAO_ENCONTRADO', elementoId: op.antes.id });
      }
      return {
        ok: true,
        estado: { elementos: estado.elementos.map((e) => (e.id === op.antes.id ? op.depois : e)) },
      };
    }

    case 'adicionar_abertura': {
      const alvo = estado.elementos.find((e) => e.id === op.elementoId);
      if (alvo === undefined) return falha({ codigo: 'ELEMENTO_NAO_ENCONTRADO', elementoId: op.elementoId });
      if (!ehParede(alvo)) return falha({ codigo: 'NAO_E_PAREDE', elementoId: op.elementoId });
      const aberturas = [...(alvo.geometria.aberturas ?? []), op.abertura];
      const atualizado: ElementoBim = { ...alvo, geometria: { ...alvo.geometria, aberturas } };
      return { ok: true, estado: { elementos: estado.elementos.map((e) => (e.id === alvo.id ? atualizado : e)) } };
    }

    case 'remover_abertura': {
      const alvo = estado.elementos.find((e) => e.id === op.elementoId);
      if (alvo === undefined) return falha({ codigo: 'ELEMENTO_NAO_ENCONTRADO', elementoId: op.elementoId });
      if (!ehParede(alvo)) return falha({ codigo: 'NAO_E_PAREDE', elementoId: op.elementoId });
      const aberturas = (alvo.geometria.aberturas ?? []).filter((a) => a.id !== op.abertura.id);
      const atualizado: ElementoBim = { ...alvo, geometria: { ...alvo.geometria, aberturas } };
      return { ok: true, estado: { elementos: estado.elementos.map((e) => (e.id === alvo.id ? atualizado : e)) } };
    }
  }
}

export function inverterOperacaoBim(op: OperacaoBIM): OperacaoBIM[] {
  switch (op.tipo) {
    case 'criar_elemento_bim':
      return [{ tipo: 'remover_elemento_bim', elemento: op.elemento }];
    case 'remover_elemento_bim':
      return [{ tipo: 'criar_elemento_bim', elemento: op.elemento }];
    case 'atualizar_elemento_bim':
      return [{ tipo: 'atualizar_elemento_bim', antes: op.depois, depois: op.antes }];
    case 'adicionar_abertura':
      return [{ tipo: 'remover_abertura', elementoId: op.elementoId, abertura: op.abertura }];
    case 'remover_abertura':
      return [{ tipo: 'adicionar_abertura', elementoId: op.elementoId, abertura: op.abertura }];
  }
}

export function aplicarPassoBim(estado: EstadoBim, operacoes: readonly OperacaoBIM[], direcao: 'direta' | 'reversa'): ResultadoBim {
  const sequencia =
    direcao === 'direta' ? [...operacoes] : [...operacoes].reverse().flatMap((op) => inverterOperacaoBim(op));

  let atual = estado;
  for (const op of sequencia) {
    const resultado = aplicarOperacaoBim(atual, op);
    if (!resultado.ok) return resultado;
    atual = resultado.estado;
  }
  return { ok: true, estado: atual };
}

const PESO_TIPO: Record<string, number> = {
  laje: 0,
  parede: 1,
  porta: 2,
  janela: 3,
  mobiliario: 4,
  telhado: 5,
};

/** Ordena por nível e, dentro dele, por tipo. Determinístico (desempate por id). */
export function ordenarPorNivel(estado: EstadoBim): ElementoBim[] {
  return estado.elementos.slice().sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel - b.nivel;
    const pa = PESO_TIPO[a.tipo] ?? 99;
    const pb = PESO_TIPO[b.tipo] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

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

export function comprimentoParede(geometria: GeometriaParede): number {
  return Math.hypot(geometria.ponto_b[0] - geometria.ponto_a[0], geometria.ponto_b[1] - geometria.ponto_a[1]);
}

export interface MetricaNivel {
  nivel: number;
  areaLaje: number;
  areaParedeBruta: number;
  areaAberturas: number;
  areaParedeLiquida: number;
}

export interface MetricasArea {
  porNivel: MetricaNivel[];
  total: MetricaNivel;
}

/**
 * Áreas por nível. O vão contábil desconta: furo de MEP (círculo) e esquadria
 * (largura × altura) saem da área de parede.
 */
export function metricasArea(estado: EstadoBim): MetricasArea {
  const niveis = new Map<number, MetricaNivel>();

  const obter = (nivel: number): MetricaNivel => {
    const existente = niveis.get(nivel);
    if (existente !== undefined) return existente;
    const novo: MetricaNivel = { nivel, areaLaje: 0, areaParedeBruta: 0, areaAberturas: 0, areaParedeLiquida: 0 };
    niveis.set(nivel, novo);
    return novo;
  };

  const esquadriasPorParede = new Map<string, number>();
  for (const el of estado.elementos) {
    if (el.tipo === 'porta' || el.tipo === 'janela') {
      const g = el.geometria as GeometriaPorta | GeometriaJanela;
      const area = g.largura * g.altura;
      esquadriasPorParede.set(g.parede_id, (esquadriasPorParede.get(g.parede_id) ?? 0) + area);
    }
  }

  for (const el of estado.elementos) {
    if (el.tipo === 'laje') {
      const g = el.geometria as { contorno: [number, number][] };
      obter(el.nivel).areaLaje += areaPoligono(g.contorno);
    }

    if (el.tipo === 'parede' && ehParede(el)) {
      const g = el.geometria;
      const bruta = comprimentoParede(g) * g.altura;
      let furos = 0;
      for (const abertura of g.aberturas ?? []) {
        furos += Math.PI * (abertura.diametro / 2) ** 2;
      }
      const vaos = esquadriasPorParede.get(el.id) ?? 0;
      const m = obter(el.nivel);
      m.areaParedeBruta += bruta;
      m.areaAberturas += furos + vaos;
    }
  }

  const porNivel = [...niveis.values()].sort((a, b) => a.nivel - b.nivel);
  for (const m of porNivel) m.areaParedeLiquida = Math.max(0, m.areaParedeBruta - m.areaAberturas);

  const total: MetricaNivel = {
    nivel: -1,
    areaLaje: 0,
    areaParedeBruta: 0,
    areaAberturas: 0,
    areaParedeLiquida: 0,
  };
  for (const m of porNivel) {
    total.areaLaje += m.areaLaje;
    total.areaParedeBruta += m.areaParedeBruta;
    total.areaAberturas += m.areaAberturas;
    total.areaParedeLiquida += m.areaParedeLiquida;
  }

  return { porNivel, total };
}