import { pgTable, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export type OnboardingImplementationMode = "guided" | "assisted" | "automatic";
export type OnboardingImplementationState = {
  version: 1;
  mode: OnboardingImplementationMode;
  manual: Record<string, boolean>;
  timeline: Array<{
    id: string;
    type: string;
    label: string;
    at: string;
    metadata?: Record<string, unknown>;
  }>;
  goLiveAt: string | null;
  followupsCompleted: Partial<Record<"1" | "3" | "7" | "15" | "30", string>>;
  safeActionsLastRunAt: string | null;
  handoffs: {
    customerSuccessAt: string | null;
    devAt: string | null;
    devTicketId: string | null;
  };
};

export const onboardingProgressTable = pgTable("onboarding_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .unique()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  stepAtual:      integer("step_atual").notNull().default(1),
  step1Completo:  boolean("step1_completo").notNull().default(false),
  step2Completo:  boolean("step2_completo").notNull().default(false),
  step3Completo:  boolean("step3_completo").notNull().default(false),
  step4Completo:  boolean("step4_completo").notNull().default(false),
  concluido:      boolean("concluido").notNull().default(false),
  concluidoEm:    timestamp("concluido_em"),
  dadosStep1:     jsonb("dados_step1").$type<Record<string, unknown>>(),
  dadosStep2:     jsonb("dados_step2").$type<Record<string, unknown>>(),
  dadosStep3:     jsonb("dados_step3").$type<Record<string, unknown>>(),
  implementationState: jsonb("implementation_state").$type<OnboardingImplementationState | null>(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgressTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateOnboardingProgressSchema = createSelectSchema(onboardingProgressTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type UpdateOnboardingProgress = z.infer<typeof updateOnboardingProgressSchema>;
export type OnboardingProgress = typeof onboardingProgressTable.$inferSelect;
