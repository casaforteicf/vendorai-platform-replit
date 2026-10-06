import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Binoculars,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  MapPin,
  MapPinned,
  PackageSearch,
  Percent,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";

type OfficialSnapshot = {
  commercial?: {
    averageTicket?: number;
    commercialConversion?: number | null;
    activeOpportunities?: number;
    soldRevenue?: number;
  };
  operation?: {
    executionActive?: number;
    supportActive?: number;
    unassignedActive?: number;
    overdueTasks?: number;
  };
  intelligence?: {
    customersAtRisk?: number;
    profiles?: number;
  };
  dataQuality?: {
    score?: number | null;
  };
} | null;

type Lead = {
  id: string;
  nome?: string | null;
  assignedTo?: string | null;
  endereco?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mercadoSegmento?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
};

type Deal = {
  id: string;
  leadId?: string | null;
  titulo?: string | null;
  valor?: string | number | null;
  etapa?: string | null;
  assignedTo?: string | null;
  probabilidade?: number | null;
  wonAt?: string | null;
  lostAt?: string | null;
  dataFechamento?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ProposalItem = {
  nome?: string;
  quantidade?: number;
  valorUnitario?: number;
  sku?: string;
  produtoId?: string;
};

type Proposal = {
  id: string;
  dealId?: string | null;
  leadId?: string | null;
  status?: string | null;
  valorTotal?: string | number | null;
  itens?: ProposalItem[] | null;
  acceptedAt?: string | null;
  createdAt?: string | null;
};

type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  userFunction?: string | null;
  active?: boolean | null;
};

type AgentTask = {
  id: string;
  actionType?: string | null;
  status?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string | null;
};

type RawData = {
  leads: Lead[];
  deals: Deal[];
  proposals: Proposal[];
  users: User[];
  tasks: AgentTask[];
  unavailable: string[];
};

type CityMetric = {
  city: string;
  leads: number;
  openDeals: number;
  won: number;
  lost: number;
  pipelineValue: number;
  revenue: number;
  ticket: number;
  conversion: number | null;
  score: number;
  confidence: number;
  sellers: number;
  lat: number | null;
  long: number | null;
};

type SellerMetric = {
  id: string;
  name: string;
  active: boolean;
  openDeals: number;
  won: number;
  lost: number;
  pipelineValue: number;
  revenue: number;
  ticket: number;
  conversion: number | null;
  discounts: number[];
  avgDiscount: number | null;
};

type ProductMetric = {
  key: string;
  name: string;
  acceptedRevenue: number;
  acceptedQty: number;
  openRevenue: number;
  openQty: number;
  proposals: number;
};

type Signal = {
  id: string;
  category: "territorio" | "vendedor" | "produto" | "desconto" | "risco" | "dados";
  title: string;
  detail: string;
  metric: string;
  confidence: number;
  impact: number;
  severity: "opportunity" | "attention" | "risk";
  href: string;
};

const TERMINAL_WON = new Set(["ganho", "entregue"]);
const TERMINAL_LOST = new Set(["perdido", "cancelado"]);
const OPEN_EXCLUDED = new Set(["ganho", "entregue", "perdido", "cancelado"]);
const OPEN_PROPOSAL_STATUS = new Set(["enviada", "pendente", "rascunho"]);

function n(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function pct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function isRecent(value: string | null | undefined, cutoff: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= cutoff;
}

function closedAt(deal: Deal): string | null | undefined {
  return deal.dataFechamento || deal.wonAt || deal.lostAt || deal.updatedAt;
}

function normalizeCity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length >= 2 ? cleaned : null;
}

function leadCity(lead: Lead): string | null {
  const metadata = lead.metadata ?? {};
  const direct = [metadata["cidade"], metadata["city"], metadata["municipio"], metadata["localidade"]]
    .map(normalizeCity)
    .find(Boolean);
  if (direct) return direct;

  const address = normalizeCity(lead.endereco);
  if (!address) return null;
  const parts = address.split(",").map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2]?.replace(/\s*[-/]\s*[A-Z]{2}\b.*$/i, "").trim();
    return normalizeCity(candidate);
  }
  const stateMatch = address.match(/,\s*([^,]+?)\s*[-/]\s*[A-Z]{2}\b/i);
  return normalizeCity(stateMatch?.[1]);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function confidenceFromSample(sample: number, locationCoverage = 1): number {
  return Math.round(clamp(42 + Math.min(45, sample * 4) + Math.min(8, locationCoverage * 8), 35, 95));
}

function signalTone(severity: Signal["severity"]): string {
  if (severity === "risk") return "border-red-200 bg-red-50/70 text-red-700";
  if (severity === "attention") return "border-amber-200 bg-amber-50/70 text-amber-700";
  return "border-emerald-200 bg-emerald-50/70 text-emerald-700";
}

