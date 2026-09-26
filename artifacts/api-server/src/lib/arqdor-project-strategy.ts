export type ArchitecturalStrategyInput = {
  lotWidth: number;
  lotDepth: number;
  floors: number;
  intervention: "preservar" | "otimizar" | "valorizar" | "assinatura";
  vision?: {
    lifestyle?: string;
    protagonist?: string;
    priorities?: string[];
    budgetStrategy?: string;
    household?: { adults?: number; children?: number; elderly?: number; pets?: boolean };
    routine?: {
      homeOffice?: string;
      receivesGuests?: string;
      cooking?: string;
      accessibility?: string;
    };
  } | null;
  brief: {
    gourmet: boolean;
    pool: boolean;
    office: boolean;
    integratedKitchen: boolean;
    privateAwaySocial: boolean;
    garageSpaces: number;
  };
};

export type ArchitecturalProjectStrategy = {
  party: "linear_spine" | "social_core" | "paired_wings" | "l_courtyard" | "central_patio";
  zoning: {
    social: string;
    private: string;
    service: string;
  };
  arrivalSequence: string;
  circulationLogic: string;
  indoorOutdoorLogic: string;
  solarLogic: string;
  facadeLogic: string;
  volumeLogic: string;
  constructionLogic: string;
  nonNegotiables: string[];
};

export function buildArchitecturalProjectStrategy(input: ArchitecturalStrategyInput): ArchitecturalProjectStrategy {
  const vision = input.vision ?? {};
  const priorities = new Set(vision.priorities ?? []);
  const narrowLot = input.lotWidth <= 11;
  const deepLot = input.lotDepth / Math.max(1, input.lotWidth) >= 2;
  const socialDriven = ["social", "cozinha", "gourmet", "jardim"].includes(String(vision.protagonist ?? "social"));
  const leisureDriven = Boolean(input.brief.gourmet || input.brief.pool || vision.protagonist === "jardim");
  const privacyDriven = input.brief.privateAwaySocial || priorities.has("privacidade") || vision.lifestyle === "tranquilidade";

  let party: ArchitecturalProjectStrategy["party"] = "social_core";
  if (narrowLot || deepLot) party = "linear_spine";
  else if (leisureDriven && input.lotWidth >= 14) party = "l_courtyard";
  else if (privacyDriven && input.floors > 1) party = "paired_wings";
  else if (priorities.has("natureza") && input.lotWidth >= 16) party = "central_patio";
  else if (!socialDriven) party = "paired_wings";

  const social =
    party === "l_courtyard"
      ? "setor social formando uma borda ativa voltada ao jardim/lazer, com sala, jantar, cozinha e gourmet articulados"
      : party === "linear_spine"
        ? "setor social próximo ao acesso e conectado a um eixo longitudinal claro, evitando corredores residuais"
        : "setor social como núcleo legível da casa, conectado à entrada e ao exterior sem expor a área íntima";

  const privateZone = input.floors > 1
    ? "setor íntimo prioritariamente no pavimento superior ou em ala claramente separada, com chegada protegida"
    : "setor íntimo em ala reservada, sem passagem obrigatória por garagem, gourmet ou entrada principal";

  const service =
    "cozinha, lavanderia, garagem e áreas molhadas organizadas com percursos curtos e infraestrutura racionalizada";

  const arrivalSequence =
    input.intervention === "assinatura" || input.intervention === "valorizar"
      ? "criar chegada legível com compressão e abertura: entrada protegida, leitura imediata do social e vista controlada para jardim/lazer"
      : "entrada direta e legível, sem atravessar área íntima nem depender de corredor longo";

  const circulationLogic =
    party === "linear_spine"
      ? "um eixo principal curto e contínuo distribui os setores; ramificações privadas devem ser mínimas"
      : "circulação deve acontecer pelas bordas dos ambientes sociais e por halls compactos, sem corredor central excessivo";

  const indoorOutdoorLogic =
    leisureDriven
      ? "área social deve se abrir para gourmet/jardim/piscina como continuidade real de uso, com transição coberta ou protegida"
      : "garantir pelo menos uma relação forte entre estar/jantar e área externa útil, evitando aberturas sem função";

  const solarLogic =
    priorities.has("luz_natural") || priorities.has("natureza")
      ? "priorizar ambientes de permanência nas fachadas com melhor potencial de luz natural e permitir ventilação cruzada quando a geometria suportar"
      : "evitar ambientes profundos e escuros; usar perímetro e pátios somente quando tiverem função espacial ou climática clara";

  const facadeLogic =
    "a fachada deve nascer do partido: entrada, garagem, social e íntimo precisam ter hierarquia própria; aberturas devem corresponder aos ambientes internos";

  const volumeLogic =
    party === "l_courtyard"
      ? "dois volumes ou alas articulados definem um vazio externo protegido; diferenças volumétricas devem responder a uso, sombra ou privacidade"
      : party === "paired_wings"
        ? "volumes ou alas com papéis claros, conectados por um elemento de transição legível"
        : "massa principal compacta com no máximo um gesto secundário forte para entrada, social ou proteção solar";

  const constructionLogic =
    vision.budgetStrategy === "otimizar"
      ? "perímetro compacto, vãos racionais, áreas molhadas agrupadas e poucos recortes de cobertura/fachada"
      : "permitir investimento concentrado no espaço protagonista, mantendo o restante da geometria racional";

  const nonNegotiables = [
    "setorização deve ser compreensível sem depender de decoração",
    "nenhum ambiente pode ficar isolado do conjunto construído",
    "circulação deve ser consequência do partido, não sobra geométrica",
    "fachada e cobertura devem derivar da planta aprovada",
  ];
  if (privacyDriven) nonNegotiables.push("entrada e área social não devem expor diretamente dormitórios e suíte");
  if (input.brief.integratedKitchen) nonNegotiables.push("cozinha e sala devem manter conexão espacial direta");
  if (input.brief.office || vision.routine?.homeOffice === "daily") nonNegotiables.push("home office deve evitar conflito acústico com lazer e TV");
  if (vision.routine?.accessibility === "required" || (vision.household?.elderly ?? 0) > 0) {
    nonNegotiables.push("rota cotidiana principal deve ser acessível e evitar dependência de degraus");
  }

  return {
    party,
    zoning: { social, private: privateZone, service },
    arrivalSequence,
    circulationLogic,
    indoorOutdoorLogic,
    solarLogic,
    facadeLogic,
    volumeLogic,
    constructionLogic,
    nonNegotiables,
  };
}
