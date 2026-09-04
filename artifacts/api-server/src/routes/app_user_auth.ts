import { randomInt, randomUUID } from "crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appInstanceVersionsTable,
  appInstancesTable,
  appUserAuthChallengesTable,
  appUserMembershipsTable,
  appUsersTable,
  db,
} from "@workspace/db";
import {
  challengeHashMatches,
  hashAppUserChallenge,
  signAppUserToken,
  verifyAppUserToken,
  type AppUserJwtPayload,
} from "../lib/app_user_jwt.js";
import { sendAppUserLoginCodeEmail } from "../lib/app_user_email.js";

const router: IRouter = Router();
const CODE_EXPIRES_MINUTES = 10;
const CODE_EXPIRES_MS = CODE_EXPIRES_MINUTES * 60_000;
const REQUEST_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

const requestSchema = z.object({ email: z.string().trim().email().max(320) });
const verifySchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/),
});

type JsonObject = Record<string, unknown>;
type RuntimeAuthContext = {
  appId: string;
  tenantId: string;
  appName: string;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function authEnabled(definition: unknown): boolean {
  const snapshot = asObject(definition);
  const settings = asObject(snapshot.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const auth = asObject(runtimeAccess.auth);
  return auth.enabled === true && stringArray(auth.methods).includes("email_code");
}

async function runtimeAuthContext(appInstanceId: string): Promise<RuntimeAuthContext | null> {
  const [app] = await db
    .select({
      id: appInstancesTable.id,
      tenantId: appInstancesTable.tenantId,
      name: appInstancesTable.name,
    })
    .from(appInstancesTable)
    .where(and(eq(appInstancesTable.id, appInstanceId), eq(appInstancesTable.status, "published")))
    .limit(1);
  if (!app) return null;

  const [snapshot] = await db
    .select({ definition: appInstanceVersionsTable.definition })
    .from(appInstanceVersionsTable)
    .where(
      and(
        eq(appInstanceVersionsTable.tenantId, app.tenantId),
        eq(appInstanceVersionsTable.appInstanceId, app.id),
        eq(appInstanceVersionsTable.status, "published"),
      ),
    )
    .orderBy(desc(appInstanceVersionsTable.publishedAt), desc(appInstanceVersionsTable.version))
    .limit(1);
  if (!snapshot || !authEnabled(snapshot.definition)) return null;

  const definition = asObject(snapshot.definition);
  const publishedName = typeof definition.name === "string" ? definition.name.trim() : "";
  return {
    appId: app.id,
    tenantId: app.tenantId,
    appName: publishedName || app.name || "Aplicativo",
  };
}

async function findEligibleUser(context: RuntimeAuthContext, normalizedEmail: string) {
  const [row] = await db
    .select({
      appUserId: appUsersTable.id,
      displayName: appUsersTable.displayName,
      email: appUsersTable.email,
      userStatus: appUsersTable.status,
      membershipId: appUserMembershipsTable.id,
      membershipStatus: appUserMembershipsTable.status,
      roleKey: appUserMembershipsTable.roleKey,
      permissions: appUserMembershipsTable.permissions,
    })
    .from(appUserMembershipsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, appUserMembershipsTable.appUserId))
    .where(
      and(
        eq(appUserMembershipsTable.tenantId, context.tenantId),
        eq(appUserMembershipsTable.appInstanceId, context.appId),
        eq(appUsersTable.tenantId, context.tenantId),
        eq(appUsersTable.email, normalizedEmail),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.userStatus === "blocked" || row.userStatus === "archived") return null;
  if (row.membershipStatus === "suspended" || row.membershipStatus === "archived") return null;
  return row;
}

router.post("/app-runtime/apps/:appId/auth/request-code", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "INVALID_REQUEST" });

  // Resposta genérica para não permitir enumeração de contas ou apps privados.
  const accepted = { accepted: true };
  const context = await runtimeAuthContext(String(req.params.appId));
  if (!context) return res.status(202).json(accepted);

  const email = parsed.data.email.toLowerCase();
  const appUser = await findEligibleUser(context, email);
  if (!appUser?.email) return res.status(202).json(accepted);

  const [recent] = await db
    .select({ requestedAt: appUserAuthChallengesTable.requestedAt })
    .from(appUserAuthChallengesTable)
    .where(
      and(
        eq(appUserAuthChallengesTable.tenantId, context.tenantId),
        eq(appUserAuthChallengesTable.appInstanceId, context.appId),
        eq(appUserAuthChallengesTable.appUserId, appUser.appUserId),
        isNull(appUserAuthChallengesTable.consumedAt),
      ),
    )
    .orderBy(desc(appUserAuthChallengesTable.requestedAt))
    .limit(1);

  if (recent && Date.now() - recent.requestedAt.getTime() < REQUEST_COOLDOWN_MS) {
    return res.status(202).json(accepted);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challengeId = randomUUID();
  const tokenHash = hashAppUserChallenge({
    challengeId,
    appInstanceId: context.appId,
    appUserId: appUser.appUserId,
    code,
  });

  await db.insert(appUserAuthChallengesTable).values({
    id: challengeId,
    tenantId: context.tenantId,
    appInstanceId: context.appId,
    appUserId: appUser.appUserId,
    channel: "email",
    purpose: "login",
    tokenHash,
    expiresAt: new Date(Date.now() + CODE_EXPIRES_MS),
  });

  await sendAppUserLoginCodeEmail({
    to: appUser.email,
    code,
    appName: context.appName,
    expiresMinutes: CODE_EXPIRES_MINUTES,
  });

  return res.status(202).json(accepted);
});

