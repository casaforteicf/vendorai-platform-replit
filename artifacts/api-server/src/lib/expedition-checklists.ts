import type { EntregaItem } from "@workspace/db";

export type ExpeditionCheckStatus = "pendente" | "ok" | "divergencia" | "na";

export type ExpeditionChecklist = {
  schemaVersion: number;
  tipo: "expedicao";
  etapa: "liberado";
  status: "pendente" | "em_andamento" | "concluido" | "com_divergencia";
  contexto: { segmento: string | null; vertical: string | null };
  totalCampos: number;
  concluidos: number;
  divergencias: number;
  itens: Array<{
    propostaItemIndex: number | null;
    produtoId: string | null;
    sku: string | null;
    nome: string;
    quantidade: number;
    modoConferencia: "por_unidade" | "por_lote";
    snapshot: Record<string, unknown>;
    contexto: { categoria: string | null; nicho: string | null };
    campos: Array<{
      id: string;
      key: string;
      label: string;
      status: ExpeditionCheckStatus;
      obrigatorio: boolean;
      observacao: string;
      evidencias?: Array<{ id: string; url: string; nome: string }>;
    }>;
  }>;
  verificacaoFinal: {
    totalVolumes: number | null;
    pesoTotalKg: number | null;
    nomeVerificador: string;
    data: string | null;
    observacoes: string;
  };
};

function configuredExpeditionChecks(sourceItem: any): string[] {
  const deliveryConfig = sourceItem?.sourceSnapshot?.deliveryConfig;
  if (!deliveryConfig || typeof deliveryConfig !== "object") return [];
  const config = deliveryConfig as Record<string, unknown>;
  const configured = config.checklistExpedicao ?? config.checklist;
  if (!Array.isArray(configured)) return [];
  return configured
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean);
}

