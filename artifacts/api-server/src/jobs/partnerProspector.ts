/**
 * Partner Prospector Job — daily sweep that finds partner candidates via
 * Google Places and qualifies them with the SDR AI agent.
 *
 * Processes all partner_prospector_jobs with status='pendente'.
 * For each job, searches Google Places for each nicho in the given city,
 * qualifies the result, and inserts into partner_leads when score >= 60.
 */
import { and, eq, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  partnerLeadsTable,
  partnerProspectorJobsTable,
  partnersTable,
} from "@workspace/db";
import { qualifyPartnerCandidate } from "../agents/sdrAgent.js";

// ── Google Places helper ───────────────────────────────────────────────────────

type PlaceResult = {
  placeId: string | null;
  nomeEmpresa: string | null;
  endereco: string | null;
  rating: number | null;
  reviewCount: number | null;
  telefone: string | null;
};

async function searchPlacesForPartner(
  query: string,
  maxResults: number,
  log: Logger,
): Promise<PlaceResult[]> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) {
    log.warn("partner-prospector: GOOGLE_PLACES_API_KEY not set, skipping Places search");
    return [];
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber",
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "pt-BR",
        maxResultCount: Math.min(Math.max(maxResults, 1), 20),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      log.error({ status: res.status, text, query }, "partner-prospector: Google Places call failed");
      return [];
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        nationalPhoneNumber?: string;
      }>;
    };

    return (data.places ?? []).map((p) => ({
      placeId: p.id ?? null,
      nomeEmpresa: p.displayName?.text ?? null,
      endereco: p.formattedAddress ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      telefone: p.nationalPhoneNumber ?? null,
    }));
  } catch (err) {
    log.error({ err, query }, "partner-prospector: Places search threw");
    return [];
  }
}

// ── Partner flow trigger ───────────────────────────────────────────────────────

async function triggerPartnerFlow(leadId: string, log: Logger): Promise<void> {
  // Placeholder: initiate outreach to the qualified partner candidate.
  // Future implementation: send WhatsApp, email, or assign to a sales rep.
  log.info({ leadId }, "partner-prospector: partner lead ready for outreach");
}

// ── Sleep helper ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Core job logic ─────────────────────────────────────────────────────────────

async function processJob(
  job: typeof partnerProspectorJobsTable.$inferSelect,
  log: Logger,
): Promise<void> {
  const jobLog = log.child({ jobId: job.id, cidade: job.cidade, uf: job.uf });
  jobLog.info("partner-prospector/job: starting");

  // Guard: skip if city already has an active partner
  const [existingPartner] = await db
    .select({ id: partnersTable.id })
    .from(partnersTable)
    .where(
      and(
        eq(partnersTable.cidade, job.cidade),
        eq(partnersTable.status, "ativo"),
      ),
    )
    .limit(1);

  if (existingPartner) {
    jobLog.info("partner-prospector/job: city already has active partner, skipping");
    await db
      .update(partnerProspectorJobsTable)
      .set({ status: "concluido", finishedAt: new Date() })
      .where(eq(partnerProspectorJobsTable.id, job.id));
    return;
  }

  const nichos = (job.nichos ?? []) as string[];
  let totalEncontrados = 0;
  let totalQualificados = 0;
  let totalInseridos = 0;
  const MAX_INSERTS = 20;

  try {
    for (const nicho of nichos) {
      if (totalInseridos >= MAX_INSERTS) break;

      const query = `${nicho} em ${job.cidade} ${job.uf}`;
      jobLog.info({ query }, "partner-prospector/job: searching Places");

      const places = await searchPlacesForPartner(query, 20, log);
      totalEncontrados += places.length;

      for (const place of places) {
        if (totalInseridos >= MAX_INSERTS) break;

        // Duplicate check: same google_place_id OR same phone
        const conditions = [];
        if (place.placeId) {
          conditions.push(eq(partnerLeadsTable.googlePlaceId, place.placeId));
        }
        if (place.telefone) {
          conditions.push(eq(partnerLeadsTable.telefone, place.telefone));
        }

        if (conditions.length > 0) {
          const [dup] = await db
            .select({ id: partnerLeadsTable.id })
            .from(partnerLeadsTable)
            .where(or(...conditions))
            .limit(1);

          if (dup) {
            jobLog.info({ placeId: place.placeId }, "partner-prospector/job: duplicate, skipping");
            await sleep(500);
            continue;
          }
        }

        // Qualify via SDR agent
        const qualification = await qualifyPartnerCandidate({
          name: place.nomeEmpresa ?? "",
          formatted_address: place.endereco ?? undefined,
          rating: place.rating ?? undefined,
          user_ratings_total: place.reviewCount ?? undefined,
          formatted_phone_number: place.telefone ?? undefined,
        });

        if (qualification.qualificado) {
          totalQualificados++;

          // Insert into partner_leads
          const [inserted] = await db
            .insert(partnerLeadsTable)
            .values({
              nome: place.nomeEmpresa ?? "Sem nome",
              telefone: place.telefone ?? undefined,
              empresa: place.nomeEmpresa ?? undefined,
              objetivo: qualification.motivo,
              status: "novo",
              source: "prospector",
              prospectorJobId: job.id,
              googlePlaceId: place.placeId ?? undefined,
              score: qualification.score,
            })
            .returning({ id: partnerLeadsTable.id });

          if (inserted) {
            totalInseridos++;
            jobLog.info(
              { leadId: inserted.id, score: qualification.score, perfil: qualification.perfil },
              "partner-prospector/job: lead inserted",
            );
            await triggerPartnerFlow(inserted.id, log);
          }
        }

        await sleep(500);
      }
    }

    // Mark complete
    await db
      .update(partnerProspectorJobsTable)
      .set({
        status: "concluido",
        totalEncontrados,
        totalQualificados,
        totalInseridos,
        finishedAt: new Date(),
      })
      .where(eq(partnerProspectorJobsTable.id, job.id));

    jobLog.info({ totalEncontrados, totalQualificados, totalInseridos }, "partner-prospector/job: complete");
  } catch (err) {
    const erroMsg = err instanceof Error ? err.message : String(err);
    jobLog.error({ err, totalEncontrados, totalQualificados, totalInseridos }, "partner-prospector/job: error");

    await db
      .update(partnerProspectorJobsTable)
      .set({
        status: "erro",
        totalEncontrados,
        totalQualificados,
        totalInseridos,
        erroMsg,
        finishedAt: new Date(),
      })
      .where(eq(partnerProspectorJobsTable.id, job.id));
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function runPartnerProspectorJob(log: Logger): Promise<void> {
  log.info("partner-prospector: starting sweep for pending jobs");

  const pendingJobs = await db
    .select()
    .from(partnerProspectorJobsTable)
    .where(eq(partnerProspectorJobsTable.status, "pendente"));

  if (pendingJobs.length === 0) {
    log.info("partner-prospector: no pending jobs");
    return;
  }

  log.info({ count: pendingJobs.length }, "partner-prospector: processing jobs");

  for (const job of pendingJobs) {
    await processJob(job, log);
  }

  log.info("partner-prospector: sweep complete");
}
