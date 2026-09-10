import type { ProfessionalDate } from "@workspace/db";

/**
 * Catálogo mestre de datas profissionais do VendorAI.
 *
 * Regras:
 * - data e profissões vinculadas são mantidas pelo sistema;
 * - o tenant controla somente se a data está ativa;
 * - o público é encontrado pelo campo `profissao` do card do lead;
 * - datas gerais que não representam profissão não entram neste catálogo.
 *
 * Algumas datas da lista histórica foram atualizadas para a referência vigente:
 * Jornalista 07/04, Meteorologista 14/10, Radialista 07/11,
 * Arquiteto e Urbanista 15/12 e Pintor 18/10.
 */
type MasterProfessionalDate = ProfessionalDate & { aliases?: string[] };

const professionalDate = (
  name: string,
  month: number,
  day: number,
  professions: string[],
  aliases?: string[],
): MasterProfessionalDate => ({
  name,
  month,
  day,
  professions,
  active: false,
  ...(aliases?.length ? { aliases } : {}),
});

export const DEFAULT_PROFESSIONAL_DATES: MasterProfessionalDate[] = [
  // Janeiro
  professionalDate("Dia do Fotógrafo", 1, 8, ["fotógrafo", "fotógrafa"]),
  professionalDate("Dia do Astronauta", 1, 9, ["astronauta"]),
  professionalDate("Dia Mundial do Compositor", 1, 15, ["compositor", "compositora"]),
  professionalDate("Dia do Farmacêutico", 1, 20, ["farmacêutico", "farmacêutica"]),
  professionalDate("Dia do Carteiro", 1, 25, ["carteiro", "carteira"]),
  professionalDate("Dia do Portuário", 1, 30, ["portuário", "portuária"]),

  // Fevereiro
  professionalDate("Dia do Publicitário", 2, 1, ["publicitário", "publicitária"]),
  professionalDate("Dia do Agente Fiscal", 2, 2, ["agente fiscal", "fiscal"]),
  professionalDate("Dia do Datiloscopista", 2, 5, ["datiloscopista", "papiloscopista"]),
  professionalDate("Dia do Gráfico", 2, 7, ["gráfico", "gráfica"]),
  professionalDate("Dia do Zelador", 2, 9, ["zelador", "zeladora"]),
  professionalDate("Dia do Atleta Profissional", 2, 10, ["atleta profissional", "atleta"]),
  professionalDate("Dia do Repórter", 2, 16, ["repórter"]),

  // Março
  professionalDate("Dia do Bibliotecário", 3, 12, ["bibliotecário", "bibliotecária"]),
  professionalDate("Dia do Vendedor de Livros", 3, 14, ["vendedor de livros", "vendedora de livros", "livreiro", "livreira"]),
  professionalDate("Dia do Carpinteiro", 3, 19, ["carpinteiro", "carpinteira"]),
  professionalDate("Dia do Marceneiro", 3, 19, ["marceneiro", "marceneira"]),
  professionalDate("Dia do Diagramador", 3, 28, ["diagramador", "diagramadora"]),
  professionalDate("Dia do Revisor", 3, 28, ["revisor", "revisora", "revisor de texto", "revisora de texto"]),

  // Abril
  professionalDate("Dia do Jornalista", 4, 7, ["jornalista"]),
  professionalDate("Dia do Metalúrgico", 4, 21, ["metalúrgico", "metalúrgica"]),
  professionalDate("Dia do Policial Civil", 4, 21, ["policial civil"]),
  professionalDate("Dia do Policial Militar", 4, 21, ["policial militar"]),
  professionalDate("Dia do Agente de Viagem", 4, 24, ["agente de viagem", "agente de viagens"]),
  professionalDate("Dia do Contabilista", 4, 25, ["contabilista", "contador", "contadora", "profissional da contabilidade"]),
  professionalDate("Dia do Goleiro", 4, 26, ["goleiro", "goleira"]),
  professionalDate("Dia da Empregada Doméstica", 4, 27, ["empregada doméstica", "empregado doméstico", "doméstica", "doméstico"]),
  professionalDate("Dia do Ferroviário", 4, 30, ["ferroviário", "ferroviária"]),

  // Maio
  professionalDate("Dia do Taquígrafo", 5, 2, ["taquígrafo", "taquígrafa"]),
  professionalDate("Dia do Sertanejo", 5, 3, ["sertanejo", "sertaneja", "cantor sertanejo", "cantora sertaneja"]),
  professionalDate("Dia do Cartógrafo", 5, 6, ["cartógrafo", "cartógrafa"]),
  professionalDate("Dia do Psicanalista", 5, 6, ["psicanalista"]),
  professionalDate("Dia do Oftalmologista", 5, 7, ["oftalmologista", "médico oftalmologista", "médica oftalmologista"]),
  professionalDate("Dia do Profissional de Marketing", 5, 8, ["profissional de marketing", "analista de marketing", "gerente de marketing", "marketing"], ["Dia do Profissional Marketing"]),
  professionalDate("Dia do Artista Plástico", 5, 8, ["artista plástico", "artista plástica"]),
  professionalDate("Dia Mundial do Enfermeiro", 5, 12, ["enfermeiro", "enfermeira"]),
  professionalDate("Dia do Vigilante", 5, 13, ["vigilante"]),
  professionalDate("Dia do Assistente Social", 5, 15, ["assistente social"]),
  professionalDate("Dia do Gerente Bancário", 5, 15, ["gerente bancário", "gerente bancária"]),
  professionalDate("Dia do Gari", 5, 16, ["gari"]),
  professionalDate("Dia dos Vidreiros", 5, 18, ["vidreiro", "vidreira"]),
  professionalDate("Dia do Apicultor", 5, 22, ["apicultor", "apicultora"]),
  professionalDate("Dia do Datilógrafo", 5, 24, ["datilógrafo", "datilógrafa"]),
  professionalDate("Dia do Telegrafista", 5, 24, ["telegrafista"]),
  professionalDate("Dia do Massagista", 5, 25, ["massagista", "massoterapeuta"]),
  professionalDate("Dia do Trabalhador Rural", 5, 25, ["trabalhador rural", "trabalhadora rural", "produtor rural", "produtora rural"]),
  professionalDate("Dia do Profissional Liberal", 5, 27, ["profissional liberal"]),
  professionalDate("Dia do Estatístico", 5, 29, ["estatístico", "estatística"]),
  professionalDate("Dia do Geógrafo", 5, 29, ["geógrafo", "geógrafa"]),
  professionalDate("Dia do Geólogo", 5, 30, ["geólogo", "geóloga"]),
  professionalDate("Dia do Comissário de Bordo", 5, 31, ["comissário de bordo", "comissária de bordo", "comissário de voo", "comissária de voo", "aeromoço", "aeromoça"], ["Dia Mundial do Comissário de Voo", "Dia Mundial do Comissário de Vôo"]),

  // Junho
  professionalDate("Dia do Citricultor", 6, 8, ["citricultor", "citricultora"]),
  professionalDate("Dia do Porteiro", 6, 9, ["porteiro", "porteira"]),
  professionalDate("Dia do Educador Sanitário", 6, 11, ["educador sanitário", "educadora sanitária"]),
  professionalDate("Dia do Químico", 6, 18, ["químico", "química"]),
  professionalDate("Dia do Revendedor", 6, 20, ["revendedor", "revendedora"]),
  professionalDate("Dia do Metrologista", 6, 26, ["metrologista"]),
  professionalDate("Dia da Telefonista", 6, 29, ["telefonista"]),
  professionalDate("Dia do Pescador", 6, 29, ["pescador", "pescadora"]),

  // Julho
  professionalDate("Dia do Bombeiro Brasileiro", 7, 2, ["bombeiro", "bombeira", "bombeiro militar"]),
  professionalDate("Dia do Operador de Telemarketing", 7, 4, ["operador de telemarketing", "operadora de telemarketing", "telemarketing"]),
  professionalDate("Dia do Panificador", 7, 8, ["panificador", "panificadora", "padeiro", "padeira"]),
  professionalDate("Dia do Engenheiro Florestal", 7, 12, ["engenheiro florestal", "engenheira florestal"]),
  professionalDate("Dia do Engenheiro de Saneamento", 7, 13, ["engenheiro de saneamento", "engenheira de saneamento", "engenheiro sanitarista", "engenheira sanitarista"]),
  professionalDate("Dia do Cantor", 7, 13, ["cantor", "cantora"]),
  professionalDate("Dia do Propagandista de Laboratório", 7, 14, ["propagandista de laboratório", "propagandista", "representante farmacêutico", "representante farmacêutica"]),
  professionalDate("Dia do Comerciante", 7, 16, ["comerciante"]),
  professionalDate("Dia do Guarda Rodoviário", 7, 23, ["guarda rodoviário", "guarda rodoviária", "policial rodoviário", "policial rodoviária"]),
  professionalDate("Dia do Escritor", 7, 25, ["escritor", "escritora"]),
  professionalDate("Dia do Motorista", 7, 25, ["motorista"]),
  professionalDate("Dia do Motociclista", 7, 27, ["motociclista", "motoboy", "motogirl"]),
  professionalDate("Dia do Agricultor", 7, 28, ["agricultor", "agricultora"]),

  // Agosto
  professionalDate("Dia do Tintureiro", 8, 3, ["tintureiro", "tintureira"]),
  professionalDate("Dia do Advogado", 8, 11, ["advogado", "advogada"]),
  professionalDate("Dia do Garçom", 8, 11, ["garçom", "garçonete"]),
  professionalDate("Dia do Economista", 8, 13, ["economista"]),
  professionalDate("Dia do Feirante", 8, 25, ["feirante"]),
  professionalDate("Dia do Soldado", 8, 25, ["soldado", "militar"]),
  professionalDate("Dia do Corretor de Imóveis", 8, 27, ["corretor de imóveis", "corretora de imóveis"]),
  professionalDate("Dia do Psicólogo", 8, 27, ["psicólogo", "psicóloga"]),
  professionalDate("Dia dos Bancários", 8, 28, ["bancário", "bancária"]),
  professionalDate("Dia do Nutricionista", 8, 31, ["nutricionista"], ["Dia da Nutricionista"]),

  // Setembro
  professionalDate("Dia do Profissional de Educação Física", 9, 1, ["profissional de educação física", "educador físico", "educadora física"]),
  professionalDate("Dia do Repórter Fotográfico", 9, 2, ["repórter fotográfico", "repórter fotográfica", "fotojornalista"]),
  professionalDate("Dia do Guarda Civil", 9, 3, ["guarda civil", "guarda municipal"]),
  professionalDate("Dia do Biólogo", 9, 3, ["biólogo", "bióloga"]),
  professionalDate("Dia do Alfaiate", 9, 6, ["alfaiate", "costureiro", "costureira"]),
  professionalDate("Dia do Administrador", 9, 9, ["administrador", "administradora"]),
  professionalDate("Dia do Médico Veterinário", 9, 9, ["médico veterinário", "médica veterinária", "veterinário", "veterinária"]),
  professionalDate("Dia do Operador de Rastreamento", 9, 12, ["operador de rastreamento", "operadora de rastreamento"]),
  professionalDate("Dia do Agrônomo", 9, 13, ["agrônomo", "agrônoma", "engenheiro agrônomo", "engenheira agrônoma"], ["Dia do Agrônomo Mundial"]),
  professionalDate("Dia do Soldador", 9, 23, ["soldador", "soldadora"]),
  professionalDate("Dia do Encanador", 9, 27, ["encanador", "encanadora"]),
  professionalDate("Dia do Anunciante", 9, 29, ["anunciante"]),
  professionalDate("Dia da Secretária", 9, 30, ["secretária", "secretário"]),
  professionalDate("Dia Mundial do Tradutor", 9, 30, ["tradutor", "tradutora", "intérprete"]),
  professionalDate("Dia Nacional do Jornaleiro", 9, 30, ["jornaleiro", "jornaleira"]),

  // Outubro
  professionalDate("Dia do Vendedor", 10, 1, ["vendedor", "vendedora"]),
  professionalDate("Dia Mundial do Dentista", 10, 3, ["dentista", "cirurgião-dentista", "cirurgiã-dentista"]),
  professionalDate("Dia do Barman", 10, 4, ["barman", "bartender"]),
  professionalDate("Dia do Engenheiro Agrônomo", 10, 12, ["engenheiro agrônomo", "engenheira agrônoma", "agrônomo", "agrônoma"]),
  professionalDate("Dia do Terapeuta Ocupacional", 10, 13, ["terapeuta ocupacional"]),
  professionalDate("Dia do Fisioterapeuta", 10, 13, ["fisioterapeuta"]),
  professionalDate("Dia do Meteorologista", 10, 14, ["meteorologista"]),
  professionalDate("Dia do Professor", 10, 15, ["professor", "professora"]),
  professionalDate("Dia do Eletricista", 10, 17, ["eletricista"]),
  professionalDate("Dia do Médico", 10, 18, ["médico", "médica"]),
  professionalDate("Dia do Estivador", 10, 18, ["estivador", "estivadora"]),
  professionalDate("Dia do Securitário", 10, 18, ["securitário", "securitária"]),
  professionalDate("Dia do Pintor", 10, 18, ["pintor", "pintora"]),
  professionalDate("Dia do Profissional da Informática", 10, 19, ["profissional de informática", "analista de sistemas", "desenvolvedor", "desenvolvedora"]),
  professionalDate("Dia do Controlador de Tráfego Aéreo", 10, 20, ["controlador de tráfego aéreo", "controladora de tráfego aéreo"]),
  professionalDate("Dia do Arquivista", 10, 20, ["arquivista"]),
  professionalDate("Dia do Aviador", 10, 23, ["aviador", "aviadora", "piloto", "pilota"], ["Dia da Aviação e do Aviador"]),
  professionalDate("Dia do Dentista Brasileiro", 10, 25, ["dentista", "cirurgião-dentista", "cirurgiã-dentista"]),
  professionalDate("Dia do Sapateiro", 10, 25, ["sapateiro", "sapateira"]),
  professionalDate("Dia do Funcionário Público", 10, 28, ["funcionário público", "funcionária pública", "servidor público", "servidora pública"]),
  professionalDate("Dia do Balconista", 10, 30, ["balconista"]),
  professionalDate("Dia do Comerciário", 10, 30, ["comerciário", "comerciária"]),

  // Novembro
  professionalDate("Dia do Cabeleireiro", 11, 3, ["cabeleireiro", "cabeleireira"]),
  professionalDate("Dia do Inventor", 11, 4, ["inventor", "inventora"]),
  professionalDate("Dia do Radioamador e Técnico em Eletrônica", 11, 5, ["radioamador", "técnico em eletrônica", "técnica em eletrônica"], ["Dia do Radioamador e Téc Eletrônica"]),
  professionalDate("Dia do Técnico Agrícola", 11, 5, ["técnico agrícola", "técnica agrícola"]),
  professionalDate("Dia do Radialista", 11, 7, ["radialista"]),
  professionalDate("Dia do Hoteleiro", 11, 9, ["hoteleiro", "hoteleira"]),
  professionalDate("Dia do Diretor de Escola", 11, 12, ["diretor de escola", "diretora de escola", "diretor escolar", "diretora escolar"]),
  professionalDate("Dia do Auditor Interno", 11, 20, ["auditor interno", "auditora interna", "auditor", "auditora"]),
  professionalDate("Dia do Biomédico", 11, 20, ["biomédico", "biomédica"]),
  professionalDate("Dia do Músico", 11, 22, ["músico", "música"]),
  professionalDate("Dia do Técnico de Segurança do Trabalho", 11, 27, ["técnico de segurança do trabalho", "técnica de segurança do trabalho"]),

  // Dezembro
  professionalDate("Dia do Pedicuro", 12, 4, ["pedicuro", "pedicura", "pedicure"]),
  professionalDate("Dia do Orientador Educacional", 12, 4, ["orientador educacional", "orientadora educacional"]),
  professionalDate("Dia do Fonoaudiólogo", 12, 9, ["fonoaudiólogo", "fonoaudióloga"]),
  professionalDate("Dia Universal do Palhaço", 12, 10, ["palhaço", "palhaça"]),
  professionalDate("Dia do Engenheiro", 12, 11, ["engenheiro", "engenheira"]),
  professionalDate("Dia do Marinheiro", 12, 13, ["marinheiro", "marinheira"]),
  professionalDate("Dia do Ótico", 12, 13, ["ótico", "ótica", "óptico", "óptica"]),
  professionalDate("Dia do Engenheiro Avaliador e Perito de Engenharia", 12, 13, ["engenheiro avaliador", "engenheira avaliadora", "perito de engenharia", "perita de engenharia"]),
  professionalDate("Dia do Arquiteto e Urbanista", 12, 15, ["arquiteto", "arquiteta", "urbanista", "arquiteto e urbanista", "arquiteta e urbanista"], ["Dia do Arquiteto"]),
  professionalDate("Dia do Museólogo", 12, 18, ["museólogo", "museóloga"]),
  professionalDate("Dia do Mecânico", 12, 20, ["mecânico", "mecânica"]),
  professionalDate("Dia do Atleta", 12, 21, ["atleta", "atleta profissional"]),
];

