// ─── Ecosystem Hub — local types & constants ──────────────────────────────────
// Mirrors lib/db/src/schema/vep_*.ts — NO @workspace/db dependency.

export const VEP_COMPANY_TYPES = [
  "ARCHITECTURE", "INTERIOR_DESIGN", "CONSTRUCTION", "DEVELOPER",
  "CABINETRY", "STONE", "LIGHTING", "AUTOMATION", "PAINT", "FLOORING",
  "WINDOWS", "PVC", "SUPPLIER", "MANUFACTURER", "DISTRIBUTOR",
  "SERVICE", "CONSULTING", "OTHER",
] as const;

export const VEP_COMPANY_TIERS  = ["basic", "verified", "certified", "premium", "enterprise"] as const;
export const VEP_COMPANY_STATUS = ["active", "inactive", "pending", "suspended"] as const;

export const VEP_PROFESSIONAL_ROLES = [
  "ARCHITECT", "INTERIOR_DESIGNER", "ENGINEER", "REPRESENTATIVE",
  "CONSULTANT", "DESIGNER", "SELLER", "SUPPORT", "FINANCIAL",
  "PROCUREMENT", "MANAGER", "DIRECTOR", "OTHER",
] as const;

export const VEP_PORTFOLIO_TYPES = [
  "PROJECT", "PHOTO", "VIDEO", "RENDER", "BIM",
  "COMPONENT", "TEMPLATE", "CASE_STUDY", "CATALOG", "OTHER",
] as const;

export type CompanyType       = typeof VEP_COMPANY_TYPES[number];
export type CompanyTier       = typeof VEP_COMPANY_TIERS[number];
export type ProfessionalRole  = typeof VEP_PROFESSIONAL_ROLES[number];
export type PortfolioType     = typeof VEP_PORTFOLIO_TYPES[number];

export interface VepCompany {
  id:             string;
  type:           string;
  legalName:      string;
  tradeName:      string | null;
  logoUrl:        string | null;
  coverUrl:       string | null;
  description:    string | null;
  mission:        string | null;
  history:        string | null;
  website:        string | null;
  cnpj:           string | null;
  phone:          string | null;
  email:          string | null;
  city:           string | null;
  state:          string | null;
  country:        string | null;
  address:        string | null;
  segments:       string[];
  specialties:    string[];
  regions:        string[];
  certifications: string[];
  languages:      string[];
  tags:           string[];
  tier:           string;
  foundedYear:    number | null;
  teamSize:       string | null;
  socialMedia:    Record<string, string>;
  workingHours:   Record<string, string>;
  status:         string;
  featured:       boolean;
  verified:       boolean;
  followersCount: number;
  projectsCount:  number;
  portfolioCount: number;
  tenantId:       string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface VepProfessional {
  id:             string;
  companyId:      string | null;
  name:           string;
  role:           string | null;
  title:          string | null;
  bio:            string | null;
  avatarUrl:      string | null;
  email:          string | null;
  phone:          string | null;
  linkedin:       string | null;
  instagram:      string | null;
  specialties:    string[];
  regions:        string[];
  languages:      string[];
  registerNumber: string | null;
  registerType:   string | null;
  userId:         string | null;
  active:         boolean;
  featured:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface VepPortfolioItem {
  id:          string;
  companyId:   string;
  type:        string;
  title:       string;
  description: string | null;
  coverUrl:    string | null;
  mediaUrls:   string[];
  tags:        string[];
  style:       string | null;
  area:        number | null;
  year:        number | null;
  city:        string | null;
  state:       string | null;
  partnerIds:  string[];
  viewsCount:  number;
  likesCount:  number;
  savesCount:  number;
  published:   boolean;
  featured:    boolean;
  createdAt:   Date;
  updatedAt:   Date;
}
