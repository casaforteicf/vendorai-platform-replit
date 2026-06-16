import { google } from "googleapis";
import { db, agendasTable, agendamentosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Agendamento } from "@workspace/db";
import { logger } from "./logger";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getRedirectUri(): string {
  // Allow explicit override via env var (most reliable for production)
  const explicit = process.env["GOOGLE_REDIRECT_URI"];
  if (explicit) return explicit;

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}/api/auth/google/calendar/callback`;
  return `http://localhost:${process.env["PORT"] ?? 5000}/api/auth/google/calendar/callback`;
}

export function getGoogleRedirectUri(): string {
  return getRedirectUri();
}

export function createOAuth2Client() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function buildAuthUrl(agendaId: string): string {
  const oauth2 = createOAuth2Client();
  const state = Buffer.from(JSON.stringify({ agendaId })).toString("base64url");
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

  // Fetch primary calendar info
  const cal = google.calendar({ version: "v3", auth: oauth2 });
  let googleCalendarId = "primary";
  let googleEmail: string | null = null;

  try {
    const me = await cal.calendarList.get({ calendarId: "primary" });
    googleCalendarId = me.data.id ?? "primary";
    googleEmail = me.data.summary ?? null;

    // Fetch the user's email from token info
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const userInfo = await oauth2Api.userinfo.get();
    googleEmail = userInfo.data.email ?? googleEmail;
  } catch (e) {
    logger.warn({ err: e }, "Could not fetch Google Calendar info");
  }

  await db
    .update(agendasTable)
    .set({
      googleCalendarId,
      googleEmail,
      googleAccessToken: tokens.access_token ?? null,
      googleRefreshToken: tokens.refresh_token ?? null,
      googleTokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(agendasTable.id, agendaId));
}

async function getAuthForAgenda(agendaId: string) {
  const [agenda] = await db
    .select()
    .from(agendasTable)
    .where(eq(agendasTable.id, agendaId));

  if (!agenda?.googleRefreshToken) return null;

  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({
    access_token: agenda.googleAccessToken ?? undefined,
    refresh_token: agenda.googleRefreshToken,
    expiry_date: agenda.googleTokenExpiresAt?.getTime() ?? undefined,
  });

  // Persist refreshed tokens
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

export async function createGoogleEvent(
  agendaId: string,
  agendamento: Agendamento,
  leadName?: string,
  gerarMeet?: boolean
): Promise<string | null> {
  const auth = await getAuthForAgenda(agendaId);
  if (!auth) return null;

  const cal = google.calendar({ version: "v3", auth: auth.oauth2 });

  const requestBody: Parameters<typeof cal.events.insert>[0]["requestBody"] = {
    summary: agendamento.titulo,
    description: [
      leadName ? `Cliente: ${leadName}` : null,
      agendamento.observacoes,
    ]
      .filter(Boolean)
      .join("\n"),
    location: agendamento.local ?? undefined,
    start: { dateTime: agendamento.dataHoraInicio.toISOString() },
    end: { dateTime: agendamento.dataHoraFim.toISOString() },
  };

  if (gerarMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const event = await cal.events.insert({
    calendarId: auth.calendarId,
    conferenceDataVersion: gerarMeet ? 1 : 0,
    requestBody,
  });

  const googleEventId = event.data.id ?? null;
  const meetLink =
    event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")
      ?.uri ?? null;

  if (googleEventId || meetLink) {
    await db
      .update(agendamentosTable)
      .set({
        ...(googleEventId ? { googleEventId } : {}),
        ...(meetLink ? { meetLink } : {}),
        updatedAt: new Date(),
      })
      .where(eq(agendamentosTable.id, agendamento.id));
  }
  return googleEventId;
}

export async function updateGoogleEvent(
  agendaId: string,
  agendamento: Agendamento,
  leadName?: string
): Promise<void> {
  if (!agendamento.googleEventId) return;
  const auth = await getAuthForAgenda(agendaId);
  if (!auth) return;

  const cal = google.calendar({ version: "v3", auth: auth.oauth2 });
  try {
    await cal.events.update({
      calendarId: auth.calendarId,
      eventId: agendamento.googleEventId,
      requestBody: {
        summary: agendamento.titulo,
        description: [
          leadName ? `Cliente: ${leadName}` : null,
          agendamento.observacoes,
        ]
          .filter(Boolean)
          .join("\n"),
        location: agendamento.local ?? undefined,
        start: { dateTime: agendamento.dataHoraInicio.toISOString() },
        end: { dateTime: agendamento.dataHoraFim.toISOString() },
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
