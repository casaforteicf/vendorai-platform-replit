// ─── Partner Hub — local types & constants ────────────────────────────────────
// Mirrors lib/db/src/schema/vpn_partners.ts — NO @workspace/db dependency.

export const PARTNER_TYPES = [
  "MANUFACTURER", "DISTRIBUTOR", "RESELLER", "REPRESENTATIVE",
  "INSTALLER", "SERVICE_PROVIDER", "ARCHITECT", "DESIGNER",
  "CONSTRUCTOR", "SUPPLIER", "LANDSCAPING", "LIGHTING",
  "MARBLE", "CABINETRY", "AUTOMATION", "CUSTOM",
] as const;

export const PARTNER_TIERS  = ["basic", "verified", "official", "premium", "enterprise"] as const;
export const PARTNER_STATUS = ["active", "inactive", "pending", "suspended"] as const;

export type PartnerType   = typeof PARTNER_TYPES[number];
export type PartnerTier   = typeof PARTNER_TIERS[number];
export type PartnerStatus = typeof PARTNER_STATUS[number];

export interface VpnPartner {
  id:             string;
  name:           string;
  brand:          string | null;
  type:           string;
  logoUrl:        string | null;
  description:    string | null;
  website:        string | null;
  phone:          string | null;
  email:          string | null;
  city:           string | null;
  state:          string | null;
  country:        string | null;
  regions:        string[];
  segments:       string[];
  specialties:    string[];
  certifications: string[];
  languages:      string[];
  tags:           string[];
  tier:           string;
  status:         string;
  featured:       boolean;
  cnpj:           string | null;
  workingHours:   Record<string, string>;
  socialMedia:    Record<string, string>;
  totalLeads:     number;
  totalOrders:    number;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface VpnPartnerProduct {
  id:             string;
  partnerId:      string;
  name:           string;
  sku:            string | null;
  description:    string | null;
  category:       string | null;
  subcategory:    string | null;
  collection:     string | null;
  price:          string | null;   // numeric → string in JS
  priceUnit:      string | null;
  currency:       string | null;
  inStock:        boolean;
  leadTimeDays:   number | null;
  minOrderQty:    number | null;
  imageUrl:       string | null;
  images:         string[];
  specs:          Record<string, unknown>;
  certifications: string[];
  colors:         string[];
  finishes:       string[];
  dimensions:     Record<string, unknown>;
  active:         boolean;
  featured:       boolean;
  totalQuotes:    number;
  totalOrders:    number;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface VpnPartnerContact {
  id:        string;
  partnerId: string;
  name:      string;
  role:      string | null;
  phone:     string | null;
  email:     string | null;
  region:    string | null;
  whatsapp:  string | null;
  active:    boolean;
  createdAt: Date;
}
