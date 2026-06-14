import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  tenantsTable,
  businessProfilesTable,
} from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();

const productSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  preco: z.number().nonnegative().optional(),
});

const onboardingCompleteSchema = z.object({
  nomeFantasia: z.string().min(1),
  vertical: z.string().min(1),
  logoUrl: z.string().optional(),
  produtos: z.array(productSchema).optional(),
  diferenciais: z.string().optional(),
  publicoAlvo: z.string().optional(),
  concorrentes: z.array(z.string()).optional(),
  canaisVenda: z.array(z.string()).optional(),
});

router.post(
  "/tenants/:tenantId/onboarding/complete",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);

    const parsed = onboardingCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const now = new Date();

    const profileUpdate = {
      nomeFantasia: data.nomeFantasia,
      vertical: data.vertical,
      logoUrl: data.logoUrl ?? null,
      produtos: data.produtos ?? null,
      diferenciais: data.diferenciais ?? null,
      publicoAlvo: data.publicoAlvo ?? null,
      concorrentes: data.concorrentes ?? null,
      canaisVenda: data.canaisVenda ?? null,
      discoveryCompletedAt: now,
      discoveryData: {
        nomeFantasia: data.nomeFantasia,
        vertical: data.vertical,
        diferenciais: data.diferenciais,
        publicoAlvo: data.publicoAlvo,
        concorrentes: data.concorrentes,
        canaisVenda: data.canaisVenda,
      },
      updatedAt: now,
    };

    const [existing] = await db
      .select({ id: businessProfilesTable.id })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId));

    if (existing) {
      await db
        .update(businessProfilesTable)
        .set(profileUpdate)
        .where(eq(businessProfilesTable.tenantId, tenantId));
    } else {
      await db.insert(businessProfilesTable).values({
        tenantId,
        razaoSocial: data.nomeFantasia,
        ...profileUpdate,
      });
    }

    const [tenant] = await db
      .update(tenantsTable)
      .set({ setupCompletedAt: now, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId))
      .returning({ setupCompletedAt: tenantsTable.setupCompletedAt });

    req.log.info({ tenantId }, "Onboarding completed");

    res.json({ setupCompletedAt: tenant.setupCompletedAt!.toISOString() });
  }
);

export default router;
