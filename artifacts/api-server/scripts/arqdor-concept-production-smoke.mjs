const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080/api";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

function assertOk(label, result, expected) {
  const status = result.response.status;
  const valid = expected ? expected.includes(status) : result.response.ok;
  if (!valid) {
    throw new Error(`${label} falhou: HTTP ${status} ${JSON.stringify(result.body)}`);
  }
}

async function main() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const health = await request("/auth/healthz");
      if (health.response.ok) break;
    } catch {}
    if (i === 29) throw new Error("API local não ficou saudável.");
    await sleep(1000);
  }

  const login = await request("/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo", password: "demo" }),
  });
  assertOk("demo-login", login);
  const token = login.body?.token;
  const tenantId = login.body?.tenant?.id;
  const userId = login.body?.user?.id;
  if (!token || !tenantId || !userId) throw new Error("Login demo não retornou token/tenant/user.");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const stamp = Date.now();
  const title = `Smoke Concept 2026-09-19 ${stamp}`;
  const payload = {
    title,
    status: "draft",
    currentStep: 5,
    lot: { width: 12, depth: 25 },
    configuration: {
      floors: 1,
      desiredArea: 80,
      typology: "terrea_2q",
      layoutPreferences: {},
      customWalls: [],
      customOpenings: [],
      spaceProfiles: [],
      objects: [],
    },
    rooms: [
      { id: "sala-smoke", kind: "sala", label: "Sala", width: 4, depth: 5, floor: 0, x: 1, y: 1 },
    ],
    openingOverrides: {},
    customerProfile: {
      name: "Smoke Test Arqdor",
      email: `smoke-arqdor-${stamp}@example.com`,
      notes: "Teste automatizado de fechamento do Concept",
    },
    facadePreferences: {
      style: "contemporaneo",
      roof: "platibanda",
      primaryMaterial: "pintura",
      accentMaterial: "madeira",
      facadeTone: "claro",
      frameTone: "preto",
      landscaping: "medio",
    },
    conceptRender: {},
    selectedVariant: 0,
  };

  const created = await request("/arch/concept-projects", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assertOk("salvar pré-projeto", created, [201]);
  const conceptId = created.body?.id;
  if (!conceptId) throw new Error("Pré-projeto criado sem id.");
  if (created.body?.tenantId !== tenantId) {
    throw new Error(`Tenant incorreto no save: esperado ${tenantId}, recebido ${created.body?.tenantId}`);
  }

  const latest = await request("/arch/concept-projects/latest", { headers });
  assertOk("reabrir latest", latest);
  if (latest.body?.id !== conceptId || latest.body?.tenantId !== tenantId) {
    throw new Error("Latest não retornou o Concept/tenant recém-salvo.");
  }

  const reopened = await request(`/arch/concept-projects/${conceptId}`, { headers });
  assertOk("reabrir por id", reopened);
  if (reopened.body?.title !== title) throw new Error("Conteúdo reaberto diverge do salvo.");

  const renderStart = await request("/arch/ai-render", {
    method: "POST",
    headers,
    body: JSON.stringify({
      project_id: conceptId,
      original_image_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFmElEQVR42u3VMQEAAAjDMMC/5+GBl0RCn3aSAuCfkQDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADADAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAMAAJAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADADAAAAwAAAMAwAAAMAAADAAAAwDAAAAwAAAMAAADAMAAADAAAAwAAAMAwAAAMAAADACAmwV5YQb9zoMVAwAAAABJRU5ErkJggg==",
      mode: "preservar",
      ambiente: "fachada",
      user_notes: "Smoke test Arqdor Concept. Fachada residencial contemporânea brasileira.",
    }),
  });
  assertOk("iniciar render", renderStart);
  const renderId = renderStart.body?.render_id;
  if (!renderId) throw new Error("Render iniciado sem render_id.");

  let renderFinal = null;
  for (let i = 0; i < 90; i += 1) {
    await sleep(2000);
    const poll = await request(`/arch/ai-render/${renderId}`, { headers });
    assertOk("acompanhar render", poll);
    if (poll.body?.status === "concluido") {
      renderFinal = poll.body;
      break;
    }
    if (poll.body?.status === "erro") {
      throw new Error(`Render falhou: ${poll.body?.erro_msg || "erro sem mensagem"}`);
    }
  }
  if (!renderFinal?.result_image_url) throw new Error("Render não concluiu com imagem dentro da janela do smoke.");

  const patch = await request(`/arch/concept-projects/${conceptId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      conceptRender: {
        renderId,
        status: "completed",
        resultImageUrl: renderFinal.result_image_url,
        generatedAt: new Date().toISOString(),
      },
      currentStep: 5,
    }),
  });
  assertOk("persistir render no Concept", patch);

  const promote = await request(`/arch/concept-projects/${conceptId}/promote`, {
    method: "POST",
    headers,
    body: "{}",
  });
  assertOk("enviar ao profissional", promote);
  const projectId = promote.body?.project?.id;
  if (!projectId) throw new Error("Promoção não retornou project.id.");
  if (promote.body?.project?.tenantId !== tenantId) {
    throw new Error("Projeto Arqdor foi criado em tenant diferente do Concept.");
  }

  const project = await request(`/arch/projetos/${projectId}`, { headers });
  assertOk("abrir Projeto Arqdor", project);
  if (project.body?.projeto?.id !== projectId || project.body?.projeto?.tenantId !== tenantId) {
    throw new Error("Projeto Arqdor reaberto não corresponde ao projeto/tenant promovido.");
  }

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    userId,
    conceptId,
    renderId,
    renderStatus: renderFinal.status,
    projectId,
    leadId: promote.body?.leadId ?? null,
    dealId: promote.body?.dealId ?? null,
  }));
}

main().catch((error) => {
  console.error("ARQDOR_CONCEPT_SMOKE_FAILED", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
