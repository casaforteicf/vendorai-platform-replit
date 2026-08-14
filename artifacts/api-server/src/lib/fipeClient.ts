/**
 * Cliente pra BrasilAPI — FIPE (https://brasilapi.com.br/docs#tag/FIPE).
 *
 * API pública, gratuita, sem necessidade de chave. Endpoints usados:
 * - GET /api/fipe/marcas/v1/{tipoVeiculo} → [{ nome, valor: codigoMarca }]
 * - GET /api/fipe/veiculos/v1/{tipoVeiculo}/{codigoMarca} → [{ nome, valor: codigoFipe }]
 * - GET /api/fipe/preco/v1/{codigoFipe} → [{ valor, marca, modelo, anoModelo,
 *     combustivel, codigoFipe, mesReferencia, tipoVeiculo, siglaCombustivel,
 *     dataConsulta }] (um item por ano/combustível do modelo)
 *
 * Diferente do Bulário da ANVISA, este endpoint não tem histórico conhecido
 * de bloqueio a tráfego automatizado — é usado publicamente por várias
 * ferramentas de mercado. Ainda assim, trata erro de rede e formato
 * inesperado sem derrubar o processo que chama.
 */
import type { Logger } from "pino";

const BASE_URL = "https://brasilapi.com.br/api";
const TIMEOUT_MS = 10_000;

export type TipoVeiculoFipe = "carros" | "motos" | "caminhoes";

export interface FipeMarca {
  nome: string;
  codigo: string;
}

export interface FipeVeiculo {
  nome: string;
  codigoFipe: string;
}

export interface FipePreco {
  valorTexto: string; // "R$ 55.520,00"
  valorNumero: number; // 55520.00
  marca: string;
  modelo: string;
  anoModelo: number;
  combustivel: string;
  codigoFipe: string;
  mesReferencia: string;
  tipoVeiculo: number;
}

async function fetchJson<T>(path: string, log: Logger): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) {
      log.warn({ path, status: res.status }, "brasilApiFipe: resposta não-OK");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log.warn({ err, path }, "brasilApiFipe: falha de rede");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function listarMarcas(tipoVeiculo: TipoVeiculoFipe, log: Logger): Promise<FipeMarca[] | null> {
  const data = await fetchJson<{ nome: string; valor: string }[]>(`/fipe/marcas/v1/${tipoVeiculo}`, log);
  if (!data) return null;
  return data.map((m) => ({ nome: m.nome, codigo: m.valor }));
}

export async function listarModelosPorMarca(
  tipoVeiculo: TipoVeiculoFipe,
  codigoMarca: string,
  log: Logger,
): Promise<FipeVeiculo[] | null> {
  const data = await fetchJson<{ nome: string; valor: string }[]>(`/fipe/veiculos/v1/${tipoVeiculo}/${codigoMarca}`, log);
  if (!data) return null;
  return data.map((v) => ({ nome: v.nome, codigoFipe: v.valor }));
}

export async function buscarPrecosPorCodigoFipe(codigoFipe: string, log: Logger): Promise<FipePreco[] | null> {
  const data = await fetchJson<
    { valor: string; marca: string; modelo: string; anoModelo: number; combustivel: string; codigoFipe: string; mesReferencia: string; tipoVeiculo: number }[]
  >(`/fipe/preco/v1/${encodeURIComponent(codigoFipe)}`, log);
  if (!data) return null;
  return data.map((p) => ({
    valorTexto: p.valor,
    valorNumero: Number(p.valor.replace(/[^\d,]/g, "").replace(",", ".")) || 0,
    marca: p.marca,
    modelo: p.modelo,
    anoModelo: p.anoModelo,
    combustivel: p.combustivel,
    codigoFipe: p.codigoFipe,
    mesReferencia: p.mesReferencia,
    tipoVeiculo: p.tipoVeiculo,
  }));
}

/** Acha a marca cujo nome mais se aproxima do informado (normalizado, igualdade ou substring). */
export function encontrarMarca(nomeBuscado: string, marcas: FipeMarca[]): FipeMarca | null {
  const alvo = normalizar(nomeBuscado);
  const exata = marcas.find((m) => normalizar(m.nome) === alvo);
  if (exata) return exata;
  const parcial = marcas.filter((m) => normalizar(m.nome).includes(alvo) || alvo.includes(normalizar(m.nome)));
  return parcial.length === 1 ? parcial[0]! : null;
}

/**
 * Acha o(s) modelo(s) cujo nome mais se aproxima do informado. Retorna a
 * lista de candidatos — quem chama decide o que fazer se vier mais de um
 * (nomes de modelo em texto livre do dealer raramente batem 100% com o
 * nome formal da FIPE, então ambiguidade é esperada).
 */
export function encontrarModelosCandidatos(nomeBuscado: string, modelos: FipeVeiculo[]): FipeVeiculo[] {
  const alvo = normalizar(nomeBuscado);
  const palavras = alvo.split(/\s+/).filter((w) => w.length > 1);
  return modelos
    .filter((m) => {
      const nomeNorm = normalizar(m.nome);
      return palavras.every((p) => nomeNorm.includes(p));
    })
    .slice(0, 10);
}
