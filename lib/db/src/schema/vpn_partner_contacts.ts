// ─── Vendor Partner Network — Contacts / Representatives ─────────────────────

import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vpnPartnersTable } from "./vpn_partners";

export const vpnPartnerContactsTable = pgTable("vpn_partner_contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  partnerId: text("partner_id")
    .notNull()
    .references(() => vpnPartnersTable.id, { onDelete: "cascade" }),

  name:     text("name").notNull(),
  role:     text("role"),          // Representante, Gerente, Atendimento, etc.
  phone:    text("phone"),
  email:    text("email"),
  region:   text("region"),        // State or city
  whatsapp: text("whatsapp"),
  active:   boolean("active").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_vpn_contacts_partner").on(t.partnerId),
]);

export const insertVpnPartnerContactSchema = createInsertSchema(vpnPartnerContactsTable, {
  name: z.string().min(1).max(255),
});

export const selectVpnPartnerContactSchema = createSelectSchema(vpnPartnerContactsTable);

export type VpnPartnerContact       = typeof vpnPartnerContactsTable.$inferSelect;
export type InsertVpnPartnerContact = typeof vpnPartnerContactsTable.$inferInsert;
