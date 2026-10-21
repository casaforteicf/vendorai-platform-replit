import type { PropostaItem } from "@workspace/db";

type AnnexInput = {
  id: string;
  numero?: string | null;
  status: string;
  acceptedAt?: Date | null;
  valorTotal?: string | null;
  itens?: PropostaItem[] | null;
  apresentacao?: {
    memorialDescritivo?: string;
    itensNaoInclusos?: string[];
    cronogramaEtapas?: Record<string, {
      inicioPrevisto?: string; fimPrevisto?: string; marcoPagamento?: string;
    }>;
    condicoesPagamentoDetalhadas?: string;
    sourceSnapshot?: { revisionLabel?: string; capturedAt?: string; immutableForVersion?: boolean };
  } | null;
};

type Pending = { code: string; field: string; message: string };

// A preview is not a signed contract. Missing data never receives AI-generated defaults.
export function buildContractualAnnexPreview(proposta: AnnexInput) {
  const items = proposta.itens ?? [];
  const presentation = proposta.apresentacao ?? {};
  const pending: Pending[] = [];
  const add = (code: string, field: string, message: string) => pending.push({ code, field, message });
  const revision = presentation.sourceSnapshot?.revisionLabel ?? null;
  const contracted = proposta.status === "aceita" && Boolean(proposta.acceptedAt) &&
    Boolean(revision) && presentation.sourceSnapshot?.immutableForVersion === true;

  if (!contracted) add("CONTRACT_BASELINE_NOT_VERIFIED", "status", "Falta revisão congelada e aceite comprovado para emissão contratual.");
  if (!presentation.memorialDescritivo?.trim()) add("MEMORIAL_MISSING", "apresentacao.memorialDescritivo", "Memorial descritivo não cadastrado.");
  if (!items.length) add("ITEMS_MISSING", "itens", "Não há itens no orçamento.");
  const annexA = {
    memorial: presentation.memorialDescritivo?.trim() || null,
    items: items.map((item, index) => {
      const contract = item.contratual;
      if (!contract?.classificacao) add("SCOPE_UNDEFINED", `itens[${index}].contratual.classificacao`, `Escopo do item "${item.nome}" não classificado.`);
      if (contract?.exigeValidacaoTecnica || contract?.classificacao === "condicionado") {
        add("TECHNICAL_APPROVAL_PENDING", `itens[${index}].contratual`, `Item "${item.nome}" exige validação.`);
      }
      if (contract?.fonte && !contract.fonte.aprovado) {
        add("SOURCE_UNAPPROVED", `itens[${index}].contratual.fonte`, `Origem do item "${item.nome}" não aprovada.`);
      }
      return {
        nome: item.nome, quantidade: item.quantidade, unidade: item.unidade ?? null,
        classificacao: contract?.classificacao ?? null,
        especificacao: contract?.especificacao ?? null,
        marca: contract?.marca ?? item.sourceSnapshot?.marca ?? null,
        modelo: contract?.modelo ?? null,
        localAplicacao: contract?.localAplicacao ?? null,
        observacoesMemorial: contract?.observacoesMemorial ?? null,
        fonte: contract?.fonte ?? null,
      };
    }),
    exclusoesGerais: presentation.itensNaoInclusos ?? [],
  };
  const stages = Object.entries(presentation.cronogramaEtapas ?? {}).map(([id, stage]) => ({
    etapaId: id, inicio: stage.inicioPrevisto ?? null, fim: stage.fimPrevisto ?? null,
    marcoPagamento: stage.marcoPagamento ?? null,
  }));
  if (!stages.length) add("SCHEDULE_MISSING", "apresentacao.cronogramaEtapas", "Cronograma executivo não cadastrado.");
  if (!presentation.condicoesPagamentoDetalhadas?.trim()) add("PAYMENT_RULES_MISSING", "apresentacao.condicoesPagamentoDetalhadas", "Regras de pagamento não registradas.");
  const annexB = {
    etapas: stages,
    condicoesPagamento: presentation.condicoesPagamentoDetalhadas?.trim() || null,
    valorTotal: proposta.valorTotal ?? null,
    // Do not infer installments, amortization or PVC distribution from total or stage values.
    parcelas: null,
    medicoes: null,
  };
  const annexC = {
    itensParaVistoria: annexA.items.filter((x) => x.classificacao === "incluido").map((x) => ({
      nome: x.nome, local: x.localAplicacao, resultado: null, evidencia: null,
    })),
    resultadoFinal: null, aceite: null,
  };
  return {
    propostaId: proposta.id, numero: proposta.numero ?? null,
    revision, contratual: contracted && pending.length === 0,
    somentePrevia: true, pending, anexoA: annexA, anexoB: annexB, anexoC: annexC,
  };
}