router.post("/app-runtime/apps/:appId/auth/verify-code", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "INVALID_REQUEST" });

  const context = await runtimeAuthContext(String(req.params.appId));
  if (!context) return res.status(401).json({ error: "INVALID_CODE" });

  const email = parsed.data.email.toLowerCase();
  const appUser = await findEligibleUser(context, email);
  if (!appUser) return res.status(401).json({ error: "INVALID_CODE" });

  const now = new Date();
  const [challenge] = await db
    .select()
    .from(appUserAuthChallengesTable)
    .where(
      and(
        eq(appUserAuthChallengesTable.tenantId, context.tenantId),
        eq(appUserAuthChallengesTable.appInstanceId, context.appId),
        eq(appUserAuthChallengesTable.appUserId, appUser.appUserId),
        isNull(appUserAuthChallengesTable.consumedAt),
        gt(appUserAuthChallengesTable.expiresAt, now),
      ),
    )
    .orderBy(desc(appUserAuthChallengesTable.requestedAt))
    .limit(1);

  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
    return res.status(401).json({ error: "INVALID_CODE" });
  }

  const candidateHash = hashAppUserChallenge({
    challengeId: challenge.id,
    appInstanceId: context.appId,
    appUserId: appUser.appUserId,
    code: parsed.data.code,
  });

  if (!challengeHashMatches(challenge.tokenHash, candidateHash)) {
    await db
      .update(appUserAuthChallengesTable)
      .set({ attempts: Math.min(challenge.attempts + 1, 20) })
      .where(eq(appUserAuthChallengesTable.id, challenge.id));
    return res.status(401).json({ error: "INVALID_CODE" });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(appUserAuthChallengesTable)
      .set({ consumedAt: now })
      .where(
        and(
          eq(appUserAuthChallengesTable.id, challenge.id),
          isNull(appUserAuthChallengesTable.consumedAt),
        ),
      );

    await tx
      .update(appUsersTable)
      .set({
        status: appUser.userStatus === "invited" ? "active" : appUser.userStatus,
        emailVerifiedAt: now,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(appUsersTable.id, appUser.appUserId), eq(appUsersTable.tenantId, context.tenantId)),
      );

    if (appUser.membershipStatus === "invited") {
      await tx
        .update(appUserMembershipsTable)
        .set({ status: "active", updatedAt: now })
        .where(
          and(
            eq(appUserMembershipsTable.id, appUser.membershipId),
            eq(appUserMembershipsTable.tenantId, context.tenantId),
            eq(appUserMembershipsTable.appInstanceId, context.appId),
          ),
        );
    }
  });

  const token = signAppUserToken({
    sub: appUser.appUserId,
    type: "app_user",
    tenantId: context.tenantId,
    appInstanceId: context.appId,
    membershipId: appUser.membershipId,
    roleKey: appUser.roleKey,
    permissions: appUser.permissions ?? [],
  });

  return res.json({
    token,
    user: {
      id: appUser.appUserId,
      displayName: appUser.displayName,
      email: appUser.email,
    },
    membership: {
      id: appUser.membershipId,
      roleKey: appUser.roleKey,
      permissions: appUser.permissions ?? [],
      status: appUser.membershipStatus === "invited" ? "active" : appUser.membershipStatus,
    },
  });
});

interface AppUserRequest extends Express.Request {
  appUser?: AppUserJwtPayload;
}

const authenticateAppUser: RequestHandler = (req: AppUserRequest, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
  try {
    req.appUser = verifyAppUserToken(authHeader.slice(7), String(req.params.appId));
    next();
  } catch {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }
};

router.get(
  "/app-runtime/apps/:appId/session",
  authenticateAppUser,
  async (req: AppUserRequest, res) => {
    const identity = req.appUser!;
    const context = await runtimeAuthContext(String(req.params.appId));
    if (!context || context.tenantId !== identity.tenantId) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const [current] = await db
      .select({
        id: appUsersTable.id,
        displayName: appUsersTable.displayName,
        email: appUsersTable.email,
        phone: appUsersTable.phone,
        locale: appUsersTable.locale,
        userStatus: appUsersTable.status,
        membershipId: appUserMembershipsTable.id,
        membershipStatus: appUserMembershipsTable.status,
        roleKey: appUserMembershipsTable.roleKey,
        permissions: appUserMembershipsTable.permissions,
      })
      .from(appUserMembershipsTable)
      .innerJoin(appUsersTable, eq(appUsersTable.id, appUserMembershipsTable.appUserId))
      .where(
        and(
          eq(appUsersTable.id, identity.sub),
          eq(appUsersTable.tenantId, context.tenantId),
          eq(appUserMembershipsTable.id, identity.membershipId),
          eq(appUserMembershipsTable.tenantId, context.tenantId),
          eq(appUserMembershipsTable.appInstanceId, context.appId),
        ),
      )
      .limit(1);

    if (
      !current ||
      current.userStatus !== "active" ||
      current.membershipStatus !== "active"
    ) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    return res.json({
      user: {
        id: current.id,
        displayName: current.displayName,
        email: current.email,
        phone: current.phone,
        locale: current.locale,
      },
      membership: {
        id: current.membershipId,
        roleKey: current.roleKey,
        permissions: current.permissions ?? [],
      },
    });
  },
);

export default router;