function cityTone(score: number): string {
  if (score >= 70) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 45) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-border bg-muted/40 text-muted-foreground";
}

function svgFill(score: number): string {
  if (score >= 70) return "fill-emerald-500";
  if (score >= 45) return "fill-amber-500";
  return "fill-slate-400";
}

function FitMapToCities({ cities }: { cities: CityMetric[] }) {
  const map = useMap();

  useEffect(() => {
    const points = cities
      .filter((city) => city.lat != null && city.long != null)
      .map((city) => [city.lat as number, city.long as number] as [number, number]);
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }
    map.fitBounds(points, { padding: [28, 28], maxZoom: 11 });
  }, [cities, map]);

  return null;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<T>;
}

export default function StrategicObserver({
  tenantId,
  token,
  official,
  refreshKey,
}: {
  tenantId: string;
  token: string | null;
  official: OfficialSnapshot;
  refreshKey: number;
}) {
  const [raw, setRaw] = useState<RawData>({ leads: [], deals: [], proposals: [], users: [], tasks: [], unavailable: [] });
  const [loading, setLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !token) {
      setRaw({ leads: [], deals: [], proposals: [], users: [], tasks: [], unavailable: [] });
      return;
    }

    let cancelled = false;
    setLoading(true);
    const requests = [
      ["leads", getJson<Lead[]>("/api/leads", token)],
      ["deals", getJson<Deal[]>(`/api/tenants/${tenantId}/deals`, token)],
      ["proposals", getJson<Proposal[]>(`/api/tenants/${tenantId}/propostas`, token)],
      ["users", getJson<User[]>(`/api/tenants/${tenantId}/users`, token)],
      ["tasks", getJson<AgentTask[]>(`/api/tenants/${tenantId}/agent-tasks`, token)],
    ] as const;

    Promise.allSettled(requests.map(([, promise]) => promise)).then((results) => {
      if (cancelled) return;
      const unavailable: string[] = [];
      const value = <T,>(index: number, label: string): T[] => {
        const result = results[index];
        if (result?.status === "fulfilled" && Array.isArray(result.value)) return result.value as T[];
        unavailable.push(label);
        return [];
      };
      setRaw({
        leads: value<Lead>(0, "leads"),
        deals: value<Deal>(1, "negócios"),
        proposals: value<Proposal>(2, "propostas"),
        users: value<User>(3, "equipe"),
        tasks: value<AgentTask>(4, "aprovações"),
        unavailable,
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, tenantId, token]);

  const analysis = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 90 * 24 * 60 * 60 * 1000;
    const leadById = new Map(raw.leads.map((lead) => [lead.id, lead]));
    const dealById = new Map(raw.deals.map((deal) => [deal.id, deal]));
    const userById = new Map(raw.users.map((user) => [user.id, user]));

    const openDeals = raw.deals.filter((deal) => !OPEN_EXCLUDED.has(String(deal.etapa ?? "")));
    const closedRecent = raw.deals.filter((deal) =>
      (TERMINAL_WON.has(String(deal.etapa ?? "")) || TERMINAL_LOST.has(String(deal.etapa ?? ""))) &&
      isRecent(closedAt(deal), cutoff),
    );
    const wonRecent = closedRecent.filter((deal) => TERMINAL_WON.has(String(deal.etapa ?? "")));
    const lostRecent = closedRecent.filter((deal) => TERMINAL_LOST.has(String(deal.etapa ?? "")));
    const recentLeads = raw.leads.filter((lead) => isRecent(lead.createdAt, cutoff));
    const pipelineValue = openDeals.reduce((sum, deal) => sum + n(deal.valor), 0);
    const wonRevenue = wonRecent.reduce((sum, deal) => sum + n(deal.valor), 0);
    const teamConversion = closedRecent.length ? wonRecent.length / closedRecent.length : null;
    const teamTicket = wonRecent.length ? wonRevenue / wonRecent.length : null;

    const relevantLeadIds = new Set<string>(recentLeads.map((lead) => lead.id));
    for (const deal of [...openDeals, ...closedRecent]) if (deal.leadId) relevantLeadIds.add(deal.leadId);

    const cityBuckets = new Map<string, {
      leads: Set<string>;
      open: Deal[];
      won: Deal[];
      lost: Deal[];
      sellers: Set<string>;
      lats: number[];
      longs: number[];
    }>();

    for (const leadId of relevantLeadIds) {
      const lead = leadById.get(leadId);
      if (!lead) continue;
      const city = leadCity(lead);
      if (!city) continue;
      const bucket = cityBuckets.get(city) ?? { leads: new Set(), open: [], won: [], lost: [], sellers: new Set(), lats: [], longs: [] };
      if (isRecent(lead.createdAt, cutoff)) bucket.leads.add(lead.id);
      if (Number.isFinite(Number(lead.latitude)) && Number.isFinite(Number(lead.longitude))) {
        bucket.lats.push(Number(lead.latitude));
        bucket.longs.push(Number(lead.longitude));
      }
      cityBuckets.set(city, bucket);
    }

    for (const deal of openDeals) {
      const lead = deal.leadId ? leadById.get(deal.leadId) : undefined;
      const city = lead ? leadCity(lead) : null;
      if (!city) continue;
      const bucket = cityBuckets.get(city) ?? { leads: new Set(), open: [], won: [], lost: [], sellers: new Set(), lats: [], longs: [] };
      bucket.open.push(deal);
      if (deal.assignedTo) bucket.sellers.add(deal.assignedTo);
      cityBuckets.set(city, bucket);
    }
    for (const deal of wonRecent) {
      const lead = deal.leadId ? leadById.get(deal.leadId) : undefined;
      const city = lead ? leadCity(lead) : null;
      if (!city) continue;
      const bucket = cityBuckets.get(city) ?? { leads: new Set(), open: [], won: [], lost: [], sellers: new Set(), lats: [], longs: [] };
      bucket.won.push(deal);
      if (deal.assignedTo) bucket.sellers.add(deal.assignedTo);
      cityBuckets.set(city, bucket);
    }
    for (const deal of lostRecent) {
      const lead = deal.leadId ? leadById.get(deal.leadId) : undefined;
      const city = lead ? leadCity(lead) : null;
      if (!city) continue;
      const bucket = cityBuckets.get(city) ?? { leads: new Set(), open: [], won: [], lost: [], sellers: new Set(), lats: [], longs: [] };
      bucket.lost.push(deal);
      if (deal.assignedTo) bucket.sellers.add(deal.assignedTo);
      cityBuckets.set(city, bucket);
    }

    const cityInterim = [...cityBuckets.entries()].map(([city, bucket]) => {
      const closed = bucket.won.length + bucket.lost.length;
      const revenue = bucket.won.reduce((sum, deal) => sum + n(deal.valor), 0);
      return {
        city,
        leads: bucket.leads.size,
        openDeals: bucket.open.length,
        won: bucket.won.length,
        lost: bucket.lost.length,
        pipelineValue: bucket.open.reduce((sum, deal) => sum + n(deal.valor), 0),
        revenue,
        ticket: bucket.won.length ? revenue / bucket.won.length : 0,
        conversion: closed ? bucket.won.length / closed : null,
        sellers: bucket.sellers.size,
        lat: mean(bucket.lats),
        long: mean(bucket.longs),
        geoCoverage: bucket.leads.size ? Math.min(1, bucket.lats.length / Math.max(1, bucket.leads.size)) : bucket.lats.length ? 1 : 0,
      };
    });

    const maxCityLeads = Math.max(1, ...cityInterim.map((city) => city.leads));
    const maxCityPipeline = Math.max(1, ...cityInterim.map((city) => city.pipelineValue));
    const cities: CityMetric[] = cityInterim.map((city) => {
      const activity = city.leads / maxCityLeads;
      const pipeline = city.pipelineValue / maxCityPipeline;
      const gap = city.conversion == null || teamConversion == null
        ? 0.35
        : clamp((teamConversion - city.conversion) * 2.5, 0, 1);
      const score = Math.round(clamp((activity * 0.30 + pipeline * 0.45 + gap * 0.25) * 100));
      return {
        ...city,
        score,
        confidence: confidenceFromSample(city.leads + city.won + city.lost + city.openDeals, city.geoCoverage),
      };
    }).sort((a, b) => (b.score - a.score) || (b.pipelineValue - a.pipelineValue));

    const discountsByDeal = new Map<string, number[]>();
    const recentDiscountTasks = raw.tasks.filter((task) => task.actionType === "aprovacao_desconto" && isRecent(task.createdAt, cutoff));
    for (const task of recentDiscountTasks) {
      const dealId = typeof task.payload?.["dealId"] === "string" ? task.payload["dealId"] as string : null;
      const discount = Number(task.payload?.["discountPercent"]);
      if (!dealId || !Number.isFinite(discount)) continue;
      discountsByDeal.set(dealId, [...(discountsByDeal.get(dealId) ?? []), discount]);
    }

    const sellerBuckets = new Map<string, SellerMetric>();
    const relevantDeals = raw.deals.filter((deal) => !OPEN_EXCLUDED.has(String(deal.etapa ?? "")) || isRecent(closedAt(deal), cutoff) || isRecent(deal.createdAt, cutoff));
    for (const deal of relevantDeals) {
      const id = deal.assignedTo || "__unassigned";
      const user = deal.assignedTo ? userById.get(deal.assignedTo) : undefined;
      const current = sellerBuckets.get(id) ?? {
        id,
        name: user?.name || (id === "__unassigned" ? "Sem responsável" : "Responsável não localizado"),
        active: user?.active !== false,
        openDeals: 0,
        won: 0,
        lost: 0,
        pipelineValue: 0,
        revenue: 0,
        ticket: 0,
        conversion: null,
        discounts: [],
        avgDiscount: null,
      };
      if (!OPEN_EXCLUDED.has(String(deal.etapa ?? ""))) {
        current.openDeals += 1;
        current.pipelineValue += n(deal.valor);
      }
      if (isRecent(closedAt(deal), cutoff) && TERMINAL_WON.has(String(deal.etapa ?? ""))) {
        current.won += 1;
        current.revenue += n(deal.valor);
      }
      if (isRecent(closedAt(deal), cutoff) && TERMINAL_LOST.has(String(deal.etapa ?? ""))) current.lost += 1;
      current.discounts.push(...(discountsByDeal.get(deal.id) ?? []));
      sellerBuckets.set(id, current);
    }

    const sellers = [...sellerBuckets.values()].map((seller) => {
      const closed = seller.won + seller.lost;
      return {
        ...seller,
        ticket: seller.won ? seller.revenue / seller.won : 0,
        conversion: closed ? seller.won / closed : null,
        avgDiscount: mean(seller.discounts),
      };
    }).sort((a, b) => b.pipelineValue - a.pipelineValue);

    const productBuckets = new Map<string, ProductMetric>();
    for (const proposal of raw.proposals) {
      const accepted = proposal.status === "aceita" && isRecent(proposal.acceptedAt || proposal.createdAt, cutoff);
      const open = OPEN_PROPOSAL_STATUS.has(String(proposal.status ?? ""));
      if (!accepted && !open) continue;
      const seen = new Set<string>();
      for (const item of proposal.itens ?? []) {
        const name = String(item.nome || "Produto sem nome").trim();
        const key = String(item.produtoId || item.sku || name).toLowerCase();
        const quantity = Math.max(0, n(item.quantidade));
        const itemRevenue = quantity * Math.max(0, n(item.valorUnitario));
        const current = productBuckets.get(key) ?? { key, name, acceptedRevenue: 0, acceptedQty: 0, openRevenue: 0, openQty: 0, proposals: 0 };
        if (accepted) {
          current.acceptedRevenue += itemRevenue;
          current.acceptedQty += quantity;
        }
        if (open) {
          current.openRevenue += itemRevenue;
          current.openQty += quantity;
        }
        if (!seen.has(key)) {
          current.proposals += 1;
          seen.add(key);
        }
        productBuckets.set(key, current);
      }
    }
    const products = [...productBuckets.values()].sort((a, b) => (b.acceptedRevenue + b.openRevenue) - (a.acceptedRevenue + a.openRevenue));

    const discountValues = recentDiscountTasks
      .map((task) => Number(task.payload?.["discountPercent"]))
      .filter((value) => Number.isFinite(value));
    const averageDiscount = mean(discountValues);

    const signals: Signal[] = [];
    const bestCity = cities[0];
    if (bestCity && (bestCity.pipelineValue > 0 || bestCity.leads >= 2)) {
      const conversionGap = teamConversion != null && bestCity.conversion != null ? teamConversion - bestCity.conversion : 0;
      signals.push({
        id: `city-${bestCity.city}`,
        category: "territorio",
        title: `${bestCity.city}: oportunidade territorial`,
        detail: `${bestCity.openDeals} negócios abertos, ${bestCity.leads} leads novos e conversão ${pct(bestCity.conversion)} nos últimos 90 dias.${conversionGap > 0.05 ? ` A conversão está ${(conversionGap * 100).toFixed(1)} p.p. abaixo da média analisada.` : ""}`,
        metric: `${money(bestCity.pipelineValue)} no pipeline`,
        confidence: bestCity.confidence,
        impact: bestCity.pipelineValue,
        severity: "opportunity",
        href: "/leads",
      });
    }

    const cityTicketGap = cities.find((city) =>
      city.won >= 1 && teamTicket != null && city.ticket > teamTicket * 1.15 && city.conversion != null && teamConversion != null && city.conversion < teamConversion,
    );
    if (cityTicketGap) {
      signals.push({
        id: `ticket-${cityTicketGap.city}`,
        category: "territorio",
        title: `${cityTicketGap.city}: ticket forte, conversão abaixo do potencial`,
        detail: `Ticket médio ${money(cityTicketGap.ticket)} contra ${money(teamTicket)} da base analisada, com conversão ${pct(cityTicketGap.conversion)}.`,
        metric: `${money(cityTicketGap.pipelineValue)} em aberto`,
        confidence: cityTicketGap.confidence,
        impact: cityTicketGap.pipelineValue,
        severity: "opportunity",
        href: "/negocios",
      });
    }

    const sellerWithGap = sellers
      .filter((seller) => seller.won + seller.lost >= 3 && seller.conversion != null && teamConversion != null && seller.conversion + 0.10 < teamConversion)
      .sort((a, b) => b.pipelineValue - a.pipelineValue)[0];
    if (sellerWithGap) {
      signals.push({
        id: `seller-conversion-${sellerWithGap.id}`,
        category: "vendedor",
        title: `${sellerWithGap.name}: conversão abaixo da equipe`,
        detail: `Conversão ${pct(sellerWithGap.conversion)} contra ${pct(teamConversion)} da base analisada. Há ${sellerWithGap.openDeals} negócios ainda abertos.`,
        metric: `${money(sellerWithGap.pipelineValue)} sob gestão`,
        confidence: confidenceFromSample(sellerWithGap.won + sellerWithGap.lost + sellerWithGap.openDeals),
        impact: sellerWithGap.pipelineValue,
        severity: "attention",
        href: "/usuarios",
      });
    }

    const sellerLoads = sellers.filter((seller) => seller.id !== "__unassigned" && seller.active).map((seller) => seller.openDeals);
    const averageLoad = mean(sellerLoads) ?? 0;
    const overloaded = sellers.find((seller) => seller.id !== "__unassigned" && seller.openDeals >= Math.max(4, averageLoad * 1.6));
    if (overloaded) {
      signals.push({
        id: `seller-load-${overloaded.id}`,
        category: "vendedor",
        title: `${overloaded.name}: concentração de carteira`,
        detail: `${overloaded.openDeals} negócios abertos contra média de ${averageLoad.toFixed(1)} por responsável ativo. Vale revisar capacidade e redistribuição.`,
        metric: `${money(overloaded.pipelineValue)} no pipeline`,
        confidence: confidenceFromSample(overloaded.openDeals),
        impact: overloaded.pipelineValue,
        severity: "attention",
        href: "/usuarios",
      });
    }

    const teamAvgDiscount = averageDiscount;
    const highDiscountSeller = sellers
      .filter((seller) => seller.discounts.length >= 2 && seller.avgDiscount != null && seller.avgDiscount > Math.max(8, (teamAvgDiscount ?? 0) * 1.2))
      .sort((a, b) => (b.avgDiscount ?? 0) - (a.avgDiscount ?? 0))[0];
    if (highDiscountSeller) {
      signals.push({
        id: `discount-${highDiscountSeller.id}`,
        category: "desconto",
        title: `${highDiscountSeller.name}: descontos acima do padrão`,
        detail: `Média de ${highDiscountSeller.avgDiscount?.toFixed(1)}% em ${highDiscountSeller.discounts.length} solicitações submetidas à gestão nos últimos 90 dias.`,
        metric: teamAvgDiscount == null ? "Sem média comparável" : `Equipe: ${teamAvgDiscount.toFixed(1)}%`,
        confidence: confidenceFromSample(highDiscountSeller.discounts.length),
        impact: highDiscountSeller.pipelineValue,
        severity: "risk",
        href: "/negocios",
      });
    }

    const productOpportunity = products.filter((product) => product.openRevenue > 0).sort((a, b) => b.openRevenue - a.openRevenue)[0];
    if (productOpportunity) {
      signals.push({
        id: `product-${productOpportunity.key}`,
        category: "produto",
        title: `${productOpportunity.name}: demanda em negociação`,
        detail: `${productOpportunity.openQty.toLocaleString("pt-BR")} unidades/itens aparecem em propostas abertas. Vendas aceitas recentes somam ${money(productOpportunity.acceptedRevenue)}.`,
        metric: `${money(productOpportunity.openRevenue)} em propostas abertas`,
        confidence: confidenceFromSample(productOpportunity.proposals),
        impact: productOpportunity.openRevenue,
        severity: "opportunity",
        href: "/propostas",
      });
    }

    const withCity = raw.leads.filter((lead) => leadCity(lead)).length;
    const withGeo = raw.leads.filter((lead) => Number.isFinite(Number(lead.latitude)) && Number.isFinite(Number(lead.longitude))).length;
    const locationCoverage = raw.leads.length ? withCity / raw.leads.length : 0;
    const geoCoverage = raw.leads.length ? withGeo / raw.leads.length : 0;
    if (raw.leads.length >= 5 && locationCoverage < 0.65) {
      signals.push({
        id: "data-location",
        category: "dados",
        title: "Cobertura territorial insuficiente",
        detail: `Apenas ${(locationCoverage * 100).toFixed(0)}% dos contatos têm cidade identificável e ${(geoCoverage * 100).toFixed(0)}% possuem coordenadas. Isso reduz a precisão do mapa e da distribuição territorial.`,
        metric: `${raw.leads.length - withCity} contatos sem cidade`,
        confidence: 95,
        impact: 0,
        severity: "attention",
        href: "/leads",
      });
    }

    const customersAtRisk = official?.intelligence?.customersAtRisk ?? 0;
    if (customersAtRisk > 0) {
      signals.push({
        id: "customers-risk",
        category: "risco",
        title: `${customersAtRisk} cliente${customersAtRisk === 1 ? "" : "s"} com risco elevado`,
        detail: "O Customer Intelligence já identificou risco de perda; priorize próximas melhores ações antes de ampliar aquisição.",
        metric: "Risco de retenção",
        confidence: 90,
        impact: 0,
        severity: "risk",
        href: "/leads?filtro=churn",
      });
    }

    const severityOrder = { risk: 3, opportunity: 2, attention: 1 } as const;
    signals.sort((a, b) => (severityOrder[b.severity] - severityOrder[a.severity]) || (b.impact - a.impact) || (b.confidence - a.confidence));

    const quality = official?.dataQuality?.score ?? null;
    const operation = official?.operation;
    const operationVolume = (operation?.executionActive ?? 0) + (operation?.supportActive ?? 0) + (operation?.overdueTasks ?? 0) + (operation?.unassignedActive ?? 0);
    const operationScore = operationVolume > 0
      ? 100 - clamp((((operation?.overdueTasks ?? 0) + (operation?.unassignedActive ?? 0)) / operationVolume) * 100)
      : 100;
    const conversionScore = teamConversion == null ? null : clamp(teamConversion * 200);
    const profiles = official?.intelligence?.profiles ?? 0;
    const riskScore = profiles > 0 ? 100 - clamp(((official?.intelligence?.customersAtRisk ?? 0) / profiles) * 100) : null;
    const scoreParts = [
      quality == null ? null : { value: quality, weight: 0.30 },
      conversionScore == null ? null : { value: conversionScore, weight: 0.30 },
      { value: operationScore, weight: 0.20 },
      riskScore == null ? null : { value: riskScore, weight: 0.20 },
    ].filter(Boolean) as Array<{ value: number; weight: number }>;
    const weightSum = scoreParts.reduce((sum, item) => sum + item.weight, 0);
    const governanceScore = weightSum
      ? Math.round(scoreParts.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum)
      : null;

    return {
      cutoff,
      openDeals,
      closedRecent,
      pipelineValue,
      wonRevenue,
      teamConversion,
      teamTicket,
      cities,
      sellers,
      products,
      signals: signals.slice(0, 8),
      opportunityCount: signals.filter((signal) => signal.severity === "opportunity").length,
      riskCount: signals.filter((signal) => signal.severity === "risk").length,
      averageDiscount,
      discountCount: discountValues.length,
      locationCoverage,
      geoCoverage,
      governanceScore,
    };
  }, [official, raw]);

  useEffect(() => {
    if (!analysis.cities.length) {
      setSelectedCity(null);
      return;
    }
    if (!selectedCity || !analysis.cities.some((city) => city.city === selectedCity)) setSelectedCity(analysis.cities[0]?.city ?? null);
  }, [analysis.cities, selectedCity]);

  const selected = analysis.cities.find((city) => city.city === selectedCity) ?? analysis.cities[0] ?? null;
  const geoCities = analysis.cities.filter((city) => city.lat != null && city.long != null).slice(0, 30);


  if (!tenantId || !token) return null;

  return (
    <section id="observador-estrategico" className="space-y-4 pb-10">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.035]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5"><Binoculars className="h-3.5 w-3.5" /> Observador Estratégico</Badge>
                <Badge variant="secondary">Inteligência comercial contínua</Badge>
                <Badge variant="secondary">90 dias + pipeline atual</Badge>
                {loading ? <Badge variant="outline" className="gap-1.5"><RefreshCw className="h-3 w-3 animate-spin" /> atualizando</Badge> : null}
              </div>
              <h2 className="text-xl font-bold tracking-tight md:text-2xl">O que merece sua atenção agora</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Cruza território, vendedores, produtos, ticket, descontos submetidos à gestão, pipeline, risco e qualidade dos dados para revelar oportunidades e anomalias sem substituir os indicadores oficiais acima.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
              <div className="rounded-xl border bg-background/80 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Saúde comercial</div>
                <p className="mt-1 text-xl font-bold">{analysis.governanceScore == null ? "—" : `${analysis.governanceScore}/100`}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">visão consolidada</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Oportunidades</div>
                <p className="mt-1 text-xl font-bold">{analysis.opportunityCount}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">sinais priorizados</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Riscos</div>
                <p className="mt-1 text-xl font-bold">{analysis.riskCount}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">exigem decisão</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-3.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="h-3.5 w-3.5" /> Pipeline observado</div>
                <p className="mt-1 text-lg font-bold">{money(analysis.pipelineValue)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">negócios abertos</p>
              </div>
            </div>
          </div>
          {analysis.governanceScore != null ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl border bg-background/70 px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">Índice de saúde comercial</span><span className="text-muted-foreground">qualidade + conversão + operação + risco</span></div>
                <Progress value={analysis.governanceScore} className="mt-2 h-2" />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {analysis.signals[0] ? (
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Vendi recomenda agora</Badge>
                  <Badge variant="outline" className={signalTone(analysis.signals[0].severity)}>
                    {analysis.signals[0].severity === "risk" ? "Prioridade alta" : analysis.signals[0].severity === "attention" ? "Atenção" : "Oportunidade"}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">evidência {analysis.signals[0].confidence}%</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{analysis.signals[0].title}</h3>
                <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{analysis.signals[0].detail}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  <span className="text-muted-foreground">Impacto observado: <strong className="text-foreground">{analysis.signals[0].metric}</strong></span>
                  <span className="text-muted-foreground">Base: dados transacionais oficiais + pipeline atual</span>
                </div>
              </div>
              <a href={analysis.signals[0].href} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                Ver oportunidade <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
              <div>
                <div className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Mapa inteligente de oportunidades</h3></div>
                <p className="mt-1 text-xs text-muted-foreground">Mapa geográfico real com base nas coordenadas dos contatos geocodificados. Clique em uma região para abrir sua leitura.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Alta oportunidade</Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Atenção</Badge>
                <Badge variant="outline">Baixa evidência</Badge>
              </div>
            </div>

            {geoCities.length ? (
              <div className="relative h-[390px] overflow-hidden bg-muted/10">
                <MapContainer
                  center={[geoCities[0].lat as number, geoCities[0].long as number]}
                  zoom={6}
                  scrollWheelZoom
                  className="h-full w-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitMapToCities cities={geoCities} />
                  {geoCities.map((city) => (
                    <CircleMarker
                      key={city.city}
                      center={[city.lat as number, city.long as number]}
                      radius={8 + Math.min(12, city.score / 8)}
                      pathOptions={{
                        color: city.score >= 70 ? "#059669" : city.score >= 45 ? "#d97706" : "#64748b",
                        fillColor: city.score >= 70 ? "#10b981" : city.score >= 45 ? "#f59e0b" : "#94a3b8",
                        fillOpacity: selected?.city === city.city ? 0.92 : 0.7,
                        weight: selected?.city === city.city ? 4 : 2,
                      }}
                      eventHandlers={{ click: () => setSelectedCity(city.city) }}
                    >
                      <Popup>
                        <div className="min-w-[190px] text-xs">
                          <strong className="text-sm">{city.city}</strong>
                          <div className="mt-2 space-y-1">
                            <div>Score: <strong>{city.score}/100</strong></div>
                            <div>Pipeline: <strong>{money(city.pipelineValue)}</strong></div>
                            <div>Leads novos: <strong>{city.leads}</strong></div>
                            <div>Conversão 90d: <strong>{pct(city.conversion)}</strong></div>
                            <div>Evidência: <strong>{city.confidence}%</strong></div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
                <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                  {geoCities.length} regiões geocodificadas · mapa geográfico real
                </div>
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
                <MapPin className="h-9 w-9 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">Ainda não há coordenadas suficientes para desenhar o mapa</p>
                <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">A inteligência continua analisando cidades pelo endereço e metadados. Quando os contatos forem geocodificados, as regiões aparecem automaticamente.</p>
                <a href="/leads" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Revisar dados dos leads <ArrowUpRight className="h-3.5 w-3.5" /></a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Leitura territorial</h3></div>
            {selected ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-lg font-bold">{selected.city}</p><p className="text-xs text-muted-foreground">Score de oportunidade territorial</p></div>
                    <div className={`rounded-xl border px-3 py-2 text-lg font-bold ${cityTone(selected.score)}`}>{selected.score}</div>
                  </div>
                  <Progress value={selected.score} className="mt-3 h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Pipeline</p><p className="mt-1 font-semibold">{money(selected.pipelineValue)}</p></div>
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Ticket</p><p className="mt-1 font-semibold">{selected.won ? money(selected.ticket) : "—"}</p></div>
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Conversão 90d</p><p className="mt-1 font-semibold">{pct(selected.conversion)}</p></div>
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Responsáveis</p><p className="mt-1 font-semibold">{selected.sellers}</p></div>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Leads novos</span><strong>{selected.leads}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Negócios abertos</span><strong>{selected.openDeals}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ganhos / perdidos</span><strong>{selected.won} / {selected.lost}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Nível de evidência</span><strong>{selected.confidence}%</strong></div>
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto border-t pt-3">
                  {analysis.cities.slice(0, 8).map((city) => (
                    <button key={city.city} onClick={() => setSelectedCity(city.city)} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted ${selected.city === city.city ? "bg-muted font-medium" : ""}`}>
                      <span className="truncate">{city.city}</span><span className="ml-2 tabular-nums text-muted-foreground">{city.score}/100</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Sem cidades suficientes para análise territorial.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">O que o Observador descobriu</h3></div>
                <p className="mt-1 text-xs text-muted-foreground">Sinais ordenados por risco, impacto observado e nível de evidência.</p>
              </div>
              <Badge variant="outline">{analysis.signals.length} sinais ativos</Badge>
            </div>
            <div className="space-y-2.5">
              {analysis.signals.length ? analysis.signals.map((signal) => (
                <a key={signal.id} href={signal.href} className="group block rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:bg-muted/30 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={signalTone(signal.severity)}>{signal.category}</Badge>
                        <span className="text-[11px] text-muted-foreground">evidência {signal.confidence}%</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold">{signal.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{signal.detail}</p>
                    </div>
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs">
                    <span className="text-muted-foreground">Impacto/sinal</span><strong>{signal.metric}</strong>
                  </div>
                </a>
              )) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Nenhum sinal relevante foi encontrado com a amostra disponível.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Vendedores</h3></div>
              <p className="mt-1 text-xs text-muted-foreground">Carteira atual + resultados fechados nos últimos 90 dias.</p>
              <div className="mt-4 space-y-2">
                {analysis.sellers.slice(0, 5).map((seller) => (
                  <div key={seller.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3"><span className="truncate text-xs font-medium">{seller.name}</span><span className="text-xs font-semibold">{money(seller.pipelineValue)}</span></div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground"><span>{seller.openDeals} abertos</span><span>{pct(seller.conversion)} conv.</span><span>{seller.avgDiscount == null ? "—" : `${seller.avgDiscount.toFixed(1)}% desc.`}</span></div>
                  </div>
                ))}
                {!analysis.sellers.length ? <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">Sem negócios atribuídos para comparar responsáveis.</p> : null}
              </div>
              <a href="/usuarios" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">Gerenciar equipe <ArrowUpRight className="h-3.5 w-3.5" /></a>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Produtos e descontos</h3></div>
              <div className="mt-4 space-y-3 text-xs">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Descontos submetidos à gestão</span><strong>{analysis.discountCount}</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Desconto médio observado</span><strong>{analysis.averageDiscount == null ? "—" : `${analysis.averageDiscount.toFixed(1)}%`}</strong></div>
                <div className="border-t pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Produtos com maior sinal</p>
                  {analysis.products.slice(0, 4).map((product) => (
                    <div key={product.key} className="mb-2 rounded-lg bg-muted/45 p-2.5">
                      <div className="flex items-center justify-between gap-3"><span className="truncate font-medium">{product.name}</span><span>{money(product.acceptedRevenue + product.openRevenue)}</span></div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{money(product.acceptedRevenue)} aceito · {money(product.openRevenue)} em aberto</p>
                    </div>
                  ))}
                  {!analysis.products.length ? <p className="text-xs text-muted-foreground">Ainda não há itens de propostas suficientes para comparar produtos.</p> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Conversão fechada 90d</div><p className="mt-1.5 text-xl font-bold">{pct(analysis.teamConversion)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" /> Ticket fechado 90d</div><p className="mt-1.5 text-xl font-bold">{analysis.teamTicket == null ? "—" : money(analysis.teamTicket)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Cobertura por cidade</div><p className="mt-1.5 text-xl font-bold">{raw.leads.length ? `${(analysis.locationCoverage * 100).toFixed(0)}%` : "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Produtos observados</div><p className="mt-1.5 text-xl font-bold">{analysis.products.length}</p></CardContent></Card>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-dashed px-4 py-3 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2"><Binoculars className="h-3.5 w-3.5" /> O score é analítico: combina volume recente, pipeline, conversão, qualidade operacional e risco. Passe pela leitura territorial para entender a amostra e a evidência antes de agir.</span>
        <span className="flex items-center gap-2"><Percent className="h-3.5 w-3.5" /> Desconto considera solicitações de aprovação registradas; negociações sem esse registro não são inferidas.</span>
      </div>

      {raw.unavailable.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Algumas fontes não puderam ser lidas com o acesso atual: {raw.unavailable.join(", ")}. O Observador exibiu somente os sinais disponíveis, sem preencher dados ausentes.</span></div>
        </div>
      ) : null}
    </section>
  );
}
