import { and, eq } from "drizzle-orm";
import { db, archCatalogoTable } from "@workspace/db";

const BASE_SUPPLIER = "Arqdor Base";
const KH_MODELS = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";

type StarterRealModel = {
  url: string;
  label: string;
  license: string;
  source: string;
};

const starterRealModels: Record<string, Array<StarterRealModel | null>> = {
  sofas: [
    {
      url: `${KH_MODELS}/SheenWoodLeatherSofa/glTF-Binary/SheenWoodLeatherSofa.glb`,
      label: "Sofá realista couro/madeira",
      license: "CC0 / CC BY 4.0",
      source: "Khronos glTF Sample Assets",
    },
    {
      url: `${KH_MODELS}/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb`,
      label: "Sofá realista veludo",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / Wayfair",
    },
  ],
  poltronas: [
    {
      url: `${KH_MODELS}/SheenChair/glTF-Binary/SheenChair.glb`,
      label: "Poltrona realista",
      license: "CC0",
      source: "Khronos glTF Sample Assets",
    },
    {
      url: `${KH_MODELS}/ChairDamaskPurplegold/glTF-Binary/ChairDamaskPurplegold.glb`,
      label: "Poltrona realista decorativa",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / Wayfair",
    },
  ],
  cadeiras: [
    {
      url: `${KH_MODELS}/SheenChair/glTF-Binary/SheenChair.glb`,
      label: "Cadeira realista",
      license: "CC0",
      source: "Khronos glTF Sample Assets",
    },
  ],
  pufes: [
    {
      url: `${KH_MODELS}/SpecularSilkPouf/glTF-Binary/SpecularSilkPouf.glb`,
      label: "Pufe realista em tecido",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / Wayfair",
    },
  ],
  iluminacao: [
    {
      url: `${KH_MODELS}/IridescenceLamp/glTF-Binary/IridescenceLamp.glb`,
      label: "Luminária realista",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / Wayfair",
    },
    {
      url: `${KH_MODELS}/AnisotropyBarnLamp/glTF-Binary/AnisotropyBarnLamp.glb`,
      label: "Luminária realista industrial",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / Wayfair",
    },
    {
      url: `${KH_MODELS}/LightsPunctualLamp/glTF-Binary/LightsPunctualLamp.glb`,
      label: "Luminária com luz pontual",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / DGG",
    },
    {
      url: `${KH_MODELS}/Lantern/glTF-Binary/Lantern.glb`,
      label: "Lanterna decorativa",
      license: "CC0",
      source: "Khronos glTF Sample Assets / Microsoft",
    },
  ],
  eletros: [
    {
      url: `${KH_MODELS}/CommercialRefrigerator/glTF-Binary/CommercialRefrigerator.glb`,
      label: "Geladeira realista com porta",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / DGG / Sean Thomas",
    },
    {
      url: `${KH_MODELS}/CommercialRefrigerator/glTF-Binary/CommercialRefrigerator.glb`,
      label: "Geladeira realista com porta",
      license: "CC BY 4.0",
      source: "Khronos glTF Sample Assets / DGG / Sean Thomas",
    },
    null,
    null,
    null,
    null,
    null,
  ],
  paisagismo: [
    null,
    null,
    null,
    null,
    {
      url: `${KH_MODELS}/DiffuseTransmissionPlant/glTF-Binary/DiffuseTransmissionPlant.glb`,
      label: "Planta em vaso realista",
      license: "CC BY 4.0 + origem CC0",
      source: "Khronos glTF Sample Assets / Poly Haven",
    },
  ],
  "decoracao-real": [
    {
      url: `${KH_MODELS}/GlassVaseFlowers/glTF-Binary/GlassVaseFlowers.glb`,
      label: "Vaso com flores realista",
      license: "CC0",
      source: "Khronos glTF Sample Assets",
    },
    {
      url: `${KH_MODELS}/DiffuseTransmissionTeacup/glTF-Binary/DiffuseTransmissionTeacup.glb`,
      label: "Xícara decorativa realista",
      license: "CC0",
      source: "Khronos glTF Sample Assets / Poly Haven",
    },
  ],
};

function starterRealModel(family: string, variantIndex: number) {
  const variants = starterRealModels[family] ?? [];
  return variants[variantIndex] ?? null;
}


type SeedItem = {
  nome: string;
  descricao: string;
  categoria: string;
  subcategoria: string;
  unidade?: string;
  especificacoes: Record<string, unknown>;
};

