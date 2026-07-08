export type MarketplaceView =
  | "home"
  | "catalog"
  | "manufacturers"
  | "assets"
  | "publish"
  | "orders"
  | "analytics"
  | "ai";

export type ProductCategory =
  | "todos"
  | "moveis"
  | "iluminacao"
  | "decoracao"
  | "metais"
  | "pedras"
  | "tintas"
  | "tecidos"
  | "mdf"
  | "pisos"
  | "revestimentos"
  | "eletros";

export type AssetType = "pdf" | "bim" | "revit" | "sketchup" | "dwg" | "texture" | "image";

export type MarketplaceProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  manufacturer: string;
  supplier: string;
  collection: string;
  sku: string;
  price: number;
  leadTime: string;
  stock: string;
  score: number;
  tags: string[];
  assets: AssetType[];
  status: "publicado" | "rascunho" | "revisao" | "indisponivel";
};

export type Manufacturer = {
  id: string;
  name: string;
  category: string;
  products: number;
  assets: number;
  score: number;
  status: "ativo" | "pendente" | "premium";
};

export type MarketplaceAsset = {
  id: string;
  name: string;
  product: string;
  type: AssetType;
  size: string;
  version: string;
  status: "validado" | "pendente" | "desatualizado";
};

export type MarketplaceOrder = {
  id: string;
  code: string;
  product: string;
  buyer: string;
  supplier: string;
  value: number;
  status: "novo" | "processando" | "enviado" | "entregue" | "cancelado";
  date: string;
};
