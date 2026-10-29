import { Router, type Request, type Response, type IRouter } from "express";
import { z } from "zod/v4";
import { consumeVerifiedCustomerLink, type LinkPool } from "../lib/customer-global-link-service.js";

/**
 * Opt-in router: deliberately NOT registered in routes/index.ts.
 * An authorized caller supplies a dual-session verifier, NEVER trust ids from
 * the request body as authentication/authorization evidence.
 */
export type VerifiedLinkActor = {
  globalIdentityId: string;
  legacyPortalUserId: string;
  tenantId: string;
  globalSessionVerified: true;
  legacySessionVerified: true;
};
export type VerifiedLinkResolver = (req: Request) => Promise<VerifiedLinkActor | null>;
const schema = z.object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export function createCustomerGlobalLinkRouter(deps: {
  resolveVerifiedActor: VerifiedLinkResolver;
  privilegedPool: LinkPool;
  enabled: () => boolean;
}): IRouter {
  const router: IRouter = Router();
  router.post("/customer-global/link/confirm", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!deps.enabled()) {
      res.status(404).json({ error: "Recurso indisponível" });
      return;
    }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Solicitação inválida" });
      return;
    }
    try {
      const actor = await deps.resolveVerifiedActor(req);
      if (!actor || actor.globalSessionVerified !== true || actor.legacySessionVerified !== true) {
        res.status(401).json({ error: "Autenticação adicional necessária" });
        return;
      }
      const result = await consumeVerifiedCustomerLink(deps.privilegedPool, {
        globalIdentityId: actor.globalIdentityId,
        tenantId: actor.tenantId,
        legacyPortalUserId: actor.legacyPortalUserId,
        challengeToken: parsed.data.challengeToken,
      });
      if (result !== "linked") {
        // Do not distinguish collision from absent/expired challenge to clients.
        res.status(409).json({ error: "Vinculação não concluída" });
        return;
      }
      res.status(200).json({ status: "linked" });
    } catch {
      // Never include SQL errors, identifiers or credentials in responses.
      res.status(500).json({ error: "Não foi possível concluir a solicitação" });
    }
  });
  return router;
}
