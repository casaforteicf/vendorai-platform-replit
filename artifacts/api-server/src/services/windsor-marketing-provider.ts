import {
  deriveMarketingPriorities,
  normalizeWindsorMarketingRow,
  type MarketingAutomationMode,
  type MarketingConnector,
  type MarketingDataProvider,
  type MarketingDataQuery,
  type MarketingPriority,
  type NormalizedMarketingRecord,
  type WindsorRow,
} from "@workspace/vendor-brain/marketing-data-standard";
import { logger } from "../lib/logger.js";

const WINDSOR_API_BASE = "https://connectors.windsor.ai";
const WINDSOR_API_KEY = process.env["WINDSOR_API_KEY"];

const DEFAULT_FIELDS: Record<string, string[]> = {
  instagram: [
    "date",
    "account_id",
    "account_name",
    "data_fetched_at",
    "media_id",
    "media_type",
    "media_product_type",
    "media_permalink",
    "media_caption",
    "timestamp",
    "media_like_count",
    "media_comments_count",
    "media_reach",
    "media_views",
    "media_engagement",
    "media_saved",
    "media_shares",
    "media_follows",
    "media_profile_visits",
    "media_reel_avg_watch_time",
    "media_reel_skip_rate",
    "media_reel_total_watch_time",
  ],
};

export class WindsorConfigurationError extends Error {}
export class WindsorRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

type WindsorPayload = {
  data?: WindsorRow[];
  rows?: WindsorRow[];
  result?: WindsorRow[];
} | WindsorRow[];

function payloadRows(payload: WindsorPayload): WindsorRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.result)) return payload.result;
  return [];
}

function fieldsFor(connector: MarketingConnector): string[] {
  return DEFAULT_FIELDS[connector] ?? ["date", "account_id", "account_name", "data_fetched_at"];
}

function buildWindsorUrl(query: MarketingDataQuery): URL {
  if (!WINDSOR_API_KEY) {
    throw new WindsorConfigurationError("WINDSOR_API_KEY não configurada no backend");
  }
  if (!query.tenantId) throw new WindsorConfigurationError("tenantId é obrigatório");
  if (!query.connector) throw new WindsorConfigurationError("connector é obrigatório");
  if (!query.accountIds.length) throw new WindsorConfigurationError("accountIds é obrigatório para isolamento por tenant");

  const url = new URL(`${WINDSOR_API_BASE}/${encodeURIComponent(query.connector)}`);
  url.searchParams.set("api_key", WINDSOR_API_KEY);
  url.searchParams.set("fields", fieldsFor(query.connector).join(","));
  url.searchParams.set("select_accounts", query.accountIds.join(","));
  url.searchParams.set("_renderer", "json");
  url.searchParams.set("_max_rows", "1000");

  if (query.datePreset) url.searchParams.set("date_preset", query.datePreset);
  if (query.dateFrom) url.searchParams.set("date_from", query.dateFrom);
  if (query.dateTo) url.searchParams.set("date_to", query.dateTo);

  return url;
}

export class WindsorMarketingProvider implements MarketingDataProvider {
  readonly id = "windsor" as const;

  async read(query: MarketingDataQuery): Promise<NormalizedMarketingRecord[]> {
    const url = buildWindsorUrl(query);
    const safeUrl = new URL(url);
    safeUrl.searchParams.set("api_key", "[REDACTED]");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "VendorAI-Windsor/1.0",
        },
      });
    } catch (error) {
      logger.warn({ tenantId: query.tenantId, connector: query.connector, error }, "windsor: falha de rede");
      throw new WindsorRequestError("Falha de rede ao consultar Windsor.ai");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        {
          tenantId: query.tenantId,
          connector: query.connector,
          status: response.status,
          request: safeUrl.toString(),
          response: body.slice(0, 500),
        },
        "windsor: consulta rejeitada",
      );
      throw new WindsorRequestError(`Windsor.ai respondeu HTTP ${response.status}`, response.status);
    }

    const payload = await response.json() as WindsorPayload;
    const selectedAccounts = new Set(query.accountIds);

    return payloadRows(payload)
      .filter((row) => {
        const rowAccountId = typeof row.account_id === "string" ? row.account_id : null;
        return rowAccountId == null || selectedAccounts.has(rowAccountId);
      })
      .map((row) => {
        const rowAccountId = typeof row.account_id === "string" ? row.account_id : query.accountIds[0]!;
        const rowAccountName = typeof row.account_name === "string" ? row.account_name : null;
        return normalizeWindsorMarketingRow({
          tenantId: query.tenantId,
          connector: query.connector,
          accountId: rowAccountId,
          accountName: rowAccountName,
          row,
        });
      });
  }
}

export async function getWindsorMarketingSnapshot(input: {
  tenantId: string;
  connector: MarketingConnector;
  accountIds: string[];
  datePreset?: string;
  dateFrom?: string;
  dateTo?: string;
  automationMode?: MarketingAutomationMode;
}): Promise<{
  provider: "windsor";
  records: NormalizedMarketingRecord[];
  priorities: MarketingPriority[];
}> {
  const provider = new WindsorMarketingProvider();
  const records = await provider.read({
    tenantId: input.tenantId,
    connector: input.connector,
    accountIds: input.accountIds,
    datePreset: input.datePreset,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  return {
    provider: "windsor",
    records,
    priorities: deriveMarketingPriorities(records, input.automationMode ?? "RECOMMEND"),
  };
}
