import { eq } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import { parseBirthdayParts } from "../lib/birthday-date.js";

export type RelationshipEvent = {
  leadId: string;
  leadName: string;
  type: "birthday" | "spouse_birthday" | "child_birthday" | "special_date";
  name: string;
  date: string;
  daysUntil: number;
  profession?: string | null;
  category?: string | null;
};

function nextOccurrence(value: string, now: Date, recurring = true): { date: Date; daysUntil: number } | null {
  const parsed = parseBirthdayParts(value);
  if (!parsed) return null;

  const target = new Date(now);
  target.setHours(0, 0, 0, 0);
  target.setMonth(parsed.month - 1, parsed.day);

  if (!recurring) {
    const exact = new Date(value + "T00:00:00");
    if (Number.isNaN(exact.getTime())) return null;
    const daysUntil = Math.ceil((exact.getTime() - target.getTime()) / 86400000);
    return { date: exact, daysUntil };
  }

  if (target.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    target.setFullYear(target.getFullYear() + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntil = Math.round((target.getTime() - today.getTime()) / 86400000);
  return { date: target, daysUntil };
}

export async function getUpcomingRelationshipEvents(input: {
  tenantId: string;
  days?: number;
  limit?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const days = Math.min(Math.max(Number(input.days ?? 30), 0), 365);
  const limit = Math.min(Math.max(Number(input.limit ?? 100), 1), 500);

  const leads = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      profissao: leadsTable.profissao,
      dataNascimento: leadsTable.dataNascimento,
      conjugeNome: leadsTable.conjugeNome,
      conjugeDataNascimento: leadsTable.conjugeDataNascimento,
      filhos: leadsTable.filhos,
      specialDates: leadsTable.specialDates,
      specialDateMessagesOptOut: leadsTable.specialDateMessagesOptOut,
    })
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, input.tenantId));

  const events: RelationshipEvent[] = [];

  const push = (
    lead: typeof leads[number],
    type: RelationshipEvent["type"],
    name: string,
    dateValue: string,
    recurring = true,
    category?: string | null,
  ) => {
    const occurrence = nextOccurrence(dateValue, now, recurring);
    if (!occurrence || occurrence.daysUntil < 0 || occurrence.daysUntil > days) return;
    events.push({
      leadId: lead.id,
      leadName: lead.nome,
      type,
      name,
      date: occurrence.date.toISOString().slice(0, 10),
      daysUntil: occurrence.daysUntil,
      profession: lead.profissao,
      category: category ?? null,
    });
  };

  for (const lead of leads) {
    if (lead.specialDateMessagesOptOut) continue;

    if (lead.dataNascimento) {
      push(lead, "birthday", "Aniversário do cliente", lead.dataNascimento);
    }
    if (lead.conjugeDataNascimento) {
      push(
        lead,
        "spouse_birthday",
        `Aniversário de ${lead.conjugeNome || "cônjuge"}`,
        lead.conjugeDataNascimento,
      );
    }
    for (const child of lead.filhos ?? []) {
      if (!child.dataNascimento) continue;
      push(lead, "child_birthday", `Aniversário de ${child.nome || "filho(a)"}`, child.dataNascimento);
    }
    for (const special of lead.specialDates ?? []) {
      if (!special?.name || !special?.date || special.active === false) continue;
      push(
        lead,
        "special_date",
        special.name,
        special.date,
        special.recurring !== false,
        special.category ?? "custom",
      );
    }
  }

  return events
    .sort((a, b) => a.daysUntil - b.daysUntil || a.leadName.localeCompare(b.leadName, "pt-BR"))
    .slice(0, limit);
}
