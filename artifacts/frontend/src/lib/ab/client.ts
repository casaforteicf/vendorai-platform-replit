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
  modoPreparo: string | null;
  observacoes: string | null;
  ativo: boolean;
  insumos: FichaInsumo[];
};

export type FichaInput = {
  nome: string;
  rendimentoPorcoes: number;
  modoPreparo?: string | null;
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

export async function atualizarFicha(
  auth: AbAuth,
  id: string,
  entrada: FichaInput,
): Promise<FichaTecnica> {
  return requisitar<FichaTecnica>(auth, urlAb(auth, `/fichas-tecnicas/${encodeURIComponent(id)}`), {
    method: "PATCH",
    body: JSON.stringify(entrada),
  });
}

export async function excluirFicha(auth: AbAuth, id: string): Promise<void> {
  await requisitar<null>(auth, urlAb(auth, `/fichas-tecnicas/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
}

export async function listarFichas(auth: AbAuth): Promise<FichaTecnica[]> {
  const resposta = await requisitar<{ fichas: FichaTecnica[] }>(
    auth,
    urlAb(auth, "/fichas-tecnicas"),
  );
  return resposta.fichas ?? [];
}

// ─── Equipe e escala ────────────────────────────────────────────────────────

export type Equipe = {
  id: string;
  nome: string;
  cargoId: string | null;
  cargoNome: string | null;
  diasSemana: number[];
  horaInicio: string;
  intervaloInicio: string | null;
  intervaloFim: string | null;
  horaFim: string;
  ativo: boolean;
};

export type EquipeInput = {
  nome: string;
  cargoId?: string | null;
  diasSemana: number[];
  horaInicio: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  horaFim: string;
  ativo?: boolean;
};

export async function listarEquipe(auth: AbAuth): Promise<Equipe[]> {
  const resposta = await requisitar<{ equipe: Equipe[] }>(auth, urlAb(auth, "/equipe"));
  return resposta.equipe ?? [];
}

export async function criarEquipe(auth: AbAuth, entrada: EquipeInput): Promise<Equipe> {
  return requisitar<Equipe>(auth, urlAb(auth, "/equipe"), { method: "POST", body: JSON.stringify(entrada) });
}

export async function atualizarEquipe(auth: AbAuth, id: string, entrada: Partial<EquipeInput>): Promise<Equipe> {
  return requisitar<Equipe>(auth, urlAb(auth, `/equipe/${encodeURIComponent(id)}`), { method: "PATCH", body: JSON.stringify(entrada) });
}

export async function excluirEquipe(auth: AbAuth, id: string): Promise<void> {
  await requisitar<null>(auth, urlAb(auth, `/equipe/${encodeURIComponent(id)}`), { method: "DELETE" });
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

export type InsumoRecebimento = {
  id: string;
  nome: string;
  unidade: "g" | "ml" | "un" | string;
  categoria: string | null;
};

export async function listarInsumosRecebimento(auth: AbAuth): Promise<InsumoRecebimento[]> {
  const resposta = await requisitar<{ ingredientes: Array<Record<string, unknown>> }>(
    auth,
    `/api/tenants/${encodeURIComponent(auth.tenantId)}/restaurante/ingredientes`,
  );
  return (resposta.ingredientes ?? []).map((insumo) => ({
    id: String(insumo.id),
    nome: String(insumo.nome ?? "Insumo"),
    unidade: String(insumo.unidade ?? "un"),
    categoria: insumo.categoria ? String(insumo.categoria) : null,
  }));
}

export type EntregaPendenteItem = {
  id: string;
  ordemId: string;
  insumoId: string;
  insumoNome: string;
  quantidade: string;
  quantidadeRecebida: string;
  unidade: "g" | "ml" | "un";
};

export type EntregaPendente = {
  id: string;
  coberturaInicio: string;
  coberturaFim: string;
  status: string;
  fornecedor: string | null;
  dataEntregaPrevista: string | null;
  itens: EntregaPendenteItem[];
};

export async function listarEntregasPendentes(auth: AbAuth): Promise<EntregaPendente[]> {
  const resposta = await requisitar<{ pedidos: EntregaPendente[] }>(
    auth,
    urlAb(auth, "/recebimentos/pendentes"),
  );
  return resposta.pedidos ?? [];
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
  insumoId?: string | null;
  produtoCatalogoId?: string | null;
  ordemId?: string | null;
  ordemItemId?: string | null;
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
  produtoCatalogoId?: string | null;
  insumoId?: string | null;
  notaFiscal: string;
  fornecedor?: string | null;
  lote: string;
  dataValidade: string;
  temperaturaC?: number | null;
  quantidade: number;
  unidade: "g" | "ml" | "un";
  ordemId?: string | null;
  ordemItemId?: string | null;
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

// ─── Cardápios por data/serviço (AB-10) ─────────────────────────────────────

export type CardapioServico = "cafe_manha" | "almoco" | "jantar" | "outro";

export type CardapioItem = {
  id: string;
  tenantId: string;
  cardapioId: string;
  fichaId: string;
  fichaNome: string;
  categoria: "proteina" | "acompanhamento" | "outro";
  percentualRateio: string | null;
  modeloItemId: string | null;
  porcoesPorPax: string;
  ordem: number;
  observacao: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Cardapio = {
  id: string;
  tenantId: string;
  nome: string;
  data: string;
  servico: CardapioServico;
  modeloId: string | null;
  ativo: boolean;
  observacao: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  itens: CardapioItem[];
};

export type BriffingPrevisao = {
  id: string;
  data: string;
  servico: CardapioServico;
  ocupacao: number;
  evento: string | null;
  observacoes: string | null;
  updatedAt: string;
};

export async function listarPrevisoesBriffing(
  auth: AbAuth,
  filtro?: { data?: string; de?: string; ate?: string; servico?: CardapioServico },
): Promise<BriffingPrevisao[]> {
  const params = new URLSearchParams();
  if (filtro?.data) params.set("data", filtro.data);
  if (filtro?.de) params.set("de", filtro.de);
  if (filtro?.ate) params.set("ate", filtro.ate);
  if (filtro?.servico) params.set("servico", filtro.servico);
  const sufixo = params.toString() ? `/briffing/previsoes?${params.toString()}` : "/briffing/previsoes";
  const resposta = await requisitar<{ previsoes: BriffingPrevisao[] }>(auth, urlAb(auth, sufixo));
  return resposta.previsoes ?? [];
}

export async function salvarPrevisaoBriffing(
  auth: AbAuth,
  entrada: { data: string; servico: CardapioServico; ocupacao: number; evento?: string | null; observacoes?: string | null },
): Promise<BriffingPrevisao> {
  return requisitar<BriffingPrevisao>(auth, urlAb(auth, "/briffing/previsoes"), {
    method: "PUT",
    body: JSON.stringify(entrada),
  });
}

export async function excluirPrevisaoBriffing(auth: AbAuth, id: string): Promise<void> {
  await requisitar<null>(auth, urlAb(auth, `/briffing/previsoes/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
}

export type CategoriaItemCardapio = "proteina" | "acompanhamento" | "outro";

export type CardapioItemInput = {
  fichaId: string;
  categoria?: CategoriaItemCardapio;
  percentualRateio?: number | null;
  porcoesPorPax?: number;
  ordem?: number;
  observacao?: string | null;
};

export type CardapioInput = {
  nome: string;
  data: string;
  servico: CardapioServico;
  ativo?: boolean;
  observacao?: string | null;
  itens: CardapioItemInput[];
};

export type CardapioPatch = Partial<Omit<CardapioInput, "itens">> & {
  itens?: CardapioItemInput[];
};

export async function listarCardapios(
  auth: AbAuth,
  filtro: { data?: string; servico?: CardapioServico; incluirInativos?: boolean } = {},
): Promise<Cardapio[]> {
  const params = new URLSearchParams();
  if (filtro.data) params.set("data", filtro.data);
  if (filtro.servico) params.set("servico", filtro.servico);
  if (filtro.incluirInativos) params.set("incluirInativos", "true");
  const query = params.toString();
  const resposta = await requisitar<{ cardapios: Cardapio[] }>(
    auth,
    urlAb(auth, `/cardapios${query ? `?${query}` : ""}`),
  );
  return resposta.cardapios ?? [];
}

export async function obterCardapio(auth: AbAuth, id: string): Promise<Cardapio> {
  return requisitar<Cardapio>(auth, urlAb(auth, `/cardapios/${encodeURIComponent(id)}`));
}

export async function criarCardapio(auth: AbAuth, entrada: CardapioInput): Promise<Cardapio> {
  return requisitar<Cardapio>(auth, urlAb(auth, "/cardapios"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function atualizarCardapio(
  auth: AbAuth,
  id: string,
  alteracao: CardapioPatch,
): Promise<Cardapio> {
  return requisitar<Cardapio>(auth, urlAb(auth, `/cardapios/${encodeURIComponent(id)}`), {
    method: "PATCH",
    body: JSON.stringify(alteracao),
  });
}

export async function excluirCardapio(auth: AbAuth, id: string): Promise<void> {
  await requisitar<null>(auth, urlAb(auth, `/cardapios/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
}

// ─── Modelos de cardápio, grade e escala ────────────────────────────────────

export type CardapioModeloItem = {
  id: string;
  modeloId: string;
  fichaId: string;
  fichaNome: string;
  categoria: CategoriaItemCardapio;
  percentualRateio: string | null;
  ordem: number;
  observacao: string | null;
};

export type CardapioModelo = {
  id: string;
  nome: string;
  servico: CardapioServico;
  ativo: boolean;
  observacao: string | null;
  itens: CardapioModeloItem[];
};

export type CardapioModeloInput = {
  nome: string;
  servico: CardapioServico;
  ativo?: boolean;
  observacao?: string | null;
  itens: Array<{
    fichaId: string;
    categoria: CategoriaItemCardapio;
    percentualRateio?: number | null;
    ordem?: number;
    observacao?: string | null;
  }>;
};

export type CardapioGradeRegra = {
  id: string;
  diaSemana: number;
  servico: CardapioServico;
  modeloId: string;
  ativo: boolean;
};

export async function listarModelosCardapio(auth: AbAuth): Promise<CardapioModelo[]> {
  const resposta = await requisitar<{ modelos: CardapioModelo[] }>(auth, urlAb(auth, "/cardapio-modelos"));
  return resposta.modelos ?? [];
}

export async function criarModeloCardapio(auth: AbAuth, entrada: CardapioModeloInput): Promise<CardapioModelo> {
  return requisitar<CardapioModelo>(auth, urlAb(auth, "/cardapio-modelos"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function atualizarModeloCardapio(
  auth: AbAuth,
  id: string,
  entrada: CardapioModeloInput,
): Promise<CardapioModelo> {
  return requisitar<CardapioModelo>(auth, urlAb(auth, `/cardapio-modelos/${encodeURIComponent(id)}`), {
    method: "PATCH",
    body: JSON.stringify(entrada),
  });
}

export async function excluirModeloCardapio(auth: AbAuth, id: string): Promise<void> {
  await requisitar<null>(auth, urlAb(auth, `/cardapio-modelos/${encodeURIComponent(id)}`), { method: "DELETE" });
}

export async function listarGradeCardapio(auth: AbAuth): Promise<CardapioGradeRegra[]> {
  const resposta = await requisitar<{ regras: CardapioGradeRegra[] }>(auth, urlAb(auth, "/cardapio-grade"));
  return resposta.regras ?? [];
}

export async function salvarRegraGrade(
  auth: AbAuth,
  entrada: { diaSemana: number; servico: CardapioServico; modeloId: string; ativo?: boolean },
): Promise<CardapioGradeRegra> {
  return requisitar<CardapioGradeRegra>(auth, urlAb(auth, "/cardapio-grade"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function excluirRegraGrade(auth: AbAuth, id: string): Promise<void> {
  await requisitar<null>(auth, urlAb(auth, `/cardapio-grade/${encodeURIComponent(id)}`), { method: "DELETE" });
}

export async function gerarEscalaCardapio(
  auth: AbAuth,
  entrada: { dataInicio?: string; dias?: number } = {},
): Promise<{ totalCriados: number; totalIgnorados: number; criados: string[]; ignorados: string[] }> {
  return requisitar(auth, urlAb(auth, "/cardapio-grade/gerar"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

// ─── Cotações do A&B ────────────────────────────────────────────────────────

export type Fornecedor = { id: string; nome: string; ativo: boolean };

export type CotacaoItem = {
  id: string;
  insumoId: string;
  insumoNome: string;
  quantidade: string;
  unidade: string;
  ordem: number;
};

export type CotacaoFornecedor = {
  id: string;
  fornecedorId: string;
  nome: string | null;
  status: "convidado" | "respondido" | "selecionado" | "descartado";
  valorTotal: string | null;
  prazoEntregaDias: number | null;
  condicoesPagamento: string | null;
  observacao: string | null;
};

export type Cotacao = {
  id: string;
  origem: string;
  dataInicio: string;
  dataFim: string;
  status: "aberta" | "respondida" | "adjudicada" | "cancelada";
  observacao: string | null;
  itens?: CotacaoItem[];
  fornecedores?: CotacaoFornecedor[];
};

export async function listarFornecedores(auth: AbAuth): Promise<Fornecedor[]> {
  return requisitar<Fornecedor[]>(auth, `/api/tenants/${encodeURIComponent(auth.tenantId)}/fornecedores`);
}

export async function listarCotacoes(auth: AbAuth): Promise<Cotacao[]> {
  const resposta = await requisitar<{ cotacoes: Cotacao[] }>(auth, urlAb(auth, "/cotacoes"));
  return resposta.cotacoes ?? [];
}

export async function obterCotacao(auth: AbAuth, id: string): Promise<Cotacao> {
  return requisitar<Cotacao>(auth, urlAb(auth, `/cotacoes/${encodeURIComponent(id)}`));
}

export async function criarCotacao(
  auth: AbAuth,
  entrada: { dataInicio: string; dataFim: string; observacao?: string | null; itens: Array<{ insumoId: string; quantidade: number }>; fornecedorIds: string[] },
): Promise<Cotacao> {
  return requisitar<Cotacao>(auth, urlAb(auth, "/cotacoes"), { method: "POST", body: JSON.stringify(entrada) });
}

export async function responderCotacao(
  auth: AbAuth,
  id: string,
  entrada: { fornecedorId: string; valorTotal: number; prazoEntregaDias: number; condicoesPagamento?: string | null; observacao?: string | null },
): Promise<Cotacao> {
  return requisitar<Cotacao>(auth, urlAb(auth, `/cotacoes/${encodeURIComponent(id)}/resposta`), { method: "POST", body: JSON.stringify(entrada) });
}

export async function selecionarCotacao(
  auth: AbAuth,
  id: string,
  fornecedorId: string,
): Promise<{ ordemId: string; fornecedor: string | null }> {
  return requisitar(auth, urlAb(auth, `/cotacoes/${encodeURIComponent(id)}/selecionar`), { method: "POST", body: JSON.stringify({ fornecedorId }) });
}

// ─── Planejamento integrado do restaurante ─────────────────────────────────

export type NecessidadePlanejamento = {
  insumoId: string;
  insumoNome: string;
  unidade: string;
  necessario: number;
  disponivel: number;
  comprar: number;
};

export type RespostaPlanejamento = {
  dias: Array<{ data: string; servico: CardapioServico; ocupacao: number; menu: string }>;
  necessidades: NecessidadePlanejamento[];
  proteinaPorAdulto: number;
  acompanhamentoPorAdulto: number;
};

export async function aplicarHospedesPeriodo(
  auth: AbAuth,
  entrada: { dataInicio: string; dataFim: string; servico: CardapioServico; ocupacao: number },
): Promise<{ dias: number }> {
  return requisitar(auth, urlAb(auth, "/planejamento/previsoes-periodo"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function listarNecessidadesPlanejamento(
  auth: AbAuth,
  entrada: { dataInicio: string; dataFim: string; proteinaPorAdulto?: number; acompanhamentoPorAdulto?: number },
): Promise<RespostaPlanejamento> {
  const params = new URLSearchParams({ dataInicio: entrada.dataInicio, dataFim: entrada.dataFim });
  if (entrada.proteinaPorAdulto !== undefined) params.set("proteinaPorAdulto", String(entrada.proteinaPorAdulto));
  if (entrada.acompanhamentoPorAdulto !== undefined) params.set("acompanhamentoPorAdulto", String(entrada.acompanhamentoPorAdulto));
  return requisitar<RespostaPlanejamento>(auth, urlAb(auth, `/planejamento/necessidades?${params.toString()}`));
}

// ─── Ordens de compra do motor preditivo (AB-11) ────────────────────────────

export type OrdemCompraStatus = "sugerida" | "aprovada" | "pendente_entrega" | "parcialmente_recebida" | "recebida" | "cancelada";

export type OrdemCompraItem = {
  id: string;
  tenantId: string;
  ordemId: string;
  insumoId: string;
  insumoNome: string;
  quantidade: string;
  quantidadeRecebida: string;
  unidade: "g" | "ml" | "un";
  custoEstimado: string | null;
  observacao: string | null;
  createdAt: string;
};

export type OrdemCompra = {
  id: string;
  tenantId: string;
  coberturaInicio: string;
  coberturaFim: string;
  status: OrdemCompraStatus;
  fornecedor: string | null;
  dataEntregaPrevista: string | null;
  observacao: string | null;
  aprovadaPor: string | null;
  aprovadaEm: string | null;
  createdAt: string;
  updatedAt: string;
  itens: OrdemCompraItem[];
};

export type ResumoMotorPreditivo = {
  dataReferencia: string;
  coberturaFim: string;
  tenantsAvaliados: number;
  tenantsComSugestao: number;
  ordensGeradas: number;
  itensGerados: number;
  ordensJaExistentes: number;
  seco: boolean;
  erros: Array<{ tenantId: string; erro: string }>;
};

export async function listarOrdensCompra(
  auth: AbAuth,
  filtro: { status?: OrdemCompraStatus } = {},
): Promise<OrdemCompra[]> {
  const params = new URLSearchParams();
  if (filtro.status) params.set("status", filtro.status);
  const query = params.toString();
  const resposta = await requisitar<{ ordens: OrdemCompra[] }>(
    auth,
    urlAb(auth, `/ordens-compra${query ? `?${query}` : ""}`),
  );
  return resposta.ordens ?? [];
}

export async function obterOrdemCompra(auth: AbAuth, id: string): Promise<OrdemCompra> {
  return requisitar<OrdemCompra>(auth, urlAb(auth, `/ordens-compra/${encodeURIComponent(id)}`));
}

export async function criarOrdemCompraManual(
  auth: AbAuth,
  entrada: {
    fornecedor?: string | null;
    dataEntregaPrevista?: string | null;
    observacao?: string | null;
    itens: Array<{ insumoId: string; quantidade: number; custoEstimado?: number | null }>;
  },
): Promise<OrdemCompra> {
  return requisitar<OrdemCompra>(auth, urlAb(auth, "/ordens-compra"), {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export async function gerarOrdemCompra(
  auth: AbAuth,
  opcoes: { dataReferencia?: string; diasCobertura?: number; janelaDias?: number } = {},
): Promise<{ ordem: OrdemCompra | null; resumo: ResumoMotorPreditivo }> {
  return requisitar<{ ordem: OrdemCompra | null; resumo: ResumoMotorPreditivo }>(
    auth,
    urlAb(auth, "/ordens-compra/gerar"),
    { method: "POST", body: JSON.stringify(opcoes) },
  );
}

export async function atualizarOrdemCompra(
  auth: AbAuth,
  id: string,
  alteracao: { status?: OrdemCompraStatus; fornecedor?: string | null; dataEntregaPrevista?: string | null; observacao?: string | null },
): Promise<OrdemCompra> {
  return requisitar<OrdemCompra>(auth, urlAb(auth, `/ordens-compra/${encodeURIComponent(id)}`), {
    method: "PATCH",
    body: JSON.stringify(alteracao),
  });
}

export async function atualizarItemOrdemCompra(
  auth: AbAuth,
  ordemId: string,
  itemId: string,
  alteracao: { quantidade?: number; custoEstimado?: number | null; observacao?: string | null },
): Promise<OrdemCompra> {
  return requisitar<OrdemCompra>(
    auth,
    urlAb(auth, `/ordens-compra/${encodeURIComponent(ordemId)}/itens/${encodeURIComponent(itemId)}`),
    { method: "PATCH", body: JSON.stringify(alteracao) },
  );
}

export async function removerItemOrdemCompra(
  auth: AbAuth,
  ordemId: string,
  itemId: string,
): Promise<OrdemCompra> {
  return requisitar<OrdemCompra>(
    auth,
    urlAb(auth, `/ordens-compra/${encodeURIComponent(ordemId)}/itens/${encodeURIComponent(itemId)}`),
    { method: "DELETE" },
  );
}
