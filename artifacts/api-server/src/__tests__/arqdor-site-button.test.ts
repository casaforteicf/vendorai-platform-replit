import { describe, expect, it, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("@workspace/db", () => ({ db: {}, pool: { query }, leadsTable: {} }));
vi.mock("../lib/jwt.js", () => ({ signGuestConceptToken: vi.fn() }));
vi.mock("../lib/dedup.js", () => ({ findLeadByDedup: vi.fn(), storePhone: vi.fn() }));
vi.mock("../lib/round-robin.js", () => ({ pickNextVendedor: vi.fn() }));

const { injectArqdorSiteButton } = await import("../routes/arqdor_public_link");
const html = "<html><body><h1>Casa</h1></body></html>";

describe("botão 'Projete sua casa' no site do tenant", () => {
  beforeEach(() => query.mockReset());

  it("é opcional: sem a opção ligada, o site fica intacto", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await injectArqdorSiteButton(html, "t1")).toBe(html);
  });

  it("com a opção ligada, entra antes do </body> com texto, cor e link do tenant", async () => {
    query.mockResolvedValue({ rows: [{ slug: "casaforte", site_button_label: "Monte seu projeto", site_button_color: "#0f766e" }] });
    const out = await injectArqdorSiteButton(html, "t1");
    expect(out).toContain('/projeto/casaforte"');
    expect(out).toContain("Monte seu projeto");
    expect(out).toContain("background:#0f766e");
    expect(out.indexOf("data-arqdor-site-button")).toBeLessThan(out.indexOf("</body>"));
  });

  it("escapa o texto e ignora cor inválida", async () => {
    query.mockResolvedValue({ rows: [{ slug: "x", site_button_label: "<script>alert(1)</script>", site_button_color: "red;position:absolute" }] });
    const out = await injectArqdorSiteButton(html, "t1");
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("background:#f97316");
  });

  it("falha no banco não derruba o site", async () => {
    query.mockResolvedValue({ rows: [] });
    query.mockImplementationOnce(async () => { throw new Error("db off"); });
    expect(await injectArqdorSiteButton(html, "t1")).toBe(html);
  });
});
