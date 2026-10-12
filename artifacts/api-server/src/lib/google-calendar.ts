import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { db, agendasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

const PRODUCTION_HOSTS = ["app.appvendorai.com", "appvendorai.com", "www.appvendorai.com"];
const CALLBACK_PATH = "/api/auth/google/calendar/callback";

/**
 * Determine the OAuth redirect_uri that must be sent to Google.
 *
 * Priority:
 *  1. If the initiating request came from a known production host → always
 *     use the production callback URL, regardless of any env var.
 *  2. Explicit GOOGLE_REDIRECT_URI override (useful for dev/staging).
 *  3. Derive from REPLIT_DOMAINS (the first domain in the comma-separated list).
 *  4. Localhost fallback for local development.
 *
 * This ensures the redirect_uri always matches the domain the user is actually
 * on, preventing the classic "OAuth initiated on appvendorai.com but callback
 * goes to spock.replit.dev" breakage.
 */
function getRedirectUri(host?: string): string {
  // A mesma URI precisa ser usada ao gerar a autorização e ao trocar o code.
  // Por isso uma configuração explícita sempre tem prioridade.
  const explicit = process.env["GOOGLE_REDIRECT_URI"]?.trim();
  if (explicit) return explicit;

  if (host && PRODUCTION_HOSTS.includes(host.toLowerCase())) {
    return `https://app.appvendorai.com${CALLBACK_PATH}`;
  }

  if (process.env.NODE_ENV === "production") {
    return `https://app.appvendorai.com${CALLBACK_PATH}`;
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}${CALLBACK_PATH}`;
  return `http://localhost:${process.env["PORT"] ?? 5000}${CALLBACK_PATH}`;
}

export function getGoogleRedirectUri(host?: string): string {
  return getRedirectUri(host);
}

export function createOAuth2Client(host?: string) {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(host));
}

export function buildAuthUrl(agendaId: string, returnTo?: string, host?: string): string {
  const oauth2 = createOAuth2Client(host);
  const secret = process.env.GOOGLE_CALENDAR_OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) throw new Error("Calendar OAuth state secret not configured");
  const payload = Buffer.from(JSON.stringify({ agendaId, returnTo, issuedAt: Date.now() })).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  const state = `${payload}.${mac}`;
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeAndStore(
  code: string,
  agendaId: string
): Promise<void> {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  oauth2.setCredentials(tokens);

  const cal = google.calendar({ version: "v3", auth: oauth2 });
  let googleCalendarId = "primary";
  let googleEmail: string | null = null;

  try {
    const me = await cal.calendarList.get({ calendarId: "primary" });
    googleCalendarId = me.data.id ?? "primary";
    googleEmail = me.data.summary ?? null;

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const userInfo = await oauth2Api.userinfo.get();
    googleEmail = userInfo.data.email ?? googleEmail;
  } catch (e) {
    logger.warn({ err: e }, "Could not fetch Google Calendar info");
  }

  const updateData: Record<string, unknown> = {
    googleCalendarId,
    googleEmail,
    googleAccessToken: tokens.access_token ?? null,
    googleTokenExpiresAt: tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : null,
    updatedAt: new Date(),
  };
  if (tokens.refresh_token) {
    updateData.googleRefreshToken = tokens.refresh_token;
  }

  await db
    .update(agendasTable)
    .set(updateData)
    .where(eq(agendasTable.id, agendaId));
}