type FamilyTemplate = {
  family: string;
  categoria: string;
  subcategoria: string;
  variants: Array<{ name: string; width: number; depth: number; height?: number }>;
  tags: string[];
};

const familyTemplates: FamilyTemplate[] = [
  { family: "sofas", categoria: "Mobiliário", subcategoria: "Sala", tags: ["sala","estofado"], variants: [
    { name:"Sofá 2 lugares", width:1.70, depth:0.90, height:0.85 },
    { name:"Sofá 3 lugares", width:2.20, depth:0.90, height:0.85 },
    { name:"Sofá 4 lugares", width:2.80, depth:1.00, height:0.85 },
    { name:"Sofá com chaise", width:2.80, depth:1.70, height:0.85 },
    { name:"Sofá modular", width:3.20, depth:1.05, height:0.82 },
  ]},
  { family: "poltronas", categoria: "Mobiliário", subcategoria: "Sala", tags: ["sala","assento"], variants: [
    { name:"Poltrona compacta", width:0.72, depth:0.76, height:0.82 },
    { name:"Poltrona lounge", width:0.88, depth:0.92, height:0.88 },
    { name:"Poltrona giratória", width:0.82, depth:0.82, height:0.84 },
  ]},
  { family: "mesas-centro", categoria: "Mobiliário", subcategoria: "Sala", tags: ["sala","mesa"], variants: [
    { name:"Mesa centro retangular", width:1.20, depth:0.65, height:0.38 },
    { name:"Mesa centro redonda", width:0.90, depth:0.90, height:0.38 },
    { name:"Mesa lateral", width:0.50, depth:0.50, height:0.55 },
  ]},
  { family: "camas", categoria: "Mobiliário", subcategoria: "Quarto", tags: ["quarto","cama"], variants: [
    { name:"Cama solteiro", width:0.90, depth:1.90, height:0.55 },
    { name:"Cama casal", width:1.40, depth:1.90, height:0.55 },
    { name:"Cama queen", width:1.60, depth:2.00, height:0.58 },
    { name:"Cama king", width:1.93, depth:2.03, height:0.58 },
  ]},
  { family: "roupeiros", categoria: "Marcenaria", subcategoria: "Quarto", tags: ["quarto","armário"], variants: [
    { name:"Roupeiro 2 portas", width:1.20, depth:0.60, height:2.30 },
    { name:"Roupeiro 4 portas", width:2.00, depth:0.60, height:2.30 },
    { name:"Roupeiro 6 portas", width:2.70, depth:0.60, height:2.30 },
  ]},
  { family: "jantar", categoria: "Mobiliário", subcategoria: "Jantar", tags: ["jantar","mesa"], variants: [
    { name:"Mesa jantar 4 lugares", width:1.20, depth:0.80, height:0.75 },
    { name:"Mesa jantar 6 lugares", width:1.80, depth:0.90, height:0.75 },
    { name:"Mesa jantar 8 lugares", width:2.40, depth:1.00, height:0.75 },
    { name:"Mesa jantar redonda 4 lugares", width:1.20, depth:1.20, height:0.75 },
  ]},
  { family: "cadeiras", categoria: "Mobiliário", subcategoria: "Jantar", tags: ["jantar","cadeira"], variants: [
    { name:"Cadeira jantar estofada", width:0.52, depth:0.58, height:0.88 },
    { name:"Cadeira jantar madeira", width:0.48, depth:0.54, height:0.88 },
    { name:"Banqueta alta", width:0.45, depth:0.48, height:1.00 },
  ]},
  { family: "pufes", categoria: "Mobiliário", subcategoria: "Sala", tags: ["sala","pufe","assento"], variants: [
    { name:"Pufe decorativo", width:0.60, depth:0.60, height:0.45 },
  ]},
  { family: "cozinha-base", categoria: "Marcenaria", subcategoria: "Cozinha", tags: ["cozinha","modulado"], variants: [
    { name:"Balcão cozinha 60", width:0.60, depth:0.60, height:0.90 },
    { name:"Balcão cozinha 80", width:0.80, depth:0.60, height:0.90 },
    { name:"Balcão cozinha 120", width:1.20, depth:0.60, height:0.90 },
    { name:"Torre quente", width:0.70, depth:0.65, height:2.20 },
    { name:"Armário aéreo 80", width:0.80, depth:0.35, height:0.75 },
    { name:"Armário aéreo 120", width:1.20, depth:0.35, height:0.75 },
    { name:"Ilha cozinha", width:1.80, depth:0.90, height:0.92 },
  ]},
  { family: "banheiro", categoria: "Banheiro", subcategoria: "Louças e mobiliário", tags: ["banheiro"], variants: [
    { name:"Gabinete banheiro 60", width:0.60, depth:0.48, height:0.82 },
    { name:"Gabinete banheiro 90", width:0.90, depth:0.50, height:0.82 },
    { name:"Gabinete banheiro 120", width:1.20, depth:0.52, height:0.82 },
    { name:"Vaso sanitário", width:0.38, depth:0.68, height:0.78 },
    { name:"Cuba de apoio", width:0.42, depth:0.42, height:0.16 },
  ]},
  { family: "escritorio", categoria: "Mobiliário", subcategoria: "Escritório", tags: ["escritório"], variants: [
    { name:"Mesa escritório 120", width:1.20, depth:0.60, height:0.75 },
    { name:"Mesa escritório 160", width:1.60, depth:0.70, height:0.75 },
    { name:"Cadeira escritório", width:0.62, depth:0.62, height:1.05 },
    { name:"Estante escritório", width:1.20, depth:0.35, height:2.00 },
  ]},
  { family: "iluminacao", categoria: "Iluminação", subcategoria: "Luminárias", tags: ["iluminação"], variants: [
    { name:"Plafon redondo", width:0.40, depth:0.40, height:0.08 },
    { name:"Pendente pequeno", width:0.30, depth:0.30, height:0.45 },
    { name:"Pendente linear", width:1.20, depth:0.12, height:0.12 },
    { name:"Arandela", width:0.22, depth:0.16, height:0.30 },
    { name:"Luminária de piso", width:0.42, depth:0.42, height:1.65 },
    { name:"Balizador externo", width:0.15, depth:0.15, height:0.60 },
  ]},
  { family: "externo", categoria: "Área externa", subcategoria: "Mobiliário", tags: ["externo"], variants: [
    { name:"Espreguiçadeira", width:0.72, depth:1.95, height:0.42 },
    { name:"Mesa externa 4 lugares", width:1.20, depth:0.80, height:0.75 },
    { name:"Banco jardim", width:1.50, depth:0.55, height:0.82 },
    { name:"Ombrelone", width:2.50, depth:2.50, height:2.40 },
  ]},
  { family: "paisagismo", categoria: "Paisagismo", subcategoria: "Vegetação", tags: ["vegetação","externo"], variants: [
    { name:"Árvore ornamental pequena", width:1.80, depth:1.80, height:3.00 },
    { name:"Árvore ornamental média", width:3.00, depth:3.00, height:5.00 },
    { name:"Palmeira", width:2.20, depth:2.20, height:5.50 },
    { name:"Arbusto", width:0.90, depth:0.90, height:0.90 },
    { name:"Vaso com folhagem", width:0.55, depth:0.55, height:1.10 },
  ]},
  { family: "decoracao-real", categoria: "Decoração", subcategoria: "Objetos decorativos", tags: ["decoração","vaso","flores"], variants: [
    { name:"Vaso decorativo com flores", width:0.42, depth:0.42, height:0.75 },
    { name:"Xícara decorativa realista", width:0.18, depth:0.14, height:0.12 },
  ]},
  { family: "esquadrias-portas", categoria: "Esquadrias", subcategoria: "Portas", tags: ["porta","esquadria"], variants: [
    { name:"Porta giro 80", width:0.80, depth:0.12, height:2.10 },
    { name:"Porta giro 90", width:0.90, depth:0.12, height:2.10 },
    { name:"Porta correr 2 folhas", width:1.80, depth:0.14, height:2.10 },
    { name:"Porta pivotante", width:1.20, depth:0.14, height:2.50 },
  ]},
  { family: "esquadrias-janelas", categoria: "Esquadrias", subcategoria: "Janelas", tags: ["janela","esquadria"], variants: [
    { name:"Janela correr 120x120", width:1.20, depth:0.14, height:1.20 },
    { name:"Janela correr 200x120", width:2.00, depth:0.14, height:1.20 },
    { name:"Janela maxim-ar 80x60", width:0.80, depth:0.14, height:0.60 },
    { name:"Janela fixa 200x200", width:2.00, depth:0.14, height:2.00 },
  ]},
  { family: "eletros", categoria: "Eletros", subcategoria: "Cozinha", tags: ["eletrodoméstico","cozinha"], variants: [
    { name:"Geladeira duplex", width:0.75, depth:0.75, height:1.85 },
    { name:"Geladeira side by side", width:0.92, depth:0.78, height:1.78 },
    { name:"Forno embutir", width:0.60, depth:0.58, height:0.60 },
    { name:"Micro-ondas embutir", width:0.60, depth:0.45, height:0.38 },
    { name:"Cooktop 4 bocas", width:0.60, depth:0.52, height:0.08 },
    { name:"Cooktop 5 bocas", width:0.75, depth:0.52, height:0.08 },
    { name:"Coifa ilha", width:0.90, depth:0.60, height:0.85 },
  ]},
];

