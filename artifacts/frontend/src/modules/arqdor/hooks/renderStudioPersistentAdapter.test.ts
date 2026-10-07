} from "./renderStudioPersistentAdapter";
import type { PersistentRenderVersion } from "./usePersistentRenderHistory";

function version(overrides: Partial<PersistentRenderVersion> = {}): PersistentRenderVersion {
  return {
    id: "render-1",
    projectId: "project-1",
    conceptProjectId: null,
    parentRenderId: null,
    ambiente: "sala",
    mode: "preservar",
    status: "concluido",
    versionTag: null,
    operationType: "initial",
    materialId: null,
    materialName: null,
    selectionMetadata: [],
    approvalNote: null,
    originalImageUrl: "/objects/source.jpg",
    resultImageUrl: "/objects/result.jpg",
    displayUrl: "/api/storage/objects/result.jpg",
    fileAvailable: true,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date("2026-10-06T10:00:00Z"),
    costEstimateUsd: null,
    versionNumber: 1,
    ...overrides,
  };
}

describe("renderStudioPersistentAdapter", () => {
  it("mantém a árvore, escolhe a versão mais recente e preserva a aprovação persistida", () => {
    const state = buildRenderStudioPersistentState([
      version(),
      version({
        id: "render-2",
        parentRenderId: "render-1",
        operationType: "material",
        materialId: "mat-1",
        materialName: "Travertino",
        versionNumber: 2,
        createdAt: new Date("2026-10-06T10:05:00Z"),
      }),
      version({
        id: "render-3",
        parentRenderId: "render-2",
        operationType: "improve",
        approvedBy: "user-1",
        approvedAt: new Date("2026-10-06T10:10:00Z"),
        approvalNote: "Aprovado",
        versionNumber: 3,
        createdAt: new Date("2026-10-06T10:10:00Z"),
      }),
    ]);

    expect(state.latestRenderId).toBe("render-3");
    expect(state.approvedVersionId).toBe("render-3");
    expect(state.versions.map((item) => item.id)).toEqual(["render-3", "render-2", "render-1"]);
    expect(state.versions[0]?.parentVersionId).toBe("render-2");
    expect(state.versions[0]?.approvalNote).toBe("Aprovado");
    expect(state.versions[1]?.materialName).toBe("Travertino");
  });

  it("não deixa cache de recovery substituir histórico persistido do backend", () => {
    const persistent = buildRenderStudioPersistentState([
      version({ id: "backend-render" }),
    ]);

    const merged = mergeRecoveryCache(
      persistent,
      [{
        id: "cached-render",
        url: "data:image/png;base64,cache",
        label: "Cache antigo",
        operationType: "initial",
      }],
      "data:image/png;base64,source",
    );

    expect(merged.latestRenderId).toBe("backend-render");
    expect(merged.versions).toHaveLength(1);
    expect(merged.versions[0]?.id).toBe("backend-render");
  });

  it("usa cache somente quando o backend não possui histórico", () => {
    const empty = buildRenderStudioPersistentState([]);
    const merged = mergeRecoveryCache(empty, [{
      id: "cached-render",
      url: "data:image/png;base64,cache",
      label: "Recuperada",
      parentVersionId: "render-parent",
      operationType: "improve",
    }]);

    expect(merged.latestRenderId).toBe("cached-render");
    expect(merged.versions[0]?.parentVersionId).toBe("render-parent");
  });
});
import { describe, expect, it } from "vitest";
import {
  buildRenderStudioPersistentState,
  mergeRecoveryCache,
} from "./renderStudioPersistentAdapter";
import type { PersistentRenderVersion } from "./usePersistentRenderHistory";

function version(overrides: Partial<PersistentRenderVersion> = {}): PersistentRenderVersion {
  return {
    id: "render-1",
    projectId: "project-1",
    conceptProjectId: null,
    parentRenderId: null,
    ambiente: "sala",
    mode: "preservar",
    status: "concluido",
    versionTag: null,
    operationType: "initial",
    materialId: null,
    materialName: null,
    selectionMetadata: [],
    approvalNote: null,
    originalImageUrl: "/objects/source.jpg",
    resultImageUrl: "/objects/result.jpg",
    displayUrl: "/api/storage/objects/result.jpg",
    fileAvailable: true,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date("2026-10-06T10:00:00Z"),
    costEstimateUsd: null,
    versionNumber: 1,
    ...overrides,
  };
}

describe("renderStudioPersistentAdapter", () => {
  it("mantém a árvore, escolhe a versão mais recente e preserva a aprovação persistida", () => {
    const state = buildRenderStudioPersistentState([
      version(),
      version({
        id: "render-2",
        parentRenderId: "render-1",
        operationType: "material",
        materialId: "mat-1",
        materialName: "Travertino",
        versionNumber: 2,
        createdAt: new Date("2026-10-06T10:05:00Z"),
      }),
      version({
        id: "render-3",
        parentRenderId: "render-2",
        operationType: "improve",
        approvedBy: "user-1",
        approvedAt: new Date("2026-10-06T10:10:00Z"),
        approvalNote: "Aprovado",
        versionNumber: 3,
        createdAt: new Date("2026-10-06T10:10:00Z"),
      }),
    ]);

    expect(state.latestRenderId).toBe("render-3");
    expect(state.approvedVersionId).toBe("render-3");
    expect(state.versions.map((item) => item.id)).toEqual(["render-3", "render-2", "render-1"]);
    expect(state.versions[0]?.parentVersionId).toBe("render-2");
    expect(state.versions[0]?.approvalNote).toBe("Aprovado");
    expect(state.versions[1]?.materialName).toBe("Travertino");
  });

  it("não deixa cache de recovery substituir histórico persistido do backend", () => {
    const persistent = buildRenderStudioPersistentState([
      version({ id: "backend-render" }),
    ]);

    const merged = mergeRecoveryCache(
      persistent,
      [{
        id: "cached-render",
        url: "data:image/png;base64,cache",
        label: "Cache antigo",
        operationType: "initial",
      }],
      "data:image/png;base64,source",
    );

    expect(merged.latestRenderId).toBe("backend-render");
    expect(merged.versions).toHaveLength(1);
    expect(merged.versions[0]?.id).toBe("backend-render");
  });

  it("usa cache somente quando o backend não possui histórico", () => {
    const empty = buildRenderStudioPersistentState([]);

    const merged = mergeRecoveryCache(empty, [{
      id: "cached-render",
      url: "data:image/png;base64,cache",
      label: "Recuperada",
      parentVersionId: "render-parent",
      operationType: "improve",
    }]);

    expect(merged.latestRenderId).toBe("cached-render");
    expect(merged.versions[0]?.parentVersionId).toBe("render-parent");
  });
});
