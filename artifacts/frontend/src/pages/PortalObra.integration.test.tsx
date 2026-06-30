/**
 * Integration tests for PortalObra — mount the full component, mock fetch,
 * and assert that the tab preference set with one token still applies when
 * the client opens a regenerated link (different token, same obra ID).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PortalObra from "./PortalObra";
import { obraStorageKey, tokenStorageKey } from "../lib/portalTabStorage";

const OBRA_ID = "obra-integration-001";

const BASE_RESPONSE = {
  obra: {
    id: OBRA_ID,
    nome: "Residência Teste",
    status: "em_andamento",
    descricao: null,
    clienteNome: null,
    endereco: null,
    dataInicio: null,
    dataFimPrevista: null,
    dataFimReal: null,
    orcamentoTotal: null,
    custoRealizado: null,
  },
  tenant: { id: "tenant-1", name: "Construtora Teste" },
  orcamento: null,
  etapas: [],
  diario: [],
  ocorrencias: [],
};

function mockFetchOk(response = BASE_RESPONSE) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    }),
  );
}

function renderPortalWithToken(token: string) {
  const { hook } = memoryLocation({
    path: `/portal/obra/${token}`,
    record: true,
  });
  return render(
    <Router hook={hook}>
      <PortalObra />
    </Router>,
  );
}

async function waitForLoaded() {
  await waitFor(
    () => expect(screen.queryByText("Carregando portal…")).not.toBeInTheDocument(),
    { timeout: 3000 },
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("PortalObra — tab preference survives link regeneration", () => {
  it("lands on Diário when a new token is opened for an obra whose tab was previously saved", async () => {
    // Simulate: client visited earlier (via any token) → obra key already holds "diario"
    localStorage.setItem(obraStorageKey(OBRA_ID), "diario");

    mockFetchOk();

    // Open with a brand-new token (architect regenerated the link)
    renderPortalWithToken("token-b-new");

    await waitForLoaded();

    // The <select> in the tab bar reflects the activeTab state
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("diario");
  });

  it("defaults to Dados when no preference was ever saved for the obra", async () => {
    mockFetchOk();

    renderPortalWithToken("token-fresh");

    await waitForLoaded();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("dados");
  });
});

describe("PortalObra — token-keyed entry is cleaned up after migration", () => {
  it("removes the legacy token key after the fetch resolves and migrates the value to the obra key", async () => {
    const TOKEN = "token-legacy-cleanup";

    // Simulate: token-keyed entry from before the obra ID was known
    localStorage.setItem(tokenStorageKey(TOKEN), "cronograma");

    mockFetchOk();

    renderPortalWithToken(TOKEN);

    await waitForLoaded();

    // Token key must be gone
    expect(localStorage.getItem(tokenStorageKey(TOKEN))).toBeNull();

    // Value must have been promoted to the stable obra key
    expect(localStorage.getItem(obraStorageKey(OBRA_ID))).toBe("cronograma");
  });

  it("removes the token key even when the obra key already had a value (obra key wins)", async () => {
    const TOKEN = "token-conflict";

    // Both keys exist — obra key should win and token key must be removed
    localStorage.setItem(obraStorageKey(OBRA_ID), "orcamento");
    localStorage.setItem(tokenStorageKey(TOKEN), "diario");

    mockFetchOk();

    renderPortalWithToken(TOKEN);

    await waitForLoaded();

    // Obra key wins — the select should show "orcamento"
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("orcamento");

    // Token key removed regardless
    expect(localStorage.getItem(tokenStorageKey(TOKEN))).toBeNull();
  });
});