function starterPbrKey(nome: string) {
  const n = nome.toLocaleLowerCase("pt-BR");
  if (n.includes("porcelanato") || n.includes("cerâmica")) return "porcelanato-claro";
  if (n.includes("cimento queimado")) return "cimento-queimado";
  if (n.includes("carvalho") || n.includes("freijó") || n.includes("madeira ripada")) return "madeira-carvalho";
  if (n.includes("nogueira")) return "madeira-escura";
  if (n.includes("pedra") || n.includes("granito") || n.includes("mármore") || n.includes("quartzo")) return "pedra-natural";
  if (n.includes("pintura branca")) return "pintura-branca";
  if (n.includes("pintura cinza")) return "pintura-cinza";
  if (n.includes("verde sálvia")) return "pintura-salvia";
  if (n.includes("linho") || n.includes("bouclé")) return "tecido-bege";
  if (n.includes("couro")) return "couro-caramelo";
  if (n.includes("vinílico") || n.includes("laminado")) return "madeira-carvalho";
  if (n.includes("deck")) return "madeira-escura";
  if (n.includes("grama")) return "folhagem-verde";
  if (n.includes("metal preto")) return "preto-fosco";
  if (n.includes("aço inox")) return "aco-inox";
  if (n.includes("champanhe")) return "metal-champanhe";
  if (n.includes("vidro fumê")) return "vidro-fume";
  if (n.includes("vidro")) return "vidro-incolor";
  return "pintura-branca";
}