async function getAuthForAgenda(agendaId: string) {
  logger.info({ agendaId }, "getAuthForAgenda: fetching agenda");

  const [agenda] = await db
    .select()
    .from(agendasTable)
    .where(eq(agendasTable.id, agendaId));

  logger.info(
    { agendaId, hasRefreshToken: !!agenda?.googleRefreshToken, hasAccessToken: !!agenda?.googleAccessToken, tokenExpiresAt: agenda?.googleTokenExpiresAt },
    "getAuthForAgenda: agenda fetched"
  );

  if (!agenda?.googleRefreshToken) {
    logger.warn({ agendaId }, "getAuthForAgenda: no refresh_token for agenda");
    return null;
  }

  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({
    access_token: agenda.googleAccessToken ?? undefined,
    refresh_token: agenda.googleRefreshToken,
    expiry_date: agenda.googleTokenExpiresAt?.getTime() ?? undefined,
  });

  oauth2.on("tokens", async (newTokens) => {
    await db
      .update(agendasTable)
      .set({
        googleAccessToken: newTokens.access_token ?? agenda.googleAccessToken,
        googleTokenExpiresAt: newTokens.expiry_date
          ? new Date(newTokens.expiry_date)
          : agenda.googleTokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(agendasTable.id, agendaId));
  });

  return { oauth2, calendarId: agenda.googleCalendarId ?? "primary" };
}

export interface GoogleCalendarSyncResult {
  googleEventId: string | null;
  meetLink: string | null;
}

export interface CalendarEventInput {
  id: string;
  tenantId: string;
  titulo: string;
  dataHoraInicio: Date | string | null;
  dataHoraFim: Date | string | null;
  observacoes?: string | null;
  local?: string | null;
  gerarMeet?: boolean | null;
  participantes?: Array<{
    nome: string;
    email?: string;
    telefone?: string;
    userId?: string;
    tipo?: "equipe" | "cliente";
  }> | null;
}

export async function createGoogleEvent(
  agendaId: string,
  eventInput: CalendarEventInput,
  leadName?: string,
  leadEmail?: string,
  gerarMeet?: boolean
): Promise<GoogleCalendarSyncResult> {
  logger.info({ agendaId, eventId: eventInput.id, gerarMeet }, "createGoogleEvent: starting");

  const auth = await getAuthForAgenda(agendaId);
  if (!auth) {
    logger.warn({ agendaId }, "createGoogleEvent: getAuthForAgenda returned null");
    return { googleEventId: null, meetLink: null };
  }

  logger.info({ agendaId, calendarId: auth.calendarId }, "createGoogleEvent: auth ready");

  const cal = google.calendar({ version: "v3", auth: auth.oauth2 });

  const startIso = eventInput.dataHoraInicio instanceof Date
    ? eventInput.dataHoraInicio.toISOString()
    : (eventInput.dataHoraInicio ?? undefined);
  const endIso = eventInput.dataHoraFim instanceof Date
    ? eventInput.dataHoraFim.toISOString()
    : (eventInput.dataHoraFim ?? undefined);

  if (!startIso || !endIso) {
    logger.warn({ agendaId, eventId: eventInput.id }, "createGoogleEvent: missing start/end time, skipping");
    return { googleEventId: null, meetLink: null };
  }

  const requestBody: any = {
    summary: eventInput.titulo,
    description: [
      leadName ? `Cliente: ${leadName}` : null,
      eventInput.observacoes,
    ]
      .filter(Boolean)
      .join("\n"),
    location: eventInput.local ?? undefined,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
  };

  const attendeeMap = new Map<string, { email: string; displayName?: string }>();

  if (leadEmail) {
    attendeeMap.set(leadEmail.toLowerCase(), {
      email: leadEmail,
      displayName: leadName || leadEmail,
    });
  }

  for (const participante of eventInput.participantes ?? []) {
    const email = participante.email?.trim();
    if (!email) continue;
    attendeeMap.set(email.toLowerCase(), {
      email,
      displayName: participante.nome || email,
    });
  }

  const attendees = Array.from(attendeeMap.values());
  if (attendees.length) {
    requestBody.attendees = attendees;
  }

  if (gerarMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  logger.info({ agendaId, calendarId: auth.calendarId, requestBody }, "createGoogleEvent: calling Google Calendar API");

  try {
    const event = await cal.events.insert({
      calendarId: auth.calendarId,
      conferenceDataVersion: gerarMeet ? 1 : 0,
      sendUpdates: "all",
      requestBody,
    });

    const googleEventId = event.data.id ?? null;
    const meetLink =
      event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")
        ?.uri ?? null;

    logger.info({ agendaId, googleEventId, meetLink }, "createGoogleEvent: event created successfully");

    return { googleEventId, meetLink };
  } catch (err) {
    logger.error({ err, agendaId, requestBody }, "createGoogleEvent: Google Calendar API error");
    throw err;
  }
}

export async function updateGoogleEvent(
  agendaId: string,
  eventInput: CalendarEventInput,
  leadName?: string,
  googleEventId?: string | null
): Promise<void> {
  if (!googleEventId) return;
  const auth = await getAuthForAgenda(agendaId);
  if (!auth) return;

  const cal = google.calendar({ version: "v3", auth: auth.oauth2 });

  const startIso = eventInput.dataHoraInicio instanceof Date
    ? eventInput.dataHoraInicio.toISOString()
    : eventInput.dataHoraInicio;
  const endIso = eventInput.dataHoraFim instanceof Date
    ? eventInput.dataHoraFim.toISOString()
    : eventInput.dataHoraFim;

  try {
    await cal.events.update({
      calendarId: auth.calendarId,
      eventId: googleEventId,
      requestBody: {
        summary: eventInput.titulo,
        description: [
          leadName ? `Cliente: ${leadName}` : null,
          eventInput.observacoes,
        ]
          .filter(Boolean)
          .join("\n"),
        location: eventInput.local ?? undefined,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
      },
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to update Google Calendar event");
  }
}

export async function deleteGoogleEvent(
  agendaId: string,
  googleEventId: string
): Promise<void> {
  const auth = await getAuthForAgenda(agendaId);
  if (!auth) return;

  const cal = google.calendar({ version: "v3", auth: auth.oauth2 });
  try {
    await cal.events.delete({
      calendarId: auth.calendarId,
      eventId: googleEventId,
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to delete Google Calendar event");
  }
}

/** A busy period returned by Google Calendar free/busy query. */
export interface BusyPeriod {
  start: Date;
  end: Date;
}

/**
 * Fetches busy periods from Google Calendar for the given agenda and time range.
 * Returns an empty array if the agenda has no refresh token or on error.
 */
export async function listGoogleCalendarBusyTimes(
  agendaId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusyPeriod[]> {
  const auth = await getAuthForAgenda(agendaId);
  if (!auth) return [];

  try {
    const cal = google.calendar({ version: "v3", auth: auth.oauth2 });
    const resp = await cal.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: auth.calendarId }],
      },
    });

    const calendars = resp.data.calendars ?? {};
    const busy = calendars[auth.calendarId]?.busy ?? [];

    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({
        start: new Date(b.start!),
        end:   new Date(b.end!),
      }));
  } catch (err) {
    logger.warn({ err, agendaId }, "listGoogleCalendarBusyTimes: error fetching free/busy");
    return [];
  }
}
