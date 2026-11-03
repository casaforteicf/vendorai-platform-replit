/**
 * Client HTTP do módulo A&B (Alimentos & Bebidas) — Hotelaria.
 *
 * Fonte de verdade do contrato: `artifacts/api-server/src/routes/ab_cargos.ts`
 * (lote AB-01/AB-02). A API responde em `snake_case` e o isolamento por hotel é
 * feito por (1) guard de tenant no JWT e (2) RLS no banco — o frontend não
 * precisa (nem deve) filtrar tenant, só mandar o `tenantId` correto na URL.
 *
 * Decisões:
 *  - `camelCase` na borda da UI: a conversão fica confinada em `mapearCargo`,
 *    então uma mudança de contrato mexe em um único ponto.
 *  - Mensagem de erro em pt-BR por status: o backend devolve texto em inglês
 *    ("Cargo with this name already exists..."), o que é ruim para o operador.
 *    Para status conhecidos usamos a tabela local; para o resto, o texto do
 *    servidor serve de fallback.
 *  - Nenhum estado global: as funções recebem `AbAuth` explicitamente, o que as
 *    torna testáveis sem React (ver `client.test.ts`).
 */

/** Cargo operacional de A&B, já normalizado para a UI. */
export type Cargo = {
  id: string;
  tenantId: string;
  nome: string;
  /** Slug do setor (ver `setores.ts`). A API aceita texto livre de 1 a 80 chars. */
  setor: string;
  descricao: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CargoInput = {
  nome: string;
  setor: string;
  descricao?: string | null;
  ativo?: boolean;
};

export type CargoPatch = Partial<CargoInput>;

export type CargoFiltro = {
  ativo?: boolean;
  setor?: string;
};

/** Credenciais da requisição: token do JWT + hotel da sessão. */
export type AbAuth = {
  token: string;
  tenantId: string;
};

/** Linha crua devolvida pela API (`snake_case`). */
type LinhaCargo = {
  id: string;
  tenant_id: string;
  nome: string;
  setor: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export class AbApiError extends Error {
  readonly status: number;
  /** Campos apontados pela API em respostas 422 (ex.: `["nome"]`). */
  readonly fields: string[];
  readonly body: unknown;

  constructor(status: number, message: string, fields: string[] = [], body: unknown = null) {
    super(message);
    this.name = "AbApiError";
    this.status = status;
    this.fields = fields;
    this.body = body;
  }
}

const MENSAGEM_POR_STATUS: Record<number, string> = {
  400: "Requisição inválida.",
  401: "Sessão expirada. Entre novamente.",
  403: "Você não tem permissão para acessar os cargos deste hotel.",
  404: "Cargo não encontrado.",
  409: "Já existe um cargo com esse nome neste hotel.",
  422: "Dados inválidos. Revise os campos destacados.",
  500: "Erro no servidor ao falar com os cargos. Tente novamente.",
};

function urlCargos(auth: AbAuth, sufixo: string): string {
  return `/api/tenants/${encodeURIComponent(auth.tenantId)}/ab/cargos${sufixo}`;
}

function corpoObjeto(corpo: unknown): Record<string, unknown> {
  return corpo !== null && typeof corpo === "object" ? (corpo as Record<string, unknown>) : {};
}

function textoDoServidor(corpo: unknown): string | null {
  const { error } = corpoObjeto(corpo);
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

function camposInvalidos(corpo: unknown): string[] {
  const { fields } = corpoObjeto(corpo);
  return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === "string") : [];
}

function mensagemDeErro(status: number, corpo: unknown): string {
  return (
    MENSAGEM_POR_STATUS[status] ??
    textoDoServidor(corpo) ??
    `Falha na comunicação com a API (HTTP ${status}).`
  );
}

async function requisitar<T>(auth: AbAuth, url: string, init: RequestInit = {}): Promise<T> {
  if (!auth.token) {
    throw new AbApiError(401, "Sessão expirada. Entre novamente.");
  }
  if (!auth.tenantId) {
    throw new AbApiError(400, "Hotel não identificado na sessão.");
  }

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AbApiError(0, "Não foi possível conectar ao servidor. Verifique a conexão.");
  }

  const texto = await resposta.text();
  let corpo: unknown = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = texto;
    }
  }

  if (!resposta.ok) {
    throw new AbApiError(
      resposta.status,
      mensagemDeErro(resposta.status, corpo),
      camposInvalidos(corpo),
      corpo,
    );
  }

  return corpo as T;
}