const materialSeeds: SeedItem[] = [
  ["Porcelanato branco acetinado","Revestimentos","Porcelanato","acetinado","#e8e7e2"],
  ["Porcelanato bege acetinado","Revestimentos","Porcelanato","acetinado","#d8cbb6"],
  ["Porcelanato cinza concreto","Revestimentos","Porcelanato","acetinado","#aaa9a5"],
  ["Porcelanato marmorizado claro","Revestimentos","Porcelanato","polido","#ddd9d2"],
  ["Cerâmica branca","Revestimentos","Cerâmica","acetinado","#f2f2ef"],
  ["Cimento queimado claro","Revestimentos","Cimentício","fosco","#b8b7b2"],
  ["Cimento queimado escuro","Revestimentos","Cimentício","fosco","#777773"],
  ["Carvalho natural","Madeiras","Madeira","natural","#c6a477"],
  ["Freijó natural","Madeiras","Madeira","natural","#b58b5a"],
  ["Nogueira","Madeiras","Madeira","natural","#71513c"],
  ["Madeira ripada clara","Madeiras","Painel ripado","natural","#bd9569"],
  ["MDF branco fosco","Marcenaria","MDF","fosco","#f1f1ef"],
  ["MDF fendi","Marcenaria","MDF","fosco","#b9ad9d"],
  ["MDF grafite","Marcenaria","MDF","fosco","#484a4c"],
  ["MDF verde sálvia","Marcenaria","MDF","fosco","#87917d"],
  ["Pedra natural clara","Pedras","Pedra natural","natural","#cbc3b4"],
  ["Granito cinza","Pedras","Granito","polido","#8f8d88"],
  ["Quartzo branco","Pedras","Quartzo","polido","#eceae6"],
  ["Mármore claro","Pedras","Mármore","polido","#dedbd3"],
  ["Aço inox","Metais","Aço","escovado","#aeb3b7"],
  ["Metal preto","Metais","Metal","fosco","#24272b"],
  ["Metal champanhe","Metais","Metal","acetinado","#aa8e62"],
  ["Vidro incolor","Vidros","Vidro","transparente","#dce8e8"],
  ["Vidro fumê","Vidros","Vidro","transparente","#697372"],
  ["Linho areia","Tecidos","Linho","tramado","#d3c0a5"],
  ["Bouclé off-white","Tecidos","Bouclé","texturizado","#e2ddd3"],
  ["Couro caramelo","Tecidos","Couro","natural","#9c623b"],
  ["Pintura branca","Pinturas","Tinta","fosco","#f6f5f1"],
  ["Pintura cinza quente","Pinturas","Tinta","fosco","#aaa49b"],
  ["Pintura verde sálvia","Pinturas","Tinta","fosco","#8c9982"],
  ["Piso vinílico carvalho","Pisos","Vinílico","madeirado","#ba9870"],
  ["Piso laminado claro","Pisos","Laminado","madeirado","#c5aa82"],
  ["Deck madeira natural","Área externa","Deck","natural","#9d7048"],
  ["Pedra drenante clara","Área externa","Piso drenante","natural","#bbb4a7"],
  ["Grama natural","Paisagismo","Gramado","natural","#71815e"],
].map(([nome,categoria,subcategoria,finish,swatch]) => ({
  nome,
  descricao: `Material genérico da biblioteca inicial Arqdor. Substituível por parceiro/fabricante local sem alterar a especificação do projeto.`,
  categoria,
  subcategoria,
  unidade: "m²",
  especificacoes: {
    assetType: "material",
    family: subcategoria,
    finish,
    swatch,
    pbrKey: starterPbrKey(nome),
    pbrReady: true,
    replaceable: true,
    source: "arqdor-starter",
    partnerStatus: "generic",
  },
}));

