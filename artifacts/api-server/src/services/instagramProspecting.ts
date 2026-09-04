import { META_GRAPH_BASE, listAccessibleInstagramIdentities } from "./meta-ads-oauth.js";

export interface InstagramProspectProfile {
  id: string;
  username: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  latestMediaAt: string | null;
  latestMediaPermalink: string | null;
  metricsVerified: true;
  source: "instagram_business_discovery";
}

export interface InstagramProfileFilters {
  minFollowers?: number;
  maxFollowers?: number;
  hasWebsite?: boolean;
  activeWithinDays?: number;
}

export class InstagramProspectingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "META_NOT_CONNECTED"
      | "INSTAGRAM_IDENTITY_NOT_AVAILABLE"
      | "INSTAGRAM_PROFILE_NOT_AVAILABLE"
      | "META_API_ERROR",
  ) {
    super(message);
    this.name = "InstagramProspectingError";
  }
}

export function normalizeInstagramUsername(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const withoutUrl = raw
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0] ?? "";
  return withoutUrl.trim().toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30);
}

export function parseInstagramUsernames(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,;\n]+/)
        .map(normalizeInstagramUsername)
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

export function profileMatchesInstagramFilters(
  profile: Pick<InstagramProspectProfile, "followersCount" | "website" | "latestMediaAt">,
  filters: InstagramProfileFilters,
  now = new Date(),
): boolean {
  const followers = profile.followersCount;
  if (filters.minFollowers != null && (followers == null || followers < filters.minFollowers)) return false;
  if (filters.maxFollowers != null && (followers == null || followers > filters.maxFollowers)) return false;
  if (filters.hasWebsite === true && !profile.website) return false;
  if (filters.activeWithinDays != null) {
    if (!profile.latestMediaAt) return false;
    const latest = new Date(profile.latestMediaAt);
    if (Number.isNaN(latest.getTime())) return false;
    const ageMs = now.getTime() - latest.getTime();
    if (ageMs > filters.activeWithinDays * 86_400_000) return false;
  }
  return true;
}

type BusinessDiscoveryPayload = {
  business_discovery?: {
    id?: string;
    username?: string;
    name?: string;
    biography?: string;
    website?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    media?: { data?: Array<{ timestamp?: string; permalink?: string }> };
  };
  error?: { message?: string; code?: number };
};

async function fetchBusinessDiscoveryProfile(
  instagramUserId: string,
  pageAccessToken: string,
  username: string,
): Promise<InstagramProspectProfile | null> {
  const url = new URL(`${META_GRAPH_BASE}/${instagramUserId}`);
  url.searchParams.set(
    "fields",
    `business_discovery.username(${username}){id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(1){timestamp,permalink}}`,
  );
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  const payload = (await response.json().catch(() => ({}))) as BusinessDiscoveryPayload;

  if (!response.ok || payload.error) {
    const msg = payload.error?.message ?? `Meta Graph API ${response.status}`;
    // Conta pessoal, inexistente, restrita ou sem acesso de Business Discovery.
    if ([100, 803].includes(payload.error?.code ?? 0) || response.status === 404) return null;
    throw new InstagramProspectingError(msg, "META_API_ERROR");
  }

  const d = payload.business_discovery;
  if (!d?.id || !d.username) return null;
  const latest = d.media?.data?.[0];
  return {
    id: d.id,
    username: d.username,
    name: d.name ?? null,
    biography: d.biography ?? null,
    website: d.website?.trim() || null,
    profilePictureUrl: d.profile_picture_url ?? null,
    followersCount: typeof d.followers_count === "number" ? d.followers_count : null,
    followsCount: typeof d.follows_count === "number" ? d.follows_count : null,
    mediaCount: typeof d.media_count === "number" ? d.media_count : null,
    latestMediaAt: latest?.timestamp ?? null,
    latestMediaPermalink: latest?.permalink ?? null,
    metricsVerified: true,
    source: "instagram_business_discovery",
  };
}

export async function searchInstagramBusinessProfiles(params: {
  metaAccessToken: string | null | undefined;
  usernames: string[];
  filters?: InstagramProfileFilters;
}): Promise<{
  profiles: InstagramProspectProfile[];
  unavailableUsernames: string[];
  sourceIdentity: { username: string | null; instagramUserId: string };
}> {
  if (!params.metaAccessToken) {
    throw new InstagramProspectingError(
      "Conecte ou reconecte a Meta em Integrações para pesquisar perfis profissionais do Instagram.",
      "META_NOT_CONNECTED",
    );
  }

  let identities;
  try {
    identities = await listAccessibleInstagramIdentities(params.metaAccessToken);
  } catch (error) {
    throw new InstagramProspectingError(
      error instanceof Error ? error.message : "Não foi possível acessar a identidade Instagram vinculada à Meta.",
      "INSTAGRAM_IDENTITY_NOT_AVAILABLE",
    );
  }

  const identity = identities[0];
  if (!identity) {
    throw new InstagramProspectingError(
      "A conexão Meta não possui uma Página com conta profissional do Instagram acessível. Reconecte a Meta após autorizar Instagram e Páginas.",
      "INSTAGRAM_IDENTITY_NOT_AVAILABLE",
    );
  }

  const profiles: InstagramProspectProfile[] = [];
  const unavailableUsernames: string[] = [];
  for (const username of [...new Set(params.usernames.map(normalizeInstagramUsername).filter(Boolean))].slice(0, 20)) {
    const profile = await fetchBusinessDiscoveryProfile(identity.instagramUserId, identity.pageAccessToken, username);
    if (!profile) {
      unavailableUsernames.push(username);
      continue;
    }
    if (profileMatchesInstagramFilters(profile, params.filters ?? {})) profiles.push(profile);
  }

  return {
    profiles,
    unavailableUsernames,
    sourceIdentity: {
      username: identity.instagramUsername,
      instagramUserId: identity.instagramUserId,
    },
  };
}