function expeditionChecksFor(segmento: string | null | undefined, sourceItem: any): string[] {
  const configured = configuredExpeditionChecks(sourceItem);
  if (configured.length) return configured;

  const text = [
    segmento,
    sourceItem?.nome,
    sourceItem?.descricao,
    sourceItem?.sourceSnapshot?.descricao,
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");

  const isEsquadria = [
    "esquadria", "janela", "porta", "vidro", "guarda corpo", "guarda-corpo",
    "alumínio", "aluminio", "pvc", "brise",
  ].some((term) => text.includes(term));

  if (isEsquadria) return ["Marco", "Folha", "Tela", "Vidro", "Fecho", "Acabamento"];
  return ["Identificação", "Quantidade", "Integridade", "Embalagem", "Acabamento"];
}

function slug(value: string) {
  return value.toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function buildExpeditionChecklist(input: {
  segmento?: string | null;
  vertical?: string | null;
  deliveryItems: EntregaItem[];
  proposalItems: any[];
}): ExpeditionChecklist {
  const itens = input.deliveryItems.map((item) => {
    const sourceIndex = item.propostaItemIndex ?? -1;
    const sourceItem = sourceIndex >= 0 ? input.proposalItems[sourceIndex] : undefined;
    const deliveryConfig = sourceItem?.sourceSnapshot?.deliveryConfig;
    const config = deliveryConfig && typeof deliveryConfig === "object"
      ? deliveryConfig as Record<string, unknown>
      : {};
    const labels = expeditionChecksFor(input.segmento, sourceItem ?? item);

    return {
      propostaItemIndex: item.propostaItemIndex ?? null,
      produtoId: item.produtoId ?? null,
      sku: item.sku ?? null,
      nome: item.nome,
      quantidade: item.quantidade,
      modoConferencia: config.checklistModo === "por_unidade" || config.checklistMode === "per_unit"
        ? "por_unidade" as const
        : "por_lote" as const,
      snapshot: {
        capturedAt: new Date().toISOString(),
        nome: sourceItem?.nome ?? item.nome,
        sku: sourceItem?.sku ?? item.sku ?? null,
        descricao: sourceItem?.descricao ?? sourceItem?.sourceSnapshot?.descricao ?? null,
        produtoId: sourceItem?.produtoId ?? item.produtoId ?? null,
        quantidadePedido: sourceItem?.quantidade ?? (item as any).quantidadePedido ?? null,
      },
      contexto: {
        categoria: typeof config.categoria === "string" ? config.categoria : null,
        nicho: typeof config.nicho === "string" ? config.nicho : null,
      },
      campos: labels.map((label, fieldIndex) => ({
        id: `${item.propostaItemIndex ?? "item"}-${fieldIndex}`,
        key: slug(label),
        label,
        status: "pendente" as const,
        obrigatorio: true,
        observacao: "",
      })),
    };
  });

  const totalCampos = itens.reduce((total, item) => total + item.campos.length, 0);
  return {
    schemaVersion: 1,
    tipo: "expedicao",
    etapa: "liberado",
    status: "pendente",
    contexto: {
      segmento: input.segmento ?? null,
      vertical: input.vertical ?? null,
    },
    totalCampos,
    concluidos: 0,
    divergencias: 0,
    itens,
    verificacaoFinal: {
      totalVolumes: null,
      pesoTotalKg: null,
      nomeVerificador: "",
      data: null,
      observacoes: "",
    },
  };
}

export function expeditionGateStatus(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.checklistExpedicao;
  if (!raw || typeof raw !== "object") {
    return { ready: false as const, reason: "Checklist de expedição ainda não foi gerado." };
  }

  const checklist = raw as {
    status?: string;
    divergencias?: number;
    concluidos?: number;
    totalCampos?: number;
    verificacaoFinal?: { nomeVerificador?: string };
  };
  const divergencias = Number(checklist.divergencias ?? 0);
  const concluidos = Number(checklist.concluidos ?? 0);
  const totalCampos = Number(checklist.totalCampos ?? 0);
  const verifier = checklist.verificacaoFinal?.nomeVerificador?.trim();
  const override = metadata?.expedicaoOverride as {
    aprovado?: boolean;
    justificativa?: string;
    aprovadoPor?: string | null;
    aprovadoEm?: string;
  } | undefined;

  if (override?.aprovado && override.justificativa?.trim() && override.aprovadoPor && override.aprovadoEm) {
    return { ready: true as const, reason: null, override: true as const };
  }
  if (divergencias > 0) {
    return { ready: false as const, reason: `Existem ${divergencias} divergência(s) pendentes na expedição.` };
  }
  if (!totalCampos || concluidos < totalCampos) {
    return { ready: false as const, reason: "A conferência de expedição ainda possui campos pendentes." };
  }
  if (!verifier) {
    return { ready: false as const, reason: "Informe o verificador final da expedição." };
  }
  if (checklist.status !== "concluido") {
    return { ready: false as const, reason: "Finalize o checklist de expedição antes do transporte." };
  }
  return { ready: true as const, reason: null };
}

export function buildTransportChecklist(
  items: Array<{ nome?: string; quantidade?: number; sku?: string | null; produtoId?: string | null }> = [],
) {
  const labels = [
    "Volumes carregados conferidos",
    "Integridade da carga",
    "Veículo identificado",
    "Motorista identificado",
    "Destino confirmado",
    "Fotos da carga",
  ];
  return {
    schemaVersion: 1,
    tipo: "transporte",
    status: "pendente",
    totalCampos: labels.length,
    concluidos: 0,
    divergencias: 0,
    campos: labels.map((label, index) => ({
      id: `transporte-${index}`,
      key: slug(label),
      label,
      status: "pendente",
      observacao: "",
      obrigatorio: true,
    })),
    itens: items.map((item, index) => ({
      id: item.produtoId ?? item.sku ?? `item-${index}`,
      produtoId: item.produtoId ?? null,
      sku: item.sku ?? null,
      nome: item.nome ?? `Item ${index + 1}`,
      quantidadePrevista: Number(item.quantidade ?? 0),
      quantidadeCarregada: null,
      quantidadeRecebida: null,
      ocorrencia: "",
    })),
    saida: {
      veiculo: "",
      placa: "",
      motorista: "",
      horarioSaida: null,
      destino: "",
      lacre: "",
    },
    recebimento: {
      recebidoPor: "",
      recebidoEm: null,
      observacoes: "",
    },
  };
}

export function transportGateStatus(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.checklistTransporte;
  if (!raw || typeof raw !== "object") {
    return { ready: false as const, reason: "Checklist de transporte ainda não foi iniciado." };
  }
  const checklist = raw as {
    status?: string;
    divergencias?: number;
    concluidos?: number;
    totalCampos?: number;
    saida?: { motorista?: string; placa?: string; destino?: string };
    itens?: Array<{
      quantidadeCarregada?: number | null;
      quantidadeRecebida?: number | null;
      ocorrencia?: string;
    }>;
  };
  const divergencias = Number(checklist.divergencias ?? 0);
  const concluidos = Number(checklist.concluidos ?? 0);
  const totalCampos = Number(checklist.totalCampos ?? 0);

  if (divergencias > 0) return { ready: false as const, reason: "Existem divergências no transporte." };
  const quantityDivergences = (checklist.itens ?? []).filter((item) =>
    item.quantidadeCarregada != null
    && item.quantidadeRecebida != null
    && Number(item.quantidadeCarregada) !== Number(item.quantidadeRecebida)
  );
  if (quantityDivergences.length > 0) {
    return {
      ready: false as const,
      reason: `Existem ${quantityDivergences.length} divergência(s) entre quantidade carregada e recebida.`,
    };
  }
  if (!totalCampos || concluidos < totalCampos) return { ready: false as const, reason: "Checklist de transporte incompleto." };
  if (!checklist.saida?.motorista?.trim() || !checklist.saida?.placa?.trim() || !checklist.saida?.destino?.trim()) {
    return { ready: false as const, reason: "Informe motorista, placa e destino." };
  }
  if (checklist.status !== "concluido") return { ready: false as const, reason: "Finalize o checklist de transporte." };
  return { ready: true as const, reason: null };
}