const familySeeds: SeedItem[] = familyTemplates.flatMap((template) =>
  template.variants.map((variant, index) => ({
    nome: variant.name,
    descricao: `Família genérica ${template.subcategoria} para composição inicial de projetos. Preparada para receber modelo GLB/GLTF e ser substituída por produto parceiro.`,
    categoria: template.categoria,
    subcategoria: template.subcategoria,
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: template.family,
      variantIndex: index,
      dimensionsM: {
        width: variant.width,
        depth: variant.depth,
        height: variant.height ?? null,
      },
      tags: template.tags,
      model3dUrl: starterRealModel(template.family, index)?.url ?? null,
      modelLabel: starterRealModel(template.family, index)?.label ?? null,
      modelLicense: starterRealModel(template.family, index)?.license ?? null,
      modelSource: starterRealModel(template.family, index)?.source ?? null,
      lod: starterRealModel(template.family, index) ? "real" : "placeholder",
      replaceable: true,
      source: starterRealModel(template.family, index) ? "arqdor-real-starter" : "arqdor-starter",
      partnerStatus: "generic",
    },
  })),
);


const curatedPolyHavenSeeds: SeedItem[] = [
  {
    nome: "Mesa lateral moderna",
    descricao: "Modelo 3D curado CC0 da Poly Haven para uso direto na biblioteca Arqdor.",
    categoria: "Mobiliário",
    subcategoria: "Sala",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 0.60, depth: 0.60, height: 0.60 },
      tags: ["mesa", "sala", "moderna", "polyhaven"],
      polyHavenSlug: "side_table_01",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Mesa de centro moderna",
    descricao: "Modelo 3D curado CC0 da Poly Haven para uso direto na biblioteca Arqdor.",
    categoria: "Mobiliário",
    subcategoria: "Sala",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 1.20, depth: 0.70, height: 0.42 },
      tags: ["mesa", "centro", "moderna", "polyhaven"],
      polyHavenSlug: "modern_coffee_table_01",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Mesa de jantar rústica",
    descricao: "Modelo 3D curado CC0 da Poly Haven para uso direto na biblioteca Arqdor.",
    categoria: "Mobiliário",
    subcategoria: "Jantar",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 2.40, depth: 0.95, height: 0.76 },
      tags: ["mesa", "jantar", "madeira", "polyhaven"],
      polyHavenSlug: "painted_wooden_table",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Aparador industrial em madeira",
    descricao: "Modelo 3D curado CC0 da Poly Haven para uso direto na biblioteca Arqdor.",
    categoria: "Mobiliário",
    subcategoria: "Sala",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 1.30, depth: 0.48, height: 0.90 },
      tags: ["aparador", "armário", "industrial", "polyhaven"],
      polyHavenSlug: "WoodenTable_03",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Gaveteiro moderno",
    descricao: "Modelo 3D curado CC0 da Poly Haven para uso direto na biblioteca Arqdor.",
    categoria: "Marcenaria",
    subcategoria: "Escritório",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 1.10, depth: 0.45, height: 0.95 },
      tags: ["gaveteiro", "armário", "escritório", "polyhaven"],
      polyHavenSlug: "drawer_cabinet",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Conjunto mesa e cadeiras externo",
    descricao: "Modelo 3D curado CC0 da Poly Haven para uso direto na biblioteca Arqdor.",
    categoria: "Área externa",
    subcategoria: "Mobiliário",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 1.80, depth: 1.80, height: 0.85 },
      tags: ["externo", "mesa", "cadeiras", "polyhaven"],
      polyHavenSlug: "outdoor_table_chair_set_01",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Armário moderno em madeira",
    descricao: "Modelo 3D curado CC0 da Poly Haven para armazenamento, marcenaria e composição de interiores.",
    categoria: "Marcenaria",
    subcategoria: "Armários",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 2.40, depth: 0.55, height: 1.15 },
      tags: ["armário", "cabinet", "marcenaria", "sala", "cozinha", "polyhaven"],
      polyHavenSlug: "modern_wooden_cabinet",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Armário rústico alto",
    descricao: "Modelo 3D curado CC0 da Poly Haven para despensa, escritório e ambientes residenciais.",
    categoria: "Marcenaria",
    subcategoria: "Armários",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 1.20, depth: 0.52, height: 2.60 },
      tags: ["armário", "cabinet", "despensa", "escritório", "polyhaven"],
      polyHavenSlug: "painted_wooden_cabinet_02",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },
  },
  {
    nome: "Poltrona lounge mid-century",
    descricao: "Modelo 3D curado CC0 da Poly Haven para sala, escritório e leitura.",
    categoria: "Mobiliário",
    subcategoria: "Sala",
    unidade: "un",
    especificacoes: {
      assetType: "family",
      family: "polyhaven-curated",
      dimensionsM: { width: 1.20, depth: 0.95, height: 1.00 },
      tags: ["poltrona", "lounge", "escritório", "sala", "polyhaven"],
      polyHavenSlug: "mid_century_lounge_chair",
      modelLicense: "CC0",
      modelSource: "Poly Haven",
      lod: "real-remote",
      replaceable: true,
      source: "arqdor-curated-polyhaven",
      partnerStatus: "generic",
    },

];