function mapearCargo(linha: LinhaCargo): Cargo {
  return {
    id: linha.id,
    tenantId: linha.tenant_id,
    nome: linha.nome,
    setor: linha.setor,
    descricao: linha.descricao ?? null,
    ativo: linha.ativo,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

/**
 * Lista os cargos do hotel, ordenados por nome (a ordenação é do servidor).
 * Os filtros são opcionais e repassados como query string.
 */
export async function listarCargos(auth: AbAuth, filtro: CargoFiltro = {}): Promise<Cargo[]> {
  const params = new URLSearchParams();
  if (filtro.ativo !== undefined) params.set("ativo", String(filtro.ativo));
  if (filtro.setor) params.set("setor", filtro.setor);
  const query = params.toString();

  const linhas = await requisitar<LinhaCargo[]>(
    auth,
    urlCargos(auth, query ? `?${query}` : ""),
  );

  return Array.isArray(linhas) ? linhas.map(mapearCargo) : [];
}

export async function criarCargo(auth: AbAuth, entrada: CargoInput): Promise<Cargo> {
  const linha = await requisitar<LinhaCargo>(auth, urlCargos(auth, ""), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
  return mapearCargo(linha);
}

export async function atualizarCargo(
  auth: AbAuth,
  id: string,
  alteracao: CargoPatch,
): Promise<Cargo> {
  const linha = await requisitar<LinhaCargo>(auth, urlCargos(auth, `/${encodeURIComponent(id)}`), {
    method: "PATCH",
    body: JSON.stringify(alteracao),
  });
  return mapearCargo(linha);
}

/** Mensagem para a tela: erros da API já vêm em pt-BR; o resto é genérico. */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof AbApiError) {
    if (erro.fields.length > 0) {
      return `${erro.message} (campos: ${erro.fields.join(", ")})`;
    }
    return erro.message;
  }
  if (erro instanceof Error && erro.message) return erro.message;
  return "Não foi possível concluir a operação. Tente novamente.";
}

// ─── Sobras ──────────────────────────────────────────────────────────────────

/**
 * As rotas de sobras/fichas (Drizzle) devolvem os nomes em camelCase, como
 * declarados no schema — ao contrário de ab_cargos, que é SQL cru em snake_case.
 */
export type Sobra = {
  id: string;
  data: string;
  insumoId: string | null;
  insumoNome: string;
  /** numeric do Postgres chega como string. */
  pesoKg: string;
  motivo: string;
  fotoUrl: string | null;
  observacao: string | null;
  registradoPor: string | null;
  createdAt: string;
};

export type SobraInput = {
  data: string;
  insumoId?: string | null;
  insumoNome: string;
  pesoKg: number;
  motivo: string;
  fotoUrl?: string | null;
  observacao?: string | null;
};

export type SobrasResposta = {
  sobras: Sobra[];
  resumo: { totalRegistros: number; totalKg: number; porMotivo: Record<string, number> };
};

function urlAb(auth: AbAuth, sufixo: string): string {
  return `/api/tenants/${encodeURIComponent(auth.tenantId)}/ab${sufixo}`;
}

export async function criarSobra(auth: AbAuth, entrada: SobraInput): Promise<Sobra> {
  return requisitar<Sobra>(auth, urlAb(auth, "/sobras"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function listarSobras(
  auth: AbAuth,
  filtro: { dataInicio?: string; dataFim?: string; motivo?: string } = {},
): Promise<SobrasResposta> {
  const params = new URLSearchParams();
  if (filtro.dataInicio) params.set("dataInicio", filtro.dataInicio);
  if (filtro.dataFim) params.set("dataFim", filtro.dataFim);
  if (filtro.motivo) params.set("motivo", filtro.motivo);
  const query = params.toString();

  return requisitar<SobrasResposta>(auth, urlAb(auth, `/sobras${query ? `?${query}` : ""}`));
}

// ─── Fichas técnicas ─────────────────────────────────────────────────────────

export type FichaInsumo = {
  id: string;
  fichaId: string;
  insumoId: string | null;
  insumoNome: string;
  unidadeBase: "g" | "ml" | "un";
  quantidadePorPorcao: string;
  fatorCorrecao: string;
  ordem: number;
};

export type FichaTecnica = {
  id: string;
  nome: string;
  rendimentoPorcoes: string;
  observacoes: string | null;
  ativo: boolean;
  insumos: FichaInsumo[];
};

export type FichaInput = {
  nome: string;
  rendimentoPorcoes: number;
  observacoes?: string | null;
  insumos: Array<{
    insumoNome: string;
    unidadeBase: "g" | "ml" | "un";
    quantidadePorPorcao: number;
    fatorCorrecao?: number;
  }>;
};

export async function criarFicha(auth: AbAuth, entrada: FichaInput): Promise<FichaTecnica> {
  return requisitar<FichaTecnica>(auth, urlAb(auth, "/fichas-tecnicas"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function listarFichas(auth: AbAuth): Promise<FichaTecnica[]> {
  const resposta = await requisitar<{ fichas: FichaTecnica[] }>(
    auth,
    urlAb(auth, "/fichas-tecnicas"),
  );
  return resposta.fichas ?? [];
}

// ─── Catálogo de insumos e mapa produto → insumo (AB-05) ─────────────────────

export type InsumoCatalogo = {
  id: string;
  nome: string;
  unidade: string;
  codigo: string | null;
};

export type MapeamentoInsumoProduto = {
  id: string;
  insumoId: string;
  produtoCatalogoId: string;
  fatorEmbalagem: string | null;
  insumoNome: string | null;
  insumoUnidade: string | null;
  produtoNome: string | null;
  produtoSku: string | null;
  produtoUnidade: string | null;
};

export type MapeamentoInput = {
  produtoCatalogoId: string;
  insumoId: string;
  /** Quantas unidades base do insumo há em 1 unidade de estoque. Nulo = métrica. */
  fatorEmbalagem?: number | null;
};

export async function listarInsumos(auth: AbAuth): Promise<InsumoCatalogo[]> {
  const resposta = await requisitar<{ insumos: InsumoCatalogo[] }>(auth, urlAb(auth, "/insumos"));
  return resposta.insumos ?? [];
}

export async function listarMapeamentos(auth: AbAuth): Promise<MapeamentoInsumoProduto[]> {
  const resposta = await requisitar<{ mapeamentos: MapeamentoInsumoProduto[] }>(
    auth,
    urlAb(auth, "/insumo-produto"),
  );
  return resposta.mapeamentos ?? [];
}

export async function salvarMapeamento(
  auth: AbAuth,
  entrada: MapeamentoInput,
): Promise<MapeamentoInsumoProduto> {
  return requisitar<MapeamentoInsumoProduto>(auth, urlAb(auth, "/insumo-produto"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function removerMapeamento(auth: AbAuth, produtoCatalogoId: string): Promise<void> {
  await requisitar<null>(
    auth,
    urlAb(auth, `/insumo-produto/${encodeURIComponent(produtoCatalogoId)}`),
    { method: "DELETE" },
  );
}

// ─── Recebimentos (AB-06) ────────────────────────────────────────────────────

export type Recebimento = {
  id: string;
  produtoCatalogoId: string;
  notaFiscal: string;
  fornecedor: string | null;
  lote: string;
  dataValidade: string;
  temperaturaC: string | null;
  quantidade: string;
  unidade: string;
  /** Calculado no servidor — nunca enviado pelo cliente. */
  etiquetaFefo: string;
  status: string;
  motivoBloqueio: string | null;
  createdAt: string;
  produtoNome?: string | null;
  categoria?: string | null;
  /** Resultado da entrada em estoque (AB-07). Ausente no GET de listagem. */
  estoque?: {
    aplicado: boolean;
    motivo?: string;
    quantidadeEstoque?: number;
    unidadeEstoque?: string;
  } | null;
};

export type RecebimentoInput = {
  produtoCatalogoId: string;
  notaFiscal: string;
  fornecedor?: string | null;
  lote: string;
  dataValidade: string;
  temperaturaC?: number | null;
  quantidade: number;
  unidade: "g" | "ml" | "un";
};

export async function criarRecebimento(
  auth: AbAuth,
  entrada: RecebimentoInput,
): Promise<Recebimento> {
  return requisitar<Recebimento>(auth, urlAb(auth, "/recebimentos"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function listarRecebimentos(
  auth: AbAuth,
  limite = 50,
): Promise<{ recebimentos: Recebimento[]; resumo: Record<string, number> }> {
  return requisitar<{ recebimentos: Recebimento[]; resumo: Record<string, number> }>(
    auth,
    urlAb(auth, `/recebimentos?limite=${limite}`),
  );
}

// ─── Requisições (AB-08) ─────────────────────────────────────────────────────

export type Requisicao = {
  id: string;
  setor: string;
  insumoId: string;
  quantidadeBase: string;
  unidadeBase: string;
  status: "pendente" | "aprovada" | "entregue";
  dataSolicitacao: string;
  baixaAplicadaEm: string | null;
  createdAt: string;
  insumoNome: string | null;
};

export type RequisicaoInput = {
  setor: string;
  insumoId: string;
  quantidadeBase: number;
  dataSolicitacao?: string;
};

export async function criarRequisicao(
  auth: AbAuth,
  entrada: RequisicaoInput,
): Promise<Requisicao> {
  return requisitar<Requisicao>(auth, urlAb(auth, "/requisicoes"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function listarRequisicoes(
  auth: AbAuth,
  status?: Requisicao["status"],
): Promise<{ requisicoes: Requisicao[]; resumo: { total: number; pendentes: number } }> {
  const query = status ? `?status=${status}` : "";
  return requisitar<{ requisicoes: Requisicao[]; resumo: { total: number; pendentes: number } }>(
    auth,
    urlAb(auth, `/requisicoes${query}`),
  );
}

export async function entregarRequisicao(
  auth: AbAuth,
  id: string,
): Promise<{ status: string; baixa: { quantidadeEstoque: number; unidadeEstoque: string } }> {
  return requisitar<{ status: string; baixa: { quantidadeEstoque: number; unidadeEstoque: string } }>(
    auth,
    urlAb(auth, `/requisicoes/${encodeURIComponent(id)}/entregar`),
    { method: "PATCH" },
  );
}

// ─── Dashboard de CMV (AB-09) ────────────────────────────────────────────────

export type CmvDashboard = {
  mes: string;
  competencia: { inicio: string; fim: string };
  compras: { valor: number; recebimentos: number; semCusto: number; estimado: boolean; observacao: string };
  producao: { valor: number | null; motivo: string };
  desperdicio: {
    valor: number;
    kg: number;
    semCusto: number;
    porDia: Array<{ data: string; kg: number; valor: number }>;
  };
  estoque: { valor: number; insumosSemPreco: number };
  receita: { valor: number; mock: boolean; observacao: string };
  cmv: { valor: number | null; percentual: number | null; formula: string };
};

export async function buscarCmv(
  auth: AbAuth,
  opcoes: { mes?: string; receita?: number } = {},
): Promise<CmvDashboard> {
  const params = new URLSearchParams();
  if (opcoes.mes) params.set("mes", opcoes.mes);
  if (opcoes.receita !== undefined) params.set("receita", String(opcoes.receita));
  const query = params.toString();
  return requisitar<CmvDashboard>(auth, urlAb(auth, `/dashboard/cmv${query ? `?${query}` : ""}`));
}
