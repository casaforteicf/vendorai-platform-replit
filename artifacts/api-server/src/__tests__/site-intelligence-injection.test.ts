import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { publicSiteGeneratorRouter } from "../routes/site_generator.js";

const DOC = "<!DOCTYPE html><html><body>ok</body></html>";

function testApp() {
  const app = express();
  app.use(publicSiteGeneratorRouter);
  app.get("/json-with-html", (_req, res) => res.json({ html: DOC }));
  app.get("/html-explicit", (_req, res) => res.type("html").send(DOC));
  app.get("/html-implicit", (_req, res) => res.send(DOC));
  return app;
}

describe("site intelligence injection", () => {
  it("não injeta script em resposta JSON que contém HTML", async () => {
    const response = await request(testApp()).get("/json-with-html");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ html: DOC });
    expect(response.text).not.toContain("vendorai-site-intelligence");
  });

  it("injeta o script em resposta HTML explícita", async () => {
    const response = await request(testApp()).get("/html-explicit");
    expect(response.status).toBe(200);
    expect(response.text).toContain("vendorai-site-intelligence");
    expect(response.text).toContain(DOC.split("</body>")[0]);
  });

  it("injeta o script em HTML enviado sem Content-Type explícito", async () => {
    const response = await request(testApp()).get("/html-implicit");
    expect(response.status).toBe(200);
    expect(response.text).toContain("vendorai-site-intelligence");
  });
});