export const ARQDOR_STARTER_LIBRARY = [...familySeeds, ...curatedPolyHavenSeeds, ...materialSeeds];

export async function ensureArqdorStarterLibrary(tenantId: string) {
  const existing = await db
    .select({
      id: archCatalogoTable.id,
      nome: archCatalogoTable.nome,
      especificacoes: archCatalogoTable.especificacoes,
    })
    .from(archCatalogoTable)
    .where(and(
      eq(archCatalogoTable.tenantId, tenantId),
      eq(archCatalogoTable.fornecedor, BASE_SUPPLIER),
    ));

  const byName = new Map(existing.map((item) => [item.nome, item]));
  const missing = ARQDOR_STARTER_LIBRARY.filter((item) => !byName.has(item.nome));

  if (missing.length) {
    await db.insert(archCatalogoTable).values(missing.map((item) => ({
      tenantId,
      nome: item.nome,
      descricao: item.descricao,
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      fornecedor: BASE_SUPPLIER,
      unidade: item.unidade ?? "un",
      especificacoes: item.especificacoes,
      ativo: true,
    })) as any);
  }

  let updated = 0;
  for (const item of ARQDOR_STARTER_LIBRARY) {
    const current = byName.get(item.nome);
    if (!current) continue;

    const nextSpecs = item.especificacoes;
    const currentSpecs = (current.especificacoes ?? {}) as Record<string, unknown>;
    const shouldUpgrade =
      currentSpecs.model3dUrl !== nextSpecs.model3dUrl ||
      currentSpecs.pbrKey !== nextSpecs.pbrKey ||
      currentSpecs.source !== nextSpecs.source;

    if (!shouldUpgrade) continue;

    await db
      .update(archCatalogoTable)
      .set({
        descricao: item.descricao,
        categoria: item.categoria,
        subcategoria: item.subcategoria,
        unidade: item.unidade ?? "un",
        especificacoes: { ...currentSpecs, ...nextSpecs },
        ativo: true,
      })
      .where(and(
        eq(archCatalogoTable.id, current.id),
        eq(archCatalogoTable.tenantId, tenantId),
      ));
    updated += 1;
  }

  return {
    created: missing.length,
    updated,
    total: ARQDOR_STARTER_LIBRARY.length,
  };
}
