// ─── Vendor Certified Network — frontend types ────────────────────────────────
// Mirrors lib/db/src/schema/vcn_*.ts — NO @workspace/db dependency.

export const VCN_COMPANY_TYPES = [
  "MANUFACTURER", "DISTRIBUTOR", "RESELLER", "REPRESENTATIVE",
  "SERVICE_PROVIDER", "CABINETRY", "LIGHTING", "STONE", "FLOORING",
  "WINDOWS", "AUTOMATION", "PAINT", "FURNITURE", "DECOR", "OTHER",
] as const;

export const VCN_CERTIFICATION_LEVELS = ["official", "certified", "premium", "enterprise"] as const;
export const VCN_SPECIALIST_TYPES = [
  "TECHNICAL", "COMMERCIAL", "INSTALLATION", "AFTER_SALES", "WARRANTY", "PROJECTS", "GENERAL",
] as const;
export const VCN_DOCUMENT_TYPES = [
  "PDF", "CATALOG", "MANUAL", "NORM", "BIM", "PBR", "TEXTURE",
  "VIDEO", "FAQ", "SPEC_SHEET", "PRESENTATION", "SPREADSHEET", "OTHER",
] as const;

export type VcnCompanyType      = typeof VCN_COMPANY_TYPES[number];
export type VcnCertLevel        = typeof VCN_CERTIFICATION_LEVELS[number];
export type VcnSpecialistType   = typeof VCN_SPECIALIST_TYPES[number];

export interface VcnCompany {
  id:                  string;
  type:                string;
  legalName:           string;
  brandName:           string | null;
  logoUrl:             string | null;
  coverUrl:            string | null;
  description:         string | null;
  website:             string | null;
  cnpj:                string | null;
  phone:               string | null;
  email:               string | null;
  city:                string | null;
  state:               string | null;
  country:             string | null;
  address:             string | null;
  segments:            string[];
  categories:          string[];
  regions:             string[];
  specialties:         string[];
  tags:                string[];
  languages:           string[];
  certificationLevel:  string;
  certifications:      string[];
  verified:            boolean;
  featured:            boolean;
  foundedYear:         number | null;
  teamSize:            string | null;
  socialMedia:         Record<string, string>;
  workingHours:        Record<string, string>;
  status:              string;
  productsCount:       number;
  specificationsCount: number;
  quotationsCount:     number;
  specialistsCount:    number;
  tenantId:            string | null;
  createdAt:           Date;
  updatedAt:           Date;
}

export interface VcnSpecialist {
  id:              string;
  companyId:       string;
  name:            string;
  specialistType:  string;
  avatarUrl:       string | null;
  description:     string | null;
  systemPrompt:    string | null;
  knowledgeTopics: string[];
  languages:       string[];
  responseStyle:   string | null;
  agentConfigId:   string | null;
  active:          boolean;
  featured:        boolean;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface VcnProduct {
  id:                  string;
  companyId:           string;
  name:                string;
  line:                string | null;
  model:               string | null;
  sku:                 string | null;
  description:         string | null;
  coverUrl:            string | null;
  imageUrls:           string[];
  finishes:            string[];
  colors:              string[];
  materials:           string[];
  dimensions:          Record<string, string>;
  compatibility:       string[];
  relatedSkus:         string[];
  specs:               Record<string, string>;
  bimUrls:             string[];
  cadUrls:             string[];
  pbrUrls:             string[];
  textureUrls:         string[];
  manualUrls:          string[];
  videoUrls:           string[];
  price:               string | null;
  priceUnit:           string | null;
  inStock:             boolean;
  leadTimeDays:        number | null;
  warrantyMonths:      number | null;
  norms:               string[];
  certifications:      string[];
  specificationsCount: number;
  quotationsCount:     number;
  viewsCount:          number;
  published:           boolean;
  featured:            boolean;
  category:            string | null;
  tags:                string[];
  createdAt:           Date;
  updatedAt:           Date;
}

export interface VcnKnowledgeDoc {
  id:          string;
  companyId:   string;
  type:        string;
  title:       string;
  description: string | null;
  fileUrl:     string | null;
  fileSize:    number | null;
  mimeType:    string | null;
  productSkus: string[];
  tags:        string[];
  indexed:     boolean;
  indexedAt:   Date | null;
  chunkCount:  number | null;
  published:   boolean;
  language:    string | null;
  version:     string | null;
  createdAt:   Date;
  updatedAt:   Date;
}
