import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { socialIntegrationsCallbackRouter } from "../routes/social-integrations.js";

describe("social callback router isolation", () => {
  it("does not intercept the session endpoint", async () => {
    const app = express();
    app.use(socialIntegrationsCallbackRouter);
    app.get("/auth/me", (_req, res) => res.status(204).end());
    await request(app).get("/auth/me").expect(204);
  });
});
