import type { ArqdorProject } from "../types/arqdor.types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("authToken") || localStorage.getItem("token");

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Erro ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const archProjectService = {
  listProjects() {
    return api<ArqdorProject[]>("/api/arch/projetos");
  },

  getProject(id: string) {
    return api<ArqdorProject>(`/api/arch/projetos/${id}`);
  },

  updateProject(id: string, payload: Partial<ArqdorProject>) {
    return api<ArqdorProject>(`/api/arch/projetos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
