import { z } from "zod";
export const vendiStudioCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["web_app","mobile_app","website","book","ebook","course","agent","design","media","other"]).default("web_app"),
  brief: z.string().max(20000).optional(),
}).strict();
