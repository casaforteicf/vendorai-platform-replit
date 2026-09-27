export type SpecView =
  | "overview"
  | "objects"
  | "catalog"
  | "materials"
  | "manufacturers"
  | "suppliers"
  | "timeline"
  | "approval"
  | "ai";

export type SpecCategory =
  | "todos"
  | "mobiliario"
  | "marcenaria"
  | "iluminacao"
  | "marmoraria"
  | "decoracao"
  | "revestimentos"
  | "metais"
  | "eletros";

export type SpecStatus =
  | "selecionado"
  | "especificado"
  | "orcado"
  | "comprado"
  | "produzido"
  | "entregue"
  | "instalado";

export type SpecObject = {
  id: string;
  name: string;
  category: SpecCategory;
  environment: string;
  supplier: string;
  manufacturer: string;
  sku: string;
  material: string;
  finish: string;
  dimensions: string;
  price: string;
  deadline: string;
  status: SpecStatus;
  compatibility: number;
  aiNote: string;
};

export type ProductItem = {
  id: string;
  name: string;
  category: SpecCategory;
  manufacturer: string;
  collection: string;
  sku: string;
  price: string;
  leadTime: string;
  compatibility: number;
  tags: string[];
  hasBim?: boolean;
  hasSketchup?: boolean;
  hasPdf?: boolean;
  favorite?: boolean;
};

export type MaterialItem = {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  collection: string;
  finish: string;
  price: string;
  leadTime: string;
  stock: string;
};

export type Manufacturer = {
  id: string;
  name: string;
  category: string;
  score: number;
  products: number;
  status: "ativo" | "pendente" | "revisar";
};

export type Supplier = {
  id: string;
  name: string;
  category: string;
  score: number;
  deadline: string;
  city: string;
  status: "apto" | "revisar" | "indisponivel";
};

export type AIRecommendation = {
  id: string;
  title: string;
  description: string;
  impact: string;
  action: string;
};
