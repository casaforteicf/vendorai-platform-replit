import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const UPLOAD_PURPOSES = ["style_reference", "post_material"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const contentStudioUploadsTable = pgTable("content_studio_uploads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  fileUrl: text("file_url").notNull(),
  purpose: text("purpose").notNull().default("style_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContentStudioUpload = typeof contentStudioUploadsTable.$inferSelect;