function normalizeDateName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function publicProfessionalDate(item: MasterProfessionalDate): ProfessionalDate {
  return {
    name: item.name,
    active: item.active,
    month: item.month,
    day: item.day,
    professions: [...item.professions],
  };
}

/**
 * Mescla a configuração do tenant com o catálogo mestre.
 * Para datas do catálogo, mês/dia/profissões são canônicos e somente `active`
 * é preservado do tenant. Datas profissionais personalizadas continuam válidas.
 */
export function mergeProfessionalDates(
  configuredDates: ProfessionalDate[] | null | undefined,
): ProfessionalDate[] {
  const configured = Array.isArray(configuredDates) ? configuredDates : [];
  const byName = new Map<string, ProfessionalDate>();

  for (const item of configured) {
    if (!item || typeof item.name !== "string") continue;
    byName.set(normalizeDateName(item.name), item);
  }

  const catalogNames = new Set<string>();
  const merged = DEFAULT_PROFESSIONAL_DATES.map((master) => {
    const names = [master.name, ...(master.aliases ?? [])].map(normalizeDateName);
    names.forEach((name) => catalogNames.add(name));
    const existing = names.map((name) => byName.get(name)).find(Boolean);

    return {
      ...publicProfessionalDate(master),
      active: existing?.active ?? master.active,
    };
  });

  for (const custom of configured) {
    if (!catalogNames.has(normalizeDateName(custom.name))) {
      merged.push(custom);
    }
  }

  return merged;
}
